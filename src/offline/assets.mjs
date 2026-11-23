import { resolveHeaderBanner } from "../features/characters/appearance/header-banner.mjs";

export const READER_RUNTIME_CACHE = "mikelandia-reader-runtime-v1-";
let preparation;

/** Cache the installed app's existing files at their original URLs. No parallel UI bundle. */
export async function prepareOfflineReader({ base, actors = [], preferences = {} }) {
  preparation ??= cacheExistingApp(base).catch(error => { preparation = undefined; throw error; });
  const load = await preparation;
  for (const actor of actors) for (const banner of resolveHeaderBanner(actor, preferences.character?.headerArtwork).candidates) await load(banner.url, false);
}

async function cacheExistingApp(base) {
  if (!navigator.serviceWorker || !globalThis.caches) throw new Error("Offline installation is unavailable.");
  const workerUrl = new URL("mobile/sw.js", base);
  const workerResponse = await fetch(workerUrl, { cache: "no-store", credentials: "same-origin" });
  if (!workerResponse.ok) throw new Error(`Offline page needs updating: ${workerUrl.pathname} returned HTTP ${workerResponse.status}.`);
  const root = new URL("../../", import.meta.url);
  const cacheName = READER_RUNTIME_CACHE + crypto.randomUUID();
  const cache = await caches.open(cacheName);
  const pointers = await caches.open("mikelandia-reader-assets");
  const pointerUrl = new URL("mobile/runtime", base);
  const previous = await (await pointers.match(pointerUrl))?.json();
  const seen = new Set();
  const load = async (value, required = true) => {
    const url = new URL(value, root);
    if (seen.has(url.href)) return;
    seen.add(url.href);
    try {
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(`Cannot cache ${url.pathname}.`);
      const text = /\.(mjs|css)$/u.test(url.pathname) ? await response.clone().text() : "";
      await cache.put(url, response);
      if (url.pathname.endsWith(".mjs")) {
        for (const match of text.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/gu)) {
          const dependency = new URL(match[1], url);
          if (!dependency.href.startsWith(root.href)) throw new Error("Offline import leaves the installed module.");
          await load(dependency);
        }
      }
      if (url.pathname.endsWith(".css")) {
        for (const match of text.matchAll(/url\(["']?([^\s"')]+)["']?\)/gu)) {
          if (/^(?:data:|#)/u.test(match[1])) continue;
          const dependency = new URL(match[1], url);
          if (dependency.origin === root.origin) await load(dependency, dependency.pathname.endsWith(".css"));
        }
      }
    } catch (error) { if (required) throw error; }
  };
  try {
    await load("src/offline/reader.mjs");
    await load("assets/mobile.css");
    await load(new URL("../../fonts/fontawesome/css/all.min.css", root), false);
    const registration = await navigator.serviceWorker.register(new URL("mobile/sw.js", base), { scope: new URL("mobile/", base).href, updateViaCache: "none" });
    if (!registration.active) {
      const worker = registration.installing ?? registration.waiting;
      if (!worker) throw new Error("Offline reader installation did not start.");
      await new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timeout); worker.removeEventListener("statechange", changed); };
        const changed = () => {
          if (worker.state === "activated") { cleanup(); resolve(); }
          if (worker.state === "redundant") { cleanup(); reject(new Error("Offline reader installation failed.")); }
        };
        const timeout = setTimeout(() => { cleanup(); reject(new Error("Offline reader installation timed out.")); }, 20000);
        worker.addEventListener("statechange", changed); changed();
      });
    }
    // Publish the complete graph in one write. A failed installation leaves the
    // preceding app cache usable instead of mixing files from different revisions.
    await pointers.put(pointerUrl, new Response(JSON.stringify({ cacheName }), { headers: { "Content-Type": "application/json" } }));
    if (previous?.cacheName && previous.cacheName !== cacheName) {
      try {
        const active = await Promise.all((await pointers.keys()).map(async key => (await (await pointers.match(key)).json()).cacheName));
        if (!active.includes(previous.cacheName)) await caches.delete(previous.cacheName);
      } catch { /* Cleanup must never invalidate an already published app cache. */ }
    }
    return load;
  } catch (error) { await caches.delete(cacheName); throw error; }
}
