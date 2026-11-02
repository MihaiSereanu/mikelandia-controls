import { node } from "./dom.mjs";
import { renderDescription } from "./description.mjs";

let nextId = 0;

/** Keep the safe initial content while Foundry enriches it in its exact document context. */
export function renderEnrichedDescription(source, className = "", { gateway, uuid, scope, fragment = false } = {}) {
  const result = renderDescription(source, className);
  if (!gateway || !uuid || !scope) return result;
  const { content } = result;
  content.dataset.descriptionUuid = uuid;
  let tooltip, body, back, heading, anchor, dismissInvoker, request = 0, history = [], busy = false;
  const alive = () => !scope.disposed;
  const place = () => {
    if (!anchor?.isConnected || !tooltip?.matches(":popover-open")) return;
    const rect = anchor.getBoundingClientRect(), bounds = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - bounds.width - 8))}px`;
    tooltip.style.top = `${rect.bottom + bounds.height + 8 <= innerHeight ? rect.bottom + 4 : Math.max(8, Math.min(rect.top - bounds.height - 4, innerHeight - bounds.height - 8))}px`;
  };
  const display = async (target, push = true) => {
    const ticket = ++request;
    body.textContent = "Loading description…";
    if (push) history.push(target);
    back.hidden = history.length < 2;
    heading.textContent = "Description";
    place();
    try {
      const preview = await gateway.preview(target);
      if (!alive() || request !== ticket) return;
      const rendered = renderDescription(preview.html, "", { enriched: true }).content;
      rendered.dataset.descriptionUuid = preview.uuid;
      body.replaceChildren(rendered);
      heading.textContent = preview.name;
    } catch (error) {
      if (alive() && request === ticket) body.textContent = error.message || "This description is unavailable.";
    }
    if (alive() && request === ticket) place();
  };
  const open = (link, target) => {
    if (!tooltip) {
      body = node("div", { className: "mc-reference-body", attrs: { "aria-live": "polite" } });
      heading = node("strong");
      back = node("button", { text: "Back", attrs: { type: "button", hidden: true } });
      tooltip = node("div", { className: "mc-profile-note-tooltip mc-reference-tooltip", attrs: {
        id: `mc-reference-${++nextId}`, popover: "auto", role: "dialog", "aria-label": "Referenced description"
      }, children: [node("header", { children: [back, heading] }), body] });
      content.append(tooltip);
      const observer = new ResizeObserver(place);
      observer.observe(tooltip);
      scope.own(() => observer.disconnect());
      scope.listen(window, "resize", place);
      scope.listen(back, "click", () => { history.pop(); void display(history.at(-1), false); });
      scope.listen(tooltip, "beforetoggle", event => { if (event.newState === "closed") { request++; anchor?.setAttribute("aria-expanded", "false"); } });
      scope.own(() => { request++; tooltip.remove(); });
    }
    if (!tooltip.matches(":popover-open")) {
      anchor = link; history = [];
      // Native invoker relationships preserve outside-tap dismissal inside other popovers.
      link.setAttribute("popovertarget", tooltip.id);
      link.setAttribute("aria-controls", tooltip.id);
      link.setAttribute("aria-expanded", "true");
      tooltip.showPopover({ source: link });
    } else if (link === anchor) { tooltip.hidePopover(); return; }
    void display(target);
  };
  const activate = event => {
    const link = event.target.closest?.("a.content-link[data-uuid], a.content-link.broken, a.inline-roll");
    if (!link || !content.contains(link)) return;
    // Evaluated rolls use Foundry's native result expansion listener.
    if (link.classList.contains("inline-result")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const sourceUuid = link.closest("[data-description-uuid]")?.dataset.descriptionUuid ?? uuid;
    if (link.classList.contains("content-link")) {
      // Anchors are not native popover invokers. Light dismissal may precede click.
      if (dismissInvoker === link) {
        dismissInvoker = null;
        if (tooltip?.matches(":popover-open")) tooltip.hidePopover();
        return;
      }
      open(link, { uuid: link.dataset.uuid ?? "", relativeUuid: sourceUuid });
    } else if (!busy) {
      busy = true; link.setAttribute("aria-busy", "true");
      content.querySelector(".mc-description-error")?.remove();
      void gateway.roll({ uuid: sourceUuid, formula: link.dataset.formula, mode: link.dataset.mode || "roll", flavor: link.dataset.flavor })
        .catch(error => { if (alive()) content.append(node("p", {
          className: "mc-description-error", text: error.message || "The roll could not be completed.", attrs: { role: "status" }
        })); })
        .finally(() => { busy = false; if (alive()) link.removeAttribute("aria-busy"); });
    }
  };
  scope.listen(content, "pointerdown", event => {
    dismissInvoker = tooltip?.matches(":popover-open") && event.target.closest?.("a.content-link") === anchor ? anchor : null;
  }, { capture: true });
  scope.listen(content, "click", activate, { capture: true });
  scope.listen(content, "keydown", event => {
    if (["Enter", " "].includes(event.key) && event.target.matches("a.content-link, a.inline-roll")) {
      event.preventDefault(); event.target.click();
    }
  });
  // The pre-enrichment sanitizer strips secrets and source-provided native action attributes.
  result.ready = gateway.enrich({ uuid, content: content.innerHTML, fragment }).then(enriched => {
    if (!alive()) return result;
    const rendered = renderDescription(enriched.html, className, { enriched: true });
    content.classList.toggle("is-plain-text", rendered.content.classList.contains("is-plain-text"));
    content.replaceChildren(...rendered.content.childNodes);
    return rendered;
  }).catch(() => result); // Safe source text remains readable when native enrichment is unavailable.
  return result;
}
