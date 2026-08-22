/**
 * syncDistrictLocation — STEP 3 production District sync for ONE location.
 *
 * Scales the verified single-cinema pipeline (Steps 1–2) to every cinema of a
 * city WITHOUT redesigning anything — it reuses, unchanged:
 *
 *   sync-worker/src/district-shows.ts  — the verified per-cinema reader
 *     (getDistrictCinemaShows: __NEXT_DATA__ → arrangedSessions[] → shows).
 *     Never re-parsed here; District's wall-clock showTime stays verbatim.
 *   sync-worker/src/district.ts        — the verified city-directory search
 *     (extractCinemaLinks + matchKnownVenueToCandidates: token superset with
 *     generic tokens stripped, then containment ranking) and the acceptance
 *     rules (page cityId must equal the directory city id; page pin within
 *     PROXIMITY_LIMIT_M of our pin). Wrong-neighbourhood matches measure
 *     14 km+ — they must never attach.
 *   scripts/district-save-test.mts SQL — the verified D1 upserts (movies by
 *     district-{movieId}, shows by district-{sessionId}, cinema stamp),
 *     parameterized here instead of interpolated.
 *
 * Safety invariants (Step 3 brief):
 *   - NEVER creates cinemas. Only existing rows are stamped. An uncertain
 *     match is logged as unmatched — never guessed.
 *   - A stored district_cinema_id is revalidated every run. When the page it
 *     renders is provably a DIFFERENT cinema (cityId/proximity mismatch), the
 *     bad id is NULLed immediately and name matching takes over. A transient
 *     fetch ERROR (HTTP/network) keeps the id and deletes nothing.
 *   - Stale cleanup runs PER CINEMA, only after that cinema returned a
 *     complete dataset for the synced date this run, only for that date
 *     (never another day's rows), and never touches shows referenced by
 *     ad_reports (community history always wins). A failed fetch deletes
 *     nothing at all.
 *   - Idempotent: rows are keyed district-{sid} / district-{movieId} and
 *     upserted — a second run for the same date inserts 0 rows.
 *   - D1 allows max 100 bound parameters per statement → movies chunk 10
 *     rows (10 params each), shows chunk 7 rows (14 params each), IN lists
 *     chunk 90 ids. Do not raise these.
 *
 * Late-night rollover: District serves 0 arrangedSessions for a city once
 * its day ends (~22:00+ IST). When EVERY matched cinema returns 0 sessions
 * during 22:00–06:00 IST and no explicit date was requested, the run
 * refetches tomorrow's date once (clearly flagged in the report). The daily
 * cron (11:30 IST) never hits this path.
 */

import {
  distanceM,
  extractCinemaLinks,
  extractCityId,
  matchKnownVenueToCandidates,
} from './district'
import { getDistrictCinemaShows, istToday, type DistrictCinemaShows } from './district-shows'
import { politeFetch, sleep, type FetchBudget } from './http'
import type { D1Database } from './d1'
import type { KnownVenue } from './provider'

const ORIGIN = 'https://www.district.in'
const BETWEEN_FETCHES_MS = 2000     // same politeness as DistrictProvider
const PROXIMITY_LIMIT_M = 10000     // same acceptance rule as DistrictProvider
const MAX_CANDIDATES_PER_VENUE = 3  // same as DistrictProvider
const MAX_FETCHES_PER_LOCATION = 60
/** D1 caps bound parameters at 100/statement. */
const MOVIE_ROWS_PER_STMT = 10 // 10 columns × 10 rows = 100 params
const SHOW_ROWS_PER_STMT = 7   // 14 columns × 7 rows  = 98 params
const IDS_PER_IN_QUERY = 90

type CinemaLink = ReturnType<typeof extractCinemaLinks>[number]

export interface SyncedCinema {
  ourId: string
  ourName: string
  districtCinemaId: string
  districtName: string
  viaStoredId: boolean
  storedIdReplaced: boolean
  shows: number
  movies: number
}

export interface UnmatchedCinema {
  ourId: string
  ourName: string
  reason: string
}

export interface NulledId {
  ourId: string
  ourName: string
  badId: string
  reason: string
}

