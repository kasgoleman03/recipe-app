# Recipes PWA — Build Prompt (Revised)

## ROLE

You are a senior full-stack engineer with deep expertise in idiomatic Go backend development and UX-minded modern frontend work. You build production-ready Progressive Web Apps (PWAs) using React + Vite, Tailwind, and shadcn/ui. You write clean, well-commented code, prioritize accessibility, and ship a rock-solid PWA setup (manifest, service worker, offline fallbacks). You make deliberate scope decisions and optimize for a shipped, polished, coherent product over a sprawling, unfinished one. You treat visible polish as first-class engineering work, not an afterthought.

## TASK

Build a complete, deployable, installable Recipes PWA. Users browse and search recipes sourced from TheMealDB, view full recipe details, and save recipes into their own persistent collection that lives on the server. They can also cook hands-free from any recipe via a dedicated cooking mode. Deliver a working application with a Go backend, a polished responsive React frontend, real server-side persistence, full PWA support, and a thorough README — ready to deploy to a live URL at zero cost.

## CONTEXT

This is a portfolio project. Its real audience is twofold: prospective freelance clients and the builder's own SaaS ambitions. The priority is a professional, polished, complete product that impresses in the first ten seconds of clicking a live link — not internal engineering signals like exhaustive test suites. Visible quality wins over invisible quality.

The end-user persona is a home cook who discovers recipes from a large public catalog and curates a personal collection, with special attention to the real moment of cooking: phone on the counter, possibly greasy hands, glancing from across the kitchen.

### Architecture (hybrid — read carefully)

This app has two clearly separated data planes:

1. Browse/Discovery plane — recipe content comes from TheMealDB (v1). The Go backend proxies all TheMealDB requests so the client never calls TheMealDB directly and the API key is never exposed.
2. Collection/Persistence plane — when a user saves a recipe, it is persisted in a real database that the Go backend owns. Saved recipes survive server restarts and browser-storage wipes, and are served from the Go backend, not from browser storage. This is the source of truth for the user's collection.

The single curated collection is shared (no authentication / no user accounts — see exclusions). Treat saved recipes as one personal collection owned by the app instance.

### Data source — TheMealDB (v1)

The client must NEVER call TheMealDB directly; all access is via the Go proxy. Proxy fetch format:
`${MEALDB_API_BASE}/${MEALDB_API_KEY}/<endpoint>`

TheMealDB endpoints to wrap:
- `search.php?s={query}` → search by name
- `lookup.php?i={id}` → meal by ID
- `categories.php` → list categories
- `filter.php?c={category}` → meals by category
- (optional) `random.php` → random meal

The builder will supply the API key. Default to `1` for local development. Read it from an environment variable; never hardcode it.

### Design direction — "Warm Kitchen" (modern + sleek, with homely warmth)

Do NOT ship the default shadcn/ui neutral look. Retheme shadcn/ui and Tailwind to the palette below via CSS variables / Tailwind theme tokens. The components come from shadcn/ui; the visual identity is Warm Kitchen.

Color palette (light mode):
- Cream `#FAF6F0` — page background
- Oat `#F0E6D8` — raised surfaces / secondary background
- White `#FFFFFF` — cards that need to lift off the cream
- Terracotta `#C75B39` — primary accent (buttons, key actions, highlights)
- Sage `#5C6B4C` — secondary accent (tags, supporting elements)
- Sage tint `#EDF0E6` — tag/badge pill backgrounds
- Espresso `#2B2522` — primary text (a deep warm brown, never pure black)
- Muted text tones (e.g. `#6B6258` secondary, `#8A7E72` tertiary) — derive a coherent set

A full dark-mode variant is required: respect system preference, persist the user's choice, and ensure sufficient contrast in both modes. Provide a ThemeToggle in the header.

Typography (via Google Fonts, free):
- Headings: Fraunces (characterful modern serif — carries the warmth/personality)
- Body / UI: Inter (clean, modern, neutral — keeps it sleek and legible)

Encode all of the above as a tight, intentional design system: a small set of design tokens for color, spacing, and type, applied consistently.

## CONSTRAINTS

