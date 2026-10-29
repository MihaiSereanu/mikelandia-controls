import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryBiographyGateway } from "../src/foundry/actors/biography-gateway.mjs";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/commands/command-gateway.mjs";
import { createActor, createGame, installGlobals } from "./helpers/foundry.mjs";

test("unsupported Warhammer actor types cannot read notes or enter the roll pipeline", async t => {
  let rollCalls = 0;
  const actor = createActor({ type: "npc" });
  Object.defineProperty(actor, "system", { get() { throw new Error("Unsupported actor data must not be read"); } });
  const game = createGame([actor], "wfrp4e");
  installGlobals(t, { game });
  const gateway = createFoundryBiographyGateway({ getGame: () => game,
    getRollClass: () => ({ create() { rollCalls++; throw new Error("Unexpected native roll"); } }),
    getTextEditor: () => ({ enrichHTML() { throw new Error("Unexpected enrichment"); } }) });
  await assert.rejects(gateway.read({ actorSourceUuid: actor.uuid }), /Notes are unavailable/);
  await assert.rejects(gateway.roll({ actorSourceUuid: actor.uuid, formula: "1d100" }), /Notes are unavailable/);
  assert.equal(rollCalls, 0);
});

for (const systemId of ["wfrp4e", "shadowdark"]) {
  test(`${systemId} notes keep the busy guard until writes settle and release it after rejection`, async t => {
    const actor = createActor({ type: systemId === "shadowdark" ? "Player" : "character",
      system: systemId === "shadowdark" ? { notes: "Old" } : { details: { biography: { value: "Old" } } } });
    const game = createGame([actor], systemId);
    installGlobals(t, { game });
    let releaseWrite, rejectWrite;
    actor.update = async changes => {
      await new Promise((resolve, reject) => { releaseWrite = resolve; rejectWrite = reject; });
      if (systemId === "shadowdark") actor.system.notes = changes["system.notes"];
      else actor.system.details.biography.value = changes["system.details.biography.value"];
    };
    const gateway = createFoundryCommandGateway({ getGame: () => game });
    const payload = { actorSourceUuid: actor.uuid, section: "notes", biographyField: "notes", originalValue: "Old", value: "New" };
    const first = gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, payload);
    await assert.rejects(gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, payload), { code: "COMMAND_BUSY" });
    releaseWrite(); await first;
    const nextPayload = { ...payload, originalValue: "New", value: "Next" };
    const rejected = gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, nextPayload);
    await assert.rejects(gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, nextPayload), { code: "COMMAND_BUSY" });
    rejectWrite(new Error("Native rejection"));
    await assert.rejects(rejected, /Native rejection/);
    const retry = gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, nextPayload);
    releaseWrite(); await retry;
    assert.equal(systemId === "shadowdark" ? actor.system.notes : actor.system.details.biography.value, "Next");
  });
  test(`${systemId} notes preserve native fields, permissions and conflicts`, async t => {
    let owner = true;
    const actor = createActor({ type: systemId === "shadowdark" ? "Player" : "character",
      system: systemId === "shadowdark" ? { notes: "<p>Old</p>" } : { details: { biography: { value: "<p>Old</p>" }, gmnotes: { value: "Secret" } } },
      testUserPermission: () => owner });
    const writes = [];
    actor.update = async changes => {
      writes.push(changes);
      if (systemId === "shadowdark") actor.system.notes = changes["system.notes"];
      else actor.system.details.biography.value = changes["system.details.biography.value"];
    };
    const game = createGame([actor], systemId);
    installGlobals(t, { game });
    const read = createFoundryBiographyGateway({ getGame: () => game,
      getTextEditor: () => ({ enrichHTML: async source => source }) });
    const gateway = createFoundryCommandGateway({ getGame: () => game });
    const result = await read.read({ actorSourceUuid: actor.uuid });
    assert.equal(result.html, "<p>Old</p>");
    assert.equal(result.editField, "notes");
    assert.equal(result.editable, true);
    const payload = { actorSourceUuid: actor.uuid, section: "notes", biographyField: "notes", originalValue: "<p>Old</p>", value: "<p>New</p>" };
    await gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, payload);
    assert.deepEqual(writes, [{ [systemId === "shadowdark" ? "system.notes" : "system.details.biography.value"]: "<p>New</p>" }]);
    await assert.rejects(gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, payload), { code: "STALE_STATE" });
    await assert.rejects(gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, { ...payload, biographyField: "gmnotes" }), { code: "INVALID_INPUT" });
    owner = false;
    await assert.rejects(read.read({ actorSourceUuid: actor.uuid }));
    await assert.rejects(gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, payload));
    assert.equal(writes.length, 1);
  });
}
