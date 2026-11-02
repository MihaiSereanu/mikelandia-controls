import test from "node:test";
import assert from "node:assert/strict";
import { createFoundrySessionGateway } from "../src/foundry/session/session-gateway.mjs";
import { collection, createGame, installGlobals } from "./helpers/foundry.mjs";

function fixture(t, format = 1) {
  const writes = [];
  const page = { id: "page", type: "text", text: { format, content: "<p>Original HTML</p>", markdown: "Original Markdown" },
    testUserPermission: () => true,
    async update(data) {
      writes.push(data);
      for (const [path, value] of Object.entries(data)) this.text[path.split(".")[1]] = value;
    } };
  const journal = { id: "journal", documentName: "JournalEntry", name: "Journal", pages: collection([page]),
    testUserPermission: () => true, sheet: { isPageVisible: () => true } };
  const game = createGame();
  game.journal = collection([journal]);
  installGlobals(t, { game, TextEditor: { implementation: { enrichHTML: async value => value } },
    foundry: { utils: { cleanHTML: value => value } } });
  const gateway = createFoundrySessionGateway();
  const payload = async (value = "Line one\n\nLine three") => ({ journalId: journal.id, pageId: page.id,
    ...await gateway.readJournalText(journal.id, page.id), value });
  return { game, gateway, journal, page, writes, payload };
}

for (const format of [1, 2]) test(`Journal format ${format} saves only its native source and preserves sibling content`, async t => {
  const { gateway, page, writes, payload } = fixture(t, format);
  const original = { ...page.text };
  const edit = await payload();
  assert.equal(edit.originalValue, format === 2 ? original.markdown : original.content);
  assert.deepEqual(await gateway.saveJournalText(edit), { changed: true });
  assert.deepEqual(writes, [{ [format === 2 ? "text.markdown" : "text.content"]: edit.value }]);
  assert.equal(page.text.format, format);
  assert.equal(page.text[format === 2 ? "content" : "markdown"], original[format === 2 ? "content" : "markdown"]);
  assert.deepEqual(await gateway.saveJournalText(await payload(edit.value)), { changed: false });
  assert.equal(writes.length, 1);
});

test("Journal edits require current entry/page ownership, visible text pages and the original format/source", async t => {
  const { gateway, journal, page, writes, payload } = fixture(t);
  const edit = await payload();
  for (const mutate of [
    () => { journal.testUserPermission = (_user, level) => level !== "OWNER"; },
    () => { page.testUserPermission = (_user, level) => level !== "OWNER"; },
    () => { journal.sheet.isPageVisible = () => false; },
    () => { page.type = "image"; }
  ]) {
    journal.testUserPermission = page.testUserPermission = () => true;
    journal.sheet.isPageVisible = () => true; page.type = "text";
    mutate();
    await assert.rejects(gateway.readJournalText(journal.id, page.id), /cannot edit/i);
    await assert.rejects(gateway.saveJournalText(edit), /cannot edit/i);
  }
  page.type = "text";
  page.text.content = "Changed elsewhere";
  await assert.rejects(gateway.saveJournalText(edit), /changed while being edited/);
  page.text.content = edit.originalValue; page.text.format = 2;
  await assert.rejects(gateway.saveJournalText(edit), /changed while being edited/);
  page.text.format = 1;
  for (const bad of [{ ...edit, ownership: {} }, { ...edit, value: 3 }, { ...edit, value: "x".repeat(100001) }, { ...edit, format: "1" }]) {
    await assert.rejects(gateway.saveJournalText(bad), /Invalid Journal/);
  }
  assert.equal(writes.length, 0);
});

test("Journal save failures release the duplicate guard and permit retry", async t => {
  const { gateway, page, payload } = fixture(t);
  const edit = await payload();
  const update = page.update;
  let reject;
  page.update = () => new Promise((_resolve, rejectWrite) => { reject = rejectWrite; });
  const pending = gateway.saveJournalText(edit);
  await assert.rejects(gateway.saveJournalText(edit), /already being saved/);
  reject(Error("Native rejection"));
  await assert.rejects(pending, /Native rejection/);
  page.update = update;
  assert.deepEqual(await gateway.saveJournalText(edit), { changed: true });
});

test("Journal Markdown uses the native converter and never the stale HTML cache", async t => {
  const { gateway, page } = fixture(t, 2);
  const converted = [];
  page.sheet = { constructor: { _converter: { makeHtml(value) { converted.push(value); return `<p>${value}</p>`; } } } };
  assert.equal((await gateway.readJournal("journal")).pages[0].html, "<p>Original Markdown</p>");
  assert.deepEqual(converted, [page.text.markdown]);
  delete page.sheet;
  await assert.rejects(gateway.readJournal("journal"), /Markdown rendering is unavailable/);
});

test("Journal Markdown raw HTML is cleaned before native enrichment and cannot render without cleaning", async t => {
  const { gateway, page } = fixture(t, 2);
  const malicious = '<img src="missing" onerror="window.injected=true">';
  const safe = '<img src="missing">';
  const order = [];
  page.text.markdown = malicious;
  page.sheet = { constructor: { _converter: { makeHtml(value) {
    order.push("convert"); assert.equal(value, malicious); return `<p>${value}</p>`;
  } } } };
  installGlobals(t, { foundry: { utils: { cleanHTML(value) {
    order.push("clean"); assert.equal(value, `<p>${malicious}</p>`); return `<p>${safe}</p>`;
  } } }, TextEditor: { implementation: { enrichHTML: async value => {
    order.push("enrich"); assert.equal(value, `<p>${safe}</p>`); return value;
  } } } });
  const result = await gateway.readJournal("journal");
  assert.deepEqual(order, ["convert", "clean", "enrich"]);
  assert.equal(result.pages[0].html, `<p>${safe}</p>`);
  delete globalThis.foundry.utils.cleanHTML;
  await assert.rejects(gateway.readJournal("journal"), /Markdown HTML cleaning is unavailable/);
  assert.deepEqual(order, ["convert", "clean", "enrich"]);
});

test("Journal reads and writes reject session, source or document changes during async operations", async t => {
  const { gateway, journal, page, payload } = fixture(t);
  const edit = await payload();
  installGlobals(t, { TextEditor: { implementation: { enrichHTML: async value => { page.text.content = "New source"; return value; } } } });
  await assert.rejects(gateway.readJournal("journal"), /changed while being loaded/);
  page.text.content = edit.originalValue;
  page.update = async () => { journal.pages = collection([{ ...page }]); };
  await assert.rejects(gateway.saveJournalText(edit), /no longer available/);
  journal.pages = collection([page]);
  page.update = async () => { page.testUserPermission = () => false; };
  await assert.rejects(gateway.saveJournalText(edit), /cannot edit/i);
  page.testUserPermission = () => true;
  await assert.rejects(gateway.saveJournalText(edit, { worldId: "another-world" }), /world has changed/);
});
