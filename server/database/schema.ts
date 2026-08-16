import { integer, real, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// --- Better Auth tables (modelName-mapped to plural) ---
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id),
})

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// --- Domain tables (per project brief) ---
export const cinemas = sqliteTable('cinemas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const movies = sqliteTable('movies', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  language: text('language').notNull(),
  durationMin: integer('duration_min').notNull(),
  hue: integer('hue').notNull(),
  emoji: text('emoji').notNull(),
  posterUrl: text('poster_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const shows = sqliteTable('shows', {
  id: text('id').primaryKey(),
  cinemaId: text('cinema_id').notNull().references(() => cinemas.id),
  movieId: text('movie_id').notNull().references(() => movies.id),
  showDate: text('show_date').notNull(), // YYYY-MM-DD
  startTime: text('start_time').notNull(), // HH:MM
  format: text('format').notNull(),
  screen: text('screen').notNull(),
}, (t) => [index('shows_cinema_idx').on(t.cinemaId, t.showDate)])

export const adReports = sqliteTable('ad_reports', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  cinemaId: text('cinema_id').notNull().references(() => cinemas.id),
  movieId: text('movie_id').notNull().references(() => movies.id),
  showId: text('show_id').notNull().references(() => shows.id),
  adDurationMinutes: integer('ad_duration_minutes').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [uniqueIndex('ad_reports_user_show_uq').on(t.userId, t.showId)])

export const ratings = sqliteTable('ratings', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  cinemaId: text('cinema_id').notNull().references(() => cinemas.id),
  movieId: text('movie_id').references(() => movies.id),
  showId: text('show_id').references(() => shows.id),
  overall: real('overall'),
  ambience: real('ambience'),
  staff: real('staff'),
  movieExperience: real('movie_experience'),
  foodBeverages: real('food_beverages'),
  valueForMoney: real('value_for_money'),
  review: text('review'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [uniqueIndex('ratings_user_cinema_uq').on(t.userId, t.cinemaId)])
