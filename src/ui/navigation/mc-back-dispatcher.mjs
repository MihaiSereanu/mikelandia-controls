const ROUTE_HISTORY_LIMIT = 16;

/**
 * Resolve one logical Mikelandia Controls Back action without delegating to browser navigation.
 * State-owned surfaces are closed before transient DOM-owned surfaces so a
 * single physical Back press always unwinds exactly one visible layer.
 */
export function createMcBackDispatcher({
  getState,
  commands,
  nativeApplications = null,
  getRoot = () => null,
}) {
  const next = () => {
    const state = getState?.() ?? {};
    const guide = getRoot?.()?.querySelector?.(".mc-controls-guide:not([hidden])");
    if (guide) return ["controls-guide", () => closeTransient(guide)];
    const admitted = nativeApplications?.topmost?.();
    if (admitted) return ["native-application", () => {
      if (nativeApplications?.closeTopmost) nativeApplications.closeTopmost();
      else if (typeof admitted.application?.close === "function") void Promise.resolve(admitted.application.close()).catch(() => {});
      else closeTransient(admitted.element);
    }];

    // A native dialog sits above Character detail and other Mikelandia Controls-owned sheets.
    // Dismiss its own close control before navigating or closing an item.
    const nativeDialog = topmostTransient(getRoot?.(), true);
    if (nativeDialog) return ["native-dialog", () => closeTransient(nativeDialog)];
    if (state.actionSession) return ["action-session", () => commands.dismissActionSession?.()];
    if (state.hitPointEditor) return ["hit-point-editor", () => commands.closeHitPointEditor?.()];
    if (state.restEditor) return ["rest-editor", () => commands.closeRestEditor?.()];
    if (state.spellSlotEditor) return ["spell-slot-editor", () => commands.closeSpellSlotEditor?.()];
    if (state.xpEditor) return ["experience-editor", () => commands.closeExperienceEditor?.()];
    if (state.portraitImage) return ["portrait-viewer", () => commands.closeCharacterPortrait?.()];
    if (state.journalImage) return ["journal-image-viewer", () => commands.closeJournalImage?.()];
    if (state.journalMenuOpen) return ["journal-page-menu", () => commands.closeJournalMenu?.()];
    if (state.characterItemId) return ["item-detail", () => commands.closeCharacterItem?.()];

    const transient = topmostTransient(getRoot?.());
    if (transient) return [
      transient.dataset?.mcBackKind || (transient.classList?.contains?.("mc-mobile-dialog") ? "native-dialog" : "transient-surface"),
      () => closeTransient(transient)
    ];

    if (state.route === "journals" && state.journal) return ["journal-detail", () => commands.closeJournal?.()];
    if (state.route === "characters" && state.characterNavigation?.length) return ["actor-origin", () => commands.returnToActorOrigin?.()];

    if (state.route !== "characters") return ["character-home", () => commands.returnToCharacter?.()];
    return ["root"];
  };
  return Object.freeze({
    peek: () => next()[0],
    back() {
      const [name, action] = next();
      action?.();
      return name;
    }
  });
}

function topmostTransient(root, dialogsOnly = false) {
  if (!root?.querySelectorAll) return null;
  const selectors = dialogsOnly ? [".mc-mobile-dialog:not([hidden])"] : [
    ".mc-biography-editor-layer",
    ".mc-currency-editor-layer",
    ".mc-character-item-menu",
    ".mc-settings-report-modal:not([hidden])",
    ".mc-mobile-dialog:not([hidden])",
    "[data-mc-back-dismissable='true']:not([hidden])"
  ];
  const matches = Array.from(root.querySelectorAll(selectors.join(",")))
    .filter((element) => element?.isConnected !== false && element?.hidden !== true
      && (!dialogsOnly || element.classList?.contains?.("mc-mobile-dialog")));
  return matches.at(-1) ?? null;
}

function closeTransient(element) {
  if (element?.classList?.contains?.("mc-mobile-dialog")) {
    const control = element.querySelector?.([
      "[data-action='close']",
      ".window-header button.close",
      ".window-header .header-control.close",
      "button[aria-label='Close']"
    ].join(","));
    if (control?.click) {
      control.click();
      return;
    }
  }
  element?.dispatchEvent?.(closeEvent(element));
}

function closeEvent(element) {
  const EventClass = element?.ownerDocument?.defaultView?.Event ?? globalThis.Event;
  return typeof EventClass === "function" ? new EventClass("mc-close") : { type: "mc-close" };
}

export function pushRouteHistory(history = [], route, limit = ROUTE_HISTORY_LIMIT) {
  const next = [...history, String(route ?? "")].filter(Boolean);
  return Object.freeze(next.slice(-Math.max(1, Number(limit) || ROUTE_HISTORY_LIMIT)));
}

export function popRouteHistory(history = []) {
  if (!history.length) return Object.freeze({ route: "", history: Object.freeze([]) });
  return Object.freeze({ route: history.at(-1), history: Object.freeze(history.slice(0, -1)) });
}
