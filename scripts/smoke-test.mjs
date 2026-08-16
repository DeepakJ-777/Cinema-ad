/**
 * Smoke test for the Cinema Community API (run against `npm run dev`).
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 * Covers the MVP checklist paths: guest browsing, auth gating, validation,
 * duplicates/upserts, rate limiting, and live aggregate updates.
 */
const BASE = process.argv[2] || 'http://localhost:3000'
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

async function j(path, opts = {}) {
  const res = await fetch(BASE + path, opts)
  let body = null
  try { body = await res.json() } catch {}
  return { status: res.status, body, cookies: res.headers.getSetCookie?.() ?? [] }
}
const post = (path, body, cookie) => j(path, {
  method: 'POST',
  // Browsers always send Origin on POST; better-auth enforces this for
  // browser-like requests (undici adds sec-fetch-mode: cors), so mimic it.
  headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
})

// Wait for the dev server (first compile can be slow)
let ping = null
for (let i = 0; i < 45; i++) {
  try {
    ping = await fetch(BASE + '/api/cinemas?city=kochi')
    if (ping.ok) break
  } catch {}
  await new Promise(r => setTimeout(r, 2000))
}

console.log('— guest browsing —')
const home = await fetch(BASE + '/')
ok('GET / renders (SSR, no login)', home.status === 200)
const g1 = await j('/api/cinemas?city=kochi')
ok('GET /api/cinemas?city=kochi is public', g1.status === 200 && g1.body.cinemas.length > 0)
const meta = g1.body.meta
ok('meta includes contributors count', typeof meta.contributors === 'number' && meta.contributors > 0, JSON.stringify(meta))

const cinema = g1.body.cinemas.find(c => c.movies.some(m => m.showtimes.some(s => s.adReports > 0)))
const movie = cinema.movies.find(m => m.showtimes.some(s => s.adReports > 0))
const show = movie.showtimes.find(s => s.adReports > 0)
console.log(`   probe: ${cinema.name} · ${movie.title} · ${show.startTime} (${show.adReports} reports, ~${show.adDurationMin} min)`)

console.log('— anonymous contributions are blocked —')
const anonAd = await post('/api/ad-reports', { showId: show.id, minutes: 10 })
ok('POST /api/ad-reports anonymous → 401', anonAd.status === 401, `got ${anonAd.status}`)
const anonRt = await post('/api/ratings', { cinemaId: cinema.id, overall: 5 })
ok('POST /api/ratings anonymous → 401', anonRt.status === 401, `got ${anonRt.status}`)

console.log('— auth —')
const email = `smoke-${Date.now()}@test.dev`
let signup = await post('/api/auth/sign-up/email', { name: 'Smoke Tester', email, password: 'password123' })
if (signup.status !== 200) {
  console.log('   (signup failed, falling back to sign-in)')
  signup = await post('/api/auth/sign-in/email', { email, password: 'password123' })
}
const cookie = signup.cookies.map(c => c.split(';')[0]).join('; ')
ok('sign up / sign in sets session cookie', signup.status === 200 && cookie.length > 0, `status ${signup.status}`)

console.log('— ad report validation —')
ok('negative minutes → 400', (await post('/api/ad-reports', { showId: show.id, minutes: -5 }, cookie)).status === 400)
ok('absurd minutes → 400', (await post('/api/ad-reports', { showId: show.id, minutes: 999 }, cookie)).status === 400)
ok('unknown show → 404', (await post('/api/ad-reports', { showId: 'nope', minutes: 10 }, cookie)).status === 404)

console.log('— ad report upsert (one per user per show) —')
await post('/api/ad-reports', { showId: show.id, minutes: 25 }, cookie)
await post('/api/ad-reports', { showId: show.id, minutes: 31 }, cookie) // duplicate → update, not +1
const g2 = await j('/api/cinemas?city=kochi')
const c2 = g2.body.cinemas.find(c => c.id === cinema.id)
const s2 = c2.movies.flatMap(m => m.showtimes).find(s => s.id === show.id)
ok('report count grew by exactly 1 after two submissions', s2.adReports === show.adReports + 1, `got ${s2.adReports}, want ${show.adReports + 1}`)
ok('median is a sane positive number', s2.adDurationMin > 0 && s2.adDurationMin < 90, `got ${s2.adDurationMin}`)

console.log('— rating validation + upsert —')
ok('rating 9 → 400 (out of 1–5)', (await post('/api/ratings', { cinemaId: cinema.id, overall: 9 }, cookie)).status === 400)
await post('/api/ratings', { cinemaId: cinema.id, overall: 5, ambience: 4, staff: 4, movieExperience: 5, foodBeverages: 3, valueForMoney: 4, review: 'Smoke test review — ignore' }, cookie)
await post('/api/ratings', { cinemaId: cinema.id, overall: 4, review: 'Smoke test review — ignore' }, cookie) // duplicate → update
const g3 = await j('/api/cinemas?city=kochi')
const c3 = g3.body.cinemas.find(c => c.id === cinema.id)
ok('rating count grew by exactly 1 after two submissions', c3.ratingCount === cinema.ratingCount + 1, `got ${c3.ratingCount}, want ${cinema.ratingCount + 1}`)
ok('overall average updated', c3.overall != null && c3.overall > 0)

console.log('— rate limiting (basic spam protection) —')
let saw429 = false
for (let i = 0; i < 8; i++) {
  const r = await post('/api/ad-reports', { showId: show.id, minutes: 20 }, cookie)
  if (r.status === 429) { saw429 = true; break }
}
ok('hammering the API eventually returns 429', saw429)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
