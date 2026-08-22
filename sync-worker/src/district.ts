/**
 * DistrictProvider — the only module that knows about District (Zomato).
 *
 * How District works (verified 2026-08-17, honest UA, plain GET, all 200s):
 *
 *   1. City cinema directory:  GET /movies/cinemas-in-{city}  (SSR HTML)
 *      The page body links every ticketed cinema in the city as
 *      /movies/{slug}-in-{city}-CD{cinema_id}. The slug is decorative; only the
 *      numeric CD id matters (a wrong slug + wrong city still renders the same
 *      cinema). The city's numeric id is embedded in the footer SEO JSON.
 *
 *   2. Cinema page:            GET /movies/{slug}-in-{city}-CD{id}[?fromdate=YYYY-MM-DD]
 *      Everything needed is inside <script id="__NEXT_DATA__"> at
 *      props.pageProps.data.serverState[cinema_id]:
 *        .meta.cinema           — name/address/lat/lon/pincode/cityId/chainKey/…
 *        .arrangedSessions[]    — per movie: { entityCode (contentId), entityName,
 *                                  data.duration/censor/…, sessions[] }
 *        sessions[]             — sid, mid, fid, showTime (LOCAL WALL CLOCK, no TZ
 *                                  suffix, e.g. '2026-08-17T09:45'), lang, scrnFmt,
 *                                  audi, total/avail, seatStatus, areas[]{sAvail,
 *                                  sTotal,seatStatus}. Default page = today (IST);
 *          ` ?fromdate=` shifts the window (verified for tomorrow).
 *
 *   The /gw/* gateway (search, cities) answers 401 "Access token not found" to
 *   plain clients, so this provider never touches it — the two public pages
 *   above are sufficient and authoritative.
 *
 * Timezone rule: showTime is an India wall-clock string. It is split by REGEX
 * into date/time and stored verbatim — new Date(showTime) is never called, so
 * no runtime timezone can shift it.
 *
 * Request budget per location: 1 city directory page + 1 cinema page per known
 * D1 cinema that resolves to a District cinema id. Cinemas already carrying a
 * district_cinema_id skip the directory-name matching (and the directory page
 * is still fetched once per run to discover ids for newly added cinemas — and
 * to re-verify the city id cheaply).
 */

import { politeFetch, sleep } from './http'
import {
  ProviderBlockedError,
  ProviderSkippedError,
  type KnownVenue,
  type ProviderInput,
  type ProviderLocationData,
  type ShowtimeProvider,
} from './provider'

const ORIGIN = 'https://www.district.in'
const BETWEEN_FETCHES_MS = 2000
/** Cinemas per city per day — keeps the run tiny and polite. */
const MAX_CINEMAS_PER_LOCATION = 12
/** Name-ranked candidates tried per venue before declaring it unmatched. */
const MAX_CANDIDATES_PER_VENUE = 3

/** Tokens that never distinguish two different cinemas. */
const GENERIC_TOKENS = new Set([
  'cinema', 'cinemas', 'cineplex', 'multiplex', 'mall', 'malls', 'theatre', 'theaters',
  'theater', 'digital', 'dolby', 'atmos', 'laser', 'rgb', 'ac', '2d', '3d', '4d', '4k',
  'screen', 'screens', 'miniplex', 'imax',
])

/** City aliases (incl. District's own spellings) stripped from venue names. */
const CITY_ALIASES: Record<string, string[]> = {
  kochi: ['kochi', 'cochin', 'ernakulam', 'edappally'],
  bengaluru: ['bengaluru', 'bangalore', 'bengaluruin'],
}

interface DistrictCinemaLink {
  districtId: string
  url: string
  slug: string
  tokens: Set<string>
}

