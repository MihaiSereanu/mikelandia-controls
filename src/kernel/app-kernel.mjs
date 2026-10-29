import { localizedText } from "../ui/primitives/localized-text.mjs";
import { runMobileApplicationWorkflow } from "../foundry/presentation/mobile-ui-isolation.mjs";
import { createTaskScope } from "./lifecycle/task-scope.mjs";
import { createAppFrame } from "../ui/frame/app-frame.mjs";
import { targetsVisible } from "../features/combat/targeting-surface.mjs";
import { createAuthoritativeResynchronizer } from "./connection/authoritative-resync.mjs";

import { ACTOR_COMMANDS } from "./state/command-names.mjs";

import { createModeTransitionCoordinator, presentationLabel } from "./presentation/mode-transition.mjs";

export function createAppKernel({ store, session, commandGateway, biographyGateway, actorEditorGateway = null, combatGateway, targetingGateway = null, authoritativeGateway, loadTimingGateway = null, reloadApplication = () => globalThis.window?.location?.reload?.(), connectionGeneration, nativeChatGateway, armorClassGateway = null, activeEffectContextGateway, actionSessionGateway, preferencesGateway, settingsCompatibilityGateway, sessionStatusGateway, controlsGuideGateway = null, isControlsUiReady = () => false, themeGateway, mobileBackGateway = null, diagnostics, performanceObserver = null, wakeLockController, readPolicy, disable, preparePresentation = () => {}, createFrame = createAppFrame }) {
  const localize = (key, fallback, data) => localizedText((id, _fallback, values) => preferencesGateway?.localize?.(id, values), key, fallback, data);
  let runtimeScope = null;
  let activationCommitted = false;
  let starting = false;
  let stopping = false;
  let frame = null;
  let rollResultSequence = 0;
  let journalRequestSequence = 0;
  let resynchronizer = null;
  let modeTransition = null;
  const dismissedActionSessions = new Set();
  const activeActionExecutions = new Map();
  const activeSummaryExecutions = new Set();
  let actionExecutionSequence = 0;
  const rememberDismissedSession = (id) => {
    if (!id) return;
    dismissedActionSessions.add(id);
    if (dismissedActionSessions.size > 64) dismissedActionSessions.delete(dismissedActionSessions.values().next().value);
  };

  const expectedSession = () => ({
    worldId: store.state.snapshot?.world?.id,
    userId: store.state.snapshot?.user?.id,
    connectionGeneration: connectionGeneration?.current ?? 0
  });
  const guardConnection = async (action) => {
    const generation = connectionGeneration?.current ?? 0;
    const owner = runtimeScope;
    const result = await runMobileApplicationWorkflow(() => action({ ...expectedSession(), connectionGeneration: generation }),
      () => activationCommitted && runtimeScope === owner && !owner?.disposed && readPolicy().active);
    if (connectionGeneration && !connectionGeneration.matches(generation)) throw new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.CombatGateway.TheConnectionChangedWhileThisActionWasRunning", "The connection changed while this action was running."));
    return result;
  };
  const guardCombatControl = (request, action) => {
    const lifecycleToken = runtimeScope;
    return guardConnection((expected) => {
      const state = store.state;
      if (!activationCommitted || !lifecycleToken || runtimeScope !== lifecycleToken || lifecycleToken.disposed || !readPolicy().active
        || state.reconnect || state.modeTransition || state.route !== "combat") {
        throw new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.CombatGateway.MobileCombatControlsAreNoLongerActive", "Mobile combat controls are no longer active."));
      }
      return action({ ...request, ...expected, lifecycleToken });
    });
  };

  const requireCharacterView = (sourceUuid = store.state.selectedActorSourceUuid) => {
    if (!activationCommitted || !runtimeScope || runtimeScope.disposed || !readPolicy().active
      || store.state.route !== "characters" || store.state.reconnect || store.state.modeTransition
      || sourceUuid !== store.state.selectedActorSourceUuid) throw new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.ThisActorViewIsNoLongerActive", "This Actor view is no longer active."));
  };
  const dispatchNavigation = (event) => {
    store.dispatch({ type: "action-navigation-invalidated" });
    return store.dispatch(event);
  };
  const commands = Object.freeze({
    navigate: (route) => dispatchNavigation({ type: "navigate", route }),
    navigateBack: () => dispatchNavigation({ type: "navigate-back" }),
    returnToCharacter: () => dispatchNavigation({ type: "return-to-character" }),

    reportCharacterMutationError: (error) => {
      diagnostics?.record?.("warn", "Character mutation was rejected", error);
      commandGateway.notifyError?.(error);
    },

    selectActor: (sourceUuid) => {
      const snapshot = session.selectCharacterSource(sourceUuid, expectedSession());
      session.adopt?.(snapshot);
      store.dispatch({ type: "session-loaded", snapshot, characterNavigation: Object.freeze([]) });
      return Promise.resolve(Object.freeze({ ok: true }));
    },
    openReferencedActor: ({ originSourceUuid, targetSourceUuid }) => {
      requireCharacterView(originSourceUuid);
      const state = store.state;
      const history = Object.freeze([...(state.characterNavigation ?? []), Object.freeze({
        sourceUuid: originSourceUuid, tab: state.characterTab, name: state.snapshot.selectedActor?.name ?? ""
      })].slice(-8));
      const snapshot = session.selectReferencedCharacterSource({ originSourceUuid, targetSourceUuid }, expectedSession());
      store.dispatch({ type: "session-loaded", snapshot, characterNavigation: history });
    },
    returnToActorOrigin: () => {
      requireCharacterView();
      const history = store.state.characterNavigation ?? [];
      const origin = history.at(-1);
      if (!origin) return;
      try {
        const snapshot = session.selectCharacterSource(origin.sourceUuid, expectedSession());
        store.dispatch({ type: "session-loaded", snapshot, characterTab: origin.tab,
          characterNavigation: Object.freeze(history.slice(0, -1)) });
      } catch (error) {
        store.dispatch({ type: "discard-character-origin" });
        commandGateway.notifyError?.(error);
      }
    },
    openNativeActorEditor: request => {
      requireCharacterView(request.actorSourceUuid);
      return guardConnection(expected => actorEditorGateway.open(request, expected, runtimeScope));
    },
    selectCharacterTab: (tab) => dispatchNavigation({ type: "select-character-tab", tab }),
    showRollResult: (payload) => {
      if (!activationCommitted || !runtimeScope || runtimeScope.disposed || !readPolicy().active || store.state.route !== "characters") return;
      const label = String(payload?.label ?? "").trim().slice(0, 100);
      const total = Number(payload?.total);
      const formula = String(payload?.formula ?? "").trim().slice(0, 160);
      const breakdown = Array.isArray(payload?.breakdown)
        ? payload.breakdown.map((step) => {
          const kind = step?.kind === "die" ? "die" : "modifier";
          const label = String(step?.label ?? "").trim().slice(0, 24);
          const value = Number(step?.value);
          return label && (kind === "modifier" || Number.isFinite(value))
            ? Object.freeze({ kind, label, ...(kind === "die" ? { value } : {}) })
            : null;
        }).filter(Boolean).slice(0, 12)
        : [];
      if (!label || !Number.isFinite(total)) return;
      const id = ++rollResultSequence;
      store.dispatch({ type: "show-roll-result", result: Object.freeze({
        id,
        label,
        actorSourceUuid: store.state.selectedActorSourceUuid,
        total,
        pending: Boolean(payload?.pending),
        ...(formula ? { formula } : {}),
        ...(breakdown.length ? { breakdown: Object.freeze(breakdown) } : {})
      }) });
      return id;
    },
    updateRollResult: (id, payload) => {
      if (!activationCommitted || !runtimeScope || runtimeScope.disposed || !readPolicy().active || store.state.rollResult?.id !== id
        || store.state.route !== "characters"
        || (store.state.rollResult.actorSourceUuid && store.state.rollResult.actorSourceUuid !== store.state.selectedActorSourceUuid)) return;
      const label = String(payload?.label ?? store.state.rollResult.label).trim().slice(0, 100);
      const total = Number(payload?.total);
      if (!label || !Number.isFinite(total)) return;
      const formula = String(payload?.formula ?? "").trim().slice(0, 160);
      const breakdown = Array.isArray(payload?.breakdown)
        ? payload.breakdown.map((step) => {
          const kind = step?.kind === "die" ? "die" : "modifier";
          const label = String(step?.label ?? "").trim().slice(0, 24);
          const value = Number(step?.value);
          return label && (kind === "modifier" || Number.isFinite(value))
            ? Object.freeze({ kind, label, ...(kind === "die" ? { value } : {}) })
            : null;
        }).filter(Boolean).slice(0, 12)
        : [];
      store.dispatch({ type: "update-roll-result", result: Object.freeze({
        ...store.state.rollResult,
        label,
        total,
        pending: false,
        ...(formula ? { formula } : {}),
        ...(breakdown.length ? { breakdown: Object.freeze(breakdown) } : {})
      }) });
    },
    dismissRollResult: (id) => store.dispatch({ type: "dismiss-roll-result", id }),
    openActionSession: (session, origin = "character") => {
      if (!activationCommitted || !readPolicy()?.active) return;
      if (dismissedActionSessions.has(session?.rootMessageId)) return;
      const preferences = preferencesGateway.actionSummaries?.() ?? preferencesGateway.snapshot();
      if (preferences.showActionSummaries === false) return;
      store.dispatch({ type: "show-action-session", session: Object.freeze({ ...session, compact: preferences.compactActionSummaries === true }), origin });
    },
    dismissActionSession: () => {
      rememberDismissedSession(store.state.actionSession?.rootMessageId);
      store.dispatch({ type: "dismiss-action-session" });
    },
    openCharacterItem: (itemId) => store.dispatch({ type: "open-character-item", itemId }),
    closeCharacterItem: () => store.dispatch({ type: "close-character-item" }),
    setExpandedCharacterItem: (itemId = "") => store.dispatch({ type: "set-expanded-character-item", itemId }),
    setCharacterSectionExpanded: (sectionId, expanded) => store.dispatch({ type: "set-character-section-expanded", sectionId, expanded }),
    setCharacterSectionsExpanded: (sectionIds = []) => store.dispatch({ type: "set-character-sections-expanded", sectionIds }),
    initializeCharacterSections: (sourceUuid, tab, sectionIds) => store.dispatch({ type: "initialize-character-sections", sourceUuid, tab, sectionIds }),
    openHitPointEditor: (editor = "hp") => store.dispatch({ type: "open-hit-point-editor", editor }),
    closeHitPointEditor: () => store.dispatch({ type: "close-hit-point-editor" }),
    openRestEditor: () => store.dispatch({ type: "open-rest-editor" }),
    closeRestEditor: () => store.dispatch({ type: "close-rest-editor" }),
    openSpellSlotEditor: (resourceId) => store.dispatch({
      type: "open-spell-slot-editor",
      resourceId,
      actorSourceUuid: store.state.selectedActorSourceUuid,
      connectionGeneration: connectionGeneration?.current ?? 0
    }),
    closeSpellSlotEditor: () => store.dispatch({ type: "close-spell-slot-editor" }),
    openExperienceEditor: () => store.dispatch({ type: "open-experience-editor" }),
    closeExperienceEditor: () => store.dispatch({ type: "close-experience-editor" }),
    openCharacterPortrait: (image) => store.dispatch({ type: "open-character-portrait", image }),
    closeCharacterPortrait: () => store.dispatch({ type: "close-character-portrait" }),
    openJournal: async (journalId, target = {}) => {
      const request = ++journalRequestSequence;
      const generation = connectionGeneration?.current ?? 0;
      store.dispatch({ type: "journal-loading" });
      try {
        const journal = await session.readJournal(journalId, expectedSession());
        if (request === journalRequestSequence && (!connectionGeneration || connectionGeneration.matches(generation))) store.dispatch({ type: "journal-loaded", journal, target });
        return journal;
      } catch (error) {
        if (request === journalRequestSequence && (!connectionGeneration || connectionGeneration.matches(generation))) {
          store.dispatch({ type: "journal-error", error });
        }
        throw error;
      }
    },
    closeJournal: () => {
      journalRequestSequence += 1;
      store.dispatch({ type: "close-journal" });
    },
    selectJournalPage: (pageId) => store.dispatch({ type: "select-journal-page", pageId }),
    selectJournalHeading: (pageId, heading) => store.dispatch({ type: "select-journal-heading", pageId, heading }),
    toggleJournalMenu: () => store.dispatch({ type: "toggle-journal-menu" }),
    closeJournalMenu: () => store.dispatch({ type: "close-journal-menu" }),
    openNativeJournalEditor: (journalId, pageId) => session.openNativeJournalEditor(journalId, pageId, expectedSession()),
    openJournalImage: (image) => store.dispatch({ type: "open-journal-image", image }),
    closeJournalImage: () => store.dispatch({ type: "close-journal-image" }),
    localize,
    readLocale: () => preferencesGateway?.readLocale?.() ?? "en",

    toggleTabletNavSide: () => store.dispatch({ type: "toggle-tablet-nav-side" }),

    syncFoundryTheme: (theme) => themeGateway?.sync(theme, runtimeScope),

    endCombatTurn: (combatId) => guardConnection((expected) => combatGateway.endTurn({ combatId, ...expected })),
    startCombat: (request) => guardCombatControl(request, expected => combatGateway.startCombat(expected)),
    endCombat: (request) => guardCombatControl(request, expected => combatGateway.endCombat(expected)),
    previousCombatTurn: (request) => guardCombatControl(request, expected => combatGateway.previousTurn(expected)),
    nextCombatTurn: (request) => guardCombatControl(request, expected => combatGateway.nextTurn(expected)),
    rollCombatInitiative: (combatId, combatantId) => guardConnection((expected) => combatGateway.rollInitiative({ combatId, combatantId }, expected)),
    toggleCombatTarget: request => guardConnection(() => targetingGateway.toggle(request)),
    selectCombatTargetSource: request => guardConnection(() => targetingGateway.selectSource(request)),
    setCombatTargetsExpanded: value => targetingGateway?.setExpanded(value),

    mountNativeChat: (host, owner) => nativeChatGateway.mount(host, owner),
    openActiveEffectContextMenu: (payload) => payload?.actorSourceUuid === store.state.selectedActorSourceUuid
      ? guardConnection((expected) => activeEffectContextGateway.open(payload, expected))
      : Promise.resolve(Object.freeze({ ok: true, action: "stale" })),
    selectActiveEffectContextOption: (payload) => guardConnection((expected) => activeEffectContextGateway.select({
      ...payload, actorSourceUuid: store.state.selectedActorSourceUuid
    }, expected)),
    closeActiveEffectContextMenu: () => activeEffectContextGateway.close(),
    traceActiveEffectHold: (entry) => diagnostics?.record?.("debug", `Active Effect hold ${JSON.stringify(entry)}`),
    mountActionSession: (host, actionSession, owner, options) => actionSessionGateway.mount(host, actionSession, owner, options),
    readFramePreferences: () => preferencesGateway.frame?.() ?? preferencesGateway.snapshot(),
    readCharacterPreferences: () => preferencesGateway.character?.() ?? preferencesGateway.snapshot(),

    readCharacterItemMenu: (request) => {
      if (!activationCommitted || !runtimeScope || runtimeScope.disposed || !readPolicy().active
        || store.state.reconnect || store.state.modeTransition
        || request.actorSourceUuid !== store.state.selectedActorSourceUuid) throw new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.ThisCharacterMenuIsNoLongerActive", "This character menu is no longer active."));
      performanceObserver?.increment?.("character.menu.prepare");
      return Object.freeze({ ...commandGateway.readItemMenu(request, expectedSession()),
        preferences: preferencesGateway.actionMenu?.() ?? preferencesGateway.snapshot() });
    },
    controlsUiReady: () => activationCommitted && isControlsUiReady(),
    controlsInvitationSeen: () => controlsGuideGateway?.seen?.() ?? true,
    markControlsInvitationPresented: () => controlsGuideGateway?.markPresented?.(),
    openControlsGuide: anchor => frame?.openControlsGuide?.(anchor),
    readControlsContext: () => {
      const state = store.state;
      const actor = state.snapshot?.selectedActor;
      return Object.freeze({ ...preferencesGateway.controls?.(), presentation: state.formFactor,
        actorType: actor?.type,
        profileTabs: actor?.panels?.map(tab => tab.id),
        notesAvailable: actor?.notesAvailable,
        edition: actor?.edition,
        characterPresentation: state.snapshot?.selectedActor?.presentation ?? preferencesGateway.controls?.().characterPresentation ?? "legacy",
      });
    },
    readActionSummaryPreferences: () => preferencesGateway.actionSummaries?.() ?? { showActionSummaries: true },
    readSettings: () => {
      performanceObserver?.increment?.("settings.read.broad");
      const preferences = preferencesGateway.snapshot();
      return Object.freeze({
        ...preferences,
        resolvedMode: store.state.formFactor,

        nativeSettings: settingsCompatibilityGateway?.snapshot?.() ?? Object.freeze({})
      });
    },
    watchLayoutState: (owner, onUpdate) => {
      const publish = () => {
        const preferences = preferencesGateway.layout?.() ?? preferencesGateway.snapshot();
        onUpdate(Object.freeze({ mode: preferences.mode,
          resolvedMode: store.state.formFactor, formFactor: store.state.formFactor,
          orientation: store.state.orientation,
          tabletNavSide: store.state.tabletNavSide }));
      };
      const unsubscribe = store.subscribe(publish, { immediate: false });
      owner?.own?.(unsubscribe);
      publish();
      return unsubscribe;
    },
    readSessionStatus: () => sessionStatusGateway?.snapshot?.() ?? Object.freeze({ users: Object.freeze([]) }),
    watchSessionStatus: (owner, onUpdate) => sessionStatusGateway?.watch?.(owner, onUpdate),

    restoreSettingsDefaults: () => restoreMcSettingsDefaults({
      preferencesGateway,
      guardConnection,
      invalidate: () => store.dispatch({ type: "view-invalidated" })
    }),
    openArmorClass: (actorSourceUuid) => guardConnection(expected => armorClassGateway.open({ actorSourceUuid, ...expected })),
    updateSetting: async (payload) => {
      store.dispatch({ type: "action-navigation-invalidated" });
      const result = await guardConnection(() => preferencesGateway.set(payload));
      if (result.namespace === "mikelandia-controls" && ((result.key === "showActionSummaries" && result.value === false) || result.key === "compactActionSummaries")) {
        store.dispatch({ type: "dismiss-action-session" });
      }
      if (!result.requiresReload) store.dispatch({ type: "view-invalidated" });
      return result;
    },
    updateCharacterCollectionPreference: (key, value) => guardConnection(() => preferencesGateway.setCharacterCollectionPreference({ key, value })),
    reloadApplication: () => globalThis.window?.location?.reload?.(),
    openFoundrySettings: () => settingsCompatibilityGateway.openFoundrySettings(),
    logout: () => preferencesGateway.logout(),
    requestScreenWakeLock: () => wakeLockController.requestFromUserGesture(),
    sendChat: (content) => guardConnection(() => session.sendChat(content, store.state.selectedActorSourceUuid)),
    readCharacterBiography: async (actorSourceUuid) => {
      const sourceUuid = String(actorSourceUuid ?? "");
      if (store.state.route !== "characters" || !["biography", "notes"].includes(store.state.characterTab)
        || store.state.selectedActorSourceUuid !== sourceUuid) throw new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.TheSelectedBiographyIsNoLongerActive", "The selected biography is no longer active."));
      const result = await guardConnection((expected) => biographyGateway.read({ actorSourceUuid: sourceUuid }, expected));
      if (store.state.route !== "characters" || !["biography", "notes"].includes(store.state.characterTab)
        || store.state.selectedActorSourceUuid !== sourceUuid) throw new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.TheSelectedBiographyIsNoLongerActive", "The selected biography is no longer active."));
      return result;
    },
    rollCharacterBiographyInline: (payload) => {
      const sourceUuid = String(payload?.actorSourceUuid ?? "");
      if (store.state.route !== "characters" || !["biography", "notes"].includes(store.state.characterTab)
        || store.state.selectedActorSourceUuid !== sourceUuid) return Promise.reject(new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.TheSelectedBiographyIsNoLongerActive", "The selected biography is no longer active.")));
      return guardConnection((expected) => biographyGateway.roll(payload, expected));
    },
    execute: (name, payload, observer) => {
      if (!activationCommitted || !runtimeScope || runtimeScope.disposed || !readPolicy().active
        || store.state.reconnect || store.state.modeTransition) return Promise.reject(new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.ThisActorActionIsNoLongerActive", "This Actor action is no longer active.")));
      const sourceUuid = String(payload?.actorSourceUuid ?? "");
      const visibleSource = store.state.route === "characters" ? store.state.selectedActorSourceUuid : "";
      if (sourceUuid && sourceUuid !== visibleSource) return Promise.reject(new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.TheSelectedActorSourceChangedBeforeThisActionCould", "The selected Actor source changed before this action could run.")));
      if ([ACTOR_COMMANDS.ADD_EXPERIENCE, ACTOR_COMMANDS.UPDATE_CURRENCY, ACTOR_COMMANDS.SET_SPELL_SLOT_VALUE, ACTOR_COMMANDS.SET_ITEM_EQUIPPED, ACTOR_COMMANDS.SET_ITEM_ATTUNED, ACTOR_COMMANDS.SET_ITEM_FAVORITE, ACTOR_COMMANDS.SET_SPELL_PREPARED, ACTOR_COMMANDS.OPEN_ITEM_SHEET].includes(name)
        || name === ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION || name === ACTOR_COMMANDS.SET_EXHAUSTION_LEVEL || [ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, ACTOR_COMMANDS.LIST_PROFILE_ITEMS, ACTOR_COMMANDS.ADD_PROFILE_ITEM].includes(name)) {
        const sourceUuid = String(payload?.actorSourceUuid ?? "");
        if (store.state.route !== "characters" || store.state.selectedActorSourceUuid !== sourceUuid
          || (name === ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION && !["biography", "notes"].includes(store.state.characterTab))) {
          return Promise.reject(new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.TheSelectedCharacterSourceChangedBeforeThisActionCould", "The selected character source changed before this action could run.")));
        }
      }
      if (name === ACTOR_COMMANDS.SET_SPELL_SLOT_VALUE) {
        const editor = store.state.spellSlotEditor;
        const resourceId = `spell-slot:${String(payload?.slotKey ?? "")}`;
        if (!editor || editor.actorSourceUuid !== payload.actorSourceUuid || editor.resourceId !== resourceId
          || editor.connectionGeneration !== payload.editorGeneration
          || editor.connectionGeneration !== (connectionGeneration?.current ?? 0)) {
          return Promise.reject(new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.ThisSpellSlotEditorIsStaleReopenItAnd", "This spell-slot editor is stale. Reopen it and try again.")));
        }
      }
      const owner = runtimeScope;
      const executionKey = JSON.stringify([name, sourceUuid, payload?.itemId, payload?.activityId,
        payload?.ability, payload?.skill, payload?.tool, payload?.actionId, payload?.resourceId]);
      let executionSequence;
      const generation = connectionGeneration?.current ?? 0;
      const worldId = store.state.snapshot?.world?.id, userId = store.state.snapshot?.user?.id;
      const ownsExecution = !activeActionExecutions.has(executionKey);
      if (ownsExecution) activeActionExecutions.set(executionKey, ++actionExecutionSequence);
      executionSequence = activeActionExecutions.get(executionKey);
      const summaryExecution = { roots: new Set(), dismissed: false };
      activeSummaryExecutions.add(summaryExecution);
      return guardConnection((expected) => commandGateway.execute(name, payload, [ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, ACTOR_COMMANDS.LIST_PROFILE_ITEMS, ACTOR_COMMANDS.ADD_PROFILE_ITEM].includes(name) ? {
        ...expected, isCurrent: () => owner === runtimeScope && !owner.disposed && activationCommitted && readPolicy().active
          && !store.state.reconnect && !store.state.modeTransition && store.state.route === "characters"
          && store.state.selectedActorSourceUuid === sourceUuid
      } : expected, {
        ...observer,
        onActionSession: (session) => {
          if (summaryExecution.dismissed || owner !== runtimeScope || owner.disposed) return;
          summaryExecution.roots.add(session.rootMessageId);
          observer?.onActionSession?.(session);
        },
        onActionAccepted: (record) => { observer?.onActionAccepted?.(record); }
      })).then(outcome => {
        const current = owner === runtimeScope && !owner.disposed && activationCommitted
          && generation === (connectionGeneration?.current ?? 0)
          && worldId === store.state.snapshot?.world?.id && userId === store.state.snapshot?.user?.id;
        if (!outcome?.actionSession || (!summaryExecution.dismissed && current)) return outcome;
        const { actionSession: _dismissed, ...rest } = outcome;
        return Object.freeze(rest);
      }).finally(() => {
        activeSummaryExecutions.delete(summaryExecution);
        if (ownsExecution && activeActionExecutions.get(executionKey) === executionSequence) activeActionExecutions.delete(executionKey);
      });
    },
    disable
  });

  const loadSnapshot = () => {
    try {
      const snapshot = session.read();
      session.adopt?.(snapshot);
      store.dispatch({ type: "session-loaded", snapshot });
      return snapshot;
    } catch (error) {
      diagnostics?.record?.("error", "Could not read the Foundry session", error);
      store.dispatch({ type: "session-error", error });
    }
  };

  const start = () => {
    if (runtimeScope || starting || stopping) return;
    starting = true;
    const cancelled = new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.MCMobileActivationWasCancelled", "Mikelandia Controls activation was canceled."));
    try {
      // Commands need their provisional owner during initial rendering. Public
      // activation and reconnect access remain closed until every stage succeeds.
      runtimeScope = createTaskScope("application", performanceObserver);
      const owner = runtimeScope;
      dismissedActionSessions.clear();
      let previousActionSession = store.state.actionSession;
      owner.own(store.subscribe((state) => {
        if (previousActionSession && !state.actionSession) {
          rememberDismissedSession(previousActionSession.rootMessageId);
          for (const execution of activeSummaryExecutions) {
            if (execution.roots.has(previousActionSession.rootMessageId)) execution.dismissed = true;
          }
        }
        previousActionSession = state.actionSession;
      }, { immediate: false }));
      owner.own(() => {
        dismissedActionSessions.clear();
        activeActionExecutions.clear();
        activeSummaryExecutions.clear();
        actionExecutionSequence += 1;
      });
      const assertCurrent = () => { if (owner.disposed || runtimeScope !== owner) throw cancelled; };
      resynchronizer = createAuthoritativeResynchronizer({
        generation: connectionGeneration,
        fetchSnapshot: async (context) => {
          const result = await authoritativeGateway.resync({
            ...context,
            onProgress: ({ checkpoint, detail, timings }) => {
              if (!context.isCurrent()) return;
              loadTimingGateway?.note?.({ checkpoint });
              store.dispatch({ type: "reconnect-progress", generation: context.generation, checkpoint, detail, timings });
            }
          });
          if (!result.applied || !context.isCurrent()) return null;
          loadTimingGateway?.note?.({ checkpoint: "mobile-session" });
          store.dispatch({ type: "reconnect-progress", generation: context.generation, checkpoint: "mobile-session", detail: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.RestoringYourSession", "Restoring your session…"), timings: result.timings });
          return session.read();
        },
        applySnapshot: async (snapshot, generation, context) => {
          if (!context.isCurrent()) return;
          const journalId = store.state.journal?.id ?? "";
          const pageId = store.state.journalPageId;
          loadTimingGateway?.note?.({ checkpoint: "presentation" });
          store.dispatch({ type: "reconnect-progress", generation, checkpoint: "presentation", detail: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.RestoringMobileInterface", "Restoring mobile interface…") });
          session.adopt?.(snapshot);
          store.dispatch({ type: "session-loaded", snapshot });
          if (journalId && snapshot.journals?.some((journal) => journal.id === journalId)) {
            void commands.openJournal(journalId).then((journal) => {
              if (context.isCurrent() && journal?.id === journalId && store.state.journal?.id === journalId) {
                commands.selectJournalPage(pageId);
              }
            }).catch(() => {});
          }
          await nextRenderedFrame();
          if (!context.isCurrent()) return;
          loadTimingGateway?.note?.({ checkpoint: "interactions" });
          store.dispatch({ type: "reconnect-progress", generation, checkpoint: "interactions", detail: localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.RestoringControls", "Restoring controls…") });
          await nextRenderedFrame();
        },
        onError: (error) => diagnostics?.record?.("error", "Authoritative reconnect resynchronisation failed", error)
      });
      const ownedResynchronizer = resynchronizer;
      runtimeScope.own(() => ownedResynchronizer.dispose());
      const nativeApplications = preparePresentation(runtimeScope);
      assertCurrent();
      frame = createFrame({ store, commands, policy: readPolicy, scope: runtimeScope, mobileBackGateway, performanceObserver, nativeApplications });
      assertCurrent();
      runtimeScope.own(store.subscribe(state => {
        if (state.reconnect || state.modeTransition) actorEditorGateway?.closeAll?.();
      }, { immediate: false }));
      frame.mount();
      assertCurrent();
      const initialSnapshot = session.watch(runtimeScope, (snapshot) => store.dispatch({ type: "session-loaded", snapshot }), (error) => {
        diagnostics?.record?.("error", "The Foundry session stopped updating", error);
        store.dispatch({ type: "session-error", error });
      }, { onJournalChange: (journalId) => {
        const state = store.state;
        if (state.journal?.id !== journalId || state.route !== "journals") return;
        void commands.openJournal(journalId, { pageId: state.journalPageId }).catch((error) => {
          diagnostics?.record?.("error", "The open Journal could not be refreshed", error);
        });
      } });
      assertCurrent();
      if (initialSnapshot) store.dispatch({ type: "session-loaded", snapshot: initialSnapshot });
      if (targetingGateway) {
        targetingGateway.watch(runtimeScope, () => store.state.selectedActorSourceUuid,
          targeting => store.dispatch({ type: "targeting-updated", targeting }),
          { isVisible: () => targetsVisible(store.state) });
        let source = store.state.selectedActorSourceUuid;
        let visible = targetsVisible(store.state);
        runtimeScope.own(store.subscribe(state => {
          const nextVisible = targetsVisible(state);
          if (source === state.selectedActorSourceUuid && visible === nextVisible) return;
          source = state.selectedActorSourceUuid;
          visible = nextVisible;
          targetingGateway.refresh(source);
        }, { immediate: false }));
      }
      assertCurrent();
      modeTransition = createModeTransitionCoordinator({
    localize,
        readPolicy,
        capture: () => frame?.captureModeTransitionState?.(),
        apply: (policy) => {
          store.dispatch({ type: "layout-policy-changed", formFactor: policy.formFactor, orientation: policy.orientation, canvasAvailable: policy.canvasAvailable });
        },
        settle: ({ isCurrent }) => frame?.settleModeTransition?.({ isCurrent }),
        restore: (preserved, bounds, { isCurrent }) => frame?.restoreModeTransitionState?.(preserved, bounds, { isCurrent }),
        onStart: ({ generation, policy, preserved }) => {
          activeEffectContextGateway?.close?.();
          performanceObserver?.increment?.("mode-transition.run");
          store.dispatch({ type: "mode-transition-started", generation, target: presentationLabel(policy, localize) });
          diagnostics?.record?.("debug", `MODE TRANSITION ${JSON.stringify({ event: "started", generation, from: preserved?.formFactor ?? "unknown", to: policy.formFactor, requested: policy.preference ?? policy.runtimeMode ?? policy.formFactor, viewportBefore: preserved?.visualViewport ?? preserved?.viewportBounds ?? null, route: preserved?.route ?? store.state.route })}`);
        },
        onProgress: ({ generation, phase, detail }) => store.dispatch({ type: "mode-transition-progress", generation, phase, detail }),
        onCheckpoint: ({ generation, checkpoint, state, elapsedMs, details }) => {
          const level = state === "stalled" || state === "failed" ? "warn" : "debug";
          diagnostics?.record?.(level, `MODE TRANSITION ${JSON.stringify({ event: state, generation, checkpoint, elapsedMs, ...details })}`);
        },
        onFinish: ({ generation, policy, timings }) => {
          store.dispatch({ type: "mode-transition-finished", generation });
          const after = frame?.modeTransitionDiagnosticSnapshot?.() ?? null;
          const slowest = Object.entries(timings ?? {}).filter(([name]) => name !== "total").sort((left, right) => right[1] - left[1])[0] ?? [];
          diagnostics?.record?.("info", `MODE TRANSITION ${JSON.stringify({ event: "completed", generation, to: policy.formFactor, orientation: policy.orientation, timings, slowestCheckpoint: slowest[0] ?? "unknown", totalMs: timings?.total ?? 0, viewportAfter: after?.visualViewport ?? after?.viewportBounds ?? null, route: after?.route ?? store.state.route, rootCount: after?.rootCount ?? null, interactionListeners: after?.interactionListeners ?? null })}`);
        },
        onError: (error, { generation, checkpoint }) => {
          frame?.cancelModeTransitionRestore?.();
          store.dispatch({ type: "mode-transition-failed", generation });
          diagnostics?.record?.("error", `Mode change stalled at ${checkpoint}`, error);
        }
      });
      const ownedModeTransition = modeTransition;
      runtimeScope.own(() => ownedModeTransition.dispose());
      const invalidateView = ({ force = false } = {}) => {
        const policy = readPolicy();
        if (!force && shouldPreserveEditableSurfaceOnViewportResize({
          activeElement: window.document?.activeElement,
          currentFormFactor: store.state.formFactor,
          currentOrientation: store.state.orientation,
          nextPolicy: policy
        })) return;
        const presentationChanged = policy.formFactor !== store.state.formFactor || policy.orientation !== store.state.orientation;
        if (force || presentationChanged) modeTransition?.request();
      };
      runtimeScope.listen(window, "resize", () => invalidateView(), { passive: true });
      runtimeScope.listen(window.visualViewport, "resize", () => invalidateView(), { passive: true });
      runtimeScope.listen(window.screen?.orientation, "change", () => invalidateView({ force: true }), { passive: true });
      runtimeScope.listen(window.matchMedia("(prefers-color-scheme: light)"), "change", () => store.dispatch({ type: "view-invalidated" }));
      modeTransition.request();
      assertCurrent();
      activationCommitted = true;
      frame?.refreshControlsInvitation?.();
    } catch (error) {
      stop();
      if (error !== cancelled) throw error;
    } finally {
      starting = false;
    }
  };

  const stop = () => {
    if (stopping) return;
    stopping = true;
    activationCommitted = false;
    const owned = { scope: runtimeScope, frame, modeTransition, resynchronizer };
    runtimeScope = null;
    frame = null;
    modeTransition = null;
    resynchronizer = null;
    journalRequestSequence += 1;
    try {
      // Each owner gets its cleanup even if another owner fails. Invalidate
      // asynchronous generations before removing their presentation targets.
      for (const cleanup of [
        () => owned.modeTransition?.dispose(),
        () => owned.resynchronizer?.dispose(),
        () => owned.frame?.unmount(),
        () => owned.scope?.dispose(),
        () => store.dispatch({ type: "clear-character-presentation" }),
        () => store.dispatch({ type: "reconnect-cleared" }),
        () => store.dispatch({ type: "mode-transition-cleared" })
      ]) {
        try { cleanup(); }
        catch (error) {
          try { diagnostics?.record?.("warn", "Application cleanup failed", error); }
          catch { /* Cleanup reporting must not hide a startup failure. */ }
        }
      }
    } finally {
      stopping = false;
    }
  };

  return Object.freeze({
    get active() {
      return activationCommitted;
    },
    combatControlLifecycleToken() {
      return runtimeScope;
    },
    reconcile() {
      // The bootstrap surface owns startup. Session readers may only run once
      // Foundry has completed startup and the session is ready.
      if (readPolicy().sessionReady === false) return;
      if (stopping) return;
      if (starting) {
        if (!readPolicy().active) stop();
        return;
      }
      if (readPolicy().active) {
        if (runtimeScope) {
          const policy = readPolicy();
          if (policy.formFactor !== store.state.formFactor || policy.orientation !== store.state.orientation) modeTransition?.request();
          else store.dispatch({ type: "view-invalidated" });
        }
        else start();
      } else stop();
    },
    stop,
    refresh() {
      if (activationCommitted) loadSnapshot();
    },
    beginReconnect(generation) {
      if (!activationCommitted) return false;
      const activeGeneration = Math.max(0, Number(generation) || 0);
      if (connectionGeneration && !connectionGeneration.matches(activeGeneration)) connectionGeneration.advance(activeGeneration);
      store.dispatch({ type: "reconnect-started", generation: activeGeneration });
      diagnostics?.record?.("debug", `Reconnect generation ${activeGeneration} is waiting for transport recovery`);
      return true;
    },
    async resync(generation) {
      if (!activationCommitted || !resynchronizer) return Object.freeze({ applied: false });
      const activeGeneration = Math.max(0, Number(generation) || 0);

      if (store.state.reconnect?.generation !== activeGeneration) {
        store.dispatch({ type: "reconnect-started", generation: activeGeneration });
      }
      const startedAt = globalThis.performance?.now?.() ?? Date.now();
      store.dispatch({ type: "reconnect-resynchronising", generation: activeGeneration, startedAt, lastSuccessfulMs: loadTimingGateway?.lastSuccessfulResyncMs ?? null });
      loadTimingGateway?.note?.({ type: "resync", resyncDurationMs: null, canvasDurationMs: null,
        canvasSucceeded: null, hardReload: false, checkpoint: "collections" });
      const finishMeasurement = performanceObserver?.start?.("reconnect.total") ?? (() => {});
      performanceObserver?.increment?.("reconnect.run");
      diagnostics?.record?.("debug", `Reconnect generation ${activeGeneration} began authoritative resynchronisation`);
      const result = await resynchronizer.run(activeGeneration);
      finishMeasurement();
      if (!runtimeScope || store.state.reconnect?.generation !== activeGeneration || (connectionGeneration && !connectionGeneration.matches(activeGeneration))) return result;
      if (result.applied) {
        const elapsed = Math.round((globalThis.performance?.now?.() ?? Date.now()) - startedAt);
        loadTimingGateway?.note?.({ type: "resync", resyncDurationMs: elapsed, checkpoint: "ready" });
        try { await loadTimingGateway?.saveResync?.(elapsed); }
        catch (error) { diagnostics?.record?.("warn", "Could not save successful resync duration", error); }
        if (!runtimeScope || store.state.reconnect?.generation !== activeGeneration || (connectionGeneration && !connectionGeneration.matches(activeGeneration))) return Object.freeze({ applied: false, generation: activeGeneration });
        store.dispatch({ type: "reconnect-finished", generation: activeGeneration });
        diagnostics?.record?.("info", `Reconnect generation ${activeGeneration} became interactive after ${elapsed}ms`);
      } else {
        const failure = result.error ?? new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.RecoveryCouldNotReachATrustworthyReadyState", "Recovery could not reach a trustworthy ready state."));
        loadTimingGateway?.note?.({ type: "hard reload", hardReload: true, canvasSucceeded: false,
          checkpoint: failure.reconnectCheckpoint ?? "recovery" });
        store.dispatch({ type: "reconnect-reloading", generation: activeGeneration });
        runtimeScope.timeout(() => {
          if (runtimeScope && store.state.reconnect?.generation === activeGeneration && (!connectionGeneration || connectionGeneration.matches(activeGeneration))) reloadApplication();
        }, 450);
        diagnostics?.record?.("error", "Resync failed; reloading Foundry", failure);
      }
      return result;
    },
    open(route) {
      store.dispatch({ type: "navigate", route });
    },
    async openJournalTarget(journalId, target = {}) {
      if (!activationCommitted || readPolicy().runtimeMode === "desktop") throw new Error(localizedText(localize, "MIKELANDIA_CONTROLS.Interface.AppKernel.TheMobileJournalReaderIsInactive", "The mobile Journal reader is inactive."));
      const journal = await commands.openJournal(journalId, target);
      if (!activationCommitted || !journal || store.state.journal?.id !== journal.id) return journal;
      store.dispatch({ type: "navigate", route: "journals" });
      return journal;
    },
    openControlsGuide: anchor => frame?.openControlsGuide?.(anchor),
    refreshControlsInvitation: () => frame?.refreshControlsInvitation?.(),
    snapshot() {
      return store.state.snapshot ? structuredClone(store.state.snapshot) : null;
    }
  });
}

function nextRenderedFrame() {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(() => resolve());
    else queueMicrotask(resolve);
  });
}

export async function restoreMcSettingsDefaults({  preferencesGateway, guardConnection = (action) => action(), invalidate = () => {} }) {
  const result = await guardConnection(() => preferencesGateway.restoreDefaults());
  invalidate();
  return Object.freeze({ ...result, requiresReload: Boolean(result.requiresReload) });
}

/** Avoid destroying an active Mikelandia Controls-owned editor when only the software keyboard changes the visual viewport. */
export function shouldPreserveEditableSurfaceOnViewportResize({ activeElement, currentFormFactor, currentOrientation, nextPolicy } = {}) {
  if (!activeElement?.closest?.(".mc-mobile-app")) return false;
  const editable = activeElement.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  return Boolean(editable
    && nextPolicy?.formFactor === currentFormFactor
    && nextPolicy?.orientation === currentOrientation);
}
