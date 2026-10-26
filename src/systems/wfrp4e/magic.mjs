import { ownedWarhammerItem } from "./items.mjs";

/** Native 10.1.2 lore is an array in both editions; templates coerce single entries. */
export function spellForActor(actor, id, context) {
  const item = ownedWarhammerItem(actor, id, "spell");
  try {
    const lore = item?.system?.lore?.value;
    const valid = context && Array.isArray(lore) && lore.length > 0 && lore.every(key => typeof key === "string" && key.length > 0);
    return valid && Number.isFinite(item.system.cn?.value) ? item : null;
  } catch { return null; }
}

export function castChannelSheet(actor) {
  try {
    const sheet = actor.sheet;
    return sheet?.actor === actor && typeof sheet.castOrChannelPrompt === "function" ? sheet : null;
  } catch { return null; }
}

/** Ask the native model for Winds using only spells this profile may expose. */
export function magicWinds(actor, context) {
  if (!context.use5e) return [];
  try {
    const channelling = actor.system.status.channelling;
    if (typeof channelling.getWinds !== "function" || !Number.isFinite(channelling.value)) return [];
    const spells = Array.from(actor.items?.contents ?? actor.items ?? []).filter(item => spellForActor(actor, String(item.id), context) === item);
    const winds = channelling.getWinds(spells);
    return Object.entries(winds).filter(([key, wind]) => /^[a-zA-Z0-9_!-]{1,128}$/u.test(key)
      && Object.hasOwn(channelling.winds ?? {}, key) && typeof wind?.label === "string" && wind.label.trim())
      .map(([key, wind]) => ({ key, label: wind.label }));
  } catch { return []; }
}
