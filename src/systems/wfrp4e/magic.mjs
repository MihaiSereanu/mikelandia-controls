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

/** The native 4e chooser forwards context, but not application options. */
export async function cancellableCastOrChannel(actor, spell) {
  const hooks = globalThis.Hooks;
  const Dialog = globalThis.warhammer?.apps?.WarhammerRollDialogV2;
  const listeners = new Map();
  const listener = hooks && typeof Dialog === "function" ? hooks.on("renderApplicationV2", app => {
    if (!(app instanceof Dialog) || app.actor !== actor || listeners.has(app)) return;
    // ApplicationV2 freezes options. Observe its native close event instead.
    const close = () => { if (!app.submitted) app.resolve?.(); };
    app.addEventListener("close", close, { once: true });
    listeners.set(app, close);
  }) : null;
  try { return await castChannelSheet(actor).castOrChannelPrompt(spell); }
  finally {
    if (listener !== null) hooks.off("renderApplicationV2", listener);
    for (const [app, close] of listeners) app.removeEventListener("close", close);
  }
}
