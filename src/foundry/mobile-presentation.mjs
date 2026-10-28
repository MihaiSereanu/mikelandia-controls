import { localizeFoundry } from "./localization.mjs";
import { decorateNativeRollDialog } from "./native-roll-presentation.mjs";
import { promoteNativeWindow } from "./native-window-layer.mjs";
import { enableMobileUiIsolation, mobileApplicationOwned, mobileWorkflowPending } from "./mobile-ui-isolation.mjs";
const RESOLUTION_MESSAGE_KEYS = new Set([
  "ERROR.RESOLUTION.Screen",
  "ERROR.RESOLUTION.Scale",
  "ERROR.RESOLUTION.Window"
]);
const APPLICATION_LINEAGE_MS = 1000;
const NATIVE_APPLICATION_LAYER = 5100;
const NATIVE_APPLICATION_LAYER_PROPERTY = "--mc-mobile-native-app-layer";
const APPLICATION_CONTROL_SELECTOR = [
  "button",
  "[role='button']",
  "[role='menuitem']",
  "[role='tab']",
  "[data-action]",
  "a[href]",
  "input[type='button']",
  "input[type='submit']",
  "input[type='reset']",
  "input[type='file']",
  "summary"
].join(", ");
const APPLICATION_ORIGIN_SELECTOR = [
  ".mc-mobile-app",
  ".mc-mobile-bootstrap",
  ".mc-mobile-dialog",
  ".mc-mobile-transient-app",
  "#context-menu",
  "#prosemirror-dropdown"
].join(", ");

/**
 * Isolate the mobile renderer from desktop applications while retaining
 * ordinary Foundry notifications. Foundry's minimum-resolution warning is
 * irrelevant here because this renderer is deliberately designed for a
 * narrow viewport.
 */
export function enableMobilePresentation(scope, { isPersistentOverlay = () => false, isSettingsApplication = () => false, isActorEditor = () => false, isNativeDialog = () => false, now = () => Date.now(), trace = () => {} } = {}) {
  suppressFutureResolutionWarnings(scope);
  const applications = enableMobileApplications(scope, { isPersistentOverlay, isSettingsApplication, isActorEditor, isNativeDialog, now, trace });

  const removeResolutionWarnings = () => {
    for (const notification of document.querySelectorAll("#notifications .notification")) {
      if (!isResolutionWarning(notification.textContent)) continue;
      const close = notification.querySelector(".close, [data-action='close']");
      if (close instanceof HTMLElement) close.click();
      else notification.remove();
    }
  };

  const notifications = document.getElementById("notifications");
  const observer = notifications ? new MutationObserver(removeResolutionWarnings) : null;
  observer?.observe(notifications, { childList: true, subtree: true });
  scope.own(() => observer?.disconnect());
  removeResolutionWarnings();
  return applications;
}

/** Protect Mikelandia Controls-rendered roots; native roll styling is scoped separately. */
export function enableMcStyleAuthority(scope, {
  document = globalThis.document,
  enabled: initialEnabled = true,
  trace = () => {}
} = {}) {
  let enabled = Boolean(initialEnabled);
  const roots = () => [...(document?.querySelectorAll?.(".mc-mobile-app") ?? [])];
  const reconcile = () => {
    const activeRoots = roots();
    for (const root of activeRoots) {
      if (enabled) root.setAttribute("data-mc-style-authority", "");
      else root.removeAttribute("data-mc-style-authority");
    }
    trace({ enabled, authorityRoots: enabled ? activeRoots.length : 0, mode: "scoped-css", exceptionalSuppression: false });
  };
  scope.own(() => {
    enabled = false;
    reconcile();
  });
  reconcile();
  return Object.freeze({
    setEnabled(value) {
      enabled = Boolean(value);
      reconcile();
    },
    snapshot() {
      return Object.freeze({ enabled, authorityRoots: roots().filter((root) => root.hasAttribute("data-mc-style-authority")).length,
        mode: "scoped-css", exceptionalSuppression: false });
    }
  });
}

