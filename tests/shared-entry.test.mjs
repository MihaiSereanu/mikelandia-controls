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
  f.hooks.emit("init"); f.hooks.emit("i18nInit"); f.hooks.emit("setup");
  assert.deepEqual([...f.registered].filter(([, s]) => s.config).map(([key]) => key), ["mikelandia-controls.mode"]);
  assert.equal(typeof f.config.queries[MOMENTUM_QUERY], "function");
  assert.equal(f.game.modules.get("mikelandia-controls").api, undefined);
  f.window.dispatchEvent(new Event("pagehide"));
});

function fixture(t, mode, navigator = { userAgent: "Windows NT 10.0", platform: "Win32" }) {
  const game = createGame([], "wfrp4e"), hooks = createHooks(), registered = new Map(), menus = [];
  hooks.once = (name, fn) => { const once = (...args) => { hooks.off(name, once); return fn(...args); }; hooks.on(name, once); };
  const window = new EventTarget(); window.location = { pathname: "/game", reload() { throw Error("unexpected reload"); } };
  window.innerWidth = 1200; window.innerHeight = 900; window.matchMedia = () => ({ matches: false });
  const stored = new Map([["mikelandia-controls.mode", mode]]);
  game.settings = { settings: registered,
    get(ns, key) { const id = `${ns}.${key}`; return stored.has(id) ? stored.get(id) : registered.get(id)?.default; },
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
  const document = { createElement() { throw Error("native startup must not build companion UI or styles"); } };
  installGlobals(t, { window, navigator, document, Hooks: hooks, game, CONFIG: config, localStorage, sessionStorage: undefined, ui: { notifications: { warn: assert.fail, error: assert.fail } } });
  return { game, hooks, registered, menus, config, window, Actor, originalUpdate: Actor.prototype.update, initializeCanvas };
}
