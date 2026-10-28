import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/command-gateway.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { installGlobals, collection } from "./helpers/foundry.mjs";
import { createWarhammerActor, createWarhammerGame, addWarhammerMagic } from "./helpers/warhammer.mjs";

const command = ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION;
const request = (use5e, id = "spell:lore") => ({ actorSourceUuid: "Actor.hero", actionId: id, actionRevision: use5e ? "5e" : "4e" });


function setup(t, use5e) {
  const actor = createWarhammerActor();
  addWarhammerMagic(actor, use5e);
  const calls = [];
  const native = kind => async (...args) => { calls.push([kind, ...args]); return { actor, ...(typeof args[0] === "object" ? { item: args[0] } : { context: { wind: args[0] } }),
    roll: async () => { calls.push(["roll"]); } }; };
  actor.setupCast = native("cast");
  actor.setupChannell = native("channel-spell");
  actor.setupChannelling = native("channel-wind");
  let choice = "cast";
  actor.sheet = { actor, castOrChannelPrompt(spell) { calls.push(["prompt", spell]); return spell.system.lore.value == "petty" || choice === "cast"
    ? actor.setupCast(spell) : choice === "channel" ? actor.setupChannell(spell) : undefined; } };
  const game = createWarhammerGame([actor], { use5e });
  installGlobals(t, { game });
  const gateway = createFoundryCommandGateway({ getHooks: () => { throw new Error("D&D orchestration used"); } });
  const view = () => resolveSystemIntegration("wfrp4e").createActorViewRecord(actor, game.user, gateway.capabilitiesForActor);
  return { actor, game, gateway, calls, view, choose: value => { choice = value; } };
}

