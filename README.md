# 🎬 Cinema Community — Community-Powered Cinema Experience

A web app that helps people decide **where and when** to watch a movie by combining cinema
information, showtimes, community-reported **advertisement durations**, and real audience ratings.

> **Status:** Full-stack MVP — Nuxt 4 frontend, Nitro APIs, Cloudflare D1 (Drizzle ORM),
> Better Auth email/password accounts. Seeded demo data ("Option A" from the brief:
> reference data → your database → your app). No BookMyShow scraping at runtime.

## Links

| Environment | URL |
| ---------- | --- |
| **Cloudflare Workers (live)** | <https://cinema-community.deepak777.workers.dev> |
| **Local dev** | <http://localhost:3000> (`npm run dev`) |
| **Local production preview (workerd)** | `npm run build` → `npm run preview:worker` |

## Quick start

```bash
npm install
npm run dev              # auto-migrates + seeds data/db.sqlite (libsql) on first run
npm run build            # production build (Cloudflare Workers module)
npm run deploy           # build + D1 migrations + wrangler deploy (no seeding — prod stays real)
npm run preview:worker   # serve the built Worker locally via wrangler dev
node scripts/smoke-test.mjs  # API smoke test against a running dev server
```

**Accounts:** create one via *Sign in → Create account* (email + password, 8+ chars).
Browsing never requires login; contributing (ad durations + ratings) does — the API
returns `401 Sign in to contribute` for anonymous POSTs.

## Stack

| Layer      | Tech                                                                     |
| ---------- | ------------------------------------------------------------------------ |
| Frontend   | Nuxt 4 + Vue 3 + Tailwind CSS v4                                          |
| Backend    | Nitro server routes (`server/api/**`)                                     |
| Database   | Cloudflare D1 + Drizzle ORM (prod) · libsql file DB (dev, auto-seeded)     |
| Auth       | Better Auth (drizzle adapter, email + password, cookie sessions)           |
| Hosting    | Cloudflare Workers (`cloudflare_module` preset, `nodejs_compat`)           |
| Maps       | Leaflet + OpenStreetMap (dark tiles © CARTO)                               |
| Fonts      | Bebas Neue · Manrope · IBM Plex Mono                                       |

## Architecture

```
Nuxt 4 (SSR + SPA)
   │  useFetch / $fetch
   ▼
Nitro API routes  ──  GET  /api/cinemas?city=     (public: cinemas+movies+showtimes+aggregates)
   │                 POST /api/ad-reports          (auth: upsert per user+show)
   │                 POST /api/ratings             (auth: upsert per user+cinema)
   │                 /api/auth/**                  (Better Auth handler)
   ▼
getDb(event): dev → libsql file (import.meta.dev, eliminated from Worker build)
              prod → event.context.cloudflare.env.DB (D1 binding)
```

