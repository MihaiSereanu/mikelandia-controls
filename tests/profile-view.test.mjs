import test from "node:test";
import assert from "node:assert/strict";
import { createProfilePanels, readProfilePath } from "../src/systems/profile-view.mjs";

const field = (id, extra = {}) => ({ id, label: id, path: `system.${id}`, ...extra });
const profile = fields => ({ tabs: [{ id: "main", label: "Game Main", sections: [{ id: "resources", label: "Game Resources", kind: "counters", fields }] }] });

test("missing and malformed numeric data is omitted while zero remains visible", () => {
  const actor = { system: { zero: 0, empty: "", absent: null, bool: false, nan: NaN, infinite: Infinity, object: {} } };
  const panels = createProfilePanels(actor, profile(["zero", "empty", "absent", "bool", "nan", "infinite", "object", "missing"].map(id => field(id))));
  assert.deepEqual(panels[0].sections[0].rows, [{ id: "zero", label: "zero", value: 0, format: "number" }]);
});

test("profile counters read only explicitly configured maxima", () => {
  const actor = { system: { wounds: 0, limit: 0, fortune: 2 } };
  const rows = createProfilePanels(actor, profile([field("wounds", { maxPath: "system.limit" }), field("fortune")]))[0].sections[0].rows;
  assert.equal(rows[0].max, 0);
  assert.equal(rows[1].max, undefined);
});

test("the same projector preserves different games' labels and field paths", () => {
  const actor = { system: { hp: { value: 6 } } };
  const panels = createProfilePanels(actor, { tabs: [{ id: "main", label: "Character", sections: [
    { id: "hp", kind: "values", label: "Hit Points", fields: [{ id: "hp", label: "Hit Points", path: "system.hp.value" }] }
  ] }] });
  assert.equal(panels[0].sections[0].rows[0].label, "Hit Points");
  assert.equal(panels[0].sections[0].rows[0].value, 6);
});

test("native localization keys are used with explicit game label fallbacks", () => {
  const spec = profile([field("wounds", { label: "Wounds", labelKey: "native.wounds" })]);
  const project = localize => createProfilePanels({ system: { wounds: 4 } }, spec, { localize })[0].sections[0].rows[0].label;
  assert.equal(project(key => key === "native.wounds" ? "Blessures" : key), "Blessures");
  assert.equal(project(key => key), "Wounds");
  assert.equal(project(() => undefined), "Wounds");
});

test("profile traversal rejects prototype keys and tolerates unavailable getters", () => {
  const actor = { get system() { throw new Error("unprepared"); } };
  for (const path of ["constructor.prototype", "__proto__.value", "system..value", "system[hp]", "system.hp"]) {
    assert.equal(readProfilePath(actor, path), undefined);
  }
  assert.deepEqual(createProfilePanels(actor, profile([field("hp")])), []);
});

test("malformed sections and duplicate IDs cannot create extra controls", () => {
  const spec = { tabs: [{ id: "main", label: "Main", sections: [
    { id: "same", kind: "values", label: "First", fields: [field("hp"), field("hp"), null] },
    { id: "same", kind: "values", label: "Duplicate", fields: [field("hp")] },
    { id: "unsafe", kind: "script", label: "Ignored", path: "system.hp" }, null
  ] }, { id: "main", label: "Duplicate tab", sections: [] }] };
  const tabs = createProfilePanels({ system: { hp: 3 } }, spec);
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].sections.length, 1);
  assert.equal(tabs[0].sections[0].rows.length, 1);
});

test("text stays text, boolean false is retained, and document objects are never serialized", () => {
  const actor = { system: { text: '<img id="injected">', momentum: false, document: { name: "secret" } } };
  const tabs = createProfilePanels(actor, { tabs: [{ id: "main", label: "Main", sections: [
    { id: "notes", label: "Notes", kind: "text", path: "system.text" },
    { id: "state", label: "Momentum", kind: "values", fields: [field("momentum", { format: "boolean" }), field("document", { format: "text" })] }
  ] }] });
  assert.equal(tabs[0].sections[0].text, '<img id="injected">');
  assert.equal(tabs[0].sections[1].rows.length, 1);
  assert.equal(tabs[0].sections[1].rows[0].value, false);
  assert.equal(Object.isFrozen(tabs[0].sections[1].rows[0]), true);
});
