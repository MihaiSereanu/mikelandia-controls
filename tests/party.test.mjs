import test from "node:test";
import assert from "node:assert/strict";
import { createShadowdarkFixture } from "./helpers/shadowdark.mjs";
import { createWarhammerActor, createWarhammerGame, addWarhammerConditions } from "./helpers/warhammer.mjs";
import { createActor, createHooks, collection, installGlobals } from "./helpers/foundry.mjs";
import { createFoundrySessionGateway } from "../src/foundry/session/session-gateway.mjs";
import { createFoundryCommandGateway, ACTOR_COMMANDS as C } from "../src/foundry/commands/command-gateway.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";
import { healthStatus } from "../src/systems/combat-health.mjs";
import { readParty } from "../src/systems/party.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";

function supply(actor, id, name, quantity = 3, overrides = {}) {
  return { id, uuid: `${actor.uuid}.Item.${id}`, parent: actor, type: "Basic", name,
    system: { isPhysical: true, isIdentified: true, stashed: false, quantity, ...overrides } };
}
function setup(t) {
  const f = createShadowdarkFixture();
  installGlobals(t, { game: f.game, Hooks: f.hooks });
  f.actor.system.slots = 10;
  f.actor.system.getSlotUsage = () => ({ total: 4 });
  f.actor.items.push(supply(f.actor, "rations", "Rations"), supply(f.actor, "water", "Waterskin", 1));
  f.gateway = createFoundryCommandGateway();
  f.session = createFoundrySessionGateway({ capabilitiesForActor: f.gateway.capabilitiesForActor });
  f.request = value => {
    const edit = f.session.read().party.members[0].supplies.find(item => item.id === "rations").edit;
    return { actorSourceUuid: f.actor.uuid, resourceId: edit.id, resourceRevision: edit.revision, expectedValue: edit.value, value };
  };
  return f;
}

test("Party lists Observer PCs alphabetically without changing owned Character selection or leaking denied data", t => {
  const f = setup(t);
  const observer = createActor({ id: "observer", uuid: "Actor.observer", type: "Player", name: "Alma",
    testUserPermission: (_user, level) => level === "OBSERVER", items: [] });
  observer.items.push(supply(observer, "water", "Waterskin", 2));
  observer.items[0].isOwner = false;
  const denied = createActor({ id: "denied", type: "Player", testUserPermission: () => false });
  Object.defineProperty(denied, "system", { get() { throw new Error("Denied actor data read"); } });
  f.game.actors.push(observer, denied, createActor({ id: "npc", type: "NPC" }),
    createActor({ id: "group", type: "Player", name: "Group" }));
  const snapshot = f.session.read();
  assert.deepEqual(snapshot.party.members.map(member => member.name), ["Alma", "Mara"]);
  assert.equal(snapshot.selectedActor.id, f.actor.id);
  assert.equal(snapshot.actors.some(actor => actor.id === "observer"), false);
  assert.equal(snapshot.party.members[0].supplies[0].quantity, 2);
  assert.equal(snapshot.party.members[0].supplies[0].edit, null);
  assert.deepEqual(snapshot.party.members[1].slots, { used: 4, max: 10 });
});

test("Party health qualifiers cover exact thresholds, zero and invalid health", t => {
  const f = setup(t);
  for (const [value, status] of [[100, "Healthy"], [51, "Healthy"], [50, "Bloodied"], [11, "Bloodied"], [10, "Critical"], [0, "Critical"]]) {
    assert.equal(healthStatus({ value, max: 100 }), status);
  }
  f.actor.system.attributes.hp.max = 0;
  assert.equal(f.session.read().party.members[0].health, null);
  assert.equal(readParty(resolveSystemIntegration("dnd5e"), f.game.actors, f.game.user), null);
});

test("Supplies include each identified carried stack and reject unrelated, hidden or stashed items", t => {
  const f = setup(t);
  f.actor.items.push(supply(f.actor, "extra", "Ration", 2), supply(f.actor, "stashed", "Waterskin", 5, { stashed: true }),
    supply(f.actor, "secret-water", "Waterskin", 7, { isIdentified: false }), supply(f.actor, "renamed", "Magic waterskin", 1));
  const hidden = supply(f.actor, "hidden", "Rations", 8); hidden.visible = false; f.actor.items.push(hidden);
  const items = f.session.read().party.members[0].supplies;
  assert.deepEqual(items.map(item => [item.name, item.quantity]), [["Rations", 3], ["Waterskin", 1], ["Ration", 2]]);
});

test("Party quantity writes use native inventory validation for Owner PCs and reject observer, stale and unrelated requests", async t => {
  const f = setup(t);
  const request = f.request(4);
  await f.gateway.execute(C.EDIT_PARTY_SUPPLY, request);
  assert.equal(f.actor.items.get("rations").system.quantity, 4);
  await assert.rejects(f.gateway.execute(C.EDIT_PARTY_SUPPLY, request), { code: "STALE_STATE" });
  const fresh = f.request(5);
  f.actor.testUserPermission = (_user, level) => level === "OBSERVER";
  await assert.rejects(f.gateway.execute(C.EDIT_PARTY_SUPPLY, fresh), { code: "FORBIDDEN" });
  f.actor.testUserPermission = () => true;
  for (const mutate of [() => { f.actor.items.get("rations").name = "Torch"; }, () => { f.actor.name = "Group"; }]) {
    mutate();
    await assert.rejects(f.gateway.execute(C.EDIT_PARTY_SUPPLY, fresh), { code: "CAPABILITY_UNAVAILABLE" });
  }
});

test("Party native removal confirmation rechecks supply identity and view lifetime", async t => {
  const f = setup(t);
  let confirm, current = true;
  installGlobals(t, { foundry: { applications: { api: { DialogV2: { confirm: async config => {
    confirm = config; return config.yes.callback();
  } } } } } });
  const request = f.request(0);
  // The gateway checks the view again inside the native confirmation callback.
  globalThis.foundry.applications.api.DialogV2.confirm = async config => { confirm = config; current = false; return config.yes.callback(); };
  await assert.rejects(f.gateway.execute(C.EDIT_PARTY_SUPPLY, request, { isCurrent: () => current }), { code: "STALE_SESSION" });
  assert.ok(confirm);
  assert.equal(f.actor.items.get("rations").system.quantity, 3);
  current = true;
  globalThis.foundry.applications.api.DialogV2.confirm = async config => {
    f.actor.items.get("rations").name = "Torch"; return config.yes.callback();
  };
  await assert.rejects(f.gateway.execute(C.EDIT_PARTY_SUPPLY, request), { code: "CAPABILITY_UNAVAILABLE" });
  assert.ok(f.actor.items.get("rations"));
  f.actor.items.get("rations").name = "Rations";
  globalThis.foundry.applications.api.DialogV2.confirm = async () => false;
  assert.equal((await f.gateway.execute(C.EDIT_PARTY_SUPPLY, f.request(0))).cancelled, true);
  assert.ok(f.actor.items.get("rations"));
  globalThis.foundry.applications.api.DialogV2.confirm = async config => config.yes.callback();
  await f.gateway.execute(C.EDIT_PARTY_SUPPLY, f.request(0));
  assert.equal(f.actor.items.get("rations"), undefined);
});

test("Native GM ownership grants Party supply controls while invalid quantities remain rejected", async t => {
  const f = setup(t);
  f.game.user.isGM = true;
  f.actor.testUserPermission = user => user.isGM;
  assert.ok(f.session.read().party.members[0].supplies[0].edit);
  for (const value of [-1, 1.5, NaN, Infinity, "4"]) {
    await assert.rejects(f.gateway.execute(C.EDIT_PARTY_SUPPLY, f.request(value)), { code: "INVALID_INPUT" });
  }
  await f.gateway.execute(C.EDIT_PARTY_SUPPLY, f.request(8));
  assert.equal(f.actor.items.get("rations").system.quantity, 8);
});

test("Unselected observer HP, supplies and permission hooks publish Party changes", async t => {
  const f = setup(t), other = createActor({ id: "other", uuid: "Actor.other", type: "Player", name: "Zara",
    testUserPermission: (_user, level) => level === "OBSERVER" });
  other.items = collection([supply(other, "water", "Waterskin", 2)]);
  f.game.actors.push(other);
  const scope = createTaskScope("party-test"), published = [];
  t.after(() => scope.dispose());
  f.session.watch(scope, snapshot => published.push(snapshot), error => { throw error; });
  other.system.attributes.hp.value = 1;
  f.hooks.emit("updateActor", other, { "system.attributes.hp.value": 1 });
  await Promise.resolve();
  assert.equal(published.at(-1).party.members[1].health.status, "Critical");
  other.items[0].system.quantity = 4;
  f.hooks.emit("updateItem", other.items[0], { "system.quantity": 4 });
  await Promise.resolve();
  assert.equal(published.at(-1).party.members[1].supplies[0].quantity, 4);
  other.testUserPermission = () => false;
  f.hooks.emit("updateActor", other, { ownership: {} });
  await Promise.resolve();
  assert.deepEqual(published.at(-1).party.members.map(member => member.id), [f.actor.id]);
});

for (const use5e of [false, true]) test(`WFRP ${use5e ? "5e" : "4e"} Observer Party includes conditions, Injuries and Critical Wounds`, async t => {
  const actor = createWarhammerActor(), game = createWarhammerGame([actor], { use5e });
  const hooks = createHooks();
  installGlobals(t, { game, Hooks: hooks });
  actor.testUserPermission = (_user, level) => level === "OBSERVER";
  addWarhammerConditions(actor, game);
  await actor.addCondition("bleeding", 3); await actor.addCondition("prone", 1); await actor.addCondition("dead", 1);
  for (const [id, type] of [["Torn muscle", "injury"], ["Broken arm", "critical"]]) actor.items.push({ id, name: id, type, parent: actor, isOwner: false });
  const party = createFoundrySessionGateway().read().party;
  assert.equal(party.supplies, false);
  assert.deepEqual(party.members[0].injuries.map(item => item.name), ["Torn muscle", "Broken arm"]);
  assert.deepEqual(party.members[0].conditions.map(condition => [condition.label, condition.value]), [["Bleeding", 3], ["Prone", 1], ["Dead", 1]]);
  assert.equal(party.members[0].health.label, "Wounds");
  const bleedingReference = party.members[0].conditions.find(condition => condition.id === "bleeding");
  if (use5e) {
    assert.ok(bleedingReference.description.some(line => line.includes("Challenging")));
  } else {
    assert.equal(bleedingReference.description, undefined);
  }
  const session = createFoundrySessionGateway(), scope = createTaskScope("wfrp-party"), snapshots = [];
  t.after(() => scope.dispose());
  session.watch(scope, snapshot => snapshots.push(snapshot), error => { throw error; });
  const bleeding = actor.hasCondition("bleeding");
  bleeding.conditionValue = 4;
  hooks.emit("updateActiveEffect", bleeding, { "system.condition.value": 4 });
  await Promise.resolve();
  assert.equal(snapshots.at(-1).party.members[0].conditions.find(condition => condition.id === "bleeding").value, 4);
  actor.items.at(-1).name = "Healing arm";
  hooks.emit("updateItem", actor.items.at(-1), { name: "Healing arm" });
  await Promise.resolve();
  assert.equal(snapshots.at(-1).party.members[0].injuries.at(-1).name, "Healing arm");
});
