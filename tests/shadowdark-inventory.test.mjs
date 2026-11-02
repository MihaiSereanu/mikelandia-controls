import test from "node:test";
import assert from "node:assert/strict";
import { createShadowdarkFixture } from "./helpers/shadowdark.mjs";
import { installGlobals, collection } from "./helpers/foundry.mjs";
import { createFoundryCommandGateway, ACTOR_COMMANDS as C } from "../src/foundry/commands/command-gateway.mjs";
function setup(t) {
  const f = createShadowdarkFixture();
  f.confirmations = [];
  f.confirmRemoval = async config => config.yes.callback();
  installGlobals(t, { game: f.game, Hooks: f.hooks, foundry: { applications: { api: { DialogV2: {
    confirm: config => { f.confirmations.push(config); return f.confirmRemoval(config); }
  } } } } });
  f.gateway = createFoundryCommandGateway();
  f.run = (name, payload = {}) => f.gateway.execute(name, { actorSourceUuid: f.actor.uuid, ...payload });
  f.quantity = value => {
    const edit = f.gateway.capabilitiesForActor(f.actor).profileEdits.find(e => e.id === "quantity:torch");
    return { resourceId: edit.id, resourceRevision: edit.revision, expectedValue: edit.value, value };
  };
  return f;
}
test("Group equipped gear quantities are editable without changing equipment flags, and renames invalidate requests", async t => {
  const f = setup(t);
  f.actor.name = "Group";
  const sword = f.actor.items.get("sword");
  const request = value => {
    const edit = f.gateway.capabilitiesForActor(f.actor).profileEdits.find(edit => edit.id === "quantity:sword");
    return { resourceId: edit.id, resourceRevision: edit.revision, expectedValue: edit.value, value };
  };
  assert.equal(f.gateway.capabilitiesForActor(f.actor).profileEdits.some(edit => edit.id.startsWith("equipped:")), false);
  await f.run(C.EDIT_PROFILE_RESOURCE, request(3));
  assert.equal(sword.system.quantity, 3);
  assert.equal(sword.system.equipped, true);
  const stale = request(4), torchRequest = f.quantity(2);
  f.actor.name = "Adventurer";
  await assert.rejects(f.run(C.EDIT_PROFILE_RESOURCE, stale), { code: "CAPABILITY_UNAVAILABLE" });
  await assert.rejects(f.run(C.EDIT_PROFILE_RESOURCE, torchRequest), { code: "STALE_STATE" });
  f.actor.name = "Group";
  f.confirmRemoval = async () => false;
  assert.equal((await f.run(C.EDIT_PROFILE_RESOURCE, request(0))).cancelled, true);
  assert.equal(sword.system.quantity, 3);
  f.confirmRemoval = async config => config.yes.callback();
  await f.run(C.EDIT_PROFILE_RESOURCE, request(0));
  assert.equal(f.actor.items.get("sword"), undefined);
});

test("Group retains basic item creation, native slot settings and stashed quantity edits", async t => {
  const f = setup(t);
  f.actor.name = "Group";
  await f.run(C.ADD_PROFILE_ITEM, { name: "Party rations", slotsUsed: 1, perQuantity: 3 });
  const item = f.actor.items.find(item => item.name === "Party rations");
  assert.equal(item.type, "Basic");
  assert.equal(item.system.quantity, 1);
  assert.deepEqual(item.system.slots, { slots_used: 1, per_slot: 3, free_carry: 0 });
  f.actor.items.get("torch").system.stashed = true;
  await f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(4));
  assert.equal(f.actor.items.get("torch").system.quantity, 4);
});

