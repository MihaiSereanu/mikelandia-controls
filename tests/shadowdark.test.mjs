import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/command-gateway.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { installGlobals, collection } from "./helpers/foundry.mjs";
import { createShadowdarkFixture } from "./helpers/shadowdark.mjs";

const action = ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, edit = ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE;
function setup(t, options) {
  const f = createShadowdarkFixture(options);
  installGlobals(t, { game: f.game, Hooks: f.hooks });
  f.gateway = createFoundryCommandGateway();
  f.request = id => ({ actorSourceUuid: f.actor.uuid, actionId: id, actionRevision: f.gateway.capabilitiesForActor(f.actor).profileActions.find(a => a.id === id)?.revision });
  f.edit = (id, value) => {
    const e = f.gateway.capabilitiesForActor(f.actor).profileEdits.find(e => e.id === id);
    return { actorSourceUuid: f.actor.uuid, resourceId: id, resourceRevision: e?.revision, expectedValue: e?.value, value };
  };
  f.view = () => resolveSystemIntegration("shadowdark").createActorViewRecord(f.actor, f.game.user, f.gateway.capabilitiesForActor);
  return f;
}
for (const pulp of [false, true]) {
  test(`${pulp ? "Pulp" : "normal"} PC panels retain Shadowdark labels, prepared Stats, Luck, inventory and spells`, t => {
    const f = setup(t, { pulp });
    const view = f.view(), rows = view.panels.flatMap(t => t.sections.flatMap(s => s.rows));
    assert.deepEqual(view.panels.map(t => t.label), ["Abilities", "Spells", "Inventory"]);
    assert.equal(rows.find(r => r.id === "str").value, "14 (+2)");
    assert.equal(rows.find(r => r.id === "hp").max, 12);
    assert.equal(rows.find(r => r.id === "luck").value, pulp ? 2 : true);
    assert.equal(rows.find(r => r.id === "luck").edit.kind, pulp ? "integer" : "boolean");
    assert.equal(rows.find(r => r.id === "ac").edit, undefined);
    assert.equal(rows.find(r => r.id === "spell").valueLabel, "Tier");
    assert.equal(rows.find(r => r.id === "lost").action, undefined);
    assert.equal(rows.find(r => r.id === "torch" && r.format === "boolean").action.icon, "fa-lightbulb");
    assert.equal(JSON.stringify(view).includes("Secret Relic"), false);
  });
}
for (const id of ["stat:str", "attack-melee:sword", "attack-ranged:dagger", "spell:spell"]) {
  test(`${id} uses the native PC model once and cleans its scoped hook`, async t => {
    const f = setup(t);
    const result = await f.gateway.execute(action, f.request(id));
    assert.equal(result.ok, true); assert.equal(result.cancelled, false);
    assert.equal(f.rolls.length, 1); assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].target, id.startsWith("stat") ? "str" : f.actor.items.find(i => i.id === id.split(":")[1]).uuid);
    if (id.startsWith("attack")) assert.equal(f.calls[0].config.attack.type, id.startsWith("attack-ranged") ? "ranged" : "melee");
    assert.equal(f.hooks.count("SD-Stat-Check") + f.hooks.count("SD-Player-Attack") + f.hooks.count("SD-Player-Spell"), 0);
    assert.deepEqual(f.writes, []);
  });
}
test("failed native spell rolls keep native spell-loss behavior without a second roll", async t => {
  const f = setup(t); f.success = false;
  const result = await f.gateway.execute(action, f.request("spell:spell"));
  assert.equal(result.cancelled, false);
  assert.equal(f.actor.items.find(i => i.id === "spell").system.lost, true);
  assert.equal(f.rolls.length, 1);
  assert.equal(f.gateway.capabilitiesForActor(f.actor).profileActions.some(a => a.id === "spell:spell"), false);
});
test("native cancellation and errors clean hooks and release command locks", async t => {
  const f = setup(t); const request = f.request("stat:str");
  f.prompt = async () => false;
  assert.equal((await f.gateway.execute(action, request)).cancelled, true);
  assert.equal(f.rolls.length, 0);
  f.prompt = async () => true; f.error = true;
  await assert.rejects(f.gateway.execute(action, request), { code: "COMMAND_FAILED" });
  assert.equal(f.hooks.count("SD-Stat-Check"), 0);
  f.error = false;
  assert.equal((await f.gateway.execute(action, request)).ok, true);
});
for (const change of ["permission", "actor", "model", "item", "visibility", "item-owner", "equipped", "handedness", "mode", "settings", "selection", "connection", "world", "config-target", "class"]) {
  test(`native post-dialog checkpoint rejects changed ${change}`, async t => {
    const f = setup(t); const request = f.request("attack-melee:sword");
    const weapon = f.actor.items.get("sword"); let finish, generation = 0, active = true;
    f.prompt = () => new Promise(resolve => { finish = resolve; });
    const gateway = createFoundryCommandGateway({ getConnectionGeneration: () => generation });
    const pending = gateway.execute(action, request, { isCurrent: () => active });
    if (change === "permission") f.actor.testUserPermission = () => false;
    if (change === "actor") f.game.actors = collection([{ ...f.actor }]);
    if (change === "model") f.actor.system = { ...f.actor.system };
    if (change === "item") f.actor.items.splice(f.actor.items.indexOf(weapon), 1, { ...weapon });
    if (change === "visibility") weapon.visible = false;
    if (change === "item-owner") weapon.isOwner = false;
    if (change === "equipped") weapon.system.equipped = false;
    if (change === "handedness") weapon.system.handedness = "2h";
    if (change === "mode") weapon.system.type = "ranged";
    if (change === "settings") f.settings.usePulpMode = true;
    if (change === "selection") active = false;
    if (change === "connection") generation++;
    if (change === "world") f.game.world.id = "other";
    if (change === "config-target") f.calls[0].config.itemUuid = "Actor.other.Item.sword";
    if (change === "class") f.actor.system.class = "Item.otherClass";
    finish(true);
    await assert.rejects(pending);
    assert.equal(f.rolls.length, 0);
    assert.equal(f.hooks.count("SD-Player-Attack"), 0);
  });
}
test("the scoped hook leaves other native dialogs untouched and blocks duplicate mobile requests", async t => {
  const f = setup(t); const request = f.request("stat:str"); let finish;
  f.prompt = () => new Promise(resolve => { finish = resolve; });
  const pending = f.gateway.execute(action, request);
  assert.equal(f.hooks.call("SD-Stat-Check", { actorUuid: "Actor.other" }), true);
  await assert.rejects(f.gateway.execute(action, request), { code: "COMMAND_BUSY" });
  finish(true); await pending;
});
test("hidden, foreign, stashed and unidentified items are filtered before their names", t => {
  const f = setup(t);
  for (const extra of [{ visible: false }, { isOwner: false }, { parent: {} }, { system: { isPhysical: true, isIdentified: false } }, { system: { isPhysical: true, isIdentified: true, stashed: true } }]) {
    const item = { ...f.actor.items.get("sword"), id: `hidden${f.actor.items.length}`, ...extra };
    item.uuid = `${f.actor.uuid}.Item.${item.id}`;
    Object.defineProperty(item, "name", { get() { throw new Error("forbidden name read"); } });
    f.actor.items.push(item);
  }
  assert.equal(f.view().panels[0].sections.find(s => s.id === "melee-attacks").rows.length, 2);
});
test("NPCs, other types, unknown settings and missing data keep native access", t => {
  const f = setup(t);
  for (const type of ["NPC", "Light", "character", "vehicle"]) {
    f.actor.type = type;
    assert.equal(f.view().presentation, "native");
    assert.deepEqual(f.gateway.capabilitiesForActor(f.actor), {});
  }
  f.actor.type = "Player"; f.settings.usePulpMode = undefined;
  f.game.settings.get = () => undefined;
  assert.equal(f.view().presentation, "native");
});
test("request options and unsupported actions cannot bypass native dialogs", async t => {
  const f = setup(t);
  for (const extra of [{ skipPrompt: true }, { config: {} }, { path: "system.luck.available" }, { method: "update" }]) await assert.rejects(f.gateway.execute(action, { ...f.request("stat:str"), ...extra }), { code: "INVALID_INPUT" });
  for (const id of ["stat:constructor", "spell:lost", "attack-ranged:sword", "light:secret"]) await assert.rejects(f.gateway.execute(action, { ...f.request("stat:str"), actionId: id }), { code: "CAPABILITY_UNAVAILABLE" });
  assert.equal(f.calls.length, 0);
});
for (const pulp of [false, true]) {
  test(`${pulp ? "Pulp" : "normal"} HP and Luck edits use native one-field updates`, async t => {
    const f = setup(t, { pulp });
    await f.gateway.execute(edit, f.edit("hp", 0));
    await f.gateway.execute(edit, f.edit("luck", pulp ? 5 : false));
    assert.deepEqual(f.writes, [[{ "system.attributes.hp.value": 0 }], [{ [pulp ? "system.luck.remaining" : "system.luck.available"]: pulp ? 5 : false }]]);
    for (const value of ["1", -1, 1.5, 13, NaN]) await assert.rejects(f.gateway.execute(edit, f.edit("hp", value)), { code: "INVALID_INPUT" });
    const stale = f.edit("luck", pulp ? 2 : true); f.settings.usePulpMode = !pulp;
    await assert.rejects(f.gateway.execute(edit, stale), { code: "STALE_STATE" });
  });
}
test("light controls call the native sheet/tracker and invalidate old toggle descriptors", async t => {
  const f = setup(t); const request = f.request("light:torch");
  await f.gateway.execute(action, request);
  assert.equal(f.lights.length, 1); assert.equal(f.lights[0][0], f.actor);
  assert.equal(f.actor.items.get("torch").system.light.active, true);
  await assert.rejects(f.gateway.execute(action, request), { code: "STALE_STATE" });
  assert.equal(f.writes.length, 0); assert.equal(f.rolls.length, 0);
  f.game.user.character = null;
  assert.equal(f.gateway.capabilitiesForActor(f.actor).profileActions.some(a => a.id.startsWith("light:")), false);
});
test("synthetic PC rolls preserve exact source UUIDs while light controls remain native-sheet only", async t => {
  const f = setup(t);
  f.actor.uuid = "Scene.scene.Token.token.Actor.hero"; f.actor.isToken = true;
  for (const item of f.actor.items) item.uuid = `${f.actor.uuid}.Item.${item.id}`;
  installGlobals(t, { fromUuidSync: uuid => uuid === f.actor.uuid ? f.actor : null });
  const result = await f.gateway.execute(action, f.request("attack-melee:sword"));
  assert.equal(result.actorSourceUuid, f.actor.uuid);
  assert.equal(f.calls[0].target, `${f.actor.uuid}.Item.sword`);
  assert.equal(f.gateway.capabilitiesForActor(f.actor).profileActions.some(a => a.id.startsWith("light:")), false);
});

