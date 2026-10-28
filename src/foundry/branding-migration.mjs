export const MODULE_ID = "mikelandia-controls";
const LEGACY_ID = "ve-mobile";
const MIGRATION_KEY = "brandingMigrationVersion";
const STORAGE_MARKER = `${MODULE_ID}:branding-migration:v1`;

const record = value => value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const optionalStorage = read => { try { return read(); } catch { return undefined; } };
const clone = value => value === undefined ? undefined : structuredClone(value);

function currentKey(key) {
  return key.replace(LEGACY_ID, MODULE_ID).replace(/\.protectVeStyling$/u, ".protectMcStyling");
}

/** Copy once: retained old receipts must never resurrect a consumed new receipt. */
export function migrateBrowserBranding({ localStorage = optionalStorage(() => globalThis.localStorage), sessionStorage = optionalStorage(() => globalThis.sessionStorage) } = {}) {
  let copied = 0;
  for (const storage of [localStorage, sessionStorage]) {
    if (!storage) continue;
    let keys;
    try {
      if (storage.getItem(STORAGE_MARKER) === "1") continue;
      keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    } catch { continue; } // Storage disabled entirely: retain normal browser fallbacks.
    for (const key of keys) {
      if (!key?.startsWith(`${LEGACY_ID}.`) && !key?.startsWith(`${LEGACY_ID}:`)) continue;
      const destination = currentKey(key);
      if (storage.getItem(destination) !== null) continue;
      const value = storage.getItem(key);
      if (value === null) continue;
      storage.setItem(destination, value);
      if (storage.getItem(destination) !== value) throw new Error("Could not verify migrated browser preferences.");
      copied++;
    }
    storage.setItem(STORAGE_MARKER, "1");
    if (storage.getItem(STORAGE_MARKER) !== "1") throw new Error("Could not finish browser preference migration.");
  }
  return { copied };
}

function mergeMissing(legacy, current) {
  if (current !== undefined && !record(current)) return clone(current);
  if (!record(legacy)) return current === undefined ? clone(legacy) : clone(current);
  return Object.fromEntries([...new Set([...Object.keys(legacy), ...Object.keys(current ?? {})])].map(key => [
    key, Object.hasOwn(current ?? {}, key) ? mergeMissing(legacy[key], current[key]) : clone(legacy[key])
  ]));
}

function rawFlags(document) {
  return document?.toObject?.()?.flags ?? document?._source?.flags ?? document?.flags ?? {};
}

/** Preserve imported/compendium flags and player reads before the first GM migration. */
export function readMigratedFlags(actor) {
  const flags = actor?.flags ?? {};
  const base = mergeMissing(flags[LEGACY_ID], flags[MODULE_ID]);
  const token = actor?.token;
  if (!token || token.actorLink) return base;
  const delta = rawFlags(token.delta ?? { flags: token._source?.delta?.flags ?? token._source?.actorData?.flags });
  if (!Object.hasOwn(delta, LEGACY_ID) && !Object.hasOwn(delta, MODULE_ID)) return base;
  // Raw token overrides must win over newly migrated flags inherited from its base Actor.
  return mergeMissing(base, mergeMissing(delta[LEGACY_ID], delta[MODULE_ID]));
}

export function registerBrandingMigration(game = globalThis.game) {
  game.settings.register(MODULE_ID, MIGRATION_KEY, { scope: "world", config: false, type: Number, default: 0 });
}

function missingFlagPatch(flags) {
  const legacy = flags?.[LEGACY_ID], current = flags?.[MODULE_ID];
  if (!record(legacy) || (current !== undefined && !record(current))) return {};
  const patch = {};
  const visit = (source, target, prefix) => {
    for (const [key, value] of Object.entries(source)) {
      if (key.includes(".") || ["__proto__", "constructor", "prototype"].includes(key)) throw new Error("A legacy flag needs manual migration.");
      const path = `${prefix}.${key}`;
      if (Object.hasOwn(target ?? {}, key)) {
        if (record(value) && record(target[key])) visit(value, target[key], path);
      } else if (record(value) && Object.keys(value).length) visit(value, undefined, path);
      else patch[path] = clone(value);
    }
  };
  visit(legacy, current, `flags.${MODULE_ID}`);
  return patch;
}

async function copyDocumentFlags(document, flags) {
  const patch = missingFlagPatch(flags);
  if (!Object.keys(patch).length) return false;
  if (typeof document?.update !== "function") throw new Error("An unlinked token's flags need manual migration.");
  const expected = Object.entries(clone(patch));
  await document.update(patch);
  const saved = rawFlags(document);
  for (const [path, value] of expected) {
    const actual = path.split(".").slice(1).reduce((parent, key) => parent?.[key], saved);
    if (JSON.stringify(actual) !== JSON.stringify(value)) throw new Error(`Could not verify migrated document flags for ${document.uuid ?? document.id ?? "document"} at ${path}.`);
  }
  return true;
}

/** One active GM copies shared flags; originals and existing new values remain intact. */
export async function migrateWorldBranding(game = globalThis.game, onProgress = () => {}) {
  if (!game?.user?.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) return { migrated: 0 };
  if (game.settings.get(MODULE_ID, MIGRATION_KEY) >= 1) return { migrated: 0 };
  let migrated = 0;
  for (const actor of game.actors ?? []) {
    if (await copyDocumentFlags(actor, rawFlags(actor))) migrated++;
    onProgress();
  }
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (token.actorLink) continue;
      const flags = rawFlags(token.delta ?? { flags: token._source?.delta?.flags ?? token._source?.actorData?.flags });
      if (await copyDocumentFlags(token.delta, flags)) migrated++;
      onProgress();
    }
  }
  if (game.modules?.get?.("force-client-settings")?.active) {
    const forced = game.settings.get("force-client-settings", "forced");
    const next = { ...forced };
    for (const [key, value] of Object.entries(forced ?? {})) {
      const destination = currentKey(key);
      if (key.startsWith(`${LEGACY_ID}.`) && game.settings.settings.has(destination) && !Object.hasOwn(next, destination)) next[destination] = clone(value);
    }
    if (Object.keys(next).length !== Object.keys(forced ?? {}).length) await game.settings.set("force-client-settings", "forced", next);
  }
  await game.settings.set(MODULE_ID, MIGRATION_KEY, 1);
  return { migrated };
}