test("equipped quantities are unavailable and stale equipment changes reject edits", async (t) => {
  const f = setup(t);
  assert.equal(
    f.gateway
      .capabilitiesForActor(f.actor)
      .profileEdits.some((edit) => edit.id === "quantity:sword"),
    false,
  );
  const request = f.quantity(2);
  f.actor.items.get("torch").system.equipped = true;
  await assert.rejects(f.run(C.EDIT_PROFILE_RESOURCE, request), {
    code: "CAPABILITY_UNAVAILABLE",
  });
  assert.equal(f.actor.items.get("torch").system.quantity, 1);
});

test("zero removal cancellation and dismissal preserve carried and stashed quantities", async (t) => {
  const f = setup(t),
    torch = f.actor.items.get("torch");
  for (const stashed of [false, true])
    for (const answer of [false, null]) {
      torch.system.stashed = stashed;
      f.confirmRemoval = async () => answer;
      const result = await f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(0));
      assert.equal(result.cancelled, true);
      assert.equal(f.actor.items.get("torch"), torch);
      assert.equal(torch.system.quantity, 1);
    }
  const config = f.confirmations[0];
  assert.equal(config.no.default, true);
  assert.equal(config.yes.label, "Remove");
  assert.match(config.content, /Remove Torch from inventory\?/u);
});

test("removal rechecks quantity, slots, equipment, item identity and ownership after confirmation", async (t) => {
  for (const [change, code] of [
    [
      (f) => {
        f.actor.items.get("torch").system.quantity = 2;
      },
      "STALE_STATE",
    ],
    [
      (f) => {
        f.actor.items.get("torch").system.slots.slots_used = 2;
      },
      "STALE_STATE",
    ],
    [
      (f) => {
        f.actor.items.get("torch").system.equipped = true;
      },
      "CAPABILITY_UNAVAILABLE",
    ],
    [
      (f) => {
        const item = f.actor.items.get("torch");
        f.actor.items.splice(f.actor.items.indexOf(item), 1, { ...item });
      },
      "CAPABILITY_UNAVAILABLE",
    ],
    [
      (f) => {
        f.actor.testUserPermission = () => false;
      },
      "FORBIDDEN",
    ],
  ]) {
    await t.test(code, async (t) => {
      const f = setup(t);
      f.confirmRemoval = async (config) => {
        change(f);
        return config.yes.callback();
      };
      await assert.rejects(f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(0)), {
        code,
      });
      assert.ok(f.actor.items.get("torch"));
    });
  }
});

test("removal escapes item names and refuses to delete without a confirmation dialog", async (t) => {
  const f = setup(t),
    torch = f.actor.items.get("torch");
  torch.name = '<img src=x onerror="bad()">';
  f.confirmRemoval = async () => false;
  await f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(0));
  assert.ok(!f.confirmations[0].content.includes("<img"));
  assert.match(f.confirmations[0].content, /&lt;img/u);
  globalThis.foundry = undefined;
  await assert.rejects(f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(0)), {
    code: "CAPABILITY_UNAVAILABLE",
  });
  assert.equal(f.actor.items.get("torch"), torch);
});
test("quantity edits include stashed gear, enforce safe integers and delete at zero", async t => {
  const f = setup(t), torch = f.actor.items.get("torch");
  torch.system.stashed = true;
  for (const value of [-1, 1.2, "2", Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(value)), { code: "INVALID_INPUT" });
  const request = f.quantity(2); torch.system.quantity = 3;
  await assert.rejects(f.run(C.EDIT_PROFILE_RESOURCE, request), { code: "STALE_STATE" });
  torch.system.isIdentified = false;
  await assert.rejects(f.run(C.EDIT_PROFILE_RESOURCE, request), { code: "CAPABILITY_UNAVAILABLE" });
  torch.system.isIdentified = true;
  await f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(0));
  assert.equal(f.actor.items.get("torch"), undefined);
});

test("zero quantity deletes gear without changing token lights", async t => {
  const f = setup(t), torch = f.actor.items.get("torch");
  torch.system.light.active = true;
  f.actor.sheet._toggleLightSource = () => { throw new Error("Token lights must not be changed"); };
  await f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(0));
  assert.equal(f.actor.items.get("torch"), undefined);
  assert.equal(torch.system.light.active, true);
  assert.deepEqual(f.lights, []);
});

