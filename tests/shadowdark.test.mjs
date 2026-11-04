import test from "node:test";
import assert from "node:assert/strict";
import { createFoundryCommandGateway, ACTOR_COMMANDS } from "../src/foundry/commands/command-gateway.mjs";
import { resolveSystemIntegration } from "../src/systems/registry.mjs";
import { installGlobals, collection } from "./helpers/foundry.mjs";
import { createShadowdarkFixture } from "./helpers/shadowdark.mjs";
import { addItemSpells } from "./helpers/shadowdark-item-spells.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";
import { createFoundrySessionGateway } from "../src/foundry/session/session-gateway.mjs";

const action = ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, edit = ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE;

test("Bio resolves native names in order, hides empty fields and stays out of Group", t => {
  const f = setup(t);
  const links = new Map([
    ["Item.elvish", { type: "Language", name: "Elvish" }],
    ["Item.common", { type: "Language", name: "Common" }],
    ["Item.deity", { type: "Deity", name: "Gede" }],
    ["Item.background", { type: "Background", name: "Sailor" }],
    ["Item.hidden", { type: "Language", name: "Secret", visible: false }]
  ]);
  installGlobals(t, { fromUuidSync: uuid => links.get(uuid) });
  assert.equal(f.view().notesTabLabel, "Bio");
  assert.deepEqual(f.view().notesSections, []);
  Object.assign(f.actor.system, { languages: ["Item.elvish", "Item.hidden", "Item.common", "Item.missing"], deity: "Item.deity", background: "Item.background" });
  const view = f.view();
  assert.deepEqual(view.notesSections.map(({ label, text }) => [label, text]), [["Languages", "Common, Elvish"], ["Deity", "Gede"], ["Background", "Sailor"]]);
  f.actor.system.deity = "";
  assert.notEqual(f.view().notesRevision, view.notesRevision);
  assert.deepEqual(f.view().notesSections.map(section => section.id), ["languages", "background"]);
  f.actor.name = "Group";
  assert.equal(f.view().notesTabLabel, "Notes");
  assert.deepEqual(f.view().notesSections, []);
});

test("uncached Bio links refresh after loading, update names and ignore disposed watchers", async t => {
  const f = setup(t);
  let finish, reads = 0, deity = { uuid: "Compendium.test.deities.Item.gede", type: "Deity", name: "Gede" };
  f.actor.system.deity = deity.uuid;
  installGlobals(t, { fromUuidSync: () => null, fromUuid: async () => {
    reads++;
    await new Promise(resolve => { finish = resolve; });
    return deity;
  } });
  const scope = createTaskScope("bio-cache");
  t.after(() => scope.dispose());
  const session = createFoundrySessionGateway({ capabilitiesForActor: f.gateway.capabilitiesForActor });
  let published, error;
  session.watch(scope, value => { published = value; }, value => { error = value; });
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  await tick();
  f.view();
  assert.equal(reads, 1);
  finish(); await tick();
  assert.equal(error, undefined);
  assert.equal(published.selectedActor.notesSections[0].text, "Gede");
  deity = { ...deity, name: "Gede Renamed" };
  f.hooks.emit("updateItem", deity, { name: deity.name }); await tick();
  assert.equal(reads, 2);
  finish(); await tick();
  assert.equal(published.selectedActor.notesSections[0].text, "Gede Renamed");
  f.hooks.emit("updateItem", deity, {}); await tick();
  const previous = published;
  scope.dispose(); finish(); await tick();
  assert.equal(published, previous);
});

test("Group PCs use an inventory-only profile with native Notes and all carried gear", t => {
  const f = setup(t);
  f.actor.system.notes = "Party supplies";
  f.actor.system.getSlotUsage = () => ({ total: 4, coins: 0 });
  for (const name of ["Group", "GROUP", " group "]) {
    f.actor.name = name;
    const view = f.view();
    assert.deepEqual(view.panels.map(tab => tab.id), ["inventory"]);
    assert.equal(view.notesAvailable, true);
    assert.equal(view.notesRevision, "Party supplies");
    assert.equal(view.profileInventory, true);
    const sections = view.panels[0].sections;
    assert.equal(sections.some(section => section.id === "equipped-gear"), false);
    const gear = sections.find(section => section.id === "gear");
    assert.equal(gear.label, "Gear");
    for (const id of ["sword", "torch"]) {
      const row = gear.rows.find(row => row.id === id);
      assert.ok(row.edit);
      assert.equal(row.equipment, undefined);
    }
    assert.equal(sections[0].id, "slots");
    assert.equal(sections[0].rows[0].id, "slots");
    assert.equal(gear.summary.length, 0);
    assert.ok(sections.find(section => section.id === "coins"));
    assert.equal(f.gateway.capabilitiesForActor(f.actor).profileActions, undefined);
    assert.equal(JSON.stringify(view).includes("Secret Relic"), false);
  }
  f.actor.name = "Group Scout";
  assert.equal(f.view().panels[0].id, "abilities");
  f.actor.name = "Group";
  f.actor.type = "NPC";
  assert.notEqual(f.view().presentation, "profile");
});

