import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/command-gateway.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { installGlobals, collection } from "./helpers/foundry.mjs";
import { createWarhammerActor, createWarhammerGame, createWarhammerWeapon } from "./helpers/warhammer.mjs";

const command = ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION;
const request = (id = "sword", revision = "4e") => ({ actorSourceUuid: "Actor.hero", actionId: `weapon:${id}`, actionRevision: revision });
function setup(t, { use5e = false } = {}) {
  const calls = [];
  const actor = createWarhammerActor({ setupWeapon: async (...args) => {
    calls.push(["setup", ...args]);
    return { actor, item: args[0], roll: async () => { calls.push(["roll"]); } };
  } });
  const game = createWarhammerGame([actor], { use5e });
  installGlobals(t, { game });
  const gateway = createFoundryCommandGateway({ getHooks: () => { throw new Error("D&D attack orchestration used"); } });
  const view = () => resolveSystemIntegration("wfrp4e").createActorViewRecord(actor, game.user, gateway.capabilitiesForActor);
  return { actor, game, gateway, calls, view };
}

for (const use5e of [false, true]) {
  for (const id of ["sword", "handgun"]) {
    test(`${use5e ? "5e" : "4e"} ${id} attacks use native setupWeapon and roll exactly once`, async t => {
      const { actor, game, gateway, calls } = setup(t, { use5e });
      Object.defineProperty(game, "messages", { get() { throw new Error("Mikelandia Controls must not parse native attack messages"); } });
      const weapon = actor.items.find(item => item.id === id);
      const outcome = await gateway.execute(command, request(id, use5e ? "5e" : "4e"));
      assert.equal(calls[0][0], "setup");
      assert.equal(calls[0].length, 4);
      assert.deepEqual(calls[0].slice(2), [{}, { resolveClose: true }], "enable cancellation without bypassing native roll setup");
      assert.equal(calls[0][1], weapon);
      assert.deepEqual(calls[1], ["roll"]);
      assert.equal(outcome.ok, true);
      assert.equal(outcome.rollResult, undefined);
      assert.equal(outcome.actionSession, undefined);
    });
  }
}

test("Combat groups and Damage displays use native labels and computed values", t => {
  const { view } = setup(t);
  const combat = view().panels.find(tab => tab.id === "combat");
  const melee = combat.sections.find(section => section.id === "melee-weapons");
  const ranged = combat.sections.find(section => section.id === "ranged-weapons");
  assert.equal(melee.label, "Melee Weapon(s)");
  assert.equal(ranged.label, "Ranged Weapon(s)");
  assert.deepEqual(melee.rows[0], { id: "sword", label: "Sword", value: 7, format: "display", valueLabel: "Damage", valuePrefix: "+",
    action: { id: "weapon:sword", revision: "4e" } });
  assert.equal(ranged.rows[0].value, "8+ 1d10");
});

test("only visible, owned, equipped native-mode weapons are projected or actionable", async t => {
  const { actor, gateway, view } = setup(t);
  for (const [id, extra] of [["hidden", { visible: false }], ["unowned", { isOwner: false }], ["foreign", { parent: {} }],
    ["unequipped", { equipped: false }], ["no-mode", { mode: "unknown" }]]) {
    const item = createWarhammerWeapon({ id, ...extra });
    item.parent ??= actor;
    Object.defineProperty(item, "name", { get() { throw new Error(`${id} name must not be read`); } });
    actor.items.push(item);
  }
  const ids = gateway.capabilitiesForActor(actor).profileActions.map(action => action.id);
  assert.deepEqual(ids, ["weapon:sword", "weapon:handgun"]);
  assert.equal(view().panels.find(tab => tab.id === "combat").sections.filter(section => section.kind === "items").flatMap(section => section.rows).length, 2);
  for (const id of ["hidden", "unowned", "foreign", "unequipped", "no-mode", "weapon"]) {
    await assert.rejects(gateway.execute(command, request(id)), { code: "CAPABILITY_UNAVAILABLE" });
  }
});

test("weapon mode uses native getters instead of interpreting raw groups", t => {
  const { actor, view } = setup(t);
  const weapon = actor.items.find(item => item.id === "sword");
  weapon.system.isMelee = false;
  weapon.system.isRanged = true;
  Object.defineProperty(weapon.system, "weaponGroup", { get() { throw new Error("do not infer weapon mode from group keys"); } });
  const combat = view().panels.find(tab => tab.id === "combat");
  assert.equal(combat.sections.some(section => section.id === "melee-weapons"), false);
  assert.equal(combat.sections.find(section => section.id === "ranged-weapons").rows.some(row => row.id === "sword"), true);
});

test("malformed or missing native DamageString is omitted, while numeric zero remains", t => {
  const { actor, view } = setup(t);
  actor.items.find(item => item.id === "sword").system.DamageString = 0;
  actor.items.find(item => item.id === "handgun").system.DamageString = undefined;
  const rows = view().panels.find(tab => tab.id === "combat").sections.flatMap(section => section.rows);
  assert.equal(rows.find(row => row.id === "sword").value, 0);
  assert.equal(rows.some(row => row.id === "handgun"), false);
});

