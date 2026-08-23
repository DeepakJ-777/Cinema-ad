/**
 * STEP 4B TEST — verify Bengaluru syncs through the proven single-location
 * production path (syncDistrictLocation in sync-worker/src/district-sync.ts)
 * served by `wrangler dev` at /run?token=…&location=bengaluru, asserted
 * against the same local D1 via the wrangler CLI (established repo pattern).
 *
 * Compact gate before adding 'bengaluru' to CRON_DISTRICT_LOCATIONS in
 * sync-worker/src/index.ts:
 *   RUN 1  real sync   — matched cinemas attach to EXISTING rows (no creation,
 *                        no bogus matches — every match is a stored id
 *                        revalidated against cityId + ≤10 km page pins),
 *                        shows/movies upserted, cinema + sync_locations
 *                        timestamps written
 *   RUN 2  idempotency — 0 inserts, same matches, count identity holds,
 *                        no duplicate (cinema, movie, date, time) rows,
 *                        no duplicate show ids
 *
 * Usage: node scripts/district-sync-bengaluru-test.mjs
 */
import { execSync, spawn } from 'node:child_process'

const WORKER_PORT = 8793
const TOKEN = 'dev-local-only' // sync-worker/.dev.vars
const CITY = 'bengaluru'
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
const n1 = (sql) => Number(d1(sql)[0]?.n ?? 0)

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

async function runSync(label) {
  const t0 = Date.now()
  const r = await fetchRun(`${BASE}/run?token=${TOKEN}&location=${CITY}`)
  const body = await r.json()
  if (!body.report) throw new Error(`${label}: no report in response: ${JSON.stringify(body).slice(0, 400)}`)
  console.log(`\n=== ${label}: HTTP ${r.status} in ${Math.round((Date.now() - t0) / 1000)}s — date=${body.report.date}${body.report.dateRolledOver ? ' (ROLLED OVER from empty late-night day)' : ''} ===`)
  return body.report
}

function printReport(rep) {
  console.log(`  directory: cityId=${rep.directoryCityId ?? '?'} links=${rep.directoryCinemas} · known D1 cinemas=${rep.knownCinemas} · fetches=${rep.fetches} · ${Math.round(rep.durationMs / 1000)}s`)
  for (const m of rep.matched)
    console.log(`  matched: ${m.ourName} (${m.ourId}) ↔ CD${m.districtCinemaId} "${m.districtName}" [${m.viaStoredId ? 'stored id revalidated' : m.storedIdReplaced ? 'name match — superseded stored id' : 'name match'}] — ${m.movies} movies / ${m.shows} shows`)
  for (const x of rep.storedIdsNulled ?? []) console.log(`  stored id NULLed: ${x.ourName} — CD${x.badId} ${x.reason}`)
  for (const u of rep.unmatched) console.log(`  unmatched: ${u.ourName} — ${u.reason}`)
  for (const f of rep.fetchFailed) console.log(`  fetch-failed: ${f.ourName} — ${f.reason}`)
  console.log(`  movies: +${rep.moviesInserted} inserted / ${rep.moviesUpdated} updated · shows: +${rep.showsInserted} inserted / ${rep.showsUpdated} updated · stale: deleted=${rep.staleDeleted}`)
}

// ---- main --------------------------------------------------------------------
const bengaluruCinemas = d1(`SELECT id, name, district_cinema_id AS dcd FROM cinemas WHERE city='bengaluru' ORDER BY id`)
const cityIds = bengaluruCinemas.map(c => `'${c.id}'`).join(',') || "''"
const districtShows = () => n1(`SELECT COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id IN (${cityIds})`)

console.log('— Preflight —')
const locRow = d1(`SELECT slug, enabled, region_code FROM sync_locations WHERE slug='bengaluru'`)[0]
ok('sync_locations bengaluru row present + enabled', locRow?.enabled === 1, JSON.stringify(locRow))
console.log(`  Bengaluru cinemas in D1 (${bengaluruCinemas.length}):`)
for (const c of bengaluruCinemas) console.log(`    ${c.id} ${c.name} (dcd=${c.dcd ?? 'NULL'})`)
const beforeCinemas = n1(`SELECT COUNT(*) AS n FROM cinemas`)
const beforeShows = districtShows()
console.log(`  snapshot: total cinemas=${beforeCinemas} · bengaluru district shows=${beforeShows}`)

console.log(`\n— Boot sync-worker (wrangler dev :${WORKER_PORT}) —`)
ok('worker healthy', await waitWorker())