export interface DistrictLocationSyncReport {
  location: string
  status: 'ok' | 'skipped'
  note?: string
  date: string
  dateRolledOver: boolean
  directoryCityId: string | null
  directoryCinemas: number
  knownCinemas: number
  matched: SyncedCinema[]
  unmatched: UnmatchedCinema[]
  fetchFailed: UnmatchedCinema[]
  storedIdsNulled: NulledId[]
  moviesUpserted: number
  moviesInserted: number
  moviesUpdated: number
  showsUpserted: number
  showsInserted: number
  showsUpdated: number
  staleDeleted: number
  staleKeptReferenced: number
  locationSyncedAt: number | null
  fetches: number
  durationMs: number
}

interface LocationRow { slug: string, name: string, enabled: number, region_code: string | null }
interface CinemaRow { id: string, name: string, latitude: number | null, longitude: number | null, district_cinema_id: string | null }

/** Deterministic hue per title — same algorithm as d1.ts / district-save-test.mts. */
function hueOf(title: string): number {
  let h = 0
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/** __NEXT_DATA__ of a District page (tiny local twin of district.ts' private parse). */
function nextDataOf(html: string, url: string): unknown {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!m) throw new Error(`no __NEXT_DATA__ script in ${url}`)
  return JSON.parse(m[1])
}

/**
 * Same acceptance rules as DistrictProvider: the page's own cityId must match
 * the directory city id when both are known, and the page pin must be within
 * PROXIMITY_LIMIT_M of our pin when both carry coordinates. A `false` return
 * with page data in hand is POSITIVE evidence of a wrong cinema (never just
 * missing data) — callers may act on it (e.g. null a stored id).
 */
function pageVerifies(
  venue: KnownVenue,
  cinema: DistrictCinemaShows['cinema'],
  directoryCityId: string | undefined,
  label: string,
): boolean {
  if (directoryCityId && cinema.cityId && cinema.cityId !== directoryCityId) {
    console.log(`[district-sync] ${label}: page cityId=${cinema.cityId} ≠ directory cityId=${directoryCityId} — candidate rejected`)
    return false
  }
  if (venue.lat != null && venue.lng != null && cinema.lat != null && cinema.lon != null) {
    const m = distanceM(venue.lat, venue.lng, cinema.lat, cinema.lon)
    if (m > PROXIMITY_LIMIT_M) {
      console.log(`[district-sync] ${label}: ${Math.round(m)} m away from our pin — candidate rejected (limit ${PROXIMITY_LIMIT_M} m)`)
      return false
    }
  }
  return true
}

/** Which of `ids` already exist in `table` (chunked IN queries, ≤90 params). */
async function existingIds(db: D1Database, table: 'movies' | 'shows', ids: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (const part of chunk(ids, IDS_PER_IN_QUERY)) {
    const r = await db.prepare(`SELECT id FROM ${table} WHERE id IN (${part.map(() => '?').join(',')})`)
      .bind(...part).all<{ id: string }>()
    for (const row of r.results ?? []) out.add(row.id)
  }
  return out
}

interface CollectedShow {
  sessionId: string
  cinemaRowId: string
  movieId: string
  showDate: string
  showTime: string
  format?: string
  language?: string
  availability: string
}

interface Fetched {
  venue: KnownVenue
  res: DistrictCinemaShows
  viaStoredId: boolean
  storedIdReplaced: boolean
  /** Fetch for the FINAL report.date succeeded → stamp + cleanup eligible. */
  okForDate: boolean
}

export interface SyncDistrictLocationOpts {
  /** Explicit YYYY-MM-DD (test support). Defaults to today IST; disables rollover. */
  date?: string
}

