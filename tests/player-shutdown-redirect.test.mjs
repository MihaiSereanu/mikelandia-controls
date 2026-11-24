import test from "node:test";
import assert from "node:assert/strict";
import { installPlayerShutdownRedirect } from "../src/foundry/session/player-shutdown-redirect.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";

function fixture(t, { isGM = false, prefix = "" } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const events = new Map(), visits = [], notices = [];
  const socket = {
    on(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); },
    off(name, fn) { events.get(name)?.delete(fn); },
    listeners(name) { return [...events.get(name) ?? []]; },
    emit(name, ...args) { for (const fn of this.listeners(name)) fn(...args); }
  };
  const window = { location: {} }, getRoute = path => `${prefix}/${path === "/" ? "" : path}`;
  const ui = { notifications: { info: (...args) => notices.push(args) } };
  // Foundry 14.369's actual shutdown listener, including its competing root timer.
  const native = () => {
    ui.notifications.info("GAME.WorldShuttingDown", {localize: true, permanent: true});
    setTimeout(() => window.location.href = getRoute("/"), 1000);
  };
  socket.on("shutdown", native);
  const game = { user: { isGM }, socket }, scope = createTaskScope("shutdown-test");
  t.after(() => scope.dispose());
  const install = () => installPlayerShutdownRedirect(scope, {
    getGame: () => game, getRoute, navigate: url => visits.push(url),
    notify: () => ui.notifications.info("GAME.WorldShuttingDown", { localize: true, permanent: true })
  });
  return { socket, game, scope, visits, notices, native, window, install };
}

for (const prefix of ["", "/foundry"]) test(`players redirect on shutdown only, preserving the notification and route prefix '${prefix}'`, t => {
  const f = fixture(t, { prefix });
  let otherModuleCalls = 0;
  const otherModule = () => otherModuleCalls++;
  f.socket.on("shutdown", otherModule);
  assert.equal(f.install(), true);
  for (const event of ["disconnect", "pause", "reload"]) f.socket.emit(event);
  t.mock.timers.tick(5000);
  assert.deepEqual(f.visits, []);
  assert.deepEqual(f.notices, []);
  f.socket.emit("shutdown");
  assert.equal(otherModuleCalls, 1);
  assert.deepEqual(f.notices, [["GAME.WorldShuttingDown", { localize: true, permanent: true }]]);
  t.mock.timers.tick(999);
  assert.deepEqual(f.visits, []);
  t.mock.timers.tick(1);
  assert.deepEqual(f.visits, [`${prefix}/mobile/`]);
  assert.equal(f.window.location.href, undefined, "native root navigation must not race the portal");
  f.socket.emit("shutdown");
  t.mock.timers.tick(1000);
  assert.equal(f.visits.length, 1);
});

test("GM shutdown keeps the native destination and listener", t => {
  const f = fixture(t, { isGM: true });
  assert.equal(f.install(), false);
  assert.deepEqual(f.socket.listeners("shutdown"), [f.native]);
  f.socket.emit("shutdown");
  t.mock.timers.tick(1000);
  assert.equal(f.window.location.href, "/");
  assert.deepEqual(f.visits, []);
});

test("a player promoted to GM before stopping the world uses native shutdown", t => {
  const f = fixture(t);
  f.install();
  f.game.user.isGM = true;
  f.socket.emit("shutdown");
  t.mock.timers.tick(1000);
  assert.equal(f.window.location.href, "/");
  assert.deepEqual(f.visits, []);
});

test("cleanup cancels a pending redirect and restores only the native listener", t => {
  const f = fixture(t), otherModule = () => {};
  f.socket.on("shutdown", otherModule);
  f.install();
  f.socket.emit("shutdown");
  f.scope.dispose();
  t.mock.timers.tick(1000);
  assert.deepEqual(f.visits, []);
  assert.deepEqual(f.socket.listeners("shutdown"), [otherModule, f.native]);
});

test("unknown native shutdown handlers remain untouched", t => {
  const f = fixture(t), unknown = () => {};
  f.socket.off("shutdown", f.native);
  f.socket.on("shutdown", unknown);
  const warning = t.mock.method(console, "warn", () => {});
  assert.equal(f.install(), false);
  assert.deepEqual(f.socket.listeners("shutdown"), [unknown]);
  assert.equal(warning.mock.calls.length, 1);
});

test("missing user or socket API leaves startup intact", t => {
  const f = fixture(t);
  f.game.user = null;
  assert.equal(f.install(), false);
  f.game.user = { isGM: false };
  f.game.socket = {};
  assert.equal(f.install(), false);
});
