const STATE = "data-ve-mobile-ui-state";
const OWNED_ROOTS = ".ve-mobile-app, .ve-mobile-bootstrap, .ve-mobile-admitted-app, .ve-mobile-settings-app, .ve-mobile-native-control";
const FEEDBACK_ROOTS = "#notifications, #tooltip, #dice-box-canvas";

/** Hide foreign branches, rather than relying on inherited visibility. Hosts
 * of approved native windows remain transparent; their unrelated siblings do
 * not become visible merely because an approved descendant lives there. */
export function enableMobileUiIsolation(scope, { document = globalThis.document, MutationObserverType = globalThis.MutationObserver } = {}) {
  const marked = new Set();
  const displayValues = new Map();
  const restoreDisplay = element => {
    const prior = displayValues.get(element);
    if (!prior) return;
    if (element.style.getPropertyValue("display") === prior.forced && element.style.getPropertyPriority("display") === "important") {
      if (prior.value) element.style.setProperty("display", prior.value, prior.priority);
      else element.style.removeProperty("display");
    }
    displayValues.delete(element);
  };
  const setState = (element, state) => {
    if (state) {
      if (element.getAttribute(STATE) !== state) element.setAttribute(STATE, state);
      marked.add(element);
      const desired = state === "blocked" ? "none" : "contents";
      const value = element.style.getPropertyValue("display"), priority = element.style.getPropertyPriority("display");
      let prior = displayValues.get(element);
      if (!prior) { prior = { value, priority, forced: desired }; displayValues.set(element, prior); }
      else if (value !== prior.forced || priority !== "important") {
        prior.value = value; prior.priority = priority;
      }
      prior.forced = desired;
      if (value !== desired || priority !== "important") element.style.setProperty("display", desired, "important");
    } else if (marked.delete(element)) {
      element.removeAttribute(STATE);
      restoreDisplay(element);
    }
  };
  const allowed = element => element.matches(`${OWNED_ROOTS}, ${FEEDBACK_ROOTS}`);
  const clearBranch = element => {
    setState(element, null);
    for (const child of element.querySelectorAll(`[${STATE}]`)) setState(child, null);
  };
  const visit = element => {
    if (allowed(element)) { clearBranch(element); return; }
    if (element.querySelector(`${OWNED_ROOTS}, ${FEEDBACK_ROOTS}`)) {
      setState(element, "host");
      for (const child of element.children) visit(child);
    } else setState(element, "blocked");
  };
  const reconcile = () => {
    if (scope.disposed) return;
    for (const element of marked) if (!element.isConnected) setState(element, null);
    for (const element of document.body?.children ?? []) visit(element);
  };
  const observer = MutationObserverType && document?.body ? new MutationObserverType(reconcile) : null;
  observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "id", "role", "popover", "style"] });
  scope.own(() => {
    observer?.disconnect();
    for (const element of marked) { element.removeAttribute(STATE); restoreDisplay(element); }
    marked.clear();
  });
  reconcile();
  return Object.freeze({ reconcile });
}

const ownedApplications = new WeakSet();
const pendingWorkflows = new Set();

/** Core confirmation/choice dialogs may be created after awaited native work.
 * This grants no admission to arbitrary Application or module widget classes. */
export async function runMobileApplicationWorkflow(action, isActive = () => true) {
  pendingWorkflows.add(isActive);
  try { return await action(); }
  finally { pendingWorkflows.delete(isActive); }
}

export function mobileWorkflowPending() { return [...pendingWorkflows].some(active => active()); }

/** Ownership is assigned before asynchronous native rendering begins. */
export function ownMobileApplication(application) {
  if (application && typeof application === "object") ownedApplications.add(application);
  return application;
}

export function mobileApplicationOwned(application) {
  return Boolean(application && ownedApplications.has(application));
}
