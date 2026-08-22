/**
 * Dev-only: check whether BMS movie/showtimes pages carry server-rendered data.
 * Usage: node scripts/bms-probe2.mjs <movieSlug> <city>
 */
import { writeFileSync } from 'node:fs'

const SLUG = process.argv[2] || 'thudakkam'
const CITY = process.argv[3] || 'kochi'
const UA = 'CinemaCommunity-BMSSync-PoC/0.1 (community cinema start-times app; contact: dev@example.com)'

const probe = async (url, file) => {
  const t0 = Date.now()
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow' })
  const text = await res.text().catch(() => '')
  console.log(`\nGET ${url}`)
  console.log(`  status=${res.status} finalUrl=${res.url} (${Date.now() - t0}ms, ${text.length} bytes)`)
  const state = text.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)
  const next = text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  console.log(`  __INITIAL_STATE__=${state ? state[1].length + 'B' : 'no'}  __NEXT_DATA__=${next ? next[1].length + 'B' : 'no'}`)
  for (const probeWord of ['PVR', 'Cinepolis', 'Lulu', 'AM</', 'showtime', 'ShowTime', 'venueName', 'VenueName', 'cinemaName'])
    console.log(`  contains "${probeWord}": ${(text.match(new RegExp(probeWord, 'g')) || []).length}`)
  if (file) writeFileSync(file, text)
  return { res, text, state, next }
}

await probe(`https://in.bookmyshow.com/movies/${SLUG}/`, 'data/bms-movie.html')
await new Promise(r => setTimeout(r, 2500))
await probe(`https://in.bookmyshow.com/buytickets/${SLUG}/${CITY}`, 'data/bms-buytickets.html')
