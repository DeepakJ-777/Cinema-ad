import { writeFileSync, mkdirSync } from 'node:fs'

// Helpers keep each data line shallow so paste errors are impossible to miss
const sh = (startTime, format, screen, adMin, reports) => ({ startTime, format, screen, adMin, reports })
const mv = (title, language, durationMin, hue, emoji, showtimes) => ({ title, language, durationMin, hue, emoji, showtimes })
const ci = (id, name, address, city, lat, lng, overall, ratingCount, ratings, movies, reviews) =>
  ({ id, name, address, city, lat, lng, overall, ratingCount, ratings, movies, reviews: reviews || [] })

const CINEMAS = [
  ci('c1', 'PVR Lulu Mall', 'Lulu Mall, Edappally, Kochi 682024', 'kochi', 10.0072, 76.3017, 4.4, 27,
    { ambience: 4.5, staff: 4.2, experience: 4.7, food: 3.8, value: 3.9 },
    [
      mv('Spider-Man: Brand New Day', 'English', 135, 355, '🕷️', [
        sh('10:15', '2D', 'Screen 1', 12, 3),
        sh('13:40', '2D', 'Screen 1', 14, 5),
        sh('19:00', 'IMAX 2D', 'IMAX', 18.5, 14),
        sh('22:15', '2D', 'Screen 2', 15, 4),
      ]),
      mv('Kalki 2898 AD', 'Telugu', 181, 260, '🤖', [
        sh('11:00', '2D', 'Screen 3', 16, 6),
        sh('16:20', '3D', 'Screen 4', 18, 8),
        sh('21:30', '2D', 'Screen 3', 14, 3),
      ]),
      mv('Aavesham', 'Malayalam', 165, 350, '🔥', [
        sh('10:45', '2D', 'Screen 5', 10, 2),
        sh('15:15', '2D', 'Screen 5', 12, 4),
        sh('20:30', '2D', 'Screen 6', 13, 5),
      ]),
      mv('Dune: Part Two', 'English', 166, 30, '🏜️', [
        sh('14:10', 'IMAX 2D', 'IMAX', 19, 7),
        sh('19:45', '2D', 'Screen 2', 16, 3),
      ]),
    ],
    [
      ['Arjun R.', 'Screens 4–6 are the sweet spot. Ads ran about 20 mins before the 7 pm show.'],
      ['Meera T.', 'Best sound in the city. Parking gets brutal on weekends though.'],
    ]),
  ci('c2', 'PVR Oberon Mall', 'Oberon Mall, Edappally, Kochi 682024', 'kochi', 9.9957, 76.2963, 4.1, 19,
    { ambience: 4.0, staff: 3.9, experience: 4.3, food: 3.5, value: 3.8 },
    [
      mv('Spider-Man: Brand New Day', 'English', 135, 355, '🕷️', [
        sh('11:20', '2D', 'Audi 1', 13, 2),
        sh('16:00', '2D', 'Audi 1', 15, 4),
        sh('20:45', '2D', 'Audi 2', 16, 5),
      ]),
      mv('Leo', 'Tamil', 164, 210, '🐾', [
        sh('12:30', '2D', 'Audi 3', 11, 2),
        sh('18:00', '2D', 'Audi 3', 14, 4),
      ]),
      mv('Premalu', 'Malayalam', 149, 320, '💘', [
        sh('10:30', '2D', 'Audi 2', 9, 1),
        sh('15:45', '2D', 'Audi 4', 11, 3),
        sh('21:00', '2D', 'Audi 4', 12, 3),
      ]),
    ]),
  ci('c3', 'PVR Forum Mall', 'Link Road, Kaloor, Ernakulam 682017', 'kochi', 9.993, 76.2955, 4.2, 21,
    { ambience: 4.3, staff: 4.0, experience: 4.4, food: 3.7, value: 3.9 },
    [
      mv('Kalki 2898 AD', 'Telugu', 181, 260, '🤖', [
        sh('10:50', '2D', 'Screen 1', 15, 4),
        sh('15:30', '3D', 'Screen 2', 17, 6),
        sh('20:50', '2D', 'Screen 1', 16, 5),
      ]),
      mv('Stree 2', 'Hindi', 148, 280, '👻', [
        sh('13:15', '2D', 'Screen 3', 13, 3),
        sh('18:40', '2D', 'Screen 3', 15, 4),
        sh('23:00', '2D', 'Screen 4', 12, 2),
      ]),
      mv('Dune: Part Two', 'English', 166, 30, '🏜️', [
        sh('17:20', '2D', 'Screen 2', 18, 4),
      ]),
    ]),
  ci('c4', 'Vanitha Cineplex', 'Banerji Road, Ernakulam 682018', 'kochi', 9.977, 76.288, 3.9, 14,
    { ambience: 3.6, staff: 3.8, experience: 4.0, food: 3.2, value: 4.1 },
    [
      mv('Aavesham', 'Malayalam', 165, 350, '🔥', [
        sh('11:15', '2D', 'Main', 8, 2),
        sh('16:00', '2D', 'Main', 10, 3),
        sh('20:45', '2D', 'Main', 11, 4),
      ]),
      mv('Premalu', 'Malayalam', 149, 320, '💘', [
        sh('13:45', '2D', 'Mini', 7, 1),
        sh('18:30', '2D', 'Mini', 9, 2),
      ]),
      mv('Leo', 'Tamil', 164, 210, '🐾', [
        sh('14:20', '2D', 'Main', 9, 2),
        sh('21:50', '2D', 'Main', 8, 1),
      ]),
    ],
    [
      ['Joel P.', 'Solid budget pick — ads are usually just ~10 minutes.'],
    ]),
  ci('c5', 'Cinepolis Centre Square', 'Centre Square Mall, MG Road, Ernakulam 682016', 'kochi', 9.9695, 76.2936, 4.0, 16,
    { ambience: 3.9, staff: 3.7, experience: 4.1, food: 3.9, value: 3.6 },
    [
      mv('Spider-Man: Brand New Day', 'English', 135, 355, '🕷️', [
        sh('12:00', '2D', 'Screen 1', 18, 5),
        sh('17:10', '3D', 'Screen 2', 21, 7),
        sh('22:00', '2D', 'Screen 1', 17, 4),
      ]),
      mv('Stree 2', 'Hindi', 148, 280, '👻', [
        sh('14:30', '2D', 'Screen 3', 16, 4),
        sh('19:50', '2D', 'Screen 3', 19, 5),
      ]),
      mv('Kantara Chapter 1', 'Kannada', 170, 140, '🌿', [
        sh('11:00', '2D', 'Screen 4', 14, 3),
        sh('18:15', '2D', 'Screen 4', 16, 4),
      ]),
    ]),
  ci('c6', 'Shenoys Theatre', 'Mahatma Gandhi Road, Ernakulam 682011', 'kochi', 9.9701, 76.2859, 4.3, 22,
    { ambience: 4.2, staff: 4.1, experience: 4.4, food: 3.0, value: 4.5 },
    [
      mv('Aavesham', 'Malayalam', 165, 350, '🔥', [
        sh('11:30', '2D', 'Main', 6, 3),
        sh('16:15', '2D', 'Main', 7, 4),
        sh('21:00', '2D', 'Main', 8, 5),
      ]),
      mv('Kalki 2898 AD', 'Telugu', 181, 260, '🤖', [
        sh('14:00', '2D', 'Main', 7, 3),
        sh('19:30', '2D', 'Main', 9, 6),
      ]),
    ],
    [
      ['Fahad', 'Seven minutes of ads, then straight to the film. How every theatre should be.'],
      ['Divya S.', 'The balcony is showing its age but the vibe is unbeatable.'],
    ]),
  ci('c7', 'PVR Orion Mall', 'Orion Mall, Rajajinagar, Bengaluru 560055', 'bengaluru', 12.9968, 77.555, 4.5, 31,
    { ambience: 4.6, staff: 4.3, experience: 4.8, food: 4.0, value: 4.0 },
    [
      mv('Spider-Man: Brand New Day', 'English', 135, 355, '🕷️', [
        sh('10:30', 'IMAX 2D', 'IMAX', 19, 12),
        sh('14:45', 'IMAX 2D', 'IMAX', 20, 15),
        sh('19:00', 'IMAX 2D', 'IMAX', 21, 18),
        sh('23:00', '2D', 'Screen 5', 16, 6),
      ]),
      mv('Kalki 2898 AD', 'Telugu', 181, 260, '🤖', [
        sh('12:15', '2D', 'Screen 1', 17, 8),
        sh('17:40', '3D', 'Screen 2', 19, 9),
      ]),
      mv('Kantara Chapter 1', 'Kannada', 170, 140, '🌿', [
        sh('13:00', '2D', 'Screen 3', 15, 6),
        sh('18:30', '2D', 'Screen 3', 17, 7),
        sh('22:15', '2D', 'Screen 4', 14, 4),
      ]),
      mv('Dune: Part Two', 'English', 166, 30, '🏜️', [
        sh('16:10', 'IMAX 2D', 'IMAX', 22, 10),
      ]),
    ],
    [
      ['Nikhil', 'IMAX here is the reference. Ads ~20 min but the pre-show is actually watchable.'],
      ['Rashmi', 'Weekend parking queue is 25 min — come early.'],
    ]),
  ci('c8', 'PVR Koramangala', 'Forum Mall, Koramangala, Bengaluru 560095', 'bengaluru', 12.9345, 77.6114, 4.2, 24,
    { ambience: 4.2, staff: 4.1, experience: 4.3, food: 3.8, value: 3.9 },
    [
      mv('Leo', 'Tamil', 164, 210, '🐾', [
        sh('10:45', '2D', 'Audi 1', 14, 5),
        sh('15:30', '2D', 'Audi 1', 16, 7),
        sh('20:15', '2D', 'Audi 2', 17, 8),
      ]),
      mv('Stree 2', 'Hindi', 148, 280, '👻', [
        sh('13:20', '2D', 'Audi 3', 15, 5),
        sh('18:45', '2D', 'Audi 3', 18, 6),
        sh('23:10', '2D', 'Audi 4', 13, 3),
      ]),
      mv('Aavesham', 'Malayalam', 165, 350, '🔥', [
        sh('12:00', '2D', 'Audi 4', 12, 3),
        sh('17:00', '2D', 'Audi 5', 14, 5),
        sh('21:45', '2D', 'Audi 5', 15, 4),
      ]),
    ]),
  ci('c9', 'INOX Garuda Mall', 'Magrath Road, Ashok Nagar, Bengaluru 560025', 'bengaluru', 12.9735, 77.6065, 3.8, 18,
    { ambience: 3.7, staff: 3.6, experience: 3.9, food: 3.5, value: 3.4 },
    [
      mv('Spider-Man: Brand New Day', 'English', 135, 355, '🕷️', [
        sh('11:00', '2D', 'Audi 2', 13, 4),
        sh('15:45', '2D', 'Audi 2', 15, 5),
        sh('20:30', '2D', 'Audi 3', 16, 6),
      ]),
      mv('Leo', 'Tamil', 164, 210, '🐾', [
        sh('13:35', '2D', 'Audi 1', 12, 3),
        sh('22:05', '2D', 'Audi 1', 11, 2),
      ]),
      mv('Premalu', 'Malayalam', 149, 320, '💘', [
        sh('10:20', '2D', 'Audi 4', 9, 2),
        sh('18:20', '2D', 'Audi 4', 11, 3),
      ]),
    ]),
  ci('c10', 'PVR Phoenix Marketcity', 'Phoenix Marketcity, Mahadevapura, Bengaluru 560048', 'bengaluru', 12.9962, 77.6967, 4.3, 21,
    { ambience: 4.4, staff: 4.2, experience: 4.5, food: 4.1, value: 3.8 },
    [
      mv('Kalki 2898 AD', 'Telugu', 181, 260, '🤖', [
        sh('10:40', '3D', 'Screen 1', 20, 8),
        sh('16:00', '3D', 'Screen 1', 22, 10),
        sh('21:20', '2D', 'Screen 2', 19, 7),
      ]),
      mv('Kantara Chapter 1', 'Kannada', 170, 140, '🌿', [
        sh('11:50', '2D', 'Screen 3', 17, 6),
        sh('19:40', '2D', 'Screen 3', 18, 7),
      ]),
      mv('Dune: Part Two', 'English', 166, 30, '🏜️', [
        sh('14:20', '2D', 'Screen 2', 21, 6),
      ]),
      mv('Stree 2', 'Hindi', 148, 280, '👻', [
        sh('13:10', '2D', 'Screen 4', 16, 5),
        sh('22:40', '2D', 'Screen 4', 14, 3),
      ]),
    ]),
  ci('c11', 'Cinepolis ETA Mall', 'ETA Namma Mall, Mysore Road, Bengaluru 560026', 'bengaluru', 12.963, 77.525, 4.0, 15,
    { ambience: 3.9, staff: 3.8, experience: 4.0, food: 3.8, value: 3.7 },
    [
      mv('Spider-Man: Brand New Day', 'English', 135, 355, '🕷️', [
        sh('12:10', '2D', 'Screen 1', 15, 4),
        sh('17:00', '2D', 'Screen 1', 17, 5),
        sh('21:45', '2D', 'Screen 2', 16, 4),
      ]),
      mv('Premalu', 'Malayalam', 149, 320, '💘', [
        sh('10:50', '2D', 'Screen 3', 11, 2),
        sh('15:40', '2D', 'Screen 3', 12, 3),
        sh('20:25', '2D', 'Screen 4', 13, 3),
      ]),
      mv('Leo', 'Tamil', 164, 210, '🐾', [
        sh('14:00', '2D', 'Screen 2', 13, 3),
        sh('19:15', '2D', 'Screen 4', 14, 4),
      ]),
    ]),
  ci('c12', 'Urvashi Cinema', 'Lalbagh Road, Sampangi Rama Nagar, Bengaluru 560004', 'bengaluru', 12.942, 77.585, 4.4, 26,
    { ambience: 4.3, staff: 4.2, experience: 4.5, food: 2.9, value: 4.6 },
    [
      mv('Kantara Chapter 1', 'Kannada', 170, 140, '🌿', [
        sh('11:00', '2D', 'Main', 6, 4),
        sh('15:45', '2D', 'Main', 7, 5),
        sh('20:30', '2D', 'Main', 8, 6),
      ]),
      mv('Aavesham', 'Malayalam', 165, 350, '🔥', [
        sh('13:30', '2D', 'Main', 5, 2),
        sh('18:20', '2D', 'Main', 6, 3),
      ]),
    ],
    [
      ['Karthik', '6–8 min ads, huge screen, tickets still under ₹200. Legend.'],
      ['Sana', 'Skip the snack counter, everything else is gold.'],
    ]),
]

