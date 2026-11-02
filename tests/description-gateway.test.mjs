import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryDescriptionGateway } from "../src/foundry/actors/description-gateway.mjs";

function fixture({ modern = false } = {}) {
  const game = { user: { id: "player" }, packs: new Map() };
  const actor = { uuid: "Actor.pc", documentName: "Actor", getRollData: () => ({ bonus: 2 }),
    testUserPermission: (_user, level) => level === "OBSERVER" || actor.owner, owner: true };
  const item = { uuid: "Actor.pc.Item.spell", name: "Spell", documentName: "Item", parent: actor,
    system: { description: { value: "[[/r 1d6 + @bonus]] @UUID[.Item.other]" } }, getRollData: () => ({ bonus: 7 }) };
  const docs = new Map([[actor.uuid, actor], [item.uuid, item]]), calls = [], messages = [];
  let enrichHook = () => {};
  const gateway = createFoundryDescriptionGateway({ getGame: () => game,
    resolve: async (uuid, options) => { calls.push({ uuid, options }); return docs.get(uuid); },
    getEditor: () => ({ enrichHTML: async (content, options) => { calls.push({ content, options }); await enrichHook(); return `<p>${content}</p>`; } }),
    stripPrivateContent: value => value,
    getRoll: () => ({ ...(modern ? { _mapLegacyRollMode: mode => ({ gmroll: "gm", blindroll: "blind", selfroll: "self", publicroll: "public", roll: "gm" })[mode] } : {}),
      create: (formula, data) => ({ toMessage: async (message, options) => { messages.push({ formula, data, message, options }); } }) }),
    getChat: () => ({ getSpeaker: input => input })
  });
  return { game, actor, item, docs, calls, messages, gateway, setHook: hook => { enrichHook = hook; } };
}

test("enrichment reads the current Item description and supplies exact relative/roll context", async () => {
  const f = fixture();
  const result = await f.gateway.enrich({ uuid: f.item.uuid, content: "stale snapshot" });
  assert.equal(result.uuid, f.item.uuid);
  assert.equal(f.calls[1].content, f.item.system.description.value);
  assert.deepEqual(f.calls[1].options, { secrets: false, documents: true, links: true, rolls: true,
    custom: true, embeds: false, relativeTo: f.item, rollData: { bonus: 7 } });
});

test("Shadowdark string descriptions and Active Effect descriptions use their native sources", async () => {
  const f = fixture();
  f.item.system.description = "Shadowdark spell";
  assert.match((await f.gateway.enrich({ uuid: f.item.uuid })).html, /Shadowdark spell/u);
  const effect = { uuid: `${f.item.uuid}.ActiveEffect.test`, parent: f.item, description: "Effect rules" };
  f.docs.set(effect.uuid, effect);
  assert.match((await f.gateway.enrich({ uuid: effect.uuid })).html, /Effect rules/u);
});

test("UUID previews use native relative resolution and readable compendium documents", async () => {
  const f = fixture();
  f.docs.set(".Item.other", f.item);
  await f.gateway.preview({ uuid: ".Item.other", relativeUuid: f.item.uuid });
  assert.equal(f.calls[1].options.relative, f.item);
  const pack = { uuid: "Compendium.rules.items.Item.spell", pack: "rules.items", visible: true,
    system: { description: "Pack spell" } };
  f.docs.set(pack.uuid, pack);
  assert.match((await f.gateway.preview({ uuid: pack.uuid })).html, /Pack spell/u);
  f.game.packs.set(pack.pack, { testUserPermission: () => false });
  await assert.rejects(f.gateway.preview({ uuid: pack.uuid }), /access/u);
});

test("missing or denied references never reach native enrichment", async () => {
  const f = fixture();
  await assert.rejects(f.gateway.preview({ uuid: "Item.missing" }), /access/u);
  f.actor.testUserPermission = () => false;
  await assert.rejects(f.gateway.preview({ uuid: f.item.uuid }), /access/u);
  assert.equal(f.calls.filter(call => "content" in call).length, 0);
});

test("permission loss, source changes and logout during enrichment discard the result", async () => {
  for (const change of [f => { f.actor.testUserPermission = () => false; },
    f => { f.item.system.description.value = "Changed"; }, f => { f.game.user = { id: "another-player" }; },
    f => { f.docs.delete(f.item.uuid); }]) {
    const f = fixture();
    f.setHook(() => change(f));
    await assert.rejects(f.gateway.preview({ uuid: f.item.uuid }), /access|changed|no longer available/u);
  }
});

test("unidentified Items expose only their unidentified description and reject property fragments", async () => {
  const f = fixture();
  f.item.system.identified = false;
  f.item.system.unidentified = { description: "An unfamiliar object" };
  const result = await f.gateway.preview({ uuid: f.item.uuid });
  assert.match(result.html, /unfamiliar/u);
  assert.doesNotMatch(result.html, /bonus|UUID/u);
  await assert.rejects(f.gateway.enrich({ uuid: f.item.uuid, content: "hidden property", fragment: true }), /unavailable/u);
});

test("journal previews exclude hidden pages and missing descriptions have a readable fallback", async () => {
  const f = fixture();
  const journal = { uuid: "JournalEntry.rules", documentName: "JournalEntry", testUserPermission: () => true };
  journal.pages = [true, false].map(allowed => ({ documentName: "JournalEntryPage", type: "text", parent: journal,
    text: { content: allowed ? "Player rules" : "Private rules" }, testUserPermission: () => allowed }));
  f.docs.set(journal.uuid, journal);
  const result = await f.gateway.preview({ uuid: journal.uuid });
  assert.match(result.html, /Player rules/u); assert.doesNotMatch(result.html, /Private rules/u);
  f.item.system.description = "";
  assert.match((await f.gateway.preview({ uuid: f.item.uuid })).html, /No description/u);
});

test("rolls use Item data and its owning Actor speaker, with native and legacy privacy modes", async () => {
  const f = fixture();
  for (const [input, expected] of [["roll", "roll"], ["gm", "gmroll"], ["blind", "blindroll"], ["self", "selfroll"], ["public", "publicroll"]]) {
    await f.gateway.roll({ uuid: f.item.uuid, formula: "1d6 + @bonus", mode: input, flavor: "Damage" });
    const output = f.messages.at(-1);
    assert.deepEqual(output.data, { bonus: 7 });
    assert.equal(output.message.speaker.actor, f.actor);
    assert.equal(output.options.rollMode, expected);
  }
  f.actor.owner = false;
  await assert.rejects(f.gateway.roll({ uuid: f.item.uuid, formula: "1d6" }), /permission/u);
  assert.equal(f.messages.length, 5);
});

test("invalid roll formulas and modes cannot enter the native roll pipeline", async () => {
  const f = fixture();
  for (const request of [{ formula: "" }, { formula: "a".repeat(1001) }, { formula: "1d6", mode: "invalid" }]) {
    await assert.rejects(f.gateway.roll({ uuid: f.item.uuid, ...request }), /invalid/u);
  }
  assert.equal(f.messages.length, 0);
});

test("Foundry 14 message modes retain explicit and configured privacy", async () => {
  const f = fixture({ modern: true });
  for (const [mode, expected] of [["gm", "gm"], ["blindroll", "blind"], ["public", "public"], ["roll", "gm"]]) {
    await f.gateway.roll({ uuid: f.item.uuid, formula: "1d6", mode });
    assert.deepEqual(f.messages.at(-1).options, { messageMode: expected });
  }
});
