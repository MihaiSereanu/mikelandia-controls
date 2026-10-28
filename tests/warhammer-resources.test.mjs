import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/command-gateway.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { sessionInvalidationForHook } from "../src/foundry/session-gateway.mjs";
import { installGlobals, collection } from "./helpers/foundry.mjs";
import { createWarhammerActor, createWarhammerGame } from "./helpers/warhammer.mjs";

const command = ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE;
function setup(t, { use5e = false, groupAdvantage = false } = {}) {
  const calls = [];
  const actor = createWarhammerActor();
  actor.system.status.advantage.max = 10;
  actor.advantageGroup = "players";
  actor.update = async (...args) => { calls.push(["update", ...args]); return actor; };
  actor.setWounds = async (...args) => { calls.push(["setWounds", ...args]); return actor; };
  actor.setAdvantage = async (...args) => { calls.push(["setAdvantage", ...args]); return actor; };
  const game = createWarhammerGame([actor], { use5e, groupAdvantage });
  const settings = { use5e, groupAdvantage, capAdvantageIB: false, advantagemax: 10, groupAdvantageValues: { players: 4, enemies: 2 } };
  game.settings.get = (_namespace, key) => key === "editionSettings" ? { use5e: settings.use5e }
    : key === "useGroupAdvantage" ? settings.groupAdvantage : settings[key];
  const combatant = { id: "combatant", actor };
  game.combat = { id: "combat", getCombatantByActor: target => target === actor ? combatant : null };
  installGlobals(t, { game });
  const gateway = createFoundryCommandGateway();
  const payload = (id = "wounds", value = 8) => {
    const edit = gateway.capabilitiesForActor(actor).profileEdits.find(edit => edit.id === id);
    return { actorSourceUuid: actor.uuid, resourceId: id, resourceRevision: edit.revision, expectedValue: edit.value, value };
  };
  const view = () => resolveSystemIntegration("wfrp4e").createActorViewRecord(actor, game.user, gateway.capabilitiesForActor);
  return { actor, game, gateway, calls, settings, payload, view, combatant };
}

for (const use5e of [false, true]) {
  test(`${use5e ? "5e" : "4e"} resource controls follow native edition visibility and allowlisted update paths`, async t => {
    const { gateway, calls, payload, view } = setup(t, { use5e });
    const rows = view().panels.flatMap(tab => tab.sections.flatMap(section => section.rows));
    assert.equal(rows.find(row => row.id === "wounds").edit.kind, "integer");
    assert.equal(rows.find(row => row.id === "ws").edit, undefined);
    await gateway.execute(command, payload("wounds", 0));
    assert.deepEqual(calls.shift(), ["setWounds", 0]);
    for (const id of ["fortune", "fate", "corruption", ...(!use5e ? ["resolve", "resilience"] : [])]) {
      await gateway.execute(command, payload(id, 5));
      assert.deepEqual(calls.shift(), ["update", { [`system.status.${id}.value`]: 5 }]);
    }
    if (use5e) {
      await gateway.execute(command, payload("momentum", false));
      assert.deepEqual(calls.shift(), ["update", { "system.status.momentum": false }]);
    } else {
      await gateway.execute(command, payload("advantage", 6));
      assert.deepEqual(calls.shift(), ["setAdvantage", 6]);
    }
    for (const id of use5e ? ["resolve", "resilience", "advantage"] : ["momentum"]) {
      await assert.rejects(gateway.execute(command, { ...payload(), resourceId: id }), { code: "CAPABILITY_UNAVAILABLE" });
    }
    assert.deepEqual(calls, []);
  });
}

test("numeric validation rejects coercion, fractions, nonfinite values, unsafe integers, and native caps", async t => {
  const { gateway, calls, payload } = setup(t);
  for (const value of [-1, 1.5, "3", "", null, true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 14]) {
    await assert.rejects(gateway.execute(command, payload("wounds", value)), { code: "INVALID_INPUT" });
  }
  await assert.rejects(gateway.execute(command, payload("advantage", 11)), { code: "INVALID_INPUT" });
  assert.deepEqual(calls, []);
});

