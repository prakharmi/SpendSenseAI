/**
 * SpendSenseAI Service Worker
 *
 * Caching strategy:
 *   App Shell (CSS, JS, fonts, icons) → Cache First, fallback to network
 *   HTML pages (/dashboard, /analytics, /) → Network First, fallback to cache
 *   API calls (/api/*, /auth/*) → Network Only (never cache — always fresh auth data)
 *
 * Why this split:
 *   - App shell rarely changes → cache aggressively → instant paint
 *   - HTML is auth-guarded → always check network (stale HTML could let wrong user in)
 *   - API data must be fresh → no SW caching (backend TTL + localStorage SWR handle it)
 */

const CACHE_NAME = "spendsense-shell-v9";

// Static assets that form the "App Shell" — everything needed to render the UI
// These are cached on install and served instantly on repeat visits
const APP_SHELL = [
  "/index.html",
  "/dashboard/dashboard.html",
  "/analytics/analytics.html",
  "/output.css",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/script.js",
  "/dashboard/js/dashboard.js",
  "/dashboard/js/api.js",
  "/dashboard/js/ui.js",
  "/dashboard/js/db.js",
  "/analytics/js/index.js",
  "/analytics/js/api.js",
  "/analytics/js/ui.js",
];

// ---------------------------------------------------------------------------
// INSTALL: Pre-cache the app shell
// skipWaiting() ensures the new SW activates immediately without waiting
// for all tabs to close — critical for single-tab PWAs
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll() is atomic — if any resource fails, the whole install fails
      // We use individual add() calls so a CDN failure (Chart.js) doesn't break install
      return Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Failed to pre-cache: ${url}`, err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ---------------------------------------------------------------------------
// ACTIVATE: Clean up old caches from previous SW versions
// clients.claim() lets the new SW control existing open tabs immediately
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ---------------------------------------------------------------------------
// FETCH: Route requests to the right strategy
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests — let CDN requests (Chart.js, Google Fonts) go through
  if (url.origin !== self.location.origin) {
    return; // Browser handles externals normally
  }

  // API & Auth routes → Network Only
  // These MUST always hit the server — stale API responses would show wrong data
  // and stale auth responses could create security issues
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return; // Don't intercept — fall through to browser's default fetch
  }

  // HTML pages → Network First with Cache Fallback
  // Try network (gets fresh auth-guarded HTML), fall back to cache if offline
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache the fresh response for offline use
          if (response.ok && !response.redirected) {
            const clone = response.clone();
            let cacheKey = url.pathname;
            if (cacheKey === "/" || cacheKey === "") cacheKey = "/index.html";
            else if (cacheKey === "/dashboard") cacheKey = "/dashboard/dashboard.html";
            else if (cacheKey === "/analytics") cacheKey = "/analytics/analytics.html";
            // Cache by mapped pathname to ignore query strings like ?source=pwa
            caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline — serve from cache
          let cacheKey = url.pathname;
          if (cacheKey === "/" || cacheKey === "") cacheKey = "/index.html";
          else if (cacheKey === "/dashboard") cacheKey = "/dashboard/dashboard.html";
          else if (cacheKey === "/analytics") cacheKey = "/analytics/analytics.html";

          // Use ignoreSearch to ignore query strings
          return caches.match(cacheKey, { ignoreSearch: true }).then((cached) => {
            if (cached) return cached;
            // If even the exact cache doesn't have it, serve the root
            return caches.match("/index.html", { ignoreSearch: true });
          });
        })
    );
    return;
  }

  // Static assets (CSS, JS, images, fonts) → Cache First with Network Fallback
  // These have 1h Cache-Control headers on the server too — double layer
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      // Cache miss → fetch from network and store for next time
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
