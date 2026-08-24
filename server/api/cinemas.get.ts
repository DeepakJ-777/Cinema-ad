import { sql } from 'drizzle-orm'
import { defineEventHandler, getQuery } from 'h3'
import { getDb } from '../utils/db'
import { buildCinemaPayloads } from '../utils/cinema-shows-payload'

export default defineEventHandler(async (event) => {
  const db = await getDb(event)
  // 'all' (default) loads every city so the client can consider cinemas near the
  // user across city boundaries; an explicit city still filters server-side.
  const cityParam = String(getQuery(event).city || 'all')
  const cityFilter = cityParam === 'all' ? sql`` : sql`WHERE city = ${cityParam}`

  const cinemas = (await db.all(sql`SELECT id, name, address, city, latitude, longitude, last_synced_at AS last_synced_at FROM cinemas ${cityFilter} ORDER BY city, name`)) as any[]
  if (!cinemas.length) return { cinemas: [], meta: { adReports: 0, ratings: 0, contributors: 0 } }

  const result = await buildCinemaPayloads(db, cinemas)

  const meta = (await db.all(sql`SELECT
    (SELECT COUNT(*) FROM ad_reports) AS adReports,
    (SELECT COUNT(*) FROM ratings) AS ratings,
    (SELECT COUNT(DISTINCT user_id) FROM (
       SELECT user_id FROM ad_reports UNION ALL SELECT user_id FROM ratings
    )) AS contributors`)) as any[]
  return { cinemas: result, meta: meta[0] ?? { adReports: 0, ratings: 0, contributors: 0 } }
})
