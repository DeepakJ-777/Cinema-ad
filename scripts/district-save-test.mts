/**
 * STEP 2 TEST — save the verified District showtime data into local D1.
 *
 *   District → getDistrictCinemaShows() → match existing cinema → upsert
 *   movies → upsert shows → D1 (local, via wrangler d1 execute --local)
 *
 * ONE cinema only: PVR Lulu, Kochi (District cinema CD1022294).
 * No cron, no Bengaluru, no frontend changes, no stale cleanup, no matching
 * beyond this one cinema. The existing schema already carries the District
 * identifiers (migrations 0004/0005) — the preflight proves it, so NO new
 * migration is expected.
 *
 * Proves:
 *   1. The existing cinema row is matched and stamped (never duplicated).
 *   2. Movies upsert by District movie id  → district-{movieId}.
 *   3. Shows  upsert by District session id → district-{sessionId} — running
 *      the sync TWICE inserts zero new rows the second time.
 *   4. The existing cinema API (/api/cinemas) serves the stored shows after
 *      the standard dev-db bridge (scripts/district-copy-to-dev.mjs).
 *
 * Usage: node scripts/district-save-test.mts
 */
import { execSync, spawn } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { getDistrictCinemaShows, istToday } from '../sync-worker/src/district-shows.ts'

const CINEMA_ID = '1022294' // PVR Lulu, Lulu International Shopping Mall, Kochi
const CITY_SLUG = 'kochi'
const TMP_SQL = 'tmp-district-upsert.sql' // created inside sync-worker/, removed after use
const API_PORT = 3117

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`) }
}

// ---- local D1 access (established repo pattern: wrangler CLI) --------------

function d1(sql) {
  const q = sql.replace(/"/g, '""').replace(/\s+/g, ' ')
  const out = execSync(
    `npx wrangler d1 execute cinema-community --local --json --command "${q}"`,
    { cwd: 'sync-worker', shell: true, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const start = out.indexOf('[')
  const end = out.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error(`wrangler d1 (command) produced no JSON: ${out.slice(0, 200)}`)
  return JSON.parse(out.slice(start, end + 1))[0].results ?? []
}

function d1File(file) {
  const out = execSync(
    `npx wrangler d1 execute cinema-community --local --json --file ${file}`,
    { cwd: 'sync-worker', shell: true, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const start = out.indexOf('[')
  const end = out.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error(`wrangler d1 (file) produced no JSON: ${out.slice(0, 200)}`)
  JSON.parse(out.slice(start, end + 1)) // batch results — success is all we need
}

// ---- SQL helpers -----------------------------------------------------------

const sq = v => (v == null || v === '') ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`