test("native deletion failure preserves the item and releases its command lock", async t => {
  const f = setup(t), torch = f.actor.items.get("torch"), remove = f.actor.deleteEmbeddedDocuments;
  f.actor.deleteEmbeddedDocuments = async () => { throw new Error("delete failure"); };
  await assert.rejects(f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(0)), { code: "COMMAND_FAILED" });
  assert.equal(f.actor.items.get("torch"), torch);
  f.actor.deleteEmbeddedDocuments = remove;
  await f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(0));
  assert.equal(f.actor.items.get("torch"), undefined);
});

test("saving an existing zero stack removes it without changing other stacks", async t => {
  const f = setup(t), torch = f.actor.items.get("torch"), before = f.actor.items.length;
  torch.system.quantity = 0;
  await f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(0));
  assert.equal(f.actor.items.get("torch"), undefined);
  assert.equal(f.actor.items.length, before - 1);
});

test("existing stacks can grow beyond items-per-slot without changing native weight fields", async t => {
  const f = setup(t), torch = f.actor.items.get("torch");
  torch.system.slots = { per_slot: 1, slots_used: 2, free_carry: 0 };
  await f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(2));
  assert.equal(torch.system.quantity, 2);
  assert.deepEqual(torch.system.slots, { per_slot: 1, slots_used: 2, free_carry: 0 });
  torch.system.quantity = 50;
  await f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(49));
  assert.equal(torch.system.quantity, 49);
  await f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(50));
  assert.equal(torch.system.quantity, 50);
  await f.run(C.EDIT_PROFILE_RESOURCE, f.quantity(20));
  assert.equal(torch.system.quantity, 20);
});
test("custom acquisition always creates Basic with native default weight and rejects injected fields", async t => {
  const f = setup(t);
  const initial = f.actor.items.length;
  await f.run(C.ADD_PROFILE_ITEM, { name: "  Rope  " });
  assert.equal(f.actor.items.length, initial + 1);
  assert.equal(f.actor.items.at(-1).name, "Rope"); assert.equal(f.actor.items.at(-1).system.quantity, 1);
  assert.equal(f.actor.items.at(-1).type, "Basic");
  assert.deepEqual(f.actor.items.at(-1).system.slots, { slots_used: 1, per_slot: 1, free_carry: 0 });
  for (const payload of [{ name: "" }, { name: "x", type: "Armor" }, { name: "x", system: {} }, { name: "x", quantity: 5 }]) {
    await assert.rejects(f.run(C.ADD_PROFILE_ITEM, payload), { code: "INVALID_INPUT" });
  }
});

test("custom weight maps whole slots and grouped quantities to native fields, including weightless gear", async t => {
  const f = setup(t);
  for (const [slotsUsed, perQuantity] of [[2, 1], [1, 5], [0, 1]]) {
    await f.run(C.ADD_PROFILE_ITEM, { name: "Weighted gear", slotsUsed, perQuantity });
    const item = f.actor.items.at(-1);
    assert.equal(item.type, "Basic");
    assert.deepEqual(item.system.slots, { slots_used: slotsUsed, per_slot: perQuantity, free_carry: 0 });
    const edit = f.gateway.capabilitiesForActor(f.actor).profileEdits.find(e => e.id === `quantity:${item.id}`);
    await f.run(C.EDIT_PROFILE_RESOURCE, { resourceId: edit.id, resourceRevision: edit.revision, expectedValue: 1, value: perQuantity + 1 });
    assert.equal(item.system.quantity, perQuantity + 1);
    assert.deepEqual(item.system.slots, { slots_used: slotsUsed, per_slot: perQuantity, free_carry: 0 });
  }
});

