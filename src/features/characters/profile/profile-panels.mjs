import { node, icon } from "../../../ui/primitives/dom.mjs";
import { localizedNumber, localizedText } from "../../../ui/primitives/localized-text.mjs";
import { ACTOR_COMMANDS } from "../../../kernel/state/command-names.mjs";
import { renderProfileInventory } from "./profile-inventory.mjs";
import { renderProfileResourceEditor } from "./profile-resource-editor.mjs";
import { bindDetailsDisclosure } from "../../../ui/primitives/disclosure.mjs";
import { renderProfileConditions } from "./profile-conditions.mjs";
import { renderTargets } from "../../combat/targets.mjs";
import { characterHasTargets } from "../../combat/targeting-surface.mjs";
import { renderDescription } from "../../../ui/primitives/description.mjs";

/** Profiles provide game labels. This renderer has no system IDs or rule paths. */
export function renderProfilePanels(actor, state, commands, scope, renderNotes = null, presentation = { openSections: new Set() }) {
  const tabs = [...(actor.panels ?? []), ...(actor.notesAvailable && renderNotes ? [{ id: "notes", label: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Notes", "Notes"), sections: [] }] : [])];
  if (!tabs.length) return [];
  const active = tabs.find(tab => tab.id === state.characterTab) ?? tabs[0];
  const inventory = actor.profileInventory && active.id === "inventory" ? renderProfileInventory(actor, commands, scope) : null;
  const prefix = `mc-profile-${actor.sourceUuid.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
  const valueText = row => {
    if (row.format === "boolean") return localizedText(commands.localize,
      row.value ? "MIKELANDIA_CONTROLS.Panels.Active" : "MIKELANDIA_CONTROLS.Panels.Inactive", row.value ? "Active" : "Inactive");
    if (row.format === "text" || (row.format === "display" && typeof row.value === "string")) return row.value;
    const locale = commands.readLocale?.() ?? "en";
    const value = localizedNumber(row.value, locale);
    return row.max === undefined ? value : `${value} / ${localizedNumber(row.max, locale)}`;
  };
  const renderRow = row => {
    let description;
    if (row.description) {
      const { content, text } = renderDescription(row.description);
      if (text && row.descriptionDisplay === "tooltip") {
        const tooltip = node("div", { className: "mc-profile-note-tooltip", children: [content],
          attrs: { id: `${prefix}-note-${row.id}`, popover: "auto", role: "tooltip" } });
        const trigger = node("button", { className: "mc-profile-note-trigger", text,
          attrs: { type: "button", "aria-describedby": tooltip.id, "popovertarget": tooltip.id, "aria-expanded": "false" },
          on: { click: event => {
            // Keep native light dismissal aware of the trigger; toggle here to position immediately.
            event.preventDefault();
            if (tooltip.matches(":popover-open")) { tooltip.hidePopover(); return; }
            tooltip.showPopover();
            const anchor = trigger.getBoundingClientRect();
            const bounds = tooltip.getBoundingClientRect();
            const left = Math.max(8, Math.min(anchor.left, innerWidth - bounds.width - 8));
            const top = anchor.bottom + bounds.height + 8 <= innerHeight ? anchor.bottom + 4 : Math.max(8, anchor.top - bounds.height - 4);
            tooltip.style.left = `${left}px`; tooltip.style.top = `${top}px`;
          } }
        }, scope);
        scope.listen(tooltip, "toggle", () => trigger.setAttribute("aria-expanded", String(tooltip.matches(":popover-open"))));
        description = node("div", { className: "mc-profile-note", children: [trigger, tooltip] });
      } else if (text) description = node("details", { className: "mc-profile-description", children: [
        node("summary", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Panels.Details", "Details") }),
        content
      ] });
    }
    const label = row.action ? node("button", {
      className: "mc-profile-action", attrs: { type: "button", "data-profile-action": row.action.id },
      children: [node("span", { text: row.label }), icon(row.action.icon ?? "fa-dice")],
      on: { click: async event => {
        const button = event.currentTarget;
        if (button.disabled || scope.disposed) return;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        try {
          await commands.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, {
            actorSourceUuid: actor.sourceUuid, actionId: row.action.id, actionRevision: row.action.revision
          });
        } catch (error) {
          if (!scope.disposed) commands.reportCharacterMutationError?.(error);
        } finally {
          if (!scope.disposed) { button.disabled = false; button.setAttribute("aria-busy", "false"); }
        }
      } }
    }, scope) : node("span", { text: row.label });
    const secondary = row.secondaryAction ? node("button", {
      className: "mc-profile-secondary-action", attrs: { type: "button", "data-profile-action": row.secondaryAction.id,
        "aria-label": row.secondaryAction.label, title: row.secondaryAction.label }, children: [icon(row.secondaryAction.icon)],
      on: { click: async event => {
        const button = event.currentTarget;
        if (button.disabled || scope.disposed) return;
        button.disabled = true;
        try { await commands.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, { actorSourceUuid: actor.sourceUuid,
          actionId: row.secondaryAction.id, actionRevision: row.secondaryAction.revision }); }
        catch (error) { if (!scope.disposed) commands.reportCharacterMutationError?.(error); }
        finally { if (!scope.disposed) button.disabled = false; }
      } }
    }, scope) : null;
    const resource = row.edit ? renderProfileResourceEditor(row, actor, commands, scope) : null;
    const heading = node("dt", { className: "mc-profile-item-name", children: [label, secondary] });
    const lock = secondary && resource?.querySelector('[data-profile-counter-lock]');
    if (lock) heading.append(lock);
    return node("div", { className: "mc-profile-row", dataset: { profileField: row.id }, children: [
      heading, row.value === undefined || (row.edit && row.editControl === "counter") || row.edit?.id.startsWith("quantity:") || row.edit?.id.startsWith("coin-") ? null : node("dd", { children: [
        row.valueLabel ? node("span", { className: "mc-profile-value-label", text: `${row.valueLabel} ` }) : null,
        node("span", { text: `${row.valuePrefix ?? ""}${valueText(row)}` })
      ] }), description, resource
    ] });
  };
  // Keep related small sections together, with the last card using spare width.
  // Larger collections retain the full sheet width for their own responsive rows.
  const sections = active.id === "notes" ? [renderNotes()] : [];
  if (characterHasTargets(actor, active.id)) {
    const targets = renderTargets({ targeting: state.targeting, commands, scope });
    if (targets) sections.push(targets);
  }
  let summary;
  for (const section of active.sections) {
    if (section.kind === "conditions") {
      summary = null;
      sections.push(renderProfileConditions(section, actor, commands, scope, presentation));
      continue;
    }
    const compact = section.layout !== "table" && ["values", "counters"].includes(section.kind) && section.rows.length === 1;
    const inventorySection = inventory && section.id === "gear";
    const heading = [node("h3", { text: section.label }), ...(section.summary ?? []).map(row => node("span", {
      className: "mc-profile-section-metric", dataset: { profileMetric: row.id }, text: `${row.label} ${valueText(row)}`
    }))];
    let disclosure;
    if (section.disclosure) {
      const key = `${active.id}:${section.id}`;
      const summary = node("summary", { text: section.disclosure.label });
      disclosure = node("details", { className: "mc-profile-description", children: [summary, node("p", { text: section.disclosure.text })] });
      disclosure.open = presentation.openSections.has(key);
      bindDetailsDisclosure(disclosure, summary, open => {
        if (open) presentation.openSections.add(key); else presentation.openSections.delete(key);
      }, scope);
    }
    const element = node("section", {
      className: `mc-profile-section mc-profile-${section.kind}${section.layout === "inline" ? " mc-profile-section-inline" : section.layout === "table" ? " mc-profile-section-table" : section.layout === "rows" ? " mc-profile-section-rows" : ""}`, dataset: { profileSection: section.id },
      children: [compact && section.label === section.rows[0].label && !section.summary?.length ? null : node("header", { className: "mc-profile-section-heading", children: [
        ...(inventorySection ? [node("div", { className: "mc-profile-section-title", children: heading }), inventory.button] : heading)
      ] }), inventorySection ? inventory.body : null, section.kind === "text" ? node("p", { text: section.text }) : node("dl", {
        children: section.rows.map(renderRow)
      }), disclosure]
    });
    if (compact) {
      if (!summary) { summary = node("div", { className: `mc-profile-summary${active.summaryLayout === "counter-pairs" ? " mc-profile-summary-triple mc-profile-summary-counter-pairs" : ["paired", "triple"].includes(active.summaryLayout) ? ` mc-profile-summary-${active.summaryLayout}` : ""}` }); sections.push(summary); }
      summary.append(element);
    } else { summary = null; sections.push(element); }
  }
  return [
    node("nav", { className: "mc-profile-tabs", attrs: { role: "tablist" }, children: tabs.map(tab => node("button", {
      text: tab.label,
      attrs: { type: "button", role: "tab", id: `${prefix}-tab-${tab.id}`, "aria-controls": `${prefix}-panel-${tab.id}`,
        "aria-selected": String(tab === active), "data-profile-tab": tab.id },
      on: { click: () => commands.selectCharacterTab(tab.id) }
    }, scope)) }),
    node("div", { className: "mc-profile-content", attrs: { role: "tabpanel", id: `${prefix}-panel-${active.id}`,
      "aria-labelledby": `${prefix}-tab-${active.id}` }, children: sections })
  ];
}