/** Deterministic hue per title — same algorithm as sync-worker/src/d1.ts. */
function hueOf(title) {
  let h = 0
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** One batched SQL file: movie upserts, show upserts, cinema stamp. */
function buildSql(res, cinemaRowId, nowSec) {
  const stmts = []

  const movieMap = new Map()
  for (const s of res.shows) {
    const m = movieMap.get(s.movieId)
    if (!m) movieMap.set(s.movieId, { title: s.movieTitle, language: s.language ?? 'unknown' })
    else if (s.language && m.language === 'unknown') m.language = s.language
  }
  if (movieMap.size) {
    const rows = [...movieMap.entries()].map(([mid, m]) =>
      `(${sq(`district-${mid}`)}, ${sq(m.title)}, ${sq(m.language)}, 0, ${hueOf(m.title)}, '🎬', NULL, ${sq(mid)}, 'district', ${nowSec})`)
    stmts.push(
      `INSERT INTO movies (id, title, language, duration_min, hue, emoji, poster_url, event_code, source, created_at) VALUES\n${rows.join(',\n')}\n`
      + `ON CONFLICT(id) DO UPDATE SET title = excluded.title, `
      + `language = CASE WHEN excluded.language != 'unknown' THEN excluded.language ELSE movies.language END, `
      + `duration_min = CASE WHEN excluded.duration_min > 0 THEN excluded.duration_min ELSE movies.duration_min END`,
    )
  }

  const seen = new Set()
  const showRows = []
  for (const s of res.shows) {
    if (seen.has(s.sessionId)) continue // defensive: same sid twice in one fetch
    seen.add(s.sessionId)
    showRows.push(
      `(${sq(`district-${s.sessionId}`)}, ${sq(cinemaRowId)}, ${sq(`district-${s.movieId}`)}, ${sq(s.showDate)}, `
      + `${sq(s.showTime)}, ${sq(s.format ?? '')}, '', ${sq(s.sessionId)}, NULL, ${sq(`${s.showDate}T${s.showTime}`)}, `
      + `${sq(s.availability)}, ${sq(s.language)}, 'district', ${nowSec})`,
    )
  }
  if (showRows.length) {
    stmts.push(
      `INSERT INTO shows (id, cinema_id, movie_id, show_date, start_time, format, screen, session_id, show_time_code, show_date_time, availability_status, language, source, last_synced_at) VALUES\n${showRows.join(',\n')}\n`
      + `ON CONFLICT(id) DO UPDATE SET availability_status = excluded.availability_status, `
      + `format = excluded.format, screen = excluded.screen, language = excluded.language, `
      + `last_synced_at = excluded.last_synced_at`,
    )
  }

  stmts.push(`UPDATE cinemas SET district_cinema_id = ${sq(CINEMA_ID)}, last_synced_at = ${nowSec} WHERE id = ${sq(cinemaRowId)}`)
  return stmts.join(';\n') + ';\n'
}

// ---- one sync run ----------------------------------------------------------

async function runOnce(label, date) {
  console.log(`\n=== ${label} (${date}) ===`)
  const res = await getDistrictCinemaShows(CINEMA_ID, CITY_SLUG, date)
  console.log(`  fetched: "${res.cinemaName}" · ${res.movieCount} movies · ${res.shows.length} sessions for ${date}`)

  // Match the EXISTING cinema — never create one.
  const rows = d1(`SELECT id, name, district_cinema_id AS dcd FROM cinemas WHERE city = 'kochi'`)
  let matches = rows.filter(r => r.dcd === CINEMA_ID)
  if (!matches.length) {
    const needle = norm('PVR Lulu Mall')
    matches = rows.filter((r) => {
      const n = norm(r.name)
      return n.includes(needle) || (n.length >= 6 && needle.includes(n))
    })
  }
  const ids = [...new Set(matches.map(m => m.id))]
  if (ids.length !== 1)
    throw new Error(`cinema match failed — expected exactly 1 PVR Lulu row, got ${JSON.stringify(matches)} (refusing to create a duplicate)`)
  const cinemaRow = rows.find(r => r.id === ids[0])

  const showsBefore = d1(`SELECT COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id='${cinemaRow.id}'`)[0].n
  const moviesBefore = d1(`SELECT COUNT(*) AS n FROM movies WHERE source='district'`)[0].n

  try {
    writeFileSync(`sync-worker/${TMP_SQL}`, buildSql(res, cinemaRow.id, Math.floor(Date.now() / 1000)), 'utf8')
    d1File(TMP_SQL)
  }
  finally {
    try { unlinkSync(`sync-worker/${TMP_SQL}`) } catch {}
  }

  const showsAfter = d1(`SELECT COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id='${cinemaRow.id}'`)[0].n
  const moviesAfter = d1(`SELECT COUNT(*) AS n FROM movies WHERE source='district'`)[0].n
  const showsNew = showsAfter - showsBefore
  const moviesNew = moviesAfter - moviesBefore
  console.log(`  cinema matched: ${cinemaRow.id} "${cinemaRow.name}" (district_cinema_id was ${cinemaRow.dcd ?? 'NULL'})`)
  console.log(`  movies: ${moviesNew} inserted / ${movieMapSafeCount(res) - moviesNew} updated · shows: ${showsNew} inserted / ${res.shows.length - showsNew} updated`)

  return { res, cinemaId: cinemaRow.id, cinemaName: cinemaRow.name, showsAfter, showsNew, moviesNew }
}

function movieMapSafeCount(res) {
  return new Set(res.shows.map(s => s.movieId)).size
}

// ---- API verification (existing endpoint, zero changes) --------------------

async function verifyApi(mySids, cinemaId) {
  console.log('\n— API verification: existing bridge + existing /api/cinemas —')
  execSync('node scripts/district-copy-to-dev.mjs', { stdio: 'inherit', timeout: 180_000 })

  const server = spawn('npx', ['nuxt', 'dev', '--port', String(API_PORT)], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const kill = () => {
    if (process.platform === 'win32' && server.pid)
      spawn('taskkill', ['/F', '/T', '/PID', String(server.pid)], { shell: true })
    else server.kill()
  }
  process.on('exit', kill)
  try {
    const t0 = Date.now()
    while (Date.now() - t0 < 240_000) {
      try {
        const r = await fetch(`http://localhost:${API_PORT}/api/cinemas?city=kochi`)
        if (r.ok) break
      }
      catch {}
      await new Promise(r => setTimeout(r, 3000))
    }
    const body = await (await fetch(`http://localhost:${API_PORT}/api/cinemas?city=kochi`)).json()
    const c = (body.cinemas ?? []).find(x => x.id === cinemaId)
    ok('matched cinema served by /api/cinemas', !!c, c?.name ?? '')
    const dShows = (c?.movies ?? []).flatMap(m => m.showtimes.map(s => ({ ...s, movie: m.title })))
      .filter(s => s.id.startsWith('district-'))
    ok('district showtimes served', dShows.length > 0, `n=${dShows.length}`)
    const mine = dShows.filter(s => mySids.has(s.id.replace('district-', '')))
    ok('newly synced sessions present in API payload', mine.length > 0, `${mine.length} of ${mySids.size}`)
    ok('cinema carries syncedAt', c?.syncedAt != null, String(c?.syncedAt ?? ''))
    if (dShows.length) {
      console.log('  API serves (sample):')
      for (const s of dShows.slice(0, 5))
        console.log(`    ${s.startTime} ${s.format || ''} [${s.availability ?? '?'}] ${s.movie} (id ${s.id})`)
    }
  }
  finally { kill() }
}

// ---- main ------------------------------------------------------------------

const istHour = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours()
const lateNightIST = istHour >= 22 || istHour < 6

console.log('— Preflight: schema already supports District identifiers (no migration expected) —')
const cineCols = new Set(d1(`SELECT name FROM pragma_table_info('cinemas')`).map(r => r.name))
const showCols = new Set(d1(`SELECT name FROM pragma_table_info('shows')`).map(r => r.name))
ok('cinemas.district_cinema_id exists (migration 0005)', cineCols.has('district_cinema_id'))
ok('cinemas.last_synced_at exists (migration 0005)', cineCols.has('last_synced_at'))
for (const col of ['session_id', 'show_time_code', 'show_date_time', 'availability_status', 'language', 'source', 'last_synced_at'])
  ok(`shows.${col} exists`, showCols.has(col))

try {
  const kochiBefore = d1(`SELECT COUNT(*) AS n FROM cinemas WHERE city='kochi'`)[0].n

  let date = istToday()
  let run1 = await runOnce('RUN 1', date)
  if (run1.res.shows.length === 0 && lateNightIST) {
    console.log(`  0 sessions for TODAY at ${istHour}:xx IST — District has rolled the day over; syncing TOMORROW instead (clearly labeled)`)
    date = new Date(Date.now() + (5.5 * 3600 + 86400) * 1000).toISOString().slice(0, 10)
    run1 = await runOnce('RUN 1 (date fallback)', date)
  }
  const run2 = await runOnce('RUN 2 (idempotency)', date)

  console.log('\n— Duplicate / integrity checks —')
  ok('RUN 2 inserted 0 new shows', run2.showsNew === 0, `+${run2.showsNew}`)
  ok('RUN 2 inserted 0 new movies', run2.moviesNew === 0, `+${run2.moviesNew}`)
  ok('show rows stable across runs', run1.showsAfter === run2.showsAfter, `${run1.showsAfter} → ${run2.showsAfter}`)
  const dups = d1(`SELECT cinema_id, movie_id, show_date, start_time, COUNT(*) AS n FROM shows WHERE source='district' AND cinema_id='${run2.cinemaId}' GROUP BY cinema_id, movie_id, show_date, start_time HAVING n > 1`)
  ok('no duplicate (cinema, movie, date, time) rows', dups.length === 0, JSON.stringify(dups.slice(0, 2)))
  const sids = [...new Set(run2.res.shows.map(s => s.sessionId))]
  if (sids.length) {
    const inList = sids.map(x => `'${x}'`).join(',')
    const idDups = d1(`SELECT COUNT(*) AS n FROM (SELECT id FROM shows WHERE id IN (${inList}) GROUP BY id HAVING COUNT(*) > 1)`)[0].n
    ok('every session id stored exactly once', idDups === 0)
  }
  const kochiAfter = d1(`SELECT COUNT(*) AS n FROM cinemas WHERE city='kochi'`)[0].n
  ok('no cinema row created (count unchanged)', kochiBefore === kochiAfter, `${kochiBefore} → ${kochiAfter}`)
  const stamped = d1(`SELECT district_cinema_id AS dcd, last_synced_at AS lsa FROM cinemas WHERE id='${run2.cinemaId}'`)[0]
  ok('cinema stamped district_cinema_id + last_synced_at', stamped.dcd === CINEMA_ID && Number(stamped.lsa) > 0, `dcd=${stamped.dcd} lsa=${stamped.lsa}`)

  console.log('\n— Example shows read back from D1 —')
  const examples = d1(`SELECT s.show_date AS d, s.start_time AS t, s.format AS f, s.language AS lang, s.availability_status AS avail, s.session_id AS sid, m.title, c.name AS cinema FROM shows s JOIN movies m ON m.id = s.movie_id JOIN cinemas c ON c.id = s.cinema_id WHERE s.source='district' AND s.cinema_id='${run2.cinemaId}' ORDER BY s.show_date, s.start_time LIMIT 3`)
  for (const r of examples)
    console.log(`  ${r.d} ${r.t} · ${r.title} · ${r.lang ?? '?'} · ${r.f ?? '?'} · ${r.avail} · session ${r.sid} @ ${r.cinema} (id district-${r.sid})`)
  ok('example rows retrieved from D1', examples.length > 0)

  await verifyApi(new Set(sids), run2.cinemaId)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}
catch (e) {
  console.log(`\nFAILED: ${e?.message ?? e}`)
  process.exit(1)
}
