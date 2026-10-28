import test from "node:test";
import assert from "node:assert/strict";
import { createRollTimingGateway } from "../src/foundry/media/roll-timing.mjs";
import { createHooks } from "./helpers/foundry.mjs";

function fixture() {
  let time = 0, sequence = 0;
  const hooks = createHooks(), timers = new Map(), frames = new Map(), observers = new Set();
  const view = {
    getComputedStyle: element => ({ display: element.display ?? "block", visibility: "visible" }),
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.nodes = new Set(); observers.add(this); }
      observe(node) { this.nodes.add(node); }
      disconnect() { this.nodes.clear(); }
    }
  };
  const document = { defaultView: view };
  const gateway = createRollTimingGateway({ getHooks: () => hooks, getDocument: () => document, now: () => time,
    schedule(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    cancel: id => timers.delete(id) });
  return { gateway, hooks, timers, frames, observers, at: value => { time = value; },
    element: options => ({ isConnected: true, ownerDocument: document, parentElement: null, ...options }),
    frame() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); },
    mutate(node) { for (const observer of observers) if (observer.nodes.has(node)) observer.callback(); }
  };
}

test("disabled timing installs no hooks or timers and preserves native calls", () => {
  const f = fixture();
  const timing = f.gateway.begin({ actorSourceUuid: "Actor.argos", actionId: "stat:str" });
  timing.mark("native-called"); timing.finish(); timing.dispose();
  assert.deepEqual(f.gateway.snapshot(), []);
  assert.equal(f.hooks.count("renderApplicationV2"), 0);
  assert.equal(f.timers.size, 0);
});

test("milestones filter actors and messages and keep thinking time separate", () => {
  const f = fixture(); f.gateway.setEnabled(true);
  const timing = f.gateway.begin({ actorSourceUuid: "Actor.argos", actionId: "stat:str" });
  f.at(5); timing.mark("native-called");
  f.hooks.emit("renderApplicationV2", { config: { actorUuid: "Actor.other" } });
  f.at(20); f.hooks.emit("renderApplicationV2", { config: { actorUuid: "Actor.argos" }, element: f.element() });
  f.at(22); f.frame();
  f.at(5022); f.hooks.call("SD-Stat-Check", { actorUuid: "Actor.argos" });
  f.hooks.call("SD-Stat-Check", { actorUuid: "Actor.other" });
  f.at(5030); f.hooks.emit("createChatMessage", { id: "other", speaker: { actor: "other" } });
  f.at(5040); f.hooks.emit("createChatMessage", { id: "roll", speaker: { actor: "argos" } });
  f.at(5050); f.hooks.emit("renderChatMessageHTML", { id: "unrelated", speaker: { actor: "argos" } }, f.element());
  f.hooks.emit("renderChatMessageHTML", { id: "roll", speaker: { actor: "argos" } }, f.element());
  f.at(5052); f.frame();
  f.at(5060); timing.finish();
  assert.deepEqual(f.gateway.snapshot()[0].milestones, [
    { phase: "action-started", ms: 0 }, { phase: "native-called", ms: 5 },
    { phase: "dialog-rendered", ms: 20 }, { phase: "dialog-visible", ms: 22 },
    { phase: "roll-submitted", ms: 5022 }, { phase: "chat-created", ms: 5040 },
    { phase: "chat-rendered", ms: 5050 }, { phase: "chat-visible", ms: 5052 },
    { phase: "native-return", ms: 5060 }
  ]);
  timing.dispose();
  assert.equal(f.hooks.count("SD-Stat-Check"), 0);
  assert.equal(f.timers.size, 0);
});

test("hidden chat becomes visible after native return without scanning the document", () => {
  const f = fixture(); f.gateway.setEnabled(true);
  const timing = f.gateway.begin({ actorSourceUuid: "Actor.argos", actionId: "stat:str" });
  const parent = f.element({ display: "none" }), message = f.element({ parentElement: parent, isConnected: false });
  f.at(10); f.hooks.emit("renderChatMessageHTML", { id: "roll", speaker: { actor: "argos" } }, message);
  message.isConnected = true;
  f.at(12); f.frame();
  f.at(15); timing.finish();
  assert.equal(f.gateway.snapshot()[0].milestones.some(entry => entry.phase === "chat-visible"), false);
  parent.display = "block"; f.at(1000); f.mutate(parent);
  assert.deepEqual(f.gateway.snapshot()[0].milestones.at(-1), { phase: "chat-visible", ms: 1000 });
  assert.equal([...f.observers].some(observer => observer.nodes.size), false);
  timing.dispose();
});

test("expiry and disabling dispose hooks, observers, and frames", () => {
  const f = fixture(); f.gateway.setEnabled(true);
  f.gateway.begin({ actorSourceUuid: "Actor.argos", actionId: "stat:str" });
  f.hooks.emit("renderApplicationV2", { config: { actorUuid: "Actor.argos" }, element: f.element({ display: "none" }) });
  assert.equal(f.frames.size, 1);
  const expiry = [...f.timers.values()][0]; assert.equal(expiry.delay, 30000);
  f.at(30000); expiry.callback();
  assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
  assert.equal(f.hooks.count("createChatMessage"), 0);
  assert.deepEqual(f.gateway.snapshot()[0].milestones.at(-1), { phase: "observation-ended", ms: 30000 });
  f.gateway.begin({ actorSourceUuid: "Actor.argos" });
  f.gateway.setEnabled(false);
  assert.equal(f.hooks.count("renderApplicationV2"), 0); assert.equal(f.timers.size, 0);
});

test("cancelled workflows stop before a later roll by the same actor", () => {
  const f = fixture(); f.gateway.setEnabled(true);
  const timing = f.gateway.begin({ actorSourceUuid: "Actor.argos", actionId: "stat:str" });
  f.at(50); timing.finish();
  f.at(100); f.hooks.emit("createChatMessage", { id: "later", speaker: { actor: "argos" } });
  assert.deepEqual(f.gateway.snapshot()[0].milestones, [
    { phase: "action-started", ms: 0 }, { phase: "native-return", ms: 50 }
  ]);
  assert.equal(f.hooks.count("createChatMessage"), 0);
  assert.equal(f.timers.size, 0);
});

test("history is bounded, copied for callers, and reset cleans active observations", () => {
  const f = fixture(); f.gateway.setEnabled(true);
  for (let index = 0; index < 23; index++) f.gateway.begin({ actorSourceUuid: "Actor.argos", actionId: String(index) });
  const snapshot = f.gateway.snapshot();
  assert.equal(snapshot.length, 20); assert.equal(snapshot[0].actionId, "3");
  assert.equal(f.hooks.count("createChatMessage"), 20); assert.equal(f.timers.size, 20);
  snapshot[0].milestones[0].phase = "changed";
  assert.equal(f.gateway.snapshot()[0].milestones[0].phase, "action-started");
  assert.doesNotThrow(() => JSON.stringify(f.gateway.snapshot()));
  f.gateway.reset();
  assert.deepEqual(f.gateway.snapshot(), []); assert.equal(f.timers.size, 0);
  assert.equal(f.hooks.count("createChatMessage"), 0);
});
