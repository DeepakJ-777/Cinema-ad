/**
 * Minimal geohash encoder (no deps) — used to key the near-me discovery
 * cache. Precision 4 gives cells of roughly 20–40 km, a good match for
 * the default 25 km lookup radius.
 */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

export function geohashEncode(lat: number, lng: number, precision = 4): string {
  let latMin = -90
  let latMax = 90
  let lngMin = -180
  let lngMax = 180
  let hash = ''
  let bit = 0
  let ch = 0
  let isEven = true

  while (hash.length < precision) {
    if (isEven) {
      const mid = (lngMin + lngMax) / 2
      if (lng >= mid) {
        ch = (ch << 1) + 1
        lngMin = mid
      }
      else {
        ch = ch << 1
        lngMax = mid
      }
    }
    else {
      const mid = (latMin + latMax) / 2
      if (lat >= mid) {
        ch = (ch << 1) + 1
        latMin = mid
      }
      else {
        ch = ch << 1
        latMax = mid
      }
    }
    isEven = !isEven
    if (bit < 4) {
      bit++
    }
    else {
      hash += BASE32[ch]
      bit = 0
      ch = 0
    }
  }
  return hash
}
