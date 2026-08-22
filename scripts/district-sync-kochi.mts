/**
 * STEP 3 TEST — scale the verified District sync to ALL Kochi cinemas, driven
 * through the REAL production function (syncDistrictLocation) served by
 * `wrangler dev` at /run?token=…&location=kochi, asserted against the same
 * local D1 via the wrangler CLI (established repo pattern).
 *
 * Five runs (see STEP-3 plan):
 *   RUN 1  real sync      — matched cinemas, movies/shows inserted+updated, stamps
 *   RUN 2  idempotency    — 0 inserts, no duplicates, count identity holds
 *   RUN 3  stale cleanup  — unreferenced stale today-row DELETED,
 *                           ad_report-referenced stale row PRESERVED
 *   RUN 4  fetch failure  — unroutable cinema: NO cleanup, shows preserved
 *   RUN 5  restore        — cinema matches cleanly again (0 inserts)
 *   then   API verification through the real Nuxt /api/cinemas?city=kochi
 *
 * RUN 4 forces a genuine fetch failure WITHOUT touching District: the victim
 * cinema's row is temporarily renamed to something unmatchable and pointed at
 * a non-existent District cinema id (CD999999) — the production code path
 * (getDistrictCinemaShows throws / verification rejects) is exercised for real.
 *
 * Runs 2–5 pin RUN 1's date via &date=YYYY-MM-DD so idempotency assertions
 * stay valid across an IST-midnight crossing during long test sessions.
 *
 * Usage: node scripts/district-sync-kochi.mts
 */
import { execSync, spawn } from 'node:child_process'

