import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/commands/command-gateway.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { installGlobals } from "./helpers/foundry.mjs";
import { createWarhammerActor, createWarhammerGame } from "./helpers/warhammer.mjs";

for (const use5e of [false, true]) for (const endurance of [false, true]) {
  test(`native recovery ${use5e ? "5e" : "4e"}, ${endurance ? "Endurance" : "Toughness"}`, async t => {
    const actor = createWarhammerActor();
    actor.characteristics = { t: { bonus: 3 } };
    const skill = { id: "endurance", name: "Endurance", type: "skill", parent: actor, system: {} };
    actor.itemTags = { skill: endurance ? [skill] : [] };
    if (endurance) actor.items.push(skill);
    const game = createWarhammerGame([actor], { use5e });
    installGlobals(t, { game });
    const calls = [];
    let result = { actor, roll: async () => calls.push("roll") };
    actor.setupSkill = actor.setupCharacteristic = async (...args) => { calls.push(args); return result; };
    const gateway = createFoundryCommandGateway();
    const action = () => gateway.capabilitiesForActor(actor).profileActions.find(action => action.id === "rest");
    const payload = () => ({ actorSourceUuid: actor.uuid, actionId: "rest", actionRevision: action().revision });
    const record = resolveSystemIntegration("wfrp4e").createActorViewRecord(actor, game.user, gateway.capabilitiesForActor);
    const wounds = record.panels[0].sections.find(section => section.id === "wounds").rows[0];
    assert.equal(wounds.secondaryAction.id, "rest");
    assert.equal(wounds.secondaryAction.icon, "fa-bed");
    await gateway.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, payload());
    assert.deepEqual(calls, [[endurance ? skill : "t", { rest: true, tb: 3, skipTargets: true }, { resolveClose: true }], "roll"]);
    for (const value of [undefined, null, false]) {
      calls.length = 0;
      result = value;
      assert.equal((await gateway.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, payload())).cancelled, true);
      assert.equal(calls.length, 1);
    }
    calls.length = 0;
    actor.setupSkill = actor.setupCharacteristic = async () => { actor.characteristics.t.bonus = 4; return { actor, roll: async () => calls.push("roll") }; };
    await assert.rejects(gateway.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, payload()), { code: "CAPABILITY_UNAVAILABLE" });
    assert.deepEqual(calls, []);
    actor.characteristics.t.bonus = 3;
    if (endurance) {
      actor.setupSkill = async () => { actor.items = actor.items.filter(item => item !== skill); return { actor, roll: async () => calls.push("roll") }; };
      await assert.rejects(gateway.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, payload()), { code: "CAPABILITY_UNAVAILABLE" });
      assert.deepEqual(calls, []);
    }
  });
}

test("movement and XP tables retain prepared native values without editors", t => {
  const actor = createWarhammerActor();
  const game = createWarhammerGame([actor]);
  installGlobals(t, { game });
  actor.system.details = { move: { value: 7, walk: "19", run: "26 (mounted)" }, experience: { current: 31, spent: 57, total: 100 } };
  actor.system.autoCalc = { walk: true, run: false };
  const integration = resolveSystemIntegration("wfrp4e");
  const sections = () => integration.createActorViewRecord(actor, game.user).panels.flatMap(tab => tab.sections);
  const movement = sections().find(section => section.id === "movement");
  assert.equal(movement.layout, "table");
  assert.deepEqual(movement.rows.map(row => row.value), [7, "19 yds", "26 (mounted)"]);
  const xp = sections().find(section => section.id === "experience");
  assert.equal(xp.layout, "table");
  assert.deepEqual(xp.rows.map(row => row.value), [31, 57, 100], "Current is native prepared, never recalculated");
  assert.ok([...xp.rows, ...movement.rows].every(row => !row.edit && !row.action));
  actor.system.autoCalc = { walk: false, run: true };
  assert.deepEqual(sections().find(section => section.id === "movement").rows.map(row => row.value), [7, "19", "26 (mounted) yds"]);
});
