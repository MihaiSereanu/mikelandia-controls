import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryDamageGateway } from "../src/foundry/actors/damage-gateway.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";
import { createActor, createGame, createHooks, installGlobals } from "./helpers/foundry.mjs";

for (const system of ["dnd5e", "shadowdark", "wfrp4e"]) {
  test(`${system}: raw health updates report individual hits and ignore healing and max changes`, t => {
    const actor = createActor({ type: system === "shadowdark" ? "Player" : "character" });
    if (system === "wfrp4e") actor.system = { status: { wounds: { value: 12, max: 12 } } };
    const resource = system === "wfrp4e" ? actor.system.status.wounds : actor.system.attributes.hp;
    const hooks = createHooks();
    installGlobals(t, { game: createGame([actor], system), Hooks: hooks });
    const scope = createTaskScope(); t.after(() => scope.dispose());
    const hits = [];
    createFoundryDamageGateway().watch(scope, { getSource: () => actor.uuid, isActive: () => true, onDamage: hit => hits.push(hit), onReset() {} });
    assert.equal(hits.length, 0);
    resource.value -= 2; hooks.emit("updateActor", actor, { system: {} });
    resource.value -= 1; hooks.emit("updateActor", actor, { "system.attributes.hp.value": resource.value });
    assert.deepEqual(hits.map(h => h.amount), [2, 1]);
    assert.equal(hits[0].noun, system === "wfrp4e" ? "wounds" : "damage");
    resource.value += 3; hooks.emit("updateActor", actor, {});
    resource.max += 5; hooks.emit("updateActor", actor, {});
    assert.equal(hits.length, 2);
    if (system === "dnd5e") {
      resource.temp = 0; hooks.emit("updateActor", actor, {});
      assert.equal(hits.at(-1).amount, 2);
    }
    scope.dispose();
    assert.equal(hooks.count("updateActor"), 0);
  });
}

for (const system of ["dnd5e", "shadowdark", "wfrp4e"]) {
  test(`${system}: zero crossing is distinct and resets only on remaining-health changes`, t => {
    const actor = createActor({ type: system === "shadowdark" ? "Player" : "character" });
    if (system === "wfrp4e") actor.system = { status: { wounds: { value: 7, max: 12 } } };
    const resource = system === "wfrp4e" ? actor.system.status.wounds : actor.system.attributes.hp;
    const hooks = createHooks();
    installGlobals(t, { game: createGame([actor], system), Hooks: hooks });
    const scope = createTaskScope(); t.after(() => scope.dispose());
    let resets = 0; const hits = [];
    createFoundryDamageGateway().watch(scope, { getSource: () => actor.uuid, isActive: () => true, onDamage: h => hits.push(h), onReset: () => resets++ });
    resource.value = 0; hooks.emit("updateActor", actor, {});
    assert.equal(hits.at(-1).down, true);
    assert.equal(hits.at(-1).amount, 7);
    const afterZero = resets;
    resource.max++; hooks.emit("updateActor", actor, {});
    assert.equal(resets, afterZero);
    if (system === "dnd5e") {
      resource.temp--; hooks.emit("updateActor", actor, {});
      assert.equal(resets, afterZero);
      assert.equal(hits.at(-1).down, false);
    }
    resource.value = -1; hooks.emit("updateActor", actor, {});
    assert.equal(resets, afterZero + 1);
    assert.equal(hits.at(-1).down, false);
    resource.value = 2; hooks.emit("updateActor", actor, {});
    resource.value = -2; hooks.emit("updateActor", actor, {});
    assert.equal(hits.at(-1).down, true);
  });
}

test("selection, reconnect, ownership and exact synthetic identities isolate damage", t => {
  const a = createActor(), b = createActor({ uuid: "Scene.s.Token.t.Actor.hero", isToken: true });
  const documents = new Map([[a.uuid, a], [b.uuid, b]]);
  const hooks = createHooks();
  installGlobals(t, { game: createGame([a]), Hooks: hooks });
  const scope = createTaskScope(); t.after(() => scope.dispose());
  let source = a.uuid, active = true, resets = 0;
  const hits = [];
  const watcher = createFoundryDamageGateway({ resolveActor: uuid => documents.get(uuid) }).watch(scope, {
    getSource: () => source, isActive: () => active, onDamage: hit => hits.push(hit), onReset: () => resets++
  });
  b.system.attributes.hp.value -= 1; hooks.emit("updateActor", b, {});
  assert.equal(hits.length, 0);
  source = b.uuid; watcher.refresh();
  a.system.attributes.hp.value -= 1; hooks.emit("updateActor", a, {});
  assert.equal(hits.length, 0);
  b.system.attributes.hp.value -= 1; hooks.emit("updateActor", b, {});
  assert.equal(hits.length, 1);
  active = false; watcher.refresh(); b.system.attributes.hp.value -= 1; hooks.emit("updateActor", b, {});
  active = true; watcher.refresh(); hooks.emit("updateActor", b, {});
  assert.equal(hits.length, 1);
  b.testUserPermission = () => false;
  b.system.attributes.hp.value -= 1; hooks.emit("updateActor", b, {});
  b.testUserPermission = () => true; hooks.emit("updateActor", b, {});
  assert.equal(hits.length, 1);
  assert.ok(resets >= 4);
});

test("NPCs, unsupported systems and invalid health produce no feedback", t => {
  const actor = createActor({ type: "npc" }), hooks = createHooks();
  const game = createGame([actor]);
  installGlobals(t, { game, Hooks: hooks });
  const scope = createTaskScope(); t.after(() => scope.dispose());
  const hits = [];
  const watcher = createFoundryDamageGateway().watch(scope, { getSource: () => actor.uuid, isActive: () => true, onDamage: hit => hits.push(hit), onReset() {} });
  actor.system.attributes.hp.value--; hooks.emit("updateActor", actor, {});
  actor.type = "character"; actor.system.attributes.hp.value = NaN; hooks.emit("updateActor", actor, {});
  game.system.id = "unknown"; watcher.refresh();
  actor.system.attributes.hp.value = 1; hooks.emit("updateActor", actor, {});
  assert.equal(hits.length, 0);
});
