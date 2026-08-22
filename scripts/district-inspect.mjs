// TEMP inspection: dump __NEXT_DATA__ structure of a District cinema page
import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync(process.argv[2] ?? 'data/district-cd.html', 'utf8')
const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
if (!m) { console.log('NO __NEXT_DATA__'); process.exit(1) }
const json = JSON.parse(m[1])
writeFileSync('data/district-nextdata.json', JSON.stringify(json))

// Walk to find serverState
function findKey(node, key, depth = 0, path = 'root') {
  if (depth > 8 || node == null || typeof node !== 'object') return null
  if (!Array.isArray(node) && key in node) return { node, path }
  for (const [k, v] of Object.entries(node)) {
    const r = findKey(v, key, depth + 1, `${path}.${k}`)
    if (r) return r
  }
  return null
}

const ss = findKey(json, 'serverState')
console.log('serverState path:', ss?.path)
const serverState = ss?.node?.serverState ?? {}
console.log('serverState keys:', Object.keys(serverState))
for (const [cid, v] of Object.entries(serverState)) {
  console.log(`\n== cinema ${cid} top-level keys:`, Object.keys(v ?? {}))
  const meta = v?.meta
  if (meta) {
    console.log('meta keys:', Object.keys(meta))
    console.log('meta.cinema:', JSON.stringify(meta.cinema, null, 1)?.slice(0, 2500))
    if (meta.groupedMovies) {
      console.log('groupedMovies count:', meta.groupedMovies.length)
      console.log('groupedMovies[0]:', JSON.stringify(meta.groupedMovies[0], null, 1)?.slice(0, 1800))
    }
  }
  if (v?.arrangedSessions) {
    console.log('arrangedSessions count:', v.arrangedSessions.length)
    console.log('arrangedSessions[0]:', JSON.stringify(v.arrangedSessions[0], null, 1)?.slice(0, 2200))
    if (v.arrangedSessions[1]) console.log('arrangedSessions[1]:', JSON.stringify(v.arrangedSessions[1], null, 1)?.slice(0, 1200))
  }
}
