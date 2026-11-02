import { carriedItem, isShadowdarkItemTracker } from "./context.mjs";

// Compendium links require asynchronous resolution even though profile reads are synchronous.
const caches = new WeakMap();
const listeners = new Set();
export function watchItemSpells(scope, notify) {
  listeners.add(notify);
  scope.own(() => listeners.delete(notify));
  for (const hook of ["updateItem", "deleteItem"]) scope.hook(hook, document => {
    const cache = caches.get(globalThis.fromUuid);
    cache?.delete(document?.uuid);
  });
}
function resolveSpell(uuid, actor) {
  if (typeof uuid !== "string" || !uuid) return null;
  let document;
  try { document = (globalThis.fromUuidSync ?? globalThis.foundry?.utils?.fromUuidSync)?.(uuid); } catch { /* Uncached compendium link. */ }
  if (document?.type === "Spell" && document.system?.isSpell === true) return document;
  const resolve = globalThis.fromUuid;
  if (typeof resolve !== "function") return null;
  let cache = caches.get(resolve);
  if (!cache) caches.set(resolve, cache = new Map());
  let entry = cache.get(uuid);
  if (!entry) {
    entry = { document: null, actors: new Set(), pending: true };
    cache.set(uuid, entry);
    void Promise.resolve().then(() => resolve(uuid)).then(result => {
      entry.document = result?.type === "Spell" && result.system?.isSpell === true ? result : null;
    }).catch(() => {}).finally(() => {
      entry.pending = false;
      for (const source of entry.actors) for (const notify of listeners) notify(source);
      entry.actors.clear();
    });
  }
  if (entry.pending) entry.actors.add(actor.uuid);
  return entry.document;
}
export function itemSpells(actor) {
  const rows = [];
  if (actor?.type !== "Player" || isShadowdarkItemTracker(actor)) return rows;
  for (const item of actor.items?.contents ?? actor.items ?? []) {
    if (!["Wand", "Scroll"].includes(item.type) || !carriedItem(item, actor) || (item.type === "Wand" && item.system.broken === true)) continue;
    const links = item.type === "Wand" ? item.system.spells : [{ uuid: item.system.spellUuid, lost: false }];
    if (!Array.isArray(links)) continue;
    links.forEach((link, index) => {
      const spell = resolveSpell(link?.uuid, actor);
      if (!spell || spell.visible === false) return;
      const lost = link.lost === true || spell.system.lost === true;
      rows.push({ id: `${item.id}-${index}`, type: item.type, name: spell.name, uuid: spell.uuid, item, spell, index,
        system: { tier: spell.system.tier, description: spell.system.description, lost } });
    });
  }
  return rows;
}
export function itemSpellRevision(row, actor) {
  return JSON.stringify([row.item.uuid, row.item.system, row.spell.uuid, row.spell.name, row.spell.system,
    actor.system.canUseMagicItems]);
}
