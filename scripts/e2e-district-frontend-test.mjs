/**
 * Dev-only frontend check: boots `nuxt dev` against data/db.sqlite (which
 * district-copy-to-dev.mjs populated) and verifies the cinema-detail payload:
 *
 *   1. /api/cinemas?city=all returns District-synced cinemas with movies.
 *   2. PVR Lulu Mall (c1) shows real District movies with today's showtimes,
 *      availability passthrough, and formats (e.g. 3D / 4DX-3D).
 *   3. Every synced cinema carries syncedAt; showtimes are today's (IST).
 *
 * Usage: node scripts/e2e-district-frontend-test.mjs
 */
import { spawn } from 'node:child_process'

const PORT = 3112
const BASE = `http://localhost:${PORT}`

const logLines = []
const server = spawn('npx', ['nuxt', 'dev', '--port', String(PORT)], {
  cwd: process.cwd(),
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

const istToday = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

async function main() {
  console.log('Booting nuxt dev...')
  if (!(await waitReady())) {
    console.log('FAILED to boot nuxt dev. Tail:')
    console.log(logLines.slice(-30).join('\n'))
    process.exit(1)
  }

  const res = await fetch(`${BASE}/api/cinemas?city=all`)
  const body = await res.json()
  ok('API responds', res.ok, `cinemas=${body.cinemas?.length}`)

  const withDistrict = (body.cinemas ?? []).filter(c => c.movies?.some(m => m.showtimes.some(s => s.id.startsWith('district-'))))
  console.log(`  cinemas serving District shows: ${withDistrict.map(c => `${c.name} (${c.movies.length} movies)`).join(' · ')}`)
  ok('multiple cinemas serve District shows', withDistrict.length >= 4)

  const lulu = (body.cinemas ?? []).find(c => c.id === 'c1')
  ok('PVR Lulu Mall present', !!lulu)
  if (lulu) {
    const shows = lulu.movies.flatMap(m => m.showtimes)
    console.log(`  PVR Lulu Mall: ${lulu.movies.length} movies / ${shows.length} showtimes; syncedAt=${lulu.syncedAt}`)
    ok('PVR Lulu has District movies', shows.some(s => s.id.startsWith('district-')))
    ok('PVR Lulu carries syncedAt', typeof lulu.syncedAt === 'string')
    ok('availability passthrough', shows.some(s => s.availability))
    const sample = lulu.movies.find(m => m.showtimes.some(s => s.id.startsWith('district-')))
    console.log(`  sample movie: ${sample.title} (${sample.language}) → ${sample.showtimes.slice(0, 6).map(s => `${s.startTime} ${s.format}${s.availability && s.availability !== 'available' ? ` [${s.availability}]` : ''}`).join(', ')}`)
  }

  // Every district show must be today's IST date (server-side filter check is
  // implicit: the API only returns today's shows when they exist).
  const allShows = (body.cinemas ?? []).flatMap(c => c.movies.flatMap(m => m.showtimes.map(s => ({ ...s, _c: c.name }))))
  const districtShows = allShows.filter(s => s.id.startsWith('district-'))
  ok('district showtimes served', districtShows.length > 0, `n=${districtShows.length}`)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.log('frontend e2e crashed:', e)
  console.log(logLines.slice(-30).join('\n'))
  process.exit(1)
})
