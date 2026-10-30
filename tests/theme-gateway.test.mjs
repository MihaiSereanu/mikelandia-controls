import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryThemeGateway } from "../src/foundry/settings/theme-gateway.mjs";

function fixture() {
  const config = { colorScheme: { applications: "dark", interface: "light" }, fade: { opacity: 0.5 }, fontScale: 6 }, applied = [], hooks = new Map();
  const game = { settings: { get(namespace, key) { assert.equal(namespace, "core"); assert.equal(key, "uiConfig"); return structuredClone(config); }, set() { throw Error("theme must never persist native settings or snapshots"); } }, configureUI(value) { applied.push(value); } };
  let cleanup, choice = "dark";
  const scope = { hook(name, fn) { hooks.set(name, fn); }, own(fn) { cleanup = fn; } };
  const gateway = createFoundryThemeGateway({ getGame: () => game, getDocument: () => null });
  return { config, applied, hooks, gateway, start: () => gateway.start(scope, { readTheme: () => choice, setTheme: async theme => { choice = theme; } }), dispose: () => cleanup(), get choice() { return choice; } };
}

test("mobile theme configures native surfaces in memory without changing saved native preferences", async () => {
  const f = fixture(); assert.equal(f.start(), true);
  assert.deepEqual(f.applied[0].colorScheme, { applications: "dark", interface: "dark" });
  assert.equal(f.applied[0].fontScale, 6); assert.deepEqual(f.applied[0].fade, { opacity: 0.5 });
  assert.deepEqual(f.config.colorScheme, { applications: "dark", interface: "light" });
  f.gateway.sync("dark"); f.gateway.sync("dark"); assert.equal(f.applied.length, 1, "ordinary frame renders do not reconfigure native UI");
  f.gateway.sync("light"); await f.gateway.whenIdle();
  assert.deepEqual(f.applied.at(-1).colorScheme, { applications: "light", interface: "light" });
  f.dispose(); assert.equal(f.applied.length, 2, "cleanup makes no restoration writes");
  assert.equal("beginMobileSession" in f.gateway, false); assert.equal("restoreForDesktop" in f.gateway, false);
});

test("explicit native interface changes update mobile preference without a persistent native feedback loop", async () => {
  const f = fixture(); f.start();
  f.hooks.get("clientSettingChanged")("core.uiConfig", { ...f.config, colorScheme: { applications: "light", interface: "dark" } });
  await f.gateway.whenIdle(); assert.equal(f.choice, "dark");
  f.hooks.get("clientSettingChanged")("core.uiConfig", { ...f.config, colorScheme: { applications: "dark", interface: "light" } });
  await f.gateway.whenIdle(); assert.equal(f.choice, "light");
  f.dispose();
});

test("a native theme change queued before disposal cannot write mobile preference afterward", async () => {
  const f = fixture(); f.start();
  f.hooks.get("clientSettingChanged")("core.uiConfig", { colorScheme: { interface: "dark" } });
  f.hooks.get("clientSettingChanged")("core.uiConfig", { colorScheme: { interface: "light" } });
  f.dispose(); await f.gateway.whenIdle();
  assert.equal(f.choice, "dark");
});
