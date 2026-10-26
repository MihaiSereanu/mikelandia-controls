import test from "node:test";
import assert from "node:assert/strict";
import { ACTOR_COMMANDS, createFoundryCommandGateway } from "../src/foundry/command-gateway.mjs";
import { createSystemIntegrationResolver } from "../src/systems/registry.mjs";
import { createActor, createGame, installGlobals } from "./helpers/foundry.mjs";

function setup(t, { actor = createActor(), systemId = "dnd5e", generation = () => 0 } = {}) {
  const game = createGame([actor], systemId);
  installGlobals(t, { game });
  const gateway = createFoundryCommandGateway({ getGame: () => game, getConnectionGeneration: generation });
  return { game, gateway, actor };
}

test("D&D capability detection and native checks survive extraction", async t => {
  const calls = [];
  const actor = createActor({ rollAbilityCheck: async options => { calls.push(options); } });
  const { gateway } = setup(t, { actor });
  assert.deepEqual(gateway.capabilitiesForActor(actor).rollAbility, ["str"]);
  const response = await gateway.execute(ACTOR_COMMANDS.ROLL_ABILITY, { actorSourceUuid: actor.uuid, ability: "str" });
  assert.deepEqual(calls, [{ ability: "str" }]);
  assert.equal(response.ok, true);
  assert.equal(response.actorSourceUuid, actor.uuid);
});

test("D&D legacy ability and saving throw methods retain their arguments", async t => {
  const calls = [];
  const actor = createActor({
    rollAbilityTest: async key => { calls.push(["check", key]); },
    rollAbilitySave: async key => { calls.push(["save", key]); }
  });
  const { gateway } = setup(t, { actor });
  for (const name of [ACTOR_COMMANDS.ROLL_ABILITY, ACTOR_COMMANDS.ROLL_SAVE]) {
    await gateway.execute(name, { actorId: actor.id, ability: "str" });
  }
  assert.deepEqual(calls, [["check", "str"], ["save", "str"]]);
});

test("D&D hit point editing still writes the native path", async t => {
  const writes = [];
  const actor = createActor({ update: async value => { writes.push(value); }, applyDamage() {} });
  const { gateway } = setup(t, { actor });
  assert.equal(gateway.capabilitiesForActor(actor).editHitPoints, true);
  await gateway.execute(ACTOR_COMMANDS.EDIT_HIT_POINTS, { actorId: actor.id, operation: "set-hp", amount: 9 });
  assert.deepEqual(writes, [{ "system.attributes.hp.value": 9 }]);
});

for (const systemId of ["wfrp4e", "shadowdark", "custom", ""]) {
  test(`${systemId || "uninitialized system"} cannot advertise or invoke D&D actions`, async t => {
    let sideEffects = 0;
    const actor = createActor({
      update() { sideEffects++; }, applyDamage() { sideEffects++; }, rollAbilityCheck() { sideEffects++; }
    });
    const { gateway } = setup(t, { actor, systemId });
    assert.deepEqual(gateway.capabilitiesForActor(actor), {});
    for (const name of Object.values(ACTOR_COMMANDS)) {
      await assert.rejects(gateway.execute(name, { actorSourceUuid: actor.uuid }), { code: "CAPABILITY_UNAVAILABLE" });
    }
    assert.throws(() => gateway.readItemMenu({ actorSourceUuid: actor.uuid, itemId: "item" }), { code: "CAPABILITY_UNAVAILABLE" });
    assert.equal(sideEffects, 0);
  });
}

test("gateway created before setup uses the eventual D&D integration", async t => {
  const { game, actor } = setup(t, { systemId: "" });
  let checks = 0;
  actor.rollAbilityCheck = async () => { checks++; };
  const getSystemIntegration = createSystemIntegrationResolver(() => game.system.id);
  const gateway = createFoundryCommandGateway({ getGame: () => game, getSystemIntegration });
  assert.deepEqual(gateway.capabilitiesForActor(actor), {});
  game.system.id = "dnd5e";
  await gateway.execute(ACTOR_COMMANDS.ROLL_ABILITY, { actorId: actor.id, ability: "str" });
  assert.equal(checks, 1);
});

test("shared profile resource command stays unavailable without a mapped resource capability", async t => {
  const { gateway, actor } = setup(t, { systemId: "wfrp4e" });
  await assert.rejects(gateway.execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, { actorSourceUuid: actor.uuid,
    resourceId: "wounds", resourceRevision: "4e", expectedValue: 7, value: 5 }), { code: "CAPABILITY_UNAVAILABLE" });
});

