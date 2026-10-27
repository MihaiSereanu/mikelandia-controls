import test from "node:test";
import assert from "node:assert/strict";
import { isJournalVisible, isJournalPageVisible } from "../src/foundry/journal-visibility.mjs";
import { createFoundrySessionGateway, sessionInvalidationForHook } from "../src/foundry/session-gateway.mjs";
import { journalReadTarget } from "../src/foundry/mobile-journal-reader-gateway.mjs";
import { collection, createGame, createHooks, installGlobals } from "./helpers/foundry.mjs";
import { createTaskScope } from "../src/kernel/task-scope.mjs";

function journal(id, overrides = {}) {
  return { id, documentName: "JournalEntry", name: id, pages: collection(),
    testUserPermission: (_user, level) => level === "OBSERVER", ...overrides };
}

function fixture(t, journals) {
  const game = createGame();
  game.journal = collection(journals);
  game.modules = new Map(["sequencer", "calendaria"].map(id => [id, { active: true }]));
  installGlobals(t, { game });
  return game;
}

test("effective Foundry permission is required, including legitimate default access", t => {
  const shared = journal("shared", { ownership: { default: 2 } });
  const denied = journal("denied", { testUserPermission: () => false, visible: true });
  const broken = journal("broken", { testUserPermission() { throw Error("unavailable"); } });
  const game = fixture(t, [shared, denied, broken]);
  assert.deepEqual(createFoundrySessionGateway().read().journals.map(j => j.id), ["shared"]);
  assert.equal(isJournalVisible(shared, null, game), false);
});

test("module storage is hidden by identity and flags, without hiding ordinary journal names", async t => {
  const entries = [journal("database", { name: "sequencerDatabase" }),
    journal("note", { flags: { calendaria: { isCalendarNote: true } } }),
    journal("calendar", { flags: { calendaria: { isCalendarJournal: true } } }),
    journal("ordinary", { name: "Calendar Notes" })];
  const game = fixture(t, entries);
  const gateway = createFoundrySessionGateway();
  assert.deepEqual(gateway.read().journals.map(j => j.id), ["ordinary"]);
  for (const entry of entries.slice(0, 3)) {
    await assert.rejects(gateway.readJournal(entry.id), /no longer available/);
    assert.equal(journalReadTarget({ document: entry }, {}, game), null);
    await assert.rejects(gateway.openNativeJournalEditor(entry.id), /cannot edit/i);
  }
  game.modules.clear();
  assert.equal(gateway.read().journals.length, 4);
});

test("Calendaria folder ancestry and GM developer mode match the native directory", t => {
  const root = { id: "root", flags: { calendaria: { isCalendarNotesFolder: true } } };
  const child = { id: "child", folder: root };
  const nested = journal("nested", { folder: child });
  const game = fixture(t, [nested]);
  game.settings.get = () => true;
  assert.equal(isJournalVisible(nested, game.user), false, "devMode does not elevate players");
  game.user.isGM = true;
  assert.equal(isJournalVisible(nested, game.user), true);
  game.settings.get = () => false;
  assert.equal(isJournalVisible(nested, game.user), false);
  root.flags.calendaria = { isCalendarFolder: true };
  assert.equal(isJournalVisible(nested, game.user), false);
  root.flags = {};
  root.folder = child;
  assert.equal(isJournalVisible(nested, game.user), true, "cyclic folder links terminate");
});

test("page summaries, reads and native read targets all enforce native page visibility", async t => {
  const pages = ["visible", "permission-denied", "sheet-hidden"].map(id => ({
    id, name: id, type: "text", text: { content: id }, testUserPermission: () => id !== "permission-denied"
  }));
  const entry = journal("handout", { pages: collection(pages), sheet: { isPageVisible: p => p.id !== "sheet-hidden" } });
  const game = fixture(t, [entry]);
  const gateway = createFoundrySessionGateway();
  assert.deepEqual(gateway.read().journals[0].pages.map(p => p.id), ["visible"]);
  assert.deepEqual((await gateway.readJournal(entry.id)).pages.map(p => p.id), ["visible"]);
  for (const page of pages.slice(1)) assert.equal(journalReadTarget({ document: entry, ...entry.sheet }, { pageId: page.id }, game), null);
  assert.equal(journalReadTarget({ document: entry, ...entry.sheet }, { pageId: "visible" }, game).pageId, "visible");
  assert.equal(isJournalPageVisible(pages[0], entry, game.user, { isPageVisible() { throw Error("unavailable"); } }), false);
});

test("async enrichment cannot return a journal hidden or revoked while loading", async t => {
  const page = { id: "page", type: "text", text: { content: "secret" }, testUserPermission: () => true };
  const entry = journal("handout", { pages: collection([page]) });
  fixture(t, [entry]);
  const gateway = createFoundrySessionGateway();
  let mutate;
  installGlobals(t, { TextEditor: { implementation: { enrichHTML: async () => { mutate(); return "secret"; } } } });
  mutate = () => { entry.flags = { calendaria: { isCalendarNote: true } }; };
  await assert.rejects(gateway.readJournal(entry.id), /no longer available/);
  entry.flags = {};
  mutate = () => { entry.testUserPermission = () => false; };
  await assert.rejects(gateway.readJournal(entry.id), /no longer available/);
  entry.testUserPermission = () => true;
  mutate = () => { page.testUserPermission = () => false; };
  assert.deepEqual((await gateway.readJournal(entry.id)).pages, []);
});

test("incremental journal updates react to module flags, folders and developer settings", async t => {
  const entry = journal("handout");
  fixture(t, [entry]);
  const hooks = createHooks();
  installGlobals(t, { Hooks: hooks });
  const scope = createTaskScope();
  t.after(() => scope.dispose());
  let latest;
  const gateway = createFoundrySessionGateway();
  gateway.watch(scope, snapshot => { latest = snapshot; });
  entry.flags = { calendaria: { isCalendarNote: true } };
  hooks.emit("updateJournalEntry", entry, { flags: entry.flags });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(latest.journals, []);
  for (const hook of ["createFolder", "updateFolder", "deleteFolder"]) assert.deepEqual(sessionInvalidationForHook(hook, {}).domains, ["journals"]);
  assert.deepEqual(sessionInvalidationForHook("updateSetting", { key: "calendaria.devMode" }).domains, ["journals"]);
});
