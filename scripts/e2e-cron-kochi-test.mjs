/**
 * STEP 4A/4B TEST — prove the REAL cron production path, not just /run:
 *
 *   Cloudflare Cron (scheduled handler, triggered locally via wrangler dev
 *   --test-scheduled → /__scheduled?cron=0 6 * * *)
 *         ↓
 *   runCronDistrictSync: sync_locations ∩ rollout list
 *         ↓
 *   kochi → syncDistrictLocation() → District → D1
 *   bengaluru → syncDistrictLocation() → District → D1 (SYNCED since STEP 4B)
 *
 * Checks (each trigger):
 *   1. Worker log shows the cron orchestration lines (path=district-sync,
 *      kochi OK, bengaluru SKIP) — the path itself, not just side effects.
 *   2. kochi stamps bumped: cinemas.last_synced_at + sync_locations.last_synced_at.
 *   3. Kochi district shows exist; no duplicate (cinema, movie, date, time);
 *      every show id stored once.
 *   4. Bengaluru is FROZEN (enabled in DB but gated by the rollout list):
 *      identical last_synced_at max, identical show count, sync_locations
 *      row still NULL.
 *   5. No cinema rows created.
 *   6. Trigger TWICE → idempotent: second run inserts 0 shows (parsed from
 *      the [cron] kochi: OK log line), counts stable.
 *
 * Usage: node scripts/e2e-cron-kochi-test.mjs
 */
import { execSync, spawn } from 'node:child_process'

const WORKER_PORT = 8792
const BASE = `http://127.0.0.1:${WORKER_PORT}`
const CRON_EXPR = '0 6 * * *'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`) }
}

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

/** Wait until `needle` appears in the captured worker log at least `count` times. */
async function waitForLog(needle, count = 1, timeoutMs = 300_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const hits = workerLog.filter(l => l.includes(needle)).length
    if (hits >= count) return true
    await new Promise(r => setTimeout(r, 1000))
  }
  return false
}

/** Trigger the real scheduled handler; wait until the Nth cron run completes. */
async function triggerCron(label, ordinal) {
  const r = await fetch(`${BASE}/__scheduled?cron=${encodeURIComponent(CRON_EXPR)}`, { signal: AbortSignal.timeout(120_000) })
  ok(`${label}: /__scheduled accepted`, r.ok, `HTTP ${r.status}`)
  ok(`${label}: cron run #${ordinal} completed in worker`, await waitForLog('[cron] run complete', ordinal))
}

// ---- snapshots ----------------------------------------------------------------
const kochiIds = d1(`SELECT id FROM cinemas WHERE city='kochi'`).map(c => `'${c.id}'`).join(',')
const blrIds = d1(`SELECT id FROM cinemas WHERE city='bengaluru'`).map(c => `'${c.id}'`).join(',')
const snap = {
  cinemas: n1(`SELECT COUNT(*) AS n FROM cinemas`),
  kochiLocLsa: Number(d1(`SELECT last_synced_at AS lsa FROM sync_locations WHERE slug='kochi'`)[0]?.lsa ?? 0),
  blrLocLsa: d1(`SELECT last_synced_at AS lsa FROM sync_locations WHERE slug='bengaluru'`)[0]?.lsa,
  kochiMaxLsa: Number(d1(`SELECT MAX(last_synced_at) AS m FROM cinemas WHERE city='kochi'`)[0]?.m ?? 0),
  blrMaxLsa: Number(d1(`SELECT MAX(last_synced_at) AS m FROM cinemas WHERE city='bengaluru'`)[0]?.m ?? 0),
  blrShows: n1(`SELECT COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id IN (${blrIds})`),
}
const kochiShows = () => n1(`SELECT COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id IN (${kochiIds})`)
console.log(`— Snapshot —
  total cinemas=${snap.cinemas}
  kochi: loc_lsa=${snap.kochiLocLsa} max_cinema_lsa=${snap.kochiMaxLsa} district_shows=${kochiShows()}
  bengaluru: loc_lsa=${snap.blrLocLsa ?? 'NULL'} max_cinema_lsa=${snap.blrMaxLsa} district_shows=${snap.blrShows}`)

