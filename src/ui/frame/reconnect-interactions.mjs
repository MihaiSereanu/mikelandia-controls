const CONTROLS = 'button, input, select, textarea, a, summary, [role="button"], [tabindex], [contenteditable="true"]';
const NAVIGATION_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"];

/** Block activation, not touch/wheel scrolling or reading, while data is unverified. */
export function createReconnectInteractionGuard({ root, scope }) {
  let active = false;
  const saved = new Map();
  const exempt = element => element?.closest?.(".mc-reconnect-status");
  const sync = () => {
    if (!active) return;
    for (const control of root.querySelectorAll(CONTROLS)) {
      if (exempt(control)) continue;
      if (!saved.has(control)) saved.set(control, {
        ariaDisabled: control.getAttribute("aria-disabled"), tabIndex: control.getAttribute("tabindex")
      });
      control.setAttribute("aria-disabled", "true");
      control.setAttribute("tabindex", "-1");
    }
  };
  const restore = () => {
    for (const [control, attributes] of saved) {
      for (const [key, value] of [["aria-disabled", attributes.ariaDisabled], ["tabindex", attributes.tabIndex]]) {
        if (value === null) control.removeAttribute(key);
        else control.setAttribute(key, value);
      }
    }
    saved.clear();
  };
  const block = event => {
    if (!active || exempt(event.target)) return;
    if (event.type === "pointerdown" && !event.target?.closest?.(CONTROLS)) return;
    if (event.type === "keydown") {
      const nativeValueControl = event.target?.closest?.('select, input[type="number"], input[type="range"]');
      if (nativeValueControl && NAVIGATION_KEYS.includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // Keep browser scrolling, text selection/copy and focus traversal available.
      if (["Tab", "Escape"].includes(event.key) || NAVIGATION_KEYS.includes(event.key)
        || ((event.ctrlKey || event.metaKey) && ["a", "c"].includes(event.key.toLowerCase()))) return;
      if (!event.target?.closest?.(CONTROLS) && event.key === " ") return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of ["click", "dblclick", "contextmenu", "pointerdown", "keydown", "beforeinput", "input", "change", "submit", "drop", "paste", "cut"]) {
    scope.listen(root, type, block, { capture: true });
  }
  const observer = typeof MutationObserver === "function" ? new MutationObserver(sync) : null;
  scope.own(() => {
    active = false;
    observer?.disconnect();
    restore();
  });
  return Object.freeze({
    update(value) {
      const next = Boolean(value);
      if (active && !next) {
        observer?.disconnect();
        active = false;
        restore();
      } else if (next) {
        if (!active) observer?.observe(root, { childList: true, subtree: true });
        active = true;
        sync();
      }
    }
  });
}
