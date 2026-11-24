import test from "node:test";
import assert from "node:assert/strict";
import { libraryIdentity, createOfflineStorage } from "../src/offline/storage.mjs";
import { actorDocument, offlineSystemLabel, offlineImageUrls, portraitUrls, pruneLibrary, safeUrl } from "../src/offline/content.mjs";
import { createFoundrySessionGateway } from "../src/foundry/session/session-gateway.mjs";
import { createActor, createGame, installGlobals } from "./helpers/foundry.mjs";
import { createNativeSystemFixture } from "./helpers/native-systems.mjs";
import { createShadowdarkFixture } from "./helpers/shadowdark.mjs";
import { createWarhammerActor, createWarhammerGame } from "./helpers/warhammer.mjs";

test("library identity separates hosts, prefixes, worlds, systems and players, retaining system upgrades", () => {
  const world = { id: "same", systemId: "swade", systemVersion: "1" }, user = { id: "same" };
  const key = (base = "https://example.test/", w = world, u = user) => libraryIdentity(base, w, u).id;
  const original = key();
  for (const other of [key("https://other.test/"), key("https://example.test/foundry/"), key(undefined, { ...world, id: "other" }),
    key(undefined, { ...world, systemId: "dnd5e" }), key(undefined, world, { id: "other" })]) assert.notEqual(other, original);
  assert.equal(key(undefined, { ...world, systemVersion: "2" }), original);
  assert.throws(() => key(undefined, world, { ...user, isGM: true }));
});

test("revocation removes actors/pages/previews/media while retaining other permitted text", () => {
  const data = { actors: [{ id: "Actor.a" }, { id: "Actor.b" }], journals: [{ id: "j", pages: [{ id: "yes" }, { id: "no" }] }, { id: "gone", pages: [] }],
    references: ["private"], media: ["private"], party: {}, savedAt: "yesterday" };
  const result = pruneLibrary(data, { actors: [{ sourceUuid: "Actor.a" }], journals: [{ id: "j", pages: [{ id: "yes" }] }] });
  assert.deepEqual(result.actors, [{ id: "Actor.a" }]);
  assert.deepEqual(result.journals, [{ id: "j", pages: [{ id: "yes" }] }]);
  assert.deepEqual(result.references, []); assert.deepEqual(result.media, []); assert.equal(result.party, null);
  assert.equal(data.actors.length, 2);
});

test("prepared projection omits executable metadata, enriches exact document descriptions and preserves false/zero", async () => {
  const calls = [];
  const result = await actorDocument({ sourceUuid: "Actor.a", name: "Elsa", panels: [{ label: "Main", sections: [{ label: "Stats", rows: [
    { label: "Wounds", value: 0, max: 12, action: { id: "roll-me" }, edit: { path: "secret" } },
    { label: "Equipped", value: false }, { label: "Spell", descriptionUuid: "Actor.a.Item.spell", description: "source", showCastButton: true }
  ] }] }], notesRevision: "never persist", capabilities: { method: "execute" } }, {
    html: text => `safe:${text}`, enrich: async (...args) => { calls.push(args); return "permitted"; }
  });
  const text = JSON.stringify(result);
  assert.ok(text.includes('"value":0')); assert.ok(text.includes('"value":false'));
  assert.ok(text.includes("safe:permitted"));
  for (const denied of ["secret", "never persist", "execute"]) assert.ok(!text.includes(denied));
  assert.equal(result.view.panels[0].sections[0].rows[0].action.revision, "offline");
  assert.equal(calls[0][0], "Actor.a.Item.spell"); assert.equal(calls[0][2].fragment, false);
});

for (const system of ["dnd5e", "shadowdark", "wfrp4e", "swade", "honor-and-intrigue"]) test(`${system}: offline projection reads unopened characters without changing current selection`, async t => {
  const fixture = system === "shadowdark" ? createShadowdarkFixture() : ["swade", "honor-and-intrigue"].includes(system) ? createNativeSystemFixture(system) : null;
  const actor = fixture?.actor ?? (system === "wfrp4e" ? createWarhammerActor() : createActor());
  const game = fixture?.game ?? (system === "wfrp4e" ? createWarhammerGame([actor]) : createGame([actor]));
  installGlobals(t, { game, CONFIG: { statusEffects: {} }, document: { createElement: () => ({ set innerHTML(value) { this.textContent = value; } }) } });
  const gateway = createFoundrySessionGateway({ capabilitiesForActor: () => ({}) });
  const first = gateway.read(); gateway.adopt(first);
  const record = gateway.readOfflineActor(actor.uuid);
  const result = await actorDocument(record, { html: text => text, enrich: async () => "safe description" });
  assert.equal(result.name, actor.name); assert.ok(result.view.panels?.length > 0 || result.view.abilities?.length > 0);
  assert.equal(gateway.read().selectedActorSourceUuid, first.selectedActorSourceUuid);
  actor.testUserPermission = () => false;
  assert.throws(() => gateway.readOfflineActor(actor.uuid), /no longer available/);
  game.user.isGM = true; assert.throws(() => gateway.readOfflineActor(actor.uuid), /GM sessions/);
});

