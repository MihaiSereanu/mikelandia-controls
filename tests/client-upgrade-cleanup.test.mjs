import test from "node:test";
import assert from "node:assert/strict";
import { installClientUpgradeCleanup } from "../src/foundry/compatibility/client-upgrade-cleanup.mjs";
import { createLegacyClientRestoration } from "../src/foundry/compatibility/legacy-client-restoration.mjs";

const PREFIX = "mikelandia-controls.";
const RECEIPT = "mikelandia-controls:module-compatibility:v1:crlngn-ui";
function fixture({ snapshots = {}, native = {}, receipt = null, carolingian = false, failWrite = "" } = {}) {
  const values = new Map(Object.entries(snapshots).map(([key, value]) => [PREFIX + key, structuredClone(value)]));
  const local = new Map(Object.entries(native).map(([key, value]) => [key, JSON.stringify(value)]));
  const registrations = new Map(Object.entries(native).map(([key, value]) => [key, { scope: "client", default: value }]));
  const writes = [], events = new Map(), notifications = [];
  let reloads = 0;
  const browser = new Map(receipt === null ? [] : [[RECEIPT, receipt]]);
  const client = { getItem: key => local.get(key) ?? null, setItem(key, value) { if (key === failWrite) throw Error("write failed"); local.set(key, value); } };
  const game = { modules: new Map([["crlngn-ui", { active: carolingian }], ["force-client-settings", { active: true }]]),
    settings: { settings: registrations, storage: new Map([["client", client]]),
      get(namespace, name) { const key = `${namespace}.${name}`; return local.has(key) ? JSON.parse(local.get(key)) : values.get(key); },
      async set(namespace, name, value) { assert.equal(namespace, "mikelandia-controls", "no native setting may enter forced setter"); writes.push(name); values.set(`${namespace}.${name}`, value); } },
    initializeCanvas() { return JSON.parse(local.get("core.noCanvas") ?? "false"); } };
  const cleanups = [], scope = { disposed: false, own(fn) { cleanups.push(fn); }, hook(name, fn) { events.set(name, fn); }, dispose() { this.disposed = true; for (const fn of cleanups.reverse()) fn(); } };
  return { game, values, local, writes, browser, events, notifications, scope, get reloads() { return reloads; },
    install(options = {}) { return installClientUpgradeCleanup(scope, { getGame: () => game,
      getStorage: () => ({ getItem: key => browser.get(key) ?? null, removeItem: key => browser.delete(key) }),
      notify: error => notifications.push(error.message), requestReload: () => { reloads++; }, ...options }); } };
}

test("ordinary clients perform no restoration writes or canvas interception", async () => {
  const f = fixture(), original = f.game.initializeCanvas;
  const cleanup = f.install();
  assert.equal(f.game.initializeCanvas, original);
  assert.deepEqual(await cleanup.whenIdle(), { ok: true, changed: false, reloadPending: false });
  assert.deepEqual(f.writes, []); assert.equal(f.events.size, 0);
});

test("legacy graphics/noCanvas/theme restore locally before native canvas initializes and retire once", async () => {
  const originalTheme = { colorScheme: { applications: "light", interface: "dark" }, fontScale: 5 };
  const f = fixture({ snapshots: {
    graphicsSettingsSnapshot: { schemaVersion: 4, original: { "core.maxFPS": 60 }, applied: { "core.maxFPS": 20 }, noCanvasOriginal: false },
    themeSettingsSnapshot: { captured: true, original: originalTheme }, pendingDesktopRestore: { version: 1, attempts: 2 },
    graphicsProfileTransaction: { old: true }, mobileEntryHandoff: { version: 1, token: "old" }
  }, native: { "core.maxFPS": 20, "core.noCanvas": true, "core.uiConfig": { colorScheme: { interface: "light" } } } });
  const original = f.game.initializeCanvas, cleanup = f.install();
  assert.notEqual(f.game.initializeCanvas, original);
  assert.equal(await f.game.initializeCanvas(), false, "native startup sees restored canvas preference");
  assert.equal(f.game.initializeCanvas, original, "interception removes itself");
  assert.equal((await cleanup.whenIdle()).ok, true);
  assert.equal(JSON.parse(f.local.get("core.maxFPS")), 60);
  assert.deepEqual(JSON.parse(f.local.get("core.uiConfig")), originalTheme);
  assert.ok([...f.values.values()].every(value => Object.keys(value).length === 0));
  assert.equal((await f.install().whenIdle()).changed, false);
});

