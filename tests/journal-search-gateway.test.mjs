import test from "node:test";
import assert from "node:assert/strict";
import { createFoundrySessionGateway } from "../src/foundry/session/session-gateway.mjs";
import { readJournalSearchText } from "../src/foundry/journals/journal-search-text.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";
import { collection, createGame, createHooks, installGlobals } from "./helpers/foundry.mjs";

function fixture(t, journalSearchText = page => page.text.content) {
  const pages = ["first", "second"].map((id, sort) => ({ id, name: id, sort, type: "text", text: { format: 1, content: id }, testUserPermission: () => true }));
  const journal = { id: "journal", name: "Journal", pages: collection(pages), testUserPermission: () => true,
    sheet: { isPageVisible: () => true } };
  const game = createGame();
  game.journal = collection([journal]);
  installGlobals(t, { game });
  return { game, journal, pages, gateway: createFoundrySessionGateway({ journalSearchText }) };
}

test("search index includes only readable entries/pages and native page ordering", async t => {
  const { game, journal, pages, gateway } = fixture(t);
  pages[0].sort = 2;
  pages.push({ id: "attachment", name: "Image", type: "image", sort: 3, testUserPermission: () => true });
  journal.pages = collection(pages);
  game.journal.push({ ...journal, id: "hidden", testUserPermission: () => false });
  pages.push({ id: "denied", type: "text", text: { content: "secret" }, testUserPermission: () => false });
  journal.pages = collection(pages);
  const records = await gateway.readJournalSearchIndex();
  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Journal");
  assert.deepEqual(records[0].pages.map(page => [page.id, page.text]), [["second", "second"], ["first", "first"], ["attachment", ""]]);
  assert.ok(Object.isFrozen(records[0].pages));
});

for (const mutation of ["source", "format", "identity", "permission", "sheet", "owner", "session", "entry", "new-entry"]) {
  test(`search rejects ${mutation} changes to an earlier page during later extraction`, async t => {
    let mutate;
    const { game, journal, pages, gateway } = fixture(t, async page => {
      if (page.id === "second") mutate();
      return page.text.content;
    });
    mutate = () => {
      if (mutation === "source") pages[0].text.content = "changed";
      if (mutation === "format") pages[0].text.format = 2;
      if (mutation === "identity") journal.pages = collection([{ ...pages[0] }, pages[1]]);
      if (mutation === "permission") pages[0].testUserPermission = () => false;
      if (mutation === "sheet") journal.sheet.isPageVisible = page => page.id !== "first";
      if (mutation === "owner") pages[0].isOwner = true;
      if (mutation === "session") game.user = { ...game.user, id: "another" };
      if (mutation === "entry") game.journal = collection([{ ...journal }]);
      if (mutation === "new-entry") game.journal.push({ ...journal, id: "new" });
    };
    await assert.rejects(gateway.readJournalSearchIndex(), /changed|no longer/i);
  });
}

test("search passes native ownership secret eligibility and skips nontext extraction", async t => {
  const calls = [];
  const { journal, pages, gateway } = fixture(t, (page, options) => { calls.push([page.id, options.secrets]); return "readable"; });
  journal.isOwner = true;
  pages[0].isOwner = false;
  pages[1].type = "image";
  await gateway.readJournalSearchIndex();
  assert.deepEqual(calls, [["first", false]]);
});

test("search invalidation fires for text edits despite unchanged snapshot signatures and all access invalidations", async t => {
  const { gateway, pages } = fixture(t);
  const hooks = createHooks();
  installGlobals(t, { Hooks: hooks });
  const scope = createTaskScope();
  t.after(() => scope.dispose());
  let searches = 0;
  let snapshots = 0;
  gateway.watch(scope, () => snapshots++, error => { throw error; }, { onJournalSearchChange: () => searches++ });
  pages[0].text.content = "updated";
  hooks.emit("updateJournalEntryPage", pages[0], { "text.content": "updated" });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(searches, 1);
  assert.equal(snapshots, 0);
  for (const hook of ["createFolder", "updateFolder", "deleteFolder", "createJournalEntry", "deleteJournalEntry", "updateUser"]) hooks.emit(hook, {});
  hooks.emit("updateSetting", { key: "calendaria.devMode" });
  assert.equal(searches, 8);
  scope.dispose();
  hooks.emit("updateJournalEntryPage", pages[0], {});
  assert.equal(searches, 8);
});


test("search Markdown conversion uses authoritative source and cleans before DOM parsing", t => {
  const order = [];
  const page = { text: { format: 2, markdown: "current Markdown", content: "stale HTML" }, sheet: { constructor: { _converter: {
    makeHtml(source) { order.push("convert"); assert.equal(source, "current Markdown"); return "<p>converted</p>"; }
  } } } };
  installGlobals(t, {
    foundry: { utils: { cleanHTML(html) { order.push("clean"); assert.equal(html, "<p>converted</p>"); return "cleaned"; } } },
    document: { createElement(tag) { order.push("parse"); assert.equal(tag, "template"); return { set innerHTML(value) { assert.equal(value, "cleaned"); },
      content: { querySelectorAll: () => [], childNodes: [{ nodeType: 3, nodeValue: "readable text" }] } }; } }
  });
  assert.equal(readJournalSearchText(page), "readable text");
  assert.deepEqual(order, ["convert", "clean", "parse"]);
  delete page.sheet;
  assert.throws(() => readJournalSearchText(page), /Markdown rendering is unavailable/);
  page.sheet = { constructor: { _converter: { makeHtml: value => value } } };
  delete globalThis.foundry.utils.cleanHTML;
  assert.throws(() => readJournalSearchText(page), /Markdown HTML cleaning is unavailable/);
});
