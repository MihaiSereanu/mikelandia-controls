import test from "node:test";
import assert from "node:assert/strict";
import { readWarhammerContext } from "../src/systems/wfrp4e/context.mjs";

for (const [label, edition, enabled] of [
  ["legacy 5e", { use5e: true }, true],
  ["legacy 4e", { use5e: false }, false],
  ["10.2 5e", { tests: "5e" }, true],
  ["10.2 4e overrides stale legacy flag", { tests: "4e", use5e: true }, false],
  ["10.2 5e overrides legacy false", { tests: "5e", use5e: false }, true],
  ["missing", undefined, false],
  ["empty", {}, false],
  ["invalid legacy", { use5e: "true" }, false],
  ["invalid tests", { tests: true, use5e: true }, false],
  ["null tests", { tests: null, use5e: true }, false],
  ["unknown tests", { tests: "6e", use5e: true }, false]
]) {
  test(`edition detection: ${label}`, () => {
    const context = readWarhammerContext({ settings: { get: () => edition } });
    assert.deepEqual(context, enabled ? { use5e: true, revision: "5e" } : null);
    if (enabled) assert.ok(Object.isFrozen(context));
  });
}

test("missing or unreadable settings never infer 5e from runtime data", () => {
  assert.equal(readWarhammerContext(undefined), null);
  assert.equal(readWarhammerContext({ wfrp5e: { tests: true } }), null);
  assert.equal(readWarhammerContext({ settings: { get() { throw new Error("not ready"); } } }), null);
});
