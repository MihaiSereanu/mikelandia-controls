import test from "node:test";
import assert from "node:assert/strict";
import { createFoundrySessionGateway, isActorEligible } from "../src/foundry/session/session-gateway.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { createActor, createGame, createHooks, installGlobals } from "./helpers/foundry.mjs";

const dnd5e = resolveSystemIntegration("dnd5e");

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
