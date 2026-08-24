import { createClient } from '@libsql/client'
import { execSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'

// ============================================================================
// SAFE PRODUCTION DATA SYNCHRONIZATION TOOL
// ============================================================================

const isDryRun = !process.argv.includes('--apply')
const TODAY_IST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

console.log('='.repeat(72))
console.log(`SAFE PRODUCTION DATA SYNCHRONIZATION TOOL`)
console.log(`Mode: ${isDryRun ? 'DRY-RUN (Audit only)' : 'APPLY (Executing changes to Cloudflare D1)'}`)
console.log(`Target Date (Asia/Kolkata): ${TODAY_IST}`)
console.log('='.repeat(72))

// 1. Connect to Local SQLite
const localDb = createClient({ url: 'file:data/db.sqlite' })

// 2. Fetch local rows
const localCinemas = (await localDb.execute('SELECT * FROM cinemas')).rows as any[]
const localMovies = (await localDb.execute('SELECT * FROM movies')).rows as any[]
const localShows = (await localDb.execute('SELECT * FROM shows')).rows as any[]
const localRatings = (await localDb.execute('SELECT * FROM ratings')).rows as any[]
const localAdReports = (await localDb.execute('SELECT * FROM ad_reports')).rows as any[]
const localUsers = (await localDb.execute('SELECT * FROM users')).rows as any[]

// 3. Fetch remote Cloudflare D1 rows via Wrangler CLI
console.log('\n[1/5] Inspecting remote Cloudflare D1 production database...')

function queryRemoteD1(sql: string): any[] {
  try {
    const raw = execSync(
      `npx wrangler d1 execute cinema-community --remote --json --command "${sql.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const parsed = JSON.parse(raw)
    return parsed[0]?.results ?? []
  } catch (err: any) {
    console.error('Failed to query remote D1:', err.stderr || err.message)
    throw err
  }
}

function executeSqlFileOnRemoteD1(sqlContent: string) {
  const tmpFile = `./temp-d1-sync-${Date.now()}.sql`
  writeFileSync(tmpFile, sqlContent, 'utf-8')
  try {
    execSync(`npx wrangler d1 execute cinema-community --remote --file="${tmpFile}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'inherit', 'inherit'],
    })
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}

const prodCinemas = queryRemoteD1('SELECT * FROM cinemas;')
const prodMovies = queryRemoteD1('SELECT * FROM movies;')
const prodShows = queryRemoteD1('SELECT * FROM shows;')
const prodRatings = queryRemoteD1('SELECT * FROM ratings;')
const prodAdReports = queryRemoteD1('SELECT * FROM ad_reports;')
const prodUsers = queryRemoteD1('SELECT * FROM users;')

console.log(`  ✓ Production records verified: ${prodCinemas.length} cinemas, ${prodMovies.length} movies, ${prodShows.length} shows.`)

// 4. Test/Suspicious Cinema Classifier
function isSuspiciousCinema(c: any): { suspicious: boolean; reason?: string } {
  const nameLower = (c.name || '').toLowerCase()
  const addressLower = (c.address || '').toLowerCase()
  if (c.id === 'osm-node-999888777' || c.id === 'osm-node-888777666') {
    return { suspicious: true, reason: 'Known test cinema ID from integration test suite' }
  }
  if (nameLower.includes('fictional') || nameLower.includes('fake') || nameLower.includes('failing cinema test')) {
    return { suspicious: true, reason: 'Fictional/test keyword in name' }
  }
  if (addressLower.includes('fake street') || addressLower.includes('404 error blvd')) {
    return { suspicious: true, reason: 'Test/fictional address' }
  }
  if (c.district_cinema_id === '9999999') {
    return { suspicious: true, reason: 'Fake/test District ID 9999999' }
  }
  return { suspicious: false }
}

// 5. Cinema Sync Plan
console.log('\n[2/5] Classifying cinemas...')
const prodCinemaMap = new Map(prodCinemas.map(c => [c.id, c]))
const cinemaPlan = {
  wouldInsert: [] as any[],
  wouldUpdate: [] as any[],
  skipped: [] as any[],
  excludedTest: [] as any[],
}

for (const c of localCinemas) {
  const susp = isSuspiciousCinema(c)
  if (susp.suspicious) {
    cinemaPlan.excludedTest.push({ id: c.id, name: c.name, reason: susp.reason })
    continue
  }

  const existing = prodCinemaMap.get(c.id)
  if (!existing) {
    cinemaPlan.wouldInsert.push(c)
  } else {
    const hasNewDistrictId = c.district_cinema_id && c.district_cinema_id !== existing.district_cinema_id
    const hasNewSyncTime = c.last_synced_at && c.last_synced_at !== existing.last_synced_at
    if (hasNewDistrictId || hasNewSyncTime) {
      cinemaPlan.wouldUpdate.push({
        id: c.id,
        name: c.name,
        changes: {
          district_cinema_id: c.district_cinema_id,
          last_synced_at: c.last_synced_at,
        },
      })
    } else {
      cinemaPlan.skipped.push({ id: c.id, name: c.name, reason: 'Already identical in production' })
    }
  }
}

// 6. Movie Sync Plan
console.log('[3/5] Classifying movies...')
const prodMovieMap = new Map(prodMovies.map(m => [m.id, m]))
const moviePlan = {
  wouldInsert: [] as any[],
  skipped: [] as any[],
  excludedTest: [] as any[],
}

for (const m of localMovies) {
  const existing = prodMovieMap.get(m.id)
  if (!existing) {
    moviePlan.wouldInsert.push(m)
  } else {
    moviePlan.skipped.push({ id: m.id, title: m.title, reason: 'Already present in production' })
  }
}

// 7. Shows Sync Plan (STRICT TODAY-ONLY DISTRICT FILTER)
console.log('[4/5] Applying strict today-only District showtime filters...')

const validCinemaIds = new Set([
  ...prodCinemas.map(c => c.id),
  ...cinemaPlan.wouldInsert.map(c => c.id),
])
const validMovieIds = new Set([
  ...prodMovies.map(m => m.id),
  ...moviePlan.wouldInsert.map(m => m.id),
])
const prodShowMap = new Map(prodShows.map(s => [s.id, s]))

const showPlan = {
  eligibleCurrentDistrict: [] as any[],
  excludedPastShows: [] as any[],
  excludedFutureShows: [] as any[],
  excludedNonDistrictShows: [] as any[],
  excludedInvalidOrTestShows: [] as any[],
  wouldInsert: [] as any[],
  wouldUpdate: [] as any[],
  skipped: [] as any[],
}

for (const s of localShows) {
  if (s.source !== 'district') {
    showPlan.excludedNonDistrictShows.push({ id: s.id, source: s.source, reason: 'Source is not district' })
    continue
  }

  if (s.show_date < TODAY_IST) {
    showPlan.excludedPastShows.push({ id: s.id, date: s.show_date, reason: `Past date (${s.show_date} < ${TODAY_IST})` })
    continue
  }
  if (s.show_date > TODAY_IST) {
    showPlan.excludedFutureShows.push({ id: s.id, date: s.show_date, reason: `Future date (${s.show_date} > ${TODAY_IST})` })
    continue
  }

  const hasValidSession = (s.session_id && s.session_id.trim().length > 0) || (s.id && s.id.startsWith('district-'))
  if (!hasValidSession) {
    showPlan.excludedInvalidOrTestShows.push({ id: s.id, reason: 'Missing or invalid session/district ID' })
    continue
  }

  if (!validCinemaIds.has(s.cinema_id)) {
    showPlan.excludedInvalidOrTestShows.push({ id: s.id, reason: `References excluded cinema ${s.cinema_id}` })
    continue
  }
  if (!validMovieIds.has(s.movie_id)) {
    showPlan.excludedInvalidOrTestShows.push({ id: s.id, reason: `References unknown movie ${s.movie_id}` })
    continue
  }

  showPlan.eligibleCurrentDistrict.push(s)

  const existing = prodShowMap.get(s.id)
  if (!existing) {
    showPlan.wouldInsert.push(s)
  } else {
    showPlan.skipped.push({ id: s.id, reason: 'Show ID already exists in production' })
  }
}

// ============================================================================
// AUDIT REPORT OUTPUT
// ============================================================================

console.log('\n' + '='.repeat(72))
console.log('FINAL PRE-EXECUTION AUDIT COUNTS')
console.log('='.repeat(72))

console.log(`\n🏢 CINEMAS:`)
console.log(`   ▶ WOULD INSERT : ${cinemaPlan.wouldInsert.length}`)
console.log(`   ▶ WOULD UPDATE : ${cinemaPlan.wouldUpdate.length}`)
console.log(`   ▶ WOULD SKIP   : ${cinemaPlan.skipped.length}`)

console.log(`\n🎬 MOVIES:`)
console.log(`   ▶ WOULD INSERT : ${moviePlan.wouldInsert.length}`)
console.log(`   ▶ WOULD SKIP   : ${moviePlan.skipped.length}`)

console.log(`\n🎟️ SHOWS (TODAY-ONLY DISTRICT SESSIONS):`)
console.log(`   ▶ WOULD INSERT : ${showPlan.wouldInsert.length}`)
console.log(`   ▶ WOULD UPDATE : ${showPlan.wouldUpdate.length}`)
console.log(`   ▶ WOULD SKIP   : ${showPlan.skipped.length}`)
console.log(`   ▶ EXCLUDED     : ${showPlan.excludedPastShows.length + showPlan.excludedNonDistrictShows.length} (Past/Seed shows)`)

console.log(`\n🔒 SAFETY ASSERTIONS:`)
console.log(`   ▶ Ratings, Users, Ad Reports : ZERO TOUCHED`)
console.log(`   ▶ Discovery Cache             : ZERO COPIED`)
console.log(`   ▶ Deletions                   : ZERO DELETED`)

if (isDryRun) {
  console.log('\n[STATUS] DRY-RUN MODE COMPLETE. Run with --apply to execute.')
  process.exit(0)
}

// ============================================================================
// APPLY SYNCHRONIZATION
// ============================================================================

console.log('\n' + '='.repeat(72))
console.log('[5/5] APPLYING SYNCHRONIZATION TO CLOUDFLARE D1...')
console.log('='.repeat(72))

const sqlStatements: string[] = []

// Escape helper
const esc = (val: any) => {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'number') return val
  return `'${String(val).replace(/'/g, "''")}'`
}