test("offline resources reject executable, credential-bearing and empty URLs", () => {
  for (const value of ["", "javascript:alert(1)", "data:image/svg+xml,bad", "https://user:pass@example.test/image"]) assert.equal(safeUrl(value, "https://example.test/"), "");
  assert.equal(safeUrl("images/a.webp", "https://example.test/foundry/"), "https://example.test/foundry/images/a.webp");
});

test("an access change within a still-visible document removes its old contents and media", () => {
  const data = { actors: [{ id: "Actor.a", access: "old", img: "https://example.test/private.png" }, { id: "Actor.b", access: "same", img: "https://example.test/public.png" }],
    journals: [{ id: "j", access: "old-owner", pages: [{ id: "p", html: "old secret" }] }], media: [{ url: "https://example.test/private.png" }, { url: "https://example.test/public.png" }] };
  const result = pruneLibrary(data, { actors: [{ sourceUuid: "Actor.a" }, { sourceUuid: "Actor.b" }], journals: [{ id: "j", pages: [{ id: "p" }] }] },
    new Map([["Actor.a", "new-unidentified"], ["Actor.b", "same"]]), new Map([["j", "observer"]]));
  assert.deepEqual(result.actors.map(actor => actor.id), ["Actor.b"]);
  assert.deepEqual(result.journals, []);
  assert.deepEqual(result.media, [{ url: "https://example.test/public.png" }]);
});

test("portrait allowlist normalizes and deduplicates characters and Party without following content images", () => {
  const urls = portraitUrls({ actors: [{ img: "pc.webp", view: { inventory: [{ img: "item.webp" }], description: '<img src="inline.webp">' } }, { view: { img: "pc.webp" } }],
    party: { members: [{ img: "party.webp" }, { img: "pc.webp" }, { img: "javascript:bad" }] },
    journals: [{ img: "journal.webp", pages: [{ src: "page.webp" }] }], references: [{ html: '<img src="rule.webp">' }] }, "https://example.test/foundry/");
  assert.deepEqual([...urls], ["https://example.test/foundry/pc.webp", "https://example.test/foundry/party.webp"]);
});

test("refresh drops legacy content-image blobs and revoked portraits while retaining current Party portraits", () => {
  const pc = "https://example.test/pc.webp", party = "https://example.test/party.webp", item = "https://example.test/item.webp", page = "https://example.test/page.webp";
  const data = { actors: [{ id: "Actor.pc", img: pc, view: { inventory: [{ img: item }] } }], journals: [{ id: "j", pages: [{ id: "p", src: page }] }],
    media: [pc, party, item, page].map(url => ({ url })) };
  const manifest = { actors: [{ sourceUuid: "Actor.pc" }], journals: [{ id: "j", pages: [{ id: "p" }] }], party: { members: [{ img: party }] } };
  assert.deepEqual(pruneLibrary(data, manifest).media.map(entry => entry.url), [pc, party]);
  assert.deepEqual(pruneLibrary(data, { actors: [], journals: [], party: { members: [] } }).media, []);
});

test("unavailable browser storage rejects cleanly", async () => {
  await assert.rejects(createOfflineStorage({ indexedDB: null }).list(), /unavailable/);
});

test("saved system labels use the captured WFRP edition and readable supported names", () => {
  assert.equal(offlineSystemLabel({ world: { systemId: "wfrp4e" }, data: { actors: [{ view: { edition: "5e" } }] } }), "WFRP 5e");
  assert.equal(offlineSystemLabel({ world: { systemId: "wfrp4e" } }), "WFRP");
  assert.equal(offlineSystemLabel({ world: { systemId: "dnd5e" } }), "D&D5e");
  assert.equal(offlineSystemLabel({ world: { systemId: "custom-system" } }), "custom-system");
});

test("handout images match Journal or page names case-insensitively and exclude other media", () => {
  const data = { journals: [
    { name: "Campaign HANDOUTS", pages: [{ type: "image", src: "map.webp" }, { type: "pdf", src: "rules.pdf" }] },
    { name: "Notes", pages: [{ name: "Player handouts - letter", type: "image", src: "letter.webp" },
      { name: "Other", type: "image", src: "private.webp" }, { name: "Handouts", type: "image", src: "javascript:bad" }] }
  ] };
  assert.deepEqual([...offlineImageUrls(data, "https://example.test/")], ["https://example.test/map.webp", "https://example.test/letter.webp"]);
});

test("handout media survives unchanged refresh but is removed with renamed or revoked pages", () => {
  const url = "https://example.test/map.webp";
  const data = { actors: [], journals: [{ id: "j", name: "Handouts", access: "current", pages: [{ id: "p", type: "image", src: url }] }], media: [{ url }] };
  const manifest = { actors: [], journals: [{ id: "j", pages: [{ id: "p" }] }] };
  assert.deepEqual(pruneLibrary(data, manifest, null, new Map([["j", "current"]])).media, [{ url }]);
  assert.deepEqual(pruneLibrary(data, manifest, null, new Map([["j", "renamed"]])).media, []);
  assert.deepEqual(pruneLibrary(data, { actors: [], journals: [{ id: "j", pages: [] }] }).media, []);
  assert.deepEqual(pruneLibrary(data, { actors: [], journals: [] }).media, []);
});
