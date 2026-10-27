import { abilities, carriedItem, stashedItem, ownedItem, physicalTypes, knownSpell, weaponMode } from "./context.mjs";

import { customResources, readCustomResource } from "./resources.mjs";

const field = (id, key, label, path, extra = {}) => ({ id, labelKey: key, label, path, ...extra });
export function shadowdarkPlayerProfile(context) {
  return { tabs: [
    { id: "abilities", summaryLayout: "triple", labelKey: "SHADOWDARK.sheet.player.tab.abilities", label: "Abilities", sections: [
      { id: "hp", kind: "counters", labelKey: "SHADOWDARK.sheet.actor.hp", label: "HP", fields: [
        field("hp", "SHADOWDARK.sheet.actor.hp", "HP", "system.attributes.hp.value", { maxPath: "system.attributes.hp.max", editId: "hp" })] },
      { id: "ac", kind: "values", labelKey: "SHADOWDARK.sheet.actor.ac", label: "AC", fields: [field("ac", "SHADOWDARK.sheet.actor.ac", "AC", "system.attributes.ac.value")] },
      ...["def", "xp", "grit"].map(id => id === "xp" ? {
        id, kind: "values", labelKey: "VEMOBILE.Panels.XP", label: "XP", fields: [
          field(id, "VEMOBILE.Panels.XP", "XP", "system.level.xp", { editId: id })]
      } : { id, label: customResources[id], labelKey: `VEMOBILE.Panels.${customResources[id]}`, kind: "values", fields: [
        field(id, `VEMOBILE.Panels.${customResources[id]}`, customResources[id], null, { editId: id, read: actor => readCustomResource(actor, id) })
      ] }),
      { id: "luck", kind: "values", labelKey: "SHADOWDARK.sheet.player.luck", label: "Luck", fields: [
        field("luck", "SHADOWDARK.sheet.player.luck", "Luck", context.pulp ? "system.luck.remaining" : "system.luck.available", { format: context.pulp ? "number" : "boolean", editId: "luck" })] },
      { id: "stats", kind: "values", labelKey: "SHADOWDARK.sheet.abilities.stats", label: "Stats", fields: abilities.map(id => ({
        id, labelKey: `SHADOWDARK.ability_${id}`, label: id[0].toUpperCase() + id.slice(1), actionId: `stat:${id}`, format: "display",
        read: actor => {
          const stat = actor.system.abilities[id];
          return Number.isFinite(stat?.value) && Number.isFinite(stat?.mod) ? `${stat.value} (${stat.mod >= 0 ? "+" : ""}${stat.mod})` : undefined;
        }
      })) },
      ...["melee", "ranged"].map(mode => ({ id: `${mode}-attacks`, kind: "items", labelKey: `SHADOWDARK.sheet.player.${mode}_attacks`, label: mode === "melee" ? "Melee Attacks" : "Ranged Attacks",
        collectionPath: "items", itemTypes: ["Weapon"], actionIdPrefix: `attack-${mode}`, valuePath: "system.subtext", format: "text",
        include: (item, _context, actor) => weaponMode(item, actor, mode) }))
    ] },
    { id: "spells", labelKey: "SHADOWDARK.sheet.player.tab.spells", label: "Spells", sections: [
      { id: "known-spells", kind: "items", labelKey: "SHADOWDARK.sheet.item.tab.spellsknown", label: "Spells Known", collectionPath: "items", itemTypes: ["Spell"],
        actionIdPrefix: "spell", valuePath: "system.tier", valueLabelKey: "SHADOWDARK.sheet.player.spells_tier", valueLabel: "Tier",
        include: (item, _context, actor) => knownSpell(item, actor) && item.system.lost === false },
      { id: "lost-spells", kind: "items", labelKey: "VEMOBILE.Panels.LostSpells", label: "Lost Spells", collectionPath: "items", itemTypes: ["Spell"],
        valuePath: "system.tier", valueLabelKey: "SHADOWDARK.sheet.player.spells_tier", valueLabel: "Tier",
        include: (item, _context, actor) => knownSpell(item, actor) && item.system.lost === true }
    ] },
    { id: "inventory", labelKey: "SHADOWDARK.sheet.player.tab.inventory", label: "Inventory", sections: [
      { id: "gear", kind: "items", keepEmpty: true, labelKey: "SHADOWDARK.inventory.gear", label: "Gear", collectionPath: "items", itemTypes: physicalTypes,
        summary: [field("slots", "SHADOWDARK.inventory.slots", "Slots", null, { read: actor => actor.system.getSlotUsage?.().total, maxPath: "system.slots" })],
        valuePath: "system.quantity", quantityEditable: true, secondaryActionIdPrefix: "light", include: (item, _context, actor) => carriedItem(item, actor) },
      { id: "coins", kind: "values", layout: "inline", labelKey: "SHADOWDARK.inventory.coins", label: "Coins",
        summary: [field("coin-slots", "SHADOWDARK.inventory.slots", "Slots", null, { read: actor => actor.system.getSlotUsage?.().coins })],
        fields: ["gp", "sp", "cp"].map(id =>
        field(id, `SHADOWDARK.coins.${id}`, id.toUpperCase(), `system.coins.${id}`, { editId: `coin-${id}` })) },
      { id: "stashed", kind: "items", labelKey: "SHADOWDARK.inventory.stashed_gear", label: "Stashed Gear", collectionPath: "items", itemTypes: physicalTypes,
        valuePath: "system.quantity", quantityEditable: true, include: (item, _context, actor) => stashedItem(item, actor) }

    ] },
    { id: "talents", labelKey: "SHADOWDARK.sheet.player.tab.talents", label: "Talents", sections: [
      ...["ancestry", "class", "level"].map(group => ({ id: `talents-${group}`, kind: "items", labelKey: `SHADOWDARK.talent.class.${group}`, label: group[0].toUpperCase() + group.slice(1),
        collectionPath: "items", itemTypes: ["Talent"], descriptionPath: "system.description",
        include: (item, _context, actor) => ownedItem(actor, String(item.id), "Talent") === item
          && (group === "level" ? ["level", "patronBoon"].includes(item.system.talentClass) : item.system.talentClass === group) }))
    ] }
  ] };
}