let lastReport = null
try {
  // ---------------- RUN 1 — real sync --------------------------------------
  const run1 = await runSync('RUN 1 — first full Bengaluru sync')
  lastReport = run1
  printReport(run1)
  ok('run 1 status ok', run1.status === 'ok', run1.note ?? '')
  ok('run 1 matched ≥ 1 cinema', run1.matched.length >= 1, `${run1.matched.length} matched`)
  ok('run 1 synced shows', run1.showsInserted + run1.showsUpdated > 0, `+${run1.showsInserted}/${run1.showsUpdated}`)
  const after1Cinemas = n1(`SELECT COUNT(*) AS n FROM cinemas`)
  ok('NO cinema rows created (no duplicates)', after1Cinemas === beforeCinemas, `${beforeCinemas} → ${after1Cinemas}`)
  for (const m of run1.matched) {
    const row = d1(`SELECT district_cinema_id AS dcd, last_synced_at AS lsa FROM cinemas WHERE id='${m.ourId}'`)[0]
    ok(`cinema stamped: ${m.ourName}`, row?.dcd === m.districtCinemaId && Number(row?.lsa) > 0, `dcd=${row?.dcd} lsa=${row?.lsa}`)
  }
  const locLsa = d1(`SELECT last_synced_at AS lsa FROM sync_locations WHERE slug='bengaluru'`)[0]?.lsa
  ok('sync_locations.last_synced_at written', Number(run1.locationSyncedAt) > 0 && Number(locLsa) > 0, String(locLsa))
  const after1 = districtShows()

  // ---------------- RUN 2 — idempotency (same implicit date) ---------------
  const run2 = await runSync('RUN 2 — idempotency (same implicit date)')
  lastReport = run2
  printReport(run2)
  ok('run 2 same date as run 1', run2.date === run1.date, `${run1.date} → ${run2.date}`)
  ok('run 2 inserted 0 shows', run2.showsInserted === 0, `+${run2.showsInserted}`)
  ok('run 2 inserted 0 movies', run2.moviesInserted === 0, `+${run2.moviesInserted}`)
  ok('run 2 matched the same cinemas', run2.matched.length === run1.matched.length
    && run2.matched.every(m => run1.matched.some(x => x.ourId === m.ourId && x.districtCinemaId === m.districtCinemaId)))
  const after2 = districtShows()
  ok('RUN 2 count identity (after1 + inserted − deleted)', after2 === after1 + run2.showsInserted - run2.staleDeleted,
    `${after1} + ${run2.showsInserted} − ${run2.staleDeleted} = ${after2}`)
  const dups = d1(`SELECT cinema_id, movie_id, show_date, start_time, screen, COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id IN (${cityIds}) GROUP BY cinema_id, movie_id, show_date, start_time, screen HAVING n > 1`)
  ok('no duplicate (cinema, movie, date, time, screen) rows', dups.length === 0, JSON.stringify(dups.slice(0, 2)))
  const idDups = n1(`SELECT COUNT(*) AS n FROM (SELECT id FROM shows WHERE source='district' AND cinema_id IN (${cityIds}) GROUP BY id HAVING COUNT(*) > 1)`)
  ok('every show id stored exactly once', idDups === 0)
}
catch (e) {
  console.log(`\nFAILED during runs: ${e?.message ?? e}`)
  const relevant = workerLog.filter(l => /\[district-sync\]|\[cron\]|error/i.test(l)).slice(-40)
  console.log('\n— last ~40 relevant worker log lines —\n' + relevant.join('\n'))
  killWorker()
  process.exit(1)
}

// ---------------- final report -------------------------------------------------
console.log('\n================ FINAL REPORT — BENGALURU DISTRICT SYNC (STEP 4B) ================')
console.log(`Bengaluru cinemas in D1:             ${bengaluruCinemas.length}`)
console.log(`District directory cinema links:     ${lastReport?.directoryCinemas ?? '?'} (cityId=${lastReport?.directoryCityId ?? '?'})`)
console.log(`Bengaluru district shows in D1:      ${districtShows()}`)
console.log('\nFinal state of bengaluru cinemas:')
for (const c of d1(`SELECT id, name, district_cinema_id AS dcd, last_synced_at AS lsa FROM cinemas WHERE city='bengaluru' ORDER BY id`))
  console.log(`  ${c.id} ${c.name} — dcd=${c.dcd ?? 'NULL'} lsa=${c.lsa ?? 'NULL'}`)
console.log(`\n${pass} passed, ${fail} failed`)
killWorker()
process.exit(fail > 0 ? 1 : 0)
