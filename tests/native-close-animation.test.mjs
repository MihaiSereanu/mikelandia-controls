import test from "node:test";
import assert from "node:assert/strict";
import { disableMobileV2CloseAnimation } from "../src/foundry/mobile-presentation.mjs";
import { installGlobals } from "./helpers/foundry.mjs";

test("V2 close delegates options to the native API with animation disabled and restores afterward", async () => {
  const calls = [], app = { isV2: true, close(options) { calls.push({ receiver: this, options }); return Promise.resolve(this); } };
  const original = app.close, restore = disableMobileV2CloseAnimation(app);
  assert.equal(await app.close({ submit: true, animate: true }), app);
  assert.deepEqual(calls[0].options, { submit: true, animate: false }); assert.equal(calls[0].receiver, app);
  restore(); assert.equal(app.close, original);
  await app.close({ animate: true }); assert.equal(calls[1].options.animate, true);
});
test("V1 and legacy sheets keep their own close behavior", () => {
  for (const isV2 of [false, undefined]) {
    const app = { isV2, close() {} }, original = app.close;
    const restore = disableMobileV2CloseAnimation(app);
    assert.equal(app.close, original); restore(); assert.equal(app.close, original);
  }
});
test("native V2 prompts are recognized without the document-sheet isV2 flag", async t => {
  class ApplicationV2 { close(options) { return options; } }
  installGlobals(t, { foundry: { applications: { api: { ApplicationV2 } } } });
  const app = new ApplicationV2(), original = app.close;
  const restore = disableMobileV2CloseAnimation(app);
  assert.deepEqual(app.close(), { animate: false }); restore(); assert.equal(app.close, original);
});
