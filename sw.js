/* =====================================================
   BLUEANT SERVICE WORKER — v11.00
   - Network-first with timeout for HTML/CSS/JS
     (falls back to cache if network is slow/down)
   - Cache-first for images and other static assets
   - Bypasses Supabase, Apps Script, and all cross-origin requests
   - Safe update flow: waits for page to ask before taking over
   ===================================================== */

const CACHE_VERSION = "v11.00";
const CACHE_NAME = `blueant-cache-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "./index.html", "./today.html", "./details.html", "./dashboard.html",
  "./login.css", "./today.css", "./details.css", "./dashboard.css",
  "./login.js", "./today.js", "./details.js", "./dashboard.js",
  "./bg.png", "./web-logo.png", "./whatsapp-icon.png",
  "./manifest.json", "./icon-192.png", "./icon-512.png"
];

/* ========= INSTALL — pre-cache static assets ========= */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch {
          console.warn("Failed to cache:", asset);
        }
      }
    })
    // NOTE: no skipWaiting() here — let new SW wait until page tells it to
  );
});

/* ========= ACTIVATE — clean up old caches ========= */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ========= MESSAGE — page can ask new SW to take over ========= */
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* ========= HELPER — race fetch against timeout ========= */
function networkFirstWithTimeout(req, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;

    const timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      const cached = await caches.match(req);
      if (cached) {
        resolve(cached);
      } else {
        // No cache — wait for the slow network anyway
        try { resolve(await fetch(req)); }
        catch { resolve(new Response("Offline", { status: 503 })); }
      }
    }, timeoutMs);

    fetch(req).then(res => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      // Cache successful same-origin GETs for next time
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
      }
      resolve(res);
    }).catch(async () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const cached = await caches.match(req);
      resolve(cached || new Response("Offline", { status: 503 }));
    });
  });
}

/* ========= FETCH — main routing ========= */
self.addEventListener("fetch", event => {
  const req = event.request;

  // Only handle GET — never intercept POST/PUT/DELETE
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Bypass: cross-origin, Supabase, Apps Script
  if (
    url.origin !== self.location.origin ||
    url.pathname.endsWith("/exec") ||
    url.hostname.includes("supabase")
  ) {
    return; // Let the browser handle it normally
  }

  // HTML pages → network-first, 2.5s timeout
  if (req.destination === "document") {
    event.respondWith(networkFirstWithTimeout(req, 2500));
    return;
  }

  // CSS / JS → network-first, 2s timeout
  if (req.destination === "script" || req.destination === "style") {
    event.respondWith(networkFirstWithTimeout(req, 2000));
    return;
  }

  // Images / fonts / everything else → cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => new Response("", { status: 503 }));
    })
  );
});