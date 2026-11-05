import test from "node:test";
import assert from "node:assert/strict";
import { createNativeSystemFixture } from "./helpers/native-systems.mjs";
import { installGlobals } from "./helpers/foundry.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/commands/command-gateway.mjs";
import { projectCombatHealth } from "../src/systems/combat-health.mjs";
import { createFoundryDamageGateway } from "../src/foundry/actors/damage-gateway.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";

function setup(t) {
  const f = createNativeSystemFixture("honor-and-intrigue");
  installGlobals(t, { game: f.game, Hooks: f.hooks, CONFIG: { statusEffects: [{ id: "at-a-loss", name: "At a Loss" }] } });
  const gateway = createFoundryCommandGateway(), integration = resolveSystemIntegration("honor-and-intrigue");
  const actionPayload = id => { const action = gateway.capabilitiesForActor(f.actor).profileActions.find(action => action.id === id);
    return { actorSourceUuid: f.actor.uuid, actionId: id, actionRevision: action.revision }; };
  const action = id => gateway.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, actionPayload(id));
  const editPayload = (id, value) => { const edit = gateway.capabilitiesForActor(f.actor).profileEdits.find(edit => edit.id === id);
    return { actorSourceUuid: f.actor.uuid, resourceId: id, resourceRevision: edit.revision, expectedValue: edit.value, value }; };
  return { ...f, gateway, integration, actionPayload, action, editPayload,
    view: () => integration.createActorViewRecord(f.actor, f.game.user, actor => gateway.capabilitiesForActor(actor)) };
}
test("H+I Hero panels use exact system identity and native optional resources", t => {
  const f = setup(t);
  assert.equal(resolveSystemIntegration("honor-intrigue").id, "fallback");
  assert.deepEqual(f.view().panels.map(tab => tab.id), ["main", "careers", "combat", "inventory", "abilities", "effects"]);
  assert.equal(f.view().notesTabLabel, "Bio");
  assert.deepEqual(f.view().notesSections.map(section => section.id), ["backstory", "origin"]);
  delete f.actor.system.arcanePower.career;
  assert.equal(JSON.stringify(f.view()).includes('"id":"arcane-power"'), false);
  for (const type of ["villain", "retainer", "pawn", "creature", "ship", "party"]) {
    f.actor.type = type; assert.equal(f.view().presentation, "native");
    assert.deepEqual(f.gateway.capabilitiesForActor(f.actor), { profileActions: [], profileEdits: [] });
  }
});
test("H+I native checks, damage and weapon maneuvers retain weapon context/loading", async t => {
  const f = setup(t);
  await f.action("characteristic:qualities.might");
  assert.equal(f.gateway.capabilitiesForActor(f.actor).profileActions.some(action => action.id.startsWith("characteristic:combatAbilities")), false);
  await f.action("maneuver:lunge"); await f.action("damage:sword");
  const result = await f.action("weapon-maneuver:sword:0"); assert.equal(result.rolled, true);
  assert.equal(f.calls.at(-1)[2].system.relatedItemUuid, f.actor.items.get("sword").uuid);
  assert.equal(f.actor.items.get("sword").system.loadActions.spent, 0);
  await f.action("reload:sword"); assert.equal(f.actor.items.get("sword").system.loadActions.spent, 1);
  f.actor.system.rollManeuver = async () => null;
  const cancelled = await f.action("weapon-maneuver:sword:0");
  assert.equal(cancelled.cancelled, true); assert.equal(cancelled.rolled, false);
  assert.equal(f.actor.items.get("sword").system.loadActions.spent, 1);
  assert.equal(f.hooks.count("preUpdateItem"), 0);
});
test("H+I resource limits, equipment choices, Notes and stale requests are enforced", async t => {
  const f = setup(t);
  for (const [id, value] of [["lifeblood", -3], ["fortune", 2], ["advantage", 0], ["composure", 1], ["arcane-power", 7], ["equipped:sword", 2], ["quantity:ration", 0]])
    await f.gateway.execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, f.editPayload(id, value));
  assert.equal(f.actor.system.lifeblood.value, -3); assert.equal(f.actor.items.get("sword").system.carriedPosition, 2);
  for (const [id, value] of [["lifeblood", -7], ["composure", 4], ["advantage", 11], ["equipped:sword", 3], ["arcane-power", 11]])
    await assert.rejects(f.gateway.execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, f.editPayload(id, value)), { code: "INVALID_INPUT" });
  const stale = f.editPayload("fortune", 1); await f.actor.update({ "system.fortune.value": 3 });
  await assert.rejects(f.gateway.execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, stale), { code: "STALE_STATE" });
  const originalValue = f.actor.system.notes;
  await f.gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, { actorSourceUuid: f.actor.uuid, section: "notes", biographyField: "notes", originalValue, value: "New notes\n\nSecond paragraph" });
  assert.equal(f.actor.system.notes, "New notes\n\nSecond paragraph"); assert.equal(f.actor.system.background.origin, "Port Royal");
});
test("H+I lifeblood loss supports negative values and private enemy summaries", async t => {
  const f = setup(t), scope = createTaskScope(); t.after(() => scope.dispose());
  const hits = [];
  createFoundryDamageGateway().watch(scope, { getSource: () => f.actor.uuid, isActive: () => true, onDamage: hit => hits.push(hit), onReset() {} });
  await f.actor.update({ "system.lifeblood.value": -2 }); await f.actor.update({ "system.lifeblood.value": -1 });
  assert.deepEqual(hits, [{ amount: 12, noun: "lifeblood", down: true }]);
  assert.deepEqual(projectCombatHealth(f.integration, { disposition: -1, actor: f.actor }), { status: "Dying" });
  assert.equal(projectCombatHealth(f.integration, { disposition: 1, actor: f.actor }).value, -1);
  scope.dispose();
});
test("pending native actions reject duplicate submissions, stale sessions and release hooks on errors", async t => {
  const f = setup(t);
  let finish;
  f.actor.rollCharacteristic = () => new Promise(resolve => { finish = resolve; });
  const payload = f.actionPayload("characteristic:qualities.might");
  const pending = f.gateway.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, payload);
  await assert.rejects(f.gateway.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, payload), { code: "COMMAND_BUSY" });
  f.actor.testUserPermission = () => false;
  const message = { speaker: { actor: f.actor.id } };
  assert.equal(f.hooks.call("preCreateChatMessage", message), false);
  finish(null); await assert.rejects(pending);
  assert.equal(f.hooks.count("preCreateChatMessage"), 0); assert.equal(f.hooks.count("preUpdateActor"), 0);
});
test("H+I style activation dispatches the native sheet handler and derived XP stays read-only", async t => {
  const f = setup(t), calls = [];
  const sheet = { options: { actions: { toggleActiveStyle(_event, target) { calls.push([this, target.closest('.item').dataset.itemId]); } } } };
  f.actor.sheet = sheet;
  await f.action("style:style"); assert.deepEqual(calls, [[sheet, "style"]]);
  assert.equal(f.gateway.capabilitiesForActor(f.actor).profileEdits.some(edit => edit.id === "advancement"), false);
});