test("invalid or failed upgrades preserve records and allow native startup with a native notification", async () => {
  for (const invalid of [true, false]) {
    const snapshots = { graphicsSettingsSnapshot: { schemaVersion: 4,
      original: { [invalid ? "core.permissions" : "core.maxFPS"]: 60 }, applied: { [invalid ? "core.permissions" : "core.maxFPS"]: 20 } },
      themeSettingsSnapshot: { captured: true, original: { colorScheme: { interface: "dark" } } } };
    const f = fixture({ snapshots, native: { "core.maxFPS": 20, "core.uiConfig": {} }, failWrite: invalid ? "" : "core.uiConfig" });
    const cleanup = f.install(); assert.equal(await f.game.initializeCanvas(), false);
    assert.equal((await cleanup.whenIdle()).ok, false);
    assert.deepEqual(f.values.get(PREFIX + "graphicsSettingsSnapshot"), snapshots.graphicsSettingsSnapshot);
    assert.deepEqual(f.values.get(PREFIX + "themeSettingsSnapshot"), snapshots.themeSettingsSnapshot);
    assert.deepEqual(f.writes, []); assert.equal(f.notifications.length, 0);
    f.events.get("ready")(); assert.equal(f.notifications.length, 1);
  }
});

test("Carolingian old override restores only client storage and reloads once", async () => {
  const f = fixture({ receipt: JSON.stringify({ version: 1, previousValue: false }), carolingian: true, native: { "crlngn-ui.disable-ui": true } });
  assert.deepEqual(await f.install().whenIdle(), { ok: true, changed: true, reloadPending: true });
  assert.equal(JSON.parse(f.local.get("crlngn-ui.disable-ui")), false);
  assert.equal(f.browser.has(RECEIPT), false); assert.equal(f.reloads, 1); assert.deepEqual(f.writes, []);
  await f.install().whenIdle(); assert.equal(f.reloads, 1);
});

test("inactive Carolingian keeps its receipt for a future upgrade without blocking native startup", async () => {
  const f = fixture({ receipt: JSON.stringify({ version: 1, previousValue: false }) });
  assert.equal((await f.install().whenIdle()).ok, true);
  assert.equal(f.browser.has(RECEIPT), true); assert.equal(f.reloads, 0);
});

test("Carolingian async init registration restores the old receipt without holding canvas startup", async () => {
  const f = fixture({ receipt: JSON.stringify({ version: 1, previousValue: false }), carolingian: true,
    native: { "crlngn-ui.disable-ui": true, "core.noCanvas": true },
    snapshots: { graphicsSettingsSnapshot: { schemaVersion: 4, original: {}, applied: {}, noCanvasOriginal: false } } });
  const definition = f.game.settings.settings.get("crlngn-ui.disable-ui");
  f.game.settings.settings.delete("crlngn-ui.disable-ui");
  const cleanup = f.install();
  assert.equal(await f.game.initializeCanvas(), false, "graphics restore finishes before canvas, without waiting for Carolingian");
  assert.equal(f.browser.has(RECEIPT), true, "receipt remains while registration is pending");
  f.game.settings.settings.set("crlngn-ui.disable-ui", definition);
  assert.deepEqual(await cleanup.whenIdle(), { ok: true, changed: true, reloadPending: true });
  assert.equal(JSON.parse(f.local.get("crlngn-ui.disable-ui")), false);
  assert.equal(f.browser.has(RECEIPT), false);
  assert.equal(f.reloads, 1);
  assert.equal(f.notifications.length, 0);
});

test("missing Carolingian registration has a bounded wait and retains recovery values", async () => {
  const f = fixture({ receipt: JSON.stringify({ version: 1, previousValue: false }), carolingian: true });
  const cleanup = f.install({ registrationTimeoutMs: 10 });
  assert.equal(await f.game.initializeCanvas(), false);
  assert.equal((await cleanup.whenIdle()).ok, false);
  assert.equal(f.browser.has(RECEIPT), true);
  assert.equal(f.reloads, 0);
  f.events.get("ready")();
  assert.match(f.notifications[0], /client-only preferences are unavailable/);
});

test("malformed theme/Carolingian snapshots do not silently discard saved preferences", async () => {
  for (const options of [{ snapshots: { themeSettingsSnapshot: { captured: true } } }, { receipt: "invalid json" }]) {
    const f = fixture(options); assert.equal((await f.install().whenIdle()).ok, false);
    assert.deepEqual(f.writes, []); assert.equal(f.reloads, 0);
  }
});

test("legacy restoration can defer retiring its receipt until all upgrade work succeeds", async () => {
  const f = fixture({ snapshots: { graphicsSettingsSnapshot: { schemaVersion: 4, original: { "core.maxFPS": 60 }, applied: { "core.maxFPS": 20 } } }, native: { "core.maxFPS": 20 } });
  await createLegacyClientRestoration({ getGame: () => f.game }).restore({ retire: false });
  assert.equal(JSON.parse(f.local.get("core.maxFPS")), 60);
  assert.ok(f.values.get(PREFIX + "graphicsSettingsSnapshot").schemaVersion);
});
