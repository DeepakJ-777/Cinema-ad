/**
 * Shared per-cinema payload builder — the business logic of /api/cinemas,
 * extracted so /api/cinemas/near can return the exact same showtime/
 * ad-report/rating payload for nearby cinemas without duplicating it.
 *
 * Input: basic cinema rows (as selected by cinemas.get.ts / near.get.ts).
 * Output: enriched cinema objects identical to what /api/cinemas serves
 * (movies with today's showtimes, median ad durations from recent reports,
 * rating aggregates, reviews, syncedAt).
 */
import { sql } from 'drizzle-orm'
import type { getDb } from './db'
import { isCinemaSyncing } from './district-near.ts'

type Db = Awaited<ReturnType<typeof getDb>>

export interface CinemaPayloadRow {
  id: string
  name: string
  address: string
  city: string
  latitude: number
  longitude: number
  last_synced_at?: number | null
}

const r1 = (v: number) => Math.round(v * 10) / 10

export async function buildCinemaPayloads(db: Db, cinemas: CinemaPayloadRow[]): Promise<any[]> {
  if (!cinemas.length) return []
  const CHUNK_SIZE = 50
  if (cinemas.length > CHUNK_SIZE) {
    const results: any[] = []
    for (let i = 0; i < cinemas.length; i += CHUNK_SIZE) {
      const chunk = cinemas.slice(i, i + CHUNK_SIZE)
      results.push(...await buildCinemaPayloads(db, chunk))
    }
    return results
  }

  const idList = sql.join(cinemas.map(c => sql`${c.id}` as any), sql`, `)


  const movies = (await db.all(sql`SELECT id, title, language, duration_min AS durationMin, hue, emoji FROM movies`)) as any[]
  const movieMap = new Map(movies.map(m => [m.id, m]))
  const showsQ = () => db.all(sql`
    SELECT s.id, s.cinema_id AS cinemaId, s.movie_id AS movieId, s.start_time AS startTime, s.format, s.screen,
           s.availability_status AS availability, s.show_date AS showDate, s.source
    FROM shows s
    WHERE s.cinema_id IN (${idList})
      AND (
        -- 1) Exactly today's show (synced or current date)
        s.show_date = date('now', '+330 minutes')
        -- 2) Manually contributed show (source = 'user'): valid within 7 days (weekly cinema cycle)
        OR (
          s.source = 'user'
          AND s.show_date >= date('now', '+330 minutes', '-7 days')
        )
      )
    ORDER BY s.start_time`)
  let shows = (await showsQ()) as any[]
  if (!shows.length) {
    // Fallback if no current shows exist at all (excluding manual shows older than 7 days)
    shows = (await db.all(sql`
      SELECT s.id, s.cinema_id AS cinemaId, s.movie_id AS movieId, s.start_time AS startTime, s.format, s.screen,
             s.availability_status AS availability, s.show_date AS showDate, s.source
      FROM shows s
      WHERE s.cinema_id IN (${idList})
        AND (s.source != 'user' OR s.show_date >= date('now', '+330 minutes', '-7 days'))
      ORDER BY s.start_time`)) as any[]
  }

  // Typical ad duration = MEDIAN of the 20 most recent reports for the show
  // (median resists outliers; the recency window keeps the estimate current).
  const medianRows = (await db.all(sql`
    WITH ranked AS (
      SELECT a.show_id AS showId, a.ad_duration_minutes AS m,
             ROW_NUMBER() OVER (PARTITION BY a.show_id ORDER BY a.created_at DESC, a.id) AS rn
      FROM ad_reports a
      WHERE a.cinema_id IN (${idList})
    ),
    picked AS (
      SELECT showId, m, rn, COUNT(*) OVER (PARTITION BY showId) AS n
      FROM ranked WHERE rn <= 20
    )
    SELECT showId, AVG(m) AS medianMin FROM picked
    WHERE rn IN ((n + 1) / 2, (n + 2) / 2)
    GROUP BY showId`)) as any[]
  const medianMap = new Map(medianRows.map(r => [r.showId, r.medianMin]))

  const countRows = (await db.all(sql`
    SELECT show_id AS showId, COUNT(*) AS n FROM ad_reports
    WHERE cinema_id IN (${idList}) GROUP BY show_id`)) as any[]
  const countMap = new Map(countRows.map(r => [r.showId, r.n]))

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

  return cinemas.map((c) => {
    const byMovie = new Map<string, any[]>()
    // Deduplicate shows by (movieId, startTime) preferring the latest show_date
    const cinemaShows = shows
      .filter(s => s.cinemaId === c.id)
      .sort((a, b) => (b.showDate || '').localeCompare(a.showDate || ''))

    const seenKeys = new Set<string>()
    const uniqueShows: any[] = []
    for (const s of cinemaShows) {
      const key = `${s.movieId}-${s.startTime}`
      if (!seenKeys.has(key)) {
        seenKeys.add(key)
        uniqueShows.push(s)
      }
    }

    // Sort by startTime
    uniqueShows.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))

    for (const s of uniqueShows) {
      const arr = byMovie.get(s.movieId) ?? []
      arr.push(s)
      byMovie.set(s.movieId, arr)
    }

    const g = ratingRows.find(r => r.cinemaId === c.id)
    return {
      id: c.id,
      name: c.name,
      address: c.address,
      city: c.city,
      lat: c.latitude,
      lng: c.longitude,
      isSyncing: isCinemaSyncing(c.id),
      syncedAt: c.last_synced_at ? new Date(c.last_synced_at * 1000).toISOString() : null,
      overall: g?.overall != null ? r1(g.overall) : null,
      ratingCount: g?.n ?? 0,
      ratings: g ? {
        ambience: r1(g.ambience), staff: r1(g.staff), movieExperience: r1(g.movieExperience),
        foodBeverages: r1(g.foodBeverages), valueForMoney: r1(g.valueForMoney),
      } : null,
      reviews: reviewRows.filter(r => r.cinemaId === c.id).slice(0, 3),
      movies: [...byMovie.entries()]
        .filter(([movieId]) => movieMap.has(movieId))
        .map(([movieId, sts]) => {
          const m = movieMap.get(movieId)!
          return {
            id: m.id,
            title: m.title,
            language: m.language,
            durationMin: m.durationMin,
            hue: m.hue,
            emoji: m.emoji,
            showtimes: sts.map(st => ({
              id: st.id,
              startTime: st.startTime,
              format: st.format,
              screen: st.screen,
              availability: st.availability ?? null,
              adDurationMin: medianMap.get(st.id) != null ? r1(medianMap.get(st.id)!) : null,
              adReports: countMap.get(st.id) ?? 0,
            })),
          }
        }),
    }
  })
}