test("Fortune is not capped to Fate and Corruption may exceed its mutation threshold", async t => {
  const { gateway, calls, payload } = setup(t);
  await gateway.execute(command, payload("fortune", 6));
  await gateway.execute(command, payload("corruption", 8));
  assert.deepEqual(calls, [["update", { "system.status.fortune.value": 6 }], ["update", { "system.status.corruption.value": 8 }]]);
  // The adapter supplies no options to suppress the native corruption check.
});

test("Momentum accepts only booleans", async t => {
  const { gateway, calls, payload } = setup(t, { use5e: true });
  for (const value of [0, 1, "false", null]) await assert.rejects(gateway.execute(command, payload("momentum", value)), { code: "INVALID_INPUT" });
  assert.deepEqual(calls, []);
});

test("no-op saves produce no native updates or repeated side effects", async t => {
  const { gateway, calls, payload } = setup(t);
  assert.equal((await gateway.execute(command, payload("wounds", 9))).unchanged, true);
  assert.deepEqual(calls, []);
});

test("client paths, methods, skip flags, derived fields, and unknown resources are rejected", async t => {
  const { gateway, calls, payload } = setup(t);
  for (const extra of [{ path: "system.status.wounds.max" }, { method: "update" }, { options: {} }, { skipCorruption: true }]) {
    await assert.rejects(gateway.execute(command, { ...payload(), ...extra }), { code: "INVALID_INPUT" });
  }
  for (const id of ["constructor", "__proto__", "wounds.max", "ws", "system.status.wounds.value", "channelled-power"]) {
    await assert.rejects(gateway.execute(command, { ...payload(), resourceId: id }), { code: "CAPABILITY_UNAVAILABLE" });
  }
  assert.deepEqual(calls, []);
});

for (const change of ["value", "maximum", "edition", "group-mode", "cap-setting", "permission", "actor", "method", "world", "connection", "lifecycle"]) {
  test(`resource saves reject stale ${change}`, async t => {
    const { actor, game, settings, calls, payload } = setup(t);
    const edit = payload(change === "cap-setting" ? "advantage" : "wounds", 6);
    let generation = 0, active = true;
    const gateway = createFoundryCommandGateway({ getConnectionGeneration: () => generation });
    const expected = { worldId: "world", connectionGeneration: 0, isCurrent: () => active };
    if (change === "value") actor.system.status.wounds.value = 7;
    if (change === "maximum") actor.system.status.wounds.max = 12;
    if (change === "edition") settings.use5e = true;
    if (change === "group-mode") settings.groupAdvantage = true;
    if (change === "cap-setting") settings.capAdvantageIB = true;
    if (change === "permission") actor.testUserPermission = () => false;
    if (change === "actor") game.actors = collection([createWarhammerActor()]);
    if (change === "method") delete actor.setWounds;
    if (change === "world") game.world.id = "other";
    if (change === "connection") generation++;
    if (change === "lifecycle") active = false;
    await assert.rejects(gateway.execute(command, edit, expected));
    assert.deepEqual(calls, []);
  });
}

test("missing, malformed, derived, or unsupported resources remain read-only", t => {
  const { actor, gateway } = setup(t);
  delete actor.system.status.wounds.max;
  actor.system.status.advantage.max = NaN;
  actor.system.status.fortune.value = "1";
  assert.deepEqual(gateway.capabilitiesForActor(actor).profileEdits.map(edit => edit.id), ["fate", "resolve", "resilience", "corruption"]);
  actor.type = "npc";
  assert.deepEqual(gateway.capabilitiesForActor(actor), {});
});