// ---------- deterministic SQL generation ----------
let rngState = 42
const rng = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 0x100000000 }
const q = s => `'${String(s).replace(/'/g, "''")}'`
const clamp1 = v => Math.max(1, Math.min(5, Math.round(v * 10) / 10))
const T0 = Math.floor(Date.UTC(2025, 7, 10) / 1000)
const out = ['-- Auto-generated by scripts/generate-seeds.mjs — idempotent (INSERT OR IGNORE)']

// users: named reviewers u1..uN + generic moviegoers u101..u180
const reviewerIds = new Map()
const userRows = []
for (const c of CINEMAS) for (const [name] of c.reviews) {
  const id = `u${userRows.length + 1}`
  reviewerIds.set(name, id)
  userRows.push([id, name, `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@demo.cinema`])
}
for (let i = 0; i < 80; i++) userRows.push([`u${101 + i}`, `Moviegoer ${101 + i}`, `moviegoer${101 + i}@demo.cinema`])
out.push(`INSERT OR IGNORE INTO users (id,name,email,email_verified,created_at,updated_at) VALUES\n` +
  userRows.map(u => `(${q(u[0])},${q(u[1])},${q(u[2])},0,${T0 - 2592000},${T0 - 2592000})`).join(',\n') + ';')

out.push(`INSERT OR IGNORE INTO cinemas (id,name,address,city,latitude,longitude,created_at) VALUES\n` +
  CINEMAS.map(c => `(${q(c.id)},${q(c.name)},${q(c.address)},${q(c.city)},${c.lat},${c.lng},${T0 - 2592000})`).join(',\n') + ';')

