import { node } from "../../../ui/primitives/dom.mjs";

/** Code-owned section references share the Conditions popover presentation. */
export function renderProfileTooltip(section, id, scope) {
  const tooltip = node("div", {
    className: "mc-profile-note-tooltip mc-profile-condition-tooltip mc-profile-section-tooltip",
    attrs: { id, popover: "auto", role: "tooltip", "aria-label": section.tooltip[0].label },
    children: section.tooltip.flatMap(group => [
      node("h3", { text: group.label }),
      node("ul", { children: group.bullets.map(text => node("li", {
        children: text.split(/(\*\*.*?\*\*)/gu).map(part => part.startsWith("**") && part.endsWith("**")
          ? node("strong", { text: part.slice(2, -2) }) : part)
      })) })
    ])
  });
  const trigger = node("button", {
    className: "mc-profile-section-tooltip-trigger",
    text: section.label,
    attrs: { type: "button", "aria-describedby": id, popovertarget: id, "aria-expanded": "false" }
  });
  scope.listen(trigger, "click", event => {
    event.preventDefault();
    if (tooltip.matches(":popover-open")) { tooltip.hidePopover(); return; }
    tooltip.showPopover();
    const anchor = trigger.getBoundingClientRect(), bounds = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - bounds.width - 8))}px`;
    tooltip.style.top = `${anchor.bottom + bounds.height + 8 <= innerHeight ? anchor.bottom + 4 : Math.max(8, anchor.top - bounds.height - 4)}px`;
  });
  scope.listen(tooltip, "toggle", () => trigger.setAttribute("aria-expanded", String(tooltip.matches(":popover-open"))));
  return { trigger, tooltip };
}
