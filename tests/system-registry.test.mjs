import test from "node:test";
import assert from "node:assert/strict";
import { createSystemIntegrationResolver, resolveSystemIntegration } from "../src/systems/registry.mjs";

test("only the exact D&D system ID enables legacy rules", () => {
  assert.equal(resolveSystemIntegration("dnd5e").id, "dnd5e");
  assert.equal(resolveSystemIntegration("wfrp4e").id, "wfrp4e");
  assert.equal(resolveSystemIntegration("shadowdark").id, "shadowdark");
  for (const id of [undefined, null, "", "DND5E", "WFRP4E", "SHADOWDARK", "custom"]) {
    assert.equal(resolveSystemIntegration(id).id, "fallback");
  }
});

test("pre-setup fallback is replaced when Foundry supplies the system ID", () => {
  let systemId;
  const read = createSystemIntegrationResolver(() => systemId);
  assert.equal(read().id, "fallback");
  systemId = "dnd5e";
  assert.equal(read().id, "dnd5e");
  systemId = "shadowdark";
  assert.equal(read().id, "dnd5e", "selection is retained for this application lifetime");
});

test("a known unsupported system retains its conservative integration", () => {
  let systemId = "custom";
  const read = createSystemIntegrationResolver(() => systemId);
  assert.equal(read().id, "fallback");
  systemId = "dnd5e";
  assert.equal(read().id, "fallback");
});
