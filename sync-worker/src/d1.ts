/**
 * D1 persistence for normalized provider data. Raw provider JSON is never
 * stored — only the normalized model columns.
 *
 * Cinema matching:
 *   1. Provider-supplied matchedVenueId (District drives discovery FROM our
 *      D1 cinemas, so it already knows the row) — verified to exist in-city.
 *   2. Stored provider ids: district_cinema_id for District venues.
 *   3. Normalized-name match within the same city (token/containment).
 *   4. Geographic proximity (≤500 m) when the venue carries coordinates.
 *   Venues without a confident match are skipped and logged — provider venues
 *   without coordinates must never become phantom 0,0 pins.
 *
 * Stale cleanup is PER CINEMA: only shows of cinemas this run refreshed (page
 * fetched OK) are eligible, so a failed fetch never deletes valid shows. Shows
 * referenced by ad_reports are always preserved (community history).
 */

import type { ProviderLocationData, ProviderVenue } from './provider'

// Minimal structural D1 types (no @cloudflare/workers-types dependency needed).
export interface D1Result<T = unknown> { results: T[]; meta: { changes?: number } }
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}
export interface D1Database { prepare(sql: string): D1PreparedStatement }

export interface LocationWriteResult {
  moviesUpserted: number
  venuesMatched: string[] // venue code → cinema id
  venuesUnmatched: { code: string, name: string }[]
  showsUpserted: number
  staleShowsDeleted: number
  staleKeptReferenced: number
}

const PROVIDER_PREFIX: Record<string, string> = { bookmyshow: 'bms', district: 'district' }
/** Fixture runs persist as their real-provider counterpart ('bookmyshow') so
 *  row ids and the source column stay stable across fixture/live runs — the
 *  contract fixture.ts documents (its summary/log id stays 'bookmyshow-fixture'). */
const persistProviderId = (providerId: string) =>
  providerId.endsWith('-fixture') ? providerId.slice(0, -'-fixture'.length) : providerId
