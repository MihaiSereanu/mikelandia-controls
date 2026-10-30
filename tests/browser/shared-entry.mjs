import { createGame, createHooks } from "/tests/helpers/foundry.mjs";

const checks = [], check = (name, value) => { if (!value) throw Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
try {
  const params = new URLSearchParams(location.search);
  const device = params.get("device") ?? "desktop";
  const mobile = device === "phone" || device === "tablet";
  const full = params.has("full"), storedMode = params.get("stored") ?? (mobile ? "auto" : "phone");
  const active = mobile && storedMode !== "native";
  if (params.has("common-display")) {
    document.body.classList.add("hide-ui");
    const style = document.createElement("link");
    style.rel = "stylesheet"; style.href = "/tests/browser/fixtures/monks-common-display-14.01-root-hide.css";
    document.head.append(style);
    await new Promise((resolve, reject) => { style.onload = resolve; style.onerror = reject; });
  }
  for (const [key, value] of Object.entries({ userAgent: mobile ? device === "phone" ? "iPhone Mobile" : "iPad" : "Windows NT 10.0", platform: mobile ? "iPhone" : "Win32", maxTouchPoints: mobile ? 5 : 0 })) Object.defineProperty(navigator, key, { configurable: true, value });
  const game = createGame([], "shadowdark"), hooks = createHooks(), registered = new Map();
  hooks.once = (name, callback) => { const fn = (...args) => { hooks.off(name, fn); return callback(...args); }; hooks.on(name, fn); };
  const pending = [], errors = [];
  if (full) {
    const on = hooks.on.bind(hooks), off = hooks.off.bind(hooks), wrapped = new Map();
    hooks.on = (name, callback) => {
      const tracked = (...args) => {
        try { const result = callback(...args); if (result?.then) pending.push(result.catch(error => errors.push(error.stack))); return result; }
        catch (error) { errors.push(error.stack); }
      };
      wrapped.set(callback, tracked); on(name, tracked); return callback;
    };
    hooks.off = (name, callback) => off(name, wrapped.get(callback) ?? callback);
  }
  const stored = new Map([["mikelandia-controls.mode", storedMode]]);
  game.i18n = { localize: key => key, translations: {}, lang: "en" };
  game.settings = { settings: registered, get(ns, key) { const id = `${ns}.${key}`; if (ns === "mikelandia-controls" && !registered.has(id)) throw Error("unregistered setting"); return stored.has(id) ? stored.get(id) : registered.get(id)?.default; }, register(ns, key, definition) { registered.set(`${ns}.${key}`, definition); }, async set(ns, key, value) { stored.set(`${ns}.${key}`, value); return value; } };
  game.modules.set("mikelandia-controls", { version: "fixture" });
  delete globalThis.game; globalThis.Hooks = hooks;
  game.configureUI = () => {};
  game.initializeCanvas = async () => {};
  game.socket = { connected: true, on() {}, off() {} };
  globalThis.ui = { notifications: { warn() {}, error() {} } };
  globalThis.CONFIG = { queries: {} };
  let initializeHooks = 0;
  class Game { async initialize() {
    initializeHooks = hooks.count("init");
    if (full) {
      hooks.emit("init"); hooks.emit("i18nInit"); hooks.emit("setup");
      game.ready = true; hooks.emit("ready");
      while (pending.length) await Promise.all(pending.splice(0));
    }
  } }
  globalThis.foundry = { Game };
  const nativeInitialize = Game.prototype.initialize;
  localStorage.clear();
  localStorage.setItem("mikelandia-controls:bootstrap-preferences:v1", JSON.stringify({ mode: params.get("cached") ?? (mobile ? "auto" : "phone"), theme: "dark", keepScreenAwake: false }));
  // The fixture uses the actual /game entry guard, preserving the harness query.
  history.replaceState(null, "", `/game${location.search}`);
  await import("/src/entry.mjs");
  globalThis.game = game;
  check("native desktop initialization is untouched", mobile || Game.prototype.initialize === nativeInitialize);
  if (mobile) {
    const initialization = new Game().initialize();
    await initialization;
    check("native initialization waits until client hooks are installed", initializeHooks === 2);
    check("mobile loading boundary removes itself", Game.prototype.initialize === nativeInitialize);
  }
  await tick();
  const resources = performance.getEntriesByType("resource").map(entry => new URL(entry.name).pathname);
  check("shared entry loads", resources.includes("/src/entry.mjs"));
  check("runtime follows authoritative mode", resources.includes("/src/mobile-entry.mjs") === active);
  check("styles follow authoritative mode", resources.includes("/assets/mobile.css") === active);
  if (!full) check("bootstrap created only on active phone/tablet", Boolean(document.querySelector(".mc-mobile-bootstrap")) === active);
  if (active) {
    if (!full) check("mobile init and setup hooks registered before Foundry startup", hooks.count("init") === 2 && hooks.count("setup") >= 2);
    const style = document.querySelector('link[href$="/assets/mobile.css"]');
    if (!style.sheet) await new Promise((resolve, reject) => { style.addEventListener("load", resolve, { once: true }); style.addEventListener("error", reject, { once: true }); });
    check("mobile styles finish loading", Boolean(style.sheet));
  }
  if (full) {
    check(`startup completes without hook failures: ${errors.join("; ")}`, errors.length === 0);
    if (active) {
      check("full startup mounts the actual companion", Boolean(document.querySelector(".mc-mobile-app")));
      check("full startup exposes active companion API", game.modules.get("mikelandia-controls").api?.active === true);
      if (params.has("common-display")) {
        const api = game.modules.get("mikelandia-controls").api;
        check("Common Display preserves completed companion visibility", getComputedStyle(document.querySelector(".mc-mobile-app")).display === "grid");
        api.open("settings"); await tick();
        check("mobile route opens after stale-cache startup", document.querySelector('.mc-mobile-app [data-route="settings"]').getAttribute("aria-current") === "page");
        history.back(); await new Promise(resolve => setTimeout(resolve, 100));
        check("Back returns through companion without leaving game", document.querySelector('.mc-mobile-app [data-route="characters"]').getAttribute("aria-current") === "page" && location.pathname === "/game" && Boolean(document.querySelector(".mc-mobile-app")));
      }
    } else check("opted-out phone does not create companion API", !game.modules.get("mikelandia-controls").api);
  } else if (!mobile) {
    hooks.emit("init"); hooks.emit("setup"); hooks.emit("ready"); await tick();
    check("desktop exposes no module settings", ![...registered.values()].some(setting => setting.config));
    check("desktop has no companion API", game.modules.get("mikelandia-controls").api === undefined);
    check("desktop never imports mobile kernel", !resources.includes("/src/kernel/app-kernel.mjs"));
  }
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) { document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack }); }
