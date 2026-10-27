import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/command-gateway.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { collection, createActor, createGame, installGlobals, createHooks } from "./helpers/foundry.mjs";
import { createWarhammerActor, createWarhammerGame, addWarhammerMagic } from "./helpers/warhammer.mjs";

const command = ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION;
const payload = (id = "characteristic:ws", revision = "4e") => ({ actorSourceUuid: "Actor.hero", actionId: id, actionRevision: revision });
function setup(t, { use5e = false } = {}) {
  const calls = [];
  const actor = createWarhammerActor({
    setupCharacteristic: async key => { calls.push(["characteristic", key]); return { actor, roll: async () => { calls.push(["roll"]); } }; },
    setupSkill: async skill => { calls.push(["skill", skill]); return { actor, roll: async () => { calls.push(["roll"]); } }; }
  });
  const game = createWarhammerGame([actor], { use5e });
  installGlobals(t, { game });
  const gateway = createFoundryCommandGateway({ getGame: () => game, getHooks: () => { throw new Error("Warhammer must not invoke D&D hook orchestration"); } });
  return { actor, game, gateway, calls };
}

for (const use5e of [false, true]) {
  test(`${use5e ? "5e" : "4e"} Characteristic tests run native setup and roll once`, async t => {
    const { actor, game, gateway, calls } = setup(t, { use5e });
    Object.defineProperty(game, "messages", { get() { throw new Error("native results must not be parsed by VE"); } });
    const actions = gateway.capabilitiesForActor(actor).profileActions;
    assert.equal(actions.find(action => action.id === "characteristic:ws").label, "Weapon Skill");
    const outcome = await gateway.execute(command, payload("characteristic:ws", use5e ? "5e" : "4e"));
    assert.deepEqual(calls, [["characteristic", "ws"], ["roll"]]);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.actionSession, undefined);
    assert.equal(outcome.rollResult, undefined);
  });
}

test("Skill tests pass the exact owned embedded Item rather than its name", async t => {
  const { actor, gateway, calls } = setup(t);
  const item = actor.items.find(item => item.id === "athletics");
  await gateway.execute(command, payload("skill:athletics"));
  assert.equal(calls[0][0], "skill");
  assert.equal(calls[0][1], item);
  assert.deepEqual(calls[1], ["roll"]);
});

test("profile buttons are attached only for explicitly available native actions", t => {
  const { actor, game, gateway } = setup(t);
  const integration = resolveSystemIntegration("wfrp4e");
  const record = integration.createActorViewRecord(actor, game.user, gateway.capabilitiesForActor);
  const rows = record.panels.flatMap(tab => tab.sections.flatMap(section => section.rows));
  assert.deepEqual(rows.find(row => row.id === "ws").action, { id: "characteristic:ws", revision: "4e" });
  assert.equal(rows.find(row => row.id === "wounds").action, undefined);
  assert.equal(rows.find(row => row.id === "athletics").action.id, "skill:athletics");
  delete actor.setupCharacteristic;
  const refreshed = integration.createActorViewRecord(actor, game.user, gateway.capabilitiesForActor);
  assert.equal(refreshed.panels[0].sections[0].rows[0].action, undefined);
});

test("unmapped types and hidden/untrained skills never advertise actions", t => {
  const { actor, gateway } = setup(t);
  const ids = gateway.capabilitiesForActor(actor).profileActions.map(action => action.id);
  assert.equal(ids.includes("skill:hidden"), false);
  assert.equal(ids.includes("skill:parent"), false);
  assert.equal(ids.includes("skill:weapon"), false);
  for (const type of ["npc", "creature", "vehicle"]) {
    actor.type = type;
    assert.deepEqual(gateway.capabilitiesForActor(actor), {});
  }
});

test("native cancellation releases the command lock without rolling", async t => {
  const { actor, gateway, calls } = setup(t);
  for (const result of [undefined, null, false]) {
    actor.setupCharacteristic = async () => result;
    const outcome = await gateway.execute(command, payload());
    assert.equal(outcome.cancelled, true);
  }
  assert.deepEqual(calls, []);
});