test("Group Advantage uses the native setter and retains native routing", async t => {
  const { actor, gateway, calls, payload, view } = setup(t, { groupAdvantage: true });
  assert.equal(view().panels.find(tab => tab.id === "combat").sections.find(section => section.id === "group-advantage").rows[0].label, "Group Advantage");
  const result = await gateway.execute(command, payload("advantage", 12));
  assert.equal(result.submitted, true);
  assert.deepEqual(calls, [["setAdvantage", 12]]);
  assert.equal(actor.system.status.advantage.value, 4, "Mikelandia Controls does not locally forge the shared value");
});

for (const change of ["combat", "combatant", "group", "shared-value", "missing-combatant", "foreign-combatant"]) {
  test(`Group Advantage rejects stale ${change}`, async t => {
    const { actor, game, gateway, calls, payload, settings, combatant } = setup(t, { groupAdvantage: true });
    const edit = payload("advantage", 8);
    if (change === "combat") game.combat.id = "other";
    if (change === "combatant") combatant.id = "other";
    if (change === "group") actor.advantageGroup = "enemies";
    if (change === "shared-value") settings.groupAdvantageValues.players = 6;
    if (change === "missing-combatant") game.combat = null;
    if (change === "foreign-combatant") combatant.actor = createWarhammerActor();
    await assert.rejects(gateway.execute(command, edit));
    assert.deepEqual(calls, []);
  });
}

test("resource lock ignores editor revision and releases after native failure", async t => {
  const { actor, gateway, payload } = setup(t);
  const edit = payload();
  let finish;
  actor.setWounds = () => new Promise(resolve => { finish = resolve; });
  const pending = gateway.execute(command, edit);
  await assert.rejects(gateway.execute(command, { ...edit, resourceRevision: "different" }), { code: "COMMAND_BUSY" });
  finish(actor);
  await pending;
  actor.setWounds = async () => { throw new Error("native failure"); };
  await assert.rejects(gateway.execute(command, edit), { code: "COMMAND_FAILED" });
  actor.setWounds = async () => actor;
  assert.equal((await gateway.execute(command, edit)).ok, true);
});

test("native update cancellation is reported without claiming a save", async t => {
  const { actor, gateway, payload } = setup(t);
  actor.setWounds = async () => undefined;
  assert.equal((await gateway.execute(command, payload())).cancelled, true);
  actor.setWounds = async () => actor;
  assert.equal((await gateway.execute(command, payload())).ok, true);
});

test("unlinked-token saves retain the exact synthetic actor source", async t => {
  const { actor, gateway, calls, payload } = setup(t);
  actor.uuid = "Scene.scene.Token.token.Actor.hero";
  actor.isToken = true;
  installGlobals(t, { fromUuidSync: uuid => uuid === actor.uuid ? actor : null });
  assert.equal((await gateway.execute(command, payload())).actorSourceUuid, actor.uuid);
  assert.deepEqual(calls, [["setWounds", 8]]);
});

test("resource configuration and combat changes invalidate only the supporting integration", () => {
  const warhammer = resolveSystemIntegration("wfrp4e");
  const dnd = resolveSystemIntegration("dnd5e");
  for (const hook of ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"]) {
    assert.equal(sessionInvalidationForHook(hook, {}, {}, warhammer).refreshSelectedActor, true);
    assert.equal(sessionInvalidationForHook(hook, {}, {}, dnd).refreshSelectedActor, undefined);
  }
  for (const key of ["wfrp4e.capAdvantageIB", "wfrp4e.advantagemax"]) assert.equal(sessionInvalidationForHook("updateSetting", { key }, {}, warhammer).refreshSelectedActor, true);
});

for (const system of ["dnd5e", "shadowdark", "custom"]) {
  test(`${system} cannot invoke the Warhammer resource adapter`, async t => {
    const { game, gateway, calls, payload } = setup(t);
    const edit = payload();
    game.system.id = system;
    await assert.rejects(gateway.execute(command, edit), { code: "CAPABILITY_UNAVAILABLE" });
    assert.deepEqual(calls, []);
  });
}