export function enableMobileApplications(scope, {
  isPersistentOverlay = () => false,
  isSettingsApplication = () => false,
  isActorEditor = () => false,
  isNativeDialog = () => false,
  now = () => Date.now(),
  trace = () => {},
  document = globalThis.document,
  browser = globalThis.window,
  getExistingApplications = () => [
    ...Object.values(globalThis.ui?.windows ?? {}),
    ...registryValues(globalThis.foundry?.applications?.instances)
  ],
  MutationObserverType = globalThis.MutationObserver,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (id) => clearTimeout(id)
} = {}) {
  const admissions = createMobileApplicationAdmissions(document?.body);
  const isolation = enableMobileUiIsolation(scope, { document, MutationObserverType });
  const closeGuards = new Map();
  const restoreClose = application => { closeGuards.get(application)?.(); closeGuards.delete(application); };
  scope.own(() => { for (const restore of closeGuards.values()) restore(); closeGuards.clear(); });
  const controls = new Map();
  const reconcileControls = () => {
    for (const [element, layer] of controls) if (!element.isConnected || !admissions.size) {
      layer.restore(); element.classList.remove("mc-mobile-native-control"); controls.delete(element);
    }
    if (!admissions.size) return;
    for (const element of document?.querySelectorAll?.("#context-menu, #prosemirror-dropdown") ?? []) {
      if (controls.has(element) || element.closest(".mc-mobile-admitted-app")) continue;
      element.classList.add("mc-mobile-native-control");
      const layer = promoteNativeWindow(element);
      if (layer) controls.set(element, layer);
      else element.classList.remove("mc-mobile-native-control");
    }
  };
  const pendingApplications = new Map();
  const existingApplications = new Set(getExistingApplications().filter(application => applicationElement(application)?.isConnected !== false && applicationElement(application)));
  const baselineElements = new WeakSet();
  for (const application of existingApplications) {
    const element = applicationElement(application);
    if (element) baselineElements.add(element);
  }
  for (const element of document?.querySelectorAll?.(".application, .app.window-app, dialog, [role='dialog']") ?? []) baselineElements.add(element);
  const lineage = createUserInteractionLineage({ now, trace, schedule, cancel });
  const beginLineage = (event) => lineage.begin(event);
  const admit = (application, rendered, { preExisting = false } = {}) => {
    const element = applicationElement(application, rendered);
    const key = application ?? element;
    if (application && (!element || element.isConnected === false)) pendingApplications.set(application, rendered);
    else if (application) pendingApplications.delete(application);
    const retained = admissions.has(key);
    const correlation = retained ? null : lineage.match(application, element);
    const baseline = preExisting || existingApplications.has(application) || baselineElements.has(element);
    const classification = classifyMobileApplication(element, application, {
      preExisting: baseline,
      retained,
      deliberate: Boolean(correlation),
      owned: mobileApplicationOwned(application),
      approvedParent: [application?.parent, application?.options?.parent, application?.options?.owner].some(parent => admissions.has(parent)),
      activeBaseline: baseline && (element?.matches?.("form, [role='dialog']") || element?.querySelector?.("form"))
        && element?.contains?.(document?.activeElement) && document?.activeElement !== document?.body,
      isPersistentOverlay,
      isSettingsApplication,
      isActorEditor,
      isNativeDialog
    });
    if (!classification.admitted) {
      restoreClose(application);
      admissions.release(key, element);
      isolation.reconcile();
      traceApplication(trace, "suppressed", application, element, correlation, classification, now(), document?.body, baseline);
      return;
    }
    if (!admissions.admit(key, element, classification.modal, correlation, application)) {
      traceApplication(trace, "suppressed", application, element, correlation, { reason: "disconnected application root", modal: false }, now(), document?.body, baseline);
      return;
    }
    if (correlation) lineage.claim(application, element);
    isolation.reconcile();
    if (application && !closeGuards.has(application)) closeGuards.set(application, disableMobileV2CloseAnimation(application));
    traceApplication(trace, "admitted", application, element, correlation, classification, now(), document?.body, baseline);
  };
  const release = (application, rendered) => {
    restoreClose(application);
    const element = applicationElement(application, rendered);
    pendingApplications.delete(application);
    admissions.release(application ?? element, element);
    traceApplication(trace, "disposed", application, element, null, { reason: "application close", modal: false }, now(), document?.body);
  };
  scope.listen(document, "pointerdown", beginLineage, { capture: true, passive: true });
  scope.listen(document, "click", beginLineage, { capture: true, passive: true });
  scope.listen(document, "keydown", beginLineage, { capture: true });
  scope.hook?.("renderApplication", admit);
  scope.hook?.("renderApplicationV1", admit);
  scope.hook?.("renderActorSheet", admit);
  scope.hook?.("renderApplicationV2", admit);
  scope.hook?.("closeApplication", release);
  scope.hook?.("closeApplicationV1", release);
  scope.hook?.("closeActorSheet", release);
  scope.hook?.("closeApplicationV2", release);
  for (const application of existingApplications) admit(application, null, { preExisting: true });
  for (const element of mobileDialogElements(document.body)) {
    if (!admissions.hasElement(element) && !element.closest?.(".mc-mobile-admitted-app, .mc-mobile-settings-app")) admit(null, element, { preExisting: baselineElements.has(element) });
  }
  // Foundry's registries can retain an already-closed Application while a
  // presentation switch is starting. Enforce the backdrop invariant before
  // the new Mikelandia Controls root becomes interactive rather than waiting for another DOM
  // mutation to trigger observer cleanup.
  admissions.reconcile();

  let pruneQueued = false;
  const observer = MutationObserverType && document?.body ? new MutationObserverType((mutations) => {
    // A lifecycle-owned root wins over the DOM-only dialog fallback when both
    // become connected in the same mutation delivery.
    for (const [application, rendered] of pendingApplications) {
      if (applicationElement(application, rendered)?.isConnected === true) admit(application, rendered);
    }
    for (const mutation of mutations) for (const node of mutation.addedNodes ?? []) {
      for (const element of mobileDialogElements(node)) {
        if (!admissions.hasElement(element) && !element.closest?.(".mc-mobile-admitted-app, .mc-mobile-settings-app")) admit(null, element);
      }
    }
    reconcileControls();
    if (pruneQueued || !admissions.size) return;
    pruneQueued = true;
    queueMicrotask(() => {
      pruneQueued = false;
      const removed = admissions.reconcile();
      if (removed) trace({ type: "application-admission-pruned", removed });
    });
  }) : null;
  observer?.observe(document.body, { childList: true, subtree: true });
  scope.own(() => observer?.disconnect?.());
  scope.listen(document, "pointerdown", (event) => {
    const top = event?.target?.closest?.(".mc-mobile-admitted-app");
    if (top) admissions.raise(top);
  }, { capture: true, passive: true });
  scope.listen(document, "mc-mobile-reveal-native", event => {
    const element = event.target?.closest?.(".mc-mobile-admitted-app");
    if (element) admissions.raise(element, true);
  });

  const visualViewport = browser?.visualViewport;
  const viewportProperties = ["--mc-mobile-viewport-height", "--mc-mobile-viewport-width", "--mc-mobile-viewport-top", "--mc-mobile-viewport-left"];
  const previousViewport = viewportProperties.map(name => [name, document.body.style.getPropertyValue(name), document.body.style.getPropertyPriority(name)]);
  const updateViewport = () => {
    const values = [visualViewport?.height ?? browser?.innerHeight ?? 0, visualViewport?.width ?? browser?.innerWidth ?? 0,
      visualViewport?.offsetTop ?? 0, visualViewport?.offsetLeft ?? 0];
    viewportProperties.forEach((name, index) => document.body.style.setProperty(name, `${Math.round(values[index])}px`));
  };
  updateViewport();
  scope.listen(visualViewport, "resize", updateViewport, { passive: true });
  scope.listen(visualViewport, "scroll", updateViewport, { passive: true });
  scope.listen(browser, "resize", updateViewport, { passive: true });

  scope.own(() => {
    lineage.dispose();
    pendingApplications.clear();
    admissions.clear();
    for (const [element, layer] of controls) { layer.restore(); element.classList.remove("mc-mobile-native-control"); }
    controls.clear();
    for (const [name, value, priority] of previousViewport) {
      if (value) document.body.style.setProperty(name, value, priority);
      else document.body.style.removeProperty(name);
    }
  });
  const reconcileApplications = () => admissions.reconcile(record => classifyMobileApplication(record.element, record.application, {
    retained: true, isPersistentOverlay, isSettingsApplication, isActorEditor, isNativeDialog
  }).admitted);
  return Object.freeze({ admissions, lineage, reconcileApplications });
}