interface DistrictSession {
  sid?: unknown
  cid?: unknown
  showTime?: unknown
  lang?: unknown
  scrnFmt?: unknown
  audi?: unknown
  seatStatus?: unknown
  avail?: unknown
  total?: unknown
  areas?: unknown
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
/** String-ish ids: District emits some ids (entityCode/contentId) as JSON numbers. */
const idStr = (v: unknown): string | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return str(v)
}

/** Local India date (YYYY-MM-DD) without letting any runtime TZ leak in. */
export function istToday(nowMs = Date.now()): string {
  return new Date(nowMs + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * 'Sold Out' → 'sold_out'; 'Filling Fast' → 'filling_fast'; unknown labels are
 * lower-snake-cased. When the session carries no seatStatus, availability is
 * derived from areas[] — a show is sold out ONLY when every seat tier reports
 * zero seats available (never from a single area).
 */
export function normalizeAvailability(s: DistrictSession): string {
  const seat = str(s.seatStatus)
  if (seat) {
    const k = seat.toLowerCase()
    if (k === 'sold out' || k === 'soldout') return 'sold_out'
    if (k === 'filling fast' || k === 'fast filling') return 'filling_fast'
    if (k === 'available') return 'available'
    return k.replace(/\s+/g, '_')
  }
  const areas = Array.isArray(s.areas) ? (s.areas as { sAvail?: unknown }[]) : []
  const withCounts = areas.filter(a => num(a.sAvail) != null)
  if (withCounts.length > 0) {
    return withCounts.every(a => num(a.sAvail) === 0) ? 'sold_out' : 'available'
  }
  const avail = num(s.avail)
  const total = num(s.total)
  if (avail != null && total != null && total > 0) return avail > 0 ? 'available' : 'sold_out'
  return 'unknown'
}

/** Split '2026-08-17T09:45' (± seconds) into wall-clock parts. No Date parsing. */
export function splitWallClock(showTime?: unknown): { date: string, time: string, full: string } | undefined {
  const raw = str(showTime)
  if (!raw) return undefined
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?/)
  if (!m) return undefined
  return { date: m[1], time: m[2], full: `${m[1]}T${m[2]}` }
}

function tokensOf(name: string, stop: Set<string>): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !GENERIC_TOKENS.has(t) && !stop.has(t))
}

/**
 * Every cinema link in a city directory page. Absolute https hrefs are what the
 * SSR'd page emits; a leading-slash variant is accepted too in case of drift.
 */
export function extractCinemaLinks(html: string, citySlug: string): DistrictCinemaLink[] {
  const stop = new Set([...(CITY_ALIASES[citySlug] ?? []), citySlug])
  const out = new Map<string, DistrictCinemaLink>()
  const re = /(?:https:\/\/www\.district\.in)?\/movies\/([a-z0-9-]+)-in-[a-z-]+-cd(\d+)(?=["/?])/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const slug = m[1]
    const districtId = m[2]
    if (out.has(districtId)) continue
    out.set(districtId, {
      districtId,
      slug,
      url: `${ORIGIN}/movies/${slug}-in-${citySlug}-CD${districtId}`,
      tokens: new Set(tokensOf(slug.replace(/-/g, ' '), stop)),
    })
  }
  return [...out.values()]
}

/** The city's own numeric id, from the footer SEO payload (authoritative). */
export function extractCityId(json: unknown): string | undefined {
  const walk = (node: unknown, depth: number): string | undefined => {
    if (depth > 14 || node == null || typeof node !== 'object') return undefined
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item, depth + 1)
        if (hit) return hit
      }
      return undefined
    }
    const o = node as Record<string, unknown>
    if (o.type === 'cities' && typeof o.id === 'string') return o.id
    for (const v of Object.values(o)) {
      const hit = walk(v, depth + 1)
      if (hit) return hit
    }
    return undefined
  }
  return walk(json, 0)
}

function parseNextData(html: string, url: string): Record<string, unknown> {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!m) throw new Error(`no __NEXT_DATA__ script in ${url}`)
  try {
    return JSON.parse(m[1]) as Record<string, unknown>
  }
  catch (e) {
    throw new Error(`__NEXT_DATA__ JSON unparseable in ${url}: ${e}`)
  }
}

