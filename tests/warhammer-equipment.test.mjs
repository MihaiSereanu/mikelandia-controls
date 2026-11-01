import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/commands/command-gateway.mjs";
import { createFoundrySessionGateway } from "../src/foundry/session/session-gateway.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { installGlobals, createHooks } from "./helpers/foundry.mjs";
import { createWarhammerActor, createWarhammerGame } from "./helpers/warhammer.mjs";

function setup(t, use5e = false) {
  const actor = createWarhammerActor();
  const calls = [];
  const hooks = createHooks();
  const mount = { id: "horse", uuid: "Actor.horse", name: "Reik", system: { status: { wounds: { value: 12, max: 18 } } } };
  actor.mount = mount;
  actor.system.status.mount = { id: mount.id, mounted: false, isToken: false };
  actor.system.details = { move: { value: 4, walk: 8, run: 16 } };
  actor.update = async changes => { calls.push([actor, changes]); actor.system.status.mount.mounted = changes["system.status.mount.mounted"]; return actor; };
  const sword = actor.items.find(item => item.id === "sword");
  const armour = { id: "mail", uuid: `${actor.uuid}.Item.mail`, name: "Mail", parent: actor, type: "armour", system: { equipped: { value: false }, quantity: { value: 1 } } };
  actor.items.push(armour);
  for (const item of [sword, armour]) {
    item.system.equipped = { value: item === sword };
    item.system.quantity = { value: 1 };
    item.update = async changes => { calls.push([item, changes]); item.system.equipped.value = changes["system.equipped.value"]; return item; };
  }
  const game = createWarhammerGame([actor], { use5e });
  game.user.character = actor;
  installGlobals(t, { game, Hooks: hooks });
  const gateway = createFoundryCommandGateway();
  const payload = (id, value) => {
    const edit = gateway.capabilitiesForActor(actor).profileEdits.find(edit => edit.id === id);
    return { actorSourceUuid: actor.uuid, resourceId: id, resourceRevision: edit.revision, expectedValue: edit.value, value };
  };
  const view = () => resolveSystemIntegration("wfrp4e").createActorViewRecord(actor, game.user, gateway.capabilitiesForActor);
  const execute = payload => gateway.execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, payload);
  return { actor, mount, sword, armour, game, calls, hooks, gateway, payload, view, execute };
}

for (const use5e of [false, true]) test(`${use5e ? "5e" : "4e"} equipment and mounting use native updates and read-only mount wounds`, async t => {
  const { actor, mount, sword, armour, payload, execute, view, calls } = setup(t, use5e);
  const tabs = view().panels;
  const combat = tabs.find(tab => tab.id === "combat");
  assert.equal(combat.sections.find(section => section.id === "movement").controls[0].edit.kind, "boolean");
  const mounts = combat.sections.find(section => section.id === "mounts");
  assert.ok(combat.sections.indexOf(mounts) > combat.sections.findIndex(section => section.id === "movement"));
  assert.deepEqual(mounts.rows.map(row => [row.value, row.max]), [[mount.name, undefined], [12, 18]]);
  assert.ok(mounts.rows.every(row => !row.edit));
  const inventory = tabs.find(tab => tab.id === "trappings");
  assert.equal(inventory.sections.find(section => section.id === "weapons").rows.find(row => row.id === sword.id).equipment.value, true);
  assert.equal(inventory.sections.find(section => section.id === "armour").rows[0].equipment.value, false);
  await execute(payload("equipped:sword", false));
  await execute(payload("equipped:mail", true));
  await execute(payload("mounted", true));
  await execute(payload("mounted", false));
  assert.deepEqual(calls, [[sword, { "system.equipped.value": false }], [armour, { "system.equipped.value": true }],
    [actor, { "system.status.mount.mounted": true }], [actor, { "system.status.mount.mounted": false }]]);
  assert.ok(view().panels.find(tab => tab.id === "combat").sections.some(section => section.id === "mounts"));
});

test("equipment edits reject stale values, permissions, extra fields, and native rejection", async t => {
  const { sword, payload, execute, calls } = setup(t);
  const old = payload("equipped:sword", false);
  sword.system.equipped.value = false;
  await assert.rejects(execute(old), { code: "STALE_STATE" });
  await assert.rejects(execute({ ...payload("equipped:sword", true), path: "system.quantity.value" }), { code: "INVALID_INPUT" });
  await assert.rejects(execute(payload("equipped:sword", 1)), { code: "INVALID_INPUT" });
  const current = payload("equipped:sword", true);
  sword.isOwner = false;
  await assert.rejects(execute(current), { code: "CAPABILITY_UNAVAILABLE" });
  sword.isOwner = true;
  sword.update = async () => { throw new Error("Native weapon limit"); };
  await assert.rejects(execute(payload("equipped:sword", true)), /Native weapon limit/);
  assert.deepEqual(calls, []);
});

