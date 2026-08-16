import { sql } from 'drizzle-orm'
import { defineEventHandler, getQuery } from 'h3'
import { getDb } from '../utils/db'

const r1 = (v: number) => Math.round(v * 10) / 10

export default defineEventHandler(async (event) => {
  const db = await getDb(event)
  const city = String(getQuery(event).city || 'kochi')

  const cinemas = (await db.all(sql`SELECT id, name, address, city, latitude AS lat, longitude AS lng FROM cinemas WHERE city = ${city} ORDER BY name`)) as any[]
  if (!cinemas.length) return { cinemas: [], meta: { adReports: 0, ratings: 0 } }
  const idList = sql.join(cinemas.map(c => sql`${c.id}` as any), sql`, `)

  const movies = (await db.all(sql`SELECT id, title, language, duration_min AS durationMin, hue, emoji FROM movies`)) as any[]
  const movieMap = new Map(movies.map(m => [m.id, m]))

  const showsQ = (today: boolean) => db.all(sql`
    SELECT s.id, s.cinema_id AS cinemaId, s.movie_id AS movieId, s.start_time AS startTime, s.format, s.screen,
           ROUND(AVG(a.ad_duration_minutes), 1) AS adDurationMin, COUNT(a.id) AS adReports
    FROM shows s LEFT JOIN ad_reports a ON a.show_id = s.id
    WHERE s.cinema_id IN (${idList}) ${today ? sql`AND s.show_date = date('now')` : sql``}
    GROUP BY s.id ORDER BY s.start_time`)
  let shows = (await showsQ(true)) as any[]
  if (!shows.length) shows = (await showsQ(false)) as any[] // stale-seed fallback

  const ratingRows = (await db.all(sql`
    SELECT cinema_id AS cinemaId, COUNT(*) AS n, AVG(overall) AS overall, AVG(ambience) AS ambience,
           AVG(staff) AS staff, AVG(movie_experience) AS movieExperience,
           AVG(food_beverages) AS foodBeverages, AVG(value_for_money) AS valueForMoney
    FROM ratings WHERE cinema_id IN (${idList}) GROUP BY cinema_id`)) as any[]

  const reviewRows = (await db.all(sql`
    SELECT r.cinema_id AS cinemaId, u.name, strftime('%b %d', r.created_at, 'unixepoch') AS date, r.review AS text
    FROM ratings r JOIN users u ON u.id = r.user_id
    WHERE r.review IS NOT NULL AND r.cinema_id IN (${idList})
    ORDER BY r.created_at DESC`)) as any[]

  const result = cinemas.map((c) => {
    const byMovie = new Map<string, any[]>()
    for (const s of shows.filter(s => s.cinemaId === c.id)) {
      const arr = byMovie.get(s.movieId) ?? []; arr.push(s); byMovie.set(s.movieId, arr)
    }
    const g = ratingRows.find(r => r.cinemaId === c.id)
    return {
      ...c,
      overall: g?.overall != null ? r1(g.overall) : null,
      ratingCount: g?.n ?? 0,
      ratings: g ? {
        ambience: r1(g.ambience), staff: r1(g.staff), movieExperience: r1(g.movieExperience),
        foodBeverages: r1(g.foodBeverages), valueForMoney: r1(g.valueForMoney),
      } : null,
      reviews: reviewRows.filter(r => r.cinemaId === c.id).slice(0, 3),
      movies: [...byMovie.entries()].map(([movieId, sts]) => {
        const m = movieMap.get(movieId)!
        return {
          id: m.id, title: m.title, language: m.language, durationMin: m.durationMin, hue: m.hue, emoji: m.emoji,
          showtimes: sts.map(s => ({
            id: s.id, startTime: s.startTime, format: s.format, screen: s.screen,
            adDurationMin: s.adDurationMin ?? null, adReports: s.adReports ?? 0,
          })),
        }
      }),
    }
  })

  const meta = (await db.all(sql`SELECT (SELECT COUNT(*) FROM ad_reports) AS adReports, (SELECT COUNT(*) FROM ratings) AS ratings`)) as any[]
  return { cinemas: result, meta: meta[0] ?? { adReports: 0, ratings: 0 } }
})