/** serverState for one cinema page; keyed by cinema id (fallback: first key). */
function serverStateFor(json: Record<string, unknown>, districtId: string): Record<string, unknown> | undefined {
  const props = json.props as Record<string, unknown> | undefined
  const pageProps = props?.pageProps as Record<string, unknown> | undefined
  const data = pageProps?.data as Record<string, unknown> | undefined
  const ss = data?.serverState
  if (ss == null || typeof ss !== 'object' || Array.isArray(ss)) return undefined
  const map = ss as Record<string, unknown>
  const entry = map[districtId] ?? Object.values(map)[0]
  return (entry ?? undefined) as Record<string, unknown> | undefined
}

/** Great-circle distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Resolve one known D1 cinema to RANKED District cinema candidates from the
 * city directory. Rank: slug-token superset with fewest extra tokens, then
 * classic normalized containment. The caller verifies candidates against the
 * cinema page's own coordinates/cityId before accepting — token rank alone
 * must not decide (e.g. "INOX Garuda Mall" token-matches both Magrath Road
 * and Yelahanka; the coordinates pick the right one).
 */
export function matchKnownVenueToCandidates(
  venue: KnownVenue,
  links: DistrictCinemaLink[],
  citySlug: string,
): DistrictCinemaLink[] {
  const stop = new Set([...(CITY_ALIASES[citySlug] ?? []), citySlug])
  const ours = tokensOf(venue.name, stop)
  if (!ours.length) return []
  const norm = venue.name.toLowerCase().replace(/[^a-z0-9]/g, '')

  const hits: { link: DistrictCinemaLink, score: number }[] = []
  for (const link of links) {
    const subsetHit = ours.every(t => link.tokens.has(t))
    const linkNorm = link.slug.replace(/-/g, '')
    const containHit = norm.length >= 4 && linkNorm.length >= 4
      && (linkNorm.includes(norm) || norm.includes(linkNorm))
    if (!subsetHit && !containHit) continue
    const extras = [...link.tokens].filter(t => !ours.includes(t)).length
    hits.push({ link, score: ours.length / (ours.length + extras) })
  }
  return hits.sort((a, b) => b.score - a.score).map(h => h.link)
}

export class DistrictProvider implements ShowtimeProvider {
  readonly id = 'district'

