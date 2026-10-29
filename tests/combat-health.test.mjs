import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryCombatGateway } from "../src/foundry/combat/combat-gateway.mjs";
import { createFoundrySessionGateway, sessionInvalidationForHook } from "../src/foundry/session/session-gateway.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { createActor, createGame, createHooks, installGlobals } from "./helpers/foundry.mjs";
import { combatHealthText } from "../src/features/combat/health.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";

test("Initiative projects native token health for every supported system", () => {
  for (const system of ["dnd5e", "wfrp4e", "shadowdark"]) {
    const actor = createActor({ testUserPermission: () => false });
    const game = createGame([actor], system);
    const hp = { value: 5, max: 10 };
    const synthetic = { ...actor, system: system === "wfrp4e" ? { status: { wounds: hp } } : { attributes: { hp } } };
    game.combat = { id: "fight", turns: [
      { id: "friend", actor, token: { disposition: 1, actor: synthetic } },
      { id: "enemy", actor, token: { disposition: -1, actor: synthetic }, isDefeated: true },
      { id: "neutral", token: { disposition: 0, actor: synthetic } },
      { id: "tokenless", actor },
      { id: "unknown-disposition", token: { actor: synthetic } },
      { id: "enemy-without-health", token: { disposition: -1 } },
      { id: "hidden", visible: false, token: { disposition: 1, actor: synthetic } }
    ] };
    const gateway = createFoundryCombatGateway({ getGame: () => game });
    const rows = gateway.snapshot().combatants;
    assert.deepEqual(rows.map(row => row.id), ["friend", "enemy", "neutral", "tokenless", "unknown-disposition", "enemy-without-health"]);
    assert.deepEqual(rows.map(row => row.enemy), [false, true, true, false, false, true]);
    assert.equal(rows[0].health.value, 5); assert.equal(rows[0].health.max, 10);
    assert.deepEqual(rows[1].health, { status: "Bloodied" });
    assert.deepEqual(rows[2].health, { status: "Bloodied" });
    assert.equal(rows[1].defeated, true);
    assert.equal(rows[3].health, null); assert.equal(rows[4].health, null);
    assert.equal(rows[5].health, null);
    hp.value = 1;
    assert.deepEqual(gateway.snapshot().combatants[1].health, { status: "Critical" });
    hp.max = 0;
    assert.equal(gateway.snapshot().combatants[0].health, null);
  }
});

test("health invalidates Combat for value, maximum and parent replacements without broad system refreshes", () => {
  for (const system of ["dnd5e", "wfrp4e", "shadowdark"]) {
    const integration = resolveSystemIntegration(system);
    const base = system === "wfrp4e" ? "system.status.wounds" : "system.attributes.hp";
    for (const isToken of [false, true]) {
      const actor = createActor({ isToken });
      for (const path of [`${base}.value`, `${base}.max`, base, "system"]) {
        assert.ok(sessionInvalidationForHook("updateActor", actor, { [path]: 0 }, integration).domains.includes("combat"), `${system} ${path}`);
      }
      for (const path of [`${base}.temp`, "system.details.notes.value"]) {
        assert.equal(sessionInvalidationForHook("updateActor", actor, { [path]: 0 }, integration).domains.includes("combat"), false);
      }
      const nested = system === "wfrp4e" ? {system: {status: {wounds: {value: 0}}}} : {system: {attributes: {hp: {value: 0}}}};
      assert.ok(sessionInvalidationForHook("updateActor", actor, nested, integration).domains.includes("combat"));
    }
  }
  assert.equal(sessionInvalidationForHook("updateActor", createActor(), { "system.attributes.hp.value": 0 }, resolveSystemIntegration("unknown")).domains.includes("combat"), false);
});

test("shared health text localizes both native resource and qualitative state", () => {
  const commands = { readLocale: () => "de", localize: (key, fallback) => ({ Wounds: "Wunden", "MIKELANDIA_CONTROLS.Targets.Bloodied": "Verwundet" }[key] ?? fallback) };
  assert.equal(combatHealthText(null, commands), "");
  assert.equal(combatHealthText({ status: "Bloodied" }, commands), "Verwundet");
  assert.equal(combatHealthText({ value: 5, max: 10, labelKey: "Wounds", label: "Wounds" }, commands), "Wunden 5 / 10");
});

test("session publishes Initiative health when an unowned enemy changes HP", async t => {
  const hero = createActor(), game = createGame([hero]), hooks = createHooks();
  game.user.character = hero;
  const enemy = createActor({ id: "enemy", uuid: "Actor.enemy", testUserPermission: () => false });
  game.combat = { id: "fight", turns: [{ id: "enemy", token: { disposition: -1, actor: enemy }, actor: enemy }] };
  installGlobals(t, { game, Hooks: hooks });
  const combat = createFoundryCombatGateway({ getGame: () => game });
  const session = createFoundrySessionGateway({ combatForSnapshot: () => combat.snapshot() });
  session.read();
  const scope = createTaskScope(); t.after(() => scope.dispose());
  const snapshots = [];
  session.watch(scope, snapshot => snapshots.push(snapshot), error => { throw error; });
  enemy.system.attributes.hp.value = 1;
  hooks.emit("updateActor", enemy, { "system.attributes.hp.value": 1 });
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(snapshots.at(-1).combat.combatants[0].health.status, "Critical");
  assert.equal(snapshots.at(-1).selectedActor.id, hero.id);
});
