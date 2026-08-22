import { sql } from 'drizzle-orm'
import { createError, defineEventHandler, getQuery, getRequestIP } from 'h3'
import { getDb } from '../../utils/db'
import { allowRequest } from '../../utils/rate-limit'
import { cinemas as cinemasTable, discoveryCache } from '../../database/schema'
import { geohashEncode } from '../../utils/geohash'

/**
 * Near-me cinema lookup — cache-first ("Discover → save to D1 → reuse"):
 *
 *  1. Serve every request from D1 (cinemas already known near the user).
 *  2. Only sweep OpenStreetMap (Overpass) when the user's ~25 km geohash cell
 *     has not been checked within the TTL — then persist new cinemas and mark
 *     the cell. Repeat presses reuse D1 and never re-hit Overpass.
 *
 * Radius is configurable: `?radius=` query (km, 1–100) or the NEAR_RADIUS_KM
 * env var / Workers binding; default 25 km.
 *
 * Data © OpenStreetMap contributors (ODbL) — attributed in the site footer.
 */

// Mirrors ordered by observed reliability from this deployment's network.
// Sequential with early return: a sweep touches at most one healthy mirror,
// and the discovery cache caps sweeps at one per cell per week, so we stay
// comfortably within the public instances' rate limits.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const OVERPASS_UA = 'CinemaCommunity/1.0 (community cinema start-times app; dev prototype)'
// 20 s per mirror: the slowest healthy mirror measured ~11 s for a 25 km
// cinema query; 12 s was cutting it off. The query itself caps at [timeout:25].
const OVERPASS_TIMEOUT_MS = 20_000
const DEFAULT_RADIUS_KM = 25
const CACHE_TTL_S = 7 * 24 * 3600 // one sweep per cell per week
// D1 allows at most 100 bound parameters per statement; rows carry 7 columns,
// so 10 rows/statement keeps a wide margin. A single multi-row INSERT with a
// full sweep (~30 cinemas) would exceed the cap and fail on real D1.
const INSERT_CHUNK = 10

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Same physical cinema? Within 250 m and one normalized name contains the other. */
function sameCinema(aName: string, aLat: number, aLng: number, bName: string, bLat: number, bLng: number): boolean {
  if (haversineM(aLat, aLng, bLat, bLng) > 250) return false
  const x = norm(aName)
  const y = norm(bName)
  if (!x || !y) return false
  return x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))
}

interface OverpassAttempt {
  endpoint: string
  ok: boolean
  status?: number
  error?: string
  ms: number
}

/**
 * Query every public Overpass mirror in order until one answers with JSON.
 * Returns `{ elements, attempts }` on success (elements may legitimately be
 * empty when OSM has no mapped cinemas in the area), or null when every
 * mirror failed. All failures are logged server-side, never swallowed.
 */
