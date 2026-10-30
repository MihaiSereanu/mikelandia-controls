import test from "node:test";
import assert from "node:assert/strict";
import { createGame, createHooks, installGlobals } from "./helpers/foundry.mjs";
import { MOMENTUM_QUERY } from "../src/foundry/compatibility/wfrp-opposed-momentum.mjs";

for (const mode of ["auto", "phone", "tablet", "native"]) {
  test(`native desktop loads shared fixes without companion UI for saved ${mode}`, async t => {
    const f = fixture(t, mode);
    await import(`../src/entry.mjs?native=${mode}`);
    f.hooks.emit("init"); f.hooks.emit("i18nInit"); f.hooks.emit("setup"); f.hooks.emit("ready");
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(f.game.i18n.translations["Primary Arm"], "Right Arm");
    assert.equal(f.game.i18n.translations["Secondary Arm"], "Left Arm");
    assert.equal(typeof f.config.queries[MOMENTUM_QUERY], "function", "desktop GM can serve mobile Momentum requests");
    assert.notEqual(f.Actor.prototype.update, f.originalUpdate);
    assert.equal(f.game.initializeCanvas, f.initializeCanvas, "ordinary native startup has no mobile/cleanup boundary");
    assert.equal(f.game.modules.get("mikelandia-controls").api, undefined);
    assert.equal([...f.registered.values()].some(s => s.config), false);
    assert.equal(f.menus.length, 0);
    f.window.dispatchEvent(new Event("pagehide"));
    assert.equal(f.config.queries[MOMENTUM_QUERY], undefined);
    assert.equal(f.Actor.prototype.update, f.originalUpdate);
  });
}

test("opted-out phone uses native Foundry with only a mode selector and shared fixes", async t => {
  const f = fixture(t, "native", { userAgent: "iPhone Mobile", platform: "iPhone" });
  await import("../src/entry.mjs?native-phone");
  await f.game.initialize();
  assert.deepEqual([...f.registered].filter(([, s]) => s.config).map(([key]) => key), ["mikelandia-controls.mode"]);
  assert.equal(typeof f.config.queries[MOMENTUM_QUERY], "function");
  assert.equal(f.game.modules.get("mikelandia-controls").api, undefined);
  f.window.dispatchEvent(new Event("pagehide"));
});

for (const cachedMode of ["native", "off", "desktop"]) for (const storedMode of ["auto", "phone", "tablet"]) {
  test(`mobile startup reads authoritative ${storedMode} with stale ${cachedMode} cache and no game at import`, async t => {
    const f = fixture(t, storedMode, { userAgent: "Android Mobile", platform: "Linux armv8l", maxTouchPoints: 5 }, { mobileBoundary: true });
    f.values.set("mikelandia-controls:bootstrap-preferences:v1", JSON.stringify({ mode: cachedMode, theme: "dark", keepScreenAwake: false }));
    delete globalThis.game;
    await import(`../src/entry.mjs?authoritative=${storedMode}&stale=${cachedMode}`);
    assert.equal(f.mobileStyles.length, 0, "unregistered cached mode must not load styles before Game exists");
    globalThis.game = f.game;
    const errors = t.mock.method(console, "error", () => {});
    await f.game.initialize();
    assert.equal(f.mobileStyles.length, 1, "authoritative active mobile mode must attempt the companion stylesheet");
    assert.ok(f.mobileStyles[0].href.endsWith("/assets/mobile.css"));
    assert.equal(f.game.i18n.translations["Primary Arm"], "Right Arm");
    assert.equal(typeof f.config.queries[MOMENTUM_QUERY], "function", "shared fixes survive even when this Node host stops at the UI boundary");
    assert.equal(f.notifications.length, 1, "Node has no browser DOM; the intentional UI-boundary failure is reported");
    assert.equal(errors.mock.calls.length, 1);
    assert.match(errors.mock.calls[0].arguments[1]?.message ?? "", /Intentional Node UI boundary/, "other startup errors must not masquerade as the expected DOM boundary");
    f.window.dispatchEvent(new Event("pagehide"));
  });
}