test("duplicate taps cannot create a second native dialog", async t => {
  const { actor, gateway } = setup(t);
  let finish;
  let opens = 0;
  actor.setupCharacteristic = () => { opens++; return new Promise(resolve => { finish = resolve; }); };
  const pending = gateway.execute(command, payload());
  await assert.rejects(gateway.execute(command, payload()), { code: "COMMAND_BUSY" });
  finish(undefined);
  await pending;
  assert.equal(opens, 1);
});

test("expired edition descriptors and unexpected payload options are rejected", async t => {
  const { gateway, calls } = setup(t);
  await assert.rejects(gateway.execute(command, payload("characteristic:ws", "5e")), { code: "STALE_STATE" });
  for (const extra of [{ method: "update" }, { path: "system.status.wounds.value" }, { skipDialog: true }, { options: {} }]) {
    await assert.rejects(gateway.execute(command, { ...payload(), ...extra }), { code: "INVALID_INPUT" });
  }
  for (const id of ["characteristic:constructor", "skill:hidden", "skill:parent", "weapon:weapon"]) {
    await assert.rejects(gateway.execute(command, payload(id)), { code: "CAPABILITY_UNAVAILABLE" });
  }
  assert.deepEqual(calls, []);
});

for (const change of ["permission", "edition", "skill", "item-owner", "visibility", "actor", "lifecycle", "world", "connection"]) {
  test(`${change} changes during setup prevent the subsequent native roll`, async t => {
    const { actor, game } = setup(t);
    let finish;
    let rolls = 0;
    let active = true;
    let generation = 0;
    actor.setupSkill = () => new Promise(resolve => { finish = resolve; });
    const gateway = createFoundryCommandGateway({ getConnectionGeneration: () => generation });
    const pending = gateway.execute(command, payload("skill:athletics"), { isCurrent: () => active });
    const skill = actor.items.find(item => item.id === "athletics");
    if (change === "permission") actor.testUserPermission = () => false;
    if (change === "edition") game.settings.get = (_module, key) => key === "editionSettings" ? { use5e: true } : false;
    if (change === "skill") actor.items.splice(actor.items.indexOf(skill), 1);
    if (change === "item-owner") skill.isOwner = false;
    if (change === "visibility") skill.visible = false;
    if (change === "actor") game.actors = collection([createWarhammerActor()]);
    if (change === "lifecycle") active = false;
    if (change === "world") game.world.id = "changed";
    if (change === "connection") generation++;
    finish({ actor, roll: async () => { rolls++; } });
    await assert.rejects(pending, error => ["FORBIDDEN", "STALE_SESSION", "STALE_STATE", "TARGET_MISSING", "CAPABILITY_UNAVAILABLE"].includes(error.code));
    assert.equal(rolls, 0);
  });
}

test("unlinked token actions use the synthetic actor and its skill item", async t => {
  const { actor, gateway, calls } = setup(t);
  actor.uuid = "Scene.scene.Token.token.Actor.hero";
  actor.isToken = true;
  installGlobals(t, { fromUuidSync: uuid => uuid === actor.uuid ? actor : null });
  const outcome = await gateway.execute(command, { ...payload("skill:athletics"), actorSourceUuid: actor.uuid });
  assert.equal(calls[0][1].parent, actor);
  assert.equal(outcome.actorSourceUuid, actor.uuid);
});

test("native errors and malformed test returns fail cleanly and release locks", async t => {
  const { actor, gateway, calls } = setup(t);
  actor.setupCharacteristic = async () => { throw new Error("native failure"); };
  await assert.rejects(gateway.execute(command, payload()), { code: "COMMAND_FAILED" });
  actor.setupCharacteristic = async () => ({});
  await assert.rejects(gateway.execute(command, payload()), { code: "CAPABILITY_UNAVAILABLE" });
  actor.setupCharacteristic = async () => ({ roll: async () => { calls.push(["roll"]); } });
  assert.equal((await gateway.execute(command, payload())).ok, true);
});

