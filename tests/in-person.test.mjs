import test from "node:test";
import assert from "node:assert/strict";
import { initialAppState, reduceAppState } from "../src/kernel/state/app-state.mjs";
import { createFoundrySessionGateway } from "../src/foundry/session/session-gateway.mjs";
import { createLegacyClientRestoration } from "../src/foundry/compatibility/legacy-client-restoration.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";
import { resolveMobileGraphicsPolicy } from "../src/foundry/presentation/mobile-graphics-policy.mjs";
import { createActor, createGame, createHooks, installGlobals } from "./helpers/foundry.mjs";

test("explicit dice choices override device hints and invalid choices use automatic mode", () => {
  for (const navigatorRef of [{}, { userAgent: "Android", deviceMemory: 4, hardwareConcurrency: 4 }, { userAgent: "iPhone" }]) {
    for (const diceRendering of ["static", "reduced", "normal"]) {
      assert.equal(resolveMobileGraphicsPolicy({ diceRendering, navigatorRef }).dice, diceRendering);
    }
  }
  assert.equal(resolveMobileGraphicsPolicy({ diceRendering: "invalid", navigatorRef: {} }).dice, "normal");
  assert.equal(resolveMobileGraphicsPolicy({ diceRendering: "invalid", navigatorRef: { userAgent: "Android" } }).dice, "reduced");
});

test("automatic dice selection preserves mobile capability and backing-area boundaries", () => {
  const android = { userAgent: "Android" };
  const cases = [
    ["desktop without hints", {}, {}, 1, "normal"],
    ["Android without hints", android, {}, 1, "reduced"],
    ["iPhone without hints", { userAgent: "iPhone" }, {}, 1, "reduced"],
    ["iPad desktop identification", { platform: "MacIntel", maxTouchPoints: 5 }, {}, 1, "reduced"],
    ["Mac without touch", { platform: "MacIntel", maxTouchPoints: 0 }, {}, 1, "normal"],
    ["low memory and CPU", { ...android, deviceMemory: 4, hardwareConcurrency: 4 }, {}, 1, "static"],
    ["high CPU with low memory", { ...android, deviceMemory: 4, hardwareConcurrency: 8 }, {}, 1, "normal"],
    ["high memory with low CPU", { ...android, deviceMemory: 8, hardwareConcurrency: 4 }, {}, 1, "reduced"],
    ["high memory and six cores", { ...android, deviceMemory: 8, hardwareConcurrency: 6 }, {}, 1, "normal"],
    ["six cores without memory", { ...android, hardwareConcurrency: 6 }, {}, 1, "reduced"],
    ["high memory without CPU", { ...android, deviceMemory: 8 }, {}, 1, "normal"],
    ["malformed hints", { ...android, deviceMemory: "invalid", hardwareConcurrency: -1 }, {}, 1, "reduced"],
    ["numeric string hints", { ...android, deviceMemory: "4", hardwareConcurrency: "4" }, {}, 1, "static"],
    ["14 million backing pixels", { ...android, hardwareConcurrency: 8 }, { width: 2000, height: 7000 }, 1, "normal"],
    ["above 14 million backing pixels", { ...android, hardwareConcurrency: 8 }, { width: 2000, height: 7001 }, 1, "reduced"],
    ["DPR boundary", { ...android, hardwareConcurrency: 8 }, { width: 1000, height: 3500 }, 2, "normal"],
    ["above DPR boundary", { ...android, hardwareConcurrency: 8 }, { width: 1000, height: 3501 }, 2, "reduced"],
    ["pixel ratio floor", { ...android, hardwareConcurrency: 8 }, { width: 2000, height: 7001 }, 0.5, "reduced"]
  ];
  for (const [label, navigatorRef, screenRef, ratio, expected] of cases) {
    assert.equal(resolveMobileGraphicsPolicy({ navigatorRef, screenRef, getPixelRatio: () => ratio }).dice, expected, label);
  }
});

