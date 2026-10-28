import test from "node:test";
import assert from "node:assert/strict";
import { targetingFixture } from "./helpers/targeting.mjs";
import { createTaskScope } from "../src/kernel/task-scope.mjs";
import { installGlobals } from "./helpers/foundry.mjs";

test("native unlinked encounter uses combatant scenes and ignores foreign-scene token ID collisions", () => {
  const f = targetingFixture();
  f.game.combat.scene = null;
  f.game.combat.turns[1].sceneId = "other-scene";
  const state = f.gateway.snapshot();
  assert.ok(state);
  assert.deepEqual(state.entries.map(entry => entry.id), ["pc", "neutral"]);
  assert.throws(() => f.gateway.toggle(f.request("enemy")));
  f.gateway.toggle(f.request("neutral"));
  assert.equal(f.game.user.targets.size, 1);
  for (const combatant of f.game.combat.turns) combatant.sceneId = "other-scene";
  assert.equal(f.gateway.snapshot(), null);
  assert.equal(f.game.user.targets.size, 0);
});

test("explicit scene links take precedence; ID and document scene representations are accepted", () => {
  const f = targetingFixture();
  f.game.combat.scene = f.scene.id;
  assert.ok(f.gateway.snapshot());
  f.game.combat.scene = { id: "other-scene" };
  assert.equal(f.gateway.snapshot(), null);
  f.game.combat.scene = null;
  f.game.combat._source = { scene: "missing-linked-scene" };
  assert.equal(f.gateway.snapshot(), null);
});

test("only unhidden combat tokens appear, in initiative order, with neutral enemies and self", () => {
  const f = targetingFixture();
  f.game.combat.turns.push(f.game.combat.turns[1]);
  let state = f.gateway.snapshot();
  assert.deepEqual(state.entries.map(e => e.id), ["pc", "enemy", "neutral"]);
  assert.equal(state.entries[0].self, true);
  assert.equal(state.entries[0].distance, 0);
  assert.equal(state.entries[1].distance, 15);
  assert.equal(state.entries[2].friendly, false);
  f.game.combat.turns[1].hidden = true;
  f.game.combat.turns[1].visible = true; // Owned-hidden exception must not leak.
  state = f.gateway.snapshot();
  assert.deepEqual(state.entries.map(e => e.id), ["pc", "neutral"]);
});

test("multiple targets use native toggles; deselecting preserves outside targets", () => {
  const f = targetingFixture(), outside = f.canvas.tokens.get("outside");
  outside.setTarget(true, { releaseOthers: false });
  f.gateway.toggle(f.request("enemy")); f.gateway.toggle(f.request("neutral"));
  assert.equal(f.game.user.targets.size, 3);
  f.gateway.toggle(f.request("enemy")); f.gateway.toggle(f.request("neutral"));
  assert.deepEqual([...f.game.user.targets], [outside]);
});

test("feature targets persist across turns but clear on character/scene/encounter/end changes", () => {
  for (const change of [f => f.gateway.refresh("Actor.other"), f => { f.canvas.scene = { id: "other" }; },
    f => { f.game.combat = { ...f.game.combat, id: "next" }; }, f => { f.game.combat.started = false; }]) {
    const f = targetingFixture(), native = f.canvas.tokens.get("neutral");
    native.setTarget(true, { releaseOthers: false });
    f.gateway.toggle(f.request("enemy"));
    f.game.combat.turn = 1; f.gateway.refresh();
    assert.equal(f.game.user.targets.size, 2);
    change(f); f.gateway.snapshot();
    assert.deepEqual([...f.game.user.targets], [native]);
  }
});

test("stale, hidden, removed and missing-source targets cannot be acquired", () => {
  const f = targetingFixture(), request = f.request("enemy");
  f.enemy.hidden = true;
  assert.throws(() => f.gateway.toggle(request));
  f.enemy.hidden = false; f.gateway.toggle(f.request("enemy"));
  f.game.combat.turns.splice(1, 1); f.gateway.refresh();
  assert.equal(f.game.user.targets.size, 0);
  f.pc.actorId = "missing";
  assert.equal(f.gateway.snapshot().sourceId, "");
  assert.ok(f.gateway.snapshot().entries.every(entry => !entry.enabled));
  assert.throws(() => f.gateway.toggle(request));
});

test("ambiguous actor requires source picker; switching sources releases acquired targets", () => {
  const f = targetingFixture();
  f.scene.tokens.push(f.makeToken("second", 100, 1, { actorId: f.actor.id }));
  assert.equal(f.gateway.snapshot().sourceId, "");
  f.gateway.selectSource({ ...f.request(), tokenId: "pc" });
  f.gateway.toggle(f.request("enemy"));
  f.gateway.selectSource({ ...f.request(), tokenId: "second" });
  assert.equal(f.gateway.snapshot().sourceId, "second");
  assert.equal(f.game.user.targets.size, 0);
});

