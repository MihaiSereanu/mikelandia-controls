import { node, icon } from "../../ui/dom.mjs";
import { localizedNumber, localizedText } from "../../ui/localized-text.mjs";
import { ACTOR_COMMANDS } from "../../kernel/command-names.mjs";
import { renderProfileInventory } from "./profile-inventory.mjs";
import { renderProfileResourceEditor } from "./profile-resource-editor.mjs";

/** Profiles provide game labels. This renderer has no system IDs or rule paths. */
export function renderProfilePanels(actor, state, commands, scope) {
  const tabs = actor.panels ?? [];
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
      // Parse in an inert template and append text only, never native markup.
      const template = document.createElement("template");
      template.innerHTML = row.description;
      template.content.querySelectorAll("script, style, iframe, object, embed, .secret").forEach(element => element.remove());
      template.content.querySelectorAll("p, div, li, br, h1, h2, h3, h4").forEach(element => element.append("\n"));
      const text = template.content.textContent.trim();
      if (text) description = node("details", { className: "mc-profile-description", children: [
        node("summary", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Panels.Details", "Details") }),
        node("p", { text })
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
    return node("div", { className: "mc-profile-row", dataset: { profileField: row.id }, children: [
      node("dt", { className: "mc-profile-item-name", children: [label] }), row.value === undefined || (row.edit && row.editControl === "counter") || row.edit?.id.startsWith("quantity:") || row.edit?.id.startsWith("coin-") ? null : node("dd", { children: [
        row.valueLabel ? node("span", { className: "mc-profile-value-label", text: `${row.valueLabel} ` }) : null,
        node("span", { text: `${row.valuePrefix ?? ""}${valueText(row)}` })
      ] }), description, row.edit ? renderProfileResourceEditor(row, actor, commands, scope) : null
    ] });
  };
  // Keep related small sections together, with the last card using spare width.
  // Larger collections retain the full sheet width for their own responsive rows.
  const sections = [];
  let summary;
  for (const section of active.sections) {
    const compact = ["values", "counters"].includes(section.kind) && section.rows.length === 1;
    const inventorySection = inventory && section.id === "gear";
    const heading = [node("h3", { text: section.label }), ...(section.summary ?? []).map(row => node("span", {
      className: "mc-profile-section-metric", dataset: { profileMetric: row.id }, text: `${row.label} ${valueText(row)}`
    }))];
    const element = node("section", {
      className: `mc-profile-section mc-profile-${section.kind}${section.layout === "inline" ? " mc-profile-section-inline" : ""}`, dataset: { profileSection: section.id },
      children: [compact && section.label === section.rows[0].label && !section.summary?.length ? null : node("header", { className: "mc-profile-section-heading", children: [
        ...(inventorySection ? [node("div", { className: "mc-profile-section-title", children: heading }), inventory.button] : heading)
      ] }), inventorySection ? inventory.body : null, section.kind === "text" ? node("p", { text: section.text }) : node("dl", {
        children: section.rows.map(renderRow)
      })]
    });
    if (compact) {
      if (!summary) { summary = node("div", { className: `mc-profile-summary${["paired", "triple"].includes(active.summaryLayout) ? ` mc-profile-summary-${active.summaryLayout}` : ""}` }); sections.push(summary); }
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