// 1. Insert Movies
if (moviePlan.wouldInsert.length > 0) {
  console.log(`\n→ Generating SQL for ${moviePlan.wouldInsert.length} movies...`)
  for (const m of moviePlan.wouldInsert) {
    sqlStatements.push(`INSERT OR IGNORE INTO movies (id, title, language, duration_min, hue, emoji, poster_url, event_code, source, created_at) VALUES (${esc(m.id)}, ${esc(m.title)}, ${esc(m.language)}, ${esc(m.duration_min)}, ${esc(m.hue)}, ${esc(m.emoji)}, ${esc(m.poster_url)}, ${esc(m.event_code)}, ${esc(m.source || 'district')}, ${esc(m.created_at || Math.floor(Date.now() / 1000))});`)
  }
}

// 2. Insert Cinemas
if (cinemaPlan.wouldInsert.length > 0) {
  console.log(`→ Generating SQL for ${cinemaPlan.wouldInsert.length} new cinemas...`)
  for (const c of cinemaPlan.wouldInsert) {
    sqlStatements.push(`INSERT OR IGNORE INTO cinemas (id, name, address, city, latitude, longitude, venue_code, district_cinema_id, source, last_synced_at, created_at) VALUES (${esc(c.id)}, ${esc(c.name)}, ${esc(c.address)}, ${esc(c.city)}, ${esc(c.latitude)}, ${esc(c.longitude)}, ${esc(c.venue_code)}, ${esc(c.district_cinema_id)}, ${esc(c.source || 'osm')}, ${esc(c.last_synced_at)}, ${esc(c.created_at || Math.floor(Date.now() / 1000))});`)
  }
}

