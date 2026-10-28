import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID, migrateBrowserBranding, registerBrandingMigration, migrateWorldBranding, readMigratedFlags } from "../src/foundry/compatibility/branding-migration.mjs";

const oldId = "ve-mobile";
const marker = `${MODULE_ID}:branding-migration:v1`;
const versionKey = `${MODULE_ID}.brandingMigrationVersion`;
function storage(entries = []) {
  const data = new Map(entries);
  return { get length() { return data.size; }, key: index => [...data.keys()][index],
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}
function document(flags) {
  const source = { flags: structuredClone(flags) }, writes = [];
  return { get flags() { return source.flags; }, toObject: () => structuredClone(source), writes,
    async update(patch) {
      writes.push(structuredClone(patch));
      for (const [path, value] of Object.entries(patch)) {
        const keys = path.split("."), leaf = keys.pop(); let parent = source;
        for (const key of keys) parent = parent[key] ??= {};
        parent[leaf] = structuredClone(value);
      }
      return this;
    } };
}
function world({ actors = [], scenes = [], isGM = true, modules = new Map() } = {}) {
  const values = new Map(), definitions = new Map(), writes = [];
  const game = { actors, scenes, modules, user: { id: "gm", isGM }, users: { activeGM: { id: "gm" } },
    settings: { settings: definitions, register: (id, key, value) => definitions.set(`${id}.${key}`, value),
      get: (id, key) => values.get(`${id}.${key}`) ?? definitions.get(`${id}.${key}`)?.default,
      async set(id, key, value) { values.set(`${id}.${key}`, value); writes.push([id, key, structuredClone(value)]); return value; } } };
  registerBrandingMigration(game);
  return { game, values, definitions, writes };
}

test("browser migration preserves preferences, restoration receipts, and existing new values", () => {
  const local = storage([
    [`${oldId}.mode`, '"phone"'], [`${MODULE_ID}.mode`, '"tablet"'],
    [`${oldId}.protectVeStyling`, "false"], [`${oldId}.graphicsSettingsSnapshot`, '{"original":{"core.maxFPS":60}}'],
    [`${oldId}:bootstrap-preferences:v1`, '{"mode":"phone","keepScreenAwake":true}'],
    [`${oldId}:module-compatibility:v1:crlngn-ui`, '{"previousValue":false}'],
    [`${oldId}:controls-invitation:v1:world:user`, "seen"], [`${oldId}:chat-composer-dock:v1:phone`, '{"height":180}'], ["unrelated", "value"]
  ]);
  const session = storage([[`${oldId}:last-recovery:v1`, '{"checkpoint":"ready"}']]);
  migrateBrowserBranding({ localStorage: local, sessionStorage: session });
  assert.equal(local.getItem(`${MODULE_ID}.mode`), '"tablet"');
  assert.equal(local.getItem(`${MODULE_ID}.protectMcStyling`), "false");
  assert.equal(local.getItem(`${MODULE_ID}.graphicsSettingsSnapshot`), local.getItem(`${oldId}.graphicsSettingsSnapshot`));
  for (const suffix of [":bootstrap-preferences:v1", ":module-compatibility:v1:crlngn-ui", ":controls-invitation:v1:world:user", ":chat-composer-dock:v1:phone"]) {
    assert.equal(local.getItem(MODULE_ID + suffix), local.getItem(oldId + suffix));
  }
  assert.equal(session.getItem(`${MODULE_ID}:last-recovery:v1`), session.getItem(`${oldId}:last-recovery:v1`));
  assert.equal(local.getItem(marker), "1"); assert.equal(session.getItem(marker), "1");
  assert.equal(local.getItem(`${oldId}.mode`), '"phone"'); assert.equal(local.getItem("unrelated"), "value");
});

test("completed browser migration never resurrects consumed restoration receipts", () => {
  const receipt = ":module-compatibility:v1:crlngn-ui", local = storage([[oldId + receipt, "owned"]]);
  migrateBrowserBranding({ localStorage: local, sessionStorage: storage() }); local.removeItem(MODULE_ID + receipt);
  assert.equal(migrateBrowserBranding({ localStorage: local, sessionStorage: storage() }).copied, 0);
  assert.equal(local.getItem(MODULE_ID + receipt), null); assert.equal(local.getItem(oldId + receipt), "owned");
});

test("failed browser writes remain retryable without marking completion", () => {
  const local = storage([[`${oldId}.mode`, '"phone"']]), write = local.setItem;
  local.setItem = () => {};
  assert.throws(() => migrateBrowserBranding({ localStorage: local, sessionStorage: storage() }), /verify/);
  assert.equal(local.getItem(marker), null); assert.equal(local.getItem(`${oldId}.mode`), '"phone"');
  local.setItem = write; migrateBrowserBranding({ localStorage: local, sessionStorage: storage() });
  assert.equal(local.getItem(`${MODULE_ID}.mode`), '"phone"'); assert.equal(local.getItem(marker), "1");
});

test("readable restoration ownership is retained when a transfer fails", () => {
  for (const suffix of [".themeSettingsSnapshot", ":module-compatibility:v1:crlngn-ui"]) {
    const local = storage([[`${oldId}.mode`, '"phone"'], [oldId + suffix, '{"previousValue":false}']]);
    const write = local.setItem;
    local.setItem = (key, value) => { if (key !== MODULE_ID + suffix) write(key, value); };
    assert.throws(() => migrateBrowserBranding({ localStorage: local, sessionStorage: storage() }), /verify/);
    assert.equal(local.getItem(marker), null); assert.equal(local.getItem(MODULE_ID + suffix), null);
    assert.equal(local.getItem(oldId + suffix), '{"previousValue":false}');
    local.setItem = write; migrateBrowserBranding({ localStorage: local, sessionStorage: storage() });
    assert.equal(local.getItem(MODULE_ID + suffix), '{"previousValue":false}');
  }
});

test("wholly unavailable storage retains normal browser fallbacks", () => {
  const unavailable = { getItem() { throw new Error("Storage disabled"); } };
  assert.deepEqual(migrateBrowserBranding({ localStorage: unavailable, sessionStorage: unavailable }), { copied: 0 });
});

test("world migration copies missing flag leaves and retains existing values, arrays and originals", async () => {
  const legacy = { shadowdarkResources: { def: 2, grit: 3, renown: 4 }, retained: [1, 2], nullable: 7 };
  const actor = document({ [oldId]: legacy, [MODULE_ID]: { shadowdarkResources: { def: 9 }, retained: [8], nullable: null } });
  const f = world({ actors: [actor] }); await migrateWorldBranding(f.game);
  assert.deepEqual(actor.flags[MODULE_ID], { shadowdarkResources: { def: 9, grit: 3, renown: 4 }, retained: [8], nullable: null });
  assert.deepEqual(actor.flags[oldId], legacy); assert.equal(f.values.get(versionKey), 1);
  const count = actor.writes.length; await migrateWorldBranding(f.game); assert.equal(actor.writes.length, count);
});

test("unlinked token migration uses raw delta flags rather than migrated base inheritance", async () => {
  const base = document({ [oldId]: { shadowdarkResources: { def: 2, grit: 3 } } });
  const delta = document({ [oldId]: { shadowdarkResources: { def: 11, grit: 12 } }, [MODULE_ID]: { shadowdarkResources: { grit: 88 } } });
  const linked = document({ [oldId]: { shadowdarkResources: { def: 99 } } });
  const f = world({ actors: [base], scenes: [{ tokens: [{ actorLink: false, delta }, { actorLink: true, delta: linked }] }] });
  await migrateWorldBranding(f.game);
  assert.equal(base.flags[MODULE_ID].shadowdarkResources.def, 2);
  assert.deepEqual(delta.flags[MODULE_ID].shadowdarkResources, { grit: 88, def: 11 });
  assert.equal(linked.writes.length, 0); assert.equal(delta.flags[oldId].shadowdarkResources.def, 11);
});

test("native update payload metadata does not become part of flag verification", async () => {
  const delta = document({ [oldId]: { shadowdarkResources: { def: 13 } } }), update = delta.update;
  delta.update = async patch => { patch._id = "native-document-id"; return update.call(delta, patch); };
  const f = world({ scenes: [{ tokens: [{ actorLink: false, delta }] }] });
  await migrateWorldBranding(f.game);
  assert.equal(delta.flags[MODULE_ID].shadowdarkResources.def, 13);
  assert.equal(f.values.get(versionKey), 1);
});

test("resource reads preserve old token overrides and new values before a GM migrates", () => {
  const actor = { flags: { [oldId]: { shadowdarkResources: { def: 1, grit: 2 } }, [MODULE_ID]: { shadowdarkResources: { def: 9, grit: 8 } } },
    token: { actorLink: false, delta: document({ [oldId]: { shadowdarkResources: { def: 7 } } }) } };
  assert.deepEqual(readMigratedFlags(actor).shadowdarkResources, { def: 7, grit: 8 });
  actor.token.delta = document({ [oldId]: { shadowdarkResources: { def: 7 } }, [MODULE_ID]: { shadowdarkResources: { def: 12 } } });
  assert.deepEqual(readMigratedFlags(actor).shadowdarkResources, { def: 12, grit: 8 });
});

test("players and other GMs do not perform shared document migration", async () => {
  const actor = document({ [oldId]: { shadowdarkResources: { def: 4 } } });
  const f = world({ actors: [actor], isGM: false }); await migrateWorldBranding(f.game);
  f.game.user.isGM = true; f.game.users.activeGM = { id: "other-gm" }; await migrateWorldBranding(f.game);
  assert.equal(actor.writes.length, 0); assert.equal(f.values.has(versionKey), false);
});

test("failed or unverifiable document updates leave migration pending and originals intact", async () => {
  const actor = document({ [oldId]: { shadowdarkResources: { def: 4 } } }), update = actor.update;
  const f = world({ actors: [actor] }); actor.update = async () => undefined;
  await assert.rejects(() => migrateWorldBranding(f.game), /verify/); assert.equal(f.values.has(versionKey), false);
  assert.equal(actor.flags[oldId].shadowdarkResources.def, 4);
  actor.update = update; await migrateWorldBranding(f.game); assert.equal(f.values.get(versionKey), 1);
});

test("orphan token data is not silently marked migrated", async () => {
  const f = world({ scenes: [{ tokens: [{ actorLink: false, _source: { delta: { flags: { [oldId]: { shadowdarkResources: { def: 4 } } } } } }] }] });
  await assert.rejects(() => migrateWorldBranding(f.game), /manual migration/); assert.equal(f.values.has(versionKey), false);
});

test("Force Client Settings migration copies registered keys opaquely and preserves other values", async () => {
  const f = world({ modules: new Map([["force-client-settings", { active: true }]]) });
  f.definitions.set(`${MODULE_ID}.mode`, {}); f.definitions.set(`${MODULE_ID}.theme`, {});
  const forced = { [`${oldId}.mode`]: { opaque: [1, 2] }, [`${oldId}.theme`]: { opaque: "old" }, [`${MODULE_ID}.theme`]: false, "unrelated.mode": 7 };
  f.values.set("force-client-settings.forced", forced); await migrateWorldBranding(f.game);
  assert.deepEqual(f.values.get("force-client-settings.forced"), { ...forced, [`${MODULE_ID}.mode`]: { opaque: [1, 2] } });
});