test("custom weight rejects zero denominators, fractions, unsafe numbers and catalog overrides", async t => {
  const f = setup(t), before = f.actor.items.length;
  for (const slotsUsed of [-1, 0.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(f.run(C.ADD_PROFILE_ITEM, { name: "Invalid", slotsUsed }), { code: "INVALID_INPUT" });
  }
  for (const perQuantity of [-1, 0, 0.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(f.run(C.ADD_PROFILE_ITEM, { name: "Invalid", perQuantity }), { code: "INVALID_INPUT" });
  }
  for (const payload of [{ slotsUsed: 0 }, { perQuantity: 5 }]) {
    await assert.rejects(f.run(C.ADD_PROFILE_ITEM, { itemUuid: "Item.rope", ...payload }), { code: "INVALID_INPUT" });
  }
  assert.equal(f.actor.items.length, before);
});

test("quantity saves reject stale weight configuration", async t => {
  const f = setup(t), request = f.quantity(3);
  f.actor.items.get("torch").system.slots.slots_used = 2;
  await assert.rejects(f.run(C.EDIT_PROFILE_RESOURCE, request), { code: "STALE_STATE" });
});

test("catalog light acquisition preserves native item creation without token-light activation", async t => {
  const f = setup(t);
  const source = { id: "new-torch", uuid: "Item.new-torch", name: "Torch", type: "Basic", system: { isPhysical: true } };
  f.game.items = collection([source]);
  let inherited = 0;
  class BaseSheet {
    async _onDropItem() {
      inherited++;
      return this.actor.createEmbeddedDocuments("Item", [{ name: "Torch", type: "Basic", system: { quantity: 1 } }]);
    }
  }
  class PlayerSheetSD extends BaseSheet {
    constructor() { super(); this.actor = f.actor; }
    _effectDropNotAllowed() { return false; }
    _toggleLightSource() { throw new Error("must not toggle lights"); }
    _dropActivateLightSource() { throw new Error("must not activate lights"); }
    _onDropItemSD() { throw new Error("must await inherited acquisition"); }
  }
  f.actor.sheet = new PlayerSheetSD();
  installGlobals(t, {
    fromUuid: async () => source,
    CONFIG: { SHADOWDARK: { LIGHT_SOURCE_ITEM_IDS: [source.id] } },
    shadowdark: { sheets: { PlayerSheetSD }, effects: {
      createItemWithEffect: async () => ({ name: "Enchanted Torch", type: "Basic", system: { quantity: 1 }, effects: [{ changes: [{ key: "system.light.template", value: "torch" }] }] })
    } }
  });
  const before = f.actor.items.length;
  await f.run(C.ADD_PROFILE_ITEM, { itemUuid: source.uuid });
  assert.equal(inherited, 1);
  assert.equal(f.actor.items.length, before + 1);
  source.effects = { size: 1 };
  await f.run(C.ADD_PROFILE_ITEM, { itemUuid: source.uuid });
  assert.equal(f.actor.items.length, before + 2);
  assert.equal(inherited, 1);
  assert.deepEqual(f.lights, []);
});
test("catalog uses visible world and compendium items; native acquisition cannot copy actor items", async t => {
  const f = setup(t);
  const world = { id: "rope", uuid: "Item.rope", name: "Rope", type: "Basic", system: { isPhysical: true } };
  f.game.items = collection([world, { ...world, uuid: "Item.secret", visible: false }, f.actor.items.get("torch")]);
  const pack = { documentName: "Item", visible: true, title: "Gear", collection: "shadowdark.gear", getIndex: async () => [{ _id: "axe", name: "Axe", type: "Weapon" }] };
  f.game.packs = collection([pack]);
  installGlobals(t, { fromUuid: async () => world });
  const result = await f.run(C.LIST_PROFILE_ITEMS);
  assert.deepEqual(result.items.map(item => item.name), ["Axe", "Rope"]);
  await assert.rejects(f.run(C.ADD_PROFILE_ITEM, { itemUuid: f.actor.items.get("torch").uuid }), { code: "FORBIDDEN" });
  await f.run(C.ADD_PROFILE_ITEM, { itemUuid: world.uuid });
  assert.equal(f.actor.items.at(-1).name, world.uuid, "delegated to native acquisition");
});
test("catalog loading revalidates session and permissions; duplicate creation is locked", async t => {
  const f = setup(t); let resolve;
  f.actor.createEmbeddedDocuments = () => new Promise(r => { resolve = r; });
  const pending = f.run(C.ADD_PROFILE_ITEM, { name: "Rope" });
  await assert.rejects(f.run(C.ADD_PROFILE_ITEM, { name: "Rope" }), { code: "COMMAND_BUSY" });
  resolve([]); await pending;
  f.actor.testUserPermission = () => false;
  await assert.rejects(f.run(C.ADD_PROFILE_ITEM, { name: "Rope" }), { code: "FORBIDDEN" });
});

test("native inherited drop is awaited and rejects permission loss at creation", async t => {
  const f = setup(t); let finish;
  const world = { id: "rope", uuid: "Item.rope", name: "Rope", type: "Basic", system: { isPhysical: true } };
  f.game.items = collection([world]);
  class BaseSheet {
    async _onDropItem() {
      await new Promise(resolve => { finish = resolve; });
      return this.actor.createEmbeddedDocuments("Item", [{ name: "Rope", type: "Basic", system: {} }]);
    }
  }
  class PlayerSheetSD extends BaseSheet {
    constructor() { super(); this.actor = f.actor; }
    _effectDropNotAllowed() { return false; }
    _onDropItemSD() { throw Error("unawaited native branch must not run"); }
  }
  f.actor.sheet = new PlayerSheetSD();
  installGlobals(t, { fromUuid: async () => world, shadowdark: { sheets: { PlayerSheetSD } } });
  const before = f.actor.items.length;
  const pending = f.run(C.ADD_PROFILE_ITEM, { itemUuid: world.uuid });
  while (!finish) await new Promise(resolve => setTimeout(resolve, 0));
  await assert.rejects(f.run(C.ADD_PROFILE_ITEM, { itemUuid: world.uuid }), { code: "COMMAND_BUSY" });
  f.actor.testUserPermission = () => false; finish();
  await assert.rejects(pending, { code: "FORBIDDEN" });
  assert.equal(f.actor.items.length, before); assert.equal(f.hooks.count("preCreateItem"), 0);
});

test("native effect prompts revalidate source changes and clean acquisition guards", async t => {
  const f = setup(t); let finish;
  const world = { id: "rope", uuid: "Item.rope", name: "Rope", type: "Basic", system: { isPhysical: true }, effects: { size: 1 }, _stats: { modifiedTime: 1 } };
  f.game.items = collection([world]);
  class BaseSheet { _onDropItem() {} }
  class PlayerSheetSD extends BaseSheet {
    constructor() { super(); this.actor = f.actor; }
    _effectDropNotAllowed() { return false; }
    _onDropItemSD() {}
  }
  f.actor.sheet = new PlayerSheetSD();
  installGlobals(t, { fromUuid: async () => world, shadowdark: { sheets: { PlayerSheetSD }, effects: {
    createItemWithEffect: () => new Promise(resolve => { finish = resolve; })
  } } });
  const before = f.actor.items.length;
  const pending = f.run(C.ADD_PROFILE_ITEM, { itemUuid: world.uuid });
  while (!finish) await new Promise(resolve => setTimeout(resolve, 0));
  world._stats.modifiedTime = 2;
  finish({ name: "Changed Rope", type: "Basic", system: {} });
  await assert.rejects(pending, { code: "STALE_STATE" });
  assert.equal(f.actor.items.length, before); assert.equal(f.hooks.count("preCreateItem"), 0);
});
