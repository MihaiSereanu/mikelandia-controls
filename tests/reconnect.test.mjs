import test from "node:test";
import assert from "node:assert/strict";
import { enableMobileConnectionGrace, MOBILE_RECONNECT_GRACE_MS } from "../src/foundry/session/connection-grace.mjs";
import { createAuthoritativeResynchronizer } from "../src/kernel/connection/authoritative-resync.mjs";
import { createConnectionGeneration } from "../src/kernel/connection/connection-generation.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";
import { initialAppState, reduceAppState } from "../src/kernel/state/app-state.mjs";
import { recoveryFixture, recoveryCollections } from "./helpers/reconnect.mjs";

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function emitter() {
  const events = new Map();
  return {
    on(name, callback) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); },
    off(name, callback) { events.get(name)?.delete(callback); },
    listeners(name) { return [...(events.get(name) ?? [])]; },
    emit(name, ...args) { for (const callback of [...(events.get(name) ?? [])]) callback(...args); }
  };
}

test("brief background resume without disconnect needs no world refresh; reconnect grace and cleanup remain intact", () => {
  const scope = createTaskScope("recovery-test"), document = new EventTarget();
  document.visibilityState = "visible";
  const manager = emitter(), socket = Object.assign(emitter(), { io: manager, connected: true });
  let now = 0, reloads = 0, resumes = 0, disconnects = 0, attempts = 10;
  const reconnects = [];
  function nativeReconnect() { const message = "Server connection re-established."; const debouncedReload = () => { reloads++; }; debouncedReload(message); }
  manager.on("reconnect", nativeReconnect);
  manager.reconnectionAttempts = value => value === undefined ? attempts : (attempts = value);
  enableMobileConnectionGrace(scope, { getSocket: () => socket, getDocument: () => document, now: () => now,
    notify() {}, onDisconnect: () => disconnects++, onReconnect: value => reconnects.push(value), onTrustedResume: () => resumes++ });
  const visibility = value => { document.visibilityState = value; document.dispatchEvent(new Event("visibilitychange")); };
  visibility("hidden"); now = 5000; visibility("visible");
  assert.equal(resumes, 1); assert.equal(reconnects.length, 0);
  visibility("hidden"); socket.connected = false; socket.emit("disconnect", "transport close");
  now += 5000; socket.connected = true; manager.emit("reconnect"); visibility("visible");
  assert.equal(disconnects, 1); assert.equal(reconnects[0].elapsedMs, 5000); assert.equal(reloads, 0);
  assert.equal(resumes, 1, "disconnected resumes are not reported as trusted");
  socket.emit("disconnect"); now += MOBILE_RECONNECT_GRACE_MS; manager.emit("reconnect");
  assert.equal(reloads, 1); assert.ok(attempts > 10);
  scope.dispose();
  assert.deepEqual(manager.listeners("reconnect"), [nativeReconnect]); assert.equal(attempts, 10);
});

test("unrecognized native handlers are left unchanged", () => {
  const manager = emitter(), socket = Object.assign(emitter(), { io: manager });
  const native = () => {}; manager.on("reconnect", native);
  const scope = createTaskScope("unrecognized");
  assert.equal(enableMobileConnectionGrace(scope, { getSocket: () => socket }), false);
  assert.deepEqual(manager.listeners("reconnect"), [native]); scope.dispose();
});

test("all six permission-filtered collections fetch concurrently; unchanged data reuses documents and chat", async () => {
  const gate = deferred();
  const f = recoveryFixture({ requestSources: async ({ documentName }, sources) => { await gate.promise; return sources[documentName]; } });
  const original = f.game.collections.get("Actor").get("Actor-0");
  const recovery = f.gateway.resync();
  assert.deepEqual(f.stats.requests, recoveryCollections);
  gate.resolve(); const result = await recovery;
  assert.equal(result.applied, true); assert.equal(f.stats.prepared, 0); assert.equal(f.stats.chat, 0);
  assert.equal(f.game.collections.get("Actor").get("Actor-0"), original);
  assert.ok(result.timings.collections >= 0); assert.ok(result.timings["foundry-session"] >= 0);
});

test("missed edits, ownership changes, additions and deletions are reconciled without re-preparing unchanged actors", async () => {
  const f = recoveryFixture(), actors = f.game.collections.get("Actor");
  const original = actors.get("Actor-0");
  f.sources.Actor[0].name = "Updated";
  f.sources.Actor[0].ownership.default = 0;
  f.sources.Actor.splice(1, 1, { _id: "new", name: "New" });
  await f.gateway.resync();
  assert.equal(actors.get("Actor-0"), original); assert.equal(original.toObject().name, "Updated");
  assert.equal(original.toObject().ownership.default, 0);
  assert.equal(actors.has("Actor-1"), false); assert.ok(actors.has("new")); assert.equal(f.stats.prepared, 2);
  await f.gateway.resync(); assert.equal(f.stats.prepared, 2); assert.equal(f.stats.chat, 1);
});

for (const name of ["User", "ChatMessage"]) test(`${name} updates still refresh native chat`, async () => {
  const f = recoveryFixture(); f.sources[name][0].name = "Changed";
  await f.gateway.resync(); assert.equal(f.stats.chat, 1);
});

test("failed collection fetch does not partially apply new world data", async () => {
  const f = recoveryFixture({ requestSources: ({ documentName }, sources) => {
    if (documentName === "ChatMessage") throw new Error("Network error");
    return sources[documentName];
  } });
  f.sources.Actor[0].name = "Must not apply";
  await assert.rejects(f.gateway.resync(), /Network error/);
  assert.notEqual(f.game.collections.get("Actor").get("Actor-0").toObject().name, "Must not apply");
});

test("a changed world while fetching discards the old response", async () => {
  const gate = deferred();
  const f = recoveryFixture({ requestSources: async ({ documentName }, sources) => { await gate.promise; return sources[documentName]; } });
  const running = f.gateway.resync(); f.game.world.id = "other-world"; gate.resolve();
  assert.equal((await running).applied, false); assert.equal(f.stats.prepared, 0);
});

test("older recovery and disposed owners cannot apply or release a newer recovery", async () => {
  const generation = createConnectionGeneration(), first = deferred(), applied = [];
  const sync = createAuthoritativeResynchronizer({ generation,
    fetchSnapshot: async context => context.generation === 1 ? first.promise : "new", applySnapshot: value => applied.push(value) });
  const old = sync.run(1); assert.equal((await sync.run(2)).applied, true);
  first.resolve("old"); assert.equal((await old).applied, false); assert.deepEqual(applied, ["new"]);
  sync.dispose(); assert.equal((await sync.run(3)).applied, false); assert.deepEqual(applied, ["new"]);
});

test("state recovery preserves navigation but removes inaccessible selection and ignores old completion", () => {
  const state = { ...initialAppState, route: "characters", selectedActorId: "hero", selectedActorSourceUuid: "Actor.hero",
    characterTab: "inventory", characterOpenSections: ["gear"] };
  const reconnecting = reduceAppState(state, { type: "reconnect-started", generation: 2 });
  assert.equal(reconnecting.characterTab, "inventory"); assert.deepEqual(reconnecting.characterOpenSections, ["gear"]);
  assert.equal(reduceAppState(reconnecting, { type: "reconnect-finished", generation: 1 }), reconnecting);
  const refreshed = reduceAppState(reconnecting, { type: "session-loaded", snapshot: { actors: [], selectedActor: null } });
  assert.equal(refreshed.selectedActorId, ""); assert.equal(refreshed.characterTab, "overview");
});