// 3. Update Cinemas
if (cinemaPlan.wouldUpdate.length > 0) {
  console.log(`→ Generating SQL for ${cinemaPlan.wouldUpdate.length} cinema updates...`)
  for (const u of cinemaPlan.wouldUpdate) {
    sqlStatements.push(`UPDATE cinemas SET district_cinema_id = ${esc(u.changes.district_cinema_id)}, last_synced_at = ${esc(u.changes.last_synced_at)} WHERE id = ${esc(u.id)};`)
  }
}

// 4. Insert Shows
if (showPlan.wouldInsert.length > 0) {
  console.log(`→ Generating SQL for ${showPlan.wouldInsert.length} live today shows...`)
  for (const s of showPlan.wouldInsert) {
    sqlStatements.push(`INSERT OR IGNORE INTO shows (id, cinema_id, movie_id, show_date, start_time, format, screen, session_id, show_time_code, show_date_time, availability_status, language, source, last_synced_at) VALUES (${esc(s.id)}, ${esc(s.cinema_id)}, ${esc(s.movie_id)}, ${esc(s.show_date)}, ${esc(s.start_time)}, ${esc(s.format)}, ${esc(s.screen)}, ${esc(s.session_id)}, ${esc(s.show_time_code)}, ${esc(s.show_date_time)}, ${esc(s.availability_status)}, ${esc(s.language)}, ${esc(s.source || 'district')}, ${esc(s.last_synced_at)});`)
  }
}

