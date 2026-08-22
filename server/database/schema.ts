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

// --- Near-me discovery cache: one Overpass sweep per geohash cell per TTL ---
export const discoveryCache = sqliteTable('discovery_cache', {
  geohash: text('geohash').primaryKey(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  checkedAt: integer('checked_at', { mode: 'timestamp' }).notNull(),
})

// --- Showtime sync config: which cities the daily BMS sync cron covers ---
// Read by sync-worker; the PoC never writes scraped show data to D1.
export const syncLocations = sqliteTable('sync_locations', {
  slug: text('slug').primaryKey(), // canonical city slug, e.g. 'kochi'
  name: text('name').notNull(), // display name, e.g. 'Kochi'
  regionCode: text('region_code'), // provider region/city code — District numeric city id (kochi=14, bengaluru=4); null disables provider sync
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }), // future: set on successful sync
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// --- Domain tables (per project brief) ---
export const cinemas = sqliteTable('cinemas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  venueCode: text('venue_code'), // provider venue code when matched (BMS), else null
  districtCinemaId: text('district_cinema_id'), // District (Zomato) cinema id, e.g. '1022294'
  source: text('source').notNull().default('seed'), // seed | osm | bookmyshow | district
  /** Unix seconds of the last successful provider sync that covered this cinema
   *  (set even when the provider confirmed zero shows — distinguishes
   *  "no shows today" from "showtimes unavailable"). */
  lastSyncedAt: integer('last_synced_at'),
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
  eventCode: text('event_code'), // provider event code (BMS ETxxxxxxx) when synced
  source: text('source').notNull().default('seed'), // seed | bookmyshow
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const shows = sqliteTable('shows', {
  id: text('id').primaryKey(),
  cinemaId: text('cinema_id').notNull().references(() => cinemas.id),
  movieId: text('movie_id').notNull().references(() => movies.id),
  showDate: text('show_date').notNull(), // YYYY-MM-DD
  startTime: text('start_time').notNull(), // HH:MM (24h)
  format: text('format').notNull(),
  screen: text('screen').notNull(),
  // --- synced-show fields (populated by the provider cron; null for seed rows) ---
  sessionId: text('session_id'),
  showTimeCode: text('show_time_code'),
  showDateTime: text('show_date_time'), // provider ISO-like timestamp
  availabilityStatus: text('availability_status'), // e.g. available | sold_out
  language: text('language'), // per-show language when known
  source: text('source').notNull().default('seed'), // seed | bookmyshow
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
}, (t) => [index('shows_cinema_idx').on(t.cinemaId, t.showDate), index('shows_source_idx').on(t.source, t.lastSyncedAt)])

export const adReports = sqliteTable('ad_reports', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  cinemaId: text('cinema_id').notNull().references(() => cinemas.id),
  movieId: text('movie_id').notNull().references(() => movies.id),
  showId: text('show_id').notNull().references(() => shows.id),
  adDurationMinutes: integer('ad_duration_minutes').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [uniqueIndex('ad_reports_user_show_uq').on(t.userId, t.showId), index('ad_reports_show_idx').on(t.showId)])

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
}, (t) => [uniqueIndex('ratings_user_cinema_uq').on(t.userId, t.cinemaId), index('ratings_cinema_idx').on(t.cinemaId)])
