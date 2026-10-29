import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/commands/command-gateway.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { installGlobals } from "./helpers/foundry.mjs";
import { createWarhammerActor, createWarhammerGame, addWarhammerConditions } from "./helpers/warhammer.mjs";

for (const use5e of [false, true]) test(`WFRP ${use5e ? "5e" : "4e"} conditions retain native actions, ownership and stale checks`, async t => {
  const actor = createWarhammerActor();
  const game = createWarhammerGame([actor], { use5e });
  installGlobals(t, { game });
  const calls = addWarhammerConditions(actor, game);
  const gateway = createFoundryCommandGateway({ getGame: () => game });
  const actions = () => gateway.capabilitiesForActor(actor).profileActions;
  const conditions = resolveSystemIntegration("wfrp4e").createActorViewRecord(actor, game.user, gateway.capabilitiesForActor)
    .panels.find(tab => tab.id === "effects").sections[0].conditions;
  assert.equal(conditions.length, 14);
  assert.equal(conditions.every(condition => Array.isArray(condition.description)), use5e, "5e quick references must not override 4e rules");
  if (use5e) {
    assert.match(conditions.find(condition => condition.id === "grappling").description.join(" "), /Opposed Strength Test/u);
    assert.doesNotMatch(conditions.find(condition => condition.id === "grappling").description.join(" "), /higher Advantage/u);
  }
  const payload = action => ({ actorSourceUuid: actor.uuid, actionId: action.id, actionRevision: action.revision });
  const run = id => gateway.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, payload(actions().find(action => action.id === id)));
  assert.equal(actions().some(action => action.id.includes("dead")), false);
  assert.equal(actions().some(action => action.id === "condition:bleeding:remove"), false);
  const old = actions().find(action => action.id === "condition:bleeding:add");
  await run("condition:bleeding:add");
  await assert.rejects(gateway.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, payload(old)), { code: "STALE_STATE" });
  await run("condition:bleeding:add");
  assert.equal(actor.hasCondition("bleeding").conditionValue, 2);
  await run("condition:bleeding:apply-0");
  assert.deepEqual(calls.slice(0, 3), [["add", "bleeding", 1], ["add", "bleeding", 1], ["apply", actor]]);
  await run("condition:bleeding:remove"); await run("condition:bleeding:remove");
  assert.equal(actor.hasCondition("bleeding"), undefined);
  assert.equal(actions().some(action => action.id === "condition:bleeding:apply-0"), false);
  await run("condition:prone:add");
  assert.equal(actions().some(action => action.id === "condition:prone:add"), false);
  const remove = payload(actions().find(action => action.id === "condition:prone:remove"));
  actor.testUserPermission = () => false;
  await assert.rejects(gateway.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, remove), { code: "FORBIDDEN" });
});

test("Effects preserve native visibility, source concealment, grouping and read-only item rows", t => {
  const actor = createWarhammerActor();
  const game = createWarhammerGame([actor]); installGlobals(t, { game });
  const disease = { id: "disease", type: "disease", name: "Hidden disease", parent: actor, system: { show: false, description: { value: "Concealed" } } };
  const psychology = { id: "psychology", type: "psychology", name: "Fear", parent: actor, system: { description: { value: "Player notes" } } };
  actor.items.push(disease, psychology);
  actor.allApplicableEffects = () => [
    { id: "secret", name: "Secret effect", show: false },
    { id: "one", name: "Blessed", show: true, isTemporary: true, source: "Prayer" },
    { id: "two", name: "Blessed", show: true, isTemporary: true, source: "Prayer" },
    { id: "passive", name: "Logic duplicate", show: true, isTemporary: false },
    { id: "three", name: "Penalty", show: true, disabled: true, item: disease, source: "Hidden disease" }
  ];
  const read = () => resolveSystemIntegration("wfrp4e").createActorViewRecord(actor, game.user).panels.find(tab => tab.id === "effects");
  const record = read();
  assert.deepEqual(record.sections.map(section => section.id), ["conditions", "psychology", "disabled-effects"]);
  assert.ok(!JSON.stringify(record).includes("Blessed") && !JSON.stringify(record).includes("Logic duplicate"));
  assert.equal(record.sections.at(-1).rows[0].value, "???");
  assert.ok(!JSON.stringify(record).includes("Hidden disease"));
  assert.ok(record.sections.flatMap(section => section.rows).every(row => !row.edit && !row.action));
  disease.system.show = true;
  const row = read().sections.find(section => section.id === "disease").rows[0];
  assert.equal(row.value, "??? / ???");
});
