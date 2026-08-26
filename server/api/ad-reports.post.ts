import { sql } from 'drizzle-orm'
import { createError, defineEventHandler, readBody, toWebRequest } from 'h3'
import { getAuth } from '../utils/auth'
import { getDb } from '../utils/db'
import { allowRequest } from '../utils/rate-limit'
import { adReports, movies, shows } from '../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const showId = String(body?.showId || '').trim()
  const cinemaId = String(body?.cinemaId || '').trim()
  const movieTitle = String(body?.movieTitle || '').trim()
  const language = String(body?.language || '').trim() || 'General'
  const customDate = String(body?.date || '').trim() || new Date().toISOString().slice(0, 10)
  const startTime = String(body?.startTime || '').trim()
  const minutes = Math.round(Number(body?.minutes))

  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 90)
    throw createError({ statusCode: 400, statusMessage: 'Invalid ad duration' })

  const auth = await getAuth(event)
  const session = await auth.api.getSession({ headers: toWebRequest(event).headers })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Sign in to contribute' })
  if (!allowRequest(`ad:${session.user.id}`))
    throw createError({ statusCode: 429, statusMessage: 'Too many reports — try again in a minute' })

  const db = await getDb(event)

  let resolvedCinemaId = cinemaId
  let resolvedMovieId = ''
  let resolvedShowId = showId

  if (showId) {
    const show = (await db.all(sql`SELECT cinema_id AS cinemaId, movie_id AS movieId FROM shows WHERE id = ${showId}`))[0] as any
    if (!show) throw createError({ statusCode: 404, statusMessage: 'Show not found' })
    resolvedCinemaId = show.cinemaId
    resolvedMovieId = show.movieId
  } else {
    if (!cinemaId || !movieTitle || !startTime) {
      throw createError({ statusCode: 400, statusMessage: 'Please provide movie name and start time' })
    }

    // 1. Find or create movie
    const existingMovie = (await db.all(sql`SELECT id FROM movies WHERE LOWER(title) = LOWER(${movieTitle}) LIMIT 1`))[0] as any
    if (existingMovie) {
      resolvedMovieId = existingMovie.id
    } else {
      resolvedMovieId = `m-${crypto.randomUUID().slice(0, 8)}`
      await db.insert(movies).values({
        id: resolvedMovieId,
        title: movieTitle,
        language: language,
        durationMin: 150,
        hue: 200,
        emoji: '🎬',
        source: 'user',
        createdAt: new Date(),
      })
    }

    // 2. Normalize startTime to HH:MM
    let normalizedStart = startTime
    const match = startTime.match(/(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?/i)
    if (match) {
      let h = parseInt(match[1], 10)
      const m = parseInt(match[2] || '0', 10)
      const meridiem = (match[3] || '').toLowerCase()
      if (meridiem === 'pm' && h < 12) h += 12
      if (meridiem === 'am' && h === 12) h = 0
      normalizedStart = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }

    const existingShow = (await db.all(sql`SELECT id FROM shows WHERE cinema_id = ${cinemaId} AND movie_id = ${resolvedMovieId} AND start_time = ${normalizedStart} AND show_date = ${customDate} LIMIT 1`))[0] as any
    if (existingShow) {
      resolvedShowId = existingShow.id
    } else {
      resolvedShowId = `s-${crypto.randomUUID().slice(0, 8)}`
      await db.insert(shows).values({
        id: resolvedShowId,
        cinemaId,
        movieId: resolvedMovieId,
        showDate: customDate,
        startTime: normalizedStart,
        format: '2D',
        screen: 'Screen 1',
        language: language,
        source: 'user',
      })
    }
  }

  await db.insert(adReports).values({
    id: crypto.randomUUID(),
    userId: session.user.id as string,
    cinemaId: resolvedCinemaId,
    movieId: resolvedMovieId,
    showId: resolvedShowId,
    adDurationMinutes: minutes,
    createdAt: new Date(),
  }).onConflictDoUpdate({
    target: [adReports.userId, adReports.showId],
    set: { adDurationMinutes: minutes },
  })

  return { ok: true }
})
