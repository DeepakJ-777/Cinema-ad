/**
 * Defensive normalizer for the BMS `showtimes-by-event/primary-dynamic`
 * response into our own model. Built against the documented structure
 * (venueCode/venueName/showtimes[]/{showTime,showTimeCode,showDateTime,
 * sessionId,availStatus,format/attributes}); it never received a live 200
 * sample because the endpoint challenges non-browser clients, so it walks the
 * JSON structurally instead of trusting exact paths. Raw JSON is never stored.
 */

import type { ProviderEvent, ProviderLocationData, ProviderShow, ProviderShowLink, ProviderVenue } from './provider'

const pick = (o: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return undefined
}

/** '10:45 PM' → '22:45'; returns undefined when unparseable. */
export function to24h(t?: string): string | undefined {
  if (!t) return undefined
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!m) return undefined
  let h = Number(m[1])
  const min = m[2]
  const ap = m[3]?.toUpperCase()
  if (ap === 'PM' && h < 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${min}`
}

/** ISO-ish '2026-08-16T22:45:00' (± offsets) → { date: '2026-08-16', time: '22:45' }. */
export function parseIsoDateTime(iso?: string): { date: string, time: string } | undefined {
  if (!iso) return undefined
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return undefined
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` }
}

/** dateCode '20260816' → '2026-08-16'. */
export const dateCodeToIso = (dc: string): string | undefined =>
  /^\d{8}$/.test(dc) ? `${dc.slice(0, 4)}-${dc.slice(4, 6)}-${dc.slice(6, 8)}` : undefined

function formatOf(show: Record<string, unknown>): string | undefined {
  const direct = pick(show, 'format', 'showFormat', 'dimensionalFormat')
  if (direct) return direct
  const attrs = show.attributes ?? show.showAttributes ?? show.attr
  if (Array.isArray(attrs)) {
    const words = attrs
      .map(a => (typeof a === 'string' ? a : pick(a as Record<string, unknown>, 'text', 'name', 'value', 'description')))
      .filter((x): x is string => !!x)
    if (words.length) return words.slice(0, 3).join(' · ')
  }
  return undefined
}

interface WalkCtx { venueCode?: string, eventCode?: string }

/**
 * Structural walk: an object with venueCode+venueName starts a venue scope;
 * an object with sessionId (+ a time field) is a show. Anything else is
 * traversed. This survives reasonable shape drift around the documented core.
 */
export function normalizeShowtimesResponse(json: unknown, fallbackDateIso: string, fallbackEventCode: string, fallbackEventTitle?: string): ProviderLocationData {
  const venues = new Map<string, ProviderVenue>()
  const events = new Map<string, ProviderEvent>()
  const shows: ProviderShowLink[] = []
  const seen = new Set<unknown>()

  const walk = (node: unknown, ctx: WalkCtx, depth: number): void => {
    if (depth > 10 || node == null || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) {
      for (const item of node) walk(item, ctx, depth + 1)
      return
    }
    const o = node as Record<string, unknown>

    const venueCode = pick(o, 'venueCode', 'VenueCode', 'venue_code')
    const venueName = pick(o, 'venueName', 'VenueName', 'venue_name')
    if (venueCode && venueName) {
      if (!venues.has(venueCode))
        venues.set(venueCode, { code: venueCode, name: venueName, address: pick(o, 'venueAddress', 'address', 'Address') })
      ctx = { ...ctx, venueCode }
    }

    const eventCode = pick(o, 'eventCode', 'EventCode', 'event_code', 'code', 'etCode')
    const eventTitle = pick(o, 'eventTitle', 'EventName', 'title', 'Title', 'name')
    if (eventCode && eventTitle && !events.has(eventCode))
      events.set(eventCode, { code: eventCode, title: eventTitle, language: pick(o, 'language', 'Language', 'eventLanguage') })
    if (eventCode) ctx = { ...ctx, eventCode }

    const sessionId = pick(o, 'sessionId', 'SessionId', 'session_id', 'sessionID')
    const showTime12 = pick(o, 'showTime', 'ShowTime', 'show_time')
    const showDateTime = pick(o, 'showDateTime', 'ShowDateTime', 'show_date_time')
    if (sessionId && (showTime12 || showDateTime)) {
      const iso = parseIsoDateTime(showDateTime)
      const show: ProviderShow = {
        sessionId,
        showDate: iso?.date ?? dateCodeToIso(pick(o, 'dateCode', 'DateCode') ?? '') ?? fallbackDateIso,
        showTime: iso?.time ?? to24h(showTime12) ?? '',
        showTimeCode: pick(o, 'showTimeCode', 'ShowTimeCode', 'show_time_code'),
        showDateTime,
        availabilityStatus: pick(o, 'availStatus', 'avail_status', 'availabilityStatus', 'availability', 'status') ?? 'unknown',
        format: formatOf(o),
        language: pick(o, 'language', 'Language'),
      }
      const venueCode2 = ctx.venueCode
      const eventCode2 = ctx.eventCode ?? fallbackEventCode
      if (venueCode2 && show.showTime) shows.push({ venueCode: venueCode2, eventCode: eventCode2, show })
    }

    for (const v of Object.values(o)) walk(v, ctx, depth + 1)
  }

  walk(json, {}, 0)

  if (!events.size && fallbackEventCode)
    events.set(fallbackEventCode, { code: fallbackEventCode, title: fallbackEventTitle ?? fallbackEventCode })

  return { venues: [...venues.values()], events: [...events.values()], shows, pages: [] }
}
