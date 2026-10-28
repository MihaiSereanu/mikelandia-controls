import { KEYS, MODULE_ID } from "../settings/preferences.mjs";
import { restoreLocalSetting } from "./client-setting-restoration.mjs";

// Retire graphics changes saved by earlier Mikelandia Controls versions. This module
// restores client preferences only; it never applies a graphics profile.
export function createLegacyClientRestoration({ getGame = () => globalThis.game } = {}) {
  const allowed = new Set(["core.performanceMode", "core.maxFPS", "core.pixelRatioResolutionScaling", "core.mipmap", "core.lightAnimation"]);
  const saved = () => getGame().settings.get(MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT) ?? {};
  const entries = () => {
    const value = saved();
    if (!Object.keys(value).length) return [];
    const record = entry => entry && typeof entry === "object" && !Array.isArray(entry);
    if (!record(value.original) || !record(value.applied) || ![1, 2, 3, 4].includes(Number(value.schemaVersion))) throw new Error("The saved client preferences require recovery.");
    const result = Object.keys(value.applied).map(key => {
      if (!allowed.has(key) || !Object.hasOwn(value.original, key)) throw new Error("The saved client preferences are invalid.");
      return [key, value.original[key]];
    });
    if (typeof value.noCanvasOriginal === "boolean") result.push(["core.noCanvas", value.noCanvasOriginal]);
    return result;
  };
  return Object.freeze({
    pendingRestoration: () => entries().map(([key]) => key),
    async restoreForDesktop({ notify = false } = {}) {
      const pending = entries();
      for (const [key, value] of pending) await restoreLocalSetting(getGame(), key, value, { notify });
      if (Object.keys(saved()).length) await getGame().settings.set(MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT, {});
      return Object.freeze({ restored: pending.map(([key]) => key), requiresReload: pending.length > 0 });
    },
    async beginMobileSession() { return this.restoreForDesktop(); }
  });
}
