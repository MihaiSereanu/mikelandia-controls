import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryTokenMovementGateway } from "../src/foundry/token-movement-gateway.mjs";
import { createTaskScope } from "../src/kernel/task-scope.mjs";
import { createHooks, installGlobals } from "./helpers/foundry.mjs";

function fixture(t) {
  const scope = createTaskScope("token-touch"); t.after(() => scope.dispose());
  const hooks = createHooks(); installGlobals(t, { Hooks: hooks });
  const user = { id: "gamingtable", isGM: false, targets: new Set() };
  const game = { user, world: { id: "gotfn" }, paused: false };
  const token = { id: "argos", actorId: "pc", isOwner: true, x: 0, y: 0, width: 1, height: 1 };
  const object = { document: token, controlled: false, visible: true,
    control() { this.controlled = true; canvas.tokens.controlled = [this]; hooks.emit("controlToken", this, true); return true; },
    setTarget(value) { value ? user.targets.add(this) : user.targets.delete(this); } };
  token.object = object;
  const surface = new EventTarget(), browser = new EventTarget();
  surface.ownerDocument = { defaultView: browser };
  surface.setPointerCapture = () => {}; surface.releasePointerCapture = () => {};
  const view = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }) };
  const canvas = { ready: true, scene: { id: "scene", tokens: new Map([[token.id, token]]) },
    app: { renderer: { canvas: view, screen: { width: 300, height: 300 } } },
    stage: { scale: { x: 1 }, pivot: { x: 150, y: 150 } }, tokens: { placeables: [object], controlled: [] } };
  let time = 0;
  const timers = new Map(); let sequence = 0;
  const gateway = createFoundryTokenMovementGateway({ getGame: () => game, getCanvas: () => canvas,
    getDocument: () => null, now: () => time, haptic: () => {},
    setTimeoutFn: fn => { timers.set(++sequence, fn); return sequence; }, clearTimeoutFn: id => timers.delete(id) });
  const errors = [], results = [];
  const binding = gateway.bindTouch(surface, scope, result => results.push(result), error => errors.push(error));
  const emit = (target, type, id = 1, extra = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: id, pointerType: "touch", isPrimary: true, button: 0, clientX: 50, clientY: 50, ...extra });
    target.dispatchEvent(event);
  };
  const tap = () => { emit(surface, "pointerdown"); time += 40; emit(browser, "pointerup"); };
  return { game, canvas, token, object, gateway, scope, surface, browser, timers, results, errors, binding, emit, tap,
    advance: amount => { time += amount; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("single touch selects immediately and double touch targets without releasing control", async t => {
  const f = fixture(t); f.tap(); await tick();
  assert.equal(f.object.controlled, true);
  assert.equal(f.results.at(-1).action, "selected");
  f.advance(80); f.tap(); await tick();
  assert.equal(f.results.at(-1).action, "targeted");
  assert.equal(f.object.controlled, true); assert.equal(f.game.user.targets.has(f.object), true);
});
for (const type of ["pointercancel", "lostpointercapture"]) test(`${type} for another contact cannot cancel the active token gesture`, t => {
  const f = fixture(t); f.emit(f.surface, "pointerdown", 1);
  f.emit(type === "pointercancel" ? f.browser : f.surface, type, 2);
  assert.equal(f.binding.phase, "pending");
});
for (const reason of ["native rejection", "module release"]) test(`selection reports ${reason} instead of claiming success`, async t => {
  const f = fixture(t);
  if (reason === "native rejection") f.object.control = () => false;
  else f.game.user.targets.clear(), f.object.control = () => { f.object.controlled = false; return true; };
  await assert.rejects(f.gateway.tap({ sceneId: "scene", clientX: 50, clientY: 50 }), { code: "CONTROL_REJECTED" });
});

test("movement before a hold pans without selecting, and an owned-token hold still arms", t => {
  const f = fixture(t); f.emit(f.surface, "pointerdown"); f.emit(f.browser, "pointermove", 1, { clientX: 80 });
  assert.equal(f.binding.phase, "scene-pan"); assert.equal(f.object.controlled, false);
  f.emit(f.browser, "pointerup", 1, { clientX: 80 });
  f.emit(f.surface, "pointerdown"); f.advance(500);
  for (const callback of [...f.timers.values()]) callback();
  assert.equal(f.binding.phase, "armed"); assert.equal(f.object.controlled, true);
});

test("a rejected native hold never arms or starts a drag", t => {
  const f = fixture(t); f.object.control = () => false;
  f.emit(f.surface, "pointerdown"); f.advance(500);
  for (const callback of [...f.timers.values()]) callback();
  assert.equal(f.binding.phase, "cancelled"); assert.equal(f.errors.at(-1).code, "CONTROL_REJECTED");
});