const WORKER_PORT = 8791
const API_PORT = 3117
const TOKEN = 'dev-local-only' // sync-worker/.dev.vars
const CITY = 'kochi'
// 127.0.0.1, not localhost — sidesteps IPv6/IPv4 resolution races in undici.
const BASE = `http://127.0.0.1:${WORKER_PORT}`

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`) }
}

// ---- local D1 access (established repo pattern: wrangler CLI) ----------------
function d1(sql) {
  const q = sql.replace(/"/g, '""').replace(/\s+/g, ' ')
  const out = execSync(
    `npx wrangler d1 execute cinema-community --local --json --command "${q}"`,
    { cwd: 'sync-worker', shell: true, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const start = out.indexOf('[')
  const end = out.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error(`wrangler d1 produced no JSON: ${out.slice(0, 200)}`)
  return JSON.parse(out.slice(start, end + 1))[0].results ?? []
}
const n1 = (sql) => d1(sql)[0]?.n ?? 0

// ---- worker lifecycle --------------------------------------------------------
const worker = spawn('npx', ['wrangler', 'dev', '--test-scheduled', '--port', String(WORKER_PORT)], {
  cwd: 'sync-worker', shell: true, stdio: ['ignore', 'pipe', 'pipe'],
})
const workerLog = []
worker.stdout.on('data', d => workerLog.push(...String(d).split('\n')))
worker.stderr.on('data', d => workerLog.push(...String(d).split('\n')))
const killWorker = () => {
  if (process.platform === 'win32' && worker.pid)
    spawn('taskkill', ['/F', '/T', '/PID', String(worker.pid)], { shell: true })
  else worker.kill()
}
process.on('exit', killWorker)

async function waitWorker(timeoutMs = 150_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(`${BASE}/healthz`); if (r.ok) return true } catch {}
    await new Promise(r => setTimeout(r, 2500))
  }
  return false
}

/** /run fetch with retry — a sync is idempotent, so re-issuing it after a
 *  transport-level failure (stale keep-alive socket, momentary restart) is
 *  always safe. HTTP-level errors are NOT retried. */
async function fetchRun(url) {
  let lastErr
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(420_000) })
    }
    catch (e) {
      lastErr = e
      const cause = e?.cause ? ` · cause: ${e.cause?.code ?? e.cause?.message ?? e.cause}` : ''
      console.log(`  (transport failure on attempt ${attempt}: ${e?.message ?? e}${cause} — retrying in 6s)`)
      await new Promise(r => setTimeout(r, 6000))
    }
  }
  throw new Error(`worker unreachable at ${url}: ${lastErr?.message ?? lastErr}`)
}

async function runSync(label, date) {
  const t0 = Date.now()
  const r = await fetchRun(`${BASE}/run?token=${TOKEN}&location=${CITY}${date ? `&date=${date}` : ''}`)
  const body = await r.json()
  if (!body.report) throw new Error(`${label}: no report in response: ${JSON.stringify(body).slice(0, 400)}`)
  console.log(`\n=== ${label}: HTTP ${r.status} in ${Math.round((Date.now() - t0) / 1000)}s — date=${body.report.date}${body.report.dateRolledOver ? ' (ROLLED OVER from empty late-night day)' : ''} ===`)
  return body.report
}

function printReport(rep) {
  console.log(`  directory: cityId=${rep.directoryCityId ?? '?'} links=${rep.directoryCinemas} · known D1 cinemas=${rep.knownCinemas} · fetches=${rep.fetches} · ${Math.round(rep.durationMs / 1000)}s`)
  for (const m of rep.matched)
    console.log(`  matched: ${m.ourName} (${m.ourId}) ↔ CD${m.districtCinemaId} "${m.districtName}" [${m.viaStoredId ? 'stored id' : m.storedIdReplaced ? 'name match — superseded a stored id' : 'name match'}] — ${m.movies} movies / ${m.shows} shows`)
  for (const x of rep.storedIdsNulled) console.log(`  stored id NULLed: ${x.ourName} — CD${x.badId} ${x.reason}`)
  for (const u of rep.unmatched) console.log(`  unmatched: ${u.ourName} (${u.ourId}) — ${u.reason}`)
  for (const f of rep.fetchFailed) console.log(`  fetch-failed: ${f.ourName} (${f.ourId}) — ${f.reason}`)
  console.log(`  movies: +${rep.moviesInserted} inserted / ${rep.moviesUpdated} updated · shows: +${rep.showsInserted} inserted / ${rep.showsUpdated} updated · stale: deleted=${rep.staleDeleted} keptReferenced=${rep.staleKeptReferenced}`)
}

// ---- main --------------------------------------------------------------------
const kochiCinemas = d1(`SELECT id, name FROM cinemas WHERE city='kochi' ORDER BY id`)
const kochiIds = kochiCinemas.map(c => `'${c.id}'`).join(',')
const kochiDistrictShows = () => n1(`SELECT COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id IN (${kochiIds})`)

console.log('— Preflight —')
// Leftovers from an interrupted previous run of this test (RUN 3 plants these;
// a crash before cleanup leaves them behind). Remove them so counts are clean.
d1(`DELETE FROM ad_reports WHERE id='ar-stale-test'`)
d1(`DELETE FROM users WHERE id='u-stale-test'`)
d1(`DELETE FROM shows WHERE id IN ('district-test-stale-unref','district-test-stale-ref')`)
const tmpRow = d1(`SELECT id FROM cinemas WHERE name='TMP ZZQQ Unroutable Test Cinema'`)
if (tmpRow.length) {
  console.log(`ABORT: cinema ${tmpRow[0].id} is still TMP-renamed from an interrupted RUN 4 — restore its name/district_cinema_id manually (see git history / seed.sql), then re-run.`)
  process.exit(1)
}
const cineCols = new Set(d1(`SELECT name FROM pragma_table_info('cinemas')`).map(r => r.name))
const showCols = new Set(d1(`SELECT name FROM pragma_table_info('shows')`).map(r => r.name))
ok('cinemas.district_cinema_id exists (migration 0005)', cineCols.has('district_cinema_id'))
ok('cinemas.last_synced_at exists (migration 0005)', cineCols.has('last_synced_at'))
ok('sync_locations.last_synced_at exists (migration 0003)', d1(`SELECT name FROM pragma_table_info('sync_locations')`).some(r => r.name === 'last_synced_at'))
for (const col of ['session_id', 'show_date_time', 'availability_status', 'language', 'source', 'last_synced_at'])
  ok(`shows.${col} exists`, showCols.has(col))
const locRow = d1(`SELECT slug, enabled, region_code FROM sync_locations WHERE slug='kochi'`)[0]
ok('sync_locations kochi enabled with region_code=14', locRow?.enabled === 1 && locRow?.region_code === '14', JSON.stringify(locRow))
console.log(`  Kochi cinemas in D1 (${kochiCinemas.length}):`)
for (const c of d1(`SELECT id, name, district_cinema_id AS dcd FROM cinemas WHERE city='kochi' ORDER BY id`))
  console.log(`    ${c.id} ${c.name} (dcd=${c.dcd ?? 'NULL'})`)
const beforeCinemas = n1(`SELECT COUNT(*) AS n FROM cinemas`)
const beforeShows = kochiDistrictShows()

console.log(`\n— Boot sync-worker (wrangler dev :${WORKER_PORT}) —`)
ok('worker healthy', await waitWorker())

let run5 = null
try {
  // ---------------- RUN 1 — real sync --------------------------------------
  const run1 = await runSync('RUN 1 — first full Kochi sync')
  printReport(run1)
  ok('run 1 status ok', run1.status === 'ok', run1.note ?? '')
  ok('run 1 matched ≥ 1 cinema', run1.matched.length >= 1, `${run1.matched.length} matched`)
  ok('run 1 synced shows', run1.showsInserted + run1.showsUpdated > 0, `+${run1.showsInserted}/${run1.showsUpdated}`)
  ok('run 1 synced movies', run1.moviesInserted + run1.moviesUpdated > 0, `+${run1.moviesInserted}/${run1.moviesUpdated}`)
  const after1Cinemas = n1(`SELECT COUNT(*) AS n FROM cinemas`)
  ok('NO cinema rows created', after1Cinemas === beforeCinemas, `${beforeCinemas} → ${after1Cinemas}`)
  for (const m of run1.matched) {
    const row = d1(`SELECT district_cinema_id AS dcd, last_synced_at AS lsa FROM cinemas WHERE id='${m.ourId}'`)[0]
    ok(`cinema stamped: ${m.ourName}`, row?.dcd === m.districtCinemaId && Number(row?.lsa) > 0, `dcd=${row?.dcd} lsa=${row?.lsa}`)
  }
  ok('sync_locations.last_synced_at written', Number(run1.locationSyncedAt) > 0)
  const locLsa = d1(`SELECT last_synced_at AS lsa FROM sync_locations WHERE slug='kochi'`)[0]?.lsa
  ok('sync_locations.last_synced_at persisted', Number(locLsa) > 0, String(locLsa))
  const after1 = kochiDistrictShows()
  ok('RUN 1 count identity (before + inserted − deleted)', after1 === beforeShows + run1.showsInserted - run1.staleDeleted,
    `${beforeShows} + ${run1.showsInserted} − ${run1.staleDeleted} = ${after1}`)

  // ---------------- RUN 2 — idempotency ------------------------------------
  const run2 = await runSync('RUN 2 — idempotency (same date pinned)', run1.date)
  printReport(run2)
  ok('run 2 inserted 0 shows', run2.showsInserted === 0, `+${run2.showsInserted}`)
  ok('run 2 inserted 0 movies', run2.moviesInserted === 0, `+${run2.moviesInserted}`)
  ok('run 2 matched the same cinemas', run2.matched.length === run1.matched.length
    && run2.matched.every(m => run1.matched.some(x => x.ourId === m.ourId && x.districtCinemaId === m.districtCinemaId)))
  const after2 = kochiDistrictShows()
  ok('RUN 2 count identity (no churn)', after2 === after1 + run2.showsInserted - run2.staleDeleted,
    `${after1} + ${run2.showsInserted} − ${run2.staleDeleted} = ${after2}`)
  const dups = d1(`SELECT cinema_id, movie_id, show_date, start_time, COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id IN (${kochiIds}) GROUP BY cinema_id, movie_id, show_date, start_time HAVING n > 1`)
  ok('no duplicate (cinema, movie, date, time) rows', dups.length === 0, JSON.stringify(dups.slice(0, 2)))
  const idDups = n1(`SELECT COUNT(*) AS n FROM (SELECT id FROM shows WHERE source='district' AND cinema_id IN (${kochiIds}) GROUP BY id HAVING COUNT(*) > 1)`)
  ok('every show id stored exactly once', idDups === 0)

  // ---------------- RUN 3 — stale cleanup ----------------------------------
  console.log('\n— RUN 3 setup: plant stale rows for the synced date —')
  const plant = run2.matched.find(m => m.shows > 0) ?? run2.matched[0]
  const anyMovie = d1(`SELECT movie_id FROM shows WHERE cinema_id='${plant.ourId}' AND source='district' LIMIT 1`)[0]?.movie_id
    ?? d1(`SELECT id FROM movies LIMIT 1`)[0].id
  const nowSec = Math.floor(Date.now() / 1000)
  const staleLsa = nowSec - 7200 // "written" 2h ago → older than this run
  const plantShow = (id, sid, time) =>
    d1(`INSERT INTO shows (id, cinema_id, movie_id, show_date, start_time, format, screen, session_id, show_time_code, show_date_time, availability_status, language, source, last_synced_at) VALUES ('${id}', '${plant.ourId}', '${anyMovie}', '${run2.date}', '${time}', 'STALE', '', '${sid}', NULL, '${run2.date}T${time}', 'available', NULL, 'district', ${staleLsa})`)
  plantShow('district-test-stale-unref', 'test-stale-unref', '23:57') // Case A: no ad_report
  plantShow('district-test-stale-ref', 'test-stale-ref', '23:58')     // Case B: has ad_report
  d1(`INSERT OR IGNORE INTO users (id, name, email, email_verified, image, created_at, updated_at) VALUES ('u-stale-test', 'Stale Test', 'stale-test@example.com', 1, NULL, ${nowSec}, ${nowSec})`)
  d1(`INSERT INTO ad_reports (id, user_id, cinema_id, movie_id, show_id, ad_duration_minutes, created_at) VALUES ('ar-stale-test', 'u-stale-test', '${plant.ourId}', '${anyMovie}', 'district-test-stale-ref', 5, ${nowSec})`)
  const before3 = kochiDistrictShows() // includes the 2 planted rows
  console.log(`  planted 2 stale rows (${run2.date}) on ${plant.ourName} — one with ad_report, one without`)

  const run3 = await runSync('RUN 3 — stale cleanup', run2.date)
  printReport(run3)
  const unrefGone = n1(`SELECT COUNT(*) AS n FROM shows WHERE id='district-test-stale-unref'`) === 0
  const refKept = n1(`SELECT COUNT(*) AS n FROM shows WHERE id='district-test-stale-ref'`) === 1
  ok('stale unreferenced row DELETED', unrefGone && run3.staleDeleted >= 1, `staleDeleted=${run3.staleDeleted}`)
  ok('ad_report-referenced stale row PRESERVED', refKept, `staleKeptReferenced=${run3.staleKeptReferenced}`)
  const after3 = kochiDistrictShows() // still includes the preserved planted row
  ok('RUN 3 count identity', after3 === before3 + run3.showsInserted - run3.staleDeleted,
    `${before3} + ${run3.showsInserted} − ${run3.staleDeleted} = ${after3}`)
  ok('run 3 inserted 0 new shows', run3.showsInserted === 0, `+${run3.showsInserted}`)

  console.log('  cleaning up planted community rows…')
  d1(`DELETE FROM ad_reports WHERE id='ar-stale-test'`)
  d1(`DELETE FROM users WHERE id='u-stale-test'`)
  d1(`DELETE FROM shows WHERE id='district-test-stale-ref'`)
  ok('planted rows removed', n1(`SELECT COUNT(*) AS n FROM shows WHERE id LIKE 'district-test-stale%'`) === 0
    && n1(`SELECT COUNT(*) AS n FROM ad_reports WHERE id='ar-stale-test'`) === 0)

  // ---------------- RUN 4 — failed fetch safety ------------------------------
  console.log('\n— RUN 4 setup: make one cinema unroutable (rename + bogus CD999999) —')
  const victim = run3.matched.find(m => m.shows > 0) ?? run3.matched[0]
  const stash = d1(`SELECT name, district_cinema_id AS dcd, last_synced_at AS lsa FROM cinemas WHERE id='${victim.ourId}'`)[0]
  const victimBefore = n1(`SELECT COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id='${victim.ourId}'`)
  d1(`UPDATE cinemas SET name='TMP ZZQQ Unroutable Test Cinema', district_cinema_id='999999' WHERE id='${victim.ourId}'`)
  console.log(`  victim: ${stash.name} (${victim.ourId}) — ${victimBefore} district shows must survive`)

  const run4 = await runSync('RUN 4 — fetch failure safety', run3.date)
  printReport(run4)
  const bucketEntry = [...run4.unmatched, ...run4.fetchFailed].find(u => u.ourId === victim.ourId)
  ok('unroutable cinema reported unmatched/failed', !!bucketEntry, bucketEntry?.reason?.slice(0, 120) ?? '')
  ok('unroutable cinema NOT stamped', d1(`SELECT district_cinema_id AS dcd FROM cinemas WHERE id='${victim.ourId}'`)[0]?.dcd !== '999999'
    || Number(d1(`SELECT last_synced_at AS lsa FROM cinemas WHERE id='${victim.ourId}'`)[0]?.lsa) < run4.locationSyncedAt - 5)
  const victimAfter = n1(`SELECT COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id='${victim.ourId}'`)
  ok('FAILED FETCH DELETED NOTHING — victim shows intact', victimAfter === victimBefore, `${victimBefore} → ${victimAfter}`)
  ok('run 4 matched the other cinemas', run4.matched.length === run3.matched.length - 1, `${run4.matched.length} matched`)
  ok('run 4 inserted 0 shows', run4.showsInserted === 0, `+${run4.showsInserted}`)

  // ---------------- RUN 5 — restore ------------------------------------------
  console.log('\n— RUN 5 setup: restore the victim row —')
  d1(`UPDATE cinemas SET name='${String(stash.name).replace(/'/g, "''")}', district_cinema_id=${stash.dcd ? `'${stash.dcd}'` : 'NULL'}, last_synced_at=${stash.lsa ?? 'NULL'} WHERE id='${victim.ourId}'`)
  run5 = await runSync('RUN 5 — restored cinema syncs cleanly again', run3.date)
  printReport(run5)
  ok('restored cinema matched again via stored id',
    run5.matched.some(m => m.ourId === victim.ourId && String(m.districtCinemaId) === String(stash.dcd)))
  ok('run 5 inserted 0 shows', run5.showsInserted === 0, `+${run5.showsInserted}`)
}
catch (e) {
  console.log(`\nFAILED during runs: ${e?.message ?? e}`)
  console.log('\n— last 60 raw worker log lines —\n' + workerLog.slice(-60).join('\n'))
  killWorker()
  process.exit(1)
}

