import { documents, ownedItem, resourceEdit, inventoryEdits } from "../native-profile.mjs";
import { qualities, physicalTypes, weaponManeuvers, canCheck } from "./profile.mjs";

export function intrigueActions(actor) {
  const actions = Object.keys(qualities).map(key => `qualities.${key}`)
    .flatMap(key => typeof actor.rollCharacteristic === "function" ? [{ id: `characteristic:${key}`, label: key, roll: true, invoke: () => actor.rollCharacteristic(key) }] : []);
  for (const item of documents(actor.items).filter(item => ownedItem(actor, item))) {
    if (item.type === "duelingStyle") {
      const sheet = actor.sheet, action = sheet?.options?.actions?.toggleActiveStyle;
      const handler = typeof action === "function" ? action : action?.handler;
      if (typeof handler === "function") actions.push({ id: `style:${item.id}`, label: `Toggle ${item.name}`, active: item.system.active === true,
        invoke: () => handler.call(sheet, {}, { closest: () => ({ dataset: { itemId: item.id } }) }) });
    }
    if (["maneuver", "action"].includes(item.type) && canCheck(item) && typeof actor.system.rollManeuver === "function") actions.push({
      id: `maneuver:${item.id}`, label: item.name, roll: true, invoke: () => actor.system.rollManeuver(item,
        item.type === "action" ? { title: globalThis.game.i18n.format("HONOR_INTRIGUE.Chat.Roll.Flavor.Action", { action: item.name }) } : {}) });
    if (["weapon", "action"].includes(item.type) && typeof item.system.rollDamage === "function") actions.push({ id: `damage:${item.id}`, label: `${item.name}: Damage`, roll: true, invoke: () => item.system.rollDamage() });
    if (item.type === "weapon" && item.system.loadActions?.needed > item.system.loadActions?.spent) actions.push({ id: `reload:${item.id}`, label: `Reload ${item.name}`,
      invoke: () => item.update({ "system.loadActions.spent": item.system.loadActions.spent + 1 }) });
  }
  if (typeof actor.system.rollManeuver === "function") for (const row of weaponManeuvers(actor)) {
    actions.push({ id: row.id, label: `${row.weapon.name}: ${row.maneuver?.name ?? "Maneuver"}`, roll: true, invoke: async assertCurrent => {
      const maneuver = row.maneuver ?? await globalThis.fromUuid?.(row.uuid);
      assertCurrent();
      if (!maneuver || maneuver.type !== "maneuver" || maneuver.visible === false || !canCheck(maneuver)) throw new Error("This maneuver is unavailable.");
      if (row.weapon.system.loadActions?.needed > 0 && !row.weapon.system.isLoaded) globalThis.ui?.notifications?.warn?.("HONOR_INTRIGUE.Actor.Sheet.Labels.Maneuvers.UseUnloaded", { localize: true });
      const result = await actor.system.rollManeuver(maneuver, { system: { relatedItemUuid: row.weapon.uuid } });
      if (result && row.weapon.system.loadActions?.needed > 0) await row.weapon.update({ "system.loadActions.spent": 0 });
      return result;
    } });
  }
  return actions;
}
export function intrigueEdits(actor) {
  return [resourceEdit(actor, "lifeblood", "system.lifeblood.value", { min: actor.system.lifeblood?.min ?? -6, max: actor.system.lifeblood?.max }),
    resourceEdit(actor, "fortune", "system.fortune.value"), resourceEdit(actor, "advantage", "system.advantage", { max: 10 }),
    resourceEdit(actor, "composure", "system.composure", { max: 3 }),
    ...(actor.system.arcanePower?.career ? [resourceEdit(actor, "arcane-power", "system.arcanePower.value", { max: actor.system.arcanePower.max })] : []),
    ...inventoryEdits(actor, physicalTypes, item => typeof item.update === "function" ? [{ id: `equipped:${item.id}`, value: item.system.carriedPosition, min: 0, max: 2,
      choices: ["Dropped", "Held", "Stowed"].map((label, value) => ({ label, value })), write: value => item.update({ "system.carriedPosition": value }) }] : [])];
}
