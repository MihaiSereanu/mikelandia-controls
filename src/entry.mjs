import { migrateBrowserBranding, registerBrandingMigration, migrateWorldBranding } from "./foundry/compatibility/branding-migration.mjs";
import { createSystemIntegrationResolver } from "./systems/registry.mjs";
import { localizeFoundry } from "./foundry/settings/localization.mjs";
import { createControlsGuideGateway } from "./foundry/settings/controls-guide-gateway.mjs";
import { createControlsGuide } from "./ui/help/controls-guide.mjs";
import { createAppKernel } from "./kernel/app-kernel.mjs";
import { createSignalStore } from "./kernel/state/signal-store.mjs";
import { initialAppState, reduceAppState } from "./kernel/state/app-state.mjs";
import { createActivationPolicyResolver, createSessionActivationOverride } from "./foundry/session/activation-policy.mjs";
import {
  createFoundryPreferencesGateway,
  KEYS,
  MODULE_ID,
  readKeepScreenAwake,
  readLocale,
  readLoggingLevel,
  readProtectMcStyling,
  readPreferences,
  registerPreferences
} from "./foundry/settings/preferences.mjs";
import { createFoundrySessionGateway } from "./foundry/session/session-gateway.mjs";
import { enableMobilePresentation, enableMcStyleAuthority } from "./foundry/presentation/mobile-presentation.mjs";
import { createFoundryCommandGateway } from "./foundry/commands/command-gateway.mjs";
import { createRollTimingGateway } from "./foundry/media/roll-timing.mjs";
import { enableMobileDiceGuard } from "./foundry/media/mobile-dice-guard.mjs";
import { enableMobileAudio } from "./foundry/media/mobile-audio.mjs";
import { resolveMobileGraphicsPolicy } from "./foundry/presentation/mobile-graphics-policy.mjs";
import { createTaskScope } from "./kernel/lifecycle/task-scope.mjs";
import { createFoundryNativeChatGateway } from "./foundry/chat/native-chat-gateway.mjs";
import { createFoundryActionSessionGateway } from "./foundry/commands/action-session-gateway.mjs";
import { createBootstrapWakePreference, createScreenWakeLockController } from "./foundry/presentation/screen-wake-lock.mjs";
import { enableMobileConnectionGrace } from "./foundry/session/connection-grace.mjs";
import { createMobileBootstrap, navigationStartAt, suppressBootstrapSoftwareKeyboard } from "./ui/bootstrap/bootstrap-loader.mjs";
import { createBootstrapWatchdog } from "./kernel/lifecycle/bootstrap-watchdog.mjs";
import { createMobileDiagnostics } from "./foundry/diagnostics/mobile-diagnostics.mjs";
import { createArmorClassGateway } from "./foundry/actors/armor-class-gateway.mjs";
import { createFoundryCombatGateway } from "./foundry/combat/combat-gateway.mjs";
import { createFoundryTargetingGateway } from "./foundry/combat/targeting-gateway.mjs";
import { createFoundryAuthoritativeSessionGateway } from "./foundry/session/authoritative-session-gateway.mjs";
import { createClientLoadTimingGateway } from "./foundry/diagnostics/client-load-timing-gateway.mjs";
import { createConnectionGeneration } from "./kernel/connection/connection-generation.mjs";
import { createFoundryThemeGateway } from "./foundry/settings/theme-gateway.mjs";
import { createFoundrySettingsCompatibilityGateway } from "./foundry/settings/settings-compatibility-gateway.mjs";
import { createFoundryDesktopSettingsVisibilityGateway } from "./foundry/settings/desktop-settings-visibility-gateway.mjs";
import { createFoundrySessionStatusGateway } from "./foundry/session/session-status-gateway.mjs";
import { createFoundryActiveEffectContextGateway } from "./foundry/actors/active-effect-context-gateway.mjs";
import { createPerformanceObserver } from "./kernel/lifecycle/performance-observer.mjs";
import { createMobilePerformanceAuthority, isMobilePerformanceAuthorityActive } from "./kernel/presentation/presentation-mode-authority.mjs";
import { createMobileStartupGateway } from "./foundry/session/mobile-startup-gateway.mjs";
import { showDesktopRestorationRecovery } from "./ui/bootstrap/desktop-restoration-recovery.mjs";
import { createFoundryBiographyGateway } from "./foundry/actors/biography-gateway.mjs";
import { enableMobileJournalReader } from "./foundry/journals/mobile-journal-reader-gateway.mjs";
import { createChatDomGateway, installMcChatWindowClass } from "./foundry/chat/chat-dom-gateway.mjs";
import { createFoundryMobileBackGateway } from "./foundry/presentation/mobile-back-gateway.mjs";
import { createActorEditorGateway } from "./foundry/actors/actor-editor-gateway.mjs";
import { createMobileModuleCompatibilityGateway } from "./foundry/compatibility/mobile-module-compatibility.mjs";
import { createWfrpThemePolicy } from "./foundry/compatibility/wfrp-theme-policy.mjs";