test("permission is checked again after capabilities were displayed", async t => {
  let owned = true;
  let calls = 0;
  const actor = createActor({ testUserPermission: () => owned, rollAbilityCheck() { calls++; } });
  const { gateway } = setup(t, { actor });
  assert.deepEqual(gateway.capabilitiesForActor(actor).rollAbility, ["str"]);
  owned = false;
  await assert.rejects(gateway.execute(ACTOR_COMMANDS.ROLL_ABILITY, { actorId: actor.id, ability: "str" }), { code: "FORBIDDEN" });
  assert.deepEqual(gateway.capabilitiesForActor(actor).rollAbility, []);
  assert.equal(calls, 0);
});

test("stale world, user, and connection requests stop before native actions", async t => {
  let calls = 0;
  const actor = createActor({ rollAbilityCheck() { calls++; } });
  const { gateway } = setup(t, { actor, generation: () => 2 });
  for (const expected of [{ worldId: "old" }, { userId: "old" }, { connectionGeneration: 1 }]) {
    await assert.rejects(gateway.execute(ACTOR_COMMANDS.ROLL_ABILITY, { actorId: actor.id, ability: "str" }, expected), { code: "STALE_SESSION" });
  }
  assert.equal(calls, 0);
});

test("synthetic actor actions resolve the exact token rather than the world actor", async t => {
  let worldCalls = 0;
  let tokenCalls = 0;
  const actor = createActor({ rollAbilityCheck() { worldCalls++; } });
  const { gateway } = setup(t, { actor });
  let token = createActor({
    uuid: "Scene.scene.Token.token.Actor.hero", isToken: true,
    rollAbilityCheck: async () => { tokenCalls++; }
  });
  installGlobals(t, { fromUuidSync: uuid => uuid === token?.uuid ? token : null });
  const payload = { actorSourceUuid: token.uuid, ability: "str" };
  await gateway.execute(ACTOR_COMMANDS.ROLL_ABILITY, payload);
  token = null;
  await assert.rejects(gateway.execute(ACTOR_COMMANDS.ROLL_ABILITY, payload), { code: "TARGET_MISSING" });
  assert.equal(tokenCalls, 1);
  assert.equal(worldCalls, 0);
});

test("group and vehicle command restrictions remain enforced for direct calls", async t => {
  let calls = 0;
  const actor = createActor({ type: "group", rollAbilityCheck() { calls++; } });
  const { gateway } = setup(t, { actor });
  assert.deepEqual(gateway.capabilitiesForActor(actor).rollAbility, []);
  await assert.rejects(gateway.execute(ACTOR_COMMANDS.ROLL_ABILITY, { actorId: actor.id, ability: "str" }), { code: "CAPABILITY_UNAVAILABLE" });
  actor.type = "vehicle";
  actor.rollSkill = () => { calls++; };
  await assert.rejects(gateway.execute(ACTOR_COMMANDS.ROLL_SKILL, { actorId: actor.id, skill: "ath" }), { code: "CAPABILITY_UNAVAILABLE" });
  assert.equal(calls, 0);
});

test("duplicate requests are blocked and cancellation releases the command lock", async t => {
  let finish;
  const actor = createActor({ rollAbilityCheck: () => new Promise(resolve => { finish = resolve; }) });
  const { gateway } = setup(t, { actor });
  const payload = { actorId: actor.id, ability: "str" };
  const pending = gateway.execute(ACTOR_COMMANDS.ROLL_ABILITY, payload);
  await assert.rejects(gateway.execute(ACTOR_COMMANDS.ROLL_ABILITY, payload), { code: "COMMAND_BUSY" });
  finish(null);
  await pending;
  actor.rollAbilityCheck = async () => null;
  assert.equal((await gateway.execute(ACTOR_COMMANDS.ROLL_ABILITY, payload)).ok, true);
});

test("connection changes during a native workflow reject the stale result", async t => {
  let generation = 0;
  const actor = createActor({ rollAbilityCheck: async () => { generation++; } });
  const { gateway } = setup(t, { actor, generation: () => generation });
  await assert.rejects(gateway.execute(ACTOR_COMMANDS.ROLL_ABILITY, { actorId: actor.id, ability: "str" }, { connectionGeneration: 0 }), { code: "STALE_SESSION" });
});

test("unregistered and prototype method names cannot be dispatched", async t => {
  const { gateway, actor } = setup(t);
  for (const name of ["actor.update", "constructor", "toString", "__proto__"]) {
    await assert.rejects(gateway.execute(name, { actorId: actor.id }), { code: "UNKNOWN_COMMAND" });
  }
});
