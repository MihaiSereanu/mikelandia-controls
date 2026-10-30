import { migrateBrowserBranding, registerBrandingMigration, migrateWorldBranding } from "./foundry/compatibility/branding-migration.mjs";
import { installWfrpOpposedMomentum } from "./foundry/compatibility/wfrp-opposed-momentum.mjs";
import { installClientUpgradeCleanup } from "./foundry/compatibility/client-upgrade-cleanup.mjs";
import { createTaskScope } from "./kernel/lifecycle/task-scope.mjs";
import { classifyRuntimeMode, createActivationPolicyResolver } from "./foundry/session/activation-policy.mjs";
import { readPreferences, registerPreferences } from "./foundry/settings/preferences.mjs";

if (/\/game\/?$/.test(window.location.pathname)) {
  const scope = createTaskScope("shared-compatibility");
  scope.listen(window, "pagehide", () => scope.dispose(), { once: true });
  scope.hook("i18nInit", () => {
    if (game.system.id !== "wfrp4e") return;
    game.i18n.translations["Primary Arm"] = "Right Arm";
    game.i18n.translations["Secondary Arm"] = "Left Arm";
  });
  Hooks.once("setup", () => installWfrpOpposedMomentum(scope));
  const sharedReady = new Promise(resolve => Hooks.once("ready", async () => {
    try { await migrateWorldBranding(game); }
    catch (error) {
      console.error("Mikelandia Controls | Legacy data migration is incomplete; originals are retained.", error);
      ui.notifications?.warn?.("Mikelandia Controls could not finish migrating old data. Original values are retained; reload to retry.");
    }
    resolve();
  }));
  let migrated = true;
  try { migrateBrowserBranding(); }
  catch (error) {
    migrated = false;
    console.error("Mikelandia Controls | Browser preferences could not finish migrating; originals are retained.", error);
    Hooks.once("ready", () => ui.notifications?.error?.("Mikelandia Controls could not copy saved browser settings. Enable browser storage and reload; original settings are retained."));
  }
  const mobileDevice = classifyRuntimeMode() !== "native";
  const mobile = migrated && mobileDevice && createActivationPolicyResolver().resolve(readPreferences()).active;
  let upgradeCleanup;
  const installUpgradeHook = () => Hooks.once("init", () => {
    registerBrandingMigration();
    upgradeCleanup = installClientUpgradeCleanup(scope);
  });
  const registerNativeClient = () => Hooks.once("init", () => registerPreferences({
    mobileDevice, isMobilePresentation: () => false,
    onPresentationChange: () => { if (game.ready) window.location.reload(); }
  }));
  if (mobile) {
    // Load the companion and its styles only on an active phone/tablet client.
    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = new URL("../assets/mobile.css", import.meta.url).href;
    document.head.append(styles);
    // Foundry creates game after DOMContentLoaded and does not await package
    // top-level await. Gate its prototype before importing the mobile graph,
    // then install hooks with the real Game instance available, before init.
    const target = (globalThis.foundry?.Game ?? globalThis.Game)?.prototype;
    const original = target?.initialize;
    if (typeof original !== "function") throw new Error("Foundry's game initialization boundary is unavailable.");
    const loading = import("./mobile-entry.mjs").then(module => ({ module }), error => ({ error }));
    const guarded = async function (...args) {
      try {
        const result = await loading;
        if (result.error) throw result.error;
        result.module.installMobileClient({ getUpgradeCleanup: () => upgradeCleanup, whenSharedReady: () => sharedReady });
      } catch (error) {
        console.error("Mikelandia Controls | Mobile interface could not load", error);
        registerNativeClient();
        Hooks.once("ready", () => ui.notifications?.error?.("Mikelandia Controls could not load. Reload to retry."));
      }
      installUpgradeHook();
      if (target.initialize === guarded) target.initialize = original;
      return original.apply(this, args);
    };
    target.initialize = guarded;
    scope.own(() => { if (target.initialize === guarded) target.initialize = original; });
  } else {
    registerNativeClient();
    installUpgradeHook();
  }
}
