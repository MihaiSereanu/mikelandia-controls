import { migrateBrowserBranding, registerBrandingMigration, migrateWorldBranding } from "./foundry/compatibility/branding-migration.mjs";
import { installWfrpOpposedMomentum } from "./foundry/compatibility/wfrp-opposed-momentum.mjs";
import { installClientUpgradeCleanup } from "./foundry/compatibility/client-upgrade-cleanup.mjs";
import { createTaskScope } from "./kernel/lifecycle/task-scope.mjs";
import { classifyRuntimeMode, createActivationPolicyResolver } from "./foundry/session/activation-policy.mjs";
import { readPreferences, registerModePreference, registerPreferences } from "./foundry/settings/preferences.mjs";

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
  let upgradeCleanup;
  const installUpgradeHook = () => Hooks.once("init", () => {
    registerBrandingMigration();
    upgradeCleanup = installClientUpgradeCleanup(scope);
  });
  const registerNativeClient = () => Hooks.once("init", () => registerPreferences({
    mobileDevice, isMobilePresentation: () => false,
    onPresentationChange: () => { if (game.ready) window.location.reload(); }
  }));
  if (migrated && mobileDevice) {
    // libWrapper manages prototype initialize through accessors. Never assign
    // that property or capture its proxy and replace its underlying target.
    // Await native creation, then shadow initialize on this one instance.
    const GameClass = globalThis.foundry?.Game ?? globalThis.Game;
    const createDescriptor = Object.getOwnPropertyDescriptor(GameClass, "create");
    const originalCreate = GameClass.create;
    if (typeof originalCreate !== "function") throw new Error("Foundry's game creation boundary is unavailable.");
    const restoreCreate = () => {
      if (GameClass.create !== create) return;
      if (createDescriptor) Object.defineProperty(GameClass, "create", createDescriptor);
      else delete GameClass.create;
    };
    const create = async function (...args) {
      restoreCreate();
      const instance = await originalCreate.apply(this, args);
      const initializeDescriptor = Object.getOwnPropertyDescriptor(instance, "initialize");
      const originalInitialize = instance.initialize;
      const restoreInitialize = () => {
        if (instance.initialize !== initialize) return;
        if (initializeDescriptor) Object.defineProperty(instance, "initialize", initializeDescriptor);
        else delete instance.initialize;
      };
      const initialize = async function (...initializeArgs) {
        try {
          // Native assigns global game after create resolves. Its registered
          // client mode is authoritative; the bootstrap cache is only a hint.
          registerModePreference({ mobileDevice });
          if (createActivationPolicyResolver().resolve(readPreferences()).active) {
            const styles = document.createElement("link");
            styles.rel = "stylesheet";
            styles.href = new URL("../assets/mobile.css", import.meta.url).href;
            document.head.append(styles);
            const { installMobileClient } = await import("./mobile-entry.mjs");
            installMobileClient({ getUpgradeCleanup: () => upgradeCleanup, whenSharedReady: () => sharedReady });
          } else registerNativeClient();
        } catch (error) {
          console.error("Mikelandia Controls | Mobile interface could not load", error);
          registerNativeClient();
          Hooks.once("ready", () => ui.notifications?.error?.("Mikelandia Controls could not load. Reload to retry."));
        }
        installUpgradeHook();
        restoreInitialize();
        return originalInitialize.apply(this, initializeArgs);
      };
      Object.defineProperty(instance, "initialize", { configurable: true, writable: true, value: initialize });
      scope.own(restoreInitialize);
      return instance;
    };
    Object.defineProperty(GameClass, "create", { configurable: true, writable: true, value: create });
    scope.own(restoreCreate);
  } else {
    registerNativeClient();
    installUpgradeHook();
  }
}