test("D&D native item use remains routed through the preserved engine", async t => {
  let uses = 0;
  const actor = createActor();
  actor.items = [{ id: "weapon", type: "weapon", parent: actor, use: async () => { uses++; } }];
  installGlobals(t, { game: createGame([actor]) });
  const gateway = createFoundryCommandGateway();
  assert.equal((await gateway.execute(ACTOR_COMMANDS.USE_ITEM, { actorSourceUuid: actor.uuid, itemId: "weapon" })).ok, true);
  assert.equal(uses, 1);
  await assert.rejects(gateway.execute(command, payload()), { code: "CAPABILITY_UNAVAILABLE" });
});

// Model the library contract: an unsubmitted close settles only with resolveClose.
for (const use5e of [false, true]) for (const [id, method] of [
  ["characteristic:ws", "setupCharacteristic"], ["skill:athletics", "setupSkill"],
  ["weapon:sword", "setupWeapon"], ["spell:petty", "setupCast"],
  ["spell:lore", "setupCast"], ...(!use5e ? [["spell:lore", "setupChannell"]] : [["wind:aqshy", "setupChannelling"]])
]) test(`${use5e ? "5e" : "4e"} ${method} ${id} closes and immediately retries`, { timeout: 2000 }, async t => {
  const { actor, gateway } = setup(t, { use5e });
  addWarhammerMagic(actor, use5e);
  const hooks = createHooks();
  class Dialog {
    constructor(actor, options, resolve) { Object.assign(this, { actor, options, resolve }); }
    close() { if (this.options.resolveClose) this.resolve(); }
    submit() { this.resolve({ actor, roll: async () => { rolls++; } }); this.close(); }
  }
  installGlobals(t, { Hooks: hooks, warhammer: { apps: { WarhammerRollDialogV2: Dialog } } });
  let dialog, rolls = 0;
  const native = (target, context, options = {}) => new Promise(resolve => {
    dialog = new Dialog(actor, options, resolve);
    // A scoped listener must not change another actor or unrelated application.
    const other = new Dialog({}, {}, () => {}), unrelated = { actor, options: {} };
    hooks.emit("renderApplicationV2", other); hooks.emit("renderApplicationV2", unrelated);
    assert.equal(other.options.resolveClose, undefined); assert.equal(unrelated.options.resolveClose, undefined);
    hooks.emit("renderApplicationV2", dialog);
  });
  actor.setupCast = native;
  actor.setupChannell = native;
  actor[method] = native;
  actor.sheet = { actor, castOrChannelPrompt: spell => actor[method](spell) };
  const request = payload(id, use5e ? "5e" : "4e");
  const pending = gateway.execute(command, request);
  await assert.rejects(gateway.execute(command, request), { code: "COMMAND_BUSY" });
  assert.equal(dialog.options.resolveClose, true);
  dialog.close();
  assert.equal((await pending).cancelled, true);
  assert.equal(rolls, 0);
  assert.equal(hooks.count("renderApplicationV2"), 0);
  const retry = gateway.execute(command, request);
  dialog.submit();
  assert.equal((await retry).ok, true);
  assert.equal(rolls, 1);
  assert.equal(hooks.count("renderApplicationV2"), 0);
});

test("4e chooser failure removes its cancellation listener", async t => {
  const { actor, gateway } = setup(t);
  addWarhammerMagic(actor, false);
  actor.setupCast = async () => {};
  actor.setupChannell = async () => {};
  actor.sheet = { actor, castOrChannelPrompt() { throw new Error("choice failed"); } };
  const hooks = createHooks();
  installGlobals(t, { Hooks: hooks, warhammer: { apps: { WarhammerRollDialogV2: class {} } } });
  await assert.rejects(gateway.execute(command, payload("spell:lore")), { code: "COMMAND_FAILED" });
  assert.equal(hooks.count("renderApplicationV2"), 0);
});
