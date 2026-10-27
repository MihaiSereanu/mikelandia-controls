import test from "node:test";
import assert from "node:assert/strict";
import { initialAppState, reduceAppState } from "../src/kernel/app-state.mjs";
import { createFoundrySessionGateway } from "../src/foundry/session-gateway.mjs";
import { createLegacyClientRestoration } from "../src/foundry/legacy-client-restoration.mjs";
import { createTaskScope } from "../src/kernel/task-scope.mjs";
import { resolveMobileGraphicsPolicy } from "../src/foundry/mobile-graphics-policy.mjs";
import { createActor, createGame, createHooks, installGlobals } from "./helpers/foundry.mjs";

test("dice presentation still resolves without a canvas or retired graphics journal", () => {
  for (const diceRendering of ["auto", "static", "reduced", "normal"]) {
    const policy = resolveMobileGraphicsPolicy({ graphicsSafety: "off", diceRendering, getCanvas: () => null, navigatorRef: {}, screenRef: {} });
    assert.equal(policy.effects, "off");
    assert.ok(["static", "reduced", "normal"].includes(policy.dice));
    if (diceRendering !== "auto") assert.equal(policy.dice, diceRendering);
  }
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
  const values = new Map([["ve-mobile.graphicsSettingsSnapshot", snapshot], ["core.maxFPS", 20], ["core.noCanvas", true]]);
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
  await f.restore.beginMobileSession();
  assert.equal(f.values.get("core.maxFPS"), 60);
  assert.equal(f.values.get("core.noCanvas"), false);
  assert.deepEqual(f.values.get("ve-mobile.graphicsSettingsSnapshot"), {});
  assert.deepEqual(f.restore.pendingRestoration(), []);
});

test("invalid restoration snapshots remain intact and cannot write unrelated settings", async t => {
  const snapshot = { schemaVersion: 4, original: { "core.permissions": {} }, applied: { "core.permissions": {} } };
  const f = restorationFixture(t, snapshot);
  await assert.rejects(f.restore.restoreForDesktop(), /invalid/);
  assert.equal(f.values.get("ve-mobile.graphicsSettingsSnapshot"), snapshot);
  assert.equal(f.values.has("core.permissions"), false);
});