test("custom resources default to zero, persist per actor flag, and preserve native fields", async t => {
  const f = setup(t), native = JSON.stringify(f.actor.system);
  const sections = f.view().panels[0].sections;
  assert.deepEqual(sections.slice(0, 6).map(s => s.id), ["hp", "ac", "def", "xp", "grit", "luck"]);
  for (const id of ["def", "grit"]) {
    assert.equal(sections.find(s => s.id === id).rows[0].value, 0);
    await f.gateway.execute(edit, f.edit(id, 3));
    assert.equal(f.actor.flags["mikelandia-controls"].shadowdarkResources[id], 3);
    for (const value of [-1, 1.5, "2"]) await assert.rejects(f.gateway.execute(edit, f.edit(id, value)), { code: "INVALID_INPUT" });
    assert.equal(f.view().panels[0].sections.find(s => s.id === id).rows[0].value, 3);
  }
  assert.equal(JSON.stringify(f.actor.system), native);
  assert.equal(createShadowdarkFixture().actor.flags, undefined);
  const stale = f.edit("grit", 4);
  await f.gateway.execute(edit, f.edit("grit", 5));
  await assert.rejects(f.gateway.execute(edit, stale), { code: "STALE_STATE" });
});

test("XP edits use the native field and reject stale or invalid values without migrating Renown", async t => {
  const f = setup(t);
  f.actor.flags = { "mikelandia-controls": { shadowdarkResources: { renown: 17 } } };
  assert.equal(f.view().panels[0].sections.find(s => s.id === "xp").rows[0].value, 8);
  await assert.rejects(f.gateway.execute(edit, f.edit("renown", 3)), { code: "CAPABILITY_UNAVAILABLE" });
  for (const value of [-1, 1.5, "2", Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(f.gateway.execute(edit, f.edit("xp", value)), { code: "INVALID_INPUT" });
  }
  const stale = f.edit("xp", 12);
  f.actor.system.level.xp = 9;
  await assert.rejects(f.gateway.execute(edit, stale), { code: "STALE_STATE" });
  await f.gateway.execute(edit, f.edit("xp", 0));
  assert.equal(f.actor.system.level.xp, 0);
  assert.deepEqual(f.writes.at(-1)[0], { "system.level.xp": 0 });
  assert.equal(f.actor.flags["mikelandia-controls"].shadowdarkResources.renown, 17);
});

test("the native Shadowdark roll application is recognized across V1 sheet workflows", t => {
  const f = setup(t);
  class RollDialogSD {}
  installGlobals(t, { shadowdark: { apps: { RollDialogSD } } });
  const integration = resolveSystemIntegration("shadowdark");
  assert.equal(integration.isNativeDialog(new RollDialogSD()), true);
  assert.equal(integration.isNativeDialog({ id: "sd-roll-dialog" }), true);
  assert.equal(integration.isNativeDialog({ options: { id: "sd-roll-dialog" } }), true);
  assert.equal(integration.isNativeDialog({ id: "unrelated-dialog" }), false);
});

test("coin edits use native denominations, enforce integer limits and reject stale or injected saves", async t => {
  const f = setup(t), before = f.actor.items.length;
  for (const denomination of ["gp", "sp", "cp"]) {
    const id = `coin-${denomination}`;
    await f.gateway.execute(edit, f.edit(id, 1));
    assert.equal(f.actor.system.coins[denomination], 1);
    for (const value of [-1, 0.5, "2", Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(f.gateway.execute(edit, f.edit(id, value)), { code: "INVALID_INPUT" });
    }
    const stale = f.edit(id, 3);
    f.actor.system.coins[denomination] = 2;
    await assert.rejects(f.gateway.execute(edit, stale), { code: "STALE_STATE" });
    await assert.rejects(f.gateway.execute(edit, { ...f.edit(id, 3), path: "system.coins.gp" }), { code: "INVALID_INPUT" });
    await f.gateway.execute(edit, f.edit(id, 0));
    assert.equal(f.actor.system.coins[denomination], 0);
    assert.deepEqual(f.writes.at(-1)[0], { [`system.coins.${denomination}`]: 0 });
  }
  assert.equal(f.actor.items.length, before);
});

test("an empty inventory retains the Gear section for adding new items", t => {
  const f = setup(t);
  f.actor.items = collection([]);
  const inventory = f.view().panels.find(tab => tab.id === "inventory");
  assert.deepEqual(inventory.sections.find(section => section.id === "gear").rows, []);
});

function setup(t, options) {
  const f = createShadowdarkFixture(options);
  installGlobals(t, { game: f.game, Hooks: f.hooks });
  f.gateway = createFoundryCommandGateway();
  f.request = id => ({ actorSourceUuid: f.actor.uuid, actionId: id, actionRevision: f.gateway.capabilitiesForActor(f.actor).profileActions.find(a => a.id === id)?.revision });
  f.edit = (id, value) => {
    const e = f.gateway.capabilitiesForActor(f.actor).profileEdits.find(e => e.id === id);
    return { actorSourceUuid: f.actor.uuid, resourceId: id, resourceRevision: e?.revision, expectedValue: e?.value, value };
  };
  f.view = () => resolveSystemIntegration("shadowdark").createActorViewRecord(f.actor, f.game.user, f.gateway.capabilitiesForActor);
  return f;
}

test("only a completed Shadowdark roll reports rolled, including an unsuccessful check", async t => {
  const f = setup(t);
  f.prompt = async () => false;
  assert.equal((await f.gateway.execute(action, f.request("stat:str"))).rolled, false);
  f.prompt = async () => true;
  f.success = false;
  assert.equal((await f.gateway.execute(action, f.request("stat:str"))).rolled, true);
  assert.equal(f.hooks.count("createChatMessage"), 0);
  f.error = true;
  await assert.rejects(f.gateway.execute(action, f.request("stat:str")));
  assert.equal(f.hooks.count("createChatMessage"), 0);
});

test("submitted Shadowdark dialogs and unrelated chat do not establish a completed roll", async t => {
  const f = setup(t);
  f.actor.system.rollStatCheck = async (stat, config) => {
    Object.assign(config, { actorUuid: f.actor.uuid, check: { stat } });
    f.hooks.call("SD-Stat-Check", config);
    const emit = (rollConfig, user = f.game.user, rolls = [{ total: 1 }]) => f.hooks.emit("createChatMessage", {
      user, flags: { shadowdark: { rollConfig } }, rolls
    }, {}, user.id);
    emit({ ...config, actorUuid: "Actor.other" });
    emit({ ...config, check: { stat: "dex" } });
    emit(config, { id: "other" });
    emit(config, f.game.user, []);
    return false;
  };
  const result = await f.gateway.execute(action, f.request("stat:str"));
  assert.equal(result.cancelled, false);
  assert.equal(result.rolled, false);
  assert.equal(f.hooks.count("createChatMessage"), 0);
});

function addSpell(f, id, name, tier = 1, lost = false) {
  const item = { id, name, type: "Spell", parent: f.actor, uuid: `${f.actor.uuid}.Item.${id}`,
    system: { isSpell: true, tier, lost, description: `<p>${name}</p>` } };
  f.actor.items.push(item);
  return item;
}
const spellRows = f => f.view().panels.find(tab => tab.id === "spells").sections.flatMap(section => section.rows);

test("item spells match native eligibility and distinguish their sources", t => {
  const f = setup(t), magic = addItemSpells(f);
  installGlobals(t, { fromUuidSync: magic.resolve });
  const category = () => f.view().panels.find(tab => tab.id === "spells")?.sections.find(section => section.id === "item-spells");
  assert.deepEqual(category().sections.map(section => section.label), ["Wands", "Scrolls"]);
  const [wands, scrolls] = category().sections;
  assert.ok(wands.collapsible && wands.defaultOpen);
  assert.deepEqual(wands.rows.map(row => row.label), ["Light", "Sleep"]);
  assert.equal(wands.rows[0].sourceLabel, "Ivory Wand");
  assert.equal(wands.rows[1].lost, true);
  assert.equal(wands.rows[1].action, undefined);
  assert.equal(scrolls.rows[0].descriptionUuid, magic.spells[0].uuid);
  f.actor.system.canUseMagicItems = false;
  assert.equal(category().sections[0].rows[0].action, undefined);
  f.actor.system.isSpellCaster = false;
  f.actor.system.canUseMagicItems = true;
  assert.ok(category().sections[0].rows[0].action);
  magic.wand.system.broken = true;
  assert.deepEqual(category().sections.map(section => section.id), ["scrolls"]);
  magic.scroll.system.stashed = true;
  assert.equal(category(), undefined);
  magic.scroll.system.stashed = false;
  magic.scroll.system.isIdentified = false;
  assert.equal(category(), undefined);
  magic.scroll.system.isIdentified = true;
  magic.spells[0].visible = false;
  assert.equal(category(), undefined);
});

test("item casting preserves source UUID, native cancellation, loss and scroll consumption", async t => {
  const f = setup(t), magic = addItemSpells(f);
  installGlobals(t, { fromUuidSync: magic.resolve });
  f.prompt = async () => false;
  assert.equal((await f.gateway.execute(action, f.request("item-spell:scroll-0"))).cancelled, true);
  assert.ok(f.actor.items.get("scroll"));
  f.prompt = async () => true;
  await f.gateway.execute(action, f.request("item-spell:scroll-0"));
  assert.equal(f.calls.at(-1).target, magic.spells[0].uuid);
  assert.equal(f.calls.at(-1).config.itemUuid, magic.scroll.uuid);
  assert.equal(f.actor.items.get("scroll"), undefined);
  f.success = false;
  await f.gateway.execute(action, f.request("item-spell:wand-1"));
  assert.equal(magic.wand.system.spells[1].lost, true);
  assert.equal(magic.spells[0].system.lost, false);
  assert.equal(f.hooks.count("SD-Player-Spell"), 0);
  assert.equal(f.rolls.length, 2);
});

test("manual known-spell loss and recovery updates the owned item without rolling", async t => {
  const f = setup(t), spell = f.actor.items.get("spell");
  const stale = f.request("spell-loss:spell");
  await f.gateway.execute(action, stale);
  assert.equal(spell.system.lost, true);
  assert.equal(spellRows(f).find(row => row.id === "spell").action, undefined);
  await assert.rejects(f.gateway.execute(action, stale), { code: "STALE_STATE" });
  await f.gateway.execute(action, f.request("spell-loss:spell"));
  assert.equal(spell.system.lost, false);
  assert.equal(f.calls.length, 0);
  assert.equal(f.rolls.length, 0);
  assert.deepEqual(f.writes, []);
});

test("manual wand loss stays on its spell reference and cannot repair a broken wand", async t => {
  const f = setup(t), magic = addItemSpells(f);
  installGlobals(t, { fromUuidSync: magic.resolve });
  await f.gateway.execute(action, f.request("wand-loss:wand-1"));
  assert.equal(magic.wand.system.spells[1].lost, true);
  assert.equal(magic.spells[0].system.lost, false);
  await f.gateway.execute(action, f.request("wand-loss:wand-1"));
  assert.equal(magic.wand.system.spells[1].lost, false);
  const pending = f.request("wand-loss:wand-1");
  magic.wand.system.broken = true;
  await assert.rejects(f.gateway.execute(action, pending), { code: "CAPABILITY_UNAVAILABLE" });
  assert.equal(magic.wand.system.broken, true);
  assert.equal(f.gateway.capabilitiesForActor(f.actor).profileActions.some(action => action.id.startsWith("spell-loss:scroll")), false);
  assert.equal(f.calls.length, 0);
  assert.equal(f.rolls.length, 0);
});

for (const change of ["stashed", "broken", "lost", "link", "permission", "identity", "spellIdentity"]) {
  test(`item casting rejects ${change} changes during its native dialog`, async t => {
    const f = setup(t), magic = addItemSpells(f);
    installGlobals(t, { fromUuidSync: magic.resolve });
    f.prompt = async () => {
      if (change === "stashed") magic.wand.system.stashed = true;
      if (change === "broken") magic.wand.system.broken = true;
      if (change === "lost") magic.wand.system.spells[1].lost = true;
      if (change === "link") magic.wand.system.spells[1].uuid = magic.spells[1].uuid;
      if (change === "permission") f.actor.system.canUseMagicItems = false;
      if (change === "identity") f.actor.items.splice(f.actor.items.indexOf(magic.wand), 1, { ...magic.wand });
      if (change === "spellIdentity") magic.spells[0] = { ...magic.spells[0] };
      return true;
    };
    await assert.rejects(f.gateway.execute(action, f.request("item-spell:wand-1")), { code: "CAPABILITY_UNAVAILABLE" });
    assert.equal(f.rolls.length, 0);
    assert.equal(f.hooks.count("SD-Player-Spell"), 0);
  });
}

test("uncached compendium item spells asynchronously refresh the selected profile and dispose cleanly", async t => {
  const f = setup(t), magic = addItemSpells(f);
  let finish, reads = 0;
  installGlobals(t, { fromUuidSync: () => null, fromUuid: async uuid => {
    reads++;
    await new Promise(resolve => { finish = resolve; });
    return magic.resolve(uuid);
  } });
  // Use one linked UUID so the pending load has a single completion checkpoint.
  magic.wand.system.spells = [{ uuid: magic.spells[0].uuid, lost: false }];
  const scope = createTaskScope("item-spell-cache");
  t.after(() => scope.dispose());
  const session = createFoundrySessionGateway({ capabilitiesForActor: f.gateway.capabilitiesForActor });
  let published, error;
  session.watch(scope, value => { published = value; }, value => { error = value; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(reads, 1);
  finish();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(error, undefined);
  assert.ok(published.selectedActor.panels.find(tab => tab.id === "spells").sections.some(section => section.id === "item-spells"));
  magic.wand.system.spells = [{ uuid: magic.spells[1].uuid, lost: false }];
  magic.scroll.system.spellUuid = magic.spells[1].uuid;
  f.hooks.emit("updateItem", magic.wand, {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(reads, 2);
  const previous = published;
  scope.dispose();
  finish();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(published, previous);
});

test("known and lost spells share alphabetical ascending tiers", t => {
  const f = setup(t);
  const z = addSpell(f, "z", "Zebra");
  addSpell(f, "a", "Aardvark", 3);
  addSpell(f, "c", "Cloud", 2);
  addSpell(f, "light", "Light");
  addSpell(f, "losthigh", "A Lost High Tier", 3, true);
  addSpell(f, "lostlow", "Lost Low Tier", 1, true);
  // Previously saved manual ranks must have no effect on alphabetical ordering.
  f.actor.flags = { "mikelandia-controls": { shadowdarkSpellOrder: ["z", "spell", "light", "lost", "lostlow"] } };
  const sections = () => f.view().panels.find(tab => tab.id === "spells").sections;
  assert.deepEqual(sections()[0].rows.map(row => row.id), ["light", "lostlow", "spell", "lost", "z", "c", "losthigh", "a"]);
  assert.equal(sections().length, 1);
  assert.equal(sections()[0].collapsibleTiers, true);
  assert.ok(sections().every(section => section.groupByValue === true));
  assert.equal(spellRows(f).some(row => row.reorder), false);
  assert.equal(f.gateway.capabilitiesForActor(f.actor).profileActions.some(action => action.id.startsWith("spell-order-")), false);
  z.name = "AAA renamed";
  assert.equal(sections()[0].rows[0].id, "z");
  z.system.lost = true;
  assert.equal(sections()[0].rows[0].id, "z");
  assert.equal(sections()[0].rows[0].lost, true);
  assert.equal(sections()[0].rows[0].showCastButton, true);
  z.system.lost = false;
  z.system.tier = 4;
  assert.equal(sections()[0].rows.at(-1).id, "z");
  assert.deepEqual(f.writes, []);
});
for (const pulp of [false, true]) {
  test(`${pulp ? "Pulp" : "normal"} PC panels retain Shadowdark labels, prepared Stats, Luck, inventory and spells`, t => {
    const f = setup(t, { pulp });
    const view = f.view(), rows = view.panels.flatMap(t => t.sections.flatMap(s => s.rows));
    assert.deepEqual(view.panels.map(t => t.label), ["Main", "Spells", "Inventory"]);
    assert.equal(rows.find(r => r.id === "str").value, "14 (+2)");
    assert.equal(rows.find(r => r.id === "hp").max, 12);
    assert.equal(rows.find(r => r.id === "luck").value, pulp ? 2 : true);
    assert.equal(rows.find(r => r.id === "luck").edit.kind, pulp ? "integer" : "boolean");
    assert.equal(rows.find(r => r.id === "ac").edit, undefined);
    assert.equal(rows.find(r => r.id === "spell").valueLabel, "Tier");
    assert.equal(rows.find(r => r.id === "lost").action, undefined);
    assert.equal(rows.find(r => r.id === "torch").secondaryAction, undefined);
    assert.equal(JSON.stringify(view).includes("Secret Relic"), false);
  });
}
for (const id of ["stat:str", "attack-melee:sword", "attack-ranged:dagger", "spell:spell"]) {
  test(`${id} uses the native PC model once and cleans its scoped hook`, async t => {
    const f = setup(t);
    const result = await f.gateway.execute(action, f.request(id));
    assert.equal(result.ok, true); assert.equal(result.cancelled, false);
    assert.equal(f.rolls.length, 1); assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].target, id.startsWith("stat") ? "str" : f.actor.items.find(i => i.id === id.split(":")[1]).uuid);
    if (id.startsWith("attack")) assert.equal(f.calls[0].config.attack.type, id.startsWith("attack-ranged") ? "ranged" : "melee");
    assert.equal(f.hooks.count("SD-Stat-Check") + f.hooks.count("SD-Player-Attack") + f.hooks.count("SD-Player-Spell"), 0);
    assert.deepEqual(f.writes, []);
  });
}
test("failed native spell rolls keep native spell-loss behavior without a second roll", async t => {
  const f = setup(t); f.success = false;
  const result = await f.gateway.execute(action, f.request("spell:spell"));
  assert.equal(result.cancelled, false);
  assert.equal(f.actor.items.find(i => i.id === "spell").system.lost, true);
  assert.equal(f.rolls.length, 1);
  assert.equal(f.gateway.capabilitiesForActor(f.actor).profileActions.some(a => a.id === "spell:spell"), false);
});

test("Main shows owned Special Abilities and native remaining uses only when present", t => {
  const f = setup(t, { specialAbilities: true });
  const section = () => f.view().panels[0].sections.find(s => s.id === "special-abilities");
  const row = section().rows[0];
  assert.equal(row.id, "ability");
  assert.match(row.value, /2 \/ 3/u);
  assert.equal(row.descriptionToggle, "name");
  assert.match(row.description, /ability text/u);
  assert.equal(row.action.id, "ability:ability");
  f.actor.items.get("ability").visible = false;
  assert.equal(section(), undefined);
});

test("Special Ability use delegates once and preserves native consumption and loss", async t => {
  const f = setup(t, { specialAbilities: true });
  f.success = false;
  const result = await f.gateway.execute(action, f.request("ability:ability"));
  assert.equal(result.cancelled, false);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].receiver, f.actor.system);
  assert.equal(f.calls[0].target, f.actor.items.get("ability").uuid);
  assert.equal(f.rolls.length, 1);
  assert.equal(f.actor.items.get("ability").system.uses.available, 1);
  assert.equal(f.actor.items.get("ability").system.lost, true);
  assert.equal(f.gateway.capabilitiesForActor(f.actor).profileActions.some(a => a.id === "ability:ability"), false);
  assert.equal(f.hooks.count("SD-Player-classAbility"), 0);
});

test("exhausted Special Abilities remain readable without an action", t => {
  const f = setup(t, { specialAbilities: true });
  f.actor.items.get("ability").system.uses.available = 0;
  const row = f.view().panels[0].sections.find(s => s.id === "special-abilities").rows[0];
  assert.match(row.value, /0 \/ 3/u);
  assert.equal(row.action, undefined);
});

for (const change of ["uses", "lost", "dc", "permission", "identity"]) {
  test(`Special Ability dialog rejects changed ${change} before consumption`, async t => {
    const f = setup(t, { specialAbilities: true });
    const ability = f.actor.items.get("ability");
    let finish;
    f.prompt = () => new Promise(resolve => { finish = resolve; });
    const pending = f.gateway.execute(action, f.request("ability:ability"));
    if (change === "uses") ability.system.uses.available = 1;
    if (change === "lost") ability.system.lost = true;
    if (change === "dc") ability.system.dc = 15;
    if (change === "permission") f.actor.testUserPermission = () => false;
    if (change === "identity") f.actor.items.splice(f.actor.items.indexOf(ability), 1, { ...ability });
    const available = ability.system.uses.available;
    finish(true);
    await assert.rejects(pending);
    assert.equal(ability.system.uses.available, available);
    assert.equal(f.rolls.length, 0);
    assert.equal(f.hooks.count("SD-Player-classAbility"), 0);
  });
}

test("Special Ability cancellation releases the native roll lock without consuming uses", async t => {
  const f = setup(t, { specialAbilities: true });
  f.prompt = async () => false;
  assert.equal((await f.gateway.execute(action, f.request("ability:ability"))).cancelled, true);
  assert.equal(f.actor.items.get("ability").system.uses.available, 2);
  assert.equal(f.hooks.count("SD-Player-classAbility"), 0);
  f.prompt = async () => true;
  assert.equal((await f.gateway.execute(action, f.request("ability:ability"))).ok, true);
});
test("native cancellation and errors clean hooks and release command locks", async t => {
  const f = setup(t); const request = f.request("stat:str");
  f.prompt = async () => false;
  assert.equal((await f.gateway.execute(action, request)).cancelled, true);
  assert.equal(f.rolls.length, 0);
  f.prompt = async () => true; f.error = true;
  await assert.rejects(f.gateway.execute(action, request), { code: "COMMAND_FAILED" });
  assert.equal(f.hooks.count("SD-Stat-Check"), 0);
  f.error = false;
  assert.equal((await f.gateway.execute(action, request)).ok, true);
});
for (const change of ["permission", "actor", "model", "item", "visibility", "item-owner", "equipped", "handedness", "mode", "settings", "selection", "connection", "world", "config-target", "class"]) {
  test(`native post-dialog checkpoint rejects changed ${change}`, async t => {
    const f = setup(t); const request = f.request("attack-melee:sword");
    const weapon = f.actor.items.get("sword"); let finish, generation = 0, active = true;
    f.prompt = () => new Promise(resolve => { finish = resolve; });
    const gateway = createFoundryCommandGateway({ getConnectionGeneration: () => generation });
    const pending = gateway.execute(action, request, { isCurrent: () => active });
    if (change === "permission") f.actor.testUserPermission = () => false;
    if (change === "actor") f.game.actors = collection([{ ...f.actor }]);
    if (change === "model") f.actor.system = { ...f.actor.system };
    if (change === "item") f.actor.items.splice(f.actor.items.indexOf(weapon), 1, { ...weapon });
    if (change === "visibility") weapon.visible = false;
    if (change === "item-owner") weapon.isOwner = false;
    if (change === "equipped") weapon.system.equipped = false;
    if (change === "handedness") weapon.system.handedness = "2h";
    if (change === "mode") weapon.system.type = "ranged";
    if (change === "settings") f.settings.usePulpMode = true;
    if (change === "selection") active = false;
    if (change === "connection") generation++;
    if (change === "world") f.game.world.id = "other";
    if (change === "config-target") f.calls[0].config.itemUuid = "Actor.other.Item.sword";
    if (change === "class") f.actor.system.class = "Item.otherClass";
    finish(true);
    await assert.rejects(pending);
    assert.equal(f.rolls.length, 0);
    assert.equal(f.hooks.count("SD-Player-Attack"), 0);
  });
}
test("the scoped hook leaves other native dialogs untouched and blocks duplicate mobile requests", async t => {
  const f = setup(t); const request = f.request("stat:str"); let finish;
  f.prompt = () => new Promise(resolve => { finish = resolve; });
  const pending = f.gateway.execute(action, request);
  assert.equal(f.hooks.call("SD-Stat-Check", { actorUuid: "Actor.other" }), true);
  await assert.rejects(f.gateway.execute(action, request), { code: "COMMAND_BUSY" });
  finish(true); await pending;
});
test("hidden, foreign, stashed and unidentified items are filtered before their names", t => {
  const f = setup(t);
  for (const extra of [{ visible: false }, { isOwner: false }, { parent: {} }, { system: { isPhysical: true, isIdentified: false } }, { system: { isPhysical: true, isIdentified: true, stashed: true } }]) {
    const item = { ...f.actor.items.get("sword"), id: `hidden${f.actor.items.length}`, ...extra };
    item.uuid = `${f.actor.uuid}.Item.${item.id}`;
    Object.defineProperty(item, "name", { get() { throw new Error("forbidden name read"); } });
    f.actor.items.push(item);
  }
  assert.equal(f.view().panels[0].sections.find(s => s.id === "melee-attacks").rows.length, 2);
});
test("NPCs, other types, unknown settings and missing data keep native access", t => {
  const f = setup(t);
  for (const type of ["NPC", "Light", "character", "vehicle"]) {
    f.actor.type = type;
    assert.equal(f.view().presentation, "native");
    assert.deepEqual(f.gateway.capabilitiesForActor(f.actor), {});
  }
  f.actor.type = "Player"; f.settings.usePulpMode = undefined;
  f.game.settings.get = () => undefined;
  assert.equal(f.view().presentation, "native");
});
test("request options and unsupported actions cannot bypass native dialogs", async t => {
  const f = setup(t);
  for (const extra of [{ skipPrompt: true }, { config: {} }, { path: "system.luck.available" }, { method: "update" }]) await assert.rejects(f.gateway.execute(action, { ...f.request("stat:str"), ...extra }), { code: "INVALID_INPUT" });
  for (const id of ["stat:constructor", "spell:lost", "attack-ranged:sword", "light:secret"]) await assert.rejects(f.gateway.execute(action, { ...f.request("stat:str"), actionId: id }), { code: "CAPABILITY_UNAVAILABLE" });
  assert.equal(f.calls.length, 0);
});
for (const pulp of [false, true]) {
  test(`${pulp ? "Pulp" : "normal"} HP and Luck edits use native one-field updates`, async t => {
    const f = setup(t, { pulp });
    await f.gateway.execute(edit, f.edit("hp", 0));
    await f.gateway.execute(edit, f.edit("luck", pulp ? 5 : false));
    assert.deepEqual(f.writes, [[{ "system.attributes.hp.value": 0 }], [{ [pulp ? "system.luck.remaining" : "system.luck.available"]: pulp ? 5 : false }]]);
    for (const value of ["1", -1, 1.5, 13, NaN]) await assert.rejects(f.gateway.execute(edit, f.edit("hp", value)), { code: "INVALID_INPUT" });
    const stale = f.edit("luck", pulp ? 2 : true); f.settings.usePulpMode = !pulp;
    await assert.rejects(f.gateway.execute(edit, stale), { code: "STALE_STATE" });
  });
}
test("token-light actions are unavailable even for an owned assigned PC", async t => {
  const f = setup(t);
  assert.equal(f.gateway.capabilitiesForActor(f.actor).profileActions.some(a => a.id.startsWith("light:")), false);
  await assert.rejects(f.gateway.execute(action, { actorSourceUuid: f.actor.uuid, actionId: "light:torch", actionRevision: "old" }), { code: "CAPABILITY_UNAVAILABLE" });
  assert.equal(f.lights.length, 0);
});

test("synthetic PC rolls preserve exact source UUIDs while light controls remain native-sheet only", async t => {
  const f = setup(t);
  f.actor.uuid = "Scene.scene.Token.token.Actor.hero"; f.actor.isToken = true;
  for (const item of f.actor.items) item.uuid = `${f.actor.uuid}.Item.${item.id}`;
  installGlobals(t, { fromUuidSync: uuid => uuid === f.actor.uuid ? f.actor : null });
  const result = await f.gateway.execute(action, f.request("attack-melee:sword"));
  assert.equal(result.actorSourceUuid, f.actor.uuid);
  assert.equal(f.calls[0].target, `${f.actor.uuid}.Item.sword`);
  assert.equal(f.gateway.capabilitiesForActor(f.actor).profileActions.some(a => a.id.startsWith("light:")), false);
});

for (const change of ["lost", "caster", "identity", "tier", "visibility"]) {
  test(`spell dialog rejects changed ${change} before native loss/effects`, async t => {
    const f = setup(t); let finish;
    const spell = f.actor.items.get("spell"); f.prompt = () => new Promise(resolve => { finish = resolve; });
    const pending = f.gateway.execute(action, f.request("spell:spell"));
    if (change === "lost") spell.system.lost = true;
    if (change === "caster") f.actor.system.isSpellCaster = false;
    if (change === "identity") f.actor.items.splice(f.actor.items.indexOf(spell), 1, { ...spell });
    if (change === "tier") spell.system.tier = 2;
    if (change === "visibility") spell.visible = false;
    finish(true); await assert.rejects(pending);
    assert.equal(f.rolls.length, 0); assert.equal(f.hooks.count("SD-Player-Spell"), 0);
  });
}
test("native hook vetoes remain native and do not trigger a second roll", async t => {
  const f = setup(t);
  const veto = () => false; f.hooks.on("SD-Stat-Check", veto);
  assert.equal((await f.gateway.execute(action, f.request("stat:str"))).cancelled, true);
  assert.equal(f.rolls.length, 0); assert.equal(f.hooks.count("SD-Stat-Check"), 1);
  f.hooks.off("SD-Stat-Check", veto);
});
test("resource saves reject stale values, limits, lifecycle and arbitrary paths", async t => {
  const f = setup(t); let request = f.edit("hp", 5);
  f.actor.system.attributes.hp.value = 6;
  await assert.rejects(f.gateway.execute(edit, request), { code: "STALE_STATE" });
  request = f.edit("hp", 5); f.actor.system.attributes.hp.max = 11;
  await assert.rejects(f.gateway.execute(edit, request), { code: "STALE_STATE" });
  await assert.rejects(f.gateway.execute(edit, { ...f.edit("hp", 5), path: "system.attributes.ac.value" }), { code: "INVALID_INPUT" });
  await assert.rejects(f.gateway.execute(edit, f.edit("hp", 5), { isCurrent: () => false }), { code: "STALE_SESSION" });
  assert.equal(f.writes.length, 0);
});
test("inventory uses native slot totals, coins, stashed gear, and nonempty talent tabs", t => {
  const f = setup(t);
  f.actor.system.slots = 12;
  f.actor.system.coins = { gp: 40, sp: 5, cp: 0 };
  f.actor.system.getSlotUsage = () => ({ total: 9, coins: 2 });
  const item = (id, type, system) => ({ id, type, name: id, parent: f.actor, uuid: `${f.actor.uuid}.Item.${id}`, system });
  f.actor.items.push(item("stash", "Basic", { isPhysical: true, isIdentified: true, stashed: true, quantity: 3 }));
  f.actor.items.push(item("talent", "Talent", { talentClass: "class", description: "<p>Native talent text</p>" }));
  const view = f.view(), inventory = view.panels.find(p => p.id === "inventory");
  assert.deepEqual(inventory.sections.find(s => s.id === "slots").rows[0], { id: "slots", label: "Slots", value: 9, max: 12, format: "number" });
  assert.equal(inventory.sections.find(s => s.id === "coins").summary[0].value, 2);
  assert.equal(inventory.sections.find(s => s.id === "coins").rows.find(r => r.id === "gp").value, 40);
  assert.deepEqual(inventory.sections.find(s => s.id === "stashed").rows.map(r => r.id), ["stash"]);
  assert.equal(inventory.sections.find(s => s.id === "gear").rows.some(r => r.id === "stash"), false);
  assert.equal(view.panels.find(p => p.id === "talents").sections[0].rows[0].description, "<p>Native talent text</p>");
  f.actor.items.get("stash").system.isIdentified = false;
  f.actor.items.get("talent").visible = false;
  assert.equal(f.view().panels.some(p => p.id === "talents"), false);
  assert.equal(f.view().panels.find(p => p.id === "inventory").sections.some(s => s.id === "stashed"), false);
});

test("native Shadowdark rolls share the fixed-ID dialog lock across roll types", async t => {
  const f = setup(t); let release;
  f.prompt = () => new Promise(resolve => { release = resolve; });
  const pending = f.gateway.execute(action, f.request("stat:str"));
  await assert.rejects(f.gateway.execute(action, f.request("attack-melee:sword")), { code: "COMMAND_BUSY" });
  release(false); await pending;
  f.prompt = async () => true;
  await f.gateway.execute(action, f.request("attack-melee:sword"));
  assert.equal(f.rolls.length, 1);
});
