/**
 * cinema-showtime-sync — daily showtime sync (Cloudflare Cron).
 *
 * Flow per run:
 *   sync_locations (enabled) → for each with a region_code:
 *     load our D1 cinemas for the city (known venues)
 *     provider.syncLocation()  ← ShowtimeProvider seam (District today;
 *                               BookMyShow behind USE_BMS=1, fixture USE_FIXTURE=1)
 *     writeLocationShows()     ← normalize → upsert movies/shows into D1,
 *                               attach to matched cinemas, drop stale shows
 *   ProviderBlockedError → log the exact reason and STOP the run (no bypass).
 *   Locations without region_code are skipped with a clear log (config, not
 *   code, decides coverage). For District, region_code is the numeric city id
 *   (verified from District's own city pages: kochi=14, bengaluru=4).
 *
 * Nothing but normalized model columns is stored; raw provider responses are
 * logged (truncated) for debugging only and never persisted.
 */

import { BookMyShowProvider } from './bms'
import { DistrictProvider } from './district'
import { syncDistrictLocation } from './district-sync'
import { writeLocationShows, type D1Database } from './d1'
import { FixtureBookMyShowProvider } from './fixture'
import type { FetchBudget } from './http'
import { ProviderBlockedError, ProviderSkippedError, type KnownVenue, type ShowtimeProvider } from './provider'

interface ScheduledController { cron: string; scheduledTime: number }
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void }

interface Env {
  DB: D1Database
  SYNC_TOKEN?: string
  /** DEV ONLY (.dev.vars / --var): run the fixture provider instead of the live one. */
  USE_FIXTURE?: string
  /** Opt back into BookMyShow (blocked upstream) instead of District. */
  USE_BMS?: string
  /** Override the per-run fetch budget (default 60). */
  MAX_FETCHES?: string
}

interface SyncLocationRow { slug: string; name: string; region_code: string | null }

const MAX_FETCHES_PER_RUN = 60 // 2 city directories + ~12 cinema pages × 2 cities + margin
const BETWEEN_LOCATIONS_MS = 2500