test("dice selection never inspects the Foundry renderer", t => {
  installGlobals(t, { canvas: { get app() { throw new Error("The renderer must not be inspected"); } } });
  assert.equal(resolveMobileGraphicsPolicy({ navigatorRef: { userAgent: "Android", hardwareConcurrency: 8 }, screenRef: {}, getPixelRatio: () => 1 }).dice, "normal");
});

test("retired Scene routes and commands cannot reopen map controls", () => {
  const state = { ...initialAppState, route: "combat" };
  for (const type of ["open-scene-chooser", "open-full-scene", "toggle-split-screen", "actor-token-placement-changed", "template-placement-changed"]) {
    assert.equal(reduceAppState(state, { type, placement: { id: "old" } }), state);
  }
  assert.equal(reduceAppState(state, { type: "navigate", route: "scene" }).route, "characters");
});

test("character discovery never controls or releases tokens and ignores target hooks", async t => {
  const actor = createActor(), game = createGame([actor]), Hooks = createHooks();
  installGlobals(t, { game, Hooks, canvas: { get tokens() { throw new Error("Token controls must not be read"); } } });
  const gateway = createFoundrySessionGateway(), scope = createTaskScope("in-person-session"), publications = [];
  t.after(() => scope.dispose());
  const snapshot = gateway.watch(scope, value => publications.push(value), error => { throw error; });
  assert.equal(snapshot.selectedActor, null);
  assert.equal(Object.hasOwn(snapshot, "scene"), false);
  assert.equal(gateway.selectCharacterSource(actor.uuid).selectedActor.id, actor.id);
  assert.equal(Hooks.count("controlToken"), 0);
  assert.equal(Hooks.count("targetToken"), 0);
  Hooks.emit("controlToken", { actor }, true);
  Hooks.emit("targetToken", game.user, {}, true);
  await Promise.resolve();
  assert.deepEqual(publications, []);
});

test("selected character data still refreshes after native item edits", async t => {
  const actor = createActor(), game = createGame([actor]), Hooks = createHooks();
  game.user.character = actor;
  installGlobals(t, { game, Hooks });
  const gateway = createFoundrySessionGateway(), scope = createTaskScope("character-refresh"), publications = [];
  t.after(() => scope.dispose());
  gateway.watch(scope, value => publications.push(value), error => { throw error; });
  actor.system.attributes.hp.value = 4;
  Hooks.emit("updateItem", { parent: actor }, {});
  await Promise.resolve();
  assert.equal(publications.at(-1).selectedActor.hp.value, 4);
});

function restorationFixture(t, snapshot) {
  const values = new Map([["mikelandia-controls.graphicsSettingsSnapshot", snapshot], ["core.maxFPS", 20], ["core.noCanvas", true]]);
  const game = createGame();
  game.settings = {
    get: (namespace, key) => values.get(`${namespace}.${key}`),
    async set(namespace, key, value) { values.set(`${namespace}.${key}`, value); return value; }
  };
  installGlobals(t, { game });
  return { values, restore: createLegacyClientRestoration({ getGame: () => game }) };
}

test("upgrades restore saved client graphics preferences without applying a new profile", async t => {
  const f = restorationFixture(t, { schemaVersion: 4, original: { "core.maxFPS": 60 }, applied: { "core.maxFPS": 20 }, noCanvasOriginal: false });
  assert.deepEqual(f.restore.pendingRestoration(), ["core.maxFPS", "core.noCanvas"]);
  await f.restore.restore();
  assert.equal(f.values.get("core.maxFPS"), 60);
  assert.equal(f.values.get("core.noCanvas"), false);
  assert.deepEqual(f.values.get("mikelandia-controls.graphicsSettingsSnapshot"), {});
  assert.deepEqual(f.restore.pendingRestoration(), []);
});

test("invalid restoration snapshots remain intact and cannot write unrelated settings", async t => {
  const snapshot = { schemaVersion: 4, original: { "core.permissions": {} }, applied: { "core.permissions": {} } };
  const f = restorationFixture(t, snapshot);
  await assert.rejects(f.restore.restore(), /invalid/);
  assert.equal(f.values.get("mikelandia-controls.graphicsSettingsSnapshot"), snapshot);
  assert.equal(f.values.has("core.permissions"), false);
});
