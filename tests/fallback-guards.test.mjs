import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryBiographyGateway } from "../src/foundry/biography-gateway.mjs";
import { createArmorClassGateway } from "../src/foundry/armor-class-gateway.mjs";
import { createFoundryQuickbarGateway } from "../src/foundry/quickbar-gateway.mjs";
import { createFoundryPreferencesGateway } from "../src/foundry/preferences.mjs";
import { createFoundryHotbarGateway } from "../src/foundry/hotbar-gateway.mjs";
import { createFoundryCombatGateway } from "../src/foundry/combat-gateway.mjs";
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
  const game = createGame([actor], "wfrp4e");
  installGlobals(t, { game });
  const request = { actorSourceUuid: actor.uuid };
  const biography = createFoundryBiographyGateway();
  await assert.rejects(biography.read(request), /Use the character sheet/);
  await assert.rejects(biography.roll({ ...request, formula: "1d100" }), /Use the character sheet/);
  await assert.rejects(createArmorClassGateway().open(request), /Use the character sheet/);
  const quickbar = createFoundryQuickbarGateway({ isActive: () => true });
  assert.equal(quickbar.snapshotForActor(actor).every(slot => slot === null), true);
  await assert.rejects(quickbar.add(request), { code: "CAPABILITY_UNAVAILABLE" });
  await assert.rejects(quickbar.save(request), { code: "CAPABILITY_UNAVAILABLE" });
});

test("fallback uses existing Foundry hotbar preferences without overwriting client settings", t => {
  const game = createGame([], "shadowdark");
  game.settings.get = (_module, key) => key === "quickbarSource" ? "character" : undefined;
  installGlobals(t, { game });
  const preferences = createFoundryPreferencesGateway();
  assert.equal(preferences.actionMenu().quickbarSource, "foundry");
  assert.equal(preferences.actionSummaries().showActionSummaries, false);
  game.system.id = "dnd5e";
  assert.equal(preferences.actionMenu().quickbarSource, "character");
  assert.equal(preferences.actionSummaries().showActionSummaries, true);
});

test("existing hotbar macros execute through the shared pathway in Shadowdark", async t => {
  const game = createGame([], "shadowdark");
  let executed = 0;
  game.macros = collection([{ id: "macro", type: "script", canExecute: true, execute: async () => { executed++; } }]);
  game.user.hotbar = { 1: "macro" };
  installGlobals(t, { game });
  const gateway = createFoundryHotbarGateway({ isActive: () => true });
  assert.equal((await gateway.execute({ slot: 1, macroId: "macro" })).ok, true);
  assert.equal(executed, 1);
});

test("fallback combat does not read D&D tie-break settings", t => {
  const game = createGame([], "wfrp4e");
  game.combat = { id: "combat", turns: [] };
  game.settings.get = () => { throw new Error("D&D settings must not be read"); };
  installGlobals(t, { game });
  assert.equal(createFoundryCombatGateway().snapshot().initiativeDecimals, 0);
});
