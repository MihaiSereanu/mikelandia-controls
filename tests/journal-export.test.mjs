import test from "node:test";
import assert from "node:assert/strict";
import { buildJournalMarkdown, downloadJournalMarkdown, installJournalExportControls } from "../src/foundry/journals/journal-export.mjs";
import { createFoundrySessionGateway } from "../src/foundry/session/session-gateway.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";
import { collection, createGame, createHooks, installGlobals } from "./helpers/foundry.mjs";

function fixture(t) {
  const game = createGame(), downloads = [], errors = [], hooks = createHooks();
  const page = (id, extra = {}) => ({ id, name: id, type: "image", sort: 0, src: `assets/${id}.webp`, testUserPermission: () => true, ...extra });
  const journal = { id: "journal", documentName: "JournalEntry", name: "My: Journal", testUserPermission: () => true,
    sheet: { isPageVisible: page => page.id !== "hidden" },
    pages: collection([page("last", { sort: 20 }), page("denied", { testUserPermission: () => false }), page("hidden"), page("first", { sort: 10 })]) };
  game.journal = collection([journal]);
  installGlobals(t, { game, Hooks: hooks, document: { baseURI: "https://foundry.example/prefix/game" },
    foundry: { utils: { saveDataToFile: (...args) => downloads.push(args) } }, ui: { notifications: { error: error => errors.push(error) } } });
  return { game, journal, downloads, errors, hooks };
}

test("single-Journal download respects entry/page visibility, order, URLs and filename", t => {
  const { journal, downloads } = fixture(t);
  const result = downloadJournalMarkdown(journal.id);
  assert.equal(result.filename, "My_ Journal.md");
  assert.match(result.markdown, /^# My: Journal/);
  assert.ok(result.markdown.indexOf("## first") < result.markdown.indexOf("## last"));
  assert.doesNotMatch(result.markdown, /denied|hidden/);
  assert.match(result.markdown, /!\[first\]\(<https:\/\/foundry.example\/prefix\/assets\/first.webp>\)/);
  assert.deepEqual(downloads, [[result.markdown, "text/markdown;charset=utf-8", result.filename]]);
});

test("media links, malformed URLs, heading escaping and empty Journals", t => {
  const { journal } = fixture(t);
  journal.pages = [{ name: "PDF [one]", type: "pdf", src: "docs/file name.pdf", testUserPermission: () => true },
    { name: "Bad", type: "image", src: "javascript:alert(1)", testUserPermission: () => true }];
  const { markdown } = buildJournalMarkdown(journal);
  assert.match(markdown, /\[PDF \\\[one\\\]\]\(<https:\/\/foundry.example\/prefix\/docs\/file%20name.pdf>\)/);
  assert.doesNotMatch(markdown, /javascript|!\[Bad/);
  journal.pages = [];
  assert.equal(buildJournalMarkdown(journal).markdown, "# My: Journal\n");
});

test("download rechecks revoked access and excludes compendiums/internal records", t => {
  const { game, journal, downloads } = fixture(t);
  for (const change of [() => { journal.testUserPermission = () => false; },
    () => { journal.pack = "pack"; },
    () => { game.modules.set("sequencer", { active: true }); journal.name = "sequencerDatabase"; }]) {
    change();
    assert.throws(() => downloadJournalMarkdown(journal.id), /no longer available/);
    journal.testUserPermission = () => true; delete journal.pack;
  }
  assert.equal(downloads.length, 0);
});

test("native header control exports only its current Journal and reports revocation", t => {
  const { journal, downloads, errors, hooks } = fixture(t);
  const scope = createTaskScope(); t.after(() => scope.dispose());
  installJournalExportControls(scope);
  const controls = [];
  hooks.emit("getHeaderControlsJournalEntrySheet", { document: journal }, controls);
  assert.equal(controls.length, 1);
  assert.equal(controls[0].label, "Export Markdown");
  controls[0].onClick();
  assert.equal(downloads.length, 1);
  journal.testUserPermission = () => false;
  controls[0].onClick();
  assert.equal(downloads.length, 1);
  assert.match(errors[0], /no longer available/);
  const denied = [];
  hooks.emit("getHeaderControlsJournalEntrySheet", { document: journal }, denied);
  assert.equal(denied.length, 0);
  scope.dispose();
  journal.testUserPermission = () => true;
  hooks.emit("getHeaderControlsJournalEntrySheet", { document: journal }, denied);
  assert.equal(denied.length, 0);
});

test("companion session export rejects another session before downloading", t => {
  const { journal, downloads } = fixture(t);
  const gateway = createFoundrySessionGateway();
  assert.throws(() => gateway.exportJournalMarkdown(journal.id, { userId: "someone-else" }), /user has changed/i);
  assert.equal(downloads.length, 0);
  gateway.exportJournalMarkdown(journal.id, { userId: "player", worldId: "world" });
  assert.equal(downloads.length, 1);
});
