/**
 * BookMyShowProvider — the ONLY module that knows about BookMyShow.
 *
 * Current status (verified 2026-08-16, honest UA, plain GET):
 *   The showtimes endpoint the browser uses —
 *   /api/movies-data/v5/showtimes-by-event/primary-dynamic — is guarded by a
 *   Cloudflare *managed challenge* for non-browser clients (403 "Just a
 *   moment…"), with occasional application-level 400 rejections when a
 *   request slips past Cloudflare. That is an access control: per project
 *   policy this provider makes ONE attempt, classifies the refusal, and
 *   raises ProviderBlockedError. It never retries, never strips/spoofs
 *   headers, never solves challenges.
 *
 * When authorized access exists (official API key / partnership), plug the
 * credentials into `fetchShowtimes()` and everything downstream (normalizer,
 * D1 writer, stale cleanup) already works unchanged.
 */

import { politeFetch, sleep } from './http'
import { normalizeShowtimesResponse } from './normalize'
import { ProviderBlockedError, type ProviderInput, type ProviderLocationData, type ShowtimeProvider } from './provider'

const BMS_ORIGIN = 'https://in.bookmyshow.com'
const SHOWTIMES_ENDPOINT = `${BMS_ORIGIN}/api/movies-data/v5/showtimes-by-event/primary-dynamic`
/** How many events per location per day — keeps total volume tiny. */
const MAX_EVENTS_PER_LOCATION = 10
const BETWEEN_FETCHES_MS = 2500

/** SSR'd movie anchors on the public explore page (robots-allowed, verified 200). */
function extractEventCodes(html: string): { code: string, title: string }[] {
  const out = new Map<string, { code: string, title: string }>()
  const re = /<a[^>]*href="[^"]*\/movies\/([a-z0-9][a-z0-9-]*)\/?(ET\d+)?[^"]*"[^>]*>([^<]{2,120})</gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && out.size < MAX_EVENTS_PER_LOCATION) {
    const title = m[3].trim()
    // Only entries with an ET code are syncable via the showtimes endpoint.
    if (title && m[2] && !out.has(m[2])) out.set(m[2], { code: m[2], title })
  }
  return [...out.values()]
}

export class BookMyShowProvider implements ShowtimeProvider {
  readonly id = 'bookmyshow'

  async syncLocation(input: ProviderInput): Promise<ProviderLocationData> {
    // 1) Discover today's event codes from the public now-showing page.
    const listing = await politeFetch(`${BMS_ORIGIN}/explore/movies-${input.slug}`, input.budget)
    if (listing.skipped) throw new ProviderBlockedError(`event discovery skipped: ${listing.skipped}`)
    if (listing.blockedReason) throw new ProviderBlockedError(`event discovery blocked: ${listing.blockedReason}`, listing.status)
    const events = listing.body ? extractEventCodes(listing.body) : []
    const pages = [{ url: listing.url, status: listing.status, ms: listing.ms, bytes: listing.bytes }]
    if (!events.length) return { venues: [], events: [], shows: [], pages }

    // 2) Ask the showtimes endpoint for each event (single attempt, no retries).
    const merged: ProviderLocationData = { venues: [], events: [], shows: [], pages }
    for (const ev of events) {
      await sleep(BETWEEN_FETCHES_MS)
      const url = new URL(SHOWTIMES_ENDPOINT)
      for (const [k, v] of Object.entries({
        etCodes: ev.code,
        dateCode: input.dateCode,
        isDesktop: 'false',
        regionCode: input.regionCode,
        xLocationShared: 'false',
        appCode: 'WEBV2',
        refEventCode: ev.code,
      }))
        url.searchParams.set(k, v)

      const res = await politeFetch(url.toString(), input.budget, 'application/json')
      pages.push({ url: SHOWTIMES_ENDPOINT, status: res.status, ms: res.ms, bytes: res.bytes })

      if (res.blockedReason) {
        // Access-control refusal — stop the whole provider run, exactly as found.
        throw new ProviderBlockedError(`showtimes endpoint: ${res.blockedReason}`, res.status)
      }
      if (res.status !== 200 || !res.body) {
        // Application-level rejection (e.g. 400 errorCode 1a.1m.1002) — the
        // provider is refusing this client; treat as blocked, don't param-shop.
        throw new ProviderBlockedError(
          `showtimes endpoint refused the request: HTTP ${res.status} ${res.statusText} — body: "${(res.body ?? '').slice(0, 160).replace(/\s+/g, ' ')}"`,
          res.status,
        )
      }

      let json: unknown
      try { json = JSON.parse(res.body) }
      catch (e) {
        throw new ProviderBlockedError(`showtimes endpoint returned unparseable JSON: ${e}`)
      }

      const normalized = normalizeShowtimesResponse(json, input.dateCode, ev.code, ev.title)
      for (const v of normalized.venues) if (!merged.venues.some(x => x.code === v.code)) merged.venues.push(v)
      for (const ev2 of normalized.events) if (!merged.events.some(x => x.code === ev2.code)) merged.events.push(ev2)
      merged.shows.push(...normalized.shows)
    }
    merged.pages = pages
    return merged
  }
}
