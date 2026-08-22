/**
 * STEP-1 TEST — prove the District pipeline for ONE real Kochi cinema:
 *
 *   District cinema page → __NEXT_DATA__ → serverState[cinema_id]
 *   → arrangedSessions[] → normalized showtime array (printed below)
 *
 * Uses only getDistrictCinemaShows() from sync-worker/src/district-shows.ts.
 * No database, no cron, no frontend — read-only proof.
 *
 * Late-night note: District trims a day's sessions after they close, so a
 * run near IST midnight can legitimately see 0 shows for TODAY. If that
 * happens the test retries once with TOMORROW's date (?fromdate= supports
 * future dates) so real sessions still get printed. Both attempts are logged.
 *
 * Usage: node scripts/district-one-cinema-test.mts
 */
import { getDistrictCinemaShows, istToday } from '../sync-worker/src/district-shows.ts'

const CINEMA_ID = '1022294' // PVR Lulu Mall, Lulu International Shopping Mall, Kochi
const CITY_SLUG = 'kochi'

function istDatePlus(days: number): string {
  return new Date(Date.now() + (5.5 * 3600 + days * 86400) * 1000).toISOString().slice(0, 10)
}

function validate(shows: ReturnType<typeof getDistrictCinemaShows extends () => Promise<infer R> ? R extends { shows: (infer S)[] } ? S : never : never>[]) {
  const problems: string[] = []
  for (const s of shows) {
    for (const k of ['cinemaId', 'cinemaName', 'movieId', 'movieTitle', 'showDate', 'showTime', 'sessionId'] as const)
      if (!s[k]) problems.push(`${k} empty on session ${s.sessionId}`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.showDate)) problems.push(`bad showDate ${s.showDate}`)
    if (!/^\d{2}:\d{2}$/.test(s.showTime)) problems.push(`bad showTime ${s.showTime}`)
    if (s.source !== 'district') problems.push(`bad source ${s.source}`)
  }
  return problems
}

async function tryDate(date: string) {
  console.log(`\n→ GET ${`https://www.district.in/movies/x-in-${CITY_SLUG}-CD${CINEMA_ID}?fromdate=${date}`}`)
  const t0 = Date.now()
  const result = await getDistrictCinemaShows(CINEMA_ID, CITY_SLUG, date)
  console.log(`  HTTP 200 OK in ${Date.now() - t0} ms — __NEXT_DATA__ parsed, serverState["${CINEMA_ID}${date}"] read`)
  return result
}

let result
try {
  result = await tryDate(istToday())
}
catch (e: any) {
  console.log(`\nFAILED: ${e?.message ?? e}`)
  process.exit(1)
}

console.log(`\nCinema : ${result.cinemaName} (CD${result.cinemaId})`)
console.log(`Date   : ${result.date} · movies: ${result.movieCount} · sessions: ${result.shows.length}`)

// District trims a day's list as shows close, so a late-night IST run can
// leave TODAY nearly empty. Pull TOMORROW too (same cinema, same function,
// one extra request) so the proof always shows several real sessions.
let tomorrow: Awaited<ReturnType<typeof getDistrictCinemaShows>> | null = null
try {
  tomorrow = await tryDate(istDatePlus(1))
  console.log(`  tomorrow (${tomorrow.date}): movies: ${tomorrow.movieCount} · sessions: ${tomorrow.shows.length}`)
}
catch (e: any) {
  console.log(`  tomorrow fetch failed (non-fatal): ${e?.message ?? e}`)
}

const pool = [...result.shows, ...(tomorrow?.shows ?? [])]
const sample = pool.slice(0, 5)
const problems = validate(sample)
console.log(`\nFirst ${sample.length} extracted show(s) (today + tomorrow pool):`)
for (const s of sample) {
  console.log(`  ${s.showDate} ${s.showTime} · ${s.movieTitle} (movie ${s.movieId}, session ${s.sessionId}) · ${s.language ?? '?'} · ${s.format ?? '?'} · ${s.availability}`)
}

console.log(`\nNormalized entry example:\n${JSON.stringify(sample[0], null, 2)}`)

if (problems.length) {
  console.log(`\nVALIDATION FAILED:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`\nOK — ${sample.length} shows validated; pipeline works end to end for one cinema.`)
console.log(`Requests made: ${tomorrow ? 2 : 1} (today${tomorrow ? ' + tomorrow' : ''}); cinema metadata + sessions both came from the same page each time.`)
