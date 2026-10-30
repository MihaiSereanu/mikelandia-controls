import { createGame, createHooks } from "/tests/helpers/foundry.mjs";

const checks = [], check = (name, value) => { if (!value) throw Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
try {
  const device = new URLSearchParams(location.search).get("device") ?? "desktop";
  const mobile = device === "phone" || device === "tablet";
  for (const [key, value] of Object.entries({ userAgent: mobile ? device === "phone" ? "iPhone Mobile" : "iPad" : "Windows NT 10.0", platform: mobile ? "iPhone" : "Win32", maxTouchPoints: mobile ? 5 : 0 })) Object.defineProperty(navigator, key, { configurable: true, value });
  const game = createGame([], "shadowdark"), hooks = createHooks(), registered = new Map();
  hooks.once = (name, callback) => { const fn = (...args) => { hooks.off(name, fn); return callback(...args); }; hooks.on(name, fn); };
  const stored = new Map([["mikelandia-controls.mode", mobile ? "auto" : "phone"]]);
  game.i18n = { localize: key => key, translations: {}, lang: "en" };
  game.settings = { settings: registered, get(ns, key) { const id = `${ns}.${key}`; return stored.has(id) ? stored.get(id) : registered.get(id)?.default; }, register(ns, key, definition) { registered.set(`${ns}.${key}`, definition); }, async set(ns, key, value) { stored.set(`${ns}.${key}`, value); return value; } };
  game.modules.set("mikelandia-controls", { version: "fixture" });
  globalThis.game = game; globalThis.Hooks = hooks;
  globalThis.ui = { notifications: { warn() {}, error() {} } };
  globalThis.CONFIG = { queries: {} };
  let initializeHooks = 0;
  class Game { async initialize() { initializeHooks = hooks.count("init"); } }
  globalThis.foundry = { Game };
  const nativeInitialize = Game.prototype.initialize;
  localStorage.clear();
  localStorage.setItem("mikelandia-controls:bootstrap-preferences:v1", JSON.stringify({ mode: mobile ? "auto" : "phone", theme: "dark", keepScreenAwake: false }));
  // The fixture uses the actual /game entry guard, preserving the harness query.
  history.replaceState(null, "", `/game${location.search}`);
  await import("/src/entry.mjs");
  check("native desktop initialization is untouched", mobile || Game.prototype.initialize === nativeInitialize);
  if (mobile) {
    const initialization = new Game().initialize();
    await initialization;
    check("native initialization waits until mobile hooks are installed", initializeHooks === 2);
    check("mobile loading boundary removes itself", Game.prototype.initialize === nativeInitialize);
  }
  await tick();
  const resources = performance.getEntriesByType("resource").map(entry => new URL(entry.name).pathname);
  check("shared entry loads", resources.includes("/src/entry.mjs"));
  check("mobile runtime requested only on phone/tablet", resources.includes("/src/mobile-entry.mjs") === mobile);
  check("mobile stylesheet requested only on phone/tablet", resources.includes("/assets/mobile.css") === mobile);
  check("mobile bootstrap created only on phone/tablet", Boolean(document.querySelector(".mc-mobile-bootstrap")) === mobile);
  if (mobile) {
    check("mobile init and setup hooks registered before Foundry startup", hooks.count("init") === 2 && hooks.count("setup") >= 2);
    const style = document.querySelector('link[href$="/assets/mobile.css"]');
    if (!style.sheet) await new Promise((resolve, reject) => { style.addEventListener("load", resolve, { once: true }); style.addEventListener("error", reject, { once: true }); });
    check("mobile styles finish loading", Boolean(style.sheet));
  } else {
    hooks.emit("init"); hooks.emit("setup"); hooks.emit("ready"); await tick();
    check("desktop exposes no module settings", ![...registered.values()].some(setting => setting.config));
    check("desktop has no companion API", game.modules.get("mikelandia-controls").api === undefined);
    check("desktop never imports mobile kernel", !resources.includes("/src/kernel/app-kernel.mjs"));
  }
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) { document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack }); }
