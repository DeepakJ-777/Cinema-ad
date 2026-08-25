import { sql } from 'drizzle-orm'
import { defineEventHandler, toWebRequest } from 'h3'
import { getAuth } from '../utils/auth'
import { getDb } from '../utils/db'

/** The signed-in user's favourite cinema ids, loaded once per session.
 *  Anonymous → empty list (hearts simply render unfilled). Joins cinemas so
 *  favourite records for deleted theatres never surface as broken ids. */
export default defineEventHandler(async (event) => {
  const auth = await getAuth(event)
  const session = await auth.api.getSession({ headers: toWebRequest(event).headers })
  if (!session?.user) return { favourites: [] as string[] }

  const db = await getDb(event)
  const rows = await db.all(
    sql`SELECT f.cinema_id FROM favourites f
        JOIN cinemas c ON c.id = f.cinema_id
        WHERE f.user_id = ${session.user.id}`,
  )
  return { favourites: rows.map(r => (r as { cinema_id: string }).cinema_id) }
})
