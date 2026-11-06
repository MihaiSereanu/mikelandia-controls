import { isShadowdarkItemTracker } from "./context.mjs";
import { inventoryEdits } from "./inventory.mjs";

/** Supplies have no native category; use their inventory names. */
export function carriedSupplies(actor) {
  return Array.from(actor.items?.contents ?? actor.items ?? []).filter(item => item.parent === actor
    && item.visible !== false && item.type === "Basic" && item.system?.isPhysical === true
    && item.system.isIdentified === true && item.system.stashed === false
    && /^(?:rations?|waterskin)$/iu.test(String(item.name).trim())
    && Number.isSafeInteger(item.system.quantity) && item.system.quantity >= 0);
}

export const shadowdarkParty = Object.freeze({
  supplies: true,
  isPC: actor => actor.type === "Player" && !isShadowdarkItemTracker(actor),
  readMember(actor, user) {
    const edits = inventoryEdits(actor, globalThis.game, user);
    let slots = null;
    try {
      const used = actor.system.getSlotUsage?.().total, max = actor.system.slots;
      if (Number.isFinite(used) && Number.isFinite(max)) slots = { used, max };
    } catch { /* Native slot calculation can be unavailable during preparation. */ }
    return { slots, supplies: carriedSupplies(actor).map(item => ({ id: String(item.id), name: String(item.name),
      kind: /^waterskin$/iu.test(item.name.trim()) ? "waterskins" : "rations", quantity: item.system.quantity,
      edit: edits.find(edit => edit.id === `quantity:${item.id}`) ?? null })) };
  }
});