async function fetchOverpass(
  lat: number,
  lng: number,
  radiusM: number
): Promise<{ elements: any[]; attempts: OverpassAttempt[] } | null> {
  // `out center` gives nodes their lat/lon and ways/relations a usable centroid.
  const query = `[out:json][timeout:25];(node["amenity"="cinema"](around:${Math.round(radiusM)},${lat},${lng});way["amenity"="cinema"](around:${Math.round(radiusM)},${lat},${lng});relation["amenity"="cinema"](around:${Math.round(radiusM)},${lat},${lng}););out center;`
  const attempts: OverpassAttempt[] = []

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const t0 = Date.now()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const ctrl = new AbortController()
      timer = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS)
      const res = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          // Overpass rejects generic client UAs with 406 — identify ourselves.
          'user-agent': OVERPASS_UA,
        },
        signal: ctrl.signal,
      })
      const ms = Date.now() - t0

      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ')
        console.log(
          `[overpass] endpoint=${endpoint} HTTP ${res.status} ${res.statusText} (${ms}ms) `
          + `retry-after=${res.headers.get('retry-after') ?? '-'} body="${body}" — trying next mirror`
        )
        attempts.push({ endpoint, ok: false, status: res.status, ms })
        continue
      }

      const text = await res.text()
      let json: any
      try {
        json = JSON.parse(text)
      }
      catch (pe) {
        const preview = text.slice(0, 200).replace(/\s+/g, ' ')
        console.log(`[overpass] endpoint=${endpoint} HTTP 200 (${ms}ms) JSON parse failed: ${pe} body="${preview}" — trying next mirror`)
        attempts.push({ endpoint, ok: false, status: 200, error: `bad-json: ${String(pe)}`, ms })
        continue
      }

      const elements: any[] = json.elements ?? []
      console.log(`[overpass] endpoint=${endpoint} HTTP 200 (${ms}ms) elements=${elements.length}`)
      attempts.push({ endpoint, ok: true, status: 200, ms })
      return { elements, attempts }
    }
    catch (e: any) {
      const ms = Date.now() - t0
      const reason = `${e?.name ?? 'Error'}: ${e?.message ?? '?'}${e?.cause ? ` (cause: ${e.cause})` : ''}`
      console.log(`[overpass] endpoint=${endpoint} error=${reason} (${ms}ms) — trying next mirror`)
      attempts.push({ endpoint, ok: false, error: reason, ms })
    }
    finally {
      if (timer) clearTimeout(timer)
    }
  }

  console.log(`[overpass] all ${OVERPASS_ENDPOINTS.length} mirrors failed for ${lat.toFixed(3)},${lng.toFixed(3)} r=${Math.round(radiusM)}m`)
  return null
}

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const lat = Number(q.lat)
  const lng = Number(q.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    throw createError({ statusCode: 400, statusMessage: 'Invalid coordinates' })

  if (!allowRequest(`near:${getRequestIP(event, { xForwardedFor: true }) || 'anon'}`, 5, 60_000))
    throw createError({ statusCode: 429, statusMessage: 'Too many location lookups — try again shortly' })

  // Radius precedence: ?radius= query → NEAR_RADIUS_KM env/binding → 25 km
  const env = (event.context as any)?.cloudflare?.env
  const envRadius = Number(env?.NEAR_RADIUS_KM ?? process.env?.NEAR_RADIUS_KM)
  const queryRadius = Number(q.radius)
  const pick = (v: number) => (Number.isFinite(v) && v > 0 ? Math.min(100, Math.max(1, v)) : null)
  const radiusKm = pick(queryRadius) ?? pick(envRadius) ?? DEFAULT_RADIUS_KM
  const radiusM = radiusKm * 1000

  const db = await getDb(event)

  // Everything already known — this is the "reuse" path
  const known = (await db.all(sql`SELECT id, name, address, city, latitude, longitude FROM cinemas`)) as any[]

  // Discovery cache: has this ~25 km cell been swept recently?
  const cell = geohashEncode(lat, lng, 4)
  const cached = (await db.all(sql`SELECT checked_at AS checkedAt FROM discovery_cache WHERE geohash = ${cell}`))[0] as any
  const cacheFresh = cached != null && Number(cached.checkedAt) > Math.floor(Date.now() / 1000) - CACHE_TTL_S

  let added = 0
  let source: 'cache' | 'live' | 'unavailable' = 'cache'

  // Pipeline counters — logged server-side, echoed to the client in dev only.
  const diag = {
    d1KnownCount: known.length,
    cacheCell: cell,
    cacheFresh,
    overpassElements: 0,
    withName: 0,
    withCoords: 0,
    duplicatesRemoved: 0,
    parsedCandidates: 0,
    inserted: 0,
    insertErrors: [] as string[],
    attempts: [] as OverpassAttempt[],
  }

  if (!cacheFresh) {
    const result = await fetchOverpass(lat, lng, radiusM)
    diag.attempts = result?.attempts ?? []

    if (result) {
      source = 'live'
      const elements = result.elements
      diag.overpassElements = elements.length

      const candidates: any[] = []
      for (const el of elements) {
        const name: string | undefined = el.tags?.name || el.tags?.['name:en']
        const elLat = el.lat ?? el.center?.lat
        const elLng = el.lon ?? el.center?.lon
        if (name) diag.withName++
        if (Number.isFinite(elLat) && Number.isFinite(elLng)) diag.withCoords++
        if (!name || !Number.isFinite(elLat) || !Number.isFinite(elLng)) continue

        const dup = [...known, ...candidates].some(c =>
          sameCinema(c.name, c.latitude, c.longitude, name, elLat, elLng))
        if (dup) {
          diag.duplicatesRemoved++
          continue
        }

        const t = el.tags ?? {}
        const addressParts = [
          t['addr:housenumber'],
          t['addr:street'],
          t['addr:suburb'],
          t['addr:city'] || t['addr:town'],
          t['addr:postcode'],
        ].filter(Boolean)

        candidates.push({
          id: `osm-${el.type}-${el.id}`,
          name: name.slice(0, 120),
          address: (addressParts.join(', ') || '').slice(0, 200),
          city: (t['addr:city'] || t['addr:town'] || t['addr:state'] || '').slice(0, 60),
          latitude: elLat,
          longitude: elLng,
          source: 'osm', // discovered via OpenStreetMap, not seed/provider data
        })
      }
      diag.parsedCandidates = candidates.length

      if (candidates.length) {
        // Chunked inserts: one multi-row statement per ≤10 rows keeps the bound
        // parameter count under D1's 100-parameter ceiling.
        const rows = candidates.map(c => ({ ...c, createdAt: new Date() }))
        let insertedRows: any[] = []
        for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
          const chunk = rows.slice(i, i + INSERT_CHUNK)
          try {
            await db.insert(cinemasTable).values(chunk).onConflictDoNothing()
            insertedRows = insertedRows.concat(chunk)
          }
          catch (ie: any) {
            const msg = `chunk ${Math.floor(i / INSERT_CHUNK)}: ${ie?.message ?? String(ie)}`
            diag.insertErrors.push(msg)
            console.log(`[near] D1 insert failed for ${msg}`)
          }
        }
        known.push(...insertedRows)
        added = insertedRows.length
        diag.inserted = insertedRows.length
        console.log(
          `[near] cell=${cell} coords=${lat.toFixed(3)},${lng.toFixed(3)} `
          + `elements=${elements.length} named=${diag.withName} coords=${diag.withCoords} `
          + `candidates=${candidates.length} dups=${diag.duplicatesRemoved} inserted=${added}`
          + (diag.insertErrors.length ? ` insertErrors=${diag.insertErrors.length}` : '')
        )
      }

      // Mark the cell as swept only when the sweep *and* persistence succeeded —
      // a partial/failed insert stays retryable on the next press.
      if (diag.insertErrors.length === 0) {
        await db.insert(discoveryCache)
          .values({ geohash: cell, lat, lng, checkedAt: new Date() })
          .onConflictDoUpdate({
            target: discoveryCache.geohash,
            set: { lat, lng, checkedAt: new Date() },
          })
      }
    }
    else {
      source = 'unavailable' // every mirror failed — serve D1-only results, cache stays retryable
    }
  }

  // Nearby set from D1 (post-discovery), nearest first
  const withDist = known
    .map(c => ({ c, m: haversineM(lat, lng, c.latitude, c.longitude) }))
    .filter(x => x.m <= radiusM)
    .sort((a, b) => a.m - b.m)

  return {
    ok: true,
    source, // 'cache' (reused D1) | 'live' (Overpass swept) | 'unavailable'
    added,
    radiusKm,
    cell,
    nearbyCount: withDist.length,
    cinemas: withDist.slice(0, 50).map(({ c, m }) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      address: c.address,
      lat: c.latitude,
      lng: c.longitude,
      distanceKm: Math.round(m / 100) / 10,
    })),
    // Dev-only pipeline diagnostics — never shipped in the production build.
    ...(import.meta.dev ? { diagnostics: diag } : {}),
  }
})
