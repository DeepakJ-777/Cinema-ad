/**
 * Dev-only connectivity probe for the BMS showtimes data endpoint that the
 * normal browser page calls. ONE request per invocation, honest UA, no
 * cookies/headers spoofing. Reports status + structure for the sync design.
 *
 * Usage: node scripts/bms-api-probe.mjs [etCodes] [regionCode] [dateCode]
 */
import { writeFileSync } from 'node:fs'

const etCodes = process.argv[2] || 'ET00439318'
const regionCode = process.argv[3] || 'KOCH'
const dateCode = process.argv[4] || new Date().toISOString().slice(0, 10).replaceAll('-', '')

const UA = 'CinemaCommunity-BMSSync-PoC/0.1 (community cinema start-times app; contact: dev@example.com)'
const url = new URL('https://in.bookmyshow.com/api/movies-data/v5/showtimes-by-event/primary-dynamic')
for (const [k, v] of Object.entries({
  etCodes,
  dateCode,
  isDesktop: 'false',
  regionCode,
  xLocationShared: 'false',
  memberId: '',
  lsId: '',
  subCode: '',
  appCode: 'WEBV2',
  language: 'hindi',
  refEventCode: etCodes,
}))
  url.searchParams.set(k, v)

console.log(`GET ${url.toString()}\n  UA: ${UA}`)
const t0 = Date.now()
const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
const text = await res.text().catch(() => '')
console.log(`  status: ${res.status} ${res.statusText} (${Date.now() - t0}ms, ${text.length} bytes)`)
console.log(`  content-type: ${res.headers.get('content-type')}`)
for (const h of ['server', 'cf-ray', 'cf-mitigated', 'retry-after'])
  if (res.headers.get(h)) console.log(`  ${h}: ${res.headers.get(h)}`)

if (res.status !== 200) {
  console.log(`  body preview: ${text.slice(0, 300).replace(/\s+/g, ' ')}`)
  process.exit(0)
}

let json
try { json = JSON.parse(text) }
catch (e) { console.log(`  JSON PARSE FAILED: ${e}`); process.exit(0) }

writeFileSync(`data/bms-showtimes-${etCodes}-${regionCode}.json`, JSON.stringify(json, null, 1))
console.log('  saved sample to data/ for parser design\n--- structure ---')

const countShows = (o) => {
  let n = 0
  const seen = new Set()
  const walk = (x) => {
    if (x == null || typeof x !== 'object' || seen.has(x)) return
    seen.add(x)
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (typeof x.showTime === 'string' && x.sessionId != null) n++
    Object.values(x).forEach(walk)
  }
  walk(o)
  return n
}
console.log('top-level keys:', Object.keys(json))
console.log('approx show objects found:', countShows(json))
const sample = JSON.stringify(json)
for (const probe of ['venueCode', 'venueName', 'showTimeCode', 'showDateTime', 'sessionId', 'availStatus', 'avl', 'cinemas', 'BookMyShow'])
  console.log(`  contains "${probe}": ${(sample.match(new RegExp(probe, 'g')) || []).length}`)