### Backend — hard requirement
- The backend MUST be written in Go. This is the single most important constraint. Aim for 100% Go.
- If any piece genuinely cannot be Go, get as close to 100% Go as possible while remaining fully functional, and explicitly document each non-Go piece and why in the README. (The database engine itself is an acceptable, expected exception — note it.)
- Prefer the Go standard library. Use `net/http` (Go 1.22+ routing enhancements are encouraged so a third-party router may be unnecessary). Add minimal, well-justified dependencies only — e.g. a database driver such as `modernc.org/sqlite` (pure Go, no CGO — preferred for zero-friction free deploys) or `mattn/go-sqlite3`, or `pgx` if Postgres is chosen.
- Expose a clean REST API under `/api/*`. Implement CORS, security headers, gzip/compression, request logging, and robust error handling (consistent JSON error shapes, sensible status codes).
- Never expose the TheMealDB API key to the client.
- Add caching headers and an in-memory TTL cache for slow-changing proxied data (categories especially).

### Backend API surface
Proxy (Browse/Discovery plane — forwards to TheMealDB):
- `GET /api/search?s=...` → `search.php?s=...`
- `GET /api/meal/:id` → `lookup.php?i=...`
- `GET /api/categories` → `categories.php` (TTL-cached in memory)
- `GET /api/filter?c=...` → `filter.php?c=...`
- (optional) `GET /api/random` → `random.php`

Collection (Persistence plane — Go owns the database; full CRUD):
- `GET /api/recipes` → list saved recipes (support query params for search/filter by name, tag, total time)
- `GET /api/recipes/:id` → fetch one saved recipe
- `POST /api/recipes` → save a recipe to the collection (accepts a normalized recipe payload; when saving from a TheMealDB meal, the client sends the normalized recipe so the server stores its own copy and no longer depends on TheMealDB for that recipe)
- `PUT /api/recipes/:id` → edit a saved recipe
- `DELETE /api/recipes/:id` → remove a saved recipe

