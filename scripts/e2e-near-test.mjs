/**
 * Dev-only end-to-end test of the Near Me pipeline against a real `nuxt dev`
 * server. Boots the server on a scratch port, then exercises:
 *
 *   1. First press  — /api/cinemas/near at the user's area (cell t9wm,
 *      Kollam/Alappuzha — deliberately NOT Kochi/Bengaluru) → live Overpass
 *      sweep, discovery, D1 insert, nearest-first results.
 *   2. Second press — same coords → served from D1 via discovery_cache,
 *      no Overpass request, identical results.
 *   3. Persistence  — /api/cinemas?city=all includes the osm-* discoveries.
 *   4. Full smoke suite (scripts/smoke-test.mjs) against the same server.
 *
 * Usage: node scripts/e2e-near-test.mjs
 */
import { spawn } from 'node:child_process'

const PORT = 3111
const BASE = `http://localhost:${PORT}`
// Center of the failing browser request's geohash cell t9wm (Kerala).
const LAT = 9.4
const LNG = 76.46

const logLines = []
const tail = () => {
  const interesting = logLines.filter(l =>
    /\[overpass\]|\[near\]|\[dev-db\]|unhandled|error/i.test(l))
  return interesting.slice(-40).join('\n')
}

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

async function waitReady(timeoutMs = 180_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/cinemas?city=kochi`)
      if (r.ok) return true
    }
    catch {}
    await new Promise(r => setTimeout(r, 2000))
  }
  return false
}

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

try {
  console.log(`— booting nuxt dev on :${PORT} (first compile may take a while) —`)
  if (!(await waitReady())) throw new Error('dev server never became ready')
  console.log('— server ready —')

  console.log('\n— press 1: live discovery at user area (t9wm, NOT Kochi/Bengaluru) —')
  const t0 = Date.now()
  const r1 = await (await fetch(`${BASE}/api/cinemas/near?lat=${LAT}&lng=${LNG}`)).json()
  console.log(`   (${((Date.now() - t0) / 1000).toFixed(1)}s) source=${r1.source} added=${r1.added} nearby=${r1.nearbyCount} cell=${r1.cell}`)
  console.log(`   diagnostics=${JSON.stringify(r1.diagnostics)}`)
  console.log('   first 5:', r1.cinemas.slice(0, 5).map(c => `${c.name}@${c.distanceKm}km`).join(' | '))
  ok('sweep succeeded (live), not unavailable', r1.source === 'live', `got ${r1.source}`)
  ok('cinemas discovered and added', r1.added > 0, `added=${r1.added}`)
  ok('nearby count > 0', r1.nearbyCount > 0)
  ok('results sorted nearest-first', r1.cinemas.every((c, i, a) => i === 0 || a[i - 1].distanceKm <= c.distanceKm))
  ok('coords are at the user area, not seeded cities', r1.cinemas.every(c =>
    Math.abs(c.lat - LAT) < 0.35 && Math.abs(c.lng - LNG) < 0.35))
  ok('dev diagnostics exposed in dev', r1.diagnostics?.overpassElements > 0)
  ok('all results within 25 km', r1.cinemas.every(c => c.distanceKm <= r1.radiusKm))

  console.log('\n— press 2: repeat lookup must reuse D1 (no Overpass) —')
  const overpassBefore = logLines.filter(l => l.includes('[overpass]')).length
  const t1 = Date.now()
  const r2 = await (await fetch(`${BASE}/api/cinemas/near?lat=${LAT}&lng=${LNG}`)).json()
  const overpassAfter = logLines.filter(l => l.includes('[overpass]')).length
  console.log(`   (${((Date.now() - t1) / 1000).toFixed(1)}s) source=${r2.source} added=${r2.added} nearby=${r2.nearbyCount}`)
  ok('second press served from cache', r2.source === 'cache', `got ${r2.source}`)
  ok('no Overpass request on repeat', overpassAfter === overpassBefore)
  ok('repeat adds nothing', r2.added === 0)
  ok('repeat returns same nearby set', r2.nearbyCount === r1.nearbyCount)

  console.log('\n— persistence: /api/cinemas?city=all includes discoveries —')
  const all = await (await fetch(`${BASE}/api/cinemas?city=all`)).json()
  const osm = all.cinemas.filter(c => c.id.startsWith('osm-'))
  console.log(`   total=${all.cinemas.length} osm-discovered=${osm.length}`)
  ok('OSM cinemas persisted into the browse payload', osm.length >= r1.added - 2)

  console.log('\n— full smoke suite —')
  await new Promise((resolve) => {
    const smoke = spawn('node', ['scripts/smoke-test.mjs', BASE], { cwd: process.cwd(), shell: true, stdio: 'inherit' })
    smoke.on('exit', code => { ok('smoke-test.mjs passed', code === 0, `exit=${code}`); resolve() })
  })

  console.log(`\n— server log tail (overpass/near lines) —\n${tail()}`)
  console.log(`\n${pass} passed, ${fail} failed`)
}
finally {
  kill()
  setTimeout(() => process.exit(fail ? 1 : 0), 1500)
}
