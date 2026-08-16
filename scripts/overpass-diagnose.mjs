/**
 * Dev-only Overpass diagnostic. Replicates server/api/cinemas/near.get.ts
 * fetchOverpass() exactly (same query, headers, timeout) but logs everything:
 * endpoint, HTTP status, headers, body preview, abort/network/JSON errors.
 *
 * Usage: node scripts/overpass-diagnose.mjs [lat lng [radiusKm]]
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const OVERPASS_UA = 'CinemaCommunity/1.0 (community cinema start-times app; dev prototype)'

const lat = Number(process.argv[2] ?? 29.795) // default: center of user's geohash cell t9wm (Libya)
const lng = Number(process.argv[3] ?? 18.109)
const radiusKm = Number(process.argv[4] ?? 25)
const radiusM = radiusKm * 1000

const query = `[out:json][timeout:25];(node["amenity"="cinema"](around:${Math.round(radiusM)},${lat},${lng});way["amenity"="cinema"](around:${Math.round(radiusM)},${lat},${lng}););out center;`

console.log(`\n=== Overpass diagnostic ===`)
console.log(`coords: ${lat},${lng}  radius: ${radiusKm}km`)
console.log(`query : ${query}\n`)

for (const endpoint of OVERPASS_ENDPOINTS) {
  console.log(`[overpass] endpoint    : ${endpoint}`)
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12_000)
    const t0 = Date.now()
    const res = await fetch(endpoint, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': OVERPASS_UA,
      },
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    console.log(`[overpass] HTTP status : ${res.status} ${res.statusText} (${Date.now() - t0}ms)`)
    console.log(`[overpass] content-type: ${res.headers.get('content-type')}`)
    const text = await res.text()
    console.log(`[overpass] body preview: ${text.slice(0, 400).replace(/\n/g, ' ')}`)
    try {
      const json = JSON.parse(text)
      const els = json.elements ?? []
      const named = els.filter(e => e.tags?.name || e.tags?.['name:en'])
      const withCoords = els.filter(e =>
        Number.isFinite(e.lat ?? e.center?.lat) && Number.isFinite(e.lon ?? e.center?.lon))
      console.log(`[overpass] elements=${els.length} named=${named.length} withCoords=${withCoords.length}`)
      for (const e of named.slice(0, 10))
        console.log(`           - ${e.tags?.name || e.tags?.['name:en']} (${e.type}/${e.id}) @ ${e.lat ?? e.center?.lat},${e.lon ?? e.center?.lon}`)
    }
    catch (pe) {
      console.log(`[overpass] JSON parse error: ${pe}`)
    }
  }
  catch (e) {
    console.log(`[overpass] error       : ${e?.name}: ${e?.message}${e?.cause ? ` (cause: ${e.cause})` : ''}`)
  }
  console.log('')
}
