/**
 * getDistrictCinemaShows — minimal District (Zomato) showtime reader.
 *
 * STEP-1 PROOF ONLY: fetch ONE public cinema page, read __NEXT_DATA__, and
 * normalize data.serverState[cinema_id].arrangedSessions[] into a flat show
 * array. Standalone by design — no D1, no cron, no matching, no cleanup.
 *
 * Page shape (verified against live pages):
 *   GET /movies/{anything}-in-{city}-CD{cinema_id}?fromdate=YYYY-MM-DD
 *   <script id="__NEXT_DATA__"> → props.pageProps.data.serverState:
 *     key is `${cinema_id}${date}` (e.g. '10222942026-08-18'); falls back to
 *     bare cinema_id, then first entry. Value:
 *       .meta.cinema        → { name, address, lat, lon, ... }
 *       .arrangedSessions[] → { entityCode, entityName, data.contentId/name,
 *                               sessions: [{ sid, showTime, lang, scrnFmt,
 *                                 seatStatus, avail, total, areas[] }] }
 *
 * Timezone rule: District's showTime is a LOCAL India wall-clock string
 * ('2026-08-17T09:45', no TZ suffix). It is split by regex — never through
 * new Date() — so no runtime timezone can shift it.
 */

const ORIGIN = 'https://www.district.in'
const UA = 'CinemaCommunity-Sync/0.1 (community cinema start-times app; contact: dev@example.com)'

export interface DistrictShow {
  cinemaId: string
  cinemaName: string
  movieId: string
  movieTitle: string
  showDate: string // YYYY-MM-DD — local wall clock, stored verbatim
  showTime: string // HH:MM (24h)
  sessionId: string
  language?: string
  format?: string
  availability: string // available | filling_fast | almost_full | sold_out | unknown
  source: 'district'
}

export interface DistrictCinemaMeta {
  name: string
  address?: string
  lat?: number
  lon?: number
  cityId?: string
  pincode?: string
}

export interface DistrictCinemaShows {
  cinemaId: string
  cinemaName: string
  /** Same-page cinema metadata — used to verify cinema matches (coords/city). */
  cinema: DistrictCinemaMeta
  url: string
  date: string
  fetchedAt: string
  movieCount: number
  shows: DistrictShow[]
}

/** Local India date (YYYY-MM-DD) without letting any runtime TZ leak in. */
export function istToday(nowMs = Date.now()): string {
  return new Date(nowMs + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined
const idStr = (v: unknown): string | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? String(v) : str(v)

/** '2026-08-17T09:45' (± seconds) → date/time parts. No Date parsing. */
function splitWallClock(showTime: unknown): { date: string, time: string } | undefined {
  const raw = str(showTime)
  if (!raw) return undefined
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  return m ? { date: m[1], time: m[2] } : undefined
}

/** seatStatus label → snake_case; else derive from areas[]/counts.
 *  Sold out ONLY when every seat tier reports zero available. */
function normalizeAvailability(s: Record<string, unknown>): string {
  const seat = str(s.seatStatus)
  if (seat) {
    const k = seat.toLowerCase()
    if (k === 'sold out' || k === 'soldout') return 'sold_out'
    if (k === 'filling fast' || k === 'fast filling') return 'filling_fast'
    if (k === 'almost full') return 'almost_full'
    if (k === 'available') return 'available'
    return k.replace(/\s+/g, '_')
  }
  const areas = Array.isArray(s.areas) ? (s.areas as { sAvail?: unknown }[]) : []
  const withCounts = areas.filter(a => num(a.sAvail) != null)
  if (withCounts.length > 0)
    return withCounts.every(a => num(a.sAvail) === 0) ? 'sold_out' : 'available'
  const avail = num(s.avail)
  const total = num(s.total)
  if (avail != null && total != null && total > 0) return avail > 0 ? 'available' : 'sold_out'
  return 'unknown'
}

/**
 * Fetch one District cinema's page and normalize its sessions for `date`.
 * `citySlug` and the slug in the URL are decorative — only CD{cinemaId} and
 * ?fromdate matter. Throws with the exact URL + HTTP status on failure.
 */
export async function getDistrictCinemaShows(
  cinemaId: string,
  citySlug: string,
  date = istToday(),
): Promise<DistrictCinemaShows> {
  const url = `${ORIGIN}/movies/x-in-${citySlug}-CD${cinemaId}?fromdate=${date}`

  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  }).catch(e => { throw new Error(`network error fetching ${url}: ${e}`) })
  const body = await res.text().catch(() => '')
  if (res.status !== 200)
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${url} — body: "${body.slice(0, 160).replace(/\s+/g, ' ')}"`)

  const m = body.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!m) throw new Error(`no __NEXT_DATA__ script in ${url} (${body.length} bytes)`)
  let json: any
  try {
    json = JSON.parse(m[1])
  }
  catch (e) {
    throw new Error(`__NEXT_DATA__ JSON unparseable in ${url}: ${e}`)
  }

  const ss = json?.props?.pageProps?.data?.serverState
  if (ss == null || typeof ss !== 'object' || Array.isArray(ss))
    throw new Error(`no serverState in __NEXT_DATA__ of ${url}`)
  const state = ss[`${cinemaId}${date}`] ?? ss[cinemaId] ?? Object.values(ss)[0]
  if (state == null) throw new Error(`serverState empty in ${url}`)

  const cinema = state?.meta?.cinema ?? {}
  const cinemaName = str(cinema.name) ?? `District cinema CD${cinemaId}`
  const cinemaMeta: DistrictCinemaMeta = {
    name: cinemaName,
    address: str(cinema.address),
    lat: num(cinema.lat),
    lon: num(cinema.lon),
    cityId: idStr(cinema.cityId),
    pincode: idStr(cinema.pincode),
  }
  const arranged = Array.isArray(state?.arrangedSessions) ? state.arrangedSessions : []

  const shows: DistrictShow[] = []
  for (const group of arranged) {
    const gdata = (group?.data ?? {}) as Record<string, unknown>
    const movieId = idStr(group?.entityCode) ?? idStr(gdata.contentId)
    const movieTitle = str(group?.entityName) ?? str(gdata.name)
    if (!movieId || !movieTitle) continue // group without ids/title — skip
    const sessions = Array.isArray(group?.sessions) ? group.sessions : []
    for (const s of sessions) {
      const sessionId = idStr(s?.sid)
      const wall = splitWallClock(s?.showTime)
      if (!sessionId || !wall) continue
      if (wall.date !== date) continue // page pinned by fromdate; keep only `date`
      shows.push({
        cinemaId,
        cinemaName,
        movieId,
        movieTitle,
        showDate: wall.date,
        showTime: wall.time,
        sessionId,
        language: str(s?.lang),
        format: str(s?.scrnFmt),
        availability: normalizeAvailability(s ?? {}),
        source: 'district',
      })
    }
  }

  return {
    cinemaId,
    cinemaName,
    cinema: cinemaMeta,
    url,
    date,
    fetchedAt: new Date().toISOString(),
    movieCount: new Set(shows.map(s => s.movieId)).size,
    shows,
  }
}
