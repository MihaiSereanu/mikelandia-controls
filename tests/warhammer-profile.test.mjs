import test from "node:test";
import assert from "node:assert/strict";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { createFoundrySessionGateway, sessionInvalidationForHook } from "../src/foundry/session-gateway.mjs";
import { createTaskScope } from "../src/kernel/task-scope.mjs";
import { createHooks, installGlobals } from "./helpers/foundry.mjs";
import { createWarhammerActor, createWarhammerGame } from "./helpers/warhammer.mjs";

const integration = resolveSystemIntegration("wfrp4e");
const sections = actor => actor.panels.flatMap(tab => tab.sections);
const fields = actor => sections(actor).flatMap(section => section.rows ?? []);

for (const use5e of [false, true]) {
  test(`Warhammer ${use5e ? "5e" : "4e"} reads prepared characteristics and native edition resources`, t => {
    const actor = createWarhammerActor();
    installGlobals(t, { game: createWarhammerGame([actor], { use5e }) });
    const record = integration.createActorViewRecord(actor, game.user);
    assert.equal(record.presentation, "profile");
    assert.equal(record.edition, use5e ? "5e" : "4e");
    assert.deepEqual(record.panels.map(tab => tab.label), ["Main", "Combat", "Skills", "Trappings"]);
    assert.equal(fields(record).find(field => field.id === "ws").value, 41, "use prepared value; do not recompute from initial/advances");
    assert.deepEqual(fields(record).find(field => field.id === "wounds"), { id: "wounds", label: "Wounds", value: 9, max: 13, format: "number" });
    assert.equal(fields(record).find(field => field.id === "fortune").value, 0);
    assert.equal(fields(record).some(field => field.id === "resolve"), !use5e);
    assert.equal(fields(record).some(field => field.id === "resilience"), !use5e);
    assert.equal(fields(record).some(field => field.id === "momentum"), use5e);
    assert.equal(fields(record).some(field => field.id === "advantage"), !use5e);
    assert.equal(record.nativeSheetAvailable, true);
    assert.equal(record.hp, undefined);
    assert.equal(record.system, undefined);
  });
}

test("skill groups mirror native Basic/Advanced and specialization filters", t => {
  const actor = createWarhammerActor();
  installGlobals(t, { game: createWarhammerGame([actor]) });
  const record = integration.createActorViewRecord(actor, game.user);
  const groups = record.panels.find(tab => tab.id === "skills").sections;
  assert.deepEqual(groups[0].rows.map(row => [row.label, row.value]), [["Athletics", 54]]);
  assert.deepEqual(groups[1].rows.map(row => [row.label, row.value]), [["Language (Magick)", 62], ["Melee (Basic)", 49]]);
  assert.equal(JSON.stringify(record).includes("Unidentified Weapon"), false);
  assert.equal(JSON.stringify(record).includes("Hidden Skill"), false);
});

test("4e Group Advantage uses the native label and actor value", t => {
  const actor = createWarhammerActor();
  installGlobals(t, { game: createWarhammerGame([actor], { groupAdvantage: true }) });
  const record = integration.createActorViewRecord(actor, game.user);
  const combat = record.panels.find(tab => tab.id === "combat");
  assert.equal(combat.sections.find(section => section.id === "group-advantage").label, "Group Advantage");
  assert.equal(combat.sections.find(section => section.id === "group-advantage").rows[0].value, 4);
});

test("unmapped types and unreadable editions retain native access without data projection", t => {
  const actor = createWarhammerActor();
  Object.defineProperty(actor, "system", { get() { throw new Error("system must not be read"); } });
  const game = createWarhammerGame([actor]);
  installGlobals(t, { game });
  for (const type of ["npc", "creature", "vehicle"]) {
    actor.type = type;
    assert.equal(integration.createActorViewRecord(actor, game.user).presentation, "native");
  }
  actor.type = "character";
  for (const edition of [undefined, {}, { use5e: "true" }]) {
    game.settings.get = () => edition;
    assert.equal(integration.createActorViewRecord(actor, game.user).presentation, "native");
  }
});

test("directory projection is cheap and does not read items or characteristics", t => {
  const actor = createWarhammerActor();
  for (const key of ["system", "items"]) Object.defineProperty(actor, key, { get() { throw new Error(`unexpected ${key}`); } });
  installGlobals(t, { game: createWarhammerGame([actor]) });
  assert.equal(integration.createActorDirectoryRecord(actor).name, actor.name);
});

test("permission checks precede profile projection", t => {
  const actor = createWarhammerActor({ testUserPermission: () => false });
  Object.defineProperty(actor, "system", { get() { throw new Error("private data must not be read"); } });
  const game = createWarhammerGame([actor]);
  game.user.character = actor;
  installGlobals(t, { game });
  const snapshot = createFoundrySessionGateway().read();
  assert.deepEqual(snapshot.actors, []);
  assert.equal(snapshot.selectedActor, null);
});