const prefixFor = (providerId: string) => PROVIDER_PREFIX[providerId] ?? providerId.replace(/[^a-z0-9]/g, '')

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Same physical cinema? Normalized-name equality or ≥4-char containment. */
function sameCinemaName(a: string, b: string): boolean {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return false
  return x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Deterministic hue per title so provider movies keep the UI's color wheel. */
function hueOf(title: string): number {
  let h = 0
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

interface ExistingCinema {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  district_cinema_id: string | null
}

export async function writeLocationShows(
  db: D1Database,
  citySlug: string,
  providerId: string,
  data: ProviderLocationData,
  runStartedAtSec: number,
): Promise<LocationWriteResult> {
  const now = Math.floor(Date.now() / 1000)
  const pid = persistProviderId(providerId)
  const prefix = prefixFor(pid)
  const result: LocationWriteResult = {
    moviesUpserted: 0, venuesMatched: [], venuesUnmatched: [],
    showsUpserted: 0, staleShowsDeleted: 0, staleKeptReferenced: 0,
  }

  // --- movies (by provider movie id; no title-matching against seeds) ---
  for (const ev of data.events) {
    await db.prepare(
      `INSERT INTO movies (id, title, language, duration_min, hue, emoji, poster_url, event_code, source, created_at)
       VALUES (?, ?, ?, ?, ?, '🎬', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         duration_min = CASE WHEN excluded.duration_min > 0 THEN excluded.duration_min ELSE movies.duration_min END`,
    ).bind(
      `${prefix}-${ev.code}`, ev.title, ev.language ?? 'unknown', ev.durationMin ?? 0,
      hueOf(ev.title), ev.posterUrl ?? null, ev.code, pid, now,
    ).run()
    result.moviesUpserted++
  }

  // --- cinemas: resolve provider venues against existing rows in this city --
  const existing = (await db.prepare(
    'SELECT id, name, latitude, longitude, district_cinema_id FROM cinemas WHERE city = ?',
  ).bind(citySlug).all<ExistingCinema>()).results ?? []
  const existingById = new Map(existing.map(c => [c.id, c]))
  const cinemaIdByVenue = new Map<string, string>()

  const attach = async (venue: ProviderVenue, hit: ExistingCinema) => {
    cinemaIdByVenue.set(venue.code, hit.id)
    result.venuesMatched.push(`${venue.name} (${venue.code}) → ${hit.id} "${hit.name}"`)
    if (venue.districtId && hit.district_cinema_id !== venue.districtId)
      await db.prepare('UPDATE cinemas SET district_cinema_id = ? WHERE id = ?').bind(venue.districtId, hit.id).run()
    else if (!venue.districtId)
      await db.prepare('UPDATE cinemas SET venue_code = ? WHERE id = ? AND venue_code IS NULL').bind(venue.code, hit.id).run()
    // Stamp the cinema: a provider page was fetched for it successfully.
    await db.prepare('UPDATE cinemas SET last_synced_at = ? WHERE id = ?').bind(now, hit.id).run()
  }

  for (const venue of data.venues) {
    // 1) provider-resolved our-cinema id (District), verified in-city
    if (venue.matchedVenueId) {
      const hit = existingById.get(venue.matchedVenueId)
      if (hit) {
        await attach(venue, hit)
        continue
      }
    }
    // 2) stored District cinema id
    if (venue.districtId) {
      const hit = existing.find(c => c.district_cinema_id === venue.districtId)
      if (hit) {
        await attach(venue, hit)
        continue
      }
    }
    // 3) normalized name within the city
    const byName = existing.find(c => sameCinemaName(c.name, venue.name))
    if (byName) {
      await attach(venue, byName)
      continue
    }
    // 4) geographic proximity (≤500 m) when both carry coordinates
    if (venue.lat != null && venue.lng != null) {
      const near = existing
        .filter(c => c.latitude != null && c.longitude != null)
        .map(c => ({ c, m: haversineM(venue.lat!, venue.lng!, c.latitude!, c.longitude!) }))
        .sort((a, b) => a.m - b.m)[0]
      if (near && near.m <= 500) {
        console.log(`[d1] proximity match: ${venue.name} (${venue.code}) ↔ ${near.c.id} "${near.c.name}" (${Math.round(near.m)} m)`)
        await attach(venue, near.c)
        continue
      }
    }
    result.venuesUnmatched.push({ code: venue.code, name: venue.name })
  }

  // --- shows (idempotent by provider session id) ---
  for (const link of data.shows) {
    const cinemaId = cinemaIdByVenue.get(link.venueCode)
    if (!cinemaId) continue // venue unmatched — logged above
    await db.prepare(
      `INSERT INTO shows (id, cinema_id, movie_id, show_date, start_time, format, screen,
                          session_id, show_time_code, show_date_time, availability_status,
                          language, source, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         availability_status = excluded.availability_status,
         format = excluded.format,
         screen = excluded.screen,
         language = excluded.language,
         last_synced_at = excluded.last_synced_at`,
    ).bind(
      `${prefix}-${link.show.sessionId.includes('__') ? `${cinemaId}-${link.show.sessionId}` : link.show.sessionId}`,
      cinemaId, `${prefix}-${link.eventCode}`,
      link.show.showDate, link.show.showTime, link.show.format ?? '', link.show.screen ?? '',
      link.show.sessionId, link.show.showTimeCode ?? null, link.show.showDateTime ?? null,
      link.show.availabilityStatus, link.show.language ?? null, pid, now,
    ).run()
    result.showsUpserted++
  }

  // --- stale cleanup: PER CINEMA, only cinemas this run refreshed ----------
  // A venue in venuesMatched means its provider page was fetched successfully
  // this run; shows of that cinema not refreshed are gone from the provider.
  // Failed/unmatched cinemas keep their shows; ad_reports references always win.
  const refreshedIds = [...new Set([...cinemaIdByVenue.values()])]
  if (refreshedIds.length > 0) {
    try {
      const r = await db.prepare(
        `DELETE FROM shows
         WHERE source = ?
           AND last_synced_at IS NOT NULL AND last_synced_at < ?
           AND cinema_id IN (${refreshedIds.map(() => '?').join(',')})
           AND id NOT IN (SELECT show_id FROM ad_reports WHERE show_id IS NOT NULL)`,
      ).bind(pid, runStartedAtSec, ...refreshedIds).run()
      result.staleShowsDeleted = r.meta.changes ?? 0
    }
    catch {
      const kept = await db.prepare(
        `SELECT COUNT(*) AS n FROM shows
         WHERE source = ? AND last_synced_at < ?
           AND cinema_id IN (${refreshedIds.map(() => '?').join(',')})`,
      ).bind(pid, runStartedAtSec, ...refreshedIds).first<{ n: number }>()
      result.staleKeptReferenced = kept?.n ?? 0
    }
  }

  return result
}
