/**
 * Dev-only probe: what does BookMyShow return to a plain, honestly-identified
 * HTTP request? Checks robots.txt policy and the public explore pages before
 * we write the cron worker. No retries, no browser emulation, no cookies.
 *
 * Usage: node scripts/bms-probe.mjs [citySlug]
 */
const CITY = process.argv[2] || 'kochi'
const UA = 'CinemaCommunity-BMSSync-PoC/0.1 (community cinema start-times app; contact: dev@example.com)'

const get = async (url) => {
  const t0 = Date.now()
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/json' },
    redirect: 'follow',
  })
  const text = await res.text().catch(() => '')
  return { url, res, text, ms: Date.now() - t0 }
}

const report = (r) => {
  console.log(`\nGET ${r.url}`)
  console.log(`  status      : ${r.res.status} ${r.res.statusText} (${r.ms}ms)`)
  for (const h of ['server', 'content-type', 'cf-mitigated', 'x-frame-options', 'retry-after', 'akamai-grn'])
    if (r.res.headers.get(h)) console.log(`  ${h.padEnd(12)}: ${r.res.headers.get(h)}`)
  console.log(`  body length : ${r.text.length}`)
  const nd = r.text.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  console.log(`  __NEXT_DATA__: ${nd ? `yes (${nd[1].length} bytes)` : 'no'}`)
  const blockHints = [
    'access denied', 'request denied', 'captcha', 'are you a human', 'verify',
    'akamai', 'perimeterx', 'px-captcha', 'cloudflare', 'attention required',
    'unusual traffic', 'rate limit',
  ].filter(h => r.text.toLowerCase().includes(h))
  if (blockHints.length) console.log(`  block hints : ${[...new Set(blockHints)].join(', ')}`)
  return nd ? nd[1] : null
}

// 1) robots.txt — honour it before anything else
const robots = await get('https://in.bookmyshow.com/robots.txt')
report(robots)
console.log('  robots.txt rules mentioning /explore or *:')
console.log(robots.text.split('\n').filter(l => /user-agent|disallow|allow|crawl-delay/i.test(l)).slice(0, 40).map(l => `    ${l.trim()}`).join('\n') || '    (none)')

// 2) public cinema listing page
const cinemas = await get(`https://in.bookmyshow.com/explore/cinemas/${CITY}`)
const nd1 = report(cinemas)

// 3) public now-showing movies page
await new Promise(r => setTimeout(r, 2500))
const movies = await get(`https://in.bookmyshow.com/explore/movies-${CITY}`)
const nd2 = report(movies)

// 4) dump __NEXT_DATA__ structure to files for parser design
import { writeFileSync } from 'node:fs'
if (nd1) { writeFileSync('data/bms-cinemas-nextdata.json', nd1); console.log(`\nwrote data/bms-cinemas-nextdata.json`) }
if (nd2) { writeFileSync('data/bms-movies-nextdata.json', nd2); console.log(`wrote data/bms-movies-nextdata.json`) }
