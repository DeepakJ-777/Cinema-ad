/**
 * Near Me → District showtimes integration (server-side).
 *
 * AREA & VENUE DRIVEN:
 * When /api/cinemas/near discovers or selects nearby cinemas, it returns
 * immediately (<300ms) while triggering sequential background synchronization
 * for the closest cinemas via the runtime-supported waitUntil mechanism.
 *
 * Matching Priority (strict, no guessing):
 *   1. Existing district_cinema_id
 *   2. Exact / normalized cinema name + city
 *   3. Token similarity + geographic proximity (<= 10 km)
 *   4. District city directory venue search
 *   If confidence is insufficient -> district_cinema_id = null (never guessed).
 *
 * Safety & Resilience:
 *   - Sequential fetching with polite 2.5s delay
 *   - AbortController timeout & single retry on transport resets
 *   - One cinema failure NEVER stops other cinemas or breaks Near Me
 *   - TTL cache (60 minutes) prevents redundant scraping
 *   - Non-blocking via event.waitUntil / ExecutionContext.waitUntil
 */

import { sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { getDb } from './db'
import {
  CITY_ALIASES,
  distanceM,
  extractCinemaLinks,
  matchKnownVenueToCandidates,
} from '../../sync-worker/src/district.ts'
import {
  getDistrictCinemaShows,
  istToday,
  type DistrictCinemaShows,
} from '../../sync-worker/src/district-shows.ts'
import { politeFetch, sleep, type FetchBudget } from '../../sync-worker/src/http.ts'

type Db = Awaited<ReturnType<typeof getDb>>

const DISTRICT_ORIGIN = 'https://www.district.in'
const PROXIMITY_LIMIT_M = 10_000
const DEFAULT_TTL_SECONDS = 60 * 60 // 60 minutes
const MAX_NEARBY_SYNC_CINEMAS = 5
const BETWEEN_FETCHES_MS = 2500

/** Active syncing cinema IDs across in-flight background tasks. */
const activeSyncingCinemas = new Set<string>()

export function isCinemaSyncing(cinemaId: string): boolean {
  return activeSyncingCinemas.has(cinemaId)
}

/** Any city spelling -> canonical slug. */
const ALIAS_TO_SLUG: Record<string, string> = {}
for (const [slug, aliases] of Object.entries(CITY_ALIASES)) {
  for (const a of aliases) ALIAS_TO_SLUG[a.toLowerCase()] = slug
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

export function cityToSlug(city: string | null | undefined): string {
  const k = slugify((city ?? '').replace(/\s+(district|dt)$/i, ''))
  return ALIAS_TO_SLUG[k] ?? k
}

/** In-memory cache for District city directory cinema links (TTL: 30 minutes). */
interface DirectoryCacheEntry {
  at: number
  links: ReturnType<typeof extractCinemaLinks>
}
const directoryCache = new Map<string, DirectoryCacheEntry>()

async function getCachedDistrictLinks(citySlug: string): Promise<ReturnType<typeof extractCinemaLinks>> {
  if (!citySlug) return []
  const hit = directoryCache.get(citySlug)
  if (hit && Date.now() - hit.at < 30 * 60_000) {
    return hit.links
  }

  const budget: FetchBudget = { left: 2 }
  const url = `${DISTRICT_ORIGIN}/movies/cinemas-in-${citySlug}`
  const res = await politeFetch(url, budget, 'text/html,application/xhtml+xml', {
    timeoutMs: 15_000,
    allowOneRetryOnReset: true,
  })

  if (res.status !== 200 || !res.body) {
    console.log(`[near-dir] Failed to fetch directory for ${citySlug} (HTTP ${res.status}): ${res.blockedReason || res.errorReason || ''}`)
    return []
  }

  const links = extractCinemaLinks(res.body, citySlug)
  directoryCache.set(citySlug, { at: Date.now(), links })
  return links
}

/** Deterministic hue per title. */
function hueOf(title: string): number {
  let h = 0
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

/** Acceptance rule for candidate District cinema page. */
function pageVerifies(
  venue: { name: string, latitude?: number | null, longitude?: number | null },
  cinema: DistrictCinemaShows['cinema'],
  label: string,
): boolean {
  if (venue.latitude != null && venue.longitude != null && cinema.lat != null && cinema.lon != null) {
    const m = distanceM(venue.latitude, venue.longitude, cinema.lat, cinema.lon)
    if (m > PROXIMITY_LIMIT_M) {
      console.log(`[near-match] ${label}: ${Math.round(m)}m away from our pin — candidate rejected (> ${PROXIMITY_LIMIT_M}m)`)
      return false
    }
    return true
  }
  return true
}

export interface NearbyCinemaInput {
  id: string
  name: string
  address?: string | null
  city?: string | null
  latitude: number
  longitude: number
  district_cinema_id?: string | null
  districtCinemaId?: string | null
  last_synced_at?: number | null
  lastSyncedAt?: number | null
}

/**
 * Match a single cinema to a District cinema ID.
 * Priority:
 *   1. Existing district_cinema_id
 *   2. Exact/normalized cinema name + city
 *   3. Token similarity + coordinate proximity (<= 10 km)
 *   4. District venue search in city directory
 */
async function resolveDistrictCinema(
  cinema: NearbyCinemaInput,
  citySlug: string,
  today: string,
): Promise<{ districtId: string, showsResult?: DistrictCinemaShows } | null> {
  const existingId = cinema.districtCinemaId || cinema.district_cinema_id
  if (existingId) {
    return { districtId: existingId }
  }

  const links = await getCachedDistrictLinks(citySlug)
  if (!links.length) {
    console.log(`[near-match] No District directory links available for city '${citySlug}'`)
    return null
  }

  const knownVenue = {
    id: cinema.id,
    name: cinema.name,
    lat: cinema.latitude,
    lng: cinema.longitude,
  }

  const candidates = matchKnownVenueToCandidates(knownVenue, links, citySlug).slice(0, 3)
  if (!candidates.length) {
    console.log(`[near-match] District match not found for ${cinema.name} (${cinema.id})`)
    return null
  }

  for (const cand of candidates) {
    try {
      const showsRes = await getDistrictCinemaShows(cand.districtId, citySlug, today, { timeoutMs: 15_000 })
      if (pageVerifies(cinema, showsRes.cinema, `${cinema.name} ↔ ${cand.slug}`)) {
        console.log(`[near-match] Matched ${cinema.name} (${cinema.id}) ↔ CD${cand.districtId} "${showsRes.cinemaName}"`)
        return { districtId: cand.districtId, showsResult: showsRes }
      }
    }
    catch (e: any) {
      console.log(`[near-match] Candidate CD${cand.districtId} (${cand.slug}) fetch failed: ${e?.message ?? e}`)
    }
  }

  console.log(`[near-match] District match not found for ${cinema.name} (${cinema.id})`)
  return null
}

/**
 * Synchronize a single cinema's showtimes into D1 idempotently.
 */
async function syncSingleCinema(
  db: Db,
  cinema: NearbyCinemaInput,
  citySlug: string,
  today: string,
): Promise<{ success: boolean, showsCount: number, error?: string }> {
  try {
    const match = await resolveDistrictCinema(cinema, citySlug, today)
    if (!match) {
      return { success: false, showsCount: 0, error: 'District match not found' }
    }

    const districtId = match.districtId
    const showsRes = match.showsResult ?? (await getDistrictCinemaShows(districtId, citySlug, today, { timeoutMs: 15_000 }))

    const nowSec = Math.floor(Date.now() / 1000)

    // 1) Upsert movies
    const movies = showsRes.shows.reduce((acc, s) => {
      if (!acc.has(s.movieId)) {
        acc.set(s.movieId, { title: s.movieTitle, language: s.language || 'unknown' })
      }
      return acc
    }, new Map<string, { title: string, language: string }>())

    for (const [mid, m] of movies.entries()) {
      const movieId = `district-${mid}`
      const hue = hueOf(m.title)
      await db.run(sql`
        INSERT INTO movies (id, title, language, duration_min, hue, emoji, poster_url, event_code, source, created_at)
        VALUES (${movieId}, ${m.title}, ${m.language}, 0, ${hue}, '🎬', NULL, ${mid}, 'district', ${nowSec})
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          language = CASE WHEN excluded.language != 'unknown' THEN excluded.language ELSE movies.language END,
          duration_min = CASE WHEN excluded.duration_min > 0 THEN excluded.duration_min ELSE movies.duration_min END
      `)
    }

    // 2) Upsert shows
    for (const s of showsRes.shows) {
      const showId = `district-${s.sessionId}`
      const movieId = `district-${s.movieId}`
      const showDateTime = `${s.showDate}T${s.showTime}`
      await db.run(sql`
        INSERT INTO shows (id, cinema_id, movie_id, show_date, start_time, format, screen, session_id, show_time_code, show_date_time, availability_status, language, source, last_synced_at)
        VALUES (${showId}, ${cinema.id}, ${movieId}, ${s.showDate}, ${s.showTime}, ${s.format || ''}, ${s.screen || ''}, ${s.sessionId}, NULL, ${showDateTime}, ${s.availability}, ${s.language || null}, 'district', ${nowSec})
        ON CONFLICT(id) DO UPDATE SET
          availability_status = excluded.availability_status,
          format = excluded.format,
          screen = excluded.screen,
          language = excluded.language,
          last_synced_at = excluded.last_synced_at
      `)
    }

    // 3) Stale cleanup for this cinema on today's date (preserving community ad reports)
    await db.run(sql`
      DELETE FROM shows
      WHERE cinema_id = ${cinema.id} AND source = 'district' AND show_date = ${today}
        AND (last_synced_at IS NULL OR last_synced_at < ${nowSec})
        AND NOT EXISTS (SELECT 1 FROM ad_reports WHERE ad_reports.show_id = shows.id)
    `)

    // 4) Update cinema stamp
    await db.run(sql`
      UPDATE cinemas
      SET district_cinema_id = ${districtId}, last_synced_at = ${nowSec}
      WHERE id = ${cinema.id}
    `)

    console.log(`[near-sync] Synced ${showsRes.shows.length} shows for ${cinema.name} (CD${districtId})`)
    return { success: true, showsCount: showsRes.shows.length }
  }
  catch (err: any) {
    const msg = err?.message ?? String(err)
    console.log(`[near-sync] District fetch failed for ${cinema.name} (${cinema.id}): ${msg}`)
    return { success: false, showsCount: 0, error: msg }
  }
}

/** Check if a cinema's shows are already fresh in D1 for today. */
function isCinemaFresh(cinema: NearbyCinemaInput, ttlSeconds = DEFAULT_TTL_SECONDS): boolean {
  const lsa = Number(cinema.lastSyncedAt || cinema.last_synced_at || 0)
  if (!lsa) return false
  const nowSec = Math.floor(Date.now() / 1000)
  if (nowSec - lsa > ttlSeconds) return false

  const syncedDate = istToday(lsa * 1000)
  const today = istToday()
  return syncedDate === today
}

/**
 * Non-blocking Near Me background synchronizer.
 * Processes closest nearby cinemas sequentially using event.waitUntil().
 */
export function syncNearbyCinemasBackground(
  event: H3Event | undefined,
  db: Db,
  nearbyCinemas: NearbyCinemaInput[],
  options: { maxCinemas?: number, ttlSeconds?: number } = {},
): void {
  const max = options.maxCinemas ?? MAX_NEARBY_SYNC_CINEMAS
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS
  const today = istToday()

  const candidatesToSync = nearbyCinemas
    .slice(0, max)
    .filter(c => !isCinemaFresh(c, ttl) && !activeSyncingCinemas.has(c.id))

  if (!candidatesToSync.length) {
    return
  }

  // Mark all target cinemas as actively syncing
  for (const c of candidatesToSync) {
    activeSyncingCinemas.add(c.id)
  }

  const runTask = async () => {
    try {
      console.log(`[near-bg] Starting sequential background sync for ${candidatesToSync.length} cinemas...`)
      for (let i = 0; i < candidatesToSync.length; i++) {
        const cinema = candidatesToSync[i]
        const citySlug = cityToSlug(cinema.city) || 'kochi'
        try {
          await syncSingleCinema(db, cinema, citySlug, today)
        }
        finally {
          activeSyncingCinemas.delete(cinema.id)
        }

        if (i < candidatesToSync.length - 1) {
          await sleep(BETWEEN_FETCHES_MS)
        }
      }
      console.log(`[near-bg] Completed background sync for ${candidatesToSync.length} cinemas.`)
    }
    catch (err: any) {
      console.error(`[near-bg] Unexpected background sync error: ${err?.message ?? err}`)
    }
    finally {
      // Safety cleanup
      for (const c of candidatesToSync) {
        activeSyncingCinemas.delete(c.id)
      }
    }
  }

  const taskPromise = runTask()

  // Cloudflare Workers / Nitro ExecutionContext.waitUntil
  if (event?.waitUntil) {
    event.waitUntil(taskPromise)
  }
  else if ((event?.context as any)?.cloudflare?.context?.waitUntil) {
    ;(event.context as any).cloudflare.context.waitUntil(taskPromise)
  }
  else {
    taskPromise.catch(err => console.error('[near-bg-promise] unhandled:', err))
  }
}
