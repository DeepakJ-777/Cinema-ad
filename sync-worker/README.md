# cinema-showtime-sync — daily showtime sync worker (Cloudflare Cron)

Standalone Cloudflare Worker (daily Cron `0 6 * * *` — 06:00 UTC / 11:30 IST)
that syncs cinema showtimes into the shared D1 database through a
**provider abstraction**, so no part of the system depends on one vendor.

## Architecture

```
ShowtimeProvider (interface)          sync-worker/src/provider.ts
      └── DistrictProvider            src/district.ts   (LIVE — legacy loop)
      └── BookMyShowProvider          src/bms.ts        (kept; blocked upstream, USE_BMS=1)
      └── FixtureBookMyShowProvider   src/fixture.ts    (DEV ONLY, USE_FIXTURE=1)

index.ts        cron orchestration (STEP 4A): enabled sync_locations ∩ rollout
                list CRON_DISTRICT_LOCATIONS (kochi) → syncDistrictLocation().
                /run (no ?location=) keeps the legacy provider loop for the e2e.
district-sync.ts production single-location District sync (STEP 3): directory
                search → verified cinema matching → save-test upserts →
                date-scoped stale cleanup (ad_reports preserved) → stamps.
district.ts     the only module that knows District (Zomato) URLs/page shapes
bms.ts          the only module that knows BookMyShow URLs/params
normalize.ts    BMS JSON → our model (defensive, no raw JSON stored)
d1.ts           legacy-loop upserts + cinema matching + per-cinema stale cleanup
http.ts         polite fetch: 1 attempt/URL, honest UA, budget, block classifier
```

Cron run flow (STEP 4A): `scheduled()` → `runCronDistrictSync()` → for each
enabled `sync_locations` row in `CRON_DISTRICT_LOCATIONS` (kochi):
`syncDistrictLocation()` → D1 + `sync_locations.last_synced_at`. Other enabled
locations are skipped with a clear log until STEP 4B generalizes the rollout.
Any District block/refusal → log the exact reason and stop the run.

Legacy loop (still on `/run`): read enabled `sync_locations` → skip locations
without `region_code` → load our D1 cinemas for the city (`knownVenues`) →
provider sync → upsert movies/shows in D1 → attach shows to **matched** cinemas
→ delete stale shows **per refreshed cinema only**. Any provider block → log
the exact reason and stop the run.

## District provider (live)

Data source: District's public pages only — no gateway, no auth, no browser
emulation. Everything needed is server-rendered.

| Request | Purpose | Notes |
|---|---|---|
| `GET /movies/cinemas-in-{city}` | city cinema directory | 1 per city per run; SSR links every ticketed cinema as `/movies/{slug}-in-{city}-CD{id}`; numeric city id sits in the footer SEO payload |
| `GET /movies/{slug}-in-{city}-CD{id}?fromdate=YYYY-MM-DD` | one cinema's movies + sessions | slug/city in the URL are decorative — only `CD{id}` matters; `__NEXT_DATA__` → `props.pageProps.data.serverState[cinema_id]` → `.meta.cinema` + `.arrangedSessions[].sessions[]` |

