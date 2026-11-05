import { documents, ownedItem, resourceSections, resourceField as resource, valueField as field, valuesSection as values, itemSection as items } from "../native-profile.mjs";

export const physicalTypes = ["weapon", "armor", "shield", "gear", "consumable"];
export const attributes = { agility: "Agility", smarts: "Smarts", spirit: "Spirit", strength: "Strength", vigor: "Vigor" };
export const setting = (game, key) => { try { return game.settings.get("swade", key); } catch { return undefined; } };
export const dieText = die => Number.isFinite(die?.sides) ? `d${die.sides}${die.modifier ? `${die.modifier > 0 ? "+" : ""}${die.modifier}` : ""}` : undefined;
export const powerPools = actor => Object.entries(actor.system.powerPoints ?? {}).filter(([key]) => key && !/[.]/u.test(key)
  && !["__proto__", "constructor", "prototype"].includes(key));
export function swadeProfile(actor, game) {
  const actionRows = [];
  for (const item of documents(actor.items).filter(item => ownedItem(actor, item))) {
    const add = (key, label) => actionRows.push(field(`action-${actionRows.length}`, `${item.name}: ${label}`, null,
      { read: () => label, format: "text", actionId: `item:${item.id}:${key}` }));
    if (item.system.actions?.trait) add("formula", "Use");
    if (item.system.damage) add("damage", "Damage");
    for (const [key, action] of Object.entries(item.system.actions?.additional ?? {})) if (/^[a-zA-Z0-9_-]+$/u.test(key)) add(key, action.name ?? key);
    if (item.type === "weapon" && item.system.shots > 0 && item.system.reloadType > 0) add("reload", "Reload");
    if (item.type === "consumable") add("consume", "Use");
  }
  return { tabs: [
    { id: "main", label: "Main", summaryLayout: "triple", sections: [...resourceSections([
      ...["wounds", "fatigue", "bennies"].map(id => resource(id, id[0].toUpperCase() + id.slice(1), `system.${id}.value`, { maxPath: `system.${id}.max` })),
      ...(setting(game, "enableConviction") ? [resource("conviction", "Conviction", "system.details.conviction.value",
        { secondaryActionId: "conviction" })] : [])]),
      values("stats", "Derived Stats", [field("pace", "Pace", "system.pace.default"), field("parry", "Parry", "system.stats.parry.value"),
        field("toughness", "Toughness", "system.stats.toughness.value"), field("armor", "Armor", "system.stats.toughness.armor")]),
      values("attributes", "Attributes", Object.entries(attributes).map(([id, label]) => field(id, label, null,
        { read: actor => dieText(actor.system.attributes?.[id]?.die), format: "text", actionId: `attribute:${id}` }))),
      items("skills", "Skills", ["skill"], { actionIdPrefix: "skill", readValue: item => dieText(item.system.die), format: "text" })] },
    { id: "combat", label: "Combat", sections: [items("weapons", "Weapons", ["weapon"]), { ...values("item-actions", "Actions", actionRows), layout: "actions" }] },
    { id: "powers", label: "Powers", summaryLayout: "triple", sections: [
      ...(!setting(game, "noPowerPoints") ? resourceSections(powerPools(actor).map(([key, pool], index) =>
        resource(`power-points-${index}`, key === "general" ? "General" : key, null, { read: () => pool.value,
          readMax: () => pool.max }))) : []),
      items("powers", "Powers", ["power"], { actionIdPrefix: "power" }) ] },
    { id: "inventory", label: "Inventory", summaryLayout: "triple", sections: [
      ...(setting(game, "wealthType") === "wealthDie" ? [{ ...values("wealth", "Wealth", [field("wealth", "Wealth", null,
        { read: actor => dieText({ sides: actor.system.details.wealth.die, modifier: actor.system.details.wealth.modifier }), format: "text", actionId: "wealth" })]), fullWidth: true }]
        : setting(game, "wealthType") === "currency" ? [values("currency", "Currency", [resource("currency", "Currency", "system.details.currency")])] : []),
      items("gear", "Gear", physicalTypes, { descriptionToggle: "item-name", valuePath: "system.quantity", quantityEditable: true, equipmentEditable: true, keepEmpty: true })] },
    { id: "abilities", label: "Abilities", sections: [items("edges", "Edges", ["edge"]), items("hindrances", "Hindrances", ["hindrance"]),
      items("basic-actions", "Basic Actions", ["action"]),
      items("abilities", "Special Abilities", ["ability"], { include: (item, _context, actor) => ownedItem(actor, item) && item.system.subtype !== "archetype" }),
      items("ancestry", "Ancestry", ["ancestry"])] }
  ] };
}
