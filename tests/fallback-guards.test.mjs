import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryBiographyGateway } from "../src/foundry/actors/biography-gateway.mjs";
import { createArmorClassGateway } from "../src/foundry/actors/armor-class-gateway.mjs";
import { createFoundryPreferencesGateway } from "../src/foundry/settings/preferences.mjs";
import { createFoundryCombatGateway } from "../src/foundry/combat/combat-gateway.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { collection, createActor, createGame, installGlobals } from "./helpers/foundry.mjs";

test("fallback ownership policy is independent of game type names", () => {
  const integration = resolveSystemIntegration("custom");
  for (const type of ["Player", "NPC", "creature", "character", "vehicle", "anything"]) {
    const actor = createActor({ type });
    assert.equal(integration.isActorEligible(actor, { id: "owner" }), true);
    actor.testUserPermission = (_user, level) => level === "OBSERVER";
    assert.equal(integration.isActorEligible(actor, { id: "observer" }), false);
    assert.equal(integration.isActorEligible(actor, { isGM: true }), true);
    actor.testUserPermission = () => { throw new Error("permission failure"); };
    assert.equal(integration.isActorEligible(actor, { id: "owner" }), false);
  }
});

test("unprofiled actor resources and auxiliary editors cannot be reached directly", async t => {
  const actor = createActor();
  for (const key of ["system", "items", "flags"]) Object.defineProperty(actor, key, { get() { throw new Error(`unexpected ${key} read`); } });
  const game = createGame([actor], "custom");
  installGlobals(t, { game });
  const request = { actorSourceUuid: actor.uuid };
  const biography = createFoundryBiographyGateway();
  await assert.rejects(biography.read(request), /Use the character sheet/);
  await assert.rejects(biography.roll({ ...request, formula: "1d100" }), /Use the character sheet/);
  await assert.rejects(createArmorClassGateway().open(request), /Use the character sheet/);
});
test("fallback combat does not read D&D tie-break settings", t => {
  const game = createGame([], "wfrp4e");
  game.combat = { id: "combat", turns: [] };
  game.settings.get = () => { throw new Error("D&D settings must not be read"); };
  installGlobals(t, { game });
  assert.equal(createFoundryCombatGateway().snapshot().initiativeDecimals, 0);
});