Verified District city ids (from District's own pages, 2026-08-17):
**kochi = 14, bengaluru = 4** — stored in `sync_locations.region_code`
(migration 0005). The provider cross-checks the directory's footer id against
`region_code` each run and logs drift.

The `/gw/*` gateway (`/gw/web/search`, `/gw/consumer/movies/v3/cities`)
answers `401 "Access token not found"` to plain clients and is never used.

### Cinema matching (our D1 row ↔ District cinema)

1. stored `cinemas.district_cinema_id` (a previous verified sync),
2. ranked name candidates from the city directory (slug-token superset with
   fewest extra tokens, then normalized containment),
3. each candidate is **verified against the cinema page itself** before use:
   `meta.cinema.cityId` must equal the directory city id, and the page pin
   must be within 10 km of our pin (District pins can be km off; genuine
   wrong-neighbourhood matches measure 14 km+ — e.g. INOX Garuda Magrath Road
   vs Yelahanka),
4. unmatched cinemas (Vanitha Cineplex, Shenoys, Urvashi today) are skipped
   and logged — never guessed, never created.

Verified ids persist to `cinemas.district_cinema_id`, so subsequent runs skip
name matching entirely (1 directory + N cinema pages per run, ~11 requests
for both cities).

### Showtime normalization rules

- `showTime` is an India **wall-clock string** (`2026-08-17T09:45`, no TZ
  suffix). Split by regex into `show_date`/`start_time`/`show_date_time` and
  stored verbatim — `new Date(showTime)` is never called, so no runtime
  timezone can shift it. `show_date_time = show_date || 'T' || start_time`
  always (asserted by the e2e).
- Only sessions for **today (IST)** are synced (`?fromdate=` pins the date;
  future dates are supported by the same code path when needed).
- District trims a day's session list as shows start/close, and serves **0
  arrangedSessions** for a city once its day ends (observed: all Bengaluru
  cinemas at ~23:20 IST while Kochi still listed its tail). The daily cron
  (11:30 IST) runs safely inside the full-schedule window; late-night manual
  runs legitimately see an empty day — `e2e-district-test.mjs` recognizes this
  (late-night IST guard) instead of failing.
- Availability: the session-level `seatStatus` (`Available`, `Filling Fast`,
  `Sold Out` → `available`/`filling_fast`/`sold_out`). When absent it is
  derived from `areas[]` — sold out ONLY when every seat tier reports
  `sAvail === 0`, never from a single area.
- Per-session `lang` and `scrnFmt` are stored per show (a movie can be
  Malayalam 2D in one audi and English IMAX in another). `audi` → `screen`.
- Movies are keyed by District `contentId` (`movies.source='district'`,
  `event_code=contentId`); shows by `sid` (`shows.id = district-{cinema}-{sid}`)
  → re-running sync is idempotent (e2e-verified: 220 → 220).
- Sound format: NOT extracted — `sndFmt` under `groupedMovies` is unreliable
  (observed `[null]`); not invented.

### Stale-show cleanup (per cinema, after successful sync only)

A cinema enters cleanup only when its District page was fetched and verified
this run. Its `source='district'` shows whose `last_synced_at` predates the
run are deleted — **except** shows referenced by `ad_reports` (community
history is preserved). Cinemas whose fetch failed keep their shows entirely.
Other providers' rows (`seed`, `bookmyshow`) are never touched.

## Data written

Only normalized model columns — `movies(source,event_code,poster_url)`,
`shows(session_id,show_date_time,availability_status,language,screen,source,
last_synced_at)`, `cinemas(district_cinema_id,last_synced_at)` — never raw
provider JSON. Synced shows surface automatically in `/api/cinemas` (IST-today
filter) and the existing cinema detail UI.

## Local dev

```bash
npm run sync:migrate:local          # apply migrations to the worker's local D1
cd sync-worker && npx wrangler d1 execute cinema-community --local --file ../server/database/seed.sql  # seed once
npm run sync:dev                    # wrangler dev --test-scheduled (:8787)
# /run?token=dev-local-only         (token from sync-worker/.dev.vars)
# /run?token=dev-local-only&location=kochi   # one location via syncDistrictLocation
node scripts/district-sync-kochi.mts      # STEP 3: 5-run Kochi suite (46 checks)
node scripts/e2e-cron-kochi-test.mjs      # STEP 4A: REAL cron path via /__scheduled (24 checks)
node scripts/e2e-district-test.mjs      # real District → local D1 (18 checks)
node scripts/district-copy-to-dev.mjs   # copy synced rows into data/db.sqlite
node scripts/e2e-district-frontend-test.mjs  # nuxt dev serves them (7 checks)
# fixture mode: npm run sync:dev -- --var USE_FIXTURE:1
node scripts/e2e-sync-test.mjs      # BMS fixture + real-block e2e (18 checks)
```

## Deploy

```bash
npm run sync:migrate:remote
npm run sync:deploy
cd sync-worker && npx wrangler secret put SYNC_TOKEN   # enables the /run manual trigger
cd .. && npx wrangler tail cinema-bms-sync
```

(Note: run the `secret put` from inside `sync-worker/` so the config resolves.)

## Config

`sync_locations` rows: `slug`, `name`, `region_code` (District numeric city
id — kochi=14, bengaluru=4; NULL disables the location), `enabled`. Env:
`MAX_FETCHES` (default 60), `USE_BMS=1` / `USE_FIXTURE=1` switch providers.

## BookMyShow (legacy provider, kept behind USE_BMS=1)

Status (2026-08-16): the showtimes endpoint is Cloudflare-challenge-guarded
for non-browser clients; the provider makes one attempt, classifies the
refusal and raises `ProviderBlockedError` — no retries, no spoofing. The
BMS region codes (e.g. `KOCH`) were retired from `sync_locations.region_code`
when District became the live provider; BMS dev runs must set their own.
