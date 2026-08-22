// TEMP inspection 3: city cinemas listing page structure
import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync(process.argv[2] ?? 'data/district-kochi-cinemas.html', 'utf8')
const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
if (!m) { console.log('NO __NEXT_DATA__'); process.exit(1) }
const json = JSON.parse(m[1])
writeFileSync('data/district-city.json', JSON.stringify(json))

// find arrays of objects that look like cinemas (have id + name + lat/lon or address)
const hits = []
const seen = new Set()
function walk(node, path, depth) {
  if (depth > 12 || node == null || typeof node !== 'object' || seen.has(node)) return
  seen.add(node)
  if (Array.isArray(node)) {
    if (node.length && typeof node[0] === 'object' && node[0] != null) {
      const k = Object.keys(node[0])
      if ((k.includes('name') || k.includes('cinemaName')) && (k.includes('id') || k.includes('cinemaId') || k.includes('code')))
        hits.push({ path, len: node.length, keys: k, sample: node[0] })
    }
    node.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1))
  }
  else {
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, depth + 1)
  }
}
walk(json, 'root', 0)
for (const h of hits.slice(0, 12)) {
  console.log(`\n== ${h.path} (len=${h.len}) keys: ${h.keys.join(',')}`)
  console.log(JSON.stringify(h.sample, null, 1).slice(0, 900))
}