test("synthetic Actor selects only its exact scene token", () => {
  const f = targetingFixture(); f.actor.isToken = true; f.actor.token = f.pc;
  f.scene.tokens.push(f.makeToken("second", 100, 1, { actorId: f.actor.id }));
  assert.equal(f.gateway.snapshot().sourceId, "pc");
  f.actor.token = { id: "pc", parent: { id: "other-scene" } };
  assert.equal(f.gateway.snapshot().sourceId, "");
});

test("hooks refresh collapsed/background state, reconcile deletion and dispose", async t => {
  const f = targetingFixture(); installGlobals(t, { Hooks: f.hooks });
  const scope = createTaskScope(), updates = []; t.after(() => scope.dispose());
  f.gateway.watch(scope, () => f.actor.uuid, state => updates.push(state));
  f.gateway.setExpanded(false); f.gateway.toggle(f.request("enemy"));
  f.enemy.x = 400; f.hooks.emit("updateToken", f.enemy, { x: 400 });
  await Promise.resolve();
  assert.equal(updates.at(-1).entries.find(e => e.id === "enemy").distance, 20);
  f.scene.tokens.splice(f.scene.tokens.indexOf(f.enemy), 1); f.hooks.emit("deleteToken", f.enemy);
  await Promise.resolve(); assert.equal(f.game.user.targets.size, 0);
  scope.dispose(); assert.equal(f.hooks.count("targetToken"), 0);
});

test("external release/reacquire relinquishes feature ownership; no ready canvas disables toggles", async t => {
  const f = targetingFixture(); installGlobals(t, { Hooks: f.hooks });
  const scope = createTaskScope(); t.after(() => scope.dispose());
  f.gateway.watch(scope, () => f.actor.uuid, () => {});
  f.gateway.toggle(f.request("enemy"));
  const token = f.canvas.tokens.get("enemy"); token.setTarget(false, { releaseOthers: false }); token.setTarget(true, { releaseOthers: false });
  f.gateway.refresh("Actor.other"); assert.equal(f.game.user.targets.has(token), true);
  f.canvas.ready = false;
  assert.ok(f.gateway.snapshot().entries.every(entry => !entry.enabled));
});

test("automatic source replacement clears feature selections", () => {
  const f = targetingFixture();
  f.gateway.toggle(f.request("enemy"));
  f.scene.tokens.splice(f.scene.tokens.indexOf(f.pc), 1, f.makeToken("replacement", 100, 1, { actorId: f.actor.id }));
  assert.equal(f.gateway.snapshot().sourceId, "replacement");
  assert.equal(f.game.user.targets.size, 0);
});

test("deletion reconciles independently on two connected feature clients", async t => {
  const clients = [targetingFixture(), targetingFixture()];
  for (const f of clients) {
    installGlobals(t, { Hooks: f.hooks });
    const scope = createTaskScope(); t.after(() => scope.dispose());
    f.gateway.watch(scope, () => f.actor.uuid, () => {});
    f.gateway.toggle(f.request("enemy"));
    f.scene.tokens.splice(f.scene.tokens.indexOf(f.enemy), 1);
    f.hooks.emit("deleteToken", f.enemy);
  }
  await Promise.resolve();
  assert.ok(clients.every(f => f.game.user.targets.size === 0));
});

test("animation refresh is relevant-token filtered, frame coalesced and disposed without idle polling", t => {
  let nextFrame = 0;
  const frames = new Map(), updates = [];
  const f = targetingFixture({ requestFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelFrame: id => frames.delete(id) });
  installGlobals(t, { Hooks: f.hooks });
  const scope = createTaskScope(); t.after(() => scope.dispose());
  f.gateway.watch(scope, () => f.actor.uuid, state => updates.push(state));
  f.hooks.emit("refreshToken", f.canvas.tokens.get("enemy"), { refreshPosition: true });
  assert.equal(frames.size, 0); // Collapsed: no live display to refresh.
  f.gateway.setExpanded(true);
  f.hooks.emit("refreshToken", f.canvas.tokens.get("outside"), { refreshPosition: true });
  f.hooks.emit("refreshToken", f.canvas.tokens.get("enemy"), { refreshTarget: true });
  assert.equal(frames.size, 0);
  f.enemy.x = 400;
  for (let i = 0; i < 4; i++) f.hooks.emit("refreshToken", f.canvas.tokens.get("enemy"), { refreshPosition: true });
  assert.equal(frames.size, 1);
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(); };
  flush();
  assert.equal(updates.at(-1).entries.find(entry => entry.id === "enemy").distance, 20);
  assert.equal(frames.size, 0);
  const before = updates.length;
  f.hooks.emit("refreshToken", f.canvas.tokens.get("enemy"), { refreshPosition: true }); flush();
  assert.equal(updates.length, before); // Identical distances do not publish again.
  f.pc.x = 100; f.hooks.emit("refreshToken", f.canvas.tokens.get("pc")); flush(); // v13 flags may be absent.
  assert.equal(updates.at(-1).entries.find(entry => entry.id === "enemy").distance, 15);
  f.hooks.emit("refreshToken", f.canvas.tokens.get("enemy"), { refreshSize: true });
  assert.equal(frames.size, 1); scope.dispose(); assert.equal(frames.size, 0);
  assert.equal(f.hooks.count("refreshToken"), 0);
});