  async syncLocation(input: ProviderInput): Promise<ProviderLocationData> {
    const targetDate = istToday()
    const known = input.knownVenues ?? []
    if (!known.length)
      throw new ProviderSkippedError('no known cinemas in D1 for this city yet — nothing to attach shows to')

    // --- 1) city directory (1 request): cinema ids for this city ----------
    const dirUrl = `${ORIGIN}/movies/cinemas-in-${input.slug}`
    const dir = await politeFetch(dirUrl, input.budget)
    if (dir.skipped) throw new ProviderBlockedError(`city directory skipped: ${dir.skipped}`)
    if (dir.blockedReason) throw new ProviderBlockedError(`city directory blocked: ${dir.blockedReason}`, dir.status)
    const pages = [{ url: dir.url, status: dir.status, ms: dir.ms, bytes: dir.bytes }]
    if (!dir.body) throw new ProviderBlockedError(`city directory returned HTTP ${dir.status} with no body`)

    const links = extractCinemaLinks(dir.body, input.slug)
    let cityId: string | undefined
    try {
      cityId = extractCityId(parseNextData(dir.body, dirUrl))
    }
    catch { /* footer payload is optional — links alone are enough */ }
    if (cityId && input.regionCode && cityId !== input.regionCode)
      console.log(`[district] ${input.slug}: NOTE city id drift — sync_locations.region_code=${input.regionCode} but District says ${cityId}; trusting District's pages`)
    console.log(`[district] ${input.slug}: directory ok (cityId=${cityId ?? '?'}, ${links.length} cinema links, ${known.length} known D1 cinemas)`)

    // --- 2) resolve each known cinema → District cinema id ----------------
    // Candidates are ranked by name tokens; acceptance is verified against
    // the cinema page's own coordinates (+ cityId) before use, so a wrong
    // token-tie (same brand, different neighbourhood) can never attach.
    const PROXIMITY_LIMIT_M = 10000 // District pins (and our seed pins) can be km off; wrong-neighbourhood matches measure 14 km+
    interface Verified { link: DistrictCinemaLink, ourVenue: KnownVenue }
    const accepted = new Map<string, Verified>()
    const unmatched: string[] = []
    const merged: ProviderLocationData = { venues: [], events: [], shows: [], pages }

    /** Fetch + parse one cinema page; null when fetch/parse fails (keep shows). */
    const fetchState = async (url: string): Promise<Record<string, unknown> | null> => {
      const res = await politeFetch(url, input.budget)
      pages.push({ url, status: res.status, ms: res.ms, bytes: res.bytes })
      if (res.blockedReason)
        throw new ProviderBlockedError(`cinema page blocked: ${res.blockedReason}`, res.status)
      if (res.status !== 200 || !res.body) {
        console.log(`[district] ${url}: HTTP ${res.status} ${res.statusText} — cinema skipped, existing shows preserved`)
        return null
      }
      try {
        const json = parseNextData(res.body, url)
        return serverStateFor(json, (url.match(/-cd(\d+)/i) ?? [])[1] ?? '') ?? null
      }
      catch (e) {
        console.log(`[district] ${url}: ${e} — cinema skipped, existing shows preserved`)
        return null
      }
    }

    /** Does the fetched cinema meta agree with our row (city + proximity)? */
    const verifies = (venue: KnownVenue, cinema: Record<string, unknown> | undefined, label: string): boolean => {
      if (!cinema) return false
      const pageCityId = idStr(cinema.cityId)
      if (cityId && pageCityId && pageCityId !== cityId) {
        console.log(`[district] ${label}: page cityId=${pageCityId} ≠ directory cityId=${cityId} — candidate rejected`)
        return false
      }
      const dLat = num(cinema.lat)
      const dLng = num(cinema.lon)
      if (venue.lat != null && venue.lng != null && dLat != null && dLng != null) {
        const m = distanceM(venue.lat, venue.lng, dLat, dLng)
        if (m > PROXIMITY_LIMIT_M) {
          console.log(`[district] ${label}: ${Math.round(m)} m away from our pin — candidate rejected (limit ${PROXIMITY_LIMIT_M} m)`)
          return false
        }
      }
      return true
    }

    for (const venue of known) {
      let done = false

      // Path A: stored District cinema id (previous verified sync)
      if (venue.districtCinemaId) {
        const link: DistrictCinemaLink = {
          districtId: venue.districtCinemaId,
          url: `${ORIGIN}/movies/x-in-${input.slug}-CD${venue.districtCinemaId}`,
          slug: 'x',
          tokens: new Set(),
        }
        if (accepted.has(venue.districtCinemaId)) { done = true; continue }
        await sleep(BETWEEN_FETCHES_MS)
        const state = await fetchState(`${link.url}?fromdate=${targetDate}`)
        const cinema = (state?.meta as Record<string, unknown> | undefined)?.cinema as Record<string, unknown> | undefined
        if (state && verifies(venue, cinema, `${venue.name} (stored CD${venue.districtCinemaId})`)) {
          accepted.set(venue.districtCinemaId, { link, ourVenue: venue })
          mergeCinema(state, link, venue)
          done = true
        }
        else if (state || cinema) {
          console.log(`[district] ${venue.name}: stored CD${venue.districtCinemaId} failed verification — treating as unmatched this run (fix the district_cinema_id row manually)`)
        }
      }
      if (done) continue

      // Path B: ranked name candidates from the city directory, verified by page coords
      const candidates = matchKnownVenueToCandidates(venue, links, input.slug).slice(0, MAX_CANDIDATES_PER_VENUE)
      for (const link of candidates) {
        if (accepted.has(link.districtId)) continue // already claimed by another our-cinema
        await sleep(BETWEEN_FETCHES_MS)
        const state = await fetchState(`${link.url}?fromdate=${targetDate}`)
        const cinema = (state?.meta as Record<string, unknown> | undefined)?.cinema as Record<string, unknown> | undefined
        if (state && verifies(venue, cinema, `${venue.name} ↔ ${link.slug}`)) {
          accepted.set(link.districtId, { link, ourVenue: venue })
          mergeCinema(state, link, venue)
          done = true
          break
        }
      }
      if (!done) unmatched.push(`${venue.name} (${venue.id})`)
    }
    for (const u of unmatched) console.log(`[district] ${input.slug}: unmatched cinema skipped (no confident District match): ${u}`)
    if (accepted.size > MAX_CINEMAS_PER_LOCATION)
      console.log(`[district] ${input.slug}: NOTE ${accepted.size} cinemas verified — above the polite cap ${MAX_CINEMAS_PER_LOCATION}, all processed anyway (cap is advisory)`)

    /** Normalize one VERIFIED cinema page into the merged payload. */
    function mergeCinema(state: Record<string, unknown>, link: DistrictCinemaLink, ourVenue: KnownVenue): void {
      const meta = state.meta as Record<string, unknown> | undefined
      const cinema = meta?.cinema as Record<string, unknown> | undefined
      const arranged = Array.isArray(state.arrangedSessions) ? (state.arrangedSessions as Record<string, unknown>[]) : []
      const cinemaName = str(cinema?.name) ?? `District cinema CD${link.districtId}`
      console.log(`[district] CD${link.districtId} "${cinemaName}" ↔ ${ourVenue.name}: ${arranged.length} movie group(s) for ${targetDate}`)

      merged.venues.push({
        code: link.districtId,
        name: cinemaName,
        address: str(cinema?.address),
        districtId: link.districtId,
        lat: num(cinema?.lat),
        lng: num(cinema?.lon),
        matchedVenueId: ourVenue.id,
      })

      for (const group of arranged) {
        const gdata = (group.data ?? {}) as Record<string, unknown>
        const movieId = idStr(group.entityCode) ?? idStr(gdata.contentId)
        const title = str(group.entityName) ?? str(gdata.name)
        if (!movieId || !title) continue
        const langGroups = Array.isArray(gdata.languageFormatGroups)
          ? (gdata.languageFormatGroups as { lang?: unknown }[])
          : []
        const languages = [...new Set(langGroups.map(l => str(l.lang)).filter((x): x is string => !!x))]

        let kept = 0
        const sessions = Array.isArray(group.sessions) ? (group.sessions as DistrictSession[]) : []
        for (const s of sessions) {
          const sid = str(s.sid)
          const wall = splitWallClock(s.showTime)
          if (!sid || !wall || wall.date !== targetDate) continue // today (IST) only
          merged.shows.push({
            venueCode: link.districtId,
            eventCode: movieId,
            show: {
              sessionId: sid,
              showDate: wall.date,
              showTime: wall.time,
              showDateTime: wall.full, // local wall clock — stored verbatim
              availabilityStatus: normalizeAvailability(s),
              format: str(s.scrnFmt),
              language: str(s.lang) ?? languages[0],
              screen: str(s.audi),
            },
          })
          kept++
        }
        if (kept > 0 && !merged.events.some(e => e.code === movieId)) {
          merged.events.push({
            code: movieId,
            title,
            language: languages[0],
            durationMin: num(gdata.duration),
            posterUrl: str(gdata.appImgPath) ?? str(gdata.imgPath),
          })
        }
      }
    }

    merged.pages = pages
    return merged
  }
}