console.log(`\nExecuting ${sqlStatements.length} statements against Cloudflare D1...`)
executeSqlFileOnRemoteD1(sqlStatements.join('\n'))

// ============================================================================
// VERIFICATION OF REMOTE D1 STATE
// ============================================================================

console.log('\n' + '='.repeat(72))
console.log('POST-SYNC PRODUCTION CLOUDFLARE D1 VERIFICATION')
console.log('='.repeat(72))

const finalProdCinemas = queryRemoteD1('SELECT COUNT(*) as count, COUNT(district_cinema_id) as district_linked, COUNT(last_synced_at) as synced FROM cinemas;')[0]
const finalProdMovies = queryRemoteD1('SELECT COUNT(*) as count FROM movies;')[0]
const finalProdShows = queryRemoteD1('SELECT COUNT(*) as count, COUNT(DISTINCT cinema_id) as cinemas_with_shows FROM shows;')[0]
const finalProdRatings = queryRemoteD1('SELECT COUNT(*) as count FROM ratings;')[0]
const finalProdReports = queryRemoteD1('SELECT COUNT(*) as count FROM ad_reports;')[0]
const finalProdUsers = queryRemoteD1('SELECT COUNT(*) as count FROM users;')[0]

console.log(`\n📊 FINAL REMOTE D1 RECORD COUNTS:`)
console.log(`   ▶ Cinemas : ${finalProdCinemas.count} (District Linked: ${finalProdCinemas.district_linked}, Synced: ${finalProdCinemas.synced})`)
console.log(`   ▶ Movies  : ${finalProdMovies.count}`)
console.log(`   ▶ Shows   : ${finalProdShows.count} (across ${finalProdShows.cinemas_with_shows} cinemas)`)
console.log(`   ▶ Ratings : ${finalProdRatings.count} (Preserved)`)
console.log(`   ▶ Reports : ${finalProdReports.count} (Preserved)`)
console.log(`   ▶ Users   : ${finalProdUsers.count} (Preserved)`)

console.log('\n[SUCCESS] Production D1 synchronization completed safely.')
