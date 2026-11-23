import test from "node:test";
import assert from "node:assert/strict";
import { createFoundrySessionGateway, isActorEligible } from "../src/foundry/session/session-gateway.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { createActor, createGame, createHooks, installGlobals } from "./helpers/foundry.mjs";
import { createFoundryCombatGateway } from "../src/foundry/combat/combat-gateway.mjs";
import { createWarhammerActor, createWarhammerGame } from "./helpers/warhammer.mjs";

const dnd5e = resolveSystemIntegration("dnd5e");

for (const use5e of [true]) test(`WFRP 5e remote updates retain an unchanged selected character`, async t => {
  const actor = createWarhammerActor();
  const other = createWarhammerActor({ id: "other", uuid: "Actor.other" });
  const game = createWarhammerGame([actor, other], { use5e });
  game.user.character = actor;
  const hooks = createHooks(), updates = [], errors = [];
  installGlobals(t, { game, Hooks: hooks,
    document: { createElement: () => ({ set innerHTML(value) { this.textContent = value; } }) } });
  const scope = createTaskScope("cross-client-refresh");
  t.after(() => scope.dispose());
  let initiative = 0;
  const gateway = createFoundrySessionGateway({ combatForSnapshot: () => ({ initiative }) });
  const initial = gateway.watch(scope, snapshot => updates.push(snapshot), error => errors.push(error));
  initiative = 42;
  hooks.emit("updateCombatant", { id: "other-combatant" }, { initiative }, {}, "other-player");
  await Promise.resolve();
  assert.equal(updates.at(-1).combat.initiative, 42);
  assert.equal(updates.at(-1).selectedActor, initial.selectedActor);

  // A remote user's update forces a full actor read while their roll reaches Chat.
  const message = { id: "remote-roll", user: "other-player", speaker: { actor: other.id }, content: "42", visible: true };
  game.messages.push(message);
  hooks.emit("updateUser", { id: "other-player" }, { name: "Other Player" });
  hooks.emit("createChatMessage", message, {}, "other-player");
  await Promise.resolve();
  assert.equal(updates.at(-1).chat.at(-1).id, message.id);
  assert.equal(updates.at(-1).selectedActor, initial.selectedActor);

  // Even a changed party member must not replace the selected character's pane.
  other.system.status.wounds.value--;
  hooks.emit("updateActor", other, { "system.status.wounds.value": other.system.status.wounds.value });
  hooks.emit("updateUser", { id: "other-player" }, {});
  await Promise.resolve();
  assert.equal(updates.at(-1).selectedActor, initial.selectedActor);

  actor.system.status.wounds.value--;
  hooks.emit("updateActor", actor, { "system.status.wounds.value": actor.system.status.wounds.value });
  await Promise.resolve();
  assert.notEqual(updates.at(-1).selectedActor, initial.selectedActor);
  assert.deepEqual(errors, []);
});

test("D&D discovery preserves observer and NPC ownership policies", () => {
  const observer = { id: "observer", isGM: false };
  const make = type => createActor({ type, testUserPermission: (_user, level) => level === "OBSERVER" });
  for (const type of ["character", "group", "vehicle"]) assert.equal(isActorEligible(make(type), observer, dnd5e), true);
  assert.equal(isActorEligible(make("npc"), observer, dnd5e), false);
  assert.equal(isActorEligible(make("npc"), { isGM: true }, dnd5e), true);
  assert.equal(isActorEligible(createActor({ type: "npc" }), observer, dnd5e), true);
  for (const type of ["Player", "NPC", "creature", "custom"]) assert.equal(isActorEligible(make(type), observer, dnd5e), false);
  assert.equal(isActorEligible(null, observer, dnd5e), false);
  assert.equal(isActorEligible(createActor({ testUserPermission() { throw new Error("permission failure"); } }), observer, dnd5e), false);
});

test("session discovery and selected records still expose D&D values and labels", t => {
  const actor = createActor();
  const game = createGame([actor]);
  game.user.character = actor;
  installGlobals(t, { game });
  const gateway = createFoundrySessionGateway();
  const snapshot = gateway.read();
  assert.deepEqual(snapshot.actors.map(record => record.id), [actor.id]);
  assert.deepEqual(snapshot.selectedActor.hp, { value: 7, max: 12, temp: 2 });
  assert.equal(snapshot.selectedActor.header.labels.hitPoints, "Hit Points");
  assert.equal(snapshot.selectedActor.sourceUuid, actor.uuid);
  assert.equal(snapshot.selectedActor.source.synthetic, false);
});