/** Mobile window CSS fixes its dimensions, so V2 cannot receive the native
 * max-height transitionend event. Skip that animation through its public API;
 * otherwise close (and Shadowdark's waiting roll) hits a one-second timeout.
 * V1 sheets retain their original close method and lifecycle. */
export function disableMobileV2CloseAnimation(application) {
  const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2;
  const nativeV2 = typeof ApplicationV2 === "function" && application instanceof ApplicationV2;
  if ((!nativeV2 && application?.isV2 !== true) || typeof application.close !== "function") return () => {};
  const descriptor = Object.getOwnPropertyDescriptor(application, "close");
  if (descriptor?.configurable === false) return () => {};
  const original = application.close;
  let active = true;
  const close = function (options = {}) { return original.call(this, active ? { ...options, animate: false } : options); };
  application.close = close;
  return () => {
    active = false;
    if (application.close !== close) return;
    if (descriptor) Object.defineProperty(application, "close", descriptor);
    else delete application.close;
  };
}

/** Track admission by Application identity so a rerendered or already-closed
 * Application cannot leave a disconnected modal root holding the backdrop. */
export function createMobileApplicationAdmissions(body) {
  const records = new Map();
  const closing = new Set();
  const listeners = new Set();
  const publish = () => { for (const listener of listeners) listener(); };
  const clearClasses = (element, record) => {
    record?.restoreRollPresentation?.();
    record?.topLayer?.restore();
    element?.classList?.remove?.("mc-mobile-admitted-app", "mc-mobile-dialog", "mc-mobile-transient-app");
    if (!element?.style || !record) return;
    if (record.priorLayer) element.style.setProperty(NATIVE_APPLICATION_LAYER_PROPERTY, record.priorLayer, record.priorLayerPriority);
    else element.style.removeProperty(NATIVE_APPLICATION_LAYER_PROPERTY);
  };
  const refreshLayers = () => {
    let index = 0;
    for (const record of records.values()) record.element?.style?.setProperty?.(NATIVE_APPLICATION_LAYER_PROPERTY, String(NATIVE_APPLICATION_LAYER + index++));
    publish();
  };
  const reconcileBackdrop = (forceLayers = false, retain = null) => {
    let removed = false;
    for (const [key, record] of records) {
      if (record.element?.isConnected !== false && (!retain || retain(record))) continue;
      clearClasses(record.element, record);
      records.delete(key);
      closing.delete(key);
      removed = true;
    }
    if (removed || forceLayers) refreshLayers();
    body?.classList?.toggle?.("mc-mobile-dialog-open", [...records.values()].some((record) => record.modal));
  };
  return Object.freeze({
    get size() { return records.size; },
    watch(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get layers() { return [...records.values()].map((_, index) => `native-app:${index}`); },
    has: (key) => records.has(key),
    hasElement: (element) => [...records.values()].some((record) => record.element === element),
    topmost() {
      this.reconcile();
      const entries = [...records.entries()];
      const [key, record] = entries.at(-1) ?? [];
      return record ? Object.freeze({ key, application: record.application, element: record.element }) : null;
    },
    closeTopmost() {
      const top = this.topmost();
      if (!top || closing.has(top.key)) return false;
      closing.add(top.key);
      try {
        if (typeof top.application?.close === "function") {
          void Promise.resolve(top.application.close()).catch(() => closing.delete(top.key));
        } else {
          const control = top.element?.querySelector?.("[data-action='close'], .window-header button.close, .window-header .header-control.close, button[aria-label='Close']");
          if (control?.click) control.click();
          else {
            const EventClass = top.element?.ownerDocument?.defaultView?.Event ?? globalThis.Event;
            top.element?.dispatchEvent?.(typeof EventClass === "function" ? new EventClass("mc-close") : { type: "mc-close" });
          }
        }
      } catch {
        closing.delete(top.key);
        return false;
      }
      return true;
    },
    raise(element, force = false) {
      const entry = [...records].find(([, record]) => record.element === element);
      if (!entry) return false;
      if (!force && [...records.keys()].at(-1) === entry[0]) return true;
      records.delete(entry[0]);
      records.set(entry[0], entry[1]);
      entry[1].topLayer?.raise();
      refreshLayers();
      return true;
    },
    admit(key, element, modal, lineage = null, application = null) {
      if (!key || !element?.classList) return false;
      if (element.isConnected === false) {
        clearClasses(element, records.get(key));
        records.delete(key);
        closing.delete(key);
        reconcileBackdrop(true);
        return false;
      }
      const previous = records.get(key);
      if (previous?.element !== element) clearClasses(previous?.element, previous);
      else previous.restoreRollPresentation?.();
      const style = element.style;
      const priorLayer = previous?.element === element ? previous.priorLayer : style?.getPropertyValue?.(NATIVE_APPLICATION_LAYER_PROPERTY) ?? "";
      const priorLayerPriority = previous?.element === element ? previous.priorLayerPriority : style?.getPropertyPriority?.(NATIVE_APPLICATION_LAYER_PROPERTY) ?? "";
      records.delete(key);
      element.classList.add("mc-mobile-admitted-app");
      element.classList.remove("mc-mobile-dialog", "mc-mobile-transient-app");
      element.classList.add(modal ? "mc-mobile-dialog" : "mc-mobile-transient-app");
      const topLayer = previous?.element === element ? previous.topLayer : promoteNativeWindow(element);
      const restoreRollPresentation = decorateNativeRollDialog(element);
      records.set(key, Object.freeze({ element, application, modal: Boolean(modal), lineage, priorLayer, priorLayerPriority, topLayer, restoreRollPresentation }));
      reconcileBackdrop(true);
      return true;
    },
    release(key, element = null) {
      const previous = records.get(key);
      clearClasses(previous?.element, previous);
      if (element !== previous?.element) clearClasses(element);
      records.delete(key);
      closing.delete(key);
      reconcileBackdrop(true);
    },
    reconcile(retain = null) {
      const before = records.size;
      reconcileBackdrop(false, retain);
      return before - records.size;
    },
    clear() {
      for (const record of records.values()) clearClasses(record.element, record);
      records.clear();
      closing.clear();
      body?.classList?.remove?.("mc-mobile-dialog-open");
      publish();
    }
  });
}

export function mobileDialogElements(root) {
  if (!root?.matches || !root?.querySelectorAll) return [];
  const selector = [
    "dialog",
    "[role='dialog']",
    "#sd-roll-dialog",
    ".application.dialog",
    ".app.window-app.dialog",
    ".application.activity-choice",
    ".application.activity-usage",
    ".application.roll-configuration",
    ".application.midi-targeting",
    "#midi-qol-targetConfirmation"
  ].join(", ");
  const elements = root.matches(selector) ? [root] : [];
  elements.push(...root.querySelectorAll(selector));
  return elements;
}

/** Native windows require an explicit mobile workflow, approved parent, or
 * recognized roll UI. A render hook alone never grants admission. */
export function classifyMobileApplication(element, application = null, { preExisting = false, retained = false, activeBaseline = false, deliberate = false, owned = mobileApplicationOwned(application), approvedParent = false, isPersistentOverlay = () => false, isSettingsApplication = () => false, isActorEditor = () => false, isNativeDialog = () => false } = {}) {
  if (!element?.matches || element.closest?.(".mc-mobile-app, .mc-mobile-bootstrap")) return Object.freeze({ admitted: false, modal: false, reason: "Mikelandia Controls-owned" });
  if (element.isConnected === false) return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.DisconnectedApplicationRoot", "disconnected application root") });
  if (isSettingsApplication(application, element) || element.matches(".mc-mobile-settings-app")) return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.NativeSettingsSessionOwnsApplication", "native Settings session owns application") });
  if (element.matches("#interface, #sidebar, #hud, #players, #scene-controls, #scene-navigation, #hotbar")) {
    return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.PersistentShellOrOverlay", "persistent shell or overlay") });
  }
  const modal = element.matches("dialog, [role='dialog'], #sd-roll-dialog, .dialog, .activity-choice, .activity-usage, .roll-configuration, .midi-targeting, #midi-qol-targetConfirmation")
    || application?.options?.modal === true || isNativeDialog(application);
  // A persistent overlay may render a child surface through its own
  // Application lifecycle. Admitting that child as a native window would
  // stretch it across the viewport and make its transparent area eat taps.
  if (isPersistentOverlay(element, application) || (!modal && hasPersistentOverlayAncestor(element, isPersistentOverlay))) {
    return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.PersistentOverlay", "persistent overlay") });
  }
  if (actorSheetApplication(application) && !isActorEditor(application)) return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.ActorSheetReplacedByCharacter", "Actor sheet replaced by Character") });
  if (desktopSidebarApplication(application, element)) return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.DesktopSidebarWorkspaceReplacedByMCNavigation", "desktop sidebar workspace replaced by Mikelandia Controls navigation") });
  const nativeRollTypes = [globalThis.warhammer?.apps?.WarhammerRollDialogV2, globalThis.warhammer?.apps?.WarhammerRollDialog];
  const roll = isNativeDialog(application) || nativeRollTypes.some(Type => typeof Type === "function" && application instanceof Type)
    || element.matches("#sd-roll-dialog, .roll-configuration, .activity-choice, .activity-usage, .midi-targeting, #midi-qol-targetConfirmation");
  const framed = Boolean(element.querySelector?.(".window-header"));
  const coreDialogTypes = [globalThis.foundry?.applications?.api?.DialogV2, globalThis.foundry?.appv1?.api?.Dialog, globalThis.Dialog];
  const workflowDialog = mobileWorkflowPending() && coreDialogTypes.some(Type => typeof Type === "function" && application?.constructor === Type);
  if (!retained && !owned && !isActorEditor(application) && !roll && !approvedParent && !workflowDialog && !(deliberate && (modal || framed))) {
    return Object.freeze({ admitted: false, modal: false, reason: "outside an approved mobile workflow" });
  }
  if (preExisting && !retained && !modal && !activeBaseline && !owned && !isActorEditor(application)) return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.MobileActivationBaselineWorkspace", "mobile activation baseline workspace") });
  if (!application && !modal) return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.NoApplicationLifecycle", "no application lifecycle") });
  return Object.freeze({ admitted: true, modal, reason: modal ? localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.NativeModalApplication", "native modal application") : activeBaseline ? localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.ActiveBaselineWorkflow", "active baseline workflow") : preExisting ? localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.RetainedApplicationLifecycle", "retained application lifecycle") : localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.NewNativeApplicationLifecycle", "new native application lifecycle") });
}