- **Aggregation** happens in SQL — ratings use `AVG` per category; the typical ad duration
  is the **median of the 20 most recent reports** per show (medians resist "we saw 45 min of
  ads!" outliers, and the recency window keeps estimates current). `COUNT(*)` supplies report
  counts and `COUNT(DISTINCT user_id)` the contributor total — the frontend only renders
  what the community actually reported (null-safe everywhere: unreported shows display
  "no reports yet").
- **Upserts** via unique indexes `ad_reports(user,show)` and `ratings(user,cinema)` —
  one ad report per user per show; re-reporting updates the number, not the count.
- **Spam protection**: auth-gated contributions + a per-user sliding-window rate limit
  (8 POSTs/min per endpoint, in-memory) + review length cap.
- **Secrets**: `NUXT_AUTH_SECRET` is a wrangler secret (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" | npx wrangler secret put NUXT_AUTH_SECRET`).

## Database scripts

```bash
npm run db:generate        # drizzle-kit generate (schema → SQL migrations)
npm run seed:generate      # regenerate server/database/seed.sql from scripts/generate-seeds.mjs
npm run db:migrate:local   # apply migrations to local D1 (wrangler --local)
npm run seed:local         # seed local D1
npm run db:migrate:remote  # apply migrations to production D1
npm run seed:remote        # ⚠ DEMO ONLY — synthetic data; never run on a DB with real users
```

Seed contents (**synthetic demo data**, clearly labeled in `seed.sql`; timestamps are
relative to seed time so the data always looks recent): 89 users (`@demo.cinema` emails,
purgeable), 12 cinemas (6 Kochi, 6 Bengaluru), 8 movies, 93 shows (dated `date('now')` at
seed time), 450 ad reports, 254 ratings — all raw rows; every average/median is computed
by SQL, never stored.

## What's implemented

- **Marquee hero** with animated bulb frame, **film-strip dividers**, **ticket-stub** cinema cards
- **Discover**: Leaflet map (55%) + scrollable ticket list (45%), bidirectional pin ↔ card selection
- **City toggle** (Kochi / Bengaluru) — refetches `/api/cinemas?city=` reactively
- **Near me**: browser geolocation → haversine distance sort + distances on tickets + map pin
- **Search** cinemas and movies (filters map + list together) + **min-rating filter**
  (Any / 3.5+ / 4.0+ / 4.5+); cinemas with 1–2 ratings show a “limited data” hint
- **Cinema detail**: overall stars, 6 animated rating bars (IntersectionObserver reveal), audience
  quotes from review text, now-showing list where showtime chips reveal that show's
  **ad-duration estimate** (e.g. *"19:00 listed — ads typically end ≈ 18:41–18:43 · arrive by ≈ 18:55"*)
  with confidence hints — all live from D1
- **Contribute modal**: login-gated (embedded sign-in/up form); ad-duration band picker
  (chips, not free text), 6 star pickers, optional review — POSTs to the API, refreshes
  aggregates, shows a toast
- Fully responsive (map/list stack below ~860px, rating grid collapses at ~600px, fluid `clamp()` hero)

## Design tokens

| Token              | Hex       | Use                                  |
| ------------------ | --------- | ------------------------------------ |
| `--bg`             | `#17111A` | Page background                      |
| `--bg-alt`         | `#1F1720` | Panels on dark sections              |
| `--bg-alt2`        | `#241A26` | Nested panels                        |
| `--curtain`        | `#7A2036` | Crowd-sourced facts, report actions  |
| `--curtain-bright` | `#9C2C44` | Curtain hover/active                 |
| `--marquee`        | `#E8B54D` | Primary interactive/brand accent     |
| `--paper`          | `#F3E9D8` | Ticket/card surface                  |
| `--ink`            | `#241A1E` | Text on paper                        |
| `--mist`           | `#BBA8B4` | Secondary text on dark               |
| `--sage`           | `#8FAE8A` | Verified/confidence signals          |
| `--reel`           | `#382832` | Film-strip divider / borders         |

## Project structure

```
app/
├── assets/css/main.css     # Tailwind v4 theme tokens + signature-element CSS
├── components/            # Nav, MarqueeHero, FilmStrip, CinemaMap, TicketCard,
│                          # CinemaDetail, RatingBars, MovieRow, ContributeModal,
│                          # AuthModal, AuthForms, StarPicker, ToastHost, ...
├── composables/           # useCinemaStore (API-backed state), useAuth (Better Auth),
│                          # useToast
├── types/index.ts         # Cinema / Movie / Showtime / RatingBreakdown models (null-safe)
└── utils/                 # cities, haversine, time helpers (fmt12, shiftMinutes)
server/
├── api/                   # cinemas.get, ad-reports.post, ratings.post, auth/[...all]
├── database/              # Drizzle schema, migrations/, seed.sql
├── plugins/devDb.ts       # dev-only: auto-migrate + seed data/db.sqlite
└── utils/                 # getDb (D1/libsql switch), getAuth (Better Auth)
scripts/generate-seeds.mjs # regenerates seed.sql
wrangler.json              # D1 binding (DB), assets, nodejs_compat
```

## Roadmap

1. Geocode real cinema addresses **once** (Nominatim, ≤1 req/s, cache in D1) — never per-request
2. Refresh showtimes via a legitimate source/partnership before any live data
3. Movie/show-level rating aggregates in the UI (schema already stores `movie_id`/`show_id`)

## Credits

Map data © OpenStreetMap contributors · Tiles © CARTO · Mapping by Leaflet ·
Fonts by Google Fonts · Built with Nuxt & Tailwind CSS.
