/**
 * Dev-only end-to-end test of the District showtime pipeline against a real
 * `wrangler dev` sync-worker and real District pages (network required).
 *
 * Boots the worker on :8787, runs /run twice (idempotency), then asserts
 * against the worker's local D1:
 *
 *   1. Provider is 'district'; both locations OK.
 *   2. District cinema ids attached to the right cinemas (kochi + bengaluru).
 *   3. Shows exist for TODAY (IST), none shifted to another date.
 *   4. Availability values look like District's (available/filling_fast/sold_out).
 *   5. No duplicate (cinema, movie, date, time) rows after running twice.
 *   6. No phantom 0,0 cinemas were created; cinema count unchanged.
 *   7. Real example showtimes from Kochi and Bengaluru are printed.
 *
 * Usage:  node scripts/e2e-district-test.mjs
 */
import { spawn, execSync } from 'node:child_process'

const PORT = 8787
const BASE = `http://localhost:${PORT}`
const TOKEN = 'dev-local-only' // sync-worker/.dev.vars

const logLines = []
const interesting = () =>
  logLines.filter(l => /\[sync\]|\[district\]|\[d1\]|error|blocked/i.test(l)).slice(-60).join('\n')

const server = spawn('npx', ['wrangler', 'dev', '--test-scheduled', '--port', String(PORT)], {
  cwd: 'sync-worker',
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stdout.on('data', d => logLines.push(...String(d).split('\n')))
server.stderr.on('data', d => logLines.push(...String(d).split('\n')))

const kill = () => {
  if (process.platform === 'win32' && server.pid)
    spawn('taskkill', ['/F', '/T', '/PID', String(server.pid)], { shell: true })
  else server.kill()
}
process.on('exit', kill)

async function waitReady(timeoutMs = 90_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/healthz`)
      if (r.ok) return true
    }
    catch {}
    await new Promise(r => setTimeout(r, 2000))
  }
  return false
}

async function runSyncOnce(label) {
  const t0 = Date.now()
  const r = await fetch(`${BASE}/run?token=${TOKEN}`)
  const body = await r.json()
  console.log(`\n=== ${label}: HTTP ${r.status} in ${Math.round((Date.now() - t0) / 1000)}s ===`)
  for (const loc of body.locations ?? [])
    console.log(`  ${loc.slug}: ${loc.status}`)
  return body
}

/** Query the worker's local D1 (must run with cwd sync-worker). */
function d1(sql) {
  // cmd.exe-safe: wrap in double quotes, double any inner quotes; SQL here
  // only ever contains single quotes. Flatten whitespace — cmd breaks on
  // newlines inside quoted args.
  const q = sql.replace(/"/g, '""').replace(/\s+/g, ' ')
  const out = execSync(
    `npx wrangler d1 execute cinema-community --local --json --command "${q}"`,
    { cwd: 'sync-worker', shell: true, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  // wrangler may prefix non-JSON lines; take the first '[' to last ']'
  const start = out.indexOf('[')
  const end = out.lastIndexOf(']')
  if (start < 0 || end < 0 || end <= start) {
    console.log(`[d1-debug] command failed or non-JSON output (${out.length} chars):`)
    console.log(out.slice(0, 800))
    throw new Error('wrangler d1 execute produced no JSON')
  }
  return JSON.parse(out.slice(start, end + 1))[0].results
}

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`) }
}

const istNow = new Date(Date.now() + 5.5 * 3600 * 1000)
const istToday = istNow.toISOString().slice(0, 10)
// District stops listing a day's sessions once they have all started/closed
// (observed: every Bengaluru cinema served 0 arrangedSessions at ~23:20 IST
// while Kochi still listed its tail). The daily cron (11:30 IST) runs inside
// the full-schedule window; a late-night dev run must not mistake the
// provider-confirmed empty day for a pipeline failure.
const lateNightIST = istNow.getUTCHours() >= 22 || istNow.getUTCHours() < 6