function hasPersistentOverlayAncestor(element, isPersistentOverlay) {
  for (let parent = element?.parentElement; parent; parent = parent.parentElement) {
    // Foundry's body and desktop shell also contain module identity classes
    // (including scene-navigation classes). They are hosts, never the owning
    // overlay of an application rendered beneath them.
    if (parent.matches?.("body, html, #interface, #board, #hud, #sidebar, #scene-controls, #scene-navigation, #hotbar")) break;
    if (isPersistentOverlay(parent)) return true;
  }
  return false;
}

function actorSheetApplication(application) {
  if (!application) return false;
  // Ownership/configuration forms can also own an Actor document. Only the
  // native sheet hierarchy identifies the persistent presentation Mikelandia Controls replaces.
  const types = [globalThis.foundry?.applications?.sheets?.ActorSheetV2, globalThis.foundry?.appv1?.sheets?.ActorSheet];
  return types.some(type => typeof type === "function" && application instanceof type);
}

function desktopSidebarApplication(application, element) {
  // Collection directories remain persistent desktop workspaces. A framed,
  // separately rendered sidebar popout is an intentional native interaction
  // (for example, a filtered Chat view), even when it inherits SidebarTab.
  // The caller still enforces lifecycle ownership and activation-baseline rules.
  if (element.matches(".directory, .directory-popout")) return true;
  if (application && element.matches(".sidebar-popout") && element.querySelector?.(".window-header")) return false;
  const types = [globalThis.foundry?.applications?.sidebar?.SidebarTab, globalThis.foundry?.appv1?.sidebar?.SidebarTab];
  return element.matches(".sidebar-tab, .sidebar-popout, .directory-popout")
    || types.some(type => typeof type === "function" && application instanceof type);
}

