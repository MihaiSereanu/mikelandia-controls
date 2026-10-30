import { createSystemIntegrationResolver } from "./systems/registry.mjs";
import { localizeFoundry } from "./foundry/settings/localization.mjs";
import { createControlsGuideGateway } from "./foundry/settings/controls-guide-gateway.mjs";
import { createAppKernel } from "./kernel/app-kernel.mjs";
import { createSignalStore } from "./kernel/state/signal-store.mjs";
import { initialAppState, reduceAppState } from "./kernel/state/app-state.mjs";
import { createActivationPolicyResolver } from "./foundry/session/activation-policy.mjs";
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
import { enableHiddenCanvasRendering } from "./foundry/presentation/hidden-canvas-rendering.mjs";
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
import { createFoundrySessionStatusGateway } from "./foundry/session/session-status-gateway.mjs";
import { createFoundryActiveEffectContextGateway } from "./foundry/actors/active-effect-context-gateway.mjs";
import { createPerformanceObserver } from "./kernel/lifecycle/performance-observer.mjs";
import { createMobilePerformanceAuthority, isMobilePerformanceAuthorityActive } from "./kernel/presentation/presentation-mode-authority.mjs";
import { createFoundryBiographyGateway } from "./foundry/actors/biography-gateway.mjs";
import { enableMobileJournalReader } from "./foundry/journals/mobile-journal-reader-gateway.mjs";
import { createChatDomGateway, installMcChatWindowClass } from "./foundry/chat/chat-dom-gateway.mjs";
import { createFoundryMobileBackGateway } from "./foundry/presentation/mobile-back-gateway.mjs";
import { createActorEditorGateway } from "./foundry/actors/actor-editor-gateway.mjs";
import { createMobileModuleCompatibilityGateway } from "./foundry/compatibility/mobile-module-compatibility.mjs";
import { createWfrpThemePolicy } from "./foundry/compatibility/wfrp-theme-policy.mjs";

export function installMobileClient({ getUpgradeCleanup, whenSharedReady }) {
  const getSystemIntegration = createSystemIntegrationResolver();
  const fullLoadStartedAt = navigationStartAt();
  const loadTimingGateway = createClientLoadTimingGateway();
  const activationPolicy = createActivationPolicyResolver();
  let mobileMutationReady = false;
  let startupBlocked = false;
  const readRequestedPolicy = () => activationPolicy.resolve(readPreferences());
  const readPolicy = () => {
    const requested = readRequestedPolicy();
    return { ...requested, active: requested.active && !startupBlocked,
      canvasAvailable: false, sessionReady: globalThis.game?.ready === true && !startupBlocked };
  };
  const mobilePerformanceAuthority = createMobilePerformanceAuthority(readPolicy, () => mobileMutationReady && !startupBlocked);
  const preferencesGateway = createFoundryPreferencesGateway({ getSystemIntegration });
  const settingsCompatibilityGateway = createFoundrySettingsCompatibilityGateway();
  const controlsGuideGateway = createControlsGuideGateway();
  const resolvedGraphicsPolicy = () => resolveMobileGraphicsPolicy({ diceRendering: preferencesGateway.snapshot().diceRendering });
  let performanceEnabled = false;
  const performanceObserver = createPerformanceObserver({ enabled: () => performanceEnabled });
  let visualIsolationController = null;
  const mobileModuleCompatibility = createMobileModuleCompatibilityGateway();
  const compatibilityScope = createTaskScope("mobile-module-compatibility", performanceObserver);
  compatibilityScope.listen(window, "pagehide", () => compatibilityScope.dispose(), { once: true, passive: true });
  // Carolingian's loader decides whether to initialize at init, so its local
  // setting read must already be suppressed before that hook runs.
  mobileModuleCompatibility.suppress(compatibilityScope, true);
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
        if (!readWakeEnabled() || !wakeLock.supported || wakeLock.active) return null;
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
  const openControlsGuide = () => kernel?.openControlsGuide?.(document.activeElement);
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
    disable: () => preferencesGateway.set({ key: KEYS.MODE, value: "native" }),
    preparePresentation: (scope) => {
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
      enableHiddenCanvasRendering(scope);
      scope.own(() => { if (visualIsolationController === isolation) visualIsolationController = null; });
      settingsCompatibilityGateway.enable(scope);
      enableMobileJournalReader(scope, {
        isActive: () => kernel?.active === true && readPolicy().active,
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
  Hooks.once("init", () => {
    const mobilePresentationSelected = () => ["phone", "tablet"].includes(readRequestedPolicy().runtimeMode);
    Hooks.once("setup", () => {
      createWfrpThemePolicy({ readMobile: mobilePresentationSelected }).start(compatibilityScope);
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
      store.dispatch({ type: "action-navigation-invalidated" });
      if ((key === KEYS.SHOW_ACTION_SUMMARIES && value === false) || key === KEYS.COMPACT_ACTION_SUMMARIES) store.dispatch({ type: "dismiss-action-session" });
      performanceEnabled = readLoggingLevel() === "debug";
      mobilePerformanceAuthority.refresh();
      reconcileMediaGuard();
      kernel.reconcile();
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
          reconcileMediaGuard();
          kernel.stop();
          reloadForModeChange();
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
      isMobilePresentation: () => readRequestedPolicy().active,
      openControlsGuide,
    });
    lastSelectedRuntimeMode = readPolicy().runtimeMode;
    // Block playback before ready and first-gesture audio unlock, including
    // queued playlist and module sounds during world startup.
    if (mobilePresentationSelected()) enableMobileAudio(compatibilityScope);
    if (isMobilePerformanceAuthorityActive(readPolicy)) {
      authoritativeGateway.captureInitialSources();
      installMcChatWindowClass();
    }
    const startupScope = createTaskScope("client-startup", performanceObserver);
    startupScope.own(() => rollTiming.setEnabled(false));
    startupScope.listen(window, "pagehide", () => startupScope.dispose(), { once: true, passive: true });
    mobileMutationReady = true;
    mobilePerformanceAuthority.refresh();
    reconcileMediaGuard();
    performanceEnabled = readLoggingLevel() === "debug";
    bootstrapWakePreference.adopt(readKeepScreenAwake()); resolveSettingsReady(); reconcileBootstrap();
  });
  Hooks.once("setup", () => { authoritativeGateway.bindInitialDocuments(); reportBootstrapProgress(); });
  Hooks.once("ready", async () => {
    await whenSharedReady();
    const upgrade = await getUpgradeCleanup().whenIdle();
    if (!upgrade.ok || upgrade.reloadPending) {
      startupBlocked = true;
      if (!upgrade.ok) showBootstrapRecovery("startup-error");
      return;
    }
    reportBootstrapProgress();
    if (mobilePerformanceAuthority.active()) {
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