test("native setup owns ammunition, reload, targeting, and damage decisions", async t => {
  const { actor, game, gateway, calls } = setup(t);
  const weapon = actor.items.find(item => item.id === "handgun");
  const initial = JSON.stringify(weapon.system);
  for (const key of ["targets"]) Object.defineProperty(game.user, key, { get() { throw new Error("Mikelandia Controls must not resolve native attack targets"); } });
  actor.update = () => { throw new Error("Mikelandia Controls attempted an actor resource write"); };
  weapon.update = () => { throw new Error("Mikelandia Controls attempted a weapon/ammo write"); };
  Object.defineProperty(weapon.system, "damage", { get() { throw new Error("Mikelandia Controls read raw damage instead of native DamageString"); } });
  assert.equal((await gateway.execute(command, request("handgun"))).ok, true);
  assert.equal(JSON.stringify(weapon.system), initial);
  assert.deepEqual(calls.map(call => call[0]), ["setup", "roll"]);
});

test("unloaded ranged weapons reach the native reload workflow without a second roll", async t => {
  const { actor, gateway } = setup(t);
  const weapon = actor.items.find(item => item.id === "handgun");
  weapon.system.loaded.value = false;
  let setups = 0;
  actor.setupWeapon = async item => { assert.equal(item, weapon); setups++; return undefined; };
  const result = await gateway.execute(command, request("handgun"));
  assert.equal(setups, 1);
  assert.equal(result.cancelled, true);
});

for (const change of ["unequipped", "removed", "replaced", "item-owner", "visibility", "mode", "permission", "edition", "lifecycle", "connection"]) {
  test(`weapon ${change} during a native dialog prevents the subsequent roll`, async t => {
    const { actor, game } = setup(t);
    const weapon = actor.items.find(item => item.id === "sword");
    let finish;
    let rolls = 0;
    let active = true;
    let generation = 0;
    actor.setupWeapon = () => new Promise(resolve => { finish = resolve; });
    const gateway = createFoundryCommandGateway({ getConnectionGeneration: () => generation });
    const pending = gateway.execute(command, request(), { isCurrent: () => active });
    if (change === "unequipped") weapon.system.isEquipped = false;
    if (change === "removed") actor.items.splice(actor.items.indexOf(weapon), 1);
    if (change === "replaced") actor.items.splice(actor.items.indexOf(weapon), 1, { ...createWarhammerWeapon(), parent: actor });
    if (change === "item-owner") weapon.isOwner = false;
    if (change === "visibility") weapon.visible = false;
    if (change === "mode") { weapon.system.isMelee = false; weapon.system.isRanged = true; }
    if (change === "permission") actor.testUserPermission = () => false;
    if (change === "edition") game.settings.get = (_module, key) => key === "editionSettings" ? { use5e: true } : false;
    if (change === "lifecycle") active = false;
    if (change === "connection") generation++;
    finish({ actor, item: weapon, roll: async () => { rolls++; } });
    await assert.rejects(pending, error => ["TARGET_MISSING", "FORBIDDEN", "STALE_SESSION", "STALE_STATE"].includes(error.code));
    assert.equal(rolls, 0);
  });
}

test("native Item views may be clones while the original embedded identity stays current", async t => {
  const { actor, gateway } = setup(t);
  let rolls = 0;
  actor.setupWeapon = async item => ({ actor, get item() { return { id: item.id, type: item.type, parent: actor }; }, roll: async () => { rolls++; } });
  assert.equal((await gateway.execute(command, request())).ok, true);
  assert.equal(rolls, 1);
  actor.setupWeapon = async () => ({ actor, item: { id: "other", type: "weapon", parent: actor }, roll: async () => { rolls++; } });
  await assert.rejects(gateway.execute(command, request()), { code: "TARGET_MISSING" });
  assert.equal(rolls, 1);
});

test("weapon cancellation releases duplicate protection and preserves native state", async t => {
  const { actor, gateway } = setup(t);
  let finish;
  const original = JSON.stringify(actor.items.find(item => item.id === "handgun").system);
  actor.setupWeapon = () => new Promise(resolve => { finish = resolve; });
  const pending = gateway.execute(command, request("handgun"));
  await assert.rejects(gateway.execute(command, request("handgun")), { code: "COMMAND_BUSY" });
  finish(null);
  assert.equal((await pending).cancelled, true);
  actor.setupWeapon = async () => undefined;
  assert.equal((await gateway.execute(command, request("handgun"))).cancelled, true);
  assert.equal(JSON.stringify(actor.items.find(item => item.id === "handgun").system), original);
});

test("synthetic actor attacks pass that actor's own embedded weapon", async t => {
  const { actor, game, gateway, calls } = setup(t);
  const tokenActor = createWarhammerActor({ uuid: "Scene.scene.Token.token.Actor.hero", isToken: true });
  // Use a token-native return object too; the world actor must stay uninvolved.
  tokenActor.setupWeapon = async item => { calls.push(["token", item]); return { actor: tokenActor, item, roll: async () => { calls.push(["roll"]); } }; };
  game.actors = collection([actor]);
  installGlobals(t, { fromUuidSync: uuid => uuid === tokenActor.uuid ? tokenActor : null });
  await gateway.execute(command, { ...request(), actorSourceUuid: tokenActor.uuid });
  assert.equal(calls[0][0], "token");
  assert.equal(calls[0][1].parent, tokenActor);
});