/** A shared, conservative definition of activation which can create native UI. */
export function deliberateApplicationControl(event) {
  const target = event?.target;
  if (!target?.closest) return null;
  if (event.isTrusted === false) return null;
  if (event.type === "pointerdown" && (event.button != null && event.button !== 0 || event.isPrimary === false)) return null;
  if (event.type === "click" && event.button != null && event.button !== 0) return null;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return null;
  if (!["pointerdown", "click", "keydown", "submit"].includes(event.type)) return null;
  if (target.closest("[data-action='close'], .header-button.close, .window-header .close")) return null;
  const control = event.type === "submit" ? target.closest("form") : target.closest(APPLICATION_CONTROL_SELECTOR);
  if (!control || control.disabled === true || control.getAttribute?.("aria-disabled") === "true") return null;
  if (control.matches?.(".mc-main-nav-item, [data-route]")) return null;
  return control;
}

export function applicationInteractionOrigin(event) {
  const control = deliberateApplicationControl(event);
  if (!control) return null;
  // Native Settings has its own explicit session and child-window owner. Do
  // not let the generic policy apply a second, competing admission class.
  if (event.target.closest(".mc-mobile-settings-app")) return null;
  const root = event.target.closest(APPLICATION_ORIGIN_SELECTOR);
  if (!root) return null;
  return Object.freeze({ root, control, source: interactionSource(root), controlName: interactionControlName(control) });
}

