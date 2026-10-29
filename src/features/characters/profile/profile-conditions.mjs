import { node } from "../../../ui/primitives/dom.mjs";
import { localizedText } from "../../../ui/primitives/localized-text.mjs";
import { ACTOR_COMMANDS } from "../../../kernel/state/command-names.mjs";

/** The picker adds session rows; only each row's native controls change the Actor. */
export function renderProfileConditions(section, actor, commands, scope, presentation) {
  const conditions = section.conditions;
  const chosen = presentation.conditionIds ??= new Set();
  for (const condition of conditions) if (condition.active) chosen.add(condition.id);
  const t = (key, fallback) => localizedText(commands.localize, `MIKELANDIA_CONTROLS.Panels.${key}`, fallback);
  const select = node("select", { className: "mc-profile-condition-picker", attrs: { "aria-label": t("ChooseCondition", "Choose condition") } }, scope);
  const list = node("div", { className: "mc-profile-condition-list" });
  const status = node("p", { className: "mc-action-status", attrs: { role: "status", "aria-live": "polite" } });
  let rowScope;
  let pending = false;
  const run = async action => {
    if (!action || pending) return;
    pending = true;
    list.setAttribute("aria-busy", "true");
    list.querySelectorAll("button").forEach(button => { button.disabled = true; });
    select.disabled = true;
    status.textContent = "";
    try {
      await commands.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, { actorSourceUuid: actor.sourceUuid,
        actionId: action.id, actionRevision: action.revision });
    } catch (error) {
      if (!scope.disposed) { status.textContent = error.message; commands.reportCharacterMutationError?.(error); }
    } finally {
      if (!scope.disposed) { pending = false; list.setAttribute("aria-busy", "false"); renderRows(); }
    }
  };
  const button = (label, text, action, extra = {}) => node("button", { text,
    attrs: { type: "button", "aria-label": label, title: label, disabled: !action, ...extra },
    on: { click: () => run(action) } }, rowScope);
  const renderRows = () => {
    rowScope?.dispose();
    rowScope = scope.child("condition-rows");
    select.replaceChildren(node("option", { attrs: { value: "" }, text: t("ChooseCondition", "Choose condition") }),
      ...conditions.filter(condition => !chosen.has(condition.id)).map(condition => node("option", { attrs: { value: condition.id }, text: condition.label })));
    select.disabled = conditions.every(condition => chosen.has(condition.id));
    const visible = conditions.filter(condition => chosen.has(condition.id));
    list.style.setProperty("--mc-condition-action-slots", String(Math.max(1,
      ...visible.map(condition => condition.scripts.length + Number(!condition.active)))));
    list.replaceChildren(...visible.map(condition => {
      const name = node(condition.description ? "button" : "span", { className: "mc-profile-condition-name", text: condition.label,
        attrs: condition.description ? { type: "button" } : { title: condition.label } });
      let tooltip;
      if (condition.description) {
        const tooltipId = `mc-condition-${actor.sourceUuid.replace(/[^a-zA-Z0-9_-]/gu, "-")}-${condition.id}`;
        tooltip = node("div", { className: "mc-profile-note-tooltip mc-profile-condition-tooltip",
          attrs: { id: tooltipId, popover: "auto", role: "tooltip", "aria-label": condition.label }, children: [
            node("ul", { children: condition.description.map(text => node("li", { children: text.split(/(\*\*.*?\*\*)/gu)
              .map(part => part.startsWith("**") && part.endsWith("**") ? node("strong", { text: part.slice(2, -2) }) : part) })) })
          ] });
        name.setAttribute("aria-describedby", tooltipId);
        name.setAttribute("popovertarget", tooltipId);
        name.setAttribute("aria-expanded", "false");
        rowScope.listen(name, "click", event => {
          // Keep native light dismissal aware of the trigger; toggle here to position immediately.
          event.preventDefault();
          if (tooltip.matches(":popover-open")) { tooltip.hidePopover(); return; }
          tooltip.showPopover();
          const anchor = name.getBoundingClientRect(), bounds = tooltip.getBoundingClientRect();
          tooltip.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - bounds.width - 8))}px`;
          tooltip.style.top = `${anchor.bottom + bounds.height + 8 <= innerHeight ? anchor.bottom + 4 : Math.max(8, anchor.top - bounds.height - 4)}px`;
        });
        rowScope.listen(tooltip, "toggle", () => name.setAttribute("aria-expanded", String(tooltip.matches(":popover-open"))));
      }
      const controls = node("div", { className: "mc-profile-condition-controls", dataset: { numbered: String(condition.numbered) } });
      if (condition.numbered) controls.append(
        button(`${t("Decrease", "Decrease")} ${condition.label}`, "−", condition.remove),
        node("output", { text: String(condition.value), attrs: { "aria-label": condition.label } }),
        button(`${t("Increase", "Increase")} ${condition.label}`, "+", condition.add)
      );
      else controls.append(button(condition.label, condition.active ? "✓" : "○", condition.active ? condition.remove : condition.add,
        { "aria-pressed": String(condition.active) }));
      for (const script of condition.scripts) controls.append(button(script.label, "▶", script.action,
        { "data-condition-apply": condition.id }));
      if (!condition.active) controls.append(node("button", { text: "×", attrs: { type: "button",
        "data-condition-dismiss": condition.id, "aria-label": `${t("RemoveConditionRow", "Remove from list")}: ${condition.label}` },
      on: { click: () => { chosen.delete(condition.id); renderRows(); } } }, rowScope));
      return node("div", { className: "mc-profile-condition-editor", dataset: { conditionId: condition.id },
        attrs: { role: "group", "aria-label": condition.label }, children: [
          name, controls, tooltip
        ] });
    }));
  };
  scope.listen(select, "change", () => {
    if (conditions.some(condition => condition.id === select.value)) { chosen.add(select.value); renderRows(); }
  });
  renderRows();
  return node("section", { className: "mc-profile-section", dataset: { profileSection: section.id }, children: [
    node("header", { className: "mc-profile-section-heading", children: [node("h3", { text: section.label })] }), select, list, status
  ] });
}
