import test from "node:test";
import assert from "node:assert/strict";
import { enableHiddenCanvasRendering } from "../src/foundry/presentation/hidden-canvas-rendering.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";
import { installGlobals } from "./helpers/foundry.mjs";
import { targetingFixture } from "./helpers/targeting.mjs";

function application() {
  const calls = [];
  let blocked = true;
  const renderer = { render(...args) { calls.push(args); return "drawn"; } };
  const app = { stage: {}, renderer, view: { closest: () => blocked ? {} : null },
    render() { return this.renderer.render(this.stage); } };
  return { app, calls, setBlocked: value => { blocked = value; } };
}

test("hidden board skips screen draws but keeps visible draws, textures and other stages", t => {
  const f = targetingFixture(), a = application();
  installGlobals(t, { Hooks: f.hooks });
  const scope = createTaskScope(), document = { visibilityState: "visible" };
  f.canvas.app = a.app;
  const original = a.app.renderer.render;
  try {
    enableHiddenCanvasRendering(scope, { getCanvas: () => f.canvas, document });
    a.app.render(); assert.equal(a.calls.length, 0);
    a.app.renderer.render(a.app.stage, { renderTexture: {} });
    a.app.renderer.render({ tokenPreview: true });
    assert.equal(a.calls.length, 2, "offscreen and preview rendering remain native");
    a.setBlocked(false);
    assert.equal(a.app.render(), "drawn");
    document.visibilityState = "hidden";
    a.app.render(); assert.equal(a.calls.length, 3);
    document.visibilityState = "visible";
    a.app.render(); assert.equal(a.calls.length, 4);
    scope.dispose();
    assert.equal(a.app.renderer.render, original);
    a.setBlocked(true); a.app.render(); assert.equal(a.calls.length, 5);
    assert.equal(f.hooks.count("canvasReady"), 0);
  } finally { scope.dispose(); }
});

test("target selection and animated distances update while every board screen draw is skipped", async t => {
  let frame;
  const f = targetingFixture({ requestFrame: callback => { frame = callback; return 1; }, cancelFrame: () => {} });
  const a = application(); installGlobals(t, { Hooks: f.hooks });
  const scope = createTaskScope();
  f.canvas.app = a.app;
  let state;
  try {
    enableHiddenCanvasRendering(scope, { getCanvas: () => f.canvas, document: {} });
    f.gateway.watch(scope, () => f.actor.uuid, next => { state = next; });
    f.gateway.setExpanded(true);
    f.gateway.toggle(f.request("enemy"));
    await Promise.resolve();
    assert.equal(state.entries.find(e => e.id === "enemy").selected, true);
    for (const x of [400, 500, 600]) {
      // Foundry's independent movement/render-flag callbacks still run before
      // the application screen draw; they update the live document and hook.
      f.enemy.x = x;
      f.hooks.emit("refreshToken", f.canvas.tokens.get("enemy"), { refreshPosition: true });
      frame(); frame = null;
      a.app.render();
      assert.equal(state.entries.find(e => e.id === "enemy").distance, x / 100 * 5);
      assert.equal(state.entries.find(e => e.id === "enemy").selected, true);
    }
    f.gateway.toggle(f.request("enemy")); await Promise.resolve();
    assert.equal(f.game.user.targets.size, 0);
    assert.equal(a.calls.length, 0);
    assert.equal(f.canvas.ready, true);
  } finally { scope.dispose(); }
});

test("canvas initialization and replacement attach only to the current renderer", t => {
  const f = targetingFixture(); installGlobals(t, { Hooks: f.hooks });
  const scope = createTaskScope(), a = application(), b = application();
  const original = a.app.renderer.render;
  try {
    enableHiddenCanvasRendering(scope, { getCanvas: () => f.canvas, document: {} });
    f.canvas.app = a.app; f.hooks.emit("canvasReady");
    a.app.render(); assert.equal(a.calls.length, 0);
    f.hooks.emit("canvasReady");
    f.canvas.app = b.app; f.hooks.emit("canvasReady");
    assert.equal(a.app.renderer.render, original);
    b.app.render(); assert.equal(b.calls.length, 0);
    scope.dispose(); b.app.render(); assert.equal(b.calls.length, 1);
  } finally { scope.dispose(); }
});
