import { sql } from 'drizzle-orm'
import { createError, defineEventHandler, readBody, toWebRequest } from 'h3'
import { getAuth } from '../utils/auth'
import { getDb } from '../utils/db'
import { allowRequest } from '../utils/rate-limit'
import { ratings } from '../database/schema'

const FIELDS = ['overall', 'ambience', 'staff', 'movieExperience', 'foodBeverages', 'valueForMoney'] as const

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const cinemaId = String(body?.cinemaId || '')
  const review = typeof body?.review === 'string' && body.review.trim() ? body.review.trim().slice(0, 500) : null
  const values: Partial<Record<typeof FIELDS[number], number>> = {}
  for (const f of FIELDS) {
    const v = Number(body?.[f])
    if (Number.isFinite(v) && v >= 1 && v <= 5) values[f] = v
  }
  if (!cinemaId || (!review && Object.keys(values).length === 0))
    throw createError({ statusCode: 400, statusMessage: 'Nothing to submit' })

  const auth = await getAuth(event)
  const session = await auth.api.getSession({ headers: toWebRequest(event).headers })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Sign in to contribute' })
  if (!allowRequest(`rt:${session.user.id}`))
    throw createError({ statusCode: 429, statusMessage: 'Too many ratings — try again in a minute' })

  const db = await getDb(event)
  const cinema = (await db.all(sql`SELECT id FROM cinemas WHERE id = ${cinemaId}`))[0]
  if (!cinema) throw createError({ statusCode: 404, statusMessage: 'Cinema not found' })

  const row: Record<string, unknown> = {
    id: crypto.randomUUID(), userId: session.user.id, cinemaId,
    movieId: body?.movieId ?? null, showId: body?.showId ?? null, review, createdAt: new Date(),
  }
  for (const f of FIELDS) row[f] = values[f] ?? null

  const set: Record<string, unknown> = {}
  for (const f of FIELDS) if (values[f] != null) set[f] = values[f]
  if (review) set.review = review

  await db.insert(ratings).values(row as any).onConflictDoUpdate({ target: [ratings.userId, ratings.cinemaId], set })
  return { ok: true }
})
