import { warhammerWeaponMode, ownedWarhammerItem } from "./items.mjs";
import { spellForActor, magicWinds } from "./magic.mjs";
import { localizeFoundry } from "../../foundry/settings/localization.mjs";

const field = (id, labelKey, path, extra = {}) => ({ id, labelKey, label: labelKey, path, editId: id,
  ...(["wounds", "fortune", "fate", "corruption"].includes(id) ? { editControl: "counter" } : {}), ...extra });
const characteristic = (id, key, label) => ({ id, labelKey: key, label, path: `system.characteristics.${id}.value`, actionId: `characteristic:${id}` });
const encumbrance = { id: "encumbrance", kind: "counters", labelKey: "Encumbrance", label: "Encumbrance", fields: [
  { id: "encumbrance", labelKey: "Encumbrance", label: "Encumbrance", maxPath: "system.status.encumbrance.max", read: actor => {
    const value = actor.system?.status?.encumbrance?.current;
    // Native preparation uses toFixed(2); keep the counter numeric without recomputing it.
    if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return undefined;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  } }
] };

/** Mappings verified against wfrp4e 10.1.2 native models and sheet templates. */
export const warhammerCharacterProfile = {
  tabs: [
    { id: "main", summaryLayout: "counter-pairs", labelKey: "Main", label: "Main", sections: [
      { id: "characteristics", kind: "values", labelKey: "Characteristics", label: "Characteristics", fields: [
        characteristic("ws", "CHAR.WS", "Weapon Skill"), characteristic("bs", "CHAR.BS", "Ballistic Skill"),
        characteristic("s", "CHAR.S", "Strength"), characteristic("t", "CHAR.T", "Toughness"),
        characteristic("i", "CHAR.I", "Initiative"), characteristic("ag", "CHAR.Ag", "Agility"),
        characteristic("dex", "CHAR.Dex", "Dexterity"), characteristic("int", "CHAR.Int", "Intelligence"),
        characteristic("wp", "CHAR.WP", "Willpower"), characteristic("fel", "CHAR.Fel", "Fellowship")
      ] },
      { id: "wounds", kind: "counters", labelKey: "Wounds", label: "Wounds", fields: [
        field("wounds", "Wounds", "system.status.wounds.value", { maxPath: "system.status.wounds.max", secondaryActionId: "rest" })
      ] },
      { id: "corruption", kind: "counters", labelKey: "Corruption", label: "Corruption", fields: [
        field("corruption", "Corruption", "system.status.corruption.value", { maxPath: "system.status.corruption.max" })
      ] },
      { id: "fate", kind: "counters", labelKey: "Fate", label: "Fate", fields: [
        field("fate", "Fate", "system.status.fate.value")
      ] },
      { id: "fortune", kind: "counters", labelKey: "Fortune", label: "Fortune", fields: [
        field("fortune", "Fortune", "system.status.fortune.value")
      ] },
      { id: "resolve-resilience", kind: "counters", label: "Resolve / Resilience", when: context => !context.use5e, fields: [
        field("resolve", "Resolve", "system.status.resolve.value"),
        field("resilience", "Resilience", "system.status.resilience.value")
      ] },
      { id: "experience", kind: "values", layout: "table", labelKey: "Experience", label: "Experience", fields: [
        ...["current", "spent", "total"].map(id => ({ id: `xp-${id}`, labelKey: id[0].toUpperCase() + id.slice(1), label: id[0].toUpperCase() + id.slice(1), path: `system.details.experience.${id}` }))
      ] }
    ] },
    { id: "combat", labelKey: "Combat", label: "Combat", sections: [
      encumbrance,
      { id: "movement", kind: "values", layout: "table", labelKey: "Move", label: "Movement", fields: [
        { id: "move", labelKey: "Move", label: "Move", path: "system.details.move.value" },
        ...["walk", "run"].map(id => ({ id, labelKey: id[0].toUpperCase() + id.slice(1), label: id[0].toUpperCase() + id.slice(1), format: "display",
          read: actor => {
            const value = actor.system?.details?.move?.[id];
            if ((typeof value !== "number" || !Number.isFinite(value)) && (typeof value !== "string" || !value.trim())) return undefined;
            return actor.system?.autoCalc?.[id] ? `${value} ${localizeFoundry("yds", "yds")}` : value;
          } }))
      ] },
      { id: "momentum", kind: "values", labelKey: "Momentum", label: "Momentum", when: context => context.use5e, fields: [
        field("momentum", "Momentum", "system.status.momentum", { format: "boolean", editControl: "checkbox" })
      ] },
      { id: "advantage", kind: "counters", labelKey: "Advantage", label: "Advantage", when: context => !context.use5e && !context.groupAdvantage, fields: [
        field("advantage", "Advantage", "system.status.advantage.value")
      ] },
      { id: "group-advantage", kind: "counters", labelKey: "SHEET.GroupAdvantage", label: "Group Advantage", when: context => !context.use5e && context.groupAdvantage, fields: [
        field("advantage", "SHEET.GroupAdvantage", "system.status.advantage.value", { label: "Group Advantage" })
      ] },
      { id: "melee-weapons", kind: "items", labelKey: "SHEET.MeleeWeaponHeader", label: "Melee Weapon(s)",
        collectionPath: "items", itemTypes: ["weapon"], actionIdPrefix: "weapon", valuePath: "system.DamageString", format: "display",
        valueLabelKey: "Damage", valueLabel: "Damage", valuePrefix: "+",
        include: (item, _context, actor) => item.parent === actor && warhammerWeaponMode(item) === "melee" },
      { id: "ranged-weapons", kind: "items", labelKey: "SHEET.RangedWeaponHeader", label: "Ranged Weapon(s)",
        collectionPath: "items", itemTypes: ["weapon"], actionIdPrefix: "weapon", valuePath: "system.DamageString", format: "display",
        valueLabelKey: "Damage", valueLabel: "Damage", valuePrefix: "+",
        include: (item, _context, actor) => item.parent === actor && warhammerWeaponMode(item) === "ranged" }
    ] },
    { id: "skills", labelKey: "Skills", label: "Skills", sections: [
      { id: "basic-skills", kind: "items", labelKey: "Basic Skills", label: "Basic Skills", collectionPath: "items", itemTypes: ["skill"],
        actionIdPrefix: "skill",
        valuePath: "system.total.value", include: item => item.system?.advanced?.value === "bsc" && item.system?.grouped?.value === "noSpec" },
      { id: "advanced-skills", kind: "items", labelKey: "Advanced", label: "Advanced", collectionPath: "items", itemTypes: ["skill"],
        actionIdPrefix: "skill",
        valuePath: "system.total.value", include: item => item.system?.advanced?.value === "adv" || item.system?.grouped?.value === "isSpec" }
    ] }
  ]
};