// global movies, deduped by title
const movieIds = new Map()
for (const c of CINEMAS) for (const m of c.movies) if (!movieIds.has(m.title)) movieIds.set(m.title, `m${movieIds.size + 1}`)
out.push(`INSERT OR IGNORE INTO movies (id,title,language,duration_min,hue,emoji,created_at) VALUES\n` +
  [...movieIds.entries()].map(([title, id]) => {
    const m = CINEMAS.flatMap(c => c.movies).find(x => x.title === title)
    return `(${q(id)},${q(m.title)},${q(m.language)},${m.durationMin},${m.hue},${q(m.emoji)},${T0 - 2592000})`
  }).join(',\n') + ';')

// shows (show_date = date('now') evaluated at seed time)
const showRows = []
for (const c of CINEMAS) for (const m of c.movies) for (const s of m.showtimes)
  showRows.push({ id: `s${showRows.length + 1}`, cinemaId: c.id, movieId: movieIds.get(m.title), ...s })
out.push(`INSERT OR IGNORE INTO shows (id,cinema_id,movie_id,show_date,start_time,format,screen) VALUES\n` +
  showRows.map(s => `(${q(s.id)},${q(s.cinemaId)},${q(s.movieId)},date('now'),${q(s.startTime)},${q(s.format)},${q(s.screen)})`).join(',\n') + ';')

