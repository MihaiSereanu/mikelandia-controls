import { icon, node } from "../primitives/dom.mjs";
import { controlsGuideSections } from "../../features/help/controls-guide-model.mjs";

/** Shared Desktop/mobile guide. It is appended above, never remounts its route. */
export function createControlsGuide({ scope, readContext, localize, onVisibility = () => {} }) {
  const text = key => localize(`MIKELANDIA_CONTROLS.Controls.${key}`);
  let opener = null;
  const body = node("div", { className: "mc-controls-guide-body", attrs: { tabindex: "0" } });
  const closeLabel = node("span", { text: text("Close") });
  const close = node("button", { className: "mc-button-accent-outline", attrs: { type: "button" }, children: [icon("fa-xmark"), closeLabel] });
  const title = node("h2", { text: text("Title"), attrs: { id: "mc-controls-guide-title" } });
  const card = node("section", { className: "mc-controls-guide-card", children: [
    node("header", { children: [icon("fa-hand-pointer"), title] }), body,
    node("footer", { children: [close] })
  ] });
  const element = node("div", { className: "mc-controls-guide", attrs: { hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "mc-controls-guide-title", "data-mc-back-kind": "controls-guide", "data-mc-back-dismissable": "true" }, children: [card] });
  function hide() {
    if (element.hidden) return;
    element.hidden = true;
    onVisibility(false);
    if (opener?.isConnected && !opener.closest?.("[hidden]")) opener.focus?.({ preventScroll: true });
    else element.closest(".mc-mobile-app")?.querySelector(".mc-bottom-nav button")?.focus?.({ preventScroll: true });
    opener = null;
  }
  scope.listen(close, "click", hide);
  scope.listen(element, "mc-close", hide);
  scope.listen(element, "keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); hide(); }
    if (event.key !== "Tab") return;
    const targets = [body, close];
    const index = targets.indexOf(element.ownerDocument.activeElement);
    event.preventDefault();
    targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus();
  });
  scope.own(() => { hide(); element.remove(); });
  // Only bold markers are interpreted; localized copy never becomes HTML.
  const formatted = copy => copy.split(/(\*\*[^*]+\*\*)/u).filter(Boolean).map(part =>
    part.startsWith("**") ? node("strong", { text: part.slice(2, -2) }) : part);
  const tabEntry = key => {
    const copy = text(`Entries.${key}`), separator = copy.indexOf(": ");
    return separator < 0 ? node("p", { children: formatted(copy) }) : node("div", {
      className: "mc-controls-guide-entry", children: [
        node("h4", { text: copy.slice(0, separator) }),
        node("p", { children: formatted(copy.slice(separator + 2)) })
      ]
    });
  };
  const renderCopy = () => body.replaceChildren(...controlsGuideSections(readContext()).map(section => node("section", { children: [
    node("h3", { text: text(`Sections.${section.id}`) }),
    ...(section.id === "controls" ? [node("ul", { className: "mc-controls-guide-tips", children: section.entries.map(key =>
      node("li", { children: formatted(text(`Entries.${key}`)) })) })] : section.entries.map(tabEntry))
  ] })));
  const refreshLabels = () => {
    title.textContent = text("Title");
    closeLabel.textContent = text("Close");
    renderCopy();
  };
  return Object.freeze({ element, hide,
    refresh() {
      if (scope.disposed || element.hidden) return;
      const scrollTop = body.scrollTop;
      refreshLabels();
      body.scrollTop = scrollTop;
    },
    show(anchor = element.ownerDocument.activeElement) {
      if (scope.disposed) return;
      opener = anchor;
      refreshLabels();
      body.scrollTop = 0;
      element.hidden = false;
      onVisibility(true);
      close.focus({ preventScroll: true });
    }
  });
}