// ---------------- API verification through the real Nuxt app -------------------
console.log('\n— API verification: bridge + /api/cinemas?city=kochi —')
killWorker()
await new Promise(r => setTimeout(r, 3000))
execSync('node scripts/district-copy-to-dev.mjs', { stdio: 'inherit', timeout: 180_000 })

const api = spawn('npx', ['nuxt', 'dev', '--port', String(API_PORT)], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
const killApi = () => {
  if (process.platform === 'win32' && api.pid) spawn('taskkill', ['/F', '/T', '/PID', String(api.pid)], { shell: true })
  else api.kill()
}
process.on('exit', killApi)
try {
  const t0 = Date.now()
  let ready = false
  while (Date.now() - t0 < 240_000) {
    try { const r = await fetch(`http://localhost:${API_PORT}/api/cinemas?city=kochi`); if (r.ok) { ready = true; break } } catch {}
    await new Promise(r => setTimeout(r, 3000))
  }
  ok('nuxt dev served /api/cinemas?city=kochi', ready)
  const body = await (await fetch(`http://localhost:${API_PORT}/api/cinemas?city=kochi`)).json()
  const withDistrict = (body.cinemas ?? []).filter(c =>
    (c.movies ?? []).some(m => m.showtimes.some(s => String(s.id).startsWith('district-'))))
  ok('≥ 2 Kochi cinemas serve synced district showtimes', withDistrict.length >= 2,
    `${withDistrict.length}: ${withDistrict.map(c => c.name).join(' | ')}`)
  ok('serving cinemas carry syncedAt', withDistrict.every(c => c.syncedAt != null))
  const totalShows = withDistrict.reduce((n, c) =>
    n + c.movies.reduce((k, m) => k + m.showtimes.filter(s => String(s.id).startsWith('district-')).length, 0), 0)
  ok('district showtimes present in API payload', totalShows > 0, `n=${totalShows}`)
  ok('meta counts present', body.meta != null && typeof body.meta.adReports === 'number', JSON.stringify(body.meta))
  for (const c of withDistrict.slice(0, 4)) {
    const sample = c.movies
      .flatMap(m => m.showtimes.filter(s => String(s.id).startsWith('district-')).map(s => `${s.startTime} ${m.title}`))
      .slice(0, 3)
    console.log(`    ${c.name} (syncedAt ${c.syncedAt}): ${sample.join(' · ')}`)
  }
}
finally { killApi() }

// ---------------- final report -------------------------------------------------
console.log('\n================ FINAL REPORT — KOCHI MULTI-CINEMA DISTRICT SYNC ================')
console.log(`Kochi cinemas in D1:            ${kochiCinemas.length}`)
console.log(`District directory cinema links: ${run5?.directoryCinemas ?? '?'} (cityId=${run5?.directoryCityId ?? '?'})`)
console.log('\nPer-cinema outcome (RUN 5, final state):')
const finalCinemas = d1(`SELECT id, name, district_cinema_id AS dcd, last_synced_at AS lsa FROM cinemas WHERE city='kochi' ORDER BY id`)
for (const c of finalCinemas)
  console.log(`  ${c.id} ${c.name} — dcd=${c.dcd ?? 'NULL'} lsa=${c.lsa ?? 'NULL'}`)
console.log(`\nKochi district shows in D1:     ${kochiDistrictShows()}`)
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
