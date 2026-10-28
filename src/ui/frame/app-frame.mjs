import { localizedText, localizedNumber } from "../primitives/localized-text.mjs";
import { icon, node } from "../primitives/dom.mjs";
import { renderCharacters } from "../../features/characters/presenter.mjs";
import { renderJournals } from "../../features/journals/presenter.mjs";
import { renderChat } from "../../features/chat/presenter.mjs";
import { renderSettings } from "../../features/settings/presenter.mjs";
import { renderCombat, renderGmCombatControls } from "../../features/combat/presenter.mjs";
import { resolveCharacterThemeProfile } from "../../features/characters/appearance/character-theme.mjs";
import { createMcBackDispatcher } from "../navigation/mc-back-dispatcher.mjs";
import { createMcCloseWatcherBack, mcCloseWatcherLayers } from "../navigation/mc-close-watcher-back.mjs";
import { createElapsedWorkerClock } from "../timing/elapsed-worker-clock.mjs";
import { createLoadingCheckpoints } from "../bootstrap/loading-checkpoints.mjs";
import { bindCharacterHeaderScroll } from "../../features/characters/appearance/character-header-scroll.mjs";
import { createControlsGuide } from "../help/controls-guide.mjs";
import { createControlsInvitation } from "../help/controls-invitation.mjs";

const SCREENS = Object.freeze({
  characters: renderCharacters,
  journals: renderJournals,
  chat: renderChat,
  combat: renderCombat,
  settings: renderSettings
});
export const RECONNECT_BLOCKER_DELAY_MS = 120;

