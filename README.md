# 🎬 ShowStart — Skip the Ads. Catch the Movie.

[![Live App](https://img.shields.io/badge/Live_App-cinema--community.deepak777.workers.dev-C6F135?style=flat&logo=cloudflare&logoColor=black)](https://cinema-community.deepak777.workers.dev)
[![Nuxt](https://img.shields.io/badge/Nuxt_4-00DC82?style=flat&logo=nuxtdotjs&logoColor=white)](https://nuxt.com)
[![Vue](https://img.shields.io/badge/Vue_3-4FC08D?style=flat&logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=flat&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare_D1-SQLite-orange?style=flat&logo=sqlite&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**ShowStart** tells you **when your movie actually begins**. By pairing listed theatre showtimes with crowd-reported pre-show commercial durations and statistical median filtering, ShowStart calculates an accurate **estimated actual start time** (e.g. *7:00 PM show + ~18 min pre-show ≈ 7:18 PM real start*), alongside multi-dimensional audience cinema ratings to help you pick the best screens.

---

## 🌐 Live Deployment & Links

| Environment | URL |
| :--- | :--- |
| **Production (Cloudflare Workers)** | <https://cinema-community.deepak777.workers.dev> |
| **Interactive Live Map** | <https://cinema-community.deepak777.workers.dev/map> |
| **Local Dev** | <http://localhost:3000> (`npm run dev`) |

---

## ✨ Features

- ⏱️ **Real Start-Time Predictions:** Listed showtimes combined with crowdsourced ad durations provide an arrival window (*e.g., "7:00 PM listed · pre-show ~18 min · 🎬 Estimated start ≈ 7:18 PM"*).
- 🛡️ **Anti-Troll Statistical Aggregation:** Typical ad duration is calculated using a **SQL rolling median over the 20 most recent reports**, automatically rejecting fake inputs and outliers.
- 🗺️ **Full-Viewport Interactive Map (`/map`):** Leaflet dark-mode map with responsive pins, city switcher (*All / Kochi / Bengaluru*), search filtering, and distance indicators.
- 📍 **Cache-First "Near Me" Discovery:** Browser Geolocation sorted by distance within a configurable radius (default 25 km). OpenStreetMap sweeps are cached in D1 using **geohash cells**, preventing redundant external API sweeps.
- 📱 **Mobile-First Action Sheets:** Sleek swipe-to-dismiss theatre details sheet with `popstate` browser history integration so the hardware back button closes modals seamlessly.
- ⭐ **Multi-Category Audience Ratings:** 5-point breakdown for *Ambience, Staff, Movie Experience, Food & Beverages,* and *Value for Money*, plus verified audience review quotes.
- 🎬 **Daily Showtimes & Sync Worker:** Automated daily cron + on-demand integration for live showtimes, with manual user-contributed showtime fallback.
- 🔐 **Secure Authentication:** Better Auth with Google OAuth and Email/Password session management.

---

## 🛠️ Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Nuxt 4 + Vue 3 (Client-side edge delivery, SPA mode) |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/vite`) + Custom Cinema Dark Theme |
| **Backend** | Nitro Server Engine on Cloudflare Workers (`cloudflare_module`) |
| **Database** | Cloudflare D1 (Serverless SQLite) + Drizzle ORM |
| **Auth** | Better Auth (Drizzle adapter, Google OAuth + Email/Password cookies) |
| **Maps** | Leaflet + OpenStreetMap (CARTO Dark Tiles) |
| **Sync Worker** | Cloudflare Worker Cron (`cinema-bms-sync`) + On-demand District sync |

---

## 🏗️ Architecture

```
Client (Browser / PWA)
   │
   ├── [Static Assets] ──> Cloudflare CDN (<1ms global edge delivery)
   │
   └── [$fetch / API]  ──> Nitro API Routes (Cloudflare Workers)
                             ├── GET  /api/cinemas?city=          (Cinemas + shows + median aggregates)
                             ├── GET  /api/cinemas/near?lat=&lng= (Cache-first geohash discovery)
                             ├── GET  /api/favourites             (User saved theatres)
                             ├── POST /api/ad-reports             (Auth-gated ad duration upsert)
                             ├── POST /api/ratings                (Auth-gated rating & review upsert)
                             └── /api/auth/**                     (Better Auth session endpoints)
                                   │
                                   ▼
                             Cloudflare D1 (SQLite via Drizzle ORM)
```

### Key Technical Decisions:
1. **Outlier-Resistant SQL Window Functions:** Medians are calculated in SQLite using `ROW_NUMBER() OVER (PARTITION BY a.show_id ORDER BY a.created_at DESC)` over the 20 most recent submissions.
2. **Zero-Cold-Start Edge Architecture:** `ssr: false` client-side rendering ensures static files load in `< 1ms` on Cloudflare CDN, eliminating cold-start resource limit spikes (Error 1102).
3. **Idempotent Upserts:** Database unique constraints on `(user_id, show_id)` and `(user_id, cinema_id)` ensure users update their existing submissions without artificially inflating community metrics.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- npm or pnpm

### 1. Installation
```bash
git clone https://github.com/DeepakJ-777/Cinema-ad.git
cd Cinema-ad
npm install
```

### 2. Development Mode
```bash
npm run dev
```
> Auto-migrates and seeds a local SQLite database (`data/db.sqlite`) on first launch. Access the app at `http://localhost:3000`.

### 3. Production Build & Deployment
```bash
# Build client and Nitro worker
npm run build

# Apply remote D1 migrations and deploy to Cloudflare Workers
npm run deploy
```

---

## 🗄️ Database Commands

| Command | Description |
| :--- | :--- |
| `npm run db:generate` | Generate SQL migrations from `server/database/schema.ts` |
| `npm run db:migrate:local` | Apply migrations to local SQLite / local D1 |
| `npm run db:migrate:remote` | Apply migrations to production Cloudflare D1 |
| `npm run seed:local` | Populate local database with demo seed data |
| `npm run seed:remote` | Populate production D1 database with seed data *(demo only)* |
| `npm run test:smoke` | Run automated API endpoint smoke tests |

---

## 📂 Project Structure

```
Cinema_ad/
├── app/
│   ├── assets/css/main.css      # Tailwind v4 theme variables & styles
│   ├── components/              # Vue components (CinemaMap, CinemaActionSheet, 
│   │                            # TicketCard, ContributeModal, AppNav, ...)
│   ├── composables/             # useCinemaStore, useAuth, useFavourites, useToast
│   ├── pages/
│   │   ├── index.vue            # Editorial homepage & CTA
│   │   └── map.vue              # Full-viewport interactive map application
│   ├── types/                   # TypeScript interfaces (Cinema, Movie, Showtime, etc.)
│   └── utils/                   # Geolocation, Haversine formulas, time formatters
├── server/
│   ├── api/                     # Nitro API endpoints (cinemas, ad-reports, ratings, auth)
│   ├── database/                # Drizzle schema, migrations, and seed scripts
│   └── utils/                   # Database connectors (D1/libsql switch), Better Auth config
├── sync-worker/                 # Standalone Cloudflare Worker for showtimes synchronization
├── wrangler.json                # Cloudflare Worker & D1 binding configuration
└── nuxt.config.ts               # Nuxt 4 configuration (SPA edge preset)
```

---

## 🎨 Design Tokens

| Token | Hex | Role |
| :--- | :--- | :--- |
| `--bg` | `#0E0E0E` | Main canvas background |
| `--bg-alt` | `#1A1A1A` | Card & container panels |
| `--bg-alt2` | `#1E1E1E` | Nested inputs & active elements |
| `--marquee` | `#C6F135` | Vibrant lime accent (buttons, pins, active states) |
| `--paper` | `#FFFFFF` | Primary headers & prominent text |
| `--body` | `#C8C8C8` | Descriptive & body text |
| `--mist` | `#9A9A9A` | Secondary labels & timestamps |
| `--reel` | `#262626` | Hairline borders & subtle dividers |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