interface SyncSummary {
  startedAt: string
  trigger: string
  provider: string
  locations: { slug: string; status: string; detail?: unknown }[]
  stoppedEarly?: string
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function buildProvider(env: Env): ShowtimeProvider {
  if (env.USE_FIXTURE === '1') return new FixtureBookMyShowProvider()
  if (env.USE_BMS === '1') return new BookMyShowProvider()
  return new DistrictProvider()
}

async function runSync(env: Env, trigger: string): Promise<SyncSummary> {
  const provider = buildProvider(env)
  const summary: SyncSummary = {
    startedAt: new Date().toISOString(),
    trigger,
    provider: provider.id,
    locations: [],
  }
  console.log(`[sync] run start (trigger=${trigger}, provider=${provider.id})`)

  let rows: SyncLocationRow[] = []
  try {
    const r = await env.DB.prepare('SELECT slug, name, region_code FROM sync_locations WHERE enabled = 1 ORDER BY slug').all<SyncLocationRow>()
    rows = r.results ?? []
  }
  catch (e: any) {
    summary.stoppedEarly = `sync_locations read failed: ${e?.message ?? e} — apply migrations first (npm run sync:migrate:local)`
    console.log(`[sync] STOPPED: ${summary.stoppedEarly}`)
    return summary
  }
  console.log(`[sync] ${rows.length} enabled location(s): ${rows.map(l => l.slug).join(', ') || '(none)'}`)

  const budget: FetchBudget = { left: Number(env.MAX_FETCHES) > 0 ? Number(env.MAX_FETCHES) : MAX_FETCHES_PER_RUN }
  const runStartedAtSec = Math.floor(Date.now() / 1000)
  const dateCode = new Date().toISOString().slice(0, 10).replaceAll('-', '')

  for (const loc of rows) {
    if (!loc.region_code) {
      const detail = 'region_code not set in sync_locations — skipping (set the provider region code to enable)'
      console.log(`[sync] ${loc.slug}: SKIP — ${detail}`)
      summary.locations.push({ slug: loc.slug, status: 'skipped', detail })
      continue
    }

    try {
      // Our cinemas in this city — cinema-driven providers (District) fetch one
      // provider page per known cinema, so they need the list up front.
      const knownVenues: KnownVenue[] = ((await env.DB.prepare(
        'SELECT id, name, latitude, longitude, district_cinema_id FROM cinemas WHERE city = ?',
      ).bind(loc.slug).all<{ id: string, name: string, latitude: number | null, longitude: number | null, district_cinema_id: string | null }>()).results ?? [])
        .map(c => ({
          id: c.id,
          name: c.name,
          lat: c.latitude ?? undefined,
          lng: c.longitude ?? undefined,
          districtCinemaId: c.district_cinema_id ?? undefined,
        }))

      const data = await provider.syncLocation({
        slug: loc.slug, name: loc.name, regionCode: loc.region_code, dateCode, budget, knownVenues,
      })
      const write = await writeLocationShows(env.DB, loc.slug, provider.id, data, runStartedAtSec)
      console.log(
        `[sync] ${loc.slug}: OK — pages=${data.pages.length} venues=${data.venues.length} `
        + `matched=${write.venuesMatched.length} unmatched=${write.venuesUnmatched.length} `
        + `movies=${write.moviesUpserted} shows=${write.showsUpserted} staleDeleted=${write.staleShowsDeleted}`,
      )
      for (const m of write.venuesMatched) console.log(`[sync]   matched: ${m}`)
      for (const u of write.venuesUnmatched) console.log(`[sync]   unmatched venue skipped (no existing cinema): ${u.name} (${u.code})`)
      summary.locations.push({ slug: loc.slug, status: 'ok', detail: write })
    }
    catch (e) {
      if (e instanceof ProviderBlockedError) {
        summary.stoppedEarly = `provider blocked at ${loc.slug}: ${e.message} — stopping per policy; no bypass attempted. Authorized API/partnership access is required for real data.`
        console.log(`[sync] BLOCKED: ${summary.stoppedEarly}`)
        summary.locations.push({ slug: loc.slug, status: 'blocked', detail: e.message })
        return summary
      }
      if (e instanceof ProviderSkippedError) {
        console.log(`[sync] ${loc.slug}: SKIP — ${e.message}`)
        summary.locations.push({ slug: loc.slug, status: 'skipped', detail: e.message })
        continue
      }
      console.log(`[sync] ${loc.slug}: ERROR — ${e}`)
      summary.locations.push({ slug: loc.slug, status: 'error', detail: String(e) })
    }
    await sleep(BETWEEN_LOCATIONS_MS)
  }

  console.log(`[sync] run complete — ${summary.locations.length} location(s) processed`)
  return summary
}

// ------------------------------------------------------------ worker entry

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runSync(env, `cron:${controller.cron}`))
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

    if (url.pathname === '/healthz') return json({ ok: true, provider: buildProvider(env).id })

    if (url.pathname === '/') {
      return json({
        worker: 'cinema-showtime-sync',
        cron: '0 6 * * * (daily 06:00 UTC = 11:30 IST)',
        endpoints: {
          '/run?token=…': 'run the sync now (requires SYNC_TOKEN)',
          '/run?token=…&location=slug': 'sync ONE location via the production District path (syncDistrictLocation); optional &date=YYYY-MM-DD',
          '/healthz': 'liveness',
        },
        provider: buildProvider(env).id,
        policy: 'one attempt per URL, honest UA, stops on any block, stores only normalized data',
      })
    }

    if (url.pathname === '/run') {
      if (!env.SYNC_TOKEN) return json({ error: 'SYNC_TOKEN not configured — manual trigger disabled' }, 503)
      if (url.searchParams.get('token') !== env.SYNC_TOKEN) return json({ error: 'invalid token' }, 401)
      // STEP 3: single-location production sync (syncDistrictLocation). The
      // cron is NOT wired to this yet — /run without ?location keeps the
      // legacy multi-location behavior untouched.
      const location = url.searchParams.get('location')
      if (location) {
        const date = url.searchParams.get('date') ?? undefined
        try {
          const report = await syncDistrictLocation(env.DB, location, date ? { date } : {})
          return json({ ok: report.status === 'ok', trigger: `manual:location:${location}`, report })
        }
        catch (e: any) {
          return json({ ok: false, trigger: `manual:location:${location}`, error: e?.message ?? String(e) }, 500)
        }
      }
      return json(await runSync(env, 'manual'))
    }

    return json({ error: 'not found' }, 404)
  },
}