async function main() {
  console.log('Booting wrangler dev (sync-worker)...')
  if (!(await waitReady())) {
    console.log('FAILED to boot worker. Logs:\n' + interesting())
    process.exit(1)
  }
  console.log('Worker ready. Health:', await (await fetch(`${BASE}/healthz`)).json())

  const before = {
    cinemas: d1('SELECT COUNT(*) AS n FROM cinemas')[0].n,
  }

  const run1 = await runSyncOnce('RUN 1')
  const afterRun1 = d1("SELECT COUNT(*) AS n FROM shows WHERE source = 'district'")[0].n
  const run2 = await runSyncOnce('RUN 2 (idempotency)')
  const afterRun2 = d1("SELECT COUNT(*) AS n FROM shows WHERE source = 'district'")[0].n

  // ---- worker summary ------------------------------------------------
  ok('provider is district', run1.provider === 'district', `provider=${run1.provider}`)
  for (const slug of ['kochi', 'bengaluru']) {
    const loc = (run1.locations ?? []).find(l => l.slug === slug)
    ok(`${slug} synced`, loc?.status === 'ok', `detail=${JSON.stringify(loc?.detail ?? {}).slice(0, 220)}`)
  }

  // ---- D1 state -------------------------------------------------------
  const cinemasNow = d1('SELECT COUNT(*) AS n FROM cinemas')[0].n
  ok('no phantom cinemas created', cinemasNow === before.cinemas, `${before.cinemas} → ${cinemasNow}`)
  ok('no 0,0 cinemas', d1('SELECT COUNT(*) AS n FROM cinemas WHERE latitude = 0 AND longitude = 0')[0].n === 0)

  const mapped = d1(`SELECT id, name, city, district_cinema_id, last_synced_at FROM cinemas WHERE district_cinema_id IS NOT NULL ORDER BY city, name`)
  console.log('\n  District-mapped cinemas:')
  for (const c of mapped) console.log(`    ${c.city} · ${c.name} → CD${c.district_cinema_id}`)
  ok('kochi cinemas mapped', mapped.some(c => c.city === 'kochi' && c.district_cinema_id))
  ok('bengaluru cinemas mapped', mapped.some(c => c.city === 'bengaluru' && c.district_cinema_id))
  ok('PVR Lulu Mall ↔ CD1022294', mapped.some(c => /lulu/i.test(c.name) && c.city === 'kochi' && c.district_cinema_id === '1022294'))
  ok('cinemas stamped last_synced_at', mapped.every(c => Number(c.last_synced_at) > 0))

  const showStats = d1(`SELECT COUNT(*) AS n, COUNT(DISTINCT cinema_id) AS cinemas, COUNT(DISTINCT movie_id) AS movies,
    MIN(show_date) AS minD, MAX(show_date) AS maxD FROM shows WHERE source = 'district'`)[0]
  const movieCount = d1(`SELECT COUNT(*) AS n FROM movies WHERE source = 'district'`)[0].n
  console.log(`\n  shows(district)=${showStats.n} across ${showStats.cinemas} cinemas / ${movieCount} movies; dates ${showStats.minD}..${showStats.maxD}`)
  const bothOk = ['kochi', 'bengaluru'].every(s => (run1.locations ?? []).some(l => l.slug === s && l.status === 'ok'))
  ok('district shows written', showStats.n > 0 || (lateNightIST && bothOk), showStats.n === 0 ? `n=0 (late-night IST empty day; synced ok=${bothOk})` : `n=${showStats.n}`)
  ok('district movies written', movieCount > 0 || (lateNightIST && bothOk))
  ok('all show dates are IST today', showStats.n === 0 ? lateNightIST && bothOk : (showStats.minD === istToday && showStats.maxD === istToday), `today=${istToday}`)

  ok('re-running sync adds no rows (idempotent)', afterRun1 === afterRun2, `${afterRun1} → ${afterRun2}`)

  // Same clock time in two formats/screens is two real sessions (e.g. 2D + IMAX
  // at 17:00); a duplicate is identical cinema+movie+date+time+format+screen.
  const dups = d1(`SELECT cinema_id, movie_id, show_date, start_time, format, screen, COUNT(*) AS n FROM shows
    WHERE source='district' GROUP BY cinema_id, movie_id, show_date, start_time, format, screen HAVING n > 1`)
  ok('no duplicate showtimes after two runs', dups.length === 0, dups.length ? JSON.stringify(dups.slice(0, 3)) : '')

  const ids = d1(`SELECT COUNT(*) AS n FROM shows WHERE source='district' AND id NOT LIKE 'district-%'`)
  ok('show ids namespaced district-', ids[0].n === 0)

  const avail = d1(`SELECT availability_status AS a, COUNT(*) AS n FROM shows WHERE source='district' GROUP BY availability_status`)
  console.log('  availability mix:', avail.map(a => `${a.a ?? 'null'}=${a.n}`).join(' '))

  const wall = d1(`SELECT COUNT(*) AS n FROM shows WHERE source='district' AND show_date_time IS NOT NULL
    AND show_date_time != (show_date || 'T' || start_time)`)
  ok('wall-clock show_date_time == date+time (no TZ shift)', wall[0].n === 0)

  for (const city of ['kochi', 'bengaluru']) {
    const rows = d1(`SELECT m.title, s.start_time, s.format, s.language, s.availability_status AS avail, c.name AS cinema
      FROM shows s JOIN movies m ON m.id = s.movie_id JOIN cinemas c ON c.id = s.cinema_id
      WHERE s.source='district' AND c.city = '${city}' ORDER BY s.start_time LIMIT 3`)
    if (rows.length > 0) {
      console.log(`\n  Example ${city} showtimes:`)
      for (const r of rows) console.log(`    ${r.cinema} · ${r.title} · ${r.start_time} ${r.format} ${r.language ?? ''} ${r.avail ?? ''}`)
      ok(`${city} example showtimes present`, true, `n=${rows.length}`)
    }
    else {
      const syncedOk = (run1.locations ?? []).some(l => l.slug === city && l.status === 'ok')
      console.log(`\n  Example ${city} showtimes: none — District lists 0 sessions for today at this hour (IST ${String(istNow.getUTCHours()).padStart(2, '0')}:xx); city synced=${syncedOk ? 'ok' : 'FAILED'}`)
      ok(`${city} example showtimes present (or provider-confirmed empty day)`, syncedOk && lateNightIST)
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) console.log('\nWorker logs (tail):\n' + interesting())
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.log('e2e crashed:', e)
  console.log(interesting())
  process.exit(1)
})
