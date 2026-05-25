/* Warm Kitchen — handwritten service worker.
 *
 * Strategies (chosen per the spec):
 *
 *   • App shell (HTML/JS/CSS/icons): precache on install, served from
 *     cache. Bumping CACHE_VERSION evicts the old shell on activation.
 *
 *   • Navigation requests (HTML): network-first with a fall-through to
 *     the precached index.html, then to /offline.html. This keeps the
 *     SPA navigable when offline while still picking up updates fast
 *     when online.
 *
 *   • Same-origin images, fonts, and the categories endpoint:
 *     stale-while-revalidate. Snappy on every visit, refreshed in the
 *     background.
 *
 *   • Other GET /api/* (search, meal/:id, filter, recipes list/detail):
 *     network-first with cache fallback. Mutations (POST/PUT/DELETE)
 *     pass through untouched and invalidate matching collection caches
 *     on success so the next read is fresh.
 *
 * IndexedDB caching of the saved collection lives in client code
 * (src/lib/idb.ts) — the SW only handles the HTTP layer.
 */

// IMPORTANT: bump this when changing precache contents or cache strategies.
const CACHE_VERSION = "wk-v2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const API_CACHE = `${CACHE_VERSION}-api`;
const SAVED_ASSET_CACHE = "recipe-app-saved-assets-v1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // Activate immediately so the new worker takes over on the next page load.
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll fails atomically if any fetch errors. Splitting keeps a
      // partially-failing precache from blocking SW install entirely.
      await Promise.all(
        APP_SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined),
        ),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION) && k !== SAVED_ASSET_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// ---- Strategies ----------------------------------------------------------

function isHttpRequest(request) {
  const protocol = new URL(request.url).protocol;
  return protocol === "http:" || protocol === "https:";
}

async function networkFirst(request, cacheName) {
  if (!isHttpRequest(request)) {
    return fetch(request);
  }
  const cache = await caches.open(cacheName);
  const savedCache = await caches.open(SAVED_ASSET_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && (fresh.ok || fresh.type === "opaque")) {
      cache.put(request, fresh.clone()).catch(() => undefined);
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const saved = await savedCache.match(request);
    if (saved) return saved;
    return new Response("offline", { status: 504 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  if (!isHttpRequest(request)) {
    return fetch(request);
  }
  const cache = await caches.open(cacheName);
  const savedCache = await caches.open(SAVED_ASSET_CACHE);
  const cached = (await cache.match(request)) || (await savedCache.match(request));
  const networkPromise = fetch(request)
    .then((resp) => {
      if (resp && (resp.ok || resp.type === "opaque")) {
        cache.put(request, resp.clone()).catch(() => undefined);
      }
      return resp;
    })
    .catch(() => null);
  if (cached) return cached;

  const networkResponse = await networkPromise;
  return networkResponse || new Response("offline", { status: 504 });
}

async function navigationStrategy(request) {
  // Try the network first so an updated SPA shell ships fast on each visit.
  const cache = await caches.open(SHELL_CACHE);
  const savedCache = await caches.open(SAVED_ASSET_CACHE);
  try {
    const fresh = await fetch(request);
    // Mirror the response into the shell cache so subsequent offline
    // visits always have something to render.
    cache.put("/index.html", fresh.clone()).catch(() => undefined);
    return fresh;
  } catch (err) {
    const cached =
      (await savedCache.match(request)) ||
      (await cache.match(request)) ||
      (await savedCache.match("/collection")) ||
      (await cache.match("/index.html"));
    if (cached) return cached;
    return (
      (await cache.match("/offline.html")) ||
      new Response(
        "<!doctype html><title>Offline</title><h1>You're offline</h1><p>Warm Kitchen is unavailable right now.</p>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
      )
    );
  }
}

// ---- Fetch dispatcher ----------------------------------------------------

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isHttpRequest(request)) {
    // Browser extensions and other non-http(s) schemes cannot be stored
    // in Cache Storage. Let the browser handle them outside this SW.
    return;
  }

  if (request.method !== "GET") {
    // Mutations: pass through, then invalidate dependent caches on success.
    event.respondWith(handleMutation(request));
    return;
  }

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigations -> network-first with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(navigationStrategy(request));
    return;
  }

  // Images (same-origin and TheMealDB images proxied/embedded).
  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  // Categories endpoint specifically — slow-changing, used on every load.
  if (sameOrigin && url.pathname === "/api/categories") {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // All other /api/* GETs (search, meal, filter, recipes list/detail):
  // network-first so users see fresh data, fall back to cache offline.
  if (sameOrigin && url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Fonts and static same-origin assets: stale-while-revalidate.
  if (sameOrigin) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  // Cross-origin (Google Fonts, image CDN…): network-first into the runtime cache.
  event.respondWith(networkFirst(request, RUNTIME_CACHE));
});

async function handleMutation(request) {
  let resp;
  try {
    resp = await fetch(request);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "offline", message: "You're offline. Try again when reconnected." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  // After a successful write to /api/recipes/* drop the cached collection
  // reads so the next GET reflects the change immediately.
  if (resp.ok) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/recipes")) {
      const cache = await caches.open(API_CACHE);
      const keys = await cache.keys();
      await Promise.all(
        keys
          .filter((req) => new URL(req.url).pathname.startsWith("/api/recipes"))
          .map((req) => cache.delete(req)),
      );
    }
  }
  return resp;
}

// Allow the page to ask the SW to activate immediately after an update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
