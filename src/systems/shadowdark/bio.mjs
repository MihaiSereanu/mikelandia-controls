import { isShadowdarkItemTracker } from "./context.mjs";
import { localizeFoundry } from "../../foundry/settings/localization.mjs";

const caches = new WeakMap();
const listeners = new Set();

export function watchBio(scope, notify) {
  listeners.add(notify);
  scope.own(() => listeners.delete(notify));
  for (const hook of ["updateItem", "deleteItem"]) scope.hook(hook, document => {
    caches.get(globalThis.fromUuid)?.delete(document?.uuid);
  });
}

function resolveLink(uuid, actor) {
  if (typeof uuid !== "string" || !uuid.trim()) return null;
  let document;
  try { document = (globalThis.fromUuidSync ?? globalThis.foundry?.utils?.fromUuidSync)?.(uuid); } catch { /* Uncached compendium link. */ }
  if (document) return document;
  const resolve = globalThis.fromUuid;
  if (typeof resolve !== "function") return null;
  let cache = caches.get(resolve);
  if (!cache) caches.set(resolve, cache = new Map());
  let entry = cache.get(uuid);
  if (!entry) {
    entry = { document: null, actors: new Set(), pending: true };
    cache.set(uuid, entry);
    void Promise.resolve().then(() => resolve(uuid)).then(result => {
      entry.document = result;
    }).catch(() => {}).finally(() => {
      entry.pending = false;
      for (const source of entry.actors) for (const notify of listeners) notify(source);
      entry.actors.clear();
    });
  }
  if (entry.pending) entry.actors.add(actor.uuid);
  return entry.document;
}

export function shadowdarkBio(actor) {
  if (actor?.type !== "Player" || isShadowdarkItemTracker(actor)) return [];
  const name = (uuid, type) => {
    const document = resolveLink(uuid, actor);
    return document?.type === type && document.visible !== false ? String(document.name ?? "").trim() : "";
  };
  const languages = Array.isArray(actor.system.languages) ? actor.system.languages : [];
  return [
    ["languages", "SHADOWDARK.sheet.player.languages", "Languages", languages.map(uuid => name(uuid, "Language")).filter(Boolean).sort((a, b) => a.localeCompare(b)).join(", ")],
    ["deity", "SHADOWDARK.sheet.player.deity.label", "Deity", name(actor.system.deity, "Deity")],
    ["background", "SHADOWDARK.sheet.player.background.label", "Background", name(actor.system.background, "Background")]
  ].filter(([, , , text]) => text).map(([id, key, label, text]) => ({
    id, kind: "text", label: localizeFoundry(key, label), text, rows: []
  }));
}
