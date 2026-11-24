/* Only the standalone reader is cached. Native login, /game and document responses
 * always go to the network. Bump this revision whenever reader assets change. */
const CACHE = "mikelandia-mobile-reader-v2";
const ASSETS = ["./", "./index.html", "./login.css", "./offline.css", "./main.mjs", "./login.mjs",
  "./foundry-client.mjs", "./library.mjs", "./pwa.mjs", "./manifest.webmanifest",
  "./icons/mc-180.png", "./icons/mc-192.png", "./icons/mc-512.png", "./icons/mc-maskable-512.png"]
  .map(path => new URL(path, self.registration.scope).href);
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("mikelandia-mobile-reader-") && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Reader query parameters do not need separate shell copies. API and authenticated
  // endpoints are deliberately absent from the allowlist.
  if (url.origin !== self.location.origin) return;
  const base = new URL("../", self.registration.scope);
  const relative = url.pathname.startsWith(base.pathname) ? url.pathname.slice(base.pathname.length) : "";
  const runtimeAsset = /^modules\/mikelandia-controls\/.*\.(?:mjs|css|webp|png|svg|woff2)$/u.test(relative)
    || /^(?:fonts|icons)\/.*\.(?:css|woff2|svg|png|webp)$/u.test(relative)
    || /^systems\/dnd5e\/icons\/svg\/[^/]+\.svg$/u.test(relative);
  if (runtimeAsset) {
    event.respondWith(caches.open("mikelandia-reader-assets").then(async pointers => {
      const pointer = await (await pointers.match(new URL("./runtime", self.registration.scope)))?.json();
      const cached = pointer?.cacheName ? await (await caches.open(pointer.cacheName)).match(event.request) : null;
      return cached ?? fetch(event.request);
    }));
    return;
  }
  url.search = ""; url.hash = "";
  if (!ASSETS.includes(url.href)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    if (event.request.mode !== "navigate") return await cache.match(url.href) ?? fetch(event.request);
    try { const response = await fetch(event.request); return response.ok ? response : await cache.match(url.href) ?? response; }
    catch { return await cache.match(url.href); }
  }));
});
