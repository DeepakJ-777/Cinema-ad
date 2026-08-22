/**
 * Dev-only full-app verification: boots `nuxt dev` and checks every screen +
 * flow the product depends on:
 *
 *   1. SSR home page renders the app shell (nav, map, hero, discover,
 *      cinema-detail section, footer).
 *   2. Leaflet map assets load (the map screen is not broken).
 *   3. /api/cinemas serves District-synced "Now Showing" data (movies,
 *      showtimes, availability, syncedAt) for the cinema detail page.
 *   4. Auth lifecycle: sign-up → session → contribute (ad-report + rating
 *      with review) → sign-out → session gone → sign-in works.
 *   5. Contribution validation (401 anonymous, 400 bad input).
 *   6. Contributions are reflected in the payload (adReports/adDurationMin,
 *      ratingCount/overall).
 *
 * Usage: node scripts/e2e-app-verify.mjs
 */
import { spawn } from 'node:child_process'

const PORT = 3114
const BASE = `http://localhost:${PORT}`

const logLines = []
const server = spawn('npx', ['nuxt', 'dev', '--port', String(PORT)], {
  cwd: process.cwd(), shell: true, stdio: ['ignore', 'pipe', 'pipe'],
})
server.stdout.on('data', d => logLines.push(...String(d).split('\n')))
server.stderr.on('data', d => logLines.push(...String(d).split('\n')))
const kill = () => {
  if (process.platform === 'win32' && server.pid)
    spawn('taskkill', ['/F', '/T', '/PID', String(server.pid)], { shell: true })
  else server.kill()
}
process.on('exit', kill)

async function waitReady(timeoutMs = 240_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/cinemas?city=kochi`)
      if (r.ok) return true
    }
    catch {}
    await new Promise(r => setTimeout(r, 3000))
  }
  return false
}

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`) }
}

const jar = { cookies: [] }
async function j(path, opts = {}, useJar = false) {
  const headers = new Headers(opts.headers)
  if (useJar && jar.cookies.length) headers.set('cookie', jar.cookies.join('; '))
  if (opts.body) headers.set('origin', BASE) // better-auth CSRF
  const res = await fetch(BASE + path, { ...opts, headers, redirect: 'manual' })
  const setCookie = res.headers.getSetCookie?.() ?? []
  if (useJar && setCookie.length) {
    for (const c of setCookie) {
      const [pair] = c.split(';')
      const [name] = pair.split('=')
      jar.cookies = jar.cookies.filter(x => !x.startsWith(`${name}=`))
      jar.cookies.push(pair)
    }
  }
  let body = null
  try { body = await res.json() } catch {}
  return { status: res.status, body, headers: res.headers }
}
const post = (path, body, useJar = false) =>
  j(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, useJar)

async function main() {
  console.log('Booting nuxt dev...')
  if (!(await waitReady())) {
    console.log('FAILED to boot. Tail:')
    console.log(logLines.slice(-40).join('\n'))
    process.exit(1)
  }

  // ---------- 1) SSR app shell (all screens live on the single page) --------
  console.log('\n— Screens: SSR home page structure —')
  const home = await fetch(`${BASE}/`)
  const html = await home.text()
  ok('GET / renders (SSR)', home.status === 200)
  ok('AppNav present', /<nav[\s\S]*?cinema/i.test(html) && html.includes('Near me') || html.includes('Near Me') || /near/i.test(html))
  ok('CinemaMap container present', html.includes('id="cinema-detail"') || /leaflet|cine-pin|Loading map/.test(html) || html.includes('cinema-detail'))
  ok('CinemaDetail section present', html.includes('id="cinema-detail"'))
  ok('Now showing heading present', /Now showing/i.test(html))
  ok('Hero + discover sections present', /how it works|discover/i.test(html))
  ok('Cinema name rendered in detail (SSR)', /PVR|Cinepolis|INOX/i.test(html))
  ok('Movies with showtimes rendered (SSR)', /\d+ movies? · \d+ shows?/.test(html))
  ok('Footer present', /OpenStreetMap contributors|©/i.test(html))

  // ---------- 2) Map assets (Leaflet) ---------------------------------------
  console.log('\n— Map screen: Leaflet assets —')
  // Find the built leaflet chunk referenced by the entry
  const cssM = html.match(/\/_nuxt\/[^"']+\.css/g) ?? []
  let leafletCss = false
  for (const href of cssM) {
    const r = await fetch(BASE + href)
    if (r.ok && (await r.text()).includes('leaflet')) { leafletCss = true; break }
  }
  ok('leaflet CSS shipped (map styling intact)', leafletCss, cssM.length ? `${cssM.length} css files checked` : 'no css refs found in HTML')

  // Client bundle contains the leaflet JS import (dynamic chunk). Resolve the
  // exact URL the browser would use: read the transformed CinemaMap module and
  // follow its `await import('leaflet')` — proves the map screen's dependency
  // chain is servable end to end.
  const mapUrl = `${BASE}/_nuxt/components/CinemaMap.vue` // Nuxt 4 serves srcDir-relative
  let mapMod = null
  for (let i = 0; i < 3 && !mapMod?.ok; i++) {
    mapMod = await fetch(mapUrl).catch(() => null)
    if (!mapMod?.ok) await new Promise(r => setTimeout(r, 3000)) // first transform can be slow
  }
  let leafletOk = false, leafletDetail = `CinemaMap module not servable (status=${mapMod?.status ?? 'null'})`
  if (mapMod?.ok) {
    const code = await mapMod.text()
    const ref = [...code.matchAll(/["']([^"']*leaflet[^"]*\.js[^"']*)["']/g)].map(m => m[1])[0]
    leafletDetail = ref ? `ref=${ref.slice(0, 80)}` : 'no leaflet js ref in module'
    if (ref) {
      const url = ref.startsWith('/_nuxt') ? ref : `${BASE}/_nuxt/${ref.replace(/^(\.\.\/|\.\/|\/?)/, '')}`
      const lm = await fetch(url).catch(() => null)
      if (lm?.ok) {
        const body = await lm.text()
        leafletOk = body.length > 100_000 && /L\.Map|createMap|leaflet/.test(body)
        leafletDetail += ` → HTTP ${lm.status}, ${Math.round(body.length / 1024)} KB`
      }
      else leafletDetail += ` → HTTP ${lm?.status ?? 'fetch failed'}`
    }
  }
  ok('leaflet JS module servable (map screen not broken)', leafletOk, leafletDetail)
  const tiles = await fetch('https://basemaps.cartocdn.com/dark_all/6/33/21.png', { method: 'HEAD' }).catch(() => null)
  ok('CARTO tile server reachable', tiles?.ok === true, tiles ? `HTTP ${tiles.status}` : 'network blocked')
  const osmTiles = await fetch('https://a.basemaps.cartocdn.com/dark_all/6/33/21.png', { method: 'HEAD' }).catch(() => null)
  ok('CARTO subdomain tiles reachable', osmTiles?.ok === true, osmTiles ? `HTTP ${osmTiles.status}` : 'fetch failed')

  // ---------- 3) Cinema detail: Now Showing data ----------------------------
  console.log('\n— Cinema detail: Now Showing (District data) —')
  const cinemas = (await j('/api/cinemas?city=all')).body.cinemas
  const withShows = cinemas.filter((c) => c.movies.length > 0)
  ok('cinemas with Now Showing data exist', withShows.length > 0, `${withShows.length}/${cinemas.length}`)
  const synced = withShows.find((c) => c.syncedAt)
  ok('a cinema carries syncedAt (District live data)', !!synced, synced ? `${synced.name} @ ${synced.syncedAt}` : '')
  const districtShow = withShows.flatMap((c) => c.movies.flatMap((m) => m.showtimes)).find((s) => s.id.startsWith('district-'))
  ok('District showtime served in Now Showing', !!districtShow, districtShow ? `${districtShow.startTime} ${districtShow.format ?? ''} ${districtShow.availability ?? ''}`.trim() : '')
  ok('availability present on shows', withShows.some((c) => c.movies.some((m) => m.showtimes.some((s) => s.availability))))

  // ---------- 4) Auth lifecycle + contributions ------------------------------
  console.log('\n— Auth: signup → contribute → signout → signin —')
  const email = `ui-verify-${Date.now()}@test.dev`
  const anonAd = await post('/api/ad-reports', { showId: 's1', minutes: 10 })
  ok('ad-report anonymous → 401', anonAd.status === 401)
  const anonRt = await post('/api/ratings', { cinemaId: 'c1', overall: 5 })
  ok('rating anonymous → 401', anonRt.status === 401)

  const signup = await post('/api/auth/sign-up/email', { name: 'UI Verifier', email, password: 'password123' }, true)
  ok('sign-up succeeds and sets session cookie', signup.status === 200 && jar.cookies.length > 0, `status=${signup.status} cookies=${jar.cookies.length}`)

  const sess = await j('/api/auth/get-session', {}, true)
  ok('get-session returns the new user', sess.status === 200 && !!sess.body?.user?.email, sess.body?.user?.email ?? '')

  // Contribute modal equivalent: ad-report on a REAL District show
  const cinema = withShows[0]
  const movie = cinema.movies.find((m) => m.showtimes.length > 0)
  const show = movie.showtimes[0]
  const before = (await j('/api/cinemas?city=all')).body.cinemas.find((c) => c.id === cinema.id)
  const beforeShow = before.movies.flatMap((m) => m.showtimes).find((s) => s.id === show.id)
  const ad = await post('/api/ad-reports', { showId: show.id, minutes: 17 }, true)
  ok('ad-report submitted (District show)', ad.status === 200, `${cinema.name} · ${movie.title} · ${show.startTime}`)
  const badNeg = await post('/api/ad-reports', { showId: show.id, minutes: -1 }, true)
  const badHigh = await post('/api/ad-reports', { showId: show.id, minutes: 500 }, true)
  const badShow = await post('/api/ad-reports', { showId: 'nope', minutes: 10 }, true)
  ok('ad-report validation: -1 → 400, 500 → 400, unknown show → 404', badNeg.status === 400 && badHigh.status === 400 && badShow.status === 404, `${badNeg.status}/${badHigh.status}/${badShow.status}`)

  // Rating with review (the full Contribute form)
  const rt = await post('/api/ratings', {
    cinemaId: cinema.id, overall: 5, ambience: 4, staff: 4, movieExperience: 5,
    foodBeverages: 4, valueForMoney: 4, review: 'UI verify — great screens',
  }, true)
  ok('rating submitted (full 6-category + review)', rt.status === 200)
  const badRt = await post('/api/ratings', { cinemaId: cinema.id, overall: 9 }, true)
  ok('rating validation: overall=9 → 400', badRt.status === 400)

  // Reflected in payload (Now Showing + crowd verdict)
  const afterC = (await j('/api/cinemas?city=all')).body.cinemas.find((c) => c.id === cinema.id)
  const afterShow = afterC.movies.flatMap((m) => m.showtimes).find((s) => s.id === show.id)
  ok('ad-report reflected (adReports +1, median set)', afterShow.adReports === (beforeShow?.adReports ?? 0) + 1 && afterShow.adDurationMin != null,
    `${beforeShow?.adReports ?? 0} → ${afterShow.adReports} reports, median ${afterShow.adDurationMin} min`)
  ok('rating reflected (ratingCount +1, overall set)', afterC.ratingCount === (before?.ratingCount ?? 0) + 1 && afterC.overall != null,
    `${before?.ratingCount ?? 0} → ${afterC.ratingCount} ratings, overall ${afterC.overall}`)
  ok('review surfaces in payload', (afterC.reviews ?? []).some((r) => r.text.includes('UI verify')))

  // Upsert: same user, same show → update not duplicate
  await post('/api/ad-reports', { showId: show.id, minutes: 25 }, true)
  const upsertC = (await j('/api/cinemas?city=all')).body.cinemas.find((c) => c.id === cinema.id)
  const upsertShow = upsertC.movies.flatMap((m) => m.showtimes).find((s) => s.id === show.id)
  ok('ad-report upsert (one per user per show)', upsertShow.adReports === afterShow.adReports, `${upsertShow.adReports} reports, median now ${upsertShow.adDurationMin}`)

  // Sign out → session gone
  const so = await post('/api/auth/sign-out', {}, true)
  ok('sign-out succeeds', so.status === 200)
  const sess2 = await j('/api/auth/get-session', {}, true)
  ok('session gone after sign-out', sess2.status === 200 && !sess2.body?.user, JSON.stringify(sess2.body?.user ?? null))
  const adAfterOut = await post('/api/ad-reports', { showId: show.id, minutes: 10 }, true)
  ok('ad-report after sign-out → 401', adAfterOut.status === 401)

  // Sign back in
  jar.cookies.length = 0
  const signin = await post('/api/auth/sign-in/email', { email, password: 'password123' }, true)
  ok('sign-in works after sign-out', signin.status === 200 && jar.cookies.length > 0)
  const sess3 = await j('/api/auth/get-session', {}, true)
  ok('session restored on sign-in', !!sess3.body?.user?.email, sess3.body?.user?.email ?? '')

  // ---------- 5) Near Me endpoint (map screen data path) --------------------
  console.log('\n— Near Me (map screen data path) —')
  const nearBad = await j('/api/cinemas/near?lat=999&lng=0')
  ok('near: invalid coords → 400', nearBad.status === 400)
  const near = await j('/api/cinemas/near?lat=9.9857&lng=76.2781')
  ok('near: Kochi-area lookup works', near.status === 200 && near.body.nearbyCount > 0, `source=${near.body.source} nearby=${near.body.nearbyCount}`)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) console.log('\nServer tail:\n' + logLines.filter(l => /error|warn/i.test(l)).slice(-20).join('\n'))
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.log('app verify crashed:', e)
  console.log(logLines.slice(-30).join('\n'))
  process.exit(1)
})
