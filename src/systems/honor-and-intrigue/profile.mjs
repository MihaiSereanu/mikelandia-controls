import { documents, ownedItem, resourceSections, resourceField as resource, valueField as field, valuesSection as values, itemSection as items } from "../native-profile.mjs";

export const qualities = { might: "Might", daring: "Daring", savvy: "Savvy", flair: "Flair" };
export const combatAbilities = { brawl: "Brawl", melee: "Melee", ranged: "Ranged", defense: "Defense" };
export const physicalTypes = ["weapon", "armor", "equipment", "treasure"];
export const canCheck = item => (item.system.requiresCheck || item.system.requiresOpposedCheck)
  && Object.hasOwn(qualities, item.system.abilityCheck?.quality);
export function weaponManeuvers(actor) {
  return documents(actor.items).filter(item => ownedItem(actor, item) && item.type === "weapon").flatMap(weapon =>
    Array.from(weapon.system.maneuvers ?? []).filter(uuid => typeof uuid === "string" && uuid.length <= 512).map((uuid, index) => {
      let maneuver = documents(actor.items).find(item => ownedItem(actor, item) && item.type === "maneuver" && item._stats?.compendiumSource === uuid);
      try { maneuver ??= globalThis.fromUuidSync?.(uuid); } catch { /* Resolve uncached native links when used. */ }
      return { weapon, uuid, index, maneuver, id: `weapon-maneuver:${weapon.id}:${index}` };
    }));
}
export function intrigueProfile(actor) {
  return { tabs: [
    { id: "main", label: "Main", summaryLayout: "triple", sections: [...resourceSections([
      resource("lifeblood", "Lifeblood", "system.lifeblood.value", { maxPath: "system.lifeblood.max" }),
      resource("fortune", "Fortune", "system.fortune.value"), resource("advantage", "Advantage", "system.advantage"),
      resource("composure", "Composure", "system.composure"),
      ...(actor.system.arcanePower?.career ? [resource("arcane-power", "Arcane Power", "system.arcanePower.value", { maxPath: "system.arcanePower.max" })] : [])]),
      { ...values("advancement", "Advancement Points", [field("advancement", "Advancement Points", "system.advancementPoints.value")]), fullWidth: true },
      values("qualities", "Qualities", Object.entries(qualities).map(([id, label]) => field(id, label, `system.qualities.${id}`, { actionId: `characteristic:qualities.${id}` }))),
      values("combat-abilities", "Combat Abilities", Object.entries(combatAbilities).map(([id, label]) => field(id, label, `system.combatAbilities.${id}`)))] },
    { id: "careers", label: "Careers", sections: [items("careers", "Careers", ["career"], { valuePath: "system.rank", keepEmpty: true, layout: "rows" })] },
    { id: "combat", label: "Combat", sections: [
      items("weapons", "Weapons", ["weapon"], { readValue: item => item.system.damageFormula?.value ?? "", format: "display", actionIdPrefix: "damage", layout: "rows" }),
      { ...values("weapon-maneuvers", "Weapon Maneuvers", weaponManeuvers(actor).map((row, index) => field(`weapon-maneuver-${index}`,
        `${row.weapon.name}: ${row.maneuver?.name ?? `Maneuver ${row.index + 1}`}`, null,
        { read: () => row.maneuver?.name ?? "Maneuver", format: "text", actionId: row.id }))), layout: "actions" },
      { ...values("loading", "Reload", documents(actor.items).filter(item => ownedItem(actor, item) && item.type === "weapon" && item.system.loadActions?.needed > 0)
        .map((item, index) => field(`loading-${index}`, item.name, null, { read: () => `${item.system.loadActions.spent} / ${item.system.loadActions.needed}`, format: "text", actionId: `reload:${item.id}` }))), fullWidth: true },
      items("maneuvers", "Maneuvers", ["maneuver"], { actionIdPrefix: "maneuver", layout: "rows" }),
      items("actions", "Actions", ["action"], { actionIdPrefix: "maneuver", layout: "rows" }),
      items("styles", "Dueling Styles", ["duelingStyle"], { actionIdPrefix: "style", readValue: item => item.system.active === true, format: "boolean", editControl: "checkbox", layout: "rows" }) ] },
    { id: "inventory", label: "Inventory", sections: [items("gear", "Gear & Treasure", physicalTypes,
      { descriptionToggle: "item-name", valuePath: "system.quantity", quantityEditable: true, equipmentEditable: true, keepEmpty: true, layout: "rows" })] },
    { id: "abilities", label: "Boons & Flaws", sections: [items("boons", "Boons", ["boon"], { layout: "rows" }), items("flaws", "Flaws", ["flaw"], { layout: "rows" })] }
  ] };
}