for (const use5e of [false, true]) {
  test(`${use5e ? "5e" : "4e"} spells use native edition workflow and exactly one native roll`, async t => {
    const { actor, game, gateway, calls } = setup(t, use5e);
    Object.defineProperty(game, "messages", { get() { throw new Error("Mikelandia Controls must not parse magic results"); } });
    actor.update = () => { throw new Error("Mikelandia Controls must not write channelled power"); };
    for (const item of actor.items) item.update = () => { throw new Error("Mikelandia Controls must not consume ingredients or write SL"); };
    for (const id of ["petty", "lore"]) {
      calls.length = 0;
      const outcome = await gateway.execute(command, request(use5e, `spell:${id}`));
      const spell = actor.items.find(item => item.id === id);
      assert.deepEqual(calls, [...(!use5e ? [["prompt", spell]] : []), ["cast", spell, ...(use5e ? [{}, { resolveClose: true }] : [])], ["roll"]]);
      assert.equal(outcome.ok, true);
      assert.equal(outcome.rollResult, undefined);
    }
  });

  test(`${use5e ? "5e" : "4e"} Magic follows native grouping, labels, CN, and Wind visibility`, t => {
    const { view } = setup(t, use5e);
    const magic = view().panels.find(tab => tab.id === "magic");
    assert.equal(magic.label, "Magic");
    assert.equal(magic.sections.find(section => section.id === "petty-spells").rows[0].label, "Light");
    assert.equal(magic.sections.find(section => section.id === "petty-spells").rows[0].value, undefined);
    const lore = magic.sections.find(section => section.id === "lore-spells").rows[0];
    assert.equal(lore.value, 4);
    assert.equal(lore.valueLabel, "CN");
    assert.equal(magic.sections.some(section => section.id === "channelling"), use5e);
    if (use5e) assert.equal(magic.sections[0].rows[0].action.id, "wind:aqshy");
  });

  test(`${use5e ? "5e" : "4e"} hidden, unowned, malformed, foreign, and missing spells cannot expose names or actions`, async t => {
    const { actor, gateway, view } = setup(t, use5e);
    const spell = actor.items.find(item => item.id === "lore");
    for (const [id, overrides] of [["hidden", { visible: false }], ["unowned", { isOwner: false }], ["foreign", { parent: {} }], ["malformed", { system: {} }]]) {
      const item = { ...spell, id, ...overrides };
      Object.defineProperty(item, "name", { get() { throw new Error("forbidden spell name read"); } });
      actor.items.push(item);
      await assert.rejects(gateway.execute(command, request(use5e, `spell:${id}`)), { code: "CAPABILITY_UNAVAILABLE" });
    }
    assert.equal(view().panels.find(tab => tab.id === "magic").sections.find(section => section.id === "lore-spells").rows.length, 1);
    await assert.rejects(gateway.execute(command, request(use5e, "spell:missing")), { code: "CAPABILITY_UNAVAILABLE" });
  });

  for (const change of ["permission", "edition", "removed", "replaced", "hidden", "unowned", "lore", "actor", "lifecycle", "world", "connection", "method"]) {
    test(`${use5e ? "5e" : "4e"} pending casting rejects ${change} changes`, async t => {
      const { actor, game } = setup(t, use5e);
      let finish, rolls = 0, generation = 0, active = true;
      actor.setupCast = () => new Promise(resolve => { finish = resolve; });
      const gateway = createFoundryCommandGateway({ getConnectionGeneration: () => generation });
      const pending = gateway.execute(command, request(use5e), { isCurrent: () => active });
      const spell = actor.items.find(item => item.id === "lore");
      if (change === "permission") actor.testUserPermission = () => false;
      if (change === "edition") game.settings.get = () => ({ use5e: !use5e });
      if (change === "removed") actor.items.splice(actor.items.indexOf(spell), 1);
      if (change === "replaced") actor.items.splice(actor.items.indexOf(spell), 1, { ...spell });
      if (change === "hidden") spell.visible = false;
      if (change === "unowned") spell.isOwner = false;
      if (change === "lore") spell.system.lore.value = ["death"];
      if (change === "actor") game.actors = collection([createWarhammerActor()]);
      if (change === "lifecycle") active = false;
      if (change === "world") game.world.id = "other";
      if (change === "connection") generation++;
      if (change === "method") actor.setupCast = undefined;
      finish({ actor, item: spell, roll: async () => { rolls++; } });
      await assert.rejects(pending);
      assert.equal(rolls, 0);
    });
  }

  test(`${use5e ? "5e" : "4e"} cancellation, duplicate requests, bad options, and exact token sources`, async t => {
    const { actor, gateway, calls } = setup(t, use5e);
    for (const extra of [{ skipDialog: true }, { options: {} }, { path: "system.status.channelling.value" }]) {
      await assert.rejects(gateway.execute(command, { ...request(use5e), ...extra }), { code: "INVALID_INPUT" });
    }
    let finish;
    actor.setupCast = () => new Promise(resolve => { finish = resolve; });
    const pending = gateway.execute(command, request(use5e));
    await assert.rejects(gateway.execute(command, request(use5e)), { code: "COMMAND_BUSY" });
    finish(undefined);
    assert.equal((await pending).cancelled, true);
    actor.setupCast = async item => ({ actor, item: { id: item.id, type: "spell", parent: actor }, roll: async () => calls.push(["roll"]) });
    actor.uuid = "Scene.scene.Token.token.Actor.hero";
    actor.isToken = true;
    installGlobals(t, { fromUuidSync: uuid => uuid === actor.uuid ? actor : null });
    assert.equal((await gateway.execute(command, { ...request(use5e), actorSourceUuid: actor.uuid })).actorSourceUuid, actor.uuid);
    assert.deepEqual(calls.at(-1), ["roll"]);
  });
}

test("4e native Cast/Channel choice owns spell channelling and cancellation", async t => {
  const { actor, gateway, calls, choose } = setup(t, false);
  choose("channel");
  await gateway.execute(command, request(false));
  assert.deepEqual(calls.map(call => call[0]), ["prompt", "channel-spell", "roll"]);
  assert.equal(calls[1][1], actor.items.find(item => item.id === "lore"));
  calls.length = 0;
  choose("cancel");
  assert.equal((await gateway.execute(command, request(false))).cancelled, true);
  assert.deepEqual(calls.map(call => call[0]), ["prompt"]);
});

