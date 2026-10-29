import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/commands/command-gateway.mjs";
import { warhammerNotes } from "../src/systems/actor-notes.mjs";
import { createWarhammerActor, createWarhammerGame } from "./helpers/warhammer.mjs";
import { installGlobals } from "./helpers/foundry.mjs";

for (const use5e of [false, true]) {
  test(`Warhammer ${use5e ? "5e" : "4e"} ambitions retain native fields and reject stale, unsafe and unauthorized saves`, async t => {
    let owner = true, edition = use5e;
    const actor = createWarhammerActor({ testUserPermission: () => owner });
    actor.system.details = { biography: { value: "Biography" },
      "personal-ambitions": { "short-term": "Personal short", "long-term": "Personal long" },
      "party-ambitions": { name: "Company", "short-term": "Party short", "long-term": "Party long" } };
    const game = createWarhammerGame([actor], { use5e });
    game.settings.get = (_namespace, key) => key === "editionSettings" ? { use5e: edition } : undefined;
    installGlobals(t, { game });
    const fields = warhammerNotes.fields(actor, game);
    assert.deepEqual(fields.map(field => field.id), use5e ? ["personal-long", "party-long"] : ["personal-short", "personal-long", "party-short", "party-long"]);
    assert.ok(fields.every(field => typeof field.value === "string" && !("update" in field)));
    const writes = [];
    actor.update = async changes => {
      writes.push(changes);
      for (const [path, value] of Object.entries(changes)) {
        const keys = path.split(".");
        keys.slice(0, -1).reduce((parent, key) => parent[key], actor)[keys.at(-1)] = value;
      }
    };
    const gateway = createFoundryCommandGateway({ getGame: () => game });
    const payload = { actorSourceUuid: actor.uuid, section: "notes", biographyField: "personal-long",
      notesContextRevision: use5e ? "5e" : "4e", originalValue: "Personal long", value: "New ambition" };
    await gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, payload);
    assert.deepEqual(writes, [{ "system.details.personal-ambitions.long-term": "New ambition" }]);
    assert.equal(actor.system.details.biography.value, "Biography");
    assert.equal(actor.system.details["personal-ambitions"]["short-term"], "Personal short");
    assert.equal(actor.system.details["party-ambitions"]["long-term"], "Party long");
    await assert.rejects(gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, payload), { code: "STALE_STATE" });
    const fresh = { ...payload, originalValue: "New ambition", value: "" };
    for (const invalid of [{ biographyField: "system.details.gmnotes.value" }, { path: "system.details.gmnotes.value" }, { value: "x".repeat(20001) }]) {
      await assert.rejects(gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, { ...fresh, ...invalid }), { code: "INVALID_INPUT" });
    }
    if (use5e) await assert.rejects(gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, { ...fresh, biographyField: "personal-short" }), { code: "INVALID_INPUT" });
    edition = !edition;
    await assert.rejects(gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, fresh), { code: "STALE_STATE" });
    if (!use5e) await assert.rejects(gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, { ...fresh, biographyField: "party-short", originalValue: "Party short" }), { code: "STALE_STATE" });
    edition = use5e; owner = false;
    await assert.rejects(gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, fresh), { code: "FORBIDDEN" });
    owner = true;
    await gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, fresh);
    assert.equal(actor.system.details["personal-ambitions"]["long-term"], "");
    assert.equal(writes.length, 2);
    if (!use5e) {
      await gateway.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, { ...fresh, biographyField: "party-short", originalValue: "Party short", value: "Next session goal" });
      assert.deepEqual(writes.at(-1), { "system.details.party-ambitions.short-term": "Next session goal" });
      assert.equal(actor.system.details["party-ambitions"]["long-term"], "Party long");
    }
  });
}
