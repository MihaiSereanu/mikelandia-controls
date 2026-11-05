import { createActor, createGame, collection, createHooks } from "./foundry.mjs";

export function createNativeSystemFixture(systemId = "swade") {
  const hooks = createHooks(), calls = [], settings = new Map([["wealthType", "currency"], ["enableConviction", true]]);
  const actor = createActor({ name: "Captain Alexandra of the Long and Winding Coast", type: "character", statuses: new Set(),
    system: { wounds: { value: 0, max: 3 }, fatigue: { value: 0, max: 2 }, bennies: { value: 3, max: 3 },
      attributes: Object.fromEntries(["agility", "smarts", "spirit", "strength", "vigor"].map(key => [key, { die: { sides: 6, modifier: 0 } }])),
      pace: { default: 6 }, stats: { parry: { value: 5 }, toughness: { value: 6, armor: 1 } },
      details: { notes: "Private captain's notes", goals: "Chart the coast", biography: { value: "A seasoned captain." }, conviction: { value: 1, active: false }, currency: 50, wealth: { die: 6, modifier: 0 } },
      powerPoints: { general: { value: 10, max: 10 }, "Weird Science": { value: 5, max: 8 } } } });
  const write = async (doc, changes) => {
    for (const [path, value] of Object.entries(changes)) {
      const keys = path.split("."), leaf = keys.pop();
      keys.reduce((data, key) => data[key] ??= {}, doc)[leaf] = value;
    }
    hooks.emit(doc === actor ? "updateActor" : "updateItem", doc, changes);
    return doc;
  };
  actor.update = changes => write(actor, changes);
  const item = (id, type, system) => ({ id, uuid: `${actor.uuid}.Item.${id}`, documentName: "Item", name: id[0].toUpperCase() + id.slice(1),
    type, parent: actor, visible: true, isOwner: true, system: { description: "<p>A carefully maintained <strong>heirloom</strong> with a long history at sea.</p>", ...system },
    update(changes) { return write(this, changes); }, async setEquipState(value) { await this.update({ "system.equipStatus": value }); return value; } });
  actor.items = collection([item("sword", "weapon", { quantity: 1, equipStatus: 4, damage: "Str+d6", actions: { trait: "Fighting", additional: { flourish: { name: "Flourish", type: "trait" } } } }),
    item("fighting", "skill", { die: { sides: 8 } }), item("bolt", "power", { actions: { trait: "Spellcasting" }, damage: "2d6" }),
    item("edge", "edge", {}), item("hindrance", "hindrance", {}), item("ration", "consumable", { quantity: 4, equipStatus: 1 }),
    item("defend", "action", {}), item("ancestry", "ancestry", {}), item("special", "ability", {}), item("archetype", "ability", { subtype: "archetype" })]);
  const game = createGame([actor], systemId);
  game.user.character = actor;
  game.system.version = "6.0.4";
  game.settings.get = (_system, key) => settings.get(key);
  game.i18n = { localize: key => key, format: key => key };
  const roll = async (...args) => {
    calls.push(args);
    const message = { user: game.user, author: game.user, speaker: { actor: actor.id }, rolls: [{ total: 4 }], id: String(calls.length) };
    game.messages.push(message); hooks.emit("createChatMessage", message); return message;
  };
  actor.rollAttribute = key => roll("attribute", key);
  actor.rollSkill = key => roll("skill", key);
  actor.rollWealthDie = () => roll("wealth");
  actor.toggleConviction = async () => {
    calls.push(["toggleConviction"]);
    const { value, active } = actor.system.details.conviction;
    return actor.update(value > 0 && !active ? { "system.details.conviction.value": value - 1, "system.details.conviction.active": true }
      : { "system.details.conviction.active": false });
  };
  actor.spendBenny = async () => { calls.push(["spendBenny"]); await actor.update({ "system.bennies.value": actor.system.bennies.value - 1 }); return true; };
  actor.getBenny = async () => { calls.push(["getBenny"]); await actor.update({ "system.bennies.value": actor.system.bennies.value + 1 }); };
  actor.toggleActiveEffect = async (id, { active }) => { if (active) actor.statuses.add(id); else actor.statuses.delete(id); hooks.emit("updateActor", actor, {}); return actor; };
  game.swade = { itemChatCardHelper: { handleAction: (item, nativeActor, key, options) => {
    if (nativeActor !== actor) throw new Error("wrong actor"); return roll("item", item.id, key, options);
  } } };
  if (systemId === "honor-and-intrigue") {
    game.system.version = "0.2.0"; actor.type = "hero";
    actor.system = { qualities: { might: 2, daring: 2, savvy: 1, flair: 1 }, combatAbilities: { brawl: 1, melee: 2, ranged: 0, defense: 1 },
      lifeblood: { value: 10, min: -6, max: 12 }, fortune: { value: 3 }, advantage: 3, composure: 3,
      advancementPoints: { value: 2, accrued: 3, spent: 1 }, arcanePower: { value: 5, max: 10, career: "sailor" },
      notes: "Private captain's notes", background: { backstory: "A seasoned captain.", origin: "Port Royal" } };
    actor.rollCharacteristic = key => roll("characteristic", key);
    actor.system.rollManeuver = (item, options) => roll("maneuver", item.id, options);
    actor.toggleStatusEffect = actor.toggleActiveEffect;
    actor.items = collection([item("sword", "weapon", { quantity: 1, carriedPosition: 1, damageFormula: { value: "1d6" },
      maneuvers: new Set(["Compendium.test.lunge"]), loadActions: { needed: 1, spent: 1 }, isLoaded: true }),
      item("lunge", "maneuver", { requiresCheck: true, abilityCheck: { quality: "daring", combatAbility: "melee" } }),
      item("sailor", "career", { rank: 2, isArcane: true }), item("style", "duelingStyle", {}), item("boon", "boon", {}),
      item("flaw", "flaw", {}), item("ration", "equipment", { quantity: 4, carriedPosition: 2 })]);
    actor.items.get("lunge")._stats = { compendiumSource: "Compendium.test.lunge" };
    actor.items.get("sword").system.rollDamage = () => roll("damage", "sword");
  }
  return { actor, game, hooks, calls, settings, write, roll, item };
}
