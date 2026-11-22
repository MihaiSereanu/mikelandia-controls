import test from "node:test";
import assert from "node:assert/strict";
import { installWfrpHitLocation, registerWfrpHitLocationSetting, HIT_LOCATION_SETTING } from "../src/foundry/compatibility/wfrp-hit-location.mjs";
import { nativeHitLocationClass } from "./fixtures/wfrp5-hit-location-10.1.2.mjs";

function fixture({ enabled = true, system = "wfrp4e", customTable = false } = {}) {
  const registered = new Map(), calls = [], cleanups = [];
  const game = {
    system: { id: system }, user: { isGM: false },
    settings: {
      register: (namespace, key, value) => registered.set(`${namespace}.${key}`, value),
      get: (namespace, key) => { assert.equal(namespace, "mikelandia-controls"); assert.equal(key, HIT_LOCATION_SETTING); return enabled; }
    },
    i18n: { localize: value => value },
    wfrp4e: { tables: {
      async rollTable(key, options) {
        calls.push({ key, ...options });
        const roll = options.lookup ?? 81;
        const result = customTable ? "body" : roll <= 9 ? "head" : roll <= 24 ? "lArm" : roll <= 44 ? "rArm" : roll <= 79 ? "body" : roll <= 89 ? "lLeg" : "rLeg";
        return { roll, result, description: customTable ? "Custom torso" : result };
      },
      hitLocKeyToResult: key => ({ roll: 1, result: key, description: key })
    } }
  };
  const Native = nativeHitLocationClass(game);
  game.wfrp4e.rolls5e = { TestWFRP5e: Native };
  const original = Native.prototype.computeHitLocation;
  registerWfrpHitLocationSetting(game);
  const installed = installWfrpHitLocation({ own: fn => cleanups.push(fn) }, game);
  const makeTest = (roll = 23, hitLocation = {}) => Object.assign(new Native(), {
    result: { roll }, testData: { hitLocation: { selected: "roll", roll: null, ...hitLocation } }
  });
  return { game, Native, original, installed, registered, calls, makeTest,
    setEnabled(value) { enabled = value; }, dispose() { cleanups.forEach(fn => fn()); } };
}

for (const [roll, locationRoll] of [[23, 32], [1, 10], [10, 1], [7, 70], [11, 11], [100, 100]]) {
  test(`native 5e automatic location reverses final ${roll} to ${locationRoll}`, async () => {
    const f = fixture(), attack = f.makeTest(roll);
    await attack.computeHitLocation();
    assert.equal(attack.result.hitloc.roll, locationRoll);
    assert.deepEqual(f.calls, [{ key: "hitloc", lookup: locationRoll, hideDSN: true }]);
  });
}

test("configured table receives the reversed final result and native arm labels remain", async () => {
  const f = fixture({ customTable: true }), attack = f.makeTest();
  await attack.computeHitLocation();
  assert.equal(attack.result.hitloc.description, "Custom torso");
  const ordinary = fixture().makeTest();
  await ordinary.computeHitLocation();
  assert.equal(ordinary.result.hitloc.description, "Primary Arm");
});

test("automatic locations recalculate on reroll, Advantage/unreverse and chat recreation", async () => {
  const f = fixture(), attack = f.makeTest(23);
  await attack.computeHitLocation();
  for (const roll of [54, 45, 9]) {
    // Native roll() resets result but retains serialized testData.
    const recreated = f.makeTest(roll, JSON.parse(JSON.stringify(attack.testData.hitLocation)));
    await recreated.computeHitLocation();
    assert.equal(recreated.result.hitloc.roll, roll === 9 ? 90 : roll === 54 ? 45 : 54);
    attack.testData = recreated.testData;
  }
});

test("SL-only recalculation stays stable while explicit location edits survive rerolls", async () => {
  const f = fixture(), attack = f.makeTest();
  await attack.computeHitLocation();
  attack.result = { roll: 23, SL: 4 };
  await attack.computeHitLocation();
  assert.equal(attack.result.hitloc.roll, 32);
  attack.testData.hitLocation.roll = 88; // Native edit(data.hitloc).
  attack.result = { roll: 23 };
  await attack.computeHitLocation();
  assert.equal(attack.result.hitloc.roll, 88);
  assert.equal(attack.testData.hitLocation.mikelandiaAutomaticRoll, undefined);
  attack.result = { roll: 12 };
  await attack.computeHitLocation();
  assert.equal(attack.result.hitloc.roll, 88);
});

test("called shots and pre-existing unmarked chat locations stay native", async () => {
  const f = fixture(), called = f.makeTest(23, { selected: "head", table: { head: "Head" } });
  await called.computeHitLocation();
  assert.equal(called.result.hitloc.result, "head");
  assert.equal(called.result.hitloc.description, "Head (ROLL.CalledShot)");
  assert.equal(f.calls.length, 0);
  const existing = f.makeTest(23, { roll: 72 });
  await existing.computeHitLocation();
  assert.equal(existing.result.hitloc.roll, 72);
});

test("GM world setting defaults on for all clients; disabling immediately delegates to native", async () => {
  const f = fixture();
  const setting = f.registered.get(`mikelandia-controls.${HIT_LOCATION_SETTING}`);
  assert.deepEqual([setting.scope, setting.config, setting.restricted, setting.default, setting.type], ["world", true, true, true, Boolean]);
  f.setEnabled(false);
  const native = f.makeTest();
  await native.computeHitLocation();
  assert.equal(native.result.hitloc.roll, 81);
  assert.equal(f.calls[0].lookup, undefined);
  f.setEnabled(true);
  const fixed = f.makeTest();
  await fixed.computeHitLocation();
  assert.equal(fixed.result.hitloc.roll, 32);
  f.dispose();
  assert.equal(f.Native.prototype.computeHitLocation, f.original);
});

test("other systems and unavailable 5e methods are untouched", () => {
  const other = fixture({ system: "shadowdark" });
  assert.equal(other.installed, false);
  assert.equal(other.registered.size, 0);
  assert.equal(other.Native.prototype.computeHitLocation, other.original);
  const f = fixture();
  f.dispose();
  const native4e = () => {};
  f.game.wfrp4e.rolls = { TestWFRP: native4e };
  delete f.game.wfrp4e.rolls5e;
  assert.equal(installWfrpHitLocation({ own: assert.fail }, f.game), false);
  assert.equal(f.game.wfrp4e.rolls.TestWFRP, native4e);
});
