/*
 * MedPass service worker: makes /scan and /print work with no internet
 * after one visit while online. Plain JavaScript, served as-is from /sw.js.
 *
 * What is cached: the two offline pages, the JavaScript/CSS files they need,
 * the MoPH drug list, the manifest and the icons. That's all. Portal pages,
 * API calls and patient data are NEVER cached: the card's data lives only
 * in the QR, and is decrypted in memory on the device.
 */

// Bump this when the caching rules change: the old cache is deleted on activate.
const VERSION = "medpass-v1";

// The offline pages.
const PAGES = ["/scan", "/print"];

// Everything else to have ready before going offline.
const ASSETS = [
  "/drugs.json",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/apple-icon.png",
];

const NETWORK_TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// install: download the pages, the files they reference, and the assets.
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);

      // 1. The pages. Fetch each once: store it, and read it to find its files.
      const staticUrls = new Set();
      await Promise.allSettled(
        PAGES.map(async (page) => {
          const res = await fetch(page, { cache: "no-store" });
          if (!res.ok) return;
          await cache.put(page, res.clone());
          // Next puts its JS/CSS file names in the HTML, sometimes escaped
          // inside inline scripts ("\/_next\/static\/..."): unescape, then collect.
          const html = (await res.text()).replace(/\\\//g, "/").replace(/\\u0026/g, "&");
          for (const match of html.matchAll(/\/_next\/static\/[^"'\s<>()\\]+/g)) {
            staticUrls.add(match[0]);
          }
        }),
      );

      // 2. The JS/CSS files and the assets. allSettled: one missing file must not
      //    break the whole install (the rest still works offline).
      await Promise.allSettled([...staticUrls, ...ASSETS].map((url) => cache.add(url)));

      // 3. Take over right away instead of waiting for all tabs to close.
      await self.skipWaiting();
    })(),
  );
});

// ---------------------------------------------------------------------------
// activate: delete caches from older versions, then control open pages now.
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== VERSION).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

// ---------------------------------------------------------------------------
// fetch: decide, request by request, whether the cache may help.
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // only reads
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // only our own site

  // b) Next's build files never change under the same name: cache first.
  //    (Checked before the query-string rule: hosting may add "?dpl=..." to them.)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // d) Anything with a query string (e.g. Next's "?_rsc=" data requests) is left alone.
  if (url.search) return;

  // a) Opening /scan or /print: network first (fresh version), cache if offline.
  if (request.mode === "navigate" && PAGES.includes(url.pathname)) {
    event.respondWith(networkFirst(request, url.pathname));
    return;
  }

  // c) The drug list: answer from the cache at once, refresh it in the background.
  if (url.pathname === "/drugs.json") {
    event.respondWith(staleWhileRevalidate(event, request));
    return;
  }

  // d) Everything else (/portal, /api, ...): not handled, so the browser does a
  //    normal network request and nothing is ever stored.
});

// Network first, with a timeout so a very slow connection falls back quickly.
async function networkFirst(request, key) {
  const cache = await caches.open(VERSION);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const res = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok && !res.redirected) await cache.put(key, res.clone());
    return res;
  } catch {
    clearTimeout(timer);
    const cached = await cache.match(key);
    if (cached) return cached;
    return new Response("Offline, and this page was not saved yet. Open it once while online.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

// Cache first: use the saved copy; if missing, download, save, return.
async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

// Stale-while-revalidate: instant answer from the cache, quiet refresh behind it.
async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(async (res) => {
      if (res.ok) await cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(refresh); // keep the worker alive until the refresh is stored
    return cached;
  }
  const res = await refresh;
  return res || new Response("[]", { status: 503, headers: { "Content-Type": "application/json" } });
}
