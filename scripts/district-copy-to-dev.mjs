/**
 * Dev-only bridge: copy District-synced rows from the sync-worker's local D1
 * (populated by `node scripts/e2e-district-test.mjs`) into the Nuxt dev
 * database (data/db.sqlite) so `nuxt dev` serves real showtimes end-to-end.
 *
 * Copies/updates only:
 *   - movies with source='district'        (upsert by id)
 *   - cinemas.district_cinema_id / last_synced_at for mapped cinemas
 *   - shows with source='district'         (upsert by id)
 *   - then mirrors the worker's per-cinema stale cleanup: district shows of
 *     mapped cinemas that the latest sync no longer lists are deleted
 *     (except rows referenced by ad_reports), so the dev db shows exactly
 *     what the provider currently lists — same rule as sync-worker/src/d1.ts.
 *
 * Usage: node scripts/district-copy-to-dev.mjs
 */
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { createClient } from '@libsql/client'

// --- bootstrap data/db.sqlite the same way the devDb nitro plugin does -----
if (!existsSync('data')) mkdirSync('data', { recursive: true })
const dev = createClient({ url: 'file:data/db.sqlite' })
{
  const hasUsers = await dev.execute("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='users'")
  if (Number(hasUsers.rows[0].n) === 0) {
    const dir = 'server/database/migrations'
    for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      const raw = readFileSync(`${dir}/${f}`, 'utf8')
      for (const stmt of raw.split('--> statement-breakpoint'))
        await dev.executeMultiple(stmt)
      console.log(`applied migration ${f}`)
    }
    const count = await dev.execute('SELECT COUNT(*) AS n FROM cinemas')
    if (Number(count.rows[0].n) === 0) {
      await dev.executeMultiple(readFileSync('server/database/seed.sql', 'utf8'))
      console.log('seeded data/db.sqlite')
    }
  }
}

function d1(sql) {
  const q = sql.replace(/"/g, '""').replace(/\s+/g, ' ')
  const out = execSync(
    `npx wrangler d1 execute cinema-community --local --json --command "${q}"`,
    { cwd: 'sync-worker', shell: true, encoding: 'utf8', timeout: 120_000 },
  )
  const start = out.indexOf('[')
  const end = out.lastIndexOf(']')
  return JSON.parse(out.slice(start, end + 1))[0].results
}

const movies = d1(`SELECT id, title, language, duration_min AS durationMin, hue, emoji, poster_url AS posterUrl,
  event_code AS eventCode, source, created_at AS createdAt FROM movies WHERE source = 'district'`)
const cinemas = d1(`SELECT id, district_cinema_id AS districtCinemaId, last_synced_at AS lastSyncedAt
  FROM cinemas WHERE district_cinema_id IS NOT NULL`)
const shows = d1(`SELECT id, cinema_id AS cinemaId, movie_id AS movieId, show_date AS showDate,
  start_time AS startTime, format, screen, session_id AS sessionId, show_time_code AS showTimeCode,
  show_date_time AS showDateTime, availability_status AS availabilityStatus, language, source,
  last_synced_at AS lastSyncedAt FROM shows WHERE source = 'district'`)

console.log(`copying: ${movies.length} movies, ${cinemas.length} cinema mappings, ${shows.length} shows`)

for (const m of movies) {
  await dev.execute({
    sql: `INSERT INTO movies (id, title, language, duration_min, hue, emoji, poster_url, event_code, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET title = excluded.title, duration_min = excluded.duration_min`,
    args: [m.id, m.title, m.language, m.durationMin, m.hue, m.emoji, m.posterUrl, m.eventCode, m.source, m.createdAt],
  })
}
for (const c of cinemas) {
  await dev.execute({
    sql: `UPDATE cinemas SET district_cinema_id = ?, last_synced_at = ? WHERE id = ?`,
    args: [c.districtCinemaId, c.lastSyncedAt, c.id],
  })
}
for (const s of shows) {
  await dev.execute({
    sql: `INSERT INTO shows (id, cinema_id, movie_id, show_date, start_time, format, screen,
            session_id, show_time_code, show_date_time, availability_status, language, source, last_synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET availability_status = excluded.availability_status,
            format = excluded.format, screen = excluded.screen, language = excluded.language,
            last_synced_at = excluded.last_synced_at`,
    args: [s.id, s.cinemaId, s.movieId, s.showDate, s.startTime, s.format, s.screen, s.sessionId,
      s.showTimeCode, s.showDateTime, s.availabilityStatus, s.language, s.source, s.lastSyncedAt],
  })
}

// Mirror the worker's stale cleanup: mapped cinemas were refreshed by the sync
// this copy came from, so their district shows missing from the source are gone
// from the provider. ad_reports references always win (community history).
const mappedIds = cinemas.map(c => c.id)
let staleDeleted = 0
if (mappedIds.length) {
  const keep = shows.map(s => s.id)
  const placeholders = mappedIds.map(() => '?').join(',')
  const r = await dev.execute({
    sql: `DELETE FROM shows
          WHERE source = 'district' AND cinema_id IN (${placeholders})
            AND id NOT IN (SELECT show_id FROM ad_reports WHERE show_id IS NOT NULL)
            ${keep.length ? `AND id NOT IN (${keep.map(() => '?').join(',')})` : ''}`,
    args: [...mappedIds, ...keep],
  })
  staleDeleted = Number(r.rowsAffected ?? 0)
}

const check = await dev.execute(`SELECT COUNT(*) AS n FROM shows WHERE source = 'district'`)
console.log(`dev db now holds ${check.rows[0].n} district shows (${staleDeleted} stale removed this copy) — run 'npm run dev' and open a synced cinema`)
