import { sql } from 'drizzle-orm'
import { createError, defineEventHandler, readBody, toWebRequest } from 'h3'
import { getAuth } from '../utils/auth'
import { getDb } from '../utils/db'
import { allowRequest } from '../utils/rate-limit'
import { favourites } from '../database/schema'

/** Save a favourite for the signed-in user. Idempotent: the unique
 *  (user_id, cinema_id) index makes a second tap a no-op, never a duplicate. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const cinemaId = String(body?.cinemaId || '')
  if (!cinemaId) throw createError({ statusCode: 400, statusMessage: 'cinemaId is required' })

  const auth = await getAuth(event)
  const session = await auth.api.getSession({ headers: toWebRequest(event).headers })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Sign in to save favourites' })
  if (!allowRequest(`fav:${session.user.id}`))
    throw createError({ statusCode: 429, statusMessage: 'Too many favourite changes — try again in a minute' })

  const db = await getDb(event)
  const cinema = (await db.all(sql`SELECT id FROM cinemas WHERE id = ${cinemaId}`))[0]
  if (!cinema) throw createError({ statusCode: 404, statusMessage: 'Cinema not found' })

  await db.insert(favourites).values({
    id: crypto.randomUUID(),
    userId: session.user.id,
    cinemaId,
    createdAt: new Date(),
  }).onConflictDoNothing({ target: [favourites.userId, favourites.cinemaId] })

  return { ok: true }
})