export function createWarhammerCharacterProfile(actor, context) {
  const winds = magicWinds(actor, context);
  const spellSection = (petty) => ({
    id: petty ? "petty-spells" : "lore-spells", kind: "items",
    labelKey: petty ? "SHEET.PettySpell" : "SHEET.LoreSpell", label: petty ? "Petty Spell" : "Lore Spell",
    collectionPath: "items", itemTypes: ["spell"], actionIdPrefix: "spell",
    ...(!petty ? { valuePath: "system.cn.value", valueLabelKey: "CN", valueLabel: "CN" } : {}),
    include: (item, _context, owner) => spellForActor(owner, String(item.id), context) === item
      && (item.system.lore.value == "petty") === petty
  });
  const inventory = (id, labelKey, label, types) => ({ id, kind: "items", labelKey, label, collectionPath: "items", itemTypes: types,
    valuePath: "system.quantity.value", descriptionPath: "system.description.value",
    include: (item, _context, owner) => ownedWarhammerItem(owner, String(item.id), item.type) === item });
  return { tabs: [...warhammerCharacterProfile.tabs,
  { id: "trappings", labelKey: "Trappings", label: "Trappings", sections: [
    encumbrance,
    { id: "social-status", kind: "values", label: "Social Status", fields: [
      { id: "social-status", label: "Social Status", path: "system.details.status.value", format: "text" }
    ] },
    inventory("money", "Money", "Money", ["money"]),
    inventory("weapons", "Weapons", "Weapons", ["weapon"]),
    inventory("armour", "Armour", "Armour", ["armour"]),
    inventory("ammunition", "Ammunition", "Ammunition", ["ammunition"]),
    inventory("trappings", "Trappings", "Trappings", ["trapping"]),
    inventory("containers", "Containers", "Containers", ["container"])
  ] },
  { id: "talents", labelKey: "Talents", label: "Talents", sections: [
    ...[["talent", "Talents"], ["trait", "Traits"]].map(([type, label]) => ({ id: `${type}s`, kind: "items", labelKey: label, label,
      collectionPath: "items", itemTypes: [type], descriptionPath: "system.description.value",
      include: (item, _context, owner) => ownedWarhammerItem(owner, String(item.id), type) === item }))
  ] }, {
    id: "magic", labelKey: "Magic", label: "Magic", sections: [
      { id: "channelling", kind: "values", labelKey: "NAME.Channelling", label: "Channelling", fields: winds.map(({ key, label }, index) => ({
        id: `wind-${index}`, labelKey: label, label, actionId: `wind:${key}`,
        read: current => current.system.status.channelling.wind === key ? current.system.status.channelling.value : 0
      })) },
      spellSection(true), spellSection(false)
    ]
  }] };
}
