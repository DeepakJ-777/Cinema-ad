/**
 * Dev-only e2e test for the sync worker. Two phases:
 *
 *  A) USE_FIXTURE=1 — full pipeline against local D1:
 *     locations from D1, kochi (KOCH) syncs, bengaluru skipped (no region_code),
 *     venue name-matching attaches shows to seed cinemas, stale cleanup works,
 *     fixture runs are idempotent.
 *     (2026-08-17: both cities now carry District region codes, so bengaluru
 *     also runs the fixture — its venues match nothing and 0 shows land.)
 *  B) Real provider — one honest attempt at BookMyShow; expects the documented
 *     Cloudflare managed-challenge refusal, the run stopping, and no writes.
 *
 * Usage: node scripts/e2e-sync-test.mjs
 */
import { spawn } from 'node:child_process'

const WORKER_DIR = new URL('../sync-worker', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const logLines = []

function startWorker(port, extraArgs = []) {
  logLines.length = 0
  const p = spawn('npx', ['wrangler', 'dev', '--test-scheduled', '--port', String(port), ...extraArgs], {
    cwd: WORKER_DIR, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  p.stdout.on('data', d => logLines.push(...String(d).split('\n')))
  p.stderr.on('data', d => logLines.push(...String(d).split('\n')))
  return p
}
const kill = p => {
  if (process.platform === 'win32' && p.pid) spawn('taskkill', ['/F', '/T', '/PID', String(p.pid)], { shell: true })
  else p.kill()
}
async function waitReady(base, timeoutMs = 120_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { if ((await fetch(`${base}/healthz`)).ok) return true } catch {}
    await new Promise(r => setTimeout(r, 3000))
  }
  return false
}
async function d1(sql) {
  // One quoted command string — with shell:true, an args array would split
  // the SQL on spaces. SQL here never contains double quotes.
  const cmd = `npx wrangler d1 execute cinema-community --local --command "${sql}"`
  const r = await new Promise((resolve) => {
    const p = spawn(cmd, { cwd: WORKER_DIR, shell: true, stdio: ['pipe', 'pipe', 'ignore'] })
    let out = ''
    p.stdout.on('data', d => { out += d })
    p.on('exit', () => resolve(out))
  })
  const start = r.indexOf('[') // strip any wrangler banner before the JSON
  return start >= 0 ? r.slice(start) : '[]'
}

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

try {
  // ---------------- Phase A: fixture provider, full pipeline ----------------
  console.log('— Phase A: USE_FIXTURE=1 (full pipeline, local D1) —')
  let w = startWorker(8791, ['--var', 'USE_FIXTURE:1'])
  process.on('exit', () => kill(w))
  if (!(await waitReady('http://localhost:8791'))) throw new Error('worker A never became ready')

  const run1 = await (await fetch('http://localhost:8791/run?token=dev-local-only')).json()
  const kochi = run1.locations.find(l => l.slug === 'kochi')
  const blr = run1.locations.find(l => l.slug === 'bengaluru')
  ok('provider is fixture', run1.provider === 'bookmyshow-fixture')
  ok('locations read from D1 (kochi+bengaluru)', run1.locations.length === 2)
  ok('bengaluru runs the fixture but matches nothing (fixture venues are Kochi-side)', blr?.status === 'ok' && (blr?.detail?.showsUpserted ?? 0) === 0, JSON.stringify(blr?.status))
  ok('kochi synced OK', kochi?.status === 'ok', JSON.stringify(kochi))
  const d = kochi?.detail ?? {}
  ok('2 venues matched by normalized name', d.venuesMatched?.length === 2, JSON.stringify(d.venuesMatched))
  ok('unmatched venue skipped (EVM Perumbavoor)', d.venuesUnmatched?.length === 1 && d.venuesUnmatched[0].name.includes('EVM'), JSON.stringify(d.venuesUnmatched))
  ok('1 movie upserted', d.moviesUpserted === 1)
  ok('2 shows upserted (unmatched venue dropped)', d.showsUpserted === 2)

  const run2 = await (await fetch('http://localhost:8791/run?token=dev-local-only')).json()
  const k2 = run2.locations.find(l => l.slug === 'kochi')
  ok('fixture re-run idempotent', k2?.detail?.showsUpserted === 2 && run2.stoppedEarly === undefined)
  kill(w); await new Promise(r => setTimeout(r, 4000))

  // ---------------- D1 state verification ----------------
  console.log('\n— D1 state after fixture sync —')
  const shows = JSON.parse(await d1("SELECT id, cinema_id, movie_id, show_date, start_time, availability_status, source, session_id FROM shows WHERE source='bookmyshow' ORDER BY id") || '[]').map(x => x.results ?? [])
  const flat = shows.flat()
  console.log('  shows:', JSON.stringify(flat))
  ok('exactly 2 BMS shows in D1', flat.length === 2)
  ok('session ids match fixture (43619, 10544)', flat.some(s => s.session_id === '43619') && flat.some(s => s.session_id === '10544'))
  ok('shows attached to seed cinemas c1/c5', flat.some(s => s.cinema_id === 'c1') && flat.some(s => s.cinema_id === 'c5'))
  const movies = JSON.parse(await d1("SELECT id, title, event_code, source FROM movies WHERE source='bookmyshow'") || '[]').map(x => x.results ?? []).flat()
  ok('1 BMS movie row (bms-ET00439318)', movies.length === 1 && movies[0]?.id === 'bms-ET00439318')
  const cinemaMatch = JSON.parse(await d1("SELECT id, name, venue_code FROM cinemas WHERE venue_code IS NOT NULL") || '[]').map(x => x.results ?? []).flat()
  console.log('  cinema matches:', JSON.stringify(cinemaMatch))
  ok('venue_code recorded on matched cinemas (c1=VKJP, c5=EYUA)', cinemaMatch.some(c => c.id === 'c1' && c.venue_code === 'VKJP') && cinemaMatch.some(c => c.id === 'c5' && c.venue_code === 'EYUA'))

  // inject a stale show that a later successful sync should delete
  await d1("INSERT INTO shows (id, cinema_id, movie_id, show_date, start_time, format, screen, session_id, source, last_synced_at) VALUES ('bms-99999','c1','bms-ET00439318','2026-08-16','11:11','2D','','99999','bookmyshow', 1000)")
  console.log('\n— stale cleanup run (injected bms-99999 with last_synced_at=1000) —')
  w = startWorker(8792, ['--var', 'USE_FIXTURE:1'])
  process.on('exit', () => kill(w))
  if (!(await waitReady('http://localhost:8792'))) throw new Error('worker A2 never became ready')
  const run3 = await (await fetch('http://localhost:8792/run?token=dev-local-only')).json()
  const k3 = run3.locations.find(l => l.slug === 'kochi')
  ok('stale show deleted by successful sync', k3?.detail?.staleShowsDeleted === 1, JSON.stringify(k3?.detail))
  kill(w); await new Promise(r => setTimeout(r, 4000))

  // ---------------- Phase B: real provider, expects polite refusal ----------------
  console.log('\n— Phase B: real BookMyShow provider (expects documented block, then STOP) —')
  const before = JSON.parse(await d1("SELECT COUNT(*) AS n FROM shows WHERE source='bookmyshow'") || '[]').map(x => x.results ?? []).flat()[0]?.n
  w = startWorker(8793, ['--var', 'USE_BMS:1']) // District is the default now; opt into BMS explicitly
  process.on('exit', () => kill(w))
  if (!(await waitReady('http://localhost:8793'))) throw new Error('worker B never became ready')
  const real = await (await fetch('http://localhost:8793/run?token=dev-local-only')).json()
  console.log('  provider:', real.provider)
  console.log('  stoppedEarly:', real.stoppedEarly ?? '(none)')
  ok('real provider id', real.provider === 'bookmyshow')
  ok('run stopped on the documented block', typeof real.stoppedEarly === 'string' && /blocked/i.test(real.stoppedEarly), JSON.stringify(real.stoppedEarly))
  kill(w); await new Promise(r => setTimeout(r, 4000))

  const after = JSON.parse(await d1("SELECT COUNT(*) AS n FROM shows WHERE source='bookmyshow'") || '[]').map(x => x.results ?? []).flat()[0]?.n
  ok('no writes during the blocked real run', before === after, `before=${before} after=${after}`)

  console.log('\n— worker log lines ([sync]) —')
  console.log(logLines.filter(l => l.includes('[sync]')).slice(-30).join('\n') || '(none captured)')
  console.log(`\n${pass} passed, ${fail} failed`)
}
finally {
  setTimeout(() => process.exit(fail ? 1 : 0), 1500)
}
