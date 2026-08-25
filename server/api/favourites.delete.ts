import { and, eq } from 'drizzle-orm'
import { createError, defineEventHandler, getQuery, toWebRequest } from 'h3'
import { getAuth } from '../utils/auth'
import { getDb } from '../utils/db'
import { favourites } from '../database/schema'

/** Remove ONE of the signed-in user's favourites. The user id comes from the
 *  session (never the request), so a user can only ever delete their own rows. */
export default defineEventHandler(async (event) => {
  const cinemaId = String(getQuery(event).cinemaId || '')
  if (!cinemaId) throw createError({ statusCode: 400, statusMessage: 'cinemaId is required' })

  const auth = await getAuth(event)
  const session = await auth.api.getSession({ headers: toWebRequest(event).headers })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Sign in to manage favourites' })

  const db = await getDb(event)
  await db.delete(favourites).where(
    and(eq(favourites.userId, session.user.id), eq(favourites.cinemaId, cinemaId)),
  )

  return { ok: true }
})