export function createAppFrame({ store, commands, policy, scope, mobileBackGateway = null, performanceObserver = null, nativeApplications = null }) {
  const root = node("div", { className: "mc-mobile-app", attrs: { role: "application", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.MCMobile", "Mikelandia Controls") } });
  const viewport = node("main", { className: "mc-viewport" });
  const panelOverlays = node("div", { className: "mc-panel-overlays", attrs: { "aria-live": "polite" } });
  const nav = node("nav", { className: "mc-bottom-nav", attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.Primary", "Primary") } });
  const navSideIcon = icon("fa-arrow-left");
  let screenScope = null, combatControlsScope = null, combatControlsRenderKey = "", renderedState = null;
  let mounted = true, characterScrollRestoreGeneration = 0, characterScrollRestoreScope = null, characterHeaderScroll = null;
  const characterScrollMemory = createCharacterScrollMemory();
  const characterScroller = () => viewport.querySelector(".mc-character-content-scroller") ?? viewport;
  const characterScrollTop = () => characterScroller().scrollTop;
  const restoreCharacterScroll = (state, desiredScrollTop) => {
    characterScrollRestoreScope?.dispose();
    characterScrollRestoreScope = scope.child("character-scroll-restore");
    const restoreScope = characterScrollRestoreScope;
    const controller = new AbortController();
    restoreScope.own(() => controller.abort());
    const context = characterScrollContext(state);
    if (!context) { restoreScope.dispose(); return; }
    const generation = ++characterScrollRestoreGeneration;
    const isCurrent = () => mounted
      && !restoreScope.disposed
      && store.state?.route === "characters"
      && generation === characterScrollRestoreGeneration
      && characterScrollContextKey(store.state?.selectedActorSourceUuid, store.state?.characterTab) === context.key;
    const apply = () => {
      if (!isCurrent()) return false;
      const scroller = characterScroller();
      if (!scroller) return false;
      restoreCharacterScrollPosition(scroller, desiredScrollTop, characterHeaderScroll, { clampContent: true });
      return true;
    };
    apply();
    queueMicrotask(apply);
    const scroller = characterScroller();
    if (scroller) {
      for (const type of ["wheel", "touchmove", "keydown"]) restoreScope.listen(scroller, type, () => restoreScope.dispose(), { passive: true });
      void waitForStableElementGeometry(scroller, { localize: commands.localize, signal: controller.signal, isCurrent, maxFrames: 12, includeScrollHeight: true }).then(apply).catch(() => {}).finally(() => restoreScope.dispose());
    }
  };

  const reconnectBlocker = createReconnectBlocker(scope, { localize: commands.localize, locale: commands.readLocale?.() ?? "en", onReload: () => commands.reloadApplication() });
  const modeTransitionBlocker = createModeTransitionBlocker(scope, { localize: commands.localize });
  const rotateSuggestion = tabletRotateSuggestion(commands.localize);
  const navSideToggle = node("button", { className: "mc-tablet-nav-side-toggle", attrs: { type: "button" }, children: [navSideIcon], on: { click: () => commands.toggleTabletNavSide() } }, scope);
  const combatControlsHost = node("div", { className: "mc-gm-combat-control-host", attrs: { hidden: true } });
  const navItems = [["characters", "fa-user", "Character"], ["chat", "fa-comments", "Chat"], ["journals", "fa-book-open", "Journals"], ["combat", combatNavIcon, "Combat"], ["settings", "fa-gear", "Settings"]];
  const navButtons = new Map(navItems.map(([route, createIcon, label]) => {
    const button = node("button", { className: "mc-main-nav-item", attrs: { type: "button" }, dataset: { route }, on: { click: () => commands.navigate(route) }, children: [typeof createIcon === "function" ? createIcon() : icon(createIcon), node("span", { text: commands.localize?.(`MIKELANDIA_CONTROLS.Navigation.${label}`, label) ?? label })] }, scope);
    return [route, button];
  }));
  nav.append(rotateSuggestion, node("div", { className: "mc-nav-routes", children: [...navButtons.values()] }), navSideToggle);
  const backDispatcher = createMcBackDispatcher({ getState: () => store.state, commands, nativeApplications: {
    topmost: () => nativeApplications?.settings?.topmost?.() ?? nativeApplications?.admissions?.topmost?.(),
    closeTopmost: () => nativeApplications?.settings?.topmost?.() ? nativeApplications.settings.closeTopmost() : nativeApplications?.admissions?.closeTopmost?.()
  }, getRoot: () => root.ownerDocument ?? root });
  const nativeBackLayers = () => [...(nativeApplications?.admissions?.layers ?? []), ...(nativeApplications?.settings?.layers ?? []), ...(!controlsGuide.element.hidden ? ["controls-guide"] : [])];
  const closeWatcherBack = createMcCloseWatcherBack({ scope, getLayers: () => mcCloseWatcherLayers(store.state, { nativeLayers: nativeBackLayers() }), onBack: () => backDispatcher.back() });
  mobileBackGateway?.enable(scope, { onBack: () => backDispatcher.back(), getDiagnosticContext: () => ({ route: store.state.route, routeDepth: store.state.routeHistory?.length ?? 0, topmostDismissible: backDispatcher.peek(), closeWatcher: closeWatcherBack.snapshot() }) });
  const controlsGuide = createControlsGuide({ scope, readContext: () => commands.readControlsContext(), localize: key => commands.localize(key), onVisibility: () => closeWatcherBack.sync() });
  const controlsInvitation = createControlsInvitation({ root, scope, commands, getState: () => store.state, isReady: () => commands.controlsUiReady?.(), isNativeOpen: () => nativeApplications?.settings?.topmost?.() ?? nativeApplications?.admissions?.topmost?.(), openGuide: anchor => controlsGuide.show(anchor) });
  root.append(viewport, panelOverlays, nav, combatControlsHost, reconnectBlocker.element, modeTransitionBlocker.element, controlsInvitation.element, controlsGuide.element);
  function syncCombatControlGeometry() {
    const height = combatControlsHost.hidden ? 0 : combatControlsHost.getBoundingClientRect().height;
    const navBounds = nav.getBoundingClientRect();
    if (navBounds.width > navBounds.height && navBounds.height > 0) root.style.setProperty("--mc-nav-dock-height", `${navBounds.height}px`);
    root.style.setProperty("--mc-gm-combat-row-reservation", height > 0 ? `${height + 8}px` : "0px");
  }
  const render = state => {
    if (!mounted || scope.disposed) return;
    performanceObserver?.increment?.("render.frame");
    const latestPolicy = policy();
    const selectedActor = state.snapshot?.selectedActor ?? state.snapshot?.actors?.find(entry => entry.id === state.selectedActorId) ?? state.snapshot?.actors?.[0] ?? null;
    const settings = commands.readFramePreferences();
    const themeProfile = resolveCharacterThemeProfile(selectedActor?.themeClassKeys ?? [selectedActor?.themeClassKey ?? "neutral"], settings.colorScheme);
    const characterTheme = themeProfile.theme;
    const reconnectActive = Boolean(state.reconnect), modeTransitionActive = Boolean(state.modeTransition);
    reconnectBlocker.update(state.reconnect); modeTransitionBlocker.update(state.modeTransition);
    root.dataset.reconnectPhase = state.reconnect?.phase ?? "ready";
    root.dataset.modeTransitionPhase = state.modeTransition?.phase ?? "ready";
    viewport.inert = nav.inert = reconnectActive || modeTransitionActive;
    const tabletNavSide = state.tabletNavSide === "left" ? "left" : "right";
    const layoutKey = `${latestPolicy.formFactor}:${latestPolicy.orientation}:${tabletNavSide}`;
    commands.syncFoundryTheme?.(latestPolicy.theme);
    root.dataset.theme = latestPolicy.theme;
    // The frame may mount after presentation preparation; each render also
    // reconciles the client preference without observing the whole document.
    if (settings.protectMcStyling) root.setAttribute("data-mc-style-authority", "");
    else root.removeAttribute("data-mc-style-authority");
    root.dataset.formFactor = latestPolicy.formFactor;
    root.dataset.orientation = latestPolicy.orientation;
    root.dataset.navSide = tabletNavSide;
    root.dataset.route = state.route;
    root.dataset.characterTheme = characterTheme;
    root.dataset.characterThemeBlend = themeProfile.multiclass ? "multiclass" : "single";
    const artworkOpacity = Number(settings.headerArtworkOpacity);
    root.style.setProperty("--mc-class-art-opacity", String(Number.isFinite(artworkOpacity) ? Math.max(0, Math.min(1, artworkOpacity)) : 1));
    applyThemeBlend(root, themeProfile);
    root.classList.toggle("mc-has-roll-result", Boolean(state.rollResult));
    root.classList.toggle("mc-has-action-session", Boolean(state.actionSession));
    root.classList.toggle("mc-has-hp-editor", Boolean(state.hitPointEditor));
    root.classList.toggle("mc-has-rest-editor", Boolean(state.restEditor));
    root.classList.toggle("mc-has-spell-slot-editor", Boolean(state.spellSlotEditor));
    document.body.dataset.mcMobileTheme = latestPolicy.theme;
    document.body.dataset.mcMobileFormFactor = latestPolicy.formFactor;
    document.body.dataset.mcMobileOrientation = latestPolicy.orientation;
    document.body.dataset.mcMobileNavSide = tabletNavSide;
    document.body.dataset.mcMobileCharacterTheme = characterTheme;
    document.body.dataset.mcMobileCharacterThemeBlend = themeProfile.multiclass ? "multiclass" : "single";
    applyThemeBlend(document.body, themeProfile);

    document.body.classList.toggle("mc-mobile-reconnecting", reconnectActive);
    document.body.classList.toggle("mc-mobile-mode-transitioning", modeTransitionActive);
    const navSideDestination = tabletNavSide === "right" ? "left" : "right";
    const navSideLabel = navSideDestination === "left" ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.MoveNavigationToLeftSide", "Move navigation to left side") : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Navigation.MoveRight", "Move navigation to right side");
    navSideToggle.setAttribute("aria-label", navSideLabel); navSideToggle.title = navSideLabel;
    navSideIcon.classList.toggle("fa-arrow-left", navSideDestination === "left"); navSideIcon.classList.toggle("fa-arrow-right", navSideDestination === "right");
    const combatControls = state.snapshot?.combatControls;
    const combatControlsHidden = state.route !== "combat" || !combatControls?.isGM || state.status !== "ready";
    root.dataset.gmCombatControls = String(!combatControlsHidden);
    const combatControlsKey = `${combatControlsHidden}:${commands.readLocale?.() ?? "en"}:${JSON.stringify(combatControls ?? null)}`;
    combatControlsHost.hidden = combatControlsHidden;
    if (combatControlsKey !== combatControlsRenderKey) {
      combatControlsRenderKey = combatControlsKey;
      combatControlsScope?.dispose();
      combatControlsScope = null;
      combatControlsHost.replaceChildren();
      if (!combatControlsHidden) {
        combatControlsScope = scope.child("gm-combat-controls");
        combatControlsHost.append(renderGmCombatControls({ controls: combatControls, commands, scope: combatControlsScope }));
      }
      queueMicrotask(syncCombatControlGeometry);
    }

    for (const [route, button] of navButtons) { const active = state.route === route; button.classList.toggle("is-active", active); if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); }
    let sameScreen = renderedState?.route === state.route
      && renderedState?.status === state.status
      && renderedState?.error === state.error
      && renderedState?.layoutKey === layoutKey;
    const snapshotChanged = renderedState?.snapshot !== state.snapshot || renderedState?.targeting !== state.targeting;
    const selectionChanged = renderedState?.selectedActorSourceUuid !== state.selectedActorSourceUuid
      || (state.route === "characters" && state.snapshot?.selectedActor === null && Boolean(viewport.firstElementChild?.__mcUpdateCharacter));
    const characterTabChanged = renderedState?.characterTab !== state.characterTab;
    const rollResultChanged = renderedState?.rollResult !== state.rollResult;
    const actionSessionChanged = renderedState?.actionSession !== state.actionSession;
    const characterItemChanged = renderedState?.characterItemId !== state.characterItemId;
    const expandedCharacterItemChanged = renderedState?.expandedCharacterItemId !== state.expandedCharacterItemId;
    const hitPointEditorChanged = renderedState?.hitPointEditor !== state.hitPointEditor;
    const restEditorChanged = renderedState?.restEditor !== state.restEditor;
    const spellSlotEditorChanged = renderedState?.spellSlotEditor !== state.spellSlotEditor;
    const xpEditorChanged = renderedState?.xpEditor !== state.xpEditor;
    const portraitImageChanged = renderedState?.portraitImage !== state.portraitImage;
    const journalChanged = journalPresentationChanged(renderedState, state);
    const viewChanged = renderedState?.viewRevision !== state.viewRevision;
    // Foundry owns and incrementally updates the live ChatLog. Snapshot hooks
    // must never tear it down or replace its focused native textarea.
    if (renderedState?.route === state.route && state.status === "ready" && state.snapshot && ["chat", "settings"].includes(state.route)) {
      if (state.route === "settings") viewport.firstElementChild?.syncOverlayHost?.(null);
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Keep an open item detail surface and its momentum scroll intact while
    // background Foundry hooks or mobile browser chrome resize the viewport.
    // Closing it renders the latest snapshot and responsive layout immediately.
    // Refresh shared authoritative header data even while a form/item modal
    // deliberately retains its local edits and pane DOM.
    if (sameScreen && state.status === "ready" && state.route === "characters" && !selectionChanged
      && (snapshotChanged || viewChanged) && viewport.firstElementChild?.__mcUpdateCharacterHeader) {
      try {
        const paneTop = characterScrollTop();
        if (viewport.firstElementChild.__mcUpdateCharacterHeader({ state, commands })) {
          characterHeaderScroll?.refresh?.();
          restoreCharacterScroll(state, paneTop);
        }
      } catch (error) {
        console.error("Mikelandia Controls | Could not refresh Character header", error);
        // Bypass preserved-form fast paths and dispose the partial owner in
        // the normal screen fallback below, keeping the presentation retryable.
        sameScreen = false;
      }
    }

    if (sameScreen && state.status === "ready" && state.route === "characters" && state.characterItemId
      && !selectionChanged && !characterTabChanged && !characterItemChanged && !actionSessionChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // The action-session gateway owns live, incremental ChatMessage updates.
    // Midi can publish several snapshots during one attack or damage roll; do
    // not dispose and remount the complete Character screen for those updates.
    // Dismissing the modal changes actionSession and renders the latest actor
    // snapshot immediately.
    if (sameScreen && state.status === "ready" && state.route === "characters" && state.actionSession
      && !selectionChanged && !characterTabChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Keep an in-progress HP edit stable while unrelated Foundry hooks publish
    // snapshots. Closing the editor renders the latest actor values.
    if (sameScreen && state.status === "ready" && state.route === "characters" && state.hitPointEditor
      && !selectionChanged && !characterTabChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Preserve the selected hit-die pool and in-modal feedback while actor
    // updates publish snapshots. Closing the editor renders current totals.
    if (sameScreen && state.status === "ready" && state.route === "characters" && state.restEditor
      && !selectionChanged && !characterTabChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Preserve local +/- edits while unrelated Actor hooks publish snapshots.
    // Confirm re-resolves and revalidates the resource before the modal closes.
    if (sameScreen && state.status === "ready" && state.route === "characters" && state.spellSlotEditor
      && !selectionChanged && !characterTabChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Keep an empty XP amount field and its validation feedback stable while
    // the resulting Actor update publishes snapshots.
    if (sameScreen && state.status === "ready" && state.route === "characters" && state.xpEditor
      && !selectionChanged && !characterTabChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // The portrait viewer is a temporary Mikelandia Controls surface. Preserve it across
    // unrelated Actor hooks until the user dismisses it explicitly.
    if (sameScreen && state.status === "ready" && state.route === "characters" && state.portraitImage
      && !selectionChanged && !characterTabChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Settings controls reconcile their saved values, device/mode wording,
    // saved values in place. Preserve the presenter so
    // an ordinary client-setting invalidation cannot collapse open sections.
    if (sameScreen && state.status === "ready" && state.route === "settings"
      && !selectionChanged && !actionSessionChanged && !journalChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    // Item rows update their native <details> surface before recording the
    // expanded item in application state. Keep that DOM (and its surrounding
    // category/scroll position) intact while unrelated Foundry hooks publish.
    if (sameScreen && state.status === "ready" && state.route === "characters"
      && !selectionChanged && !characterTabChanged && !rollResultChanged && !actionSessionChanged && !characterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged
      && ((expandedCharacterItemChanged && !snapshotChanged && !viewChanged) || (state.expandedCharacterItemId && !expandedCharacterItemChanged && !viewChanged))) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    const routeSnapshotChanged = snapshotChanged && snapshotPresentationChangedForRoute(renderedState, state);
    if (sameScreen && state.status === "ready" && state.route === "combat" && !viewChanged && !selectionChanged
      && renderedState?.snapshot?.combat === state.snapshot?.combat && renderedState?.targeting !== state.targeting
      && viewport.firstElementChild?.__mcUpdateCombatTargets?.(state.targeting)) {
      renderedState = screenState(state, layoutKey);
      return;
    }
    if (sameScreen && !routeSnapshotChanged && !selectionChanged && !characterTabChanged && !rollResultChanged && !actionSessionChanged && !characterItemChanged && !expandedCharacterItemChanged && !hitPointEditorChanged && !restEditorChanged && !spellSlotEditorChanged && !xpEditorChanged && !portraitImageChanged && !journalChanged && !viewChanged) {
      renderedState = screenState(state, layoutKey);
      return;
    }

    const previousCharacterContext = characterScrollContext(renderedState);
    const previousCharacterScrollTop = characterScrollTop();
    if (previousCharacterContext) characterScrollMemory.remember(previousCharacterContext.sourceUuid, previousCharacterContext.tab, previousCharacterScrollTop);
    const nextCharacterContext = characterScrollContext(state);
    const desiredCharacterScrollTop = nextCharacterContext
      ? characterScrollMemory.resolve({
        sourceUuid: nextCharacterContext.sourceUuid,
        tab: nextCharacterContext.tab
      })
      : null;
    if (!nextCharacterContext) {
      characterScrollRestoreGeneration += 1;
      characterScrollRestoreScope?.dispose();
    }

    const characterScreen = viewport.firstElementChild;
    const selectedCharacter = state.route === "characters"
      ? (Object.hasOwn(state.snapshot ?? {}, "selectedActor") ? state.snapshot.selectedActor
        : state.snapshot?.actors?.find(actor => actor.id === state.selectedActorId)) : null;
    if (sameScreen && state.status === "ready" && state.route === "characters" && !selectionChanged
      && selectedCharacter && characterScreen?.__mcUpdateCharacter) {
      try {
        characterScreen.__mcUpdateCharacter({ state, commands });
        characterHeaderScroll?.refresh?.();
        performanceObserver?.increment?.("dom.replace.characterPane");
        restoreCharacterScroll(state, desiredCharacterScrollTop);
        renderedState = screenState(state, layoutKey);
        return;
      } catch (error) {
        console.error("Mikelandia Controls | Could not update Character pane", error);
        // Dispose all partial pane/header resources through the normal fallback.
      }
    }

    screenScope?.dispose();
    characterHeaderScroll = null;
    screenScope = scope.child(`screen:${state.route}`);
    if (state.status === "error") {
      performanceObserver?.increment?.("dom.replace.viewport");
      viewport.replaceChildren(node("section", { className: "mc-empty", children: [icon("fa-triangle-exclamation"), node("h2", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.MCMobileCouldNotStart", "Mikelandia Controls could not start") }), node("p", { text: commands.localize?.(state.error, state.error) ?? state.error })] }));
      renderedState = screenState(state, layoutKey);
      return;
    }
    if (!state.snapshot) {
      performanceObserver?.increment?.("dom.replace.viewport");
      viewport.replaceChildren(node("section", { className: "mc-empty", children: [node("div", { className: "mc-loader" }), node("p", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.PreparingYourMobileSession", "Preparing your mobile session…") })] }));
      renderedState = screenState(state, layoutKey);
      return;
    }
    const presenter = SCREENS[state.route] ?? SCREENS.characters;
    try {
      panelOverlays.replaceChildren();
      performanceObserver?.increment?.(`render.presenter.${state.route}`);
      performanceObserver?.increment?.("dom.replace.viewport");
      viewport.replaceChildren(presenter({
        state,
        commands,
        scope: screenScope,
        overlayHost: null
      }));
      if (state.route === "characters") characterHeaderScroll = bindCharacterHeaderScroll({ scroller: characterScroller(), screen: viewport.firstElementChild, scope: screenScope, restorePosition: restoreCharacterScrollPosition });
      if (nextCharacterContext) restoreCharacterScroll(state, desiredCharacterScrollTop);
    } catch (error) {
      console.error(`Mikelandia Controls | Could not render ${state.route}`, error);
      screenScope?.dispose();
      characterHeaderScroll = null;
      viewport.replaceChildren(node("section", {
        className: "mc-empty",
        children: [icon("fa-triangle-exclamation"), node("h2", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.ThisScreenCouldNotOpen", "This screen could not open") }), node("p", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.ReloadFoundryAndTryAgain", "Reload Foundry and try again.") })]
      }));
    }
    renderedState = screenState(state, layoutKey);
  };

  scope.own(store.subscribe(render, { immediate: false }));
  scope.own(store.subscribe(() => { controlsInvitation.reconcile(); controlsGuide.refresh(); closeWatcherBack.sync(); }, { immediate: false }));
  render(store.state);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(syncCombatControlGeometry) : null;
  resizeObserver?.observe(combatControlsHost); scope.own(() => resizeObserver?.disconnect());
  return Object.freeze({
    mount() { if (!mounted || scope.disposed) return; for (const existing of document.querySelectorAll?.(".mc-mobile-app") ?? []) if (existing !== root) existing.remove(); document.body.append(root); document.body.classList.add("mc-mobile-running"); controlsInvitation.reconcile(); },
    unmount() {
      if (!mounted) return; mounted = false; characterScrollRestoreGeneration++; characterScrollMemory.clear(); characterScrollRestoreScope?.dispose(); screenScope?.dispose(); combatControlsScope?.dispose();
      document.body.classList.remove("mc-mobile-running", "mc-mobile-reconnecting", "mc-mobile-mode-transitioning");
      for (const key of ["mcMobileTheme", "mcMobileFormFactor", "mcMobileOrientation", "mcMobileNavSide", "mcMobileCharacterTheme", "mcMobileCharacterThemeBlend"]) delete document.body.dataset[key];
      clearThemeBlend(document.body); root.remove();
    },
    openControlsGuide: anchor => controlsGuide.show(anchor), refreshControlsInvitation: () => controlsInvitation.reconcile(),
    captureModeTransitionState: () => ({ formFactor: store.state.formFactor, orientation: store.state.orientation, route: store.state.route, viewportScrollTop: characterScrollTop(), viewportScrollLeft: viewport.scrollLeft }),
    modeTransitionDiagnosticSnapshot: () => ({ formFactor: store.state.formFactor, orientation: store.state.orientation, route: store.state.route, rootCount: document.querySelectorAll(".mc-mobile-app").length, viewportBounds: elementViewport(viewport) }),
    settleModeTransition: ({ isCurrent = () => true } = {}) => waitForStableElementGeometry(viewport, { localize: commands.localize, isCurrent, maxFrames: 45 }),
    async restoreModeTransitionState(preserved, bounds, { isCurrent = () => true } = {}) { if (!isCurrent()) return false; if (store.state.route === "characters") restoreCharacterScrollPosition(characterScroller(), Number(preserved?.viewportScrollTop) || 0, characterHeaderScroll, { clampContent: true }); else viewport.scrollTop = Number(preserved?.viewportScrollTop) || 0; viewport.scrollLeft = Number(preserved?.viewportScrollLeft) || 0; return Boolean(bounds); },
    cancelModeTransitionRestore() {}
  });
}

export function createReconnectBlocker(scope, {
  localize = null,
  locale = "en",
  onReload = () => {},
  delayMs = RECONNECT_BLOCKER_DELAY_MS,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  elapsedUpdateMs = 200
} = {}) {
  const checkpointDefinitions = Object.freeze([
    Object.freeze({ id: "connection", label: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.RestoringConnection", "Restoring connection"), message: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.RestoringConnection2", "Restoring connection…") }),
    Object.freeze({ id: "collections", label: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.RefreshingWorldData", "Refreshing world data"), message: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.RefreshingWorldData2", "Refreshing world data…") }),
    Object.freeze({ id: "foundry-session", label: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.SynchronisingSessionData", "Synchronizing session data"), message: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.SynchronisingSessionData2", "Synchronizing session data…") }),
    Object.freeze({ id: "mobile-session", label: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.RestoringSession", "Restoring session"), message: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.RestoringYourSession", "Restoring your session…") }),
    Object.freeze({ id: "presentation", label: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.RestoringInterface", "Restoring interface"), message: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.RestoringMobileInterface", "Restoring mobile interface…") }),
    Object.freeze({ id: "interactions", label: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.RestoringControls", "Restoring controls"), message: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.RestoringControls", "Restoring controls…") })
  ]);
  const title = node("h2", { text: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.Reconnecting", "Reconnecting"), attrs: { id: "mc-reconnect-title" } });
  const message = node("p", {
    className: "mc-reconnect-phase",
    text: checkpointDefinitions[0].message,
    attrs: { "aria-live": "polite", "aria-atomic": "true" }
  });
  const progress = node("span", { className: "mc-reconnect-progress", attrs: { hidden: true } });
  const elapsed = node("span", { className: "mc-reconnect-elapsed", text: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.ElapsedMs", "Elapsed · 0 ms") });
  const elapsedClock = createElapsedWorkerClock(elapsed, { now, elapsedLabel: localizedText(localize, "MIKELANDIA_CONTROLS.Timer.Elapsed", "Elapsed"), locale });
  const previous = node("span", { className: "mc-reconnect-previous", text: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.LastResync", "Last resync · —") });
  const timing = node("div", { className: "mc-reconnect-timing", children: [elapsed, previous] });
  const checkpoints = createLoadingCheckpoints(document, checkpointDefinitions, { label: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.ResynchronisationCheckpoints", "Resynchronization checkpoints") });
  const reload = node("button", {
    attrs: { type: "button", hidden: true },
    children: [icon("fa-rotate"), node("span", { text: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.ReloadFoundry", "Reload Foundry") })]
  });
  const element = node("div", {
    className: "mc-reconnect-blocker",
    attrs: { hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "mc-reconnect-title" },
    children: [node("section", { className: "mc-reconnect-card", children: [
      node("div", { className: "mc-reconnect-spinner", children: [icon("fa-arrows-rotate")] }),
      title,
      message,
      progress,
      checkpoints.element,
      timing,
      reload
    ] })]
  });
  let generation = null;
  let presentationScope = null;
  let activeState = null;

  const reveal = () => {
    element.dataset.visible = "true";
  };
  const formatTiming = (value) => {
    const milliseconds = Math.max(0, Number(value) || 0);
    if (milliseconds < 1_000) return `${localizedNumber(Math.round(milliseconds), locale)} ms`;
    return `${localizedNumber(milliseconds / 1_000, locale, 1)} s`;
  };
  const renderTiming = () => {
    const startedAt = Number(activeState?.startedAt);
    const current = Number(now());
    const running = activeState?.startedAt !== null
      && activeState?.startedAt !== undefined
      && Number.isFinite(startedAt) && Number.isFinite(current);
    const elapsedMs = running
      ? Math.max(0, current - startedAt)
      : 0;
    elapsed.hidden = !running;
    elapsed.textContent = localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.Elapsed", "Elapsed · {formatTimingelapsedMs}", { formatTimingelapsedMs: (formatTiming(elapsedMs)) });
    if (running) elapsedClock.start(startedAt);
    const lastSuccessfulMs = Number(activeState?.lastSuccessfulMs);
    const hasPrevious = activeState?.lastSuccessfulMs !== null
      && activeState?.lastSuccessfulMs !== undefined
      && Number.isFinite(lastSuccessfulMs)
      && lastSuccessfulMs >= 0;
    previous.textContent = localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.LastResync2", "Last resync · {hasPreviousformatTimin}", { hasPreviousformatTimin: (hasPrevious ? formatTiming(lastSuccessfulMs) : "—") });
  };
  const scheduleElapsed = (ownedScope, ownedGeneration) => {
    ownedScope.timeout(() => {
      if (generation !== ownedGeneration || presentationScope !== ownedScope || ownedScope.disposed) return;
      renderTiming();
      scheduleElapsed(ownedScope, ownedGeneration);
    }, elapsedUpdateMs);
  };
  const resetPresentation = (state) => {
    presentationScope?.dispose();
    elapsedClock.stop();
    presentationScope = scope.child("reconnect-presentation-delay");
    element.dataset.visible = "false";
    const ownedScope = presentationScope;
    const ownedGeneration = state.generation;
    if (state.phase === "reconnecting") ownedScope.timeout(() => {
      if (generation === ownedGeneration && presentationScope === ownedScope) reveal();
    }, delayMs);
    else reveal();
    scheduleElapsed(ownedScope, ownedGeneration);
  };
  scope.listen(reload, "click", onReload);
  scope.own(() => presentationScope?.dispose());
  scope.own(() => elapsedClock.stop());

  const updatePresentation = (state) => {
    const activeIndex = Math.max(0, checkpointDefinitions.findIndex(({ id }) => id === state.checkpoint));
    checkpoints.update(state.checkpoint, { failed: state.phase === "failed" });
    if (state.phase !== "failed" && state.phase !== "reloading") {
      message.textContent = state.detail || checkpointDefinitions[activeIndex].message;
      message.hidden = message.textContent === checkpointDefinitions[activeIndex].message;
    }
    const phaseProgress = state.progress ?? {};
    const parts = [];
    const pct = Number(phaseProgress.pct);
    const current = Number(phaseProgress.current);
    const total = Number(phaseProgress.total);
    if (phaseProgress.pct !== null && phaseProgress.pct !== undefined && Number.isFinite(pct)) {
      parts.push(`${Math.round(Math.max(0, Math.min(100, pct)))}%`);
    }
    if (phaseProgress.current !== null && phaseProgress.current !== undefined
      && phaseProgress.total !== null && phaseProgress.total !== undefined
      && Number.isFinite(current) && Number.isFinite(total) && total > 0) {
      parts.push(localizedText(localize, "MIKELANDIA_CONTROLS.Recovery.Progress", "{current} of {total}", { current: localizedNumber(Math.max(0, current), locale), total: localizedNumber(Math.max(0, total), locale) }));
    }
    progress.textContent = parts.join(" · ");
    progress.hidden = parts.length === 0;
    element.dataset.progress = progress.hidden ? "indeterminate" : "determinate";
    renderTiming();
  };

  return Object.freeze({
    element,
    update(state) {
      if (!state) {
        presentationScope?.dispose();
        presentationScope = null;
        generation = null;
        activeState = null;
        elapsedClock.stop();
        element.hidden = true;
        element.dataset.visible = "false";
        return;
      }
      activeState = state;
      element.hidden = false;
      if (generation !== state.generation) {
        generation = state.generation;
        resetPresentation(state);
      }
      reload.hidden = state.phase !== "failed";
      updatePresentation(state);
      if (state.phase === "failed") {
        presentationScope?.dispose();
        presentationScope = null;
        title.textContent = localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.ResynchronisationInterrupted", "Resynchronization interrupted");
        message.textContent = localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.MCMobileCouldNotRestoreTheSessionReloadFoundry", "Mikelandia Controls could not restore the session. Reload Foundry to recover safely.");
        message.hidden = false;
        reveal();
      } else if (state.phase === "reloading") {
        title.textContent = localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.FinishingRecovery", "Finishing recovery");
        message.textContent = localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.ReloadingFoundryToFinishRecovery", "Reloading Foundry to finish recovery…");
        message.hidden = false;
        reveal();
      } else if (state.phase === "resynchronising") {
        title.textContent = localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.SynchronisingGame", "Synchronizing game…");
        reveal();
      } else {
        title.textContent = localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.Reconnecting", "Reconnecting");
      }
    }
  });
}

export function createModeTransitionBlocker(scope, { localize = null, delayMs = RECONNECT_BLOCKER_DELAY_MS } = {}) {
  const title = node("h2", { text: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.ChangingPresentation", "Changing presentation"), attrs: { id: "mc-mode-transition-title" } });
  const message = node("p", { text: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.ApplyingTheRequestedMobilePresentation", "Applying the requested mobile presentation."), attrs: { "aria-live": "polite", "aria-atomic": "true" } });
  const phase = node("span", { className: "mc-mode-transition-phase", text: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.ApplyingLayout", "Applying layout") });
  const element = node("div", {
    className: "mc-mode-transition-blocker",
    attrs: { hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "mc-mode-transition-title" },
    children: [node("section", { className: "mc-mode-transition-card", children: [
      node("div", { className: "mc-mode-transition-spinner", children: [icon("fa-mobile-screen-button")] }),
      title,
      message,
      phase
    ] })]
  });
  let generation = null;
  let presentationScope = null;
  const reveal = () => { element.dataset.visible = "true"; };
  scope.own(() => presentationScope?.dispose());
  return Object.freeze({
    element,
    update(state) {
      if (!state) {
        presentationScope?.dispose();
        presentationScope = null;
        generation = null;
        element.hidden = true;
        element.dataset.visible = "false";
        return;
      }
      element.hidden = false;
      if (generation !== state.generation) {
        generation = state.generation;
        presentationScope?.dispose();
        presentationScope = scope.child("mode-transition-presentation-delay");
        element.dataset.visible = "false";
        presentationScope.timeout(reveal, delayMs);
      }
      title.textContent = localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.SwitchingTo", "Switching to {targetmobile}", { targetmobile: (state.target || "mobile") });
      message.textContent = state.detail || localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.ApplyingTheRequestedMobilePresentation", "Applying the requested mobile presentation.");
      phase.textContent = state.phase === "settling"
        ? localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.SettlingViewport", "Settling viewport")
        : state.phase === "restoring" ? localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.RestoringInteractions", "Restoring interactions") : localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.ApplyingLayout", "Applying layout");
    }
  });
}

function combatNavIcon() {
  return icon("fa-swords");
}

function applyThemeBlend(element, profile) {
  const [primary, secondary, tertiary] = profile.accents;
  element.style.setProperty("--mc-class-accent-primary", primary.bright);
  element.style.setProperty("--mc-class-accent-secondary", secondary.bright);
  element.style.setProperty("--mc-class-accent-tertiary", tertiary.bright);
  element.style.setProperty("--mc-class-deep-primary", primary.deep);
  element.style.setProperty("--mc-class-deep-secondary", secondary.deep);
  element.style.setProperty("--mc-class-deep-tertiary", tertiary.deep);
}

function clearThemeBlend(element) {
  for (const property of [
    "--mc-class-accent-primary", "--mc-class-accent-secondary", "--mc-class-accent-tertiary",
    "--mc-class-deep-primary", "--mc-class-deep-secondary", "--mc-class-deep-tertiary"
  ]) element.style.removeProperty(property);
}

export function snapshotPresentationChangedForRoute(previous, current) {
  if (!previous?.snapshot || !current?.snapshot) return previous?.snapshot !== current?.snapshot;
  if (current.route === "characters") {
    if (!previous.snapshot.selectedActor && !current.snapshot.selectedActor) {
      if (previous.snapshot.actors === current.snapshot.actors) return false;
      const actorId = current.selectedActorId;
      const previousActor = previous.snapshot.actors?.find((actor) => actor.id === actorId) ?? previous.snapshot.actors?.[0];
      const currentActor = current.snapshot.actors?.find((actor) => actor.id === actorId) ?? current.snapshot.actors?.[0];
      return previousActor !== currentActor || actorMenuSignature(previous.snapshot.actors) !== actorMenuSignature(current.snapshot.actors);
    }
    return previous.snapshot.selectedActor !== current.snapshot.selectedActor
      || actorMenuSignature(previous.snapshot.actors) !== actorMenuSignature(current.snapshot.actors);
  }
  if (current.route === "combat") return previous.snapshot.combat !== current.snapshot.combat || previous.targeting !== current.targeting;
  if (current.route === "journals") return previous.snapshot.journals !== current.snapshot.journals;
  return false;
}

function actorMenuSignature(actors = []) {
  return JSON.stringify(actors.map((actor) => ({
    id: actor.id,
    sourceUuid: actor.sourceUuid,
    name: actor.name,
    img: actor.img,
    type: actor.type,
    sort: actor.sort,
    folderPath: actor.folderPath,
    level: actor.level,
    classes: actor.classes,
    npc: actor.npc
  })));
}

function elementViewport(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  return Object.freeze({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
}

export function waitForStableElementGeometry(element, {
  signal,
  localize = null,
  requestAnimationFrameFn = globalThis.requestAnimationFrame ?? ((callback) => setTimeout(callback, 0)),
  cancelAnimationFrameFn = globalThis.cancelAnimationFrame ?? clearTimeout,
  isCurrent = () => true,
  maxFrames = Number.POSITIVE_INFINITY,
  includeScrollHeight = false
} = {}) {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Errors.LayoutCanceled", "Layout transition was canceled.")));
  return new Promise((resolve, reject) => {
    let frame = null;
    let previous = null;
    let stableFrames = 0;
    let sampledFrames = 0;
    let settled = false;
    const cleanup = () => {
      if (frame !== null) cancelAnimationFrameFn(frame);
      signal?.removeEventListener?.("abort", onAbort);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onAbort = () => finish(reject, signal.reason ?? new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Errors.LayoutCanceled", "Layout transition was canceled.")));
    const sample = () => {
      frame = null;
      if (!isCurrent()) return finish(resolve, null);
      sampledFrames += 1;
      const bounds = elementViewport(element);
      const next = bounds && includeScrollHeight ? { ...bounds, scrollHeight: element.scrollHeight } : bounds;
      if (next && previous && sameViewport(next, previous) && next.scrollHeight === previous.scrollHeight) stableFrames += 1;
      else stableFrames = 0;
      previous = next;
      if (next && stableFrames >= 2) return finish(resolve, next);
      if (sampledFrames >= maxFrames) return finish(reject, new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Errors.ViewportUnsettled", "The rendered viewport did not settle.")));
      frame = requestAnimationFrameFn(sample);
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
    frame = requestAnimationFrameFn(sample);
  });
}

function sameViewport(left, right) {
  return ["left", "top", "width", "height"].every((key) => Math.abs(left[key] - right[key]) < 0.25);
}

export function characterScrollContextKey(sourceUuid, tab) {
  const source = String(sourceUuid ?? "").trim();
  const page = String(tab ?? "").trim();
  return source && page ? `${source}\u0000${page}` : "";
}

export function clampCharacterScrollTop(scrollTop, scrollHeight, clientHeight) {
  const desired = Math.max(0, Number(scrollTop) || 0);
  const maximum = Math.max(0, (Number(scrollHeight) || 0) - (Number(clientHeight) || 0));
  return Math.min(desired, maximum);
}

export function restoreCharacterScrollPosition(scroller, targetScrollTop, characterHeaderScroll = null, { preserveOrigin = false, clampContent = false } = {}) {
  // A pinned header needs only enough tail to finish contracting. Preserving a
  // long tab's entire offset on a short tab can hide all its content behind it.
  if (!preserveOrigin) characterHeaderScroll?.prepareScrollRestore?.(targetScrollTop);
  const toNative = value => characterHeaderScroll?.toNativeScrollTop?.(value) ?? value;
  const fillerTarget = toNative(characterHeaderScroll
    ? Math.min(targetScrollTop, characterHeaderScroll.collapseDistance)
    : targetScrollTop);
  const spacer = scroller.querySelector?.(".mc-character-scroll-spacer");
  if (spacer) {
    let filler = 0;
    spacer.style.height = "0px";
    const requiredRange = Math.max(
      clampContent ? 0 : fillerTarget,
      characterHeaderScroll?.collapseDistance ?? 0
    );
    if (requiredRange > 0) {
      // scrollHeight is floored at clientHeight when content is shorter than
      // the pane. A temporary known tail reveals the real content extent so
      // the permanent filler can cover both that deficit and the target range.
      const requiredContentHeight = (characterHeaderScroll?.compactClientHeight ?? scroller.clientHeight) + requiredRange;
      const probe = Math.ceil(requiredContentHeight + 1);
      spacer.style.height = `${probe}px`;
      const contentExtent = Math.max(0, scroller.scrollHeight - probe);
      spacer.style.height = "0px";
      filler = Math.max(0, requiredContentHeight - contentExtent);
      if (filler) spacer.style.height = `${Math.ceil(filler)}px`;
    }
  }
  scroller.scrollTop = clampCharacterScrollTop(toNative(targetScrollTop), scroller.scrollHeight, scroller.clientHeight);
  characterHeaderScroll?.update(scroller.scrollTop);
}

export function createCharacterScrollMemory() {
  // Frame-owned, exact-source/subtab LRU; no durable preferences or documents.
  const limit = 128;
  const positions = new Map();
  return Object.freeze({
    remember(sourceUuid, tab, scrollTop) {
      const key = characterScrollContextKey(sourceUuid, tab);
      if (!key) return 0;
      const value = Number.isFinite(Number(scrollTop)) ? Math.max(0, Number(scrollTop)) : 0;
      positions.delete(key);
      positions.set(key, value);
      if (positions.size > limit) positions.delete(positions.keys().next().value);
      return value;
    },
    resolve({ sourceUuid, tab } = {}) {
      const key = characterScrollContextKey(sourceUuid, tab);
      if (!key) return 0;
      return positions.get(key) ?? 0;
    },
    read(sourceUuid, tab) {
      return positions.get(characterScrollContextKey(sourceUuid, tab));
    },
    clear() { positions.clear(); }
  });
}

function characterScrollContext(state) {
  if (state?.route !== "characters") return null;
  const sourceUuid = String(state.selectedActorSourceUuid ?? "").trim();
  const tab = String(state.characterTab ?? "").trim();
  const key = characterScrollContextKey(sourceUuid, tab);
  return key ? Object.freeze({ key, sourceUuid, tab }) : null;
}

function screenState(state, layoutKey = "") {
  return {
    route: state.route,
    routeHistory: state.routeHistory,
    status: state.status,
    error: state.error,
    snapshot: state.snapshot,
    targeting: state.targeting,
    selectedActorId: state.selectedActorId,
    selectedActorSourceUuid: state.selectedActorSourceUuid,
    characterTab: state.characterTab,
    characterNavigation: state.characterNavigation,
    rollResult: state.rollResult,
    actionSession: state.actionSession,
    actionSessionOrigin: state.actionSessionOrigin,
    characterItemId: state.characterItemId,
    expandedCharacterItemId: state.expandedCharacterItemId,
    hitPointEditor: state.hitPointEditor,
    restEditor: state.restEditor,
    spellSlotEditor: state.spellSlotEditor,
    xpEditor: state.xpEditor,
    portraitImage: state.portraitImage,
    journal: state.journal,
    journalLoading: state.journalLoading,
    journalError: state.journalError,
    journalPageId: state.journalPageId,
    journalHeading: state.journalHeading,
    journalMenuOpen: state.journalMenuOpen,
    journalImage: state.journalImage,
    viewRevision: state.viewRevision,
    layoutKey
  };
}

export function journalPresentationChanged(previous, current) {
  return previous?.journal !== current?.journal
    || previous?.journalLoading !== current?.journalLoading
    || previous?.journalError !== current?.journalError
    || previous?.journalPageId !== current?.journalPageId
    || previous?.journalHeading !== current?.journalHeading
    || previous?.journalMenuOpen !== current?.journalMenuOpen
    || previous?.journalImage !== current?.journalImage;
}

function tabletRotateSuggestion(localize = null) {
  return node("div", {
    className: "mc-tablet-rotate-suggestion",
    attrs: {
      role: "img",
      title: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.RotateToLandscapeForTheBestTabletExperience", "Rotate to landscape for the best tablet experience"),
      "aria-label": localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.RotateToLandscapeForTheBestTabletExperience", "Rotate to landscape for the best tablet experience")
    },
    children: [
      icon("fa-tablet-screen-button"),
      icon("fa-rotate-right")
    ]
  });
}