// ad reports: N rows jittered around each show's target average
const adRows = []
for (const s of showRows) for (let i = 0; i < s.reports; i++) {
  const jitter = [-2, -1, 0, 1, 2][i % 5] * (0.6 + rng() * 0.4)
  adRows.push(`(${q(`a${adRows.length + 1}`)},${q(`u${101 + (adRows.length * 7) % 80}`)},${q(s.cinemaId)},${q(s.movieId)},${q(s.id)},${Math.max(1, Math.round(s.adMin + jitter))},${T0 - Math.floor(rng() * 2592000)})`)
}
out.push(`INSERT OR IGNORE INTO ad_reports (id,user_id,cinema_id,movie_id,show_id,ad_duration_minutes,created_at) VALUES\n` +
  adRows.join(',\n') + ';')

// ratings: ratingCount rows per cinema; the first rows carry the written reviews
const rateRows = []
for (const c of CINEMAS) {
  for (let i = 0; i < c.ratingCount; i++) {
    const vals = ['ambience', 'staff', 'experience', 'food', 'value'].map(k => clamp1(c.ratings[k] + (rng() - 0.5) * 0.8))
    const overall = clamp1(vals.reduce((a, b) => a + b, 0) / vals.length)
    const rev = i < c.reviews.length ? c.reviews[i] : null
    const uid = rev ? reviewerIds.get(rev[0]) : `u${101 + (rateRows.length * 11) % 80}`
    rateRows.push(`(${q(`rt${rateRows.length + 1}`)},${q(uid)},${q(c.id)},${overall},${vals.join(',')},${rev ? q(rev[1]) : 'NULL'},${T0 - (c.ratingCount - i) * 40000})`)
  }
}
out.push(`INSERT OR IGNORE INTO ratings (id,user_id,cinema_id,overall,ambience,staff,movie_experience,food_beverages,value_for_money,review,created_at) VALUES\n` +
  rateRows.join(',\n') + ';')

mkdirSync('server/database', { recursive: true })
writeFileSync('server/database/seed.sql', out.join('\n') + '\n')
console.log(`seed.sql written: ${userRows.length} users, ${CINEMAS.length} cinemas, ${movieIds.size} movies, ${showRows.length} shows, ${adRows.length} ad reports, ${rateRows.length} ratings`)
