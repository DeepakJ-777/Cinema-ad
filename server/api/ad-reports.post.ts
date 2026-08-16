import { sql } from 'drizzle-orm'
import { createError, defineEventHandler, readBody, toWebRequest } from 'h3'
import { getAuth } from '../utils/auth'
import { getDb } from '../utils/db'
import { allowRequest } from '../utils/rate-limit'
import { adReports } from '../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const showId = String(body?.showId || '')
  const minutes = Math.round(Number(body?.minutes))
  if (!showId || !Number.isFinite(minutes) || minutes < 0 || minutes > 90)
    throw createError({ statusCode: 400, statusMessage: 'Invalid ad report' })

  const auth = await getAuth(event)
  const session = await auth.api.getSession({ headers: toWebRequest(event).headers })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Sign in to contribute' })
  if (!allowRequest(`ad:${session.user.id}`))
    throw createError({ statusCode: 429, statusMessage: 'Too many reports — try again in a minute' })

  const db = await getDb(event)
  const show = (await db.all(sql`SELECT cinema_id AS cinemaId, movie_id AS movieId FROM shows WHERE id = ${showId}`))[0] as any
  if (!show) throw createError({ statusCode: 404, statusMessage: 'Show not found' })

  await db.insert(adReports).values({
    id: crypto.randomUUID(), userId: session.user.id as string,
    cinemaId: show.cinemaId, movieId: show.movieId, showId,
    adDurationMinutes: minutes, createdAt: new Date(),
  }).onConflictDoUpdate({ target: [adReports.userId, adReports.showId], set: { adDurationMinutes: minutes } })

  return { ok: true }
})