test("fallback never projects unknown actors through the D&D sheet", t => {
  const actor = createActor({ type: "Player" });
  for (const key of ["system", "items", "effects", "sheet"]) {
    Object.defineProperty(actor, key, { get() { throw new Error(`${key} must not be read during projection`); } });
  }
  const game = createGame([actor], "shadowdark");
  game.user.character = actor;
  installGlobals(t, { game });
  const gateway = createFoundrySessionGateway();
  const snapshot = gateway.read();
  assert.deepEqual(snapshot.actors.map(entry => entry.id), [actor.id]);
  assert.equal(snapshot.selectedActor.presentation, "native");
  assert.equal(snapshot.selectedActor.nativeSheetAvailable, true);
  assert.equal(snapshot.selectedActor.hp, undefined);
  assert.equal(snapshot.selectedActor.items, undefined);
  assert.equal(gateway.selectCharacterSource(actor.uuid).selectedActor.sourceUuid, actor.uuid);
});

test("D&D effects retain complete source formatting for expanded descriptions", t => {
  const description = `<p><strong>Effect rules</strong></p><p>${"Long description. ".repeat(40)}End of rules.</p>`;
  const actor = createActor({ effects: [{ id: "effect", name: "Blessing", description, statuses: new Set() }] });
  const game = createGame([actor]);
  game.user.character = actor;
  installGlobals(t, { game });
  const effect = createFoundrySessionGateway().read().selectedActor.effects[0];
  assert.equal(effect.descriptionHtml, description);
  assert.ok(effect.descriptionHtml.endsWith("End of rules.</p>"));
});

test("injected integration supplies discovery, directory, detail, and references", t => {
  const actor = createActor({ type: "Player" });
  const game = createGame([actor], "shadowdark");
  game.user.character = actor;
  installGlobals(t, { game });
  let referenceReads = 0;
  const integration = {
    isActorEligible: candidate => candidate === actor,
    createActorDirectoryRecord: candidate => ({ id: candidate.id, name: candidate.name, sourceUuid: candidate.uuid }),
    createActorViewRecord: () => ({ name: "Game-specific presentation", label: "Luck" }),
    referenceSources: () => { referenceReads++; return []; }
  };
  const gateway = createFoundrySessionGateway({ getSystemIntegration: () => integration });
  const snapshot = gateway.read();
  assert.equal(snapshot.selectedActor.label, "Luck");
  assert.equal(snapshot.selectedActor.name, "Game-specific presentation");
  assert.equal(snapshot.selectedActor.hp, undefined);
  assert.equal(referenceReads, 1);
});

test("incremental discovery rechecks integration eligibility after ownership changes", async t => {
  let owned = true;
  const actor = createActor({ type: "npc", testUserPermission: () => owned });
  const game = createGame([actor]);
  const hooks = createHooks();
  const scope = createTaskScope("session-test");
  t.after(() => scope.dispose());
  installGlobals(t, { game, Hooks: hooks });
  const gateway = createFoundrySessionGateway();
  const snapshots = [];
  const errors = [];
  gateway.adopt(gateway.read());
  gateway.watch(scope, snapshot => snapshots.push(snapshot), error => errors.push(error));
  owned = false;
  hooks.emit("updateActor", actor, { name: "Changed" });
  await new Promise(resolve => queueMicrotask(resolve));
  assert.deepEqual(errors, []);
  assert.deepEqual(snapshots.at(-1).actors, []);
});

test("late tracker selection refreshes Initiative without document updates or actor reprojection", async t => {
  const actor = createActor(), game = createGame([actor]), hooks = createHooks();
  game.user.character = actor;
  game.combat = null;
  const scope = createTaskScope(), updates = [], errors = [];
  t.after(() => scope.dispose());
  installGlobals(t, { game, Hooks: hooks });
  const combat = createFoundryCombatGateway();
  const gateway = createFoundrySessionGateway({ combatForSnapshot: combat.snapshot, combatControlsForSnapshot: combat.controlsSnapshot });
  const initial = gateway.watch(scope, snapshot => updates.push(snapshot), error => errors.push(error));
  assert.equal(initial.combat, null);
  hooks.emit("canvasReady");
  await Promise.resolve();
  game.combat = { id: "already-running", started: true, round: 3, turn: 0, turns: [] };
  for (let i = 0; i < 3; i++) hooks.emit("renderCombatTracker", {});
  await Promise.resolve();
  assert.deepEqual(errors, []);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].combat.id, "already-running");
  assert.equal(updates[0].combat.round, 3);
  assert.equal(updates[0].selectedActor, initial.selectedActor);
  hooks.emit("renderCombatTracker", {});
  await Promise.resolve();
  assert.equal(updates.length, 1);
  game.combat = null;
  hooks.emit("renderCombatTracker", {});
  await Promise.resolve();
  assert.equal(updates.at(-1).combat, null);
  scope.dispose();
  assert.equal(hooks.count("renderCombatTracker"), 0);
});
