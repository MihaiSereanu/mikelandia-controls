import { KEYS, MODULE_ID } from "../settings/preferences.mjs";
import { restoreLocalSetting } from "./client-setting-restoration.mjs";
import { createLegacyClientRestoration } from "./legacy-client-restoration.mjs";

const CAROLINGIAN_RECEIPT = "mikelandia-controls:module-compatibility:v1:crlngn-ui";
const OLD_KEYS = [KEYS.GRAPHICS_SETTINGS_SNAPSHOT, KEYS.THEME_SETTINGS_SNAPSHOT,
  KEYS.PENDING_DESKTOP_RESTORE, KEYS.GRAPHICS_PROFILE_TRANSACTION, KEYS.MOBILE_ENTRY_HANDOFF];
const record = value => value && typeof value === "object" && !Array.isArray(value);

/** Retire existing overrides once; ordinary clients have no startup interception. */
export function installClientUpgradeCleanup(scope, { getGame = () => globalThis.game,
  getStorage = () => globalThis.localStorage,
  registrationTimeoutMs = 5000,
  notify = error => globalThis.ui?.notifications?.warn?.(`Mikelandia Controls could not restore saved client preferences. Saved values are retained for the next reload. ${error.message}`),
  requestReload = () => {
    const reload = globalThis.foundry?.utils?.debouncedReload;
    if (typeof reload === "function") reload();
    else globalThis.window?.location?.reload?.();
  }
} = {}) {
  const game = getGame();
  let initial, receipt, storage, failure;
  const read = key => game.settings.get(MODULE_ID, key) ?? {};
  try {
    initial = Object.fromEntries(OLD_KEYS.map(key => [key, read(key)]));
    storage = getStorage();
    receipt = storage?.getItem?.(CAROLINGIAN_RECEIPT) ?? null;
  } catch (error) { failure = error; }
  const pending = failure || receipt !== null || Object.values(initial ?? {}).some(value => Object.keys(value).length);
  if (!pending) return Object.freeze({ whenIdle: () => Promise.resolve(Object.freeze({ ok: true, changed: false, reloadPending: false })) });

  let releaseCanvas;
  const nativeRestored = new Promise(resolve => { releaseCanvas = resolve; });
  const cleanup = Promise.resolve().then(async () => {
    if (failure) throw failure;
    const graphics = createLegacyClientRestoration({ getGame });
    graphics.pendingRestoration(); // Validate before restoring any owned values.
    const theme = initial[KEYS.THEME_SETTINGS_SNAPSHOT];
    if (Object.keys(theme).length && (theme.captured !== true || !record(theme.original))) throw new Error("The saved interface theme snapshot is invalid.");
    let carolingian = null;
    if (receipt !== null) {
      carolingian = JSON.parse(receipt);
      if (carolingian?.version !== 1 || typeof carolingian.previousValue !== "boolean") throw new Error("The saved Carolingian UI preference is invalid.");
    }
    const restored = await graphics.restore({ retire: false });
    let changed = restored.restored.length > 0;
    if (theme.captured === true) {
      await restoreLocalSetting(game, "core.uiConfig", theme.original, { notify: false });
      changed = true;
    }
    // Native graphics restoration must finish before canvas starts. Carolingian
    // registers settings in an asynchronous init import; canvas need not wait.
    releaseCanvas();
    let reloadPending = false;
    if (carolingian && game.modules?.get?.("crlngn-ui")?.active) {
      const key = "crlngn-ui.disable-ui";
      const deadline = Date.now() + registrationTimeoutMs;
      while (!game.settings.settings?.has?.(key) && !scope.disposed && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now()))));
      }
      if (scope.disposed) throw new Error("Client preference restoration was interrupted.");
      const config = game.settings.settings?.get?.(key);
      const client = game.settings.storage?.get?.("client");
      if (config?.scope !== "client" || !client?.getItem || !client?.setItem) throw new Error("Carolingian UI's client-only preferences are unavailable.");
      const raw = client.getItem(key);
      const current = raw === null || raw === undefined ? config.default : JSON.parse(raw);
      if (current !== carolingian.previousValue) {
        client.setItem(key, JSON.stringify(carolingian.previousValue));
        if (JSON.parse(client.getItem(key)) !== carolingian.previousValue) throw new Error("Carolingian UI's restored client preference could not be verified.");
        changed = reloadPending = true;
      }
    }
    // Retire receipts only after every applicable native preference is verified.
    for (const key of OLD_KEYS) if (Object.keys(initial[key]).length) await game.settings.set(MODULE_ID, key, {});
    if (carolingian && game.modules?.get?.("crlngn-ui")?.active) storage.removeItem(CAROLINGIAN_RECEIPT);
    if (reloadPending && !scope.disposed) requestReload();
    return Object.freeze({ ok: true, changed, reloadPending });
  }).catch(error => {
    releaseCanvas();
    const report = () => { if (!scope.disposed) notify(error); };
    if (game.ready) report();
    else scope.hook("ready", report);
    return Object.freeze({ ok: false, changed: false, reloadPending: false, error });
  });

  const original = game.initializeCanvas;
  if (typeof original === "function") {
    const guarded = async function (...args) {
      await nativeRestored;
      if (game.initializeCanvas === guarded) game.initializeCanvas = original;
      return original.apply(this, args);
    };
    game.initializeCanvas = guarded;
    scope.own(() => { if (game.initializeCanvas === guarded) game.initializeCanvas = original; });
  }
  return Object.freeze({ whenIdle: () => cleanup });
}
