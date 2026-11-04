import test from "node:test";
import assert from "node:assert/strict";
import { searchJournalIndex, journalMatchRanges, journalSearchWords } from "../src/features/journals/search.mjs";
import { createJournalSearchController } from "../src/features/journals/search-controller.mjs";
import { initialAppState, reduceAppState } from "../src/kernel/state/app-state.mjs";
import { createSignalStore } from "../src/kernel/state/signal-store.mjs";
const index = [{ id: "j", name: "Ancient Ruins", pages: [
  { id: "p", name: "History", text: "The old tower lies beyond the caf\u00e9." },
  { id: "q", name: "Map", text: "" }
] }, { id: "empty", name: "Empty Journal", pages: [] }];
test("search combines titles and authored body, folds accents, and requires all words on one page", () => {
  assert.deepEqual(searchJournalIndex(index, "RUINS cafe")[0].pages.map(p => p.id), ["p"]);
  assert.equal(searchJournalIndex(index, "old map").length, 0);
  assert.equal(searchJournalIndex(index, "ancient")[0].pages.length, 2);
  assert.equal(searchJournalIndex(index, "map")[0].pages[0].excerpt, "");
  assert.equal(searchJournalIndex(index, "empty")[0].id, "empty");
  assert.deepEqual(searchJournalIndex(index, "   "), []);
});
test("excerpts reach body hits and highlight offsets preserve original Unicode", () => {
  const body = "x".repeat(300) + " Caf\u00e9 and cafe\u0301.";
  const hit = searchJournalIndex([{ ...index[0], pages: [{ id: "p", name: "Page", text: body }] }], "cafe")[0].pages[0];
  assert.ok(hit.excerpt.startsWith("\u2026"));
  assert.ok(hit.excerpt.includes("Caf\u00e9"));
  const words = journalSearchWords("cafe");
  assert.deepEqual(journalMatchRanges("Caf\u00e9 and cafe\u0301.", words).map(([a,b]) => "Caf\u00e9 and cafe\u0301.".slice(a,b)), ["Caf\u00e9", "cafe\u0301"]);
});
function fixture(readIndex) {
  const store = createSignalStore(initialAppState, reduceAppState);
  const timers = new Map(); let seq = 0;
  const controller = createJournalSearchController({ store, readIndex, expectedSession: () => ({}),
    schedule: callback => { timers.set(++seq, callback); return seq; }, cancel: id => timers.delete(id) });
  return { store, controller, flush: async () => { const queued = [...timers.values()]; timers.clear(); await Promise.all(queued.map(fn => fn())); } };
}
test("search is lazy, debounced and cached until invalidation; query survives navigation", async () => {
  let reads = 0;
  const f = fixture(async () => { reads++; return index; });
  assert.equal(reads, 0);
  f.controller.setQuery("old"); f.controller.setQuery("cafe"); await f.flush();
  assert.equal(reads, 1); assert.equal(f.store.state.journalSearch.results.length, 1);
  f.store.dispatch({ type: "navigate", route: "journals" }); f.store.dispatch({ type: "navigate", route: "chat" });
  assert.equal(f.store.state.journalSearch.query, "cafe");
  f.controller.setQuery("map"); await f.flush(); assert.equal(reads, 1);
  f.controller.invalidate(); assert.deepEqual(f.store.state.journalSearch.results, []);
  await f.flush(); assert.equal(reads, 2);
  f.controller.setQuery(""); await f.flush(); assert.equal(reads, 2);
  f.controller.dispose();
});
test("superseded reads, recovery and disposal never publish stale results", async () => {
  let resolve;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  f.controller.setQuery("old"); const pending = f.flush();
  f.controller.setQuery(""); resolve(index); await pending;
  assert.deepEqual(f.store.state.journalSearch.results, []);
  f.controller.setQuery("old"); f.controller.suspend(); f.controller.invalidate(); await f.flush();
  assert.equal(f.store.state.journalSearch.loading, false);
  f.controller.resume(); const second = f.flush(); f.controller.dispose(); resolve(index); await second;
  assert.deepEqual(f.store.state.journalSearch.results, []);
});
test("failed searches expose retry and never keep old results", async () => {
  let fail = true;
  const f = fixture(async () => { if (fail) throw Error("offline"); return index; });
  f.controller.setQuery("old"); await f.flush(); assert.equal(f.store.state.journalSearch.error, "offline");
  fail = false; f.controller.retry(); await f.flush(); assert.equal(f.store.state.journalSearch.results.length, 1);
});