/** Correlate at most one native window with a deliberate control. Explicit
 * application ownership covers asynchronous module-launched editors. */
export function createUserInteractionLineage({
  now = () => Date.now(),
  durationMs = APPLICATION_LINEAGE_MS,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (id) => clearTimeout(id),
  trace = () => {}
} = {}) {
  let generation = 0;
  let active = null;
  let timer = null;
  let lastClaim = null;
  let claimTimer = null;
  const clearTimer = () => {
    if (timer === null) return;
    cancel(timer);
    timer = null;
  };
  const clearClaim = () => {
    if (claimTimer !== null) cancel(claimTimer);
    claimTimer = null;
    lastClaim = null;
  };
  const expire = (reason) => {
    if (!active) return;
    trace({ type: "user-interaction-lineage", result: reason, generation: active.generation, source: active.source, control: active.controlName });
    active = null;
    clearTimer();
  };
  const snapshot = (record) => record ? Object.freeze({
    generation: record.generation,
    source: record.source,
    control: record.controlName,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt
  }) : null;
  return Object.freeze({
    begin(event) {
      const origin = applicationInteractionOrigin(event);
      if (!origin) return null;
      const time = now();
      if (!active && event.type === "click" && lastClaim?.control === origin.control && lastClaim.root === origin.root) return null;
      if (active && active.control === origin.control && active.root === origin.root && time <= active.expiresAt) {
        return snapshot(active);
      }
      expire("superseded");
      active = {
        generation: ++generation,
        source: origin.source,
        controlName: origin.controlName,
        control: origin.control,
        root: origin.root,
        startedAt: time,
        expiresAt: time + durationMs
      };
      trace({ type: "user-interaction-lineage", result: "started", generation, source: active.source, control: active.controlName });
      clearTimer();
      const expected = active;
      timer = schedule(() => {
        timer = null;
        if (active === expected) expire("expired");
      }, durationMs);
      return snapshot(active);
    },
    match() {
      if (!active) return null;
      if (now() > active.expiresAt) {
        expire("expired");
        return null;
      }
      return snapshot(active);
    },
    claim(application, element) {
      if (!active) return null;
      const matched = snapshot(active);
      clearClaim();
      lastClaim = { control: active.control, root: active.root };
      const expectedClaim = lastClaim;
      claimTimer = schedule(() => {
        claimTimer = null;
        if (lastClaim === expectedClaim) lastClaim = null;
      }, Math.min(500, durationMs));
      trace({
        type: "user-interaction-lineage",
        result: "correlated",
        generation: active.generation,
        source: active.source,
        control: active.controlName,
        application: applicationIdentity(application, element)
      });
      active = null;
      clearTimer();
      return matched;
    },
    dispose() { expire("disposed"); clearClaim(); },
    state() { return Object.freeze({ generation, active: Boolean(active), lineage: snapshot(active) }); }
  });
}

