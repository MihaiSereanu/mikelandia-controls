/** Lift an admitted native window above page stacking/clipping without moving
 * its DOM or replacing the system's form, listeners, focus or close workflow. */
export function promoteNativeWindow(element) {
  if (typeof element?.showPopover !== "function" || element.matches?.("dialog, [popover]")) return null;
  try {
    element.setAttribute("popover", "manual");
    element.showPopover();
    if (!element.matches(":popover-open")) { element.removeAttribute("popover"); return null; }
  } catch { element.removeAttribute("popover"); return null; }
  let restored = false;
  return Object.freeze({
    raise() {
      if (restored || !element.isConnected) return;
      const active = element.ownerDocument.activeElement;
      if (element.matches(":popover-open")) element.hidePopover();
      element.showPopover();
      if (element.contains(active)) active.focus?.({ preventScroll: true });
    },
    restore() {
      if (restored) return;
      restored = true;
      try { if (element.matches(":popover-open")) element.hidePopover(); } catch { /* disconnected */ }
      element.removeAttribute("popover");
    }
  });
}