try {
  console.log(`\n— Boot sync-worker (wrangler dev --test-scheduled :${WORKER_PORT}) —`)
  ok('worker healthy', await waitWorker())

  console.log('\n=== CRON TRIGGER 1 ===')
  const before1 = kochiShows()
  await triggerCron('trigger 1', 1)

  ok('orchestration log: path=district-sync', workerLog.some(l => l.includes('[cron] run start') && l.includes('path=district-sync')))
  ok('orchestration log: kochi OK line', workerLog.some(l => /\[cron\] kochi: OK — matched=\d+/.test(l)))
  ok('orchestration log: bengaluru OK line (rollout includes bengaluru)', workerLog.some(l => /\[cron\] bengaluru: OK — matched=\d+/.test(l)))

  const locLsa1 = Number(d1(`SELECT last_synced_at AS lsa FROM sync_locations WHERE slug='kochi'`)[0]?.lsa ?? 0)
  const kochiMaxLsa1 = Number(d1(`SELECT MAX(last_synced_at) AS m FROM cinemas WHERE city='kochi'`)[0]?.m ?? 0)
  ok('sync_locations.kochi.last_synced_at bumped', locLsa1 > snap.kochiLocLsa, `${snap.kochiLocLsa} → ${locLsa1}`)
  ok('kochi cinemas.last_synced_at bumped', kochiMaxLsa1 > snap.kochiMaxLsa, `${snap.kochiMaxLsa} → ${kochiMaxLsa1}`)

  const after1 = kochiShows()
  ok('kochi district shows exist', after1 > 0, `n=${after1}`)

  const blrAfter = {
    maxLsa: Number(d1(`SELECT MAX(last_synced_at) AS m FROM cinemas WHERE city='bengaluru'`)[0]?.m ?? 0),
    shows: n1(`SELECT COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id IN (${blrIds})`),
    locLsa: d1(`SELECT last_synced_at AS lsa FROM sync_locations WHERE slug='bengaluru'`)[0]?.lsa,
  }
  ok('bengaluru cinemas STAMPED (lsa bumped)', blrAfter.maxLsa > snap.blrMaxLsa, `${snap.blrMaxLsa} → ${blrAfter.maxLsa}`)
  ok('bengaluru sync_locations.last_synced_at written', Number(blrAfter.locLsa) > 0, String(blrAfter.locLsa))
  // Count identity from trigger 1's bengaluru OK log line (inserted/staleDeleted).
  const blrOk1 = workerLog.find(l => /\[cron\] bengaluru: OK — /.test(l)) ?? ''
  const blrM1 = blrOk1.match(/shows \+(\d+)\/(\d+) staleDeleted=(\d+)/)
  ok('trigger 1 bengaluru count identity', !!blrM1 && blrAfter.shows === snap.blrShows + Number(blrM1[1]) - Number(blrM1[3]),
    `${snap.blrShows} + ${blrM1?.[1]} − ${blrM1?.[3]} = ${blrAfter.shows}`)

  ok('no cinema rows created', n1(`SELECT COUNT(*) AS n FROM cinemas`) === snap.cinemas)
  const dups = d1(`SELECT cinema_id, movie_id, show_date, start_time, screen, COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id IN (${kochiIds}) GROUP BY cinema_id, movie_id, show_date, start_time, screen HAVING n > 1`)
  ok('no duplicate (cinema, movie, date, time, screen) rows', dups.length === 0)
  ok('every show id stored exactly once', n1(`SELECT COUNT(*) AS n FROM (SELECT id FROM shows WHERE source='district' AND cinema_id IN (${kochiIds}) GROUP BY id HAVING COUNT(*) > 1)`) === 0)

  console.log('\n=== CRON TRIGGER 2 (idempotency) ===')
  await triggerCron('trigger 2', 2)

  // Trigger 2 must have fully written too — the location stamp bumps again.
  const locLsa2 = Number(d1(`SELECT last_synced_at AS lsa FROM sync_locations WHERE slug='kochi'`)[0]?.lsa ?? 0)
  ok('trigger 2 bumped the location stamp again', locLsa2 > locLsa1, `${locLsa1} → ${locLsa2}`)

  // Parse the [cron] kochi: OK lines in order — trigger 2 must have inserted 0.
  const okLines = workerLog.filter(l => /\[cron\] kochi: OK — /.test(l))
  const showsMatches = [...okLines.join('\n').matchAll(/shows \+(\d+)\/(\d+) staleDeleted=(\d+)/g)]
  ok('two kochi OK log lines parsed', showsMatches.length >= 2, `n=${showsMatches.length}`)
  if (showsMatches.length >= 2) {
    const [, ins1] = showsMatches[0]
    const [, ins2, , del2] = showsMatches[1]
    ok('trigger 2 inserted 0 shows', ins2 === '0', `+${ins2}`)
    const after2 = kochiShows()
    ok('count identity (trigger 2)', after2 === after1 + Number(ins2) - Number(del2),
      `${after1} + ${ins2} − ${del2} = ${after2}`)
  }
  ok('still no duplicates after trigger 2',
    d1(`SELECT cinema_id, movie_id, show_date, start_time, screen, COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id IN (${kochiIds}) GROUP BY cinema_id, movie_id, show_date, start_time, screen HAVING n > 1`).length === 0)
  const blrFinalShows = n1(`SELECT COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id IN (${blrIds})`)
  const blrOkLines = workerLog.filter(l => /\[cron\] bengaluru: OK — /.test(l))
  const blrShowsMatches = [...blrOkLines.join('\n').matchAll(/shows \+(\d+)\/(\d+) staleDeleted=(\d+)/g)]
  ok('two bengaluru OK log lines parsed', blrShowsMatches.length >= 2, `n=${blrShowsMatches.length}`)
  if (blrShowsMatches.length >= 2) {
    const [, blrIns2, , blrDel2] = blrShowsMatches[1]
    ok('bengaluru trigger 2 inserted 0 shows', blrIns2 === '0', `+${blrIns2}`)
    ok('bengaluru count identity (trigger 2)', blrFinalShows === blrAfter.shows + Number(blrIns2) - Number(blrDel2),
      `${blrAfter.shows} + ${blrIns2} − ${blrDel2} = ${blrFinalShows}`)
  }
  ok('bengaluru no duplicates',
    d1(`SELECT cinema_id, movie_id, show_date, start_time, screen, COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id IN (${blrIds}) GROUP BY cinema_id, movie_id, show_date, start_time, screen HAVING n > 1`).length === 0)

  console.log(`\n— final state —`)
  for (const c of d1(`SELECT id, name, district_cinema_id AS dcd, last_synced_at AS lsa FROM cinemas WHERE city='kochi' ORDER BY id`))
    console.log(`  ${c.id} ${c.name} — dcd=${c.dcd ?? 'NULL'} lsa=${c.lsa ?? 'NULL'}`)
  for (const c of d1(`SELECT id, name, district_cinema_id AS dcd, last_synced_at AS lsa FROM cinemas WHERE city='bengaluru' ORDER BY id`))
    console.log(`  ${c.id} ${c.name} — dcd=${c.dcd ?? 'NULL'} lsa=${c.lsa ?? 'NULL'}`)
}
catch (e) {
  console.log(`\nFAILED: ${e?.message ?? e}`)
  console.log('\n— last worker log lines —\n' + workerLog.filter(l => /\[cron\]|\[district-sync\]|error|Error/i.test(l)).slice(-50).join('\n'))
  killWorker()
  process.exit(1)
}

killWorker()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