export function applicationIdentity(application, element = applicationElement(application)) {
  const parent = application?.parent ?? application?.options?.parent ?? null;
  return Object.freeze({
    class: String(application?.constructor?.name ?? "DOMApplication").slice(0, 80),
    appId: String(application?.appId ?? application?.id ?? application?.options?.id ?? element?.dataset?.appid ?? element?.id ?? "unknown").slice(0, 120),
    rootId: String(element?.id ?? "").slice(0, 120),
    parentAppId: parent ? String(parent.appId ?? parent.id ?? parent.options?.id ?? "unknown").slice(0, 120) : null
  });
}

function traceApplication(trace, result, application, element, lineage, classification, timestamp, body, baseline = false) {
  let paint = null;
  try {
    const rect = element.getBoundingClientRect();
    const view = element.ownerDocument.defaultView, style = view.getComputedStyle(element);
    const hit = element.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    paint = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height),
      display: style.display, visibility: style.visibility, opacity: style.opacity,
      topLayer: element.matches(":popover-open, :modal"), hitInside: Boolean(hit && element.contains(hit)) };
  } catch { /* Non-DOM diagnostics and closed roots. */ }
  trace({
    type: "application-render",
    ...applicationIdentity(application, element),
    owner: String(application?.constructor?.metadata?.module ?? element?.dataset?.moduleId ?? "unknown").slice(0, 80),
    baseline,
    paint,
    renderedAt: timestamp,
    mode: body?.dataset?.mcMobileFormFactor ?? (body?.classList?.contains?.("mc-mobile-split-screen") ? "tablet-split" : "mobile"),
    lineage: lineage?.generation ?? null,
    classification: classification?.reason ?? "unknown",
    result: String(result).toUpperCase()
  });
}

