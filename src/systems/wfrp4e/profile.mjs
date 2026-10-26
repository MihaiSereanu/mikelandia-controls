import { warhammerWeaponMode } from "./items.mjs";
import { spellForActor, magicWinds } from "./magic.mjs";

const field = (id, labelKey, path, extra = {}) => ({ id, labelKey, label: labelKey, path, editId: id, ...extra });
const characteristic = (id, key, label) => ({ id, labelKey: key, label, path: `system.characteristics.${id}.value`, actionId: `characteristic:${id}` });

/** Mappings verified against wfrp4e 10.1.2 native models and sheet templates. */
export const warhammerCharacterProfile = {
  tabs: [
    { id: "main", labelKey: "Main", label: "Main", sections: [
      { id: "characteristics", kind: "values", labelKey: "Characteristics", label: "Characteristics", fields: [
        characteristic("ws", "CHAR.WS", "Weapon Skill"), characteristic("bs", "CHAR.BS", "Ballistic Skill"),
        characteristic("s", "CHAR.S", "Strength"), characteristic("t", "CHAR.T", "Toughness"),
        characteristic("i", "CHAR.I", "Initiative"), characteristic("ag", "CHAR.Ag", "Agility"),
        characteristic("dex", "CHAR.Dex", "Dexterity"), characteristic("int", "CHAR.Int", "Intelligence"),
        characteristic("wp", "CHAR.WP", "Willpower"), characteristic("fel", "CHAR.Fel", "Fellowship")
      ] },
      { id: "wounds", kind: "counters", labelKey: "Wounds", label: "Wounds", fields: [
        field("wounds", "Wounds", "system.status.wounds.value", { maxPath: "system.status.wounds.max" })
      ] },
      { id: "fortune", kind: "counters", labelKey: "Fortune", label: "Fortune", fields: [
        field("fortune", "Fortune", "system.status.fortune.value"), field("fate", "Fate", "system.status.fate.value"),
        field("resolve", "Resolve", "system.status.resolve.value", { when: context => !context.use5e }),
        field("resilience", "Resilience", "system.status.resilience.value", { when: context => !context.use5e })
      ] },
      { id: "corruption", kind: "counters", labelKey: "Corruption", label: "Corruption", fields: [
        field("corruption", "Corruption", "system.status.corruption.value", { maxPath: "system.status.corruption.max" })
      ] }
    ] },
    { id: "combat", labelKey: "Combat", label: "Combat", sections: [
      { id: "momentum", kind: "values", labelKey: "Momentum", label: "Momentum", when: context => context.use5e, fields: [
        field("momentum", "Momentum", "system.status.momentum", { format: "boolean" })
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
  return { tabs: [...warhammerCharacterProfile.tabs, {
    id: "magic", labelKey: "Magic", label: "Magic", sections: [
      { id: "channelling", kind: "values", labelKey: "NAME.Channelling", label: "Channelling", fields: winds.map(({ key, label }, index) => ({
        id: `wind-${index}`, labelKey: label, label, actionId: `wind:${key}`,
        read: current => current.system.status.channelling.wind === key ? current.system.status.channelling.value : 0
      })) },
      spellSection(true), spellSection(false)
    ]
  }] };
}