export async function syncDistrictLocation(
  db: D1Database,
  slug: string,
  opts: SyncDistrictLocationOpts = {},
): Promise<DistrictLocationSyncReport> {
  const t0 = Date.now()
  const runStartedAtSec = Math.floor(t0 / 1000)
  const explicitDate = opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date : undefined
  if (opts.date && !explicitDate) throw new Error(`invalid date override '${opts.date}' — expected YYYY-MM-DD`)
  const report: DistrictLocationSyncReport = {
    location: slug,
    status: 'ok',
    date: explicitDate ?? istToday(),
    dateRolledOver: false,
    directoryCityId: null,
    directoryCinemas: 0,
    knownCinemas: 0,
    matched: [],
    unmatched: [],
    fetchFailed: [],
    storedIdsNulled: [],
    moviesUpserted: 0,
    moviesInserted: 0,
    moviesUpdated: 0,
    showsUpserted: 0,
    showsInserted: 0,
    showsUpdated: 0,
    staleDeleted: 0,
    staleKeptReferenced: 0,
    locationSyncedAt: null,
    fetches: 0,
    durationMs: 0,
  }

  // ---- 0) location config ---------------------------------------------------
  const loc = await db.prepare('SELECT slug, name, enabled, region_code FROM sync_locations WHERE slug = ?')
    .bind(slug).first<LocationRow>()
  if (!loc)
    throw new Error(`sync_locations has no row for '${slug}' — add it (enabled=1) to sync this city`)
  if (!Number(loc.enabled)) {
    report.status = 'skipped'
    report.note = 'disabled in sync_locations'
    report.durationMs = Date.now() - t0
    return report
  }

  // ---- 1) our cinemas — the only rows shows may ever attach to --------------
  const rows = (await db.prepare('SELECT id, name, latitude, longitude, district_cinema_id FROM cinemas WHERE city = ?')
    .bind(slug).all<CinemaRow>()).results ?? []
  const known: KnownVenue[] = rows.map(r => ({
    id: r.id,
    name: r.name,
    lat: r.latitude ?? undefined,
    lng: r.longitude ?? undefined,
    districtCinemaId: r.district_cinema_id ?? undefined,
  }))
  report.knownCinemas = known.length
  if (!known.length) {
    report.status = 'skipped'
    report.note = 'no cinemas in D1 for this city — nothing to attach shows to'
    report.durationMs = Date.now() - t0
    return report
  }

  // ---- 2) city directory (the existing District search mechanism) -----------
  const budget: FetchBudget = { left: MAX_FETCHES_PER_LOCATION }
  const dirUrl = `${ORIGIN}/movies/cinemas-in-${slug}`
  const dir = await politeFetch(dirUrl, budget)
  report.fetches++
  if (dir.skipped) throw new Error(`city directory skipped: ${dir.skipped}`)
  if (dir.blockedReason) throw new Error(`city directory blocked: ${dir.blockedReason}`)
  if (!dir.body) throw new Error(`city directory HTTP ${dir.status} returned no body`)

  const links = extractCinemaLinks(dir.body, slug)
  let directoryCityId: string | undefined
  try {
    directoryCityId = extractCityId(nextDataOf(dir.body, dirUrl))
  }
  catch { /* footer payload is optional — links alone are enough */ }
  report.directoryCityId = directoryCityId ?? null
  report.directoryCinemas = links.length
  if (directoryCityId && loc.region_code && directoryCityId !== loc.region_code)
    console.log(`[district-sync] ${slug}: NOTE city id drift — sync_locations.region_code=${loc.region_code} but District says ${directoryCityId}; trusting District's pages`)
  console.log(`[district-sync] ${slug}: directory ok (cityId=${directoryCityId ?? '?'}, ${links.length} cinema links, ${known.length} known D1 cinemas)`)

  // ---- 3) resolve each known cinema → VERIFIED District cinema --------------
  const accepted = new Map<string, Fetched>() // districtId → fetched

  const fetchOne = async (districtId: string, date: string): Promise<DistrictCinemaShows> => {
    if (budget.left <= 0) throw new Error('fetch budget exhausted for this location run')
    budget.left--
    report.fetches++
    await sleep(BETWEEN_FETCHES_MS)
    return getDistrictCinemaShows(districtId, slug, date) // throws with URL+status on failure
  }

  for (const venue of known) {
    let hit: Fetched | null = null
    let reason = ''
    let failedFetch = false
    const originalStoredId = venue.districtCinemaId // captured before any nulling

    // Path A — stored District cinema id (a previous verified sync), revalidated.
    if (venue.districtCinemaId) {
      if (accepted.has(venue.districtCinemaId)) {
        reason = `stored CD${venue.districtCinemaId} already claimed by another cinema this run — two D1 rows share a district_cinema_id; refusing to guess`
        console.log(`[district-sync] ${slug}: ${venue.name}: ${reason}`)
      }
      else {
        try {
          const res = await fetchOne(venue.districtCinemaId, report.date)
          if (pageVerifies(venue, res.cinema, directoryCityId, `${venue.name} (stored CD${venue.districtCinemaId})`)) {
            hit = { venue, res, viaStoredId: true, storedIdReplaced: false, okForDate: true }
          }
          else {
            // Positive evidence the stored id points at a DIFFERENT cinema:
            // null it so the normal matching algorithm takes over (now and in
            // future runs). Do not ship a known-suspicious mapping.
            const badId = venue.districtCinemaId
            const why = `stored CD${badId} failed verification — page says "${res.cinema.name}" @ ${res.cinema.lat ?? '?'},${res.cinema.lon ?? '?'} (cityId=${res.cinema.cityId ?? '?'})`
            await db.prepare('UPDATE cinemas SET district_cinema_id = NULL WHERE id = ?').bind(venue.id).run()
            venue.districtCinemaId = undefined
            report.storedIdsNulled.push({ ourId: venue.id, ourName: venue.name, badId, reason: why })
            console.log(`[district-sync] ${slug}: ${venue.name}: NULLed wrong stored id — ${why}`)
            reason = why
          }
        }
        catch (e) {
          // Transient fetch error — KEEP the stored id (it may be fine), try Path B.
          reason = `stored CD${venue.districtCinemaId}: ${e instanceof Error ? e.message : String(e)}`
          failedFetch = true
        }
      }
    }

    // Path B — ranked name candidates from the city directory, each verified
    // against its own page (cityId + ≤10 km) before acceptance.
    if (!hit) {
      const candidates = matchKnownVenueToCandidates(venue, links, slug).slice(0, MAX_CANDIDATES_PER_VENUE)
      if (!candidates.length && !reason) reason = 'no confident name match in the city directory'
      for (const link of candidates) {
        if (accepted.has(link.districtId)) continue
        try {
          const res = await fetchOne(link.districtId, report.date)
          if (pageVerifies(venue, res.cinema, directoryCityId, `${venue.name} ↔ ${link.slug}`)) {
            hit = {
              venue,
              res,
              viaStoredId: false,
              // A name-match that supersedes a stored id (disproved above, or the
              // stored-id fetch errored) counts as a replacement.
              storedIdReplaced: !!originalStoredId,
              okForDate: true,
            }
            failedFetch = false
            reason = ''
            break
          }
          reason = `best-ranked candidate "${link.slug}" failed verification`
        }
        catch (e) {
          reason = `candidate ${link.slug}: ${e instanceof Error ? e.message : String(e)}`
          failedFetch = true
        }
      }
    }

    if (!hit) {
      const entry: UnmatchedCinema = { ourId: venue.id, ourName: venue.name, reason: reason || 'no confident match' }
      if (failedFetch) report.fetchFailed.push(entry)
      else report.unmatched.push(entry)
      console.log(`[district-sync] ${slug}: ${failedFetch ? 'FETCH FAILED (existing shows preserved)' : 'UNMATCHED (skipped — never guessed, never created)'} — ${venue.name} (${venue.id}): ${entry.reason}`)
      continue
    }

    accepted.set(hit.res.cinemaId, hit)
    console.log(`[district-sync] CD${hit.res.cinemaId} "${hit.res.cinemaName}" ↔ ${hit.venue.name} `
      + `(${hit.viaStoredId ? 'stored id' : 'name match'}): ${hit.res.shows.length} session(s) for ${report.date}`)
  }

  if (!accepted.size) {
    report.status = 'skipped'
    report.note = 'no cinema matched District confidently this run — nothing written, nothing deleted'
    report.durationMs = Date.now() - t0
    return report
  }

  // ---- 4) late-night rollover (only when the date was not explicit) ---------
  const istHour = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours()
  const lateNightIST = istHour >= 22 || istHour < 6
  if (!explicitDate && lateNightIST && [...accepted.values()].every(f => f.res.shows.length === 0)) {
    report.date = new Date(Date.now() + (5.5 * 3600 + 86400) * 1000).toISOString().slice(0, 10)
    report.dateRolledOver = true
    console.log(`[district-sync] ${slug}: 0 sessions everywhere at ${istHour}:xx IST — District has rolled the day over; refetching for ${report.date}`)
    for (const f of [...accepted.values()]) {
      try {
        f.res = await fetchOne(f.res.cinemaId, report.date)
        console.log(`[district-sync] CD${f.res.cinemaId} "${f.res.cinemaName}" (${f.venue.name}): ${f.res.shows.length} session(s) for ${report.date}`)
      }
      catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        f.okForDate = false
        accepted.delete(f.res.cinemaId)
        report.fetchFailed.push({ ourId: f.venue.id, ourName: f.venue.name, reason: `rollover refetch for ${report.date}: ${msg}` })
        console.log(`[district-sync] ${slug}: ROLLOVER REFETCH FAILED (existing shows preserved) — ${f.venue.name}: ${msg}`)
      }
    }
  }

  // ---- 5) collect movies + shows from every verified cinema -----------------
  const movieMap = new Map<string, { title: string, language: string }>()
  const shows: CollectedShow[] = []
  const sidOwner = new Map<string, string>() // a District sid belongs to exactly one cinema
  const perVenue = new Map<string, { shows: number, movies: Set<string> }>()

  for (const f of accepted.values()) {
    const counts = { shows: 0, movies: new Set<string>() }
    perVenue.set(f.venue.id, counts)
    for (const s of f.res.shows) {
      const owner = sidOwner.get(s.sessionId)
      if (owner != null) {
        console.log(`[district-sync] session ${s.sessionId} returned for ${f.venue.id} but already owned by ${owner} — keeping the first row`)
        continue
      }
      sidOwner.set(s.sessionId, f.venue.id)
      const m = movieMap.get(s.movieId)
      if (!m) movieMap.set(s.movieId, { title: s.movieTitle, language: s.language ?? 'unknown' })
      else if (s.language && m.language === 'unknown') m.language = s.language
      shows.push({
        sessionId: s.sessionId,
        cinemaRowId: f.venue.id,
        movieId: s.movieId,
        showDate: s.showDate,
        showTime: s.showTime,
        format: s.format,
        language: s.language,
        availability: s.availability,
      })
      counts.shows++
      counts.movies.add(s.movieId)
    }
  }

  // ---- 6) write phase (all fetches done; save-test SQL, parameterized) ------
  const nowSec = Math.floor(Date.now() / 1000)

  const movieIds = [...movieMap.keys()].map(mid => `district-${mid}`)
  const showIds = shows.map(s => `district-${s.sessionId}`)
  const existingMovieIds = movieIds.length ? await existingIds(db, 'movies', movieIds) : new Set<string>()
  const existingShowIds = showIds.length ? await existingIds(db, 'shows', showIds) : new Set<string>()
  report.moviesUpserted = movieIds.length
  report.moviesInserted = movieIds.length - existingMovieIds.size
  report.moviesUpdated = existingMovieIds.size
  report.showsUpserted = showIds.length
  report.showsInserted = showIds.length - existingShowIds.size
  report.showsUpdated = existingShowIds.size

  if (movieIds.length) {
    for (const part of chunk([...movieMap.entries()], MOVIE_ROWS_PER_STMT)) {
      const params: unknown[] = []
      const values = part.map(([mid, m]) => {
        params.push(`district-${mid}`, m.title, m.language ?? 'unknown', 0, hueOf(m.title), '🎬', null, mid, 'district', nowSec)
        return '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      })
      await db.prepare(
        `INSERT INTO movies (id, title, language, duration_min, hue, emoji, poster_url, event_code, source, created_at) VALUES ${values.join(', ')}`
        + ` ON CONFLICT(id) DO UPDATE SET title = excluded.title,`
        + ` language = CASE WHEN excluded.language != 'unknown' THEN excluded.language ELSE movies.language END,`
        + ` duration_min = CASE WHEN excluded.duration_min > 0 THEN excluded.duration_min ELSE movies.duration_min END`,
      ).bind(...params).run()
    }
  }

  if (shows.length) {
    for (const part of chunk(shows, SHOW_ROWS_PER_STMT)) {
      const params: unknown[] = []
      const values = part.map((s) => {
        params.push(`district-${s.sessionId}`, s.cinemaRowId, `district-${s.movieId}`, s.showDate, s.showTime,
          s.format ?? '', '', s.sessionId, null, `${s.showDate}T${s.showTime}`, s.availability, s.language ?? null, 'district', nowSec)
        return '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      })
      await db.prepare(
        `INSERT INTO shows (id, cinema_id, movie_id, show_date, start_time, format, screen, session_id, show_time_code, show_date_time, availability_status, language, source, last_synced_at) VALUES ${values.join(', ')}`
        + ` ON CONFLICT(id) DO UPDATE SET availability_status = excluded.availability_status,`
        + ` format = excluded.format, screen = excluded.screen, language = excluded.language,`
        + ` last_synced_at = excluded.last_synced_at`,
      ).bind(...params).run()
    }
  }

  // Cinema stamps: verified District id + this-run timestamp (never a new row).
  for (const f of accepted.values()) {
    if (!f.okForDate) continue
    await db.prepare('UPDATE cinemas SET district_cinema_id = ?, last_synced_at = ? WHERE id = ?')
      .bind(f.res.cinemaId, nowSec, f.venue.id).run()
  }

  // Location stamp — only after a run that actually matched and wrote.
  await db.prepare('UPDATE sync_locations SET last_synced_at = ? WHERE slug = ?').bind(nowSec, slug).run()
  report.locationSyncedAt = nowSec

  // ---- 7) stale cleanup — per refreshed cinema, synced date only ------------
  // Rows written above carry last_synced_at = nowSec ≥ runStartedAtSec, so the
  // filter below can only hit rows a PREVIOUS run wrote for THIS date that the
  // successful response no longer lists. Another day's rows are never touched,
  // and ad_reports references always win (community history is preserved).
  for (const f of accepted.values()) {
    if (!f.okForDate) continue
    const del = await db.prepare(
      `DELETE FROM shows WHERE source = 'district' AND cinema_id = ? AND show_date = ?`
      + ` AND last_synced_at IS NOT NULL AND last_synced_at < ?`
      + ` AND NOT EXISTS (SELECT 1 FROM ad_reports WHERE ad_reports.show_id = shows.id)`,
    ).bind(f.venue.id, report.date, runStartedAtSec).run()
    report.staleDeleted += del.meta.changes ?? 0
    const kept = await db.prepare(
      `SELECT COUNT(*) AS n FROM shows WHERE source = 'district' AND cinema_id = ? AND show_date = ?`
      + ` AND last_synced_at IS NOT NULL AND last_synced_at < ?`
      + ` AND EXISTS (SELECT 1 FROM ad_reports WHERE ad_reports.show_id = shows.id)`,
    ).bind(f.venue.id, report.date, runStartedAtSec).first<{ n: number }>()
    report.staleKeptReferenced += kept?.n ?? 0
  }

  // ---- 8) per-cinema report rows --------------------------------------------
  report.matched = [...accepted.values()]
    .filter(f => f.okForDate)
    .map(f => ({
      ourId: f.venue.id,
      ourName: f.venue.name,
      districtCinemaId: f.res.cinemaId,
      districtName: f.res.cinemaName,
      viaStoredId: f.viaStoredId,
      storedIdReplaced: f.storedIdReplaced,
      shows: perVenue.get(f.venue.id)?.shows ?? 0,
      movies: perVenue.get(f.venue.id)?.movies.size ?? 0,
    }))

  report.durationMs = Date.now() - t0
  console.log(`[district-sync] ${slug}: OK — date=${report.date}${report.dateRolledOver ? ' (rolled over)' : ''} `
    + `matched=${report.matched.length} unmatched=${report.unmatched.length} fetchFailed=${report.fetchFailed.length} `
    + `nullIds=${report.storedIdsNulled.length} `
    + `movies +${report.moviesInserted}/${report.moviesUpdated} shows +${report.showsInserted}/${report.showsUpdated} `
    + `staleDeleted=${report.staleDeleted} staleKeptReferenced=${report.staleKeptReferenced} fetches=${report.fetches}`)
  return report
}