function interactionSource(root) {
  if (root?.matches?.("#hud.mc-mobile-native-hud-host")) return "native HUD";
  if (root?.matches?.(".mc-mobile-transient-app, .mc-mobile-dialog")) return "admitted transient application";
  if (root?.matches?.("#context-menu, #prosemirror-dropdown")) return "admitted native control";
  if (root?.matches?.(".mc-mobile-bootstrap")) return "Mikelandia Controls bootstrap";
  return "Mikelandia Controls";
}

function interactionControlName(control) {
  return String(control?.dataset?.action
    ?? control?.getAttribute?.("aria-label")
    ?? control?.getAttribute?.("data-tooltip")
    ?? control?.name
    ?? control?.id
    ?? control?.tagName
    ?? "control").slice(0, 120);
}

function applicationElement(application, rendered) {
  // V1 rerender hooks can supply only the replaced inner form. The Application
  // element remains the outer frame, including its header and Close control.
  const candidates = [application?.element, application?.element?.[0], rendered, rendered?.[0]];
  return candidates.find(candidate => candidate?.nodeType === 1 && candidate.isConnected !== false)
    ?? candidates.find(candidate => candidate?.nodeType === 1) ?? null;
}

function registryValues(registry) {
  if (!registry) return [];
  if (typeof registry.values === "function") return [...registry.values()];
  return Object.values(registry);
}

function suppressFutureResolutionWarnings(scope) {
  const notifications = globalThis.ui?.notifications;
  if (!notifications || typeof notifications.error !== "function") return;

  const original = notifications.error;
  const filteredError = function (message, options) {
    if (RESOLUTION_MESSAGE_KEYS.has(message)) return null;
    return original.call(this, message, options);
  };

  notifications.error = filteredError;
  scope.own(() => {
    if (notifications.error === filteredError) notifications.error = original;
  });
}

function isResolutionWarning(text) {
  const normalized = normalize(text);
  if (!normalized) return false;

  for (const key of RESOLUTION_MESSAGE_KEYS) {
    const template = globalThis.game?.i18n?.localize?.(key);
    if (!template || template === key) continue;
    if (templatePattern(template).test(normalized)) return true;
  }
  return false;
}

function templatePattern(template) {
  const parts = normalize(template).split(/\{[^}]+\}/u).map(escapePattern);
  return new RegExp(`^${parts.join(".*?")}$`, "u");
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
