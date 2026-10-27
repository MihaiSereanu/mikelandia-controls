import test from "node:test";
import assert from "node:assert/strict";
import { controlsGuideSections } from "../src/kernel/controls-guide-model.mjs";
import { createFoundryPreferencesGateway, registerPreferences } from "../src/foundry/preferences.mjs";
import { createFoundryActionSessionGateway } from "../src/foundry/action-session-gateway.mjs";
import { sessionInvalidationForHook } from "../src/foundry/session-gateway.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { createActor, createGame, installGlobals } from "./helpers/foundry.mjs";

function setup(t, system = "wfrp4e", initial = {}) {
  const game = createGame([], system), writes = [], stored = new Map(Object.entries(initial)), registered = new Map();
  game.i18n = { lang: "en", localize: key => key };
  game.settings = {
    settings: registered,
    get(namespace, key) { return stored.has(`${namespace}.${key}`) ? stored.get(`${namespace}.${key}`) : registered.get(`${namespace}.${key}`)?.default; },
    async set(namespace, key, value) { writes.push([namespace, key, value]); stored.set(`${namespace}.${key}`, value); return value; },
    register(namespace, key, definition) { registered.set(`${namespace}.${key}`, { ...definition, namespace, key }); }
  };
  installGlobals(t, { game });
  registerPreferences({ isMobilePresentation: () => true });
  const gateway = createFoundryPreferencesGateway({ getGame: () => game, getNavigator: () => ({}) });
  return { game, gateway, writes, stored, registered };
}
for (const system of ["wfrp4e", "shadowdark", "custom"]) {
  test(`${system} exposes effective shared preferences without changing saved D&D choices`, t => {
    const initial = { "ve-mobile.colorScheme": "class", "ve-mobile.headerArtwork": "obsolete", "ve-mobile.quickbarSource": "character",
      "ve-mobile.showActionSummaries": true, "ve-mobile.compactActionSummaries": true, "ve-mobile.characterFavouritesSource": "tidy" };
    const f = setup(t, system, initial);
    const snapshot = f.gateway.snapshot();
    assert.equal(snapshot.colorScheme, "neutral"); assert.equal(snapshot.headerArtwork, "off");
    assert.equal(snapshot.showActionSummaries, false); assert.equal(snapshot.compactActionSummaries, false);
    assert.equal(snapshot.characterFavouritesSource, "off"); assert.deepEqual(snapshot.characterCollections, {});
    const color = snapshot.fields.find(field => field.key === "colorScheme");
    assert.equal(color.value, "neutral"); assert.equal(color.choices.some(choice => choice.value === "class"), false);
    for (const key of ["headerArtwork", "headerArtworkOpacity", "showActionSummaries", "compactActionSummaries", "characterFavouritesSource"]) {
      assert.equal(snapshot.fields.some(field => field.key === key), false);
      assert.equal(f.registered.get(`ve-mobile.${key}`).config, false);
    }
    assert.equal(f.registered.get("ve-mobile.colorScheme").config, false, "native class picker stays hidden; shared mobile colors remain available");
    assert.deepEqual(f.writes, []); for (const [key, value] of Object.entries(initial)) assert.equal(f.stored.get(key), value);
  });
  test(`${system} direct preference writes cannot enable D&D-only features`, async t => {
    const f = setup(t, system);
    for (const [key, value] of [["headerArtwork", "race"], ["showActionSummaries", true], ["characterFavouritesSource", "core"], ["colorScheme", "class"]]) {
      await assert.rejects(f.gateway.set({ key, value }), /unavailable for the current game/);
    }
    await assert.rejects(f.gateway.setCharacterCollectionPreference({ key: "spellFilter", value: "prepared" }), /unavailable for the current game/);
    assert.deepEqual(f.writes, []);
    await f.gateway.set({ key: "colorScheme", value: "red" });
    assert.equal(f.gateway.frame().colorScheme, "red");
  });
  test(`${system} Restore Defaults preserves unsupported game preferences`, async t => {
    const initial = { "ve-mobile.colorScheme": "class", "ve-mobile.headerArtwork": "race", "ve-mobile.quickbarSource": "character",
      "ve-mobile.characterSpellFilter": "prepared", "ve-mobile.characterFavouritesSource": "tidy", "ve-mobile.showActionSummaries": true };
    const f = setup(t, system, initial);
    await f.gateway.restoreDefaults();
    for (const [key, value] of Object.entries(initial)) assert.equal(f.stored.get(key), value);
    assert.equal(f.writes.some(([_namespace, key]) => ["characterFavouritesSource", "characterSpellFilter", "headerArtwork", "quickbarSource", "showActionSummaries"].includes(key)), false);
  });
}
test("D&D keeps its native appearance and summary settings", async t => {
  const f = setup(t, "dnd5e");
  const snapshot = f.gateway.snapshot();
  assert.equal(snapshot.colorScheme, "class"); assert.equal(snapshot.headerArtwork, "automatic");
  assert.equal(snapshot.showActionSummaries, true);
  for (const key of ["headerArtwork", "headerArtworkOpacity", "showActionSummaries", "compactActionSummaries"]) {
    assert.equal(snapshot.fields.some(field => field.key === key), true); assert.equal(f.registered.get(`ve-mobile.${key}`).config, true);
  }
  await f.gateway.set({ key: "headerArtwork", value: "race" });
  assert.equal(f.gateway.character().headerArtwork, "race"); assert.equal(f.gateway.controls().characterPresentation, "legacy");
});
for (const presentation of ["profile", "native"]) {
  test(`${presentation} guide describes actual controls and omits D&D gestures`, () => {
    const sections = controlsGuideSections({ characterPresentation: presentation, actionBarSource: "foundry", canPlaceActor: true, split: true, presentation: "tablet" });
    const keys = sections.flatMap(section => section.entries);
    for (const key of ["Portrait", "Chooser", "Rows", "Quickbar", "Members", "ActorPlace", "SplitDrop", "TabletSplit"]) assert.equal(keys.includes(key), false);
    for (const key of ["NativeChooser", "NativeSheet", "Tablet"]) assert.equal(keys.includes(key), true);
    assert.equal(keys.includes("ProfileActions"), presentation === "profile");
  });
}
test("D&D guide retains its existing character gestures", () => {
  const keys = controlsGuideSections({ collective: true, canPlaceActor: true }).flatMap(section => section.entries);
  for (const key of ["Portrait", "Chooser", "Rows", "Members"]) assert.equal(keys.includes(key), true);
});
test("integration contributions own item-specific directory refreshes", () => {
  const item = { type: "class", parent: createActor() };
  for (const hook of ["createItem", "updateItem", "deleteItem"]) {
    assert.equal(sessionInvalidationForHook(hook, item, {}, resolveSystemIntegration("dnd5e")).directoryActorId, "hero");
    for (const system of ["wfrp4e", "shadowdark", "custom"]) assert.equal(sessionInvalidationForHook(hook, item, {}, resolveSystemIntegration(system)).directoryActorId, undefined);
  }
});
for (const system of ["wfrp4e", "shadowdark", "custom"]) {
  test(`${system} cannot enter D&D message-summary parsing through direct mount`, async () => {
    const game = createGame([], system);
    Object.defineProperty(game, "messages", { get() { throw new Error("must not parse messages"); } });
    const result = await createFoundryActionSessionGateway({ getGame: () => game, getDocument: () => { throw new Error("must not mount a D&D summary"); } }).mount({}, { rootMessageId: "message" }, {});
    assert.equal(result.ok, false);
  });
}