for (const use5e of [false, true]) test(`${use5e ? "5e" : "4e"} clothing and wearable containers use native equipment controls`, async t => {
  const { actor, gateway, execute, payload, view, calls } = setup(t, use5e);
  const makeItem = (id, type, extra) => {
    const item = { id, name: id, type, parent: actor, system: { equipped: { value: false }, quantity: { value: 1 }, ...extra },
      update: async changes => { calls.push([id, changes]); return item; } };
    actor.items.push(item);
    return item;
  };
  const clothing = makeItem("coat", "trapping", { trappingType: { value: "clothingAccessories" } });
  makeItem("rope", "trapping", { trappingType: { value: "misc" } });
  const backpack = makeItem("backpack", "container", { wearable: { value: true } });
  makeItem("chest", "container", { wearable: { value: false } });
  makeItem("coin", "money", {});
  makeItem("shot", "ammunition", {});
  const edits = gateway.capabilitiesForActor(actor).profileEdits;
  for (const id of ["coat", "backpack"]) assert.ok(edits.some(edit => edit.id === `equipped:${id}`));
  for (const id of ["rope", "chest", "coin", "shot"]) assert.ok(!edits.some(edit => edit.id === `equipped:${id}`));
  const inventory = view().panels.find(tab => tab.id === "trappings");
  assert.ok(inventory.sections.find(section => section.id === "trappings").rows.find(row => row.id === "coat").equipment.edit);
  assert.ok(inventory.sections.find(section => section.id === "containers").rows.find(row => row.id === "backpack").equipment.edit);
  await execute(payload("equipped:coat", true));
  await execute(payload("equipped:backpack", true));
  assert.deepEqual(calls, [["coat", { "system.equipped.value": true }], ["backpack", { "system.equipped.value": true }]]);
  const staleClothing = payload("equipped:coat", true);
  const staleBackpack = payload("equipped:backpack", true);
  clothing.system.trappingType.value = "misc";
  backpack.system.wearable.value = false;
  await assert.rejects(execute(staleClothing), { code: "CAPABILITY_UNAVAILABLE" });
  await assert.rejects(execute(staleBackpack), { code: "CAPABILITY_UNAVAILABLE" });
});

test("mount reassignment invalidates edits and unresolved mounts disappear safely", async t => {
  const { actor, mount, payload, execute, view } = setup(t);
  const old = payload("mounted", true);
  actor.system.status.mount.id = "another";
  await assert.rejects(execute(old), { code: "STALE_STATE" });
  actor.system.status.mount.isToken = true;
  actor.system.status.mount.tokenData = { scene: "other-scene", token: "horse-token" };
  installGlobals(t, { canvas: { scene: { id: "current-scene" } } });
  Object.defineProperty(actor, "mount", { configurable: true, get() { throw new Error("off-scene getter must not run"); } });
  let combat = view().panels.find(tab => tab.id === "combat");
  assert.equal(combat.sections.find(section => section.id === "movement").controls.length, 0);
  assert.ok(!combat.sections.some(section => section.id === "mounts"));
  Object.defineProperty(actor, "mount", { value: mount, configurable: true });
  actor.system.status.mount.tokenData.scene = "current-scene";
  combat = view().panels.find(tab => tab.id === "combat");
  assert.ok(combat.sections.some(section => section.id === "mounts"));
});

for (const use5e of [false, true]) test(`${use5e ? "5e" : "4e"} owned rider exposes its assigned horse without separate horse permission`, async t => {
  const { actor, mount, payload, execute, view, calls } = setup(t, use5e);
  mount.visible = false;
  mount.isOwner = false;
  mount.ownership = { default: 0 };
  mount.update = async () => { throw new Error("The mount must remain read-only"); };
  const combat = view().panels.find(tab => tab.id === "combat");
  const movement = combat.sections.find(section => section.id === "movement");
  const mounts = combat.sections.find(section => section.id === "mounts");
  assert.equal(movement.controls[0].edit.kind, "boolean");
  assert.deepEqual(mounts.rows.map(row => row.value), ["Reik", 12]);
  assert.ok(mounts.rows.every(row => !row.edit));
  await execute(payload("mounted", true));
  await execute(payload("mounted", false));
  assert.deepEqual(calls, [[actor, { "system.status.mount.mounted": true }], [actor, { "system.status.mount.mounted": false }]]);
  assert.deepEqual(mount.ownership, { default: 0 });
  actor.testUserPermission = () => false;
  await assert.rejects(execute({ actorSourceUuid: actor.uuid, resourceId: "mounted", value: true }), { code: "FORBIDDEN" });
});

test("mount wounds updates refresh the selected rider without granting mount editing", async t => {
  const { mount, hooks } = setup(t);
  const scope = createTaskScope("mount-refresh");
  t.after(() => scope.dispose());
  const session = createFoundrySessionGateway();
  session.read();
  let snapshot;
  session.watch(scope, value => { snapshot = value; }, error => { throw error; });
  mount.system.status.wounds.value = 7;
  hooks.emit("updateActor", mount, { "system.status.wounds.value": 7 });
  await new Promise(resolve => setTimeout(resolve, 0));
  const wounds = snapshot.selectedActor.panels.find(tab => tab.id === "combat").sections.find(section => section.id === "mounts").rows.find(row => row.id === "mount-wounds");
  assert.equal(wounds.value, 7);
  assert.equal(wounds.edit, undefined);
});