test("4e native 10.1.2 lore arrays project spells; legacy string assumptions cannot gate them", t => {
  const { actor, gateway, view } = setup(t, false);
  const spell = actor.items.find(item => item.id === "lore");
  assert.deepEqual(spell.system.lore.value, ["fire"]);
  assert.equal(gateway.capabilitiesForActor(actor).profileActions.some(action => action.id === "spell:lore"), true);
  assert.equal(view().panels.find(tab => tab.id === "magic").sections.find(section => section.id === "lore-spells").rows[0].id, "lore");
  spell.system.lore.value = "fire";
  assert.equal(gateway.capabilitiesForActor(actor).profileActions.some(action => action.id === "spell:lore"), false);
});

test("5e channels the Wind key with no spell argument or Mikelandia Controls resource writes", async t => {
  const { actor, gateway, calls } = setup(t, true);
  const before = actor.system.status.channelling.value;
  await gateway.execute(command, request(true, "wind:aqshy"));
  assert.deepEqual(calls, [["channel-wind", "aqshy", {}, { resolveClose: true }], ["roll"]]);
  assert.equal(actor.system.status.channelling.value, before);
  await assert.rejects(gateway.execute(command, request(true, "wind:constructor")), { code: "CAPABILITY_UNAVAILABLE" });
});

test("magic capabilities require the edition's native entry points and valid prepared Wind data", async t => {
  const { actor, gateway } = setup(t, false);
  delete actor.sheet.castOrChannelPrompt;
  assert.deepEqual(gateway.capabilitiesForActor(actor), {});
  await assert.rejects(gateway.execute(command, request(false)), { code: "CAPABILITY_UNAVAILABLE" });
});

test("5e hidden spells cannot leak Winds through the native prepared list", t => {
  const { actor, gateway, view } = setup(t, true);
  actor.items.find(item => item.id === "lore").visible = false;
  assert.equal(gateway.capabilitiesForActor(actor).profileActions.some(action => action.id.startsWith("wind:")), false);
  assert.equal(view().panels.find(tab => tab.id === "magic").sections.some(section => section.id === "channelling"), false);
  actor.items.find(item => item.id === "lore").visible = true;
  delete actor.system.status.channelling.getWinds;
  assert.equal(gateway.capabilitiesForActor(actor).profileActions.some(action => action.id.startsWith("wind:")), false);
});

for (const use5e of [false, true]) {
  test(`${use5e ? "5e" : "4e"} malformed native spell returns cannot roll and release locks`, async t => {
    const { actor, gateway } = setup(t, use5e);
    let rolls = 0;
    for (const item of [{ id: "other", type: "spell", parent: actor }, { id: "lore", type: "skill", parent: actor }, { id: "lore", type: "spell", parent: {} }]) {
      actor.setupCast = async () => ({ actor, item, roll: async () => { rolls++; } });
      await assert.rejects(gateway.execute(command, request(use5e)), { code: "CAPABILITY_UNAVAILABLE" });
    }
    actor.setupCast = async () => ({});
    await assert.rejects(gateway.execute(command, request(use5e)), { code: "CAPABILITY_UNAVAILABLE" });
    actor.setupCast = async () => { throw new Error("native setup failed"); };
    await assert.rejects(gateway.execute(command, request(use5e)), { code: "COMMAND_FAILED" });
    actor.setupCast = async () => null;
    assert.equal((await gateway.execute(command, request(use5e))).cancelled, true);
    assert.equal(rolls, 0);
  });
}

for (const change of ["hidden-spell", "replaced-spell", "wind-removed", "wrong-test-wind"]) {
  test(`5e pending Wind action rejects ${change}`, async t => {
    const { actor, gateway } = setup(t, true);
    let finish, rolls = 0;
    actor.setupChannelling = () => new Promise(resolve => { finish = resolve; });
    const pending = gateway.execute(command, request(true, "wind:aqshy"));
    const spell = actor.items.find(item => item.id === "lore");
    if (change === "hidden-spell") spell.visible = false;
    if (change === "replaced-spell") actor.items.splice(actor.items.indexOf(spell), 1, { ...spell });
    if (change === "wind-removed") actor.system.status.channelling.winds = {};
    finish({ actor, context: { wind: change === "wrong-test-wind" ? "dhar" : "aqshy" }, roll: async () => { rolls++; } });
    await assert.rejects(pending);
    assert.equal(rolls, 0);
  });
}
