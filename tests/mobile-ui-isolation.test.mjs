import test from "node:test";
import assert from "node:assert/strict";
import { classifyMobileApplication } from "../src/foundry/mobile-presentation.mjs";
import { ownMobileApplication, runMobileApplicationWorkflow, mobileWorkflowPending } from "../src/foundry/mobile-ui-isolation.mjs";
import { installGlobals } from "./helpers/foundry.mjs";

function root({ modal = false, framed = false } = {}) {
  return { isConnected: true, closest: () => null,
    matches: selector => modal && selector.split(", ").includes("dialog"),
    querySelector: selector => framed && selector === ".window-header" ? {} : null };
}

test("new render hooks and generic modal flags do not authorize third-party windows", () => {
  for (const modal of [false, true]) for (const framed of [false, true]) {
    assert.equal(classifyMobileApplication(root({ modal, framed }), { options: { modal } }).admitted, false);
  }
  assert.equal(classifyMobileApplication(root(), {}, { deliberate: true }).admitted, false);
});

test("explicit delayed editors and approved native parents preserve their admission", () => {
  const editor = ownMobileApplication({});
  assert.equal(classifyMobileApplication(root(), editor, { preExisting: true }).admitted, true);
  assert.equal(classifyMobileApplication(root({ modal: true }), {}, { approvedParent: true }).admitted, true);
  assert.equal(classifyMobileApplication(root(), {}, { retained: true }).admitted, true);
});

test("native Warhammer roll ancestry is allowed without admitting other library applications", t => {
  class WarhammerRollDialogV2 {}
  class CharacteristicDialog extends WarhammerRollDialogV2 {}
  installGlobals(t, { warhammer: { apps: { WarhammerRollDialogV2 } } });
  assert.equal(classifyMobileApplication(root(), new CharacteristicDialog()).admitted, true);
  assert.equal(classifyMobileApplication(root(), {}).admitted, false);
});

test("awaited module workflows permit core confirmation dialogs, not arbitrary subclasses", async t => {
  class DialogV2 {}
  class Widget extends DialogV2 {}
  installGlobals(t, { foundry: { applications: { api: { DialogV2 } } } });
  assert.equal(mobileWorkflowPending(), false);
  await runMobileApplicationWorkflow(async () => {
    await Promise.resolve();
    assert.equal(classifyMobileApplication(root({ modal: true }), new DialogV2()).admitted, true);
    assert.equal(classifyMobileApplication(root({ modal: true }), new Widget()).admitted, false);
  });
  assert.equal(mobileWorkflowPending(), false);
  assert.equal(classifyMobileApplication(root({ modal: true }), new DialogV2()).admitted, false);
});

test("cancelled runtime ownership and failed workflows revoke confirmation admission", async () => {
  let active = true;
  await assert.rejects(runMobileApplicationWorkflow(async () => {
    assert.equal(mobileWorkflowPending(), true);
    active = false;
    assert.equal(mobileWorkflowPending(), false);
    throw new Error("cancelled");
  }, () => active), /cancelled/);
  assert.equal(mobileWorkflowPending(), false);
});
