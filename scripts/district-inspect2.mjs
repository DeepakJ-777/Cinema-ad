// TEMP inspection 2: full session object + meta.movies + dates present
import { readFileSync } from 'node:fs'

const json = JSON.parse(readFileSync('data/district-nextdata.json', 'utf8'))
const data = json.props.pageProps.data
const serverState = data.serverState
const cid = Object.keys(serverState)[0]
const v = serverState[cid]

const sess = v.arrangedSessions[0].sessions[0]
console.log('=== FULL SESSION ===')
console.log(JSON.stringify(sess, null, 1))

console.log('\n=== all sessions summary ===')
for (const grp of v.arrangedSessions) {
  for (const s of grp.sessions) {
    console.log(JSON.stringify({
      sid: s.sid, mid: s.mid, fid: s.fid, showTime: s.showTime, closeTime: s.closeTime,
      lang: s.lang, scrnFmt: s.scrnFmt, subtitle: s.subtitle, audi: s.audi,
      total: s.total, avail: s.avail, seatStatus: s.seatStatus, statusColor: s.statusColor,
      premium: s.premium, premiumLabel: s.premiumLabel, maxTkt: s.maxTkt, tFee: s.tFee,
      gnrs: s.gnrs, contentId: s.contentId, encSessionId: s.encSessionId, sType: s.sType,
      areasAvail: (s.areas ?? []).map(a => `${a.label}:${a.sAvail}/${a.sTotal}:${a.seatStatus}`),
    }))
  }
}

console.log('\n=== meta.movies sample ===')
const movies = v.meta.movies
console.log('type:', typeof movies, Array.isArray(movies) ? 'array' : 'object-keys:' + Object.keys(movies ?? {}).slice(0, 10).join(','))
if (Array.isArray(movies)) console.log(JSON.stringify(movies[0], null, 1)?.slice(0, 1200))
else {
  const k = Object.keys(movies ?? {})[0]
  if (k) console.log(JSON.stringify(movies[k], null, 1)?.slice(0, 1200))
}

console.log('\n=== serverTime / pageData keys ===')
console.log('serverTime:', v.serverTime)
console.log('pageData keys:', Object.keys(v.pageData ?? {}))
console.log('data keys:', Object.keys(v.data ?? {}))
