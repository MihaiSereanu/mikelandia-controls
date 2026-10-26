import { node, icon } from "../../ui/dom.mjs";
import { localizedNumber, localizedText } from "../../ui/localized-text.mjs";
import { ACTOR_COMMANDS } from "../../kernel/command-names.mjs";
import { renderProfileResourceEditor } from "./profile-resource-editor.mjs";

/** Profiles provide game labels. This renderer has no system IDs or rule paths. */
export function renderProfilePanels(actor, state, commands, scope) {
  const tabs = actor.panels ?? [];
  if (!tabs.length) return [];
  const active = tabs.find(tab => tab.id === state.characterTab) ?? tabs[0];
  const prefix = `ve-profile-${actor.sourceUuid.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
  const valueText = row => {
    if (row.format === "boolean") return localizedText(commands.localize,
      row.value ? "VEMOBILE.Panels.Active" : "VEMOBILE.Panels.Inactive", row.value ? "Active" : "Inactive");
    if (row.format === "text" || (row.format === "display" && typeof row.value === "string")) return row.value;
    const locale = commands.readLocale?.() ?? "en";
    const value = localizedNumber(row.value, locale);
    return row.max === undefined ? value : `${value} / ${localizedNumber(row.max, locale)}`;
  };
  const renderRow = row => {
    const status = node("p", { className: "ve-profile-action-status", attrs: { role: "status", "aria-live": "polite" } });
    const label = row.action ? node("button", {
      className: "ve-profile-action", attrs: { type: "button", "data-profile-action": row.action.id },
      children: [node("span", { text: row.label }), icon(row.action.icon ?? "fa-dice")],
      on: { click: async event => {
        const button = event.currentTarget;
        if (button.disabled || scope.disposed) return;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        status.textContent = "";
        try {
          const outcome = await commands.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, {
            actorSourceUuid: actor.sourceUuid, actionId: row.action.id, actionRevision: row.action.revision
          });
          if (!scope.disposed) status.textContent = outcome?.cancelled
            ? localizedText(commands.localize, "VEMOBILE.Panels.Cancelled", "Action cancelled.")
            : outcome?.nativeHandled ? localizedText(commands.localize, "VEMOBILE.Panels.NativeFinished", "Native workflow finished.")
              : localizedText(commands.localize, "VEMOBILE.Panels.ResultInChat", "See the result in Chat.");
        } catch (error) {
          if (!scope.disposed) status.textContent = error?.message ?? localizedText(commands.localize, "VEMOBILE.Panels.Failed", "The game action failed.");
        } finally {
          if (!scope.disposed) { button.disabled = false; button.setAttribute("aria-busy", "false"); }
        }
      } }
    }, scope) : node("span", { text: row.label });
    return node("div", { className: "ve-profile-row", dataset: { profileField: row.id }, children: [
      node("dt", { children: [label] }), row.value === undefined ? null : node("dd", { children: [
        row.valueLabel ? node("span", { className: "ve-profile-value-label", text: `${row.valueLabel} ` }) : null,
        node("span", { text: `${row.valuePrefix ?? ""}${valueText(row)}` })
      ] }), row.action ? status : null, row.edit ? renderProfileResourceEditor(row, actor, commands, scope) : null
    ] });
  };
  // Keep related small sections together, with the last card using spare width.
  // Larger collections retain the full sheet width for their own responsive rows.
  const sections = [];
  let summary;
  for (const section of active.sections) {
    const compact = ["values", "counters"].includes(section.kind) && section.rows.length === 1;
    const element = node("section", {
      className: `ve-profile-section ve-profile-${section.kind}`, dataset: { profileSection: section.id },
      children: [node("h3", { text: section.label }), section.kind === "text" ? node("p", { text: section.text }) : node("dl", {
        children: section.rows.map(renderRow)
      })]
    });
    if (compact) {
      if (!summary) { summary = node("div", { className: "ve-profile-summary" }); sections.push(summary); }
      summary.append(element);
    } else { summary = null; sections.push(element); }
  }
  return [
    node("nav", { className: "ve-profile-tabs", attrs: { role: "tablist" }, children: tabs.map(tab => node("button", {
      text: tab.label,
      attrs: { type: "button", role: "tab", id: `${prefix}-tab-${tab.id}`, "aria-controls": `${prefix}-panel-${tab.id}`,
        "aria-selected": String(tab === active), "data-profile-tab": tab.id },
      on: { click: () => commands.selectCharacterTab(tab.id) }
    }, scope)) }),
    node("div", { className: "ve-profile-content", attrs: { role: "tabpanel", id: `${prefix}-panel-${active.id}`,
      "aria-labelledby": `${prefix}-tab-${active.id}` }, children: sections })
  ];
}