test("H+I Bio, conditions and combat controls use complete native data without status text", t => {
  const f = setup(t);
  f.actor.system.motivation = "Find the fleet";
  f.actor.system.background = { description: "Navigator", backstory: "At sea", origin: "Port Royal", friendsAndContacts: "Pilots", rivalsAndEnemies: "Admiral" };
  const view = f.view();
  assert.deepEqual(view.notesSections.map(section => section.id), ["motivation", "description", "backstory", "origin", "friendsAndContacts", "rivalsAndEnemies"]);
  assert.equal(view.notesSections[0].richText, false);
  const main = view.panels.find(tab => tab.id === "main");
  assert.equal(main.sections.find(section => section.id === "advancement").fullWidth, true);
  const condition = view.panels.find(tab => tab.id === "effects").sections[0].rows[0];
  assert.equal(condition.editControl, "checkbox");
  assert.match(condition.tooltip[0].bullets[0], /2.*Defense/u);
  const combat = view.panels.find(tab => tab.id === "combat");
  assert.equal(combat.sections.find(section => section.id === "weapon-maneuvers").layout, "actions");
  const style = combat.sections.find(section => section.id === "styles").rows[0];
  assert.equal(style.editControl, "checkbox"); assert.equal(style.value, false);
  assert.equal(/\b(?:Loaded|Unloaded|Active|Inactive)\b/u.test(JSON.stringify(view.panels)), false);
});
