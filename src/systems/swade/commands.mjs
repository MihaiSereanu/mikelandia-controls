import { documents, ownedItem, resourceEdit, inventoryEdits, safeKey } from "../native-profile.mjs";
import { attributes, physicalTypes, powerPools, setting } from "./profile.mjs";
import { localizeFoundry } from "../../foundry/settings/localization.mjs";

export function swadeActions(actor, game) {
  const actions = Object.keys(attributes).flatMap(key => typeof actor.rollAttribute === "function"
    ? [{ id: `attribute:${key}`, label: attributes[key], roll: true, invoke: () => actor.rollAttribute(key) }] : []);
  for (const item of documents(actor.items).filter(item => ownedItem(actor, item))) {
    if (item.type === "skill" && typeof actor.rollSkill === "function") actions.push({ id: `skill:${item.id}`, label: item.name, roll: true, invoke: () => actor.rollSkill(item.id) });
    const helper = game.swade?.itemChatCardHelper;
    if (typeof helper?.handleAction !== "function") continue;
    if (item.type === "power" && item.system.actions?.trait) actions.push({ id: `power:${item.id}`, label: item.name, roll: true,
      invoke: () => helper.handleAction(item, actor, "formula", { event: undefined }) });
    const native = [];
    if (item.system.actions?.trait) native.push("formula");
    if (item.system.damage) native.push("damage");
    native.push(...Object.keys(item.system.actions?.additional ?? {}).filter(safeKey));
    if (item.type === "weapon" && item.system.shots > 0 && item.system.reloadType > 0) native.push("reload");
    if (item.type === "consumable") native.push("consume");
    for (const key of native) actions.push({ id: `item:${item.id}:${key}`, label: `${item.name}: ${key}`, roll: ["formula", "damage", "arcane-device"].includes(key)
      || ["trait", "resist", "damage"].includes(item.system.actions?.additional?.[key]?.type),
      invoke: () => helper.handleAction(item, actor, key, { event: undefined }) });
  }
  if (setting(game, "enableConviction") && typeof actor.toggleConviction === "function"
    && (actor.system.details.conviction.value > 0 || actor.system.details.conviction.active)) actions.push({ id: "conviction",
    label: actor.system.details.conviction.active
      ? localizeFoundry("MIKELANDIA_CONTROLS.Panels.EndConviction", "End Conviction")
      : localizeFoundry("MIKELANDIA_CONTROLS.Panels.SpendConviction", "Spend Conviction"),
    invoke: () => actor.toggleConviction() });
  if (setting(game, "wealthType") === "wealthDie" && typeof actor.rollWealthDie === "function") actions.push({ id: "wealth", label: "Wealth", roll: true, invoke: () => actor.rollWealthDie() });
  return actions;
}
export function swadeEdits(actor, game) {
  const edits = ["wounds", "fatigue"].map(id => resourceEdit(actor, id, `system.${id}.value`));
  if (typeof actor.spendBenny === "function" && typeof actor.getBenny === "function") edits.push(resourceEdit(actor, "bennies", "system.bennies.value", {
    min: Math.max(0, actor.system.bennies.value - 1), max: actor.system.bennies.value + 1,
    write: async (value, assertCurrent) => {
      const delta = value - actor.system.bennies.value;
      for (let step = 0; step < Math.abs(delta); step++) {
        assertCurrent();
        if (await actor[delta < 0 ? "spendBenny" : "getBenny"]() === false) return false;
      }
    }
  }));
  if (setting(game, "enableConviction")) edits.push(resourceEdit(actor, "conviction", "system.details.conviction.value"));
  if (setting(game, "wealthType") === "currency") edits.push(resourceEdit(actor, "currency", "system.details.currency",
    { kind: "number", min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }));
  if (!setting(game, "noPowerPoints")) for (const [index, [key, pool]] of powerPools(actor).entries()) edits.push(resourceEdit(actor,
    `power-points-${index}`, `system.powerPoints.${key}.value`, { value: pool.value, max: pool.max,
      write: async value => { await actor.update({ [`system.powerPoints.${key}.value`]: value }); return actor.system.powerPoints[key]?.value === value; } }));
  return [...edits, ...inventoryEdits(actor, physicalTypes, item => typeof item.setEquipState === "function" ? [{
    id: `equipped:${item.id}`, value: item.system.equipStatus, min: 0, max: 5,
    choices: ["Stored", "Carried", "Off-hand", "Equipped", "Main-hand", "Two hands"].map((label, value) => ({ label, value }))
      .filter(choice => item.system._rejectEquipState?.(choice.value) !== true),
    write: async value => (await item.setEquipState(value)) === value
  }] : [])];
}