### Data model (server-owned, persisted)
A saved recipe is a structured object, not a blob:
- `id` (server-generated)
- `title`
- `source` (e.g. `themealdb` or `manual`) and optional `sourceId` (original TheMealDB meal id) for de-duplication
- `category`, `area` (cuisine), `tags` (array)
- `imageUrl` (string; reference TheMealDB's image URL — no upload pipeline)
- `prepTimeMinutes`, `cookTimeMinutes`, `servings` (metadata; if not provided by TheMealDB, allow null/editable)
- `ingredients` — ordered array of `{ name, quantity, unit }` (normalize TheMealDB's flat `strIngredientN`/`strMeasureN` fields into this structure on save)
- `steps` — ordered array of strings (split TheMealDB instructions into steps where reasonable)
- `youtubeUrl` (optional), `sourceUrl` (optional)
- timestamps

### Cost — hard requirement
- The entire project must be runnable and deployable at zero cost (free tiers only). Flag any choice that risks cost and default to the free option.
- Suggested free deploy: Go backend on a free host (e.g. Fly.io free allowance or Render free tier); React client on Netlify or Vercel free tier. SQLite (pure-Go driver) keeps the database free and dependency-light; if a free host's filesystem is ephemeral, note the implication and the free persistent-volume option.

### Frontend — stack (locked)
- React + Vite + Tailwind + shadcn/ui.
- TypeScript across the client (use JS + JSDoc only if TS is genuinely blocked).
- TanStack Query (React Query) for data fetching, caching, and retries. Keep logic modular.
- shadcn/ui components to use include: Button, Card, Input, Badge, Dialog, Skeleton, Toast/Sonner, and a ThemeToggle. Retheme them to Warm Kitchen.

### Frontend — pages & UX
- Header: app name, search input, theme toggle.
- Home / Browse: search bar, category chips (from `/api/categories`), results grid of cards (image, title, category, area, and a Save / Saved toggle). Results come from the TheMealDB proxy.
- Details: full recipe view (ingredients, instructions, tags, YouTube link if present), Save/Unsave toggle, and a clear "Start cooking" entry point.
- My Collection: grid of the user's server-saved recipes (from `/api/recipes`), with search/filter/sort and remove/edit actions. This is the persistent, server-backed collection.
- Cooking mode (signature feature — build to a high standard): a distraction-free, large-type, step-by-step view designed for the kitchen. MUST use the Screen Wake Lock API so the screen does not sleep while cooking. Step-by-step navigation; per-step timers are a welcome touch if time allows. Reachable from both Details and My Collection.

### Frontend — quality & accessibility
- Mobile-first, responsive layout. Mobile is the priority surface.
- Fully keyboard-navigable; semantic landmarks; skip links; alt text on all images; proper labels, `aria-pressed` on toggles, visible focus outlines.
- Skeleton loaders for cards and detail views; thoughtful empty states; error boundaries.
- A few restrained, purposeful micro-interactions (smooth transitions on key actions, optimistic UI on save/unsave). Restraint is the signal — not motion everywhere.
- A friendly offline toast when the network drops.

### PWA — requirements
- Genuine, installable PWA: `manifest.webmanifest` with name/short_name, icons (placeholder icons acceptable), theme color, `display: standalone`.
- Service worker, handwritten (no Workbox):
  - Precache the app shell + static assets, with versioning.
  - Runtime caching strategies: Stale-While-Revalidate for images and category lists; Network-First with cache fallback for searches and recipe details.
  - Provide an `offline.html` fallback for navigations when no cached content exists.
- Offline behavior:
  - The app opens offline.
  - The user's saved collection is available offline. Since the collection's source of truth is the server, cache `/api/recipes` responses (and saved-recipe details) so they are viewable offline; also mirror the saved collection into IndexedDB (via the `idb` helper) so it is reliably readable offline and resilient to cache eviction.
  - When offline, show cached data if available; otherwise show the offline fallback.
  - On reconnect, revalidate against the server (server remains source of truth; last-write-wins is acceptable for this single-collection app).

### Scope — explicit exclusions (do NOT build these)
- No authentication / user accounts (treat as one shared personal collection).
- No grocery-list / meal-plan aggregation.
- No ingredient-based "what can I make" search.
- No image upload pipeline (reference image URLs only).
- No recipe scaling.
- No required automated test suite (do not spend the budget here).
List the genuinely valuable exclusions under a "Future roadmap" section in the README to signal deliberate scope decisions.

### Quality bar
- Aim for a high Lighthouse score (performance, accessibility, best practices, PWA) and capture it in the README.
- Build the core fast and unglamorously first (proxy + CRUD + browse/save/detail working), then make the whole thing beautiful and add cooking mode in a focused pass. Get it working, then make it gorgeous — do not perfect the UI incrementally as you go.

## FORMAT

Return one complete, runnable response containing, in order:

1. Brief plan: confirm the Go hybrid architecture (TheMealDB proxy + server-owned DB), state the database choice and why (free tier), the hosting choice for both tiers (free), and explicitly state whether 100% Go is achieved on the backend; if not, list every non-Go piece and why.
2. Project tree in a single code block.
3. The complete server-owned data model / schema.
4. Full code for every file, each in its own fenced code block titled with its correct file path (e.g. `// server/cmd/api/main.go`, `// client/src/pages/Cooking.tsx`). Comment non-trivial logic: TheMealDB → normalized-recipe mapping, the in-memory TTL cache, service-worker caching strategies, IndexedDB sync, and wake-lock handling.
5. PWA assets: `manifest.webmanifest`, placeholder icons, `offline.html`, and the handwritten service worker.
6. `README.md` at repo root including: overview, features, tech stack; setup instructions; environment variables; shadcn/ui init steps for Vite + Tailwind and the Warm Kitchen theming; PWA details and how to test offline; notes on each caching strategy and how to change it; deploy suggestions (free tiers); a post-generation checklist (generate shadcn components, replace placeholder icons, set env vars); and a "Future roadmap" listing the deferred features above.
7. Copy-pasteable run instructions for local dev (server and client) and for deploying to the chosen free hosts, including exactly which environment variables the builder must supply.

### Environment variables
Server:
- `MEALDB_API_BASE=https://www.themealdb.com/api/json/v1`
- `MEALDB_API_KEY=1` (default for local dev; builder supplies real key)
- `PORT` (e.g. `5174`)
- `DATABASE_URL` or `DB_PATH` (e.g. SQLite file path)
- `CORS_ORIGIN` (the client's origin)

Client:
- `VITE_API_BASE_URL` (the Go backend's `/api` base; client calls ONLY this)

## ACCEPTANCE CRITERIA
- Backend is Go (100%, or as close as possible with every exception documented).
- App runs locally with the Go server and React client together.
- Client calls ONLY `VITE_API_BASE_URL` / `/api/*` — never TheMealDB directly; the API key is never exposed.
- Browse, search, categories, and recipe detail all work via the Go proxy.
- Saving a recipe persists it in the server-owned database; saved recipes survive a server restart and a browser-storage wipe.
- My Collection reads from the server; full CRUD (create/save, read, update, delete) works.
- The saved collection is viewable offline; the app opens offline; offline fallback works when there is no cached content.
- Cooking mode works and holds a screen wake lock.
- PWA is installable and precaches the app shell.
- Skeletons, empty states, and error boundaries are implemented.
- Warm Kitchen theme is applied (light + dark), with Fraunces headings and Inter body.
- README and run/deploy instructions are complete and accurate.
