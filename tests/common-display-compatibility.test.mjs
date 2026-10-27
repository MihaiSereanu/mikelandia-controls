import test from "node:test";
import assert from "node:assert/strict";
import { enableCommonDisplayManualControl } from "../src/foundry/common-display-compatibility.mjs";
import { createTaskScope } from "../src/kernel/task-scope.mjs";

test("mobile manual control bypasses only Common Display focus calls and restores on exit", async () => {
  const scope = createTaskScope("display"), writes = [], calls = [];
  const token = { control() { calls.push("control"); }, release() { calls.push("release"); } };
  const layer = { placeables: [token], controlled: [token], releaseAll() { calls.push("releaseAll"); } };
  const MonksCommonDisplay = {
    playerdata: { display: true }, focusValue: "combat", bookkeeping: 0,
    controlToken() { this.bookkeeping++; token.control(); token.release(); },
    changeFocus() { layer.releaseAll(); token.control(); },
    dataChange() { this.playerdata = { display: true }; token.release(); this.bookkeeping++; }
  };
  const nativeControl = token.control, nativeRelease = token.release;
  const focusHook = function (token) { const shouldControl = false; if (MonksCommonDisplay.playerdata.display && !shouldControl) token.release(); };
  const combatHook = function () { if (MonksCommonDisplay.focusValue === "combat") token.control(); };
  const unrelated = () => token.control();
  const hooks = { events: { controlToken: [{ fn: focusHook }, { fn: unrelated }], updateCombat: [{ fn: combatHook }] } };
  const game = { user: { isGM: false }, modules: new Map([["monks-common-display", { active: true }]]), settings: { set: (...args) => writes.push(args) } };
  const originalChangeFocus = MonksCommonDisplay.changeFocus;
  await enableCommonDisplayManualControl(scope, { getGame: () => game, getCanvas: () => ({ tokens: layer }), getHooks: () => hooks, loadClass: async () => MonksCommonDisplay });
  hooks.events.controlToken[0].fn(token); hooks.events.updateCombat[0].fn();
  MonksCommonDisplay.controlToken(); MonksCommonDisplay.changeFocus(); MonksCommonDisplay.dataChange();
  assert.deepEqual(calls, []); assert.equal(MonksCommonDisplay.bookkeeping, 2); assert.deepEqual(writes, []);
  assert.equal(token.control, nativeControl); assert.equal(token.release, nativeRelease);
  hooks.events.controlToken[1].fn(); assert.deepEqual(calls, ["control"]);
  calls.length = 0; scope.dispose();
  assert.equal(hooks.events.controlToken[0].fn, focusHook); assert.equal(MonksCommonDisplay.changeFocus, originalChangeFocus);
  MonksCommonDisplay.changeFocus(); assert.deepEqual(calls, ["releaseAll", "control"]);
});

test("GM clients, non-displays, disposed scopes and missing modules retain native behavior", async () => {
  for (const variant of ["gm", "not-display", "disposed", "inactive"]) {
    const scope = createTaskScope(variant); let calls = 0;
    const token = { control() { calls++; } }, Display = { playerdata: { display: variant !== "not-display" }, changeFocus() { token.control(); } };
    const game = { user: { isGM: variant === "gm" }, modules: new Map([["monks-common-display", { active: variant !== "inactive" }]]) };
    if (variant === "disposed") scope.dispose();
    await enableCommonDisplayManualControl(scope, { getGame: () => game, getCanvas: () => ({ tokens: { placeables: [token] } }), getHooks: () => ({ events: {} }), loadClass: async () => Display });
    Display.changeFocus(); assert.equal(calls, 1); scope.dispose();
  }
});

test("a failing Common Display callback restores native token methods before propagating", async () => {
  const scope = createTaskScope("failure"), token = { control() { return true; }, release() {} };
  const original = token.control;
  const Display = { playerdata: { display: true }, changeFocus() { token.control(); throw Error("native failure"); } };
  const game = { user: { isGM: false }, modules: new Map([["monks-common-display", { active: true }]]) };
  await enableCommonDisplayManualControl(scope, { getGame: () => game, getCanvas: () => ({ tokens: { placeables: [token] } }), getHooks: () => ({ events: {} }), loadClass: async () => Display });
  assert.throws(() => Display.changeFocus(), /native failure/); assert.equal(token.control, original); assert.equal(token.control(), true);
  scope.dispose();
});
