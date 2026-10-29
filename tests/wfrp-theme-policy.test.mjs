import test from "node:test";
import assert from "node:assert/strict";
import { createWfrpThemePolicy } from "../src/foundry/compatibility/wfrp-theme-policy.mjs";

const sections = ["actor", "item", "journal", "sidebar", "apps"];
const element = () => {
  const classes = new Set(["classic-font", "unrelated"]);
  return { classes, classList: {
    add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value)
  } };
};

function fixture({ mobile = true, system = "wfrp4e", scope = "client" } = {}) {
  let theme = Object.fromEntries(sections.map((key, index) => [key, { enabled: true, font: index % 2 ? "readable" : "classic" }]));
  theme.futureOption = "preserved";
  const original = structuredClone(theme);
  const writes = [], events = new Map(), cleanups = [], errors = [];
  const body = element(), sidebar = element(), chat = element(), journal = element();
  journal.classes.add("journal-sheet");
  const sheetThemes = [];
  const applications = [
    { document: { documentName: "Actor" }, setTheme: value => sheetThemes.push(value) },
    { document: { documentName: "Item" }, setTheme: value => sheetThemes.push(value) },
    { element: journal },
    { setTheme() { throw new Error("Unrelated application must not be themed"); } }
  ];
  const game = { system: { id: system }, settings: {
    settings: new Map([["wfrp4e.theme", { scope }]]),
    get: () => theme,
    async set(namespace, key, value) {
      writes.push({ namespace, key, value });
      theme = structuredClone(value);
      events.get("clientSettingChanged")?.("wfrp4e.theme", theme);
    }
  } };
  const policy = createWfrpThemePolicy({ getGame: () => game,
    getDocument: () => ({ body, querySelector: () => chat }), getSidebar: () => sidebar,
    getApplications: () => applications, readMobile: () => mobile, onError: error => errors.push(error)
  });
  const taskScope = { own: callback => cleanups.push(callback), hook: (name, callback) => events.set(name, callback) };
  return { policy, taskScope, original, writes, events, errors, sheetThemes, elements: [body, sidebar, chat, journal],
    game, get theme() { return theme; }, set theme(value) { theme = value; },
    desktop() { mobile = false; }, dispose() { cleanups.forEach(callback => callback()); } };
}

test("mobile saves all WFRP sections off, preserves fonts, and removes existing native themes", async () => {
  const f = fixture();
  f.policy.start(f.taskScope);
  await f.policy.reconcile();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].namespace, "wfrp4e");
  assert.equal(f.writes[0].key, "theme");
  for (const section of sections) {
    assert.equal(f.theme[section].enabled, false);
    assert.equal(f.theme[section].font, f.original[section].font);
  }
  assert.equal(f.theme.futureOption, "preserved");
  for (const node of f.elements) {
    assert.equal(node.classes.has("no-theme"), true);
    assert.equal(node.classes.has("classic-font"), false);
    assert.equal(node.classes.has("unrelated"), true);
  }
  assert.ok(f.sheetThemes.length >= 2);
  assert.ok(f.sheetThemes.every(theme => sections.every(section => theme[section].enabled === false)));
  assert.deepEqual(f.errors, []);
});

test("ready, previews and saved re-enabling are corrected without repeated writes or reloads", async () => {
  const f = fixture();
  f.policy.start(f.taskScope);
  await f.policy.reconcile();
  for (const node of f.elements) node.classes.add("classic-font");
  f.events.get("ready")();
  f.events.get("renderApplicationV2")();
  await f.policy.reconcile();
  assert.equal(f.writes.length, 1);
  assert.ok(f.elements.every(node => !node.classes.has("classic-font")));
  f.theme = structuredClone(f.original);
  f.events.get("clientSettingChanged")("wfrp4e.theme");
  await f.policy.reconcile();
  assert.equal(f.writes.length, 2);
  assert.ok(sections.every(section => f.theme[section].enabled === false));
});

test("Desktop keeps the saved off preference but stops enforcing it", async () => {
  const f = fixture();
  await f.policy.reconcile();
  f.desktop();
  await f.policy.reconcile();
  assert.equal(f.writes.length, 1);
  assert.ok(sections.every(section => f.theme[section].enabled === false));
  f.theme = structuredClone(f.original);
  await f.policy.reconcile();
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.theme, f.original);
});

for (const options of [{ mobile: false }, { system: "shadowdark" }, { system: "dnd5e" }]) {
  test(`does not alter settings outside mobile WFRP: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    await f.policy.reconcile();
    assert.equal(f.writes.length, 0);
    assert.equal(f.sheetThemes.length, 0);
  });
}

test("rejects world scope and unsupported schemas without writing", async () => {
  const world = fixture({ scope: "world" });
  await assert.rejects(world.policy.reconcile(), /client setting is unavailable/);
  assert.equal(world.writes.length, 0);
  const legacy = fixture();
  legacy.theme = true;
  await assert.rejects(legacy.policy.reconcile(), /unsupported/);
  assert.equal(legacy.writes.length, 0);
});

test("failed writes report an error and can recover; disposal prevents pending work", async () => {
  const f = fixture();
  const save = f.game.settings.set;
  f.game.settings.set = async () => { throw new Error("storage unavailable"); };
  await assert.rejects(f.policy.reconcile(), /storage unavailable/);
  f.game.settings.set = save;
  f.policy.start(f.taskScope);
  await f.policy.reconcile();
  assert.equal(f.writes.length, 1);
  f.theme = structuredClone(f.original);
  const pending = f.policy.reconcile();
  f.dispose();
  await pending;
  assert.equal(f.writes.length, 1);
});
