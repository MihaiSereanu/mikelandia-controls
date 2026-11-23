import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/commands/command-gateway.mjs";
import { warhammerIntegration } from "../src/systems/wfrp4e/integration.mjs";
import { WARHAMMER_CATALOGUE } from "../src/systems/wfrp4e/inventory.mjs";
import { warhammerSpellDetails } from "../src/systems/wfrp4e/magic.mjs";
import { installGlobals } from "./helpers/foundry.mjs";
import { createWarhammerActor, createWarhammerGame, addWarhammerMagic } from "./helpers/warhammer.mjs";

function setup(t, use5e) {
  const actor = createWarhammerActor(), game = createWarhammerGame([actor], { use5e }), writes = [];
  actor.createEmbeddedDocuments = async (type, data) => { writes.push([type, data]); return data; };
  const pack = { documentName: "Item", visible: true, title: "Consumer's Guide", getIndex: async () => [
    { _id: "rope", name: "Rope", type: "trapping" }, { _id: "secret", name: "Secret", type: "spell" }
  ], getDocument: async id => ({ id, type: "trapping", toObject: () => ({ _id: id, name: "Rope", type: "trapping", system: { quantity: { value: 1 } } }) }) };
  game.packs = new Map([[WARHAMMER_CATALOGUE, pack]]);
  installGlobals(t, { game });
  const gateway = createFoundryCommandGateway();
  const execute = (name, data = {}) => gateway.execute(name, { actorSourceUuid: actor.uuid, ...data });
  return { actor, game, pack, writes, gateway, execute };
}

for (const use5e of [true]) {
  test(`5e money editing preserves zero, rejects stale values and keeps other denominations`, async t => {
    const { actor, gateway, execute, game } = setup(t, use5e);
    const coin = { id: "coin", name: "GC", type: "money", parent: actor, system: { quantity: { value: 4 } },
      update: async data => { assert.deepEqual(data, { "system.quantity.value": 0 }); return coin; } };
    actor.items.push(coin);
    const edit = gateway.capabilitiesForActor(actor).profileEdits.find(edit => edit.id === "quantity:coin");
    const payload = { resourceId: edit.id, resourceRevision: edit.revision, expectedValue: 4, value: 0 };
    const view = warhammerIntegration.createActorViewRecord(actor, game.user, gateway.capabilitiesForActor);
    assert.equal(view.panels.find(tab => tab.id === "trappings").sections.find(section => section.id === "money").rows[0].edit.id, edit.id);
    await execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, payload);
    assert.ok(actor.items.includes(coin));
    await assert.rejects(execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, { ...payload, value: -1 }), { code: "INVALID_INPUT" });
    coin.system.quantity.value = 5;
    await assert.rejects(execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, payload), { code: "STALE_STATE" });
  });
  test(`5e catalogue is scoped, copies without source ID, and rechecks access after loading`, async t => {
    const { execute, pack, writes } = setup(t, use5e);
    const result = await execute(ACTOR_COMMANDS.LIST_PROFILE_ITEMS);
    assert.equal(result.items.length, 1);
    await execute(ACTOR_COMMANDS.ADD_PROFILE_ITEM, { itemUuid: result.items[0].uuid });
    assert.equal(writes[0][1][0]._id, undefined);
    await assert.rejects(execute(ACTOR_COMMANDS.ADD_PROFILE_ITEM, { itemUuid: "Compendium.other.pack.rope" }), { code: "INVALID_INPUT" });
    pack.getIndex = async () => { pack.visible = false; return []; };
    await assert.rejects(execute(ACTOR_COMMANDS.LIST_PROFILE_ITEMS), { code: "FORBIDDEN" });
    assert.equal(writes.length, 1);
  });
  test(`5e custom trapping saves native fields and rejects invalid input`, async t => {
    const { actor, execute, writes } = setup(t, use5e);
    const data = { name: " Lantern ", quantity: 2, encumbrance: 0.5, price: { gc: 0, ss: 3, bp: 6 }, description: "<p>A lantern.</p>" };
    await execute(ACTOR_COMMANDS.ADD_PROFILE_ITEM, data);
    assert.deepEqual(writes[0], ["Item", [{ name: "Lantern", type: "trapping", system: {
      trappingType: { value: "misc" }, quantity: { value: 2 }, encumbrance: { value: 0.5 }, price: data.price, description: { value: data.description }
    } }]]);
    for (const change of [{ quantity: 1.5 }, { encumbrance: -1 }, { price: { gc: 0 } }, { name: " " }, { effects: [] }]) {
      await assert.rejects(execute(ACTOR_COMMANDS.ADD_PROFILE_ITEM, { ...data, ...change }), { code: "INVALID_INPUT" });
    }
    actor.testUserPermission = () => false;
    await assert.rejects(execute(ACTOR_COMMANDS.ADD_PROFILE_ITEM, data));
    assert.equal(writes.length, 1);
  });
  test(`5e missing catalogue and access revoked during document loading never create items`, async t => {
    const { execute, pack, game, writes } = setup(t, use5e);
    game.packs.clear();
    await assert.rejects(execute(ACTOR_COMMANDS.LIST_PROFILE_ITEMS), { code: "CAPABILITY_UNAVAILABLE" });
    game.packs.set(WARHAMMER_CATALOGUE, pack);
    const getDocument = pack.getDocument;
    pack.getDocument = async id => { const item = await getDocument(id); pack.visible = false; return item; };
    await assert.rejects(execute(ACTOR_COMMANDS.ADD_PROFILE_ITEM, { itemUuid: `Compendium.${WARHAMMER_CATALOGUE}.rope` }), { code: "FORBIDDEN" });
    assert.deepEqual(writes, []);
  });
  test(`5e spells project native prepared details`, t => {
    const { actor, game, gateway } = setup(t, use5e);
    addWarhammerMagic(actor, use5e);
    const spell = actor.items.find(item => item.id === "petty");
    Object.assign(spell.system, { Range: "35 yards", Target: "1", Duration: "Instant", magicMissile: { value: true }, Damage: 3 });
    const details = ["Range: 35 yards", "Target: 1", "Duration: Instant", "Magic Missile: +3"];
    assert.deepEqual(warhammerSpellDetails(spell), details);
    const view = warhammerIntegration.createActorViewRecord(actor, game.user, gateway.capabilitiesForActor);
    assert.deepEqual(view.panels.find(tab => tab.id === "magic").sections.find(section => section.id === "petty-spells").rows[0].details, details);
    spell.system.magicMissile.value = false;
    spell.system.damage = { value: "3", dice: "1d10" };
    assert.equal(warhammerSpellDetails(spell).at(-1), "Damage: 3 + 1d10");
  });
}
