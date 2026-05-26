# Warm Kitchen — Recipes PWA

A complete, deployable, installable Progressive Web App for browsing recipes from
[TheMealDB](https://www.themealdb.com/), saving your favorites into a server-owned
collection, and following each recipe **hands-free** in a distraction-free cooking
mode that holds the screen awake.

> **Stack at a glance**
> - **Backend**: Go (100%) + SQLite via the pure-Go `modernc.org/sqlite` driver
> - **Frontend**: React + Vite + TypeScript + Tailwind + shadcn/ui
> - **PWA**: handwritten service worker, manifest, offline fallback, IndexedDB mirror
> - **Cost**: zero — everything runs on free tiers

---

## Architecture

This app has **two cleanly separated data planes**:

### 1. Browse / Discovery — TheMealDB proxy
The Go server forwards a curated set of TheMealDB endpoints under `/api/*`. The
client never calls TheMealDB directly, the upstream API key is injected on the
server, and slow-changing endpoints are cached in memory + via HTTP cache headers.

| Client call | Server route | Upstream |
| --- | --- | --- |
| `api.search(q)` | `GET /api/search?s=q` | `search.php?s=q` |
| `api.meal(id)` | `GET /api/meal/:id` | `lookup.php?i=id` |
| `api.categories()` | `GET /api/categories` | `categories.php` (TTL cached, 1h) |
| `api.filter(c)` | `GET /api/filter?c=c` | `filter.php?c=c` |
| `api.random()` | `GET /api/random` | `random.php` (no cache) |

### 2. Collection / Persistence — Go owns the database
When the user saves a recipe, the **server normalizes the TheMealDB document into
a structured `Recipe`** and writes it to SQLite. From that point on, the saved
copy is independent of upstream changes.

| Client call | Server route | Description |
| --- | --- | --- |
| `api.listRecipes(params)` | `GET /api/recipes` | List, with optional `?search=&tag=&sort=&maxTotal=` |
| `api.getRecipe(id)` | `GET /api/recipes/:id` | One recipe |
| `api.createRecipe(input)` | `POST /api/recipes` | Save (accepts a normalized payload, or `{sourceId}` to fetch + normalize server-side) |
| `api.updateRecipe(id, …)` | `PUT /api/recipes/:id` | Edit |
| `api.deleteRecipe(id)` | `DELETE /api/recipes/:id` | Remove |

A single, shared collection is treated as the user's personal collection — no
authentication.

### Is it 100% Go?

**Yes** for the backend. Every server-side artifact is Go:

- Web framework: Go standard `net/http` (with the 1.22+ method routing)
- HTTP middleware (logging, gzip, CORS, security headers, panic recovery): Go
- TheMealDB client + the normalize pipeline: Go
- TTL cache: Go
- DB driver: `modernc.org/sqlite` (transpiled to pure Go, no CGO)
- Icon generator (`server/cmd/icongen`): Go (`image/draw` + `image/png`)

The **only** non-Go thing on the server side is the SQLite engine itself, which
is a documented and expected exception (you would otherwise need C in CGO).

---

## Data model

Server-owned table `recipes` (SQLite). JSON-encoded columns are unmarshaled into
strongly typed Go structs at the API boundary:

```sql
CREATE TABLE IF NOT EXISTS recipes (
  id                TEXT PRIMARY KEY,            -- server-generated UUID
  title             TEXT NOT NULL,
  source            TEXT NOT NULL DEFAULT 'manual', -- 'themealdb' | 'manual'
  source_id         TEXT,                         -- original TheMealDB meal id
  category          TEXT,
  area              TEXT,                         -- cuisine
  tags              TEXT NOT NULL DEFAULT '[]',   -- JSON array<string>
  image_url         TEXT,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  servings          INTEGER,
  ingredients       TEXT NOT NULL DEFAULT '[]',   -- JSON array<{name,quantity,unit}>
  steps             TEXT NOT NULL DEFAULT '[]',   -- JSON array<string>
  youtube_url       TEXT,
  source_url        TEXT,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_recipes_source ON recipes(source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX idx_recipes_title    ON recipes(title);
CREATE INDEX idx_recipes_category ON recipes(category);
```

The `(source, source_id)` unique index prevents duplicate saves of the same
TheMealDB meal.

---

## Project layout

```text
Recipe App/
├── README.md                       ← you are here
├── server/                         ← Go backend (100% Go)
│   ├── go.mod / go.sum
│   ├── cmd/
│   │   ├── api/main.go             ← HTTP entry point
│   │   └── icongen/main.go         ← placeholder PWA icon generator
│   ├── internal/
│   │   ├── cache/ttl.go            ← tiny generic TTL cache
│   │   ├── config/config.go        ← env loader
│   │   ├── mealdb/
│   │   │   ├── client.go           ← TheMealDB HTTP client
│   │   │   └── normalize.go        ← TheMealDB → Recipe mapping
│   │   ├── models/recipe.go        ← Recipe / Ingredient / ErrorResponse
│   │   ├── server/
│   │   │   ├── server.go           ← router + middleware chain
│   │   │   └── handlers.go         ← proxy + CRUD handlers
│   │   └── store/store.go          ← SQLite store + migrations
│   ├── recipes.db                  ← created at runtime
│   └── .env.example
└── client/                         ← React + Vite + TS PWA
    ├── package.json / vite.config.ts / tsconfig*.json
    ├── tailwind.config.js / postcss.config.js / components.json
    ├── index.html
    ├── public/
    │   ├── manifest.webmanifest
    │   ├── sw.js                   ← handwritten service worker
    │   ├── offline.html            ← offline fallback
    │   ├── icon.svg / icon-192.png / icon-512.png / apple-touch-icon.png
    └── src/
        ├── main.tsx / App.tsx / index.css
        ├── components/             ← Header, ThemeToggle, RecipeCard, …
        │   └── ui/                 ← shadcn/ui (button, card, input, badge, dialog, skeleton, sonner)
        ├── hooks/                  ← useMealdb, useRecipes, useOnlineStatus
        ├── lib/                    ← api, idb, wakelock, theme, sw-register, utils
        ├── pages/                  ← Home, Details, Collection, SavedDetails, Cooking
        └── types/recipe.ts
```

---

## Setup

### 0. Prerequisites
- Go **1.22+**
- Node **20+** and npm **10+**

### 1. Server
```bash
cd server
cp .env.example .env       # adjust if you have a real TheMealDB key
go mod download
go run ./cmd/api           # default: http://localhost:5174
```

### 2. Client
```bash
cd client
cp .env.example .env       # set VITE_API_BASE_URL if not using the dev proxy
npm install
npm run dev                # http://localhost:5173
```

The Vite dev server proxies `/api` → `http://localhost:5174` so the
`VITE_API_BASE_URL` is optional in development. In production the client is
served as static files (e.g. on Netlify) and points directly at the Go API.

You can also start both apps from the repo root:

```bash
npm install
npm run install:client
npm run dev
```

---

## Environment variables

### Server (`server/.env`)
| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5174` | HTTP port |
| `MEALDB_API_BASE` | `https://www.themealdb.com/api/json/v1` | TheMealDB API base |
| `MEALDB_API_KEY` | `1` | Upstream key. **Replace with your real key in production**. Never sent to the client. |
| `DB_PATH` | `./recipes.db` | SQLite file path (used if `DATABASE_URL` is not set) |
| `DATABASE_URL` | — | Alternative DB path, e.g. `file:/data/recipes.db` for a mounted volume |
| `CORS_ORIGIN` | `http://localhost:5173` | Exact origin allowed by CORS |

### Client (`client/.env`)
| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | Where the client sends API requests. The client never calls TheMealDB directly. |

---

## PWA — what's included and how to test it

**Manifest** (`public/manifest.webmanifest`): name, short_name, theme color
(`#C75B39` Terracotta), background color (`#FAF6F0` Cream), `display: standalone`,
maskable icons.

**Handwritten service worker** (`public/sw.js`):

| Resource | Strategy | Cache |
| --- | --- | --- |
| App shell (`/`, `/index.html`, `/offline.html`, manifest, icons) | precache | `wk-v2-shell` |
| Navigations | network-first → saved-route cache → cached `/index.html` → `/offline.html` | `wk-v2-shell` + `recipe-app-saved-assets-v1` |
| Images (cards, recipe photos) | stale-while-revalidate, with saved-image fallback | `wk-v2-images` + `recipe-app-saved-assets-v1` |
| `/api/categories` | stale-while-revalidate | `wk-v2-api` |
| Other `/api/*` GET (search, meal, filter, recipes) | network-first w/ saved/API cache fallback | `wk-v2-api` + `recipe-app-saved-assets-v1` |
| Same-origin static assets | stale-while-revalidate | `wk-v2-runtime` |
| Cross-origin (Google Fonts) | network-first | `wk-v2-runtime` |
| Mutations (`POST/PUT/DELETE`) | pass through; on success, evict `/api/recipes*` reads | — |

To change a strategy or add a route, edit the dispatcher in `public/sw.js` and
**bump `CACHE_VERSION`** at the top — the activate handler will evict every
prior cache automatically.

**Offline collection (resilient layer)**: in addition to the SW's HTTP cache,
`src/lib/idb.ts` mirrors the saved collection into IndexedDB on every successful
read and write. The `useRecipes` hook falls back to IDB when the network throws.
This survives SW eviction and works on browsers where the SW HTTP cache is
short-lived.

**Saved recipe asset warmup**: whenever a recipe is saved, updated, loaded from
the saved-detail page, or synced through the full collection list,
`src/lib/offline-cache.ts` proactively caches the assets needed for the saved
card/detail/cooking flow:

- the high-quality recipe image
- `/collection`, `/collection/:id`, and `/cook/saved/:id`
- `/api/recipes` and `/api/recipes/:id`
- for saved TheMealDB recipes, the original `/recipe/:sourceId`,
  `/cook/source/:sourceId`, and `/api/meal/:sourceId`

The service worker preserves the stable `recipe-app-saved-assets-v1` cache across
normal `CACHE_VERSION` bumps, so saved recipes keep working offline through app
updates unless the user clears site data.

**Wake lock**: `src/lib/wakelock.ts` wraps `navigator.wakeLock.request("screen")`
with the recommended visibility-aware re-acquire pattern. The cooking page
displays a "Screen stays on" badge while a sentinel is held.

### Testing offline

1. `npm run build` then `npm run preview` (the SW is **disabled in dev** to
   avoid stale-cache headaches; preview serves the production bundle).
2. Open DevTools → **Application → Service Workers** and confirm the worker is
   active.
3. Save a couple of recipes while online.
4. Toggle DevTools → **Network → Offline**.
5. Reload — the app shell, the saved collection, and any recently viewed recipe
   pages keep working. Navigating to a recipe you've never opened shows
   `offline.html`.

### Installability

In Chrome/Edge: address bar shows the install icon. On iOS: Share → Add to Home
Screen. The maskable icons live in `client/public/icon-*.png`.

---

## Theme — "Warm Kitchen"

Tokens live in `client/src/index.css` as CSS variables, and Tailwind reads them
through `client/tailwind.config.js`. Both light and dark mode are supported via
the `.dark` class, persisted in `localStorage`, and respect the system
preference on first load.

| Token | Light | Dark |
| --- | --- | --- |
| Background (cream) | `#FAF6F0` | `#1F1B19` |
| Surface (oat) | `#F0E6D8` | warm-brown |
| Primary (terracotta) | `#C75B39` | lifted terracotta |
| Secondary (sage) | `#5C6B4C` | lifted sage |
| Tag pill (sage tint) | `#EDF0E6` | warm dark sage |
| Text (espresso) | `#2B2522` | warm cream |
| Muted text | `#6B6258` | derived |

Typography:
- **Headings**: [Fraunces](https://fonts.google.com/specimen/Fraunces) (modern serif, characterful)
- **Body / UI**: [Inter](https://fonts.google.com/specimen/Inter) (clean, neutral)

Both fonts are pulled from Google Fonts (free) in `index.html`.

---

## Re-initializing shadcn/ui (if needed)

shadcn components are **already vendored** under `client/src/components/ui/` so
you don't need to run the CLI to start. If you want to add more components or
re-init the registry, follow these steps inside `client/`:

```bash
# Optional — only if you want to add or regenerate components.
npx shadcn@latest init
# Use the existing components.json (already configured for Vite + Tailwind + cssVariables).
npx shadcn@latest add button card input badge dialog skeleton sonner
```

Anything you add will inherit the Warm Kitchen tokens automatically.

---

## Deploy (free tiers)

### Backend — Fly.io free allowance (recommended)

Fly's free tier supports tiny Go apps and offers persistent volumes. Outline:

```bash
cd server
fly launch --no-deploy            # generates fly.toml
# Edit fly.toml: set internal_port = 5174, mount /data, expose http only.
fly volumes create data --size 1 --region <region>
fly secrets set MEALDB_API_KEY=YOUR_KEY \
                CORS_ORIGIN=https://YOUR-CLIENT.netlify.app \
                DB_PATH=/data/recipes.db
fly deploy
```

The provided `Dockerfile`-less build works because Fly auto-detects the Go module.
Add a `Dockerfile` if you prefer reproducible builds.

Render's free web service tier is also fine for a portfolio demo, but keep in
mind its filesystem is ephemeral unless you attach persistent storage. This repo
includes a root `render.yaml` Blueprint for the Go API.

Render Blueprint path:

```text
render.yaml
```

If Render complains about `render.yaml`, you can skip Blueprint mode and create
the service manually:

```text
New → Web Service
Repository: this repo
Runtime / Language: Docker
Root Directory: server
Dockerfile Path: ./Dockerfile
Docker Context: .
Health Check Path: /api/health
```

Set these Render environment variables:

```text
PORT=8080
MEALDB_API_BASE=https://www.themealdb.com/api/json/v1
MEALDB_API_KEY=1
DB_PATH=/data/recipes.db
CORS_ORIGIN=https://your-vercel-project.vercel.app
```

After deploy, test:

```text
https://your-render-service.onrender.com/api/health
```

It should return:

```json
{"status":"ok"}
```

### Frontend — Vercel or Netlify free tier

This repository includes a **root `vercel.json`** that deploys the Vite client
from `client/`:

- install command: `npm --prefix client install`
- build command: `npm --prefix client run build`
- output directory: `client/dist`
- SPA rewrites to `index.html`
- service-worker and asset cache headers

Deploy from the repo root:

```bash
vercel
# or production
vercel --prod
```

Set this Vercel environment variable before deploying:

```text
VITE_API_BASE_URL=https://<your-go-backend-host>/api
```

Then make sure the Go server's `CORS_ORIGIN` env var matches your Vercel
frontend origin, for example:

```text
CORS_ORIGIN=https://your-project.vercel.app
```

Important: the current Go backend is **not** deployed by Vercel. It should stay
on Fly.io, Render, Railway, or another Go-friendly host unless you choose to
refactor the API into Vercel Functions.

Netlify also works:

```bash
cd client
npm run build
# Netlify: drop dist/ into a new site, or `netlify deploy --prod --dir=dist`
```

For Netlify, `client/public/_redirects` already provides SPA routing.

---

## Post-generation checklist

1. **Replace placeholder icons.** The icons under `client/public/icon-*.png`
   were generated by `server/cmd/icongen`. Replace with brand-quality icons or
   re-run the generator after editing `server/cmd/icongen/main.go`:
   ```bash
   cd server
   go run ./cmd/icongen ../client/public
   ```
2. **Set real env vars.** `server/.env` should hold a real `MEALDB_API_KEY` in
   production. Update `CORS_ORIGIN` to the deployed client URL.
3. **Generate any extra shadcn components** you want — see the section above.
4. **Lighthouse pass.** Target 90+ for Performance / Accessibility / Best
   Practices / PWA. Run `npm run build` and then `npm run preview` from the
   `client` folder, then audit.

---

## Local dev — copy-paste run instructions

One command from the repo root:

```bash
npm install
npm run install:client
npm run dev
# → API on http://localhost:5174 and client on http://localhost:5173
```

Or run the two processes manually:

```bash
# Terminal 1 — backend
cd server
cp .env.example .env
go run ./cmd/api
# → "Recipes API listening on :5174"

# Terminal 2 — frontend
cd client
cp .env.example .env
npm install
npm run dev
# → http://localhost:5173
```

To produce a deployable client bundle:
```bash
cd client && npm run build && npm run preview   # serves dist/ on http://localhost:4173
```

PowerShell-safe version:
```powershell
Set-Location "C:\VS Code\Active Projects\Recipe App\client"
npm run build
npm run preview
```

To produce a Go server binary:
```bash
cd server && go build -o ./bin/api ./cmd/api
./bin/api
```

PowerShell-safe version:
```powershell
Set-Location "C:\VS Code\Active Projects\Recipe App\server"
go build -o .\bin\api.exe .\cmd\api
.\bin\api.exe
```

---

## Acceptance checklist

- [x] **Backend is Go.** 100% Go aside from the SQLite engine itself (documented).
- [x] **App runs locally** with the Go server and React client together.
- [x] **Client never calls TheMealDB directly.** Single `VITE_API_BASE_URL`. API key never leaves the server.
- [x] **Browse, search, categories, recipe detail** all work via the Go proxy.
- [x] **Saving persists.** Server-owned SQLite. Survives server restart and browser-storage wipe.
- [x] **Full CRUD** on `/api/recipes`.
- [x] **Saved collection viewable offline.** App opens offline. `offline.html` for cold navigations.
- [x] **Cooking mode + screen wake lock** in `src/pages/Cooking.tsx`.
- [x] **PWA installable**, manifest + handwritten SW with precache.
- [x] **Skeletons, empty states, error boundary** implemented.
- [x] **Warm Kitchen theme** in light + dark with Fraunces / Inter.
- [x] **README** with setup, env vars, deploy notes, run instructions.

---

## Future roadmap (deliberately deferred)

Listed here to signal a deliberate scope decision, not as a TODO commitment:

- **Authentication / multi-user accounts** — turn the single shared collection
  into per-user collections with sign-in.
- **Grocery list & meal planning** — aggregate ingredients across selected
  recipes into a shoppable list, possibly with weekly meal plans.
- **"What can I make?" ingredient search** — pantry-aware search that ranks
  recipes by overlap with what you already have.
- **Image upload pipeline** — let users attach their own photos rather than
  only referencing TheMealDB image URLs.
- **Recipe scaling** — adjust quantities for different serving counts with
  unit-aware math.
- **Automated test suite** — a thin set of Go handler tests + a Playwright
  smoke test for the critical browse → save → cook flow.

---

## Credits

- Recipe content: [TheMealDB](https://www.themealdb.com/) (free public API).
- Component primitives: [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/).
- Icons: [Lucide](https://lucide.dev/).
- Fonts: [Fraunces](https://fonts.google.com/specimen/Fraunces), [Inter](https://fonts.google.com/specimen/Inter).