for (const change of ["lost", "caster", "identity", "tier", "visibility"]) {
  test(`spell dialog rejects changed ${change} before native loss/effects`, async t => {
    const f = setup(t); let finish;
    const spell = f.actor.items.get("spell"); f.prompt = () => new Promise(resolve => { finish = resolve; });
    const pending = f.gateway.execute(action, f.request("spell:spell"));
    if (change === "lost") spell.system.lost = true;
    if (change === "caster") f.actor.system.isSpellCaster = false;
    if (change === "identity") f.actor.items.splice(f.actor.items.indexOf(spell), 1, { ...spell });
    if (change === "tier") spell.system.tier = 2;
    if (change === "visibility") spell.visible = false;
    finish(true); await assert.rejects(pending);
    assert.equal(f.rolls.length, 0); assert.equal(f.hooks.count("SD-Player-Spell"), 0);
  });
}
test("native hook vetoes remain native and do not trigger a second roll", async t => {
  const f = setup(t);
  const veto = () => false; f.hooks.on("SD-Stat-Check", veto);
  assert.equal((await f.gateway.execute(action, f.request("stat:str"))).cancelled, true);
  assert.equal(f.rolls.length, 0); assert.equal(f.hooks.count("SD-Stat-Check"), 1);
  f.hooks.off("SD-Stat-Check", veto);
});
test("resource saves reject stale values, limits, lifecycle and arbitrary paths", async t => {
  const f = setup(t); let request = f.edit("hp", 5);
  f.actor.system.attributes.hp.value = 6;
  await assert.rejects(f.gateway.execute(edit, request), { code: "STALE_STATE" });
  request = f.edit("hp", 5); f.actor.system.attributes.hp.max = 11;
  await assert.rejects(f.gateway.execute(edit, request), { code: "STALE_STATE" });
  await assert.rejects(f.gateway.execute(edit, { ...f.edit("hp", 5), path: "system.attributes.ac.value" }), { code: "INVALID_INPUT" });
  await assert.rejects(f.gateway.execute(edit, f.edit("hp", 5), { isCurrent: () => false }), { code: "STALE_SESSION" });
  assert.equal(f.writes.length, 0);
});
test("different light toggles share one actor lock while native setup is pending", async t => {
  const f = setup(t), torch = f.actor.items.get("torch"); let finish;
  f.actor.items.push({ ...torch, id: "lantern", uuid: `${f.actor.uuid}.Item.lantern` });
  f.actor.sheet._toggleLightSource = () => new Promise(resolve => { finish = resolve; });
  const pending = f.gateway.execute(action, f.request("light:torch"));
  await assert.rejects(f.gateway.execute(action, f.request("light:lantern")), { code: "COMMAND_BUSY" });
  finish(); await pending;
});
