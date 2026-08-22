/**
 * Dev-only inspector for BookMyShow SPA state blobs saved by bms-probe.
 * Usage: node scripts/bms-inspect.mjs data/bms-cinemas.html
 */
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
const html = readFileSync(file, 'utf8')

const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)
console.log('state found:', !!m, m ? 'bytes=' + m[1].length : '')
if (m) {
  const s = JSON.parse(m[1])
  const walk = (o, path, depth) => {
    if (depth > 3 || o == null || typeof o !== 'object') return
    const keys = Object.keys(o)
    const more = keys.length > 12 ? ', +' + (keys.length - 12) : ''
    console.log('  '.repeat(depth) + path + ' {' + keys.slice(0, 12).join(',') + more + '}')
    if (depth < 2) for (const k of keys.slice(0, 8)) walk(o[k], path + '.' + k, depth + 1)
  }
  walk(s, 'state', 0)
  writeFileSync(file.replace('.html', '-state.json'), JSON.stringify(s, null, 1))
  console.log('wrote', file.replace('.html', '-state.json'))
}

console.log('--- robots.txt User-agent: * section ---')
const robots = readFileSync('data/bms-robots.txt', 'utf8')
let inStar = false
for (const l of robots.split(/\r?\n/)) {
  if (/^user-agent:\s*\*/i.test(l)) { inStar = true; console.log(l); continue }
  if (/^user-agent:/i.test(l) && inStar) inStar = false
  if (inStar && /^(disallow|allow|crawl-delay)/i.test(l)) console.log('  ' + l.trim())
}