import { createLegacyClientRestoration } from "./foundry/compatibility/legacy-client-restoration.mjs";
const isGamePage = /\/game\/?$/.test(window.location.pathname);

const migrateBrowserState = () => {
  try { migrateBrowserBranding(); return true; }
  catch (error) {
    console.error("Mikelandia Controls | Browser preferences could not finish migrating; originals are retained.", error);
    Hooks.once("ready", () => ui.notifications.error("Mikelandia Controls could not copy saved browser settings. Enable browser storage and reload; original settings are retained."));
    return false;
  }
};

if (isGamePage && migrateBrowserState()) {
  const getSystemIntegration = createSystemIntegrationResolver();
  const fullLoadStartedAt = navigationStartAt();
  const loadTimingGateway = createClientLoadTimingGateway();
  const sessionActivation = createSessionActivationOverride();
  const activationPolicy = createActivationPolicyResolver();
  let mobileMutationReady = false;
  let startupBlocked = false;
  const readRequestedPolicy = () => sessionActivation.apply(activationPolicy.resolve(readPreferences()));
  const readPolicy = () => {
    const requested = readRequestedPolicy();
    return { ...requested, active: requested.active && !startupBlocked,
      canvasAvailable: false, sessionReady: globalThis.game?.ready === true && !startupBlocked };
  };
  const mobilePerformanceAuthority = createMobilePerformanceAuthority(readPolicy, () => mobileMutationReady && !startupBlocked);
  const preferencesGateway = createFoundryPreferencesGateway({ getSystemIntegration });
  const settingsCompatibilityGateway = createFoundrySettingsCompatibilityGateway();
  const controlsGuideGateway = createControlsGuideGateway();
  const desktopSettingsVisibility = createFoundryDesktopSettingsVisibilityGateway({ readPolicy });
  const legacyClientRestoration = createLegacyClientRestoration();
  const resolvedGraphicsPolicy = () => resolveMobileGraphicsPolicy({ diceRendering: preferencesGateway.snapshot().diceRendering });
  let performanceEnabled = false;
  const performanceObserver = createPerformanceObserver({ enabled: () => performanceEnabled });
  let mobileAudioController = null, visualIsolationController = null;
  const mobileModuleCompatibility = createMobileModuleCompatibilityGateway();
  const diagnostics = createMobileDiagnostics({ readLevel: readLoggingLevel });
  const mobileBackGateway = createFoundryMobileBackGateway({ trace: event => diagnostics.record(event.action === "error" ? "warn" : "debug", `Browser Back ${JSON.stringify(event)}`) });
  const wakeLockSupported = typeof navigator.wakeLock?.request === "function";
  let resolveSettingsReady;
  const settingsReady = new Promise((resolve) => { resolveSettingsReady = resolve; });
  let startupComplete = false;
  let bootstrapFinishing = false;
  let wakePreferenceHandedOff = false;
  let wakeStatusVersion = 0;
  const bootstrapWakePreference = createBootstrapWakePreference({
    initialValue: readKeepScreenAwake(),
    persist: async (value) => {
      await settingsReady;
      try {
        await preferencesGateway.set({ key: KEYS.KEEP_SCREEN_AWAKE, value });
      } catch (error) {
        console.warn("Mikelandia Controls | Could not save the loading screen wake preference", error);
      }
    }
  });
  const readWakeEnabled = () => wakePreferenceHandedOff
    ? readKeepScreenAwake()
    : bootstrapWakePreference.enabled;
  // The only implemented wake mechanism is the native Screen Wake Lock API.
  // Do not offer a control on a browser where it cannot do anything.
  const showBootstrapWakeControl = wakeLockSupported;
  const wakeLock = createScreenWakeLockController({ readEnabled: readWakeEnabled });
  const bootstrap = createMobileBootstrap({
    localize: (key, fallback) => localizeFoundry(key, fallback)
  });
  const refreshBootstrapLocalization = () => { bootstrap.refreshLocalization?.(); if (bootstrapRecoveryReason) showBootstrapRecovery(bootstrapRecoveryReason); };
  const localizationHook = Hooks.once("i18nInit", refreshBootstrapLocalization);
  window.addEventListener("pagehide", () => Hooks.off("i18nInit", localizationHook), { once: true });
  let bootstrapRecoveryReason = "";
  let bootstrapScope = null;
  let bootstrapWatchdog = null;

  const showBootstrapRecovery = (reason = "stalled") => {
    if (startupComplete || !bootstrap.mounted) return;
    bootstrapRecoveryReason = reason;
    const message = reason === "backgrounded"
      ? localizeFoundry("MIKELANDIA_CONTROLS.Boot.BrowserSuspended", "The browser was suspended before Foundry finished loading. Refresh the game to restart the session safely.")
      : reason === "startup-error"
        ? localizeFoundry("MIKELANDIA_CONTROLS.Boot.StartupFailed", "The mobile interface could not finish starting. Refresh the game to try again.")
        : localizeFoundry("MIKELANDIA_CONTROLS.Boot.StartupStalled", "Foundry has stopped reporting startup progress. Refresh the game to try again.");
    bootstrap.showRecovery({
      title: localizeFoundry("MIKELANDIA_CONTROLS.Boot.Interrupted", "Loading interrupted"),
      message,
      actionLabel: localizeFoundry("MIKELANDIA_CONTROLS.Boot.Refresh", "Refresh game")
    });
  };

  const reportBootstrapProgress = () => {
    bootstrapWatchdog?.progress();
  };

  const updateBootstrapWake = async (fromGesture = false) => {
    const statusVersion = ++wakeStatusVersion;
    if (!bootstrap.mounted) return;
    const enabled = readWakeEnabled();
    if (!enabled) {
      bootstrap.setWakeState("off", {
        checked: false,
        visible: showBootstrapWakeControl
      });
      await wakeLock.reconcile();
      return;
    }
    if (!wakeLock.supported) {
      bootstrap.setWakeState("unsupported", {
        checked: true,
        visible: showBootstrapWakeControl
      });
      return;
    }
    bootstrap.setWakeState("pending", {
      checked: true,
      visible: showBootstrapWakeControl
    });
    const active = fromGesture
      ? await wakeLock.requestFromUserGesture()
      : await wakeLock.reconcile();
    if (!bootstrap.mounted || statusVersion !== wakeStatusVersion) return;
    bootstrap.setWakeState(active ? "active" : "attention", {
      checked: true,
      visible: showBootstrapWakeControl
    });
  };

  const chooseBootstrapWake = (enabled, { fromGesture = false } = {}) => {
    void bootstrapWakePreference.choose(enabled);
    void updateBootstrapWake(fromGesture);
  };

  const stopBootstrap = () => {
    bootstrapWatchdog?.stop();
    bootstrapWatchdog = null;
    bootstrap.unmount();
    bootstrapScope?.dispose();
    bootstrapScope = null;
  };

  const reconcileBootstrap = () => {
    if (startupComplete) return;
    const policy = readPolicy();
    if (!policy.active) {
      stopBootstrap();
      return;
    }
    bootstrap.mount(policy);
    if (!bootstrapScope) {
      bootstrapScope = createTaskScope("bootstrap", performanceObserver);
      wakeLock.enable(bootstrapScope);
      suppressBootstrapSoftwareKeyboard(bootstrapScope, bootstrap.surface);
      bootstrapScope.listen(bootstrap.wakeControl, "click", () => {
        const enabled = bootstrap.wakeControl.getAttribute("aria-checked") !== "true";
        chooseBootstrapWake(enabled, { fromGesture: enabled });
      });
      bootstrapScope.listen(bootstrap.wakePromptYesControl, "click", () => {
        if (!bootstrap.resolveWakePrompt(true)) return;
        chooseBootstrapWake(true, { fromGesture: true });
      });
      bootstrapScope.listen(bootstrap.wakePromptChoiceControl, "click", () => {
        const checked = bootstrap.wakePromptChoiceControl.getAttribute("aria-checked") !== "true";
        bootstrap.setWakePromptChecked(checked);
        if (!checked) {
          chooseBootstrapWake(false);
          bootstrap.resolveWakePrompt(false);
        }
      });
      bootstrapScope.listen(bootstrap.recoveryControl, "click", () => window.location.reload());
      bootstrapWatchdog = createBootstrapWatchdog({
        scope: bootstrapScope,
        onStall: showBootstrapRecovery
      });
    }
    void updateBootstrapWake();
  };

  const finishBootstrap = ({ animate = true, reason = "initial-ready" } = {}) => {
    if (startupComplete || bootstrapFinishing) return;
    bootstrapFinishing = true;
    bootstrapWatchdog?.stop();
    bootstrapWatchdog = null;
    if (!bootstrap.mounted || !bootstrapScope) {
      bootstrapFinishing = false;
      return;
    }
    const finishingScope = bootstrapScope;
    diagnostics.record("debug", `Mode transition bootstrap completion requested: reason=${reason}; mode=${readPolicy().runtimeMode}; viewport=${Math.round(window.visualViewport?.width ?? window.innerWidth)}x${Math.round(window.visualViewport?.height ?? window.innerHeight)}`);
    void bootstrap.complete({
      immediate: !animate,
      beforeDismiss: () => {
        // A native request may succeed during loading. Only stop for a trusted
        // gesture when the enabled preference still lacks an active lock.
        if (reason === "desktop-recovery" || !readWakeEnabled() || !wakeLock.supported || wakeLock.active) return null;
        bootstrap.setWakePromptChecked(true);
        return bootstrap.promptForWakeChoice();
      }
    }).then((completed) => {
      if (!completed || !bootstrap.mounted || bootstrapScope !== finishingScope) {
        bootstrapFinishing = false;
        return;
      }
      const complete = () => {
        bootstrap.unmount();
        if (bootstrapScope === finishingScope) bootstrapScope = null;
        finishingScope.dispose();
        wakeStatusVersion += 1;
        startupComplete = true;
        kernel?.refreshControlsInvitation?.();
        bootstrapFinishing = false;
        if (readPolicy().active) {
          const durationMs = Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - fullLoadStartedAt);
          loadTimingGateway.note({ checkpoint: "ready" });
          void loadTimingGateway.saveFullLoad(durationMs).catch((error) => diagnostics.record("warn", "Could not save successful full-load duration", error));
          diagnostics.record("info", `Full load ready after ${Math.round(durationMs)}ms`);
        }
        void bootstrapWakePreference.whenIdle().then(() => {
          // Do not release a gesture-acquired lock against an older stored
          // value while the final checkbox write is still in flight.
          wakePreferenceHandedOff = true;
          return wakeLock.reconcile();
        });
        diagnostics.record("info", `Mode transition bootstrap completed: reason=${reason}; mode=${readPolicy().runtimeMode}`);
      };
      if (animate) finishingScope.timeout(complete, 700);
      else complete();
    });
  };

  reconcileBootstrap();

  const store = createSignalStore(initialAppState, reduceAppState);
  const connectionGeneration = createConnectionGeneration();
  const rollTiming = createRollTimingGateway();
  const commandGateway = createFoundryCommandGateway({ getSystemIntegration, rollTiming, getConnectionGeneration: () => connectionGeneration.current });
  const actorEditorGateway = createActorEditorGateway({ getSystemIntegration, isActive: () => readPolicy().active && mobileMutationReady,
    getConnectionGeneration: () => connectionGeneration.current });
  const biographyGateway = createFoundryBiographyGateway({ getSystemIntegration, getConnectionGeneration: () => connectionGeneration.current });
  let desktopControlsGuide = null;
  const openControlsGuide = () => {
    if (readPolicy().active) { kernel?.openControlsGuide?.(document.activeElement); return; }
    if (!desktopControlsGuide) {
      const owner = createTaskScope("desktop-controls-guide", performanceObserver);
      owner.listen(window, "pagehide", () => owner.dispose(), { once: true });
      const surface = createControlsGuide({ scope: owner,
        localize: key => preferencesGateway.localize(key),
        readContext: () => ({ presentation: "desktop", ...preferencesGateway.controls() }) });
      owner.own(() => { desktopControlsGuide = null; });
      document.body.append(surface.element);
      desktopControlsGuide = { owner, surface };
    }
    desktopControlsGuide.surface.element.dataset.theme = themeGateway.applicationTheme();
    desktopControlsGuide.surface.show(document.activeElement);
  };
  const chatDomGateway = createChatDomGateway();
  const nativeChatGateway = createFoundryNativeChatGateway({ chatDomGateway });
  const armorClassGateway = createArmorClassGateway({
    getSystemIntegration,
    getConnectionGeneration: () => connectionGeneration.current,
    getMode: () => readPolicy().runtimeMode
  });
  const activeEffectContextGateway = createFoundryActiveEffectContextGateway({ diagnostics });
  const actionSessionGateway = createFoundryActionSessionGateway({ getSystemIntegration });
  const sessionStatusGateway = createFoundrySessionStatusGateway();
  const themeGateway = createFoundryThemeGateway();
  const combatGateway = createFoundryCombatGateway({
    getSystemIntegration,
    isMobileActive: () => Boolean(kernel?.active && readPolicy().active && store.state.route === "combat"),
    getLifecycleToken: () => kernel?.combatControlLifecycleToken?.() ?? null,
    getConnectionGeneration: () => connectionGeneration.current,
  });
  const targetingGateway = createFoundryTargetingGateway();
  const authoritativeGateway = createFoundryAuthoritativeSessionGateway({ diagnostics, performanceObserver });
  const session = createFoundrySessionGateway({
    getSystemIntegration,
    capabilitiesForActor: commandGateway.capabilitiesForActor,
    combatForSnapshot: combatGateway.snapshot,
    combatControlsForSnapshot: combatGateway.controlsSnapshot,
    performanceObserver
  });
  let diceScope = null;
  const reconcileMediaGuard = () => {
    diceScope?.dispose(); diceScope = null;
    if (mobilePerformanceAuthority.active()) {
      diceScope = createTaskScope("mobile-dice", performanceObserver);
      enableMobileDiceGuard(diceScope, { policy: resolvedGraphicsPolicy(), diagnostics });
    }
  };
  let kernel;
  kernel = createAppKernel({
    store,
    session,
    commandGateway,
    actorEditorGateway,
    biographyGateway,
    combatGateway,
    targetingGateway,
    authoritativeGateway,
    loadTimingGateway,
    connectionGeneration,
    nativeChatGateway,
    armorClassGateway,
    activeEffectContextGateway,
    actionSessionGateway,
    preferencesGateway,
    settingsCompatibilityGateway,
    sessionStatusGateway,
    controlsGuideGateway,
    isControlsUiReady: () => startupComplete,
    themeGateway,
    mobileBackGateway,
    diagnostics,
    performanceObserver,
    wakeLockController: wakeLock,
    readPolicy,
    disable: () => preferencesGateway.set({ key: KEYS.MODE, value: "desktop" }),
    preparePresentation: (scope) => {
      mobileAudioController = enableMobileAudio(scope, { enabled: game.settings.get(MODULE_ID, KEYS.MUTE_MOBILE_AUDIO) !== false });
      scope.own(() => { mobileAudioController = null; });
      diagnostics.watch(scope);
      const nativeApplications = enableMobilePresentation(scope, {
        isPersistentOverlay: () => false,
        isActorEditor: actorEditorGateway.ownsApplication,
        isNativeDialog: application => getSystemIntegration().isNativeDialog?.(application) === true,
        isSettingsApplication: (application, element) => settingsCompatibilityGateway.ownsApplication(application, element),
        trace: (event) => diagnostics.record(event.paint?.display === "none" ? "warn" : "debug", `Application admission ${JSON.stringify(event)}`)
      });
      const isolation = enableMcStyleAuthority(scope, {
        enabled: readProtectMcStyling(),
        trace: (state) => diagnostics.record("debug", `Mikelandia Controls style authority ${JSON.stringify(state)}`)
      });
      visualIsolationController = isolation;
      scope.own(() => { if (visualIsolationController === isolation) visualIsolationController = null; });
      settingsCompatibilityGateway.enable(scope);
      enableMobileJournalReader(scope, {
        isActive: () => kernel?.active === true && readPolicy().runtimeMode !== "desktop",
        openJournal: (journalId, target) => kernel.openJournalTarget(journalId, target),
        report: (error) => diagnostics.record("warn", "Mobile Journal presentation fell back to the native sheet", error)
      });
      enableMobileConnectionGrace(scope, {
        onDisconnect: ({ generation }) => kernel?.beginReconnect(generation),
        onTrustedResume: () => loadTimingGateway.note({ type: "trusted resume", checkpoint: "ready" }),
        onReconnect: ({ generation }) => {
          // A mobile browser may drop its wake-lock sentinel while the page is
          // suspended. Reassert the saved Keep Awake preference independently
          // of the authoritative session resynchronisation.
          void wakeLock.reconcile();
          void kernel?.resync(generation);
        }
      });
      wakeLock.enable(scope);
      return Object.freeze({ ...nativeApplications, settings: settingsCompatibilityGateway });
    }
  });

  let modeReloadPending = false;
  let themeScope = null;
  let lastSelectedRuntimeMode = null;
  const reloadForModeChange = () => {
    const reload = globalThis.foundry?.utils?.debouncedReload;
    if (typeof reload === "function") reload();
    else globalThis.window?.location?.reload?.();
  };
  const restoreDesktopSettings = async () => {
    themeScope?.dispose();
    themeScope = null;
    const graphics = await legacyClientRestoration.restoreForDesktop({ notify: false });
    await themeGateway.restoreForDesktop({ notify: false });
    await globalThis.game.settings.set(MODULE_ID, KEYS.PENDING_DESKTOP_RESTORE, {});
    return graphics;
  };

  let recoveryRecord = null;
  let recoveryScope = null;
  const startupGate = createMobileStartupGateway({
    graphics: legacyClientRestoration, theme: themeGateway,
    readMobile: () => isMobilePerformanceAuthorityActive(readRequestedPolicy),
    setMutationReady: value => { mobileMutationReady = value; mobilePerformanceAuthority.refresh(); },
    onError: error => diagnostics.record("error", "Desktop settings recovery is required", error),
    onRecovery: record => { startupBlocked = true; recoveryRecord = record; }
  });
  const showRestorationRecovery = () => {
    recoveryScope?.dispose();
    finishBootstrap({ animate: false, reason: "desktop-recovery" });
    recoveryScope = createTaskScope("desktop-restoration-recovery", performanceObserver);
    recoveryScope.listen(window, "pagehide", () => recoveryScope?.dispose(), { once: true });
    const keys = ["title", "detail", "pending", "saved", "retry", "working", "failed"];
    const labels = Object.fromEntries(keys.map(key => [key, game.i18n.localize(`MIKELANDIA_CONTROLS.RestorationRecovery.${key}`)]));
    showDesktopRestorationRecovery({ scope: recoveryScope, labels, keys: recoveryRecord?.keys ?? [], retry: async () => {
      const result = await startupGate.retry();
      if (result.state === "ready") reloadForModeChange();
      else { showRestorationRecovery(); throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Recovery.DesktopPending", "Desktop restoration remains pending.")); }
    } });
  };
  let modeTransitionQueue = Promise.resolve();

  Hooks.once("init", () => {
    registerBrandingMigration();
    const compatibilityScope = createTaskScope("mobile-module-compatibility", performanceObserver);
    compatibilityScope.listen(window, "pagehide", () => compatibilityScope.dispose(), { once: true, passive: true });
    const mobilePresentationSelected = () => ["phone", "tablet"].includes(readRequestedPolicy().runtimeMode);
    mobileModuleCompatibility.suppress(compatibilityScope, mobilePresentationSelected());
    Hooks.once("setup", () => {
      createWfrpThemePolicy({ readMobile: mobilePresentationSelected }).start(compatibilityScope);
      void mobileModuleCompatibility.reconcileCarolingianUi(mobilePresentationSelected()).catch(error => {
        console.error("Mikelandia Controls | Could not apply Carolingian UI mobile compatibility", error);
      });
    });
    // Foundry installs its Window popstate listener after init returns.
    // Only a mobile page registers Mikelandia Controls's earlier Back listener.
    if (isMobilePerformanceAuthorityActive(readPolicy)) {
      const backScope = createTaskScope("mobile-back-page", performanceObserver);
      if (!mobileBackGateway.install(backScope)) diagnostics.record("warn", "Browser Back protection could not install before Foundry's history listener.");
      backScope.listen(window, "pagehide", () => backScope.dispose(), { once: true, passive: true });
    }
    reportBootstrapProgress();
    const reconcileApplicationPreference = ({ key, value } = {}) => {
      if (modeReloadPending || startupBlocked) return;
      if (key === KEYS.MUTE_MOBILE_AUDIO) mobileAudioController?.setEnabled(value !== false);
      store.dispatch({ type: "action-navigation-invalidated" });
      if ((key === KEYS.SHOW_ACTION_SUMMARIES && value === false) || key === KEYS.COMPACT_ACTION_SUMMARIES) store.dispatch({ type: "dismiss-action-session" });
      performanceEnabled = readLoggingLevel() === "debug";
      mobilePerformanceAuthority.refresh();
      desktopSettingsVisibility.refresh();
      reconcileMediaGuard();
      kernel.reconcile();
      // Foundry's ready hook is one-shot. If this page began in Desktop mode,
      // a later Phone/Tablet preference mounts Mikelandia Controls after ready has already
      // fired, so that live activation owns its own authoritative completion.
      if (globalThis.game?.ready && readPolicy().active) {
        finishBootstrap({ animate: false, reason: "desktop-exit" });
      }
    };
    registerPreferences({
      getSystemIntegration,
      onApplicationChange: reconcileApplicationPreference,
      onPresentationChange: ({ key } = {}) => {
        const currentMode = readPolicy().runtimeMode;
        const priorMode = lastSelectedRuntimeMode;
        lastSelectedRuntimeMode = currentMode;
        if (key === KEYS.MODE && globalThis.game?.ready && priorMode !== null && priorMode !== currentMode) {
          modeReloadPending = true;
          mobileMutationReady = false;
          startupBlocked = true;
          mobilePerformanceAuthority.refresh();
          desktopSettingsVisibility.refresh();
          reconcileMediaGuard();
          kernel.stop();
          modeTransitionQueue = modeTransitionQueue.catch(() => {}).then(async () => {
            if (currentMode === "desktop") {
              await globalThis.game.settings.set(MODULE_ID, KEYS.PENDING_DESKTOP_RESTORE, { version: 1, attempts: 0 });
              await restoreDesktopSettings();
            } else if (priorMode === "desktop") {
              await globalThis.game.settings.set(MODULE_ID, KEYS.MOBILE_ENTRY_HANDOFF, {
                version: 1, token: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
              });
            }
            reloadForModeChange();
          }).catch(error => {
            diagnostics.record("error", "Mode transition requires Desktop restoration recovery", error);
            reloadForModeChange();
          });
          return;
        }
        reconcileBootstrap();
        reconcileApplicationPreference();
        if (key === KEYS.THEME && mobilePerformanceAuthority.active()) themeGateway.sync(readPolicy().theme);
      },
      onWakeChange: () => {
        // Wake preference changes are deliberately orthogonal to device mode.
        // During bootstrap the page-local choice remains authoritative; after
        // handoff only the wake controller needs to observe the saved setting.
        if (wakePreferenceHandedOff && mobilePerformanceAuthority.active()) void wakeLock.reconcile();
      },
      onVisualIsolationChange: ({ value }) => visualIsolationController?.setEnabled(value !== false),
      isMobilePresentation: () => mobilePerformanceAuthority.active(),
      openControlsGuide,
    });
    lastSelectedRuntimeMode = readPolicy().runtimeMode;
    if (isMobilePerformanceAuthorityActive(readPolicy)) {
      authoritativeGateway.captureInitialSources();
      installMcChatWindowClass();
    }
    const startupScope = createTaskScope("client-startup", performanceObserver);
    startupScope.own(() => rollTiming.setEnabled(false));
    startupScope.listen(window, "pagehide", () => startupScope.dispose(), { once: true, passive: true });
    desktopSettingsVisibility.enable(startupScope);
    void startupGate.install(startupScope).then(() => reconcileMediaGuard());
    performanceEnabled = readLoggingLevel() === "debug";
    bootstrapWakePreference.adopt(readKeepScreenAwake()); resolveSettingsReady(); reconcileBootstrap();
  });
  Hooks.once("setup", () => { authoritativeGateway.bindInitialDocuments(); reportBootstrapProgress(); });
  Hooks.once("ready", async () => {
    try { await migrateWorldBranding(game, () => bootstrapWatchdog?.progress()); }
    catch (error) {
      console.error("Mikelandia Controls | Legacy data migration is incomplete; originals are retained.", error);
      ui.notifications?.warn?.("Mikelandia Controls could not finish migrating old data. Original values are retained; a GM can retry by reloading.");
    }
    const startup = await startupGate.prepare();
    if (startup.state !== "ready") { showRestorationRecovery(); return; }
    reportBootstrapProgress();
    if (mobilePerformanceAuthority.active()) {
      const entryHandoff = globalThis.game?.settings?.get?.(MODULE_ID, KEYS.MOBILE_ENTRY_HANDOFF);
      const entryToken = entryHandoff?.version === 1 ? String(entryHandoff.token ?? "") : "";
      await themeGateway.beginMobileSession({ fresh: Boolean(entryToken), entryToken });
      themeScope = createTaskScope("theme-sync", performanceObserver);
      themeScope.listen(window, "pagehide", () => themeScope.dispose(), { once: true, passive: true });
      themeGateway.start(themeScope, {
        readTheme: () => preferencesGateway.snapshot().theme,
        setTheme: (theme) => preferencesGateway.set({ key: KEYS.THEME, value: theme })
      });
      await themeGateway.whenIdle();
    }
    reportBootstrapProgress();
    const module = game.modules.get(MODULE_ID);
    if (module) {
      module.api = Object.freeze({
        version: module.version,
        get active() {
          return kernel.active;
        },
        open: (screen) => kernel.open(screen),
        snapshot: () => kernel.snapshot(),
        backDiagnosticSnapshot: () => mobileBackGateway.snapshot(),
        performanceSnapshot: () => performanceObserver.snapshot(),
        setRollTimingEnabled: enabled => rollTiming.setEnabled(enabled),
        rollTimingSnapshot: () => rollTiming.snapshot(),
        resetRollTiming: () => rollTiming.reset(),
        resetPerformance: () => performanceObserver.reset()
      });
    }
    reportBootstrapProgress();
    try {
      kernel.reconcile();
      reportBootstrapProgress();
      finishBootstrap();
    } catch (error) {
      diagnostics.record("error", "Mikelandia Controls startup failed", error);
      showBootstrapRecovery("startup-error");
      console.error("Mikelandia Controls | Startup failed", error);
      return;
    }
    diagnostics.record("info", `Mikelandia Controls v${module?.version ?? "0.1.0"} ready`);
    console.info(`Mikelandia Controls | v${module?.version ?? "0.1.0"} ready`);
  });
}