test("missing fields disappear without inferred zeroes and the native path remains", t => {
  const actor = createWarhammerActor({ system: { status: { wounds: { value: 0 } } }, items: [] });
  installGlobals(t, { game: createWarhammerGame([actor]) });
  const record = integration.createActorViewRecord(actor, game.user);
  assert.deepEqual(record.panels.map(tab => tab.id), ["main"]);
  assert.equal(fields(record).length, 1);
  assert.equal(fields(record)[0].value, 0);
  assert.equal(fields(record)[0].max, undefined);
});

test("integration setting invalidations do not cross system boundaries", () => {
  const dnd5e = resolveSystemIntegration("dnd5e");
  for (const setting of ["editionSettings", "useGroupAdvantage", "groupAdvantageValues"]) {
    assert.equal(sessionInvalidationForHook("updateSetting", { namespace: "wfrp4e", key: setting }, {}, integration).refreshSelectedActor, true);
  }
  assert.deepEqual(sessionInvalidationForHook("updateSetting", { key: "wfrp4e.editionSettings" }, {}, dnd5e).domains, []);
  assert.deepEqual(sessionInvalidationForHook("updateSetting", { key: "dnd5e.levelingMode" }, {}, integration).domains, []);
  assert.deepEqual(sessionInvalidationForHook("updateSetting", { key: "dnd5e.levelingMode" }, {}, dnd5e).domains, ["actors"]);
});

test("edition changes refresh the selected profile through the real session watcher", async t => {
  const actor = createWarhammerActor();
  const game = createWarhammerGame([actor]);
  game.user.character = actor;
  const scope = createTaskScope("warhammer-session");
  t.after(() => scope.dispose());
  const hooks = createHooks();
  installGlobals(t, { game, Hooks: hooks });
  const gateway = createFoundrySessionGateway();
  const snapshots = [];
  const errors = [];
  gateway.watch(scope, snapshot => snapshots.push(snapshot), error => errors.push(error));
  game.settings.get = (_namespace, key) => key === "editionSettings" ? { use5e: true } : false;
  hooks.emit("updateSetting", { key: "wfrp4e.editionSettings" }, {}, {}, "player");
  await new Promise(resolve => queueMicrotask(resolve));
  assert.deepEqual(errors, []);
  assert.equal(snapshots.at(-1).selectedActor.edition, "5e");
  assert.equal(fields(snapshots.at(-1).selectedActor).some(row => row.id === "resolve"), false);
});

test("nonempty Trappings and Talents tabs retain exact owned item data", t => {
  const actor = createWarhammerActor();
  const add = (id, type, system) => actor.items.push({ id, type, name: id, parent: actor, system });
  add("rope", "trapping", { quantity: { value: 2 }, description: { value: "<p>A rope</p>" } });
  add("talent", "talent", { description: { value: "<p>A talent</p>" } });
  installGlobals(t, { game: createWarhammerGame([actor]) });
  const view = () => integration.createActorViewRecord(actor, game.user);
  assert.equal(view().panels.find(p => p.id === "trappings").sections.find(s => s.id === "trappings").rows[0].value, 2);
  assert.equal(view().panels.find(p => p.id === "talents").sections[0].rows[0].description, "<p>A talent</p>");
  for (const item of actor.items.filter(i => ["rope", "talent"].includes(i.id))) item.visible = false;
  assert.equal(view().panels.some(p => p.id === "talents"), false);
  assert.deepEqual(view().panels.find(p => p.id === "trappings").sections.map(s => s.id), ["encumbrance"]);
});

for (const use5e of [false, true]) {
  test(`Warhammer ${use5e ? "5e" : "4e"} shows native encumbrance first in Combat and Trappings without edit controls`, t => {
    const actor = createWarhammerActor();
    installGlobals(t, { game: createWarhammerGame([actor], { use5e }) });
    for (const current of ["4.50", 3.25, "0.00", "12.75"]) {
      actor.system.status.encumbrance.current = current;
      const view = integration.createActorViewRecord(actor, game.user);
      for (const tab of view.panels.filter(tab => ["combat", "trappings"].includes(tab.id))) {
        assert.deepEqual(tab.sections[0].rows[0], { id: "encumbrance", label: "Encumbrance", value: Number(current), max: 8, format: "number" });
      }
    }
    for (const current of [undefined, null, "", " ", "invalid", Infinity, false]) {
      actor.system.status.encumbrance.current = current;
      const view = integration.createActorViewRecord(actor, game.user);
      assert.equal(fields(view).some(row => row.id === "encumbrance"), false);
    }
  });
}