for (const storedMode of ["native", "off", "desktop"]) {
  test(`mobile opt-out ${storedMode} overrides stale auto cache before importing companion UI`, async t => {
    const f = fixture(t, storedMode, { userAgent: "Android Mobile", platform: "Linux armv8l", maxTouchPoints: 5 });
    f.values.set("mikelandia-controls:bootstrap-preferences:v1", JSON.stringify({ mode: "auto", theme: "dark", keepScreenAwake: false }));
    delete globalThis.game;
    await import(`../src/entry.mjs?authoritative-native=${storedMode}`);
    globalThis.game = f.game;
    await f.game.initialize();
    assert.equal(f.mobileStyles.length, 0);
    assert.equal(f.game.modules.get("mikelandia-controls").api, undefined);
    assert.deepEqual([...f.registered].filter(([, s]) => s.config).map(([key]) => key), ["mikelandia-controls.mode"]);
    assert.equal(f.game.i18n.translations["Secondary Arm"], "Left Arm");
    assert.equal(typeof f.config.queries[MOMENTUM_QUERY], "function");
    f.window.dispatchEvent(new Event("pagehide"));
  });
}

function fixture(t, mode, navigator = { userAgent: "Windows NT 10.0", platform: "Win32" }, { mobileBoundary = false } = {}) {
  const game = createGame([], "wfrp4e"), hooks = createHooks(), registered = new Map(), menus = [];
  hooks.once = (name, fn) => { const once = (...args) => { hooks.off(name, once); return fn(...args); }; hooks.on(name, once); };
  const window = new EventTarget(); window.location = { pathname: "/game", reload() { throw Error("unexpected reload"); } };
  window.innerWidth = 1200; window.innerHeight = 900; window.matchMedia = () => ({ matches: false });
  const stored = new Map([["mikelandia-controls.mode", mode]]);
  game.settings = { settings: registered,
    get(ns, key) { const id = `${ns}.${key}`; if (!registered.has(id)) throw Error(`Unregistered setting ${id}`); return stored.has(id) ? stored.get(id) : registered.get(id)?.default; },
    register(ns, key, definition) { registered.set(`${ns}.${key}`, definition); },
    registerMenu(...args) { menus.push(args); },
    async set(ns, key, value) { stored.set(`${ns}.${key}`, value); return value; } };
  class Actor { async update() {} }
  class Handler { async computeOpposeResult() {} }
  game.wfrp4e = { opposedHandler: Handler, documents: { ActorWFRP4e: Actor } };
  game.i18n = { translations: {}, localize: key => key, lang: "en" };
  game.modules.set("mikelandia-controls", { version: "1.1.0" });
  const initializeCanvas = game.initializeCanvas = async () => {};
  const config = { queries: {} }, values = new Map();
  const localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k), key: i => [...values.keys()][i], get length() { return values.size; } };
  const mobileStyles = [], notifications = [];
  const document = {
    head: { append(link) { mobileStyles.push(link); } },
    createElement(tag) {
      if (mobileBoundary && tag === "link") return {};
      throw Error(mobileBoundary ? "Intentional Node UI boundary: full mobile lifecycle requires a browser DOM" : "native startup must not build companion UI or styles");
    }
  };
  class Game { async initialize() {
    hooks.emit("init"); hooks.emit("i18nInit"); hooks.emit("setup");
    this.ready = true; hooks.emit("ready");
    await new Promise(resolve => setTimeout(resolve, 0));
  } }
  Object.setPrototypeOf(game, Game.prototype);
  installGlobals(t, { window, navigator, document, Hooks: hooks, game, foundry: { Game }, CONFIG: config, localStorage, sessionStorage: undefined,
    ui: { notifications: { warn: assert.fail, error: mobileBoundary ? value => notifications.push(value) : assert.fail } } });
  return { game, hooks, registered, menus, config, window, Actor, originalUpdate: Actor.prototype.update, initializeCanvas, values, mobileStyles, notifications };
}
