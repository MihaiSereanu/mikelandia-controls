import { node, icon } from "../../../ui/primitives/dom.mjs";
import { localizedNumber, localizedText } from "../../../ui/primitives/localized-text.mjs";
import { ACTOR_COMMANDS } from "../../../kernel/state/command-names.mjs";
import { renderProfileInventory } from "./profile-inventory.mjs";
import { renderProfileResourceEditor } from "./profile-resource-editor.mjs";
import { bindDetailsDisclosure } from "../../../ui/primitives/disclosure.mjs";
import { renderProfileConditions } from "./profile-conditions.mjs";
import { renderTargets } from "../../combat/targets.mjs";
import { characterHasTargets } from "../../combat/targeting-surface.mjs";
import { renderEnrichedDescription } from "../../../ui/primitives/enriched-description.mjs";
import { renderProfileTooltip } from "./profile-tooltip.mjs";

/** Profiles provide game labels. This renderer has no system IDs or rule paths. */
export function renderProfilePanels(actor, state, commands, scope, renderNotes = null, presentation = { openSections: new Set() }) {
  const tabs = [...(actor.panels ?? []), ...(actor.notesAvailable && renderNotes ? [{ id: "notes", label: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Notes", "Notes"), sections: [] }] : [])];
  if (!tabs.length) return [];
  const active = tabs.find(tab => tab.id === state.characterTab) ?? tabs[0];
  const inventory = actor.profileInventory && active.id === "inventory" ? renderProfileInventory(actor, commands, scope) : null;
  const prefix = `mc-profile-${actor.sourceUuid.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
  // Record explicit closures separately so default-open disclosures survive rerenders.
  const closedSections = presentation.closedSections ??= new Set();
  const bindSection = (element, heading, key, defaultOpen = false) => {
    element.open = defaultOpen ? !closedSections.has(key) : presentation.openSections.has(key);
    bindDetailsDisclosure(element, heading, open => {
      if (open) { presentation.openSections.add(key); closedSections.delete(key); }
      else { presentation.openSections.delete(key); closedSections.add(key); }
    }, scope);
  };
  const valueText = row => {
    if (row.format === "boolean") return localizedText(commands.localize,
      row.value ? "MIKELANDIA_CONTROLS.Panels.Active" : "MIKELANDIA_CONTROLS.Panels.Inactive", row.value ? "Active" : "Inactive");
    if (row.format === "text" || (row.format === "display" && typeof row.value === "string")) return row.value;
    const locale = commands.readLocale?.() ?? "en";
    const value = localizedNumber(row.value, locale);
    return row.max === undefined ? value : `${value} / ${localizedNumber(row.max, locale)}`;
  };
  const renderRow = (row, equipmentColumn = false, grouped = false) => {
    const descriptionOptions = { gateway: commands.descriptions, uuid: row.descriptionUuid, scope };
    let description;
    if (row.description && !["name", "item-name"].includes(row.descriptionToggle)) {
      const rendered = renderEnrichedDescription(row.description, "", descriptionOptions);
      const { content, text } = rendered;
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
        void rendered.ready?.then(result => { if (!scope.disposed) trigger.textContent = result.text; });
        scope.listen(tooltip, "toggle", () => trigger.setAttribute("aria-expanded", String(tooltip.matches(":popover-open"))));
        description = node("div", { className: "mc-profile-note", children: [trigger, tooltip] });
      } else if (text) description = node("details", { className: "mc-profile-description", children: [
        node("summary", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Panels.Details", "Details") }),
        content
      ] });
    }
    let label = row.action ? node("button", {
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
    if (row.descriptionToggle === "item-name" && row.description) {
      const rendered = renderEnrichedDescription(row.description, "", descriptionOptions);
      if (rendered.text.replace(/\u00a0/gu, "").trim() || rendered.content.querySelector("img[src]")) {
        const id = `${prefix}-description-${row.id}`;
        description = node("div", { className: "mc-profile-description", attrs: { id, hidden: true }, children: [rendered.content] });
        label = node("button", { className: "mc-profile-item-disclosure", children: [node("span", { className: "mc-profile-disclosure-arrow", attrs: { "aria-hidden": "true" } }), node("span", { text: row.label })],
          attrs: { type: "button", "aria-expanded": "false", "aria-controls": id },
          on: { click: event => {
            description.hidden = !description.hidden;
            event.currentTarget.setAttribute("aria-expanded", String(!description.hidden));
          } }
        }, scope);
      }
    }
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
    const equipment = row.equipment?.edit ? node("div", { className: "mc-profile-labelled-control", children: [
      renderProfileResourceEditor({ ...row.equipment, label: `${row.equipment.label}: ${row.label}` }, actor, commands, scope)
    ] }) : null;
    if (row.descriptionToggle === "name") {
      const descriptionKey = `${active.id}:spell-description:${row.id}`;
      const lostLabel = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Panels.Lost", "Lost");
      const lossControl = row.lossAction ? node("label", { className: "mc-profile-spell-loss", children: [
        node("input", { attrs: { type: "checkbox", checked: row.lost === true, "aria-label": `${lostLabel}: ${row.label}` },
          dataset: { profileSpellLoss: row.id },
          on: { change: async event => {
            const input = event.currentTarget;
            input.disabled = true;
            try { await commands.execute(ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, {
              actorSourceUuid: actor.sourceUuid, actionId: row.lossAction.id, actionRevision: row.lossAction.revision
            }); } catch (error) {
              input.checked = row.lost === true;
              if (!scope.disposed) commands.reportCharacterMutationError?.(error);
            } finally { if (!scope.disposed) input.disabled = false; }
          } }
        }, scope), node("span", { text: lostLabel })
      ] }) : null;
      if (row.action) {
        label.replaceChildren(icon(row.action.icon ?? "fa-dice"));
        label.setAttribute("aria-label", `${localizedText(commands.localize, "Roll", "Roll")} ${row.label}`);
      }
      if (!row.action && row.showCastButton) label = node("button", {
        className: "mc-profile-action", attrs: { type: "button", disabled: true, "aria-label": `${localizedText(commands.localize, "Cast", "Cast")} ${row.label}` },
        children: [icon("fa-dice")]
      });
      const disclosure = node("details", { className: "mc-profile-description mc-profile-spell-description", children: [
        node("summary", { children: [node(row.lost ? "s" : "span", { text: row.label })] }),
        renderEnrichedDescription(row.description ?? "", "", descriptionOptions).content, lossControl
      ] });
      if (row.lossAction) bindSection(disclosure, disclosure.querySelector("summary"), descriptionKey);
      return node("div", { className: `mc-profile-row mc-profile-spell-row${grouped || row.value === undefined ? " mc-profile-spell-no-value" : ""}`, dataset: { profileField: row.id }, children: [
        node("dt", { children: [disclosure, row.sourceLabel ? node("span", { className: "mc-profile-spell-source", text: row.sourceLabel }) : null] }),
        node("dd", { children: [grouped || row.value === undefined ? null : node("span", { text: `${row.valueLabel ?? ""} ${valueText(row)}`.trim() }), row.action || row.showCastButton ? label : null] })
      ] });
    }
    const properties = row.properties?.length ? node("details", { className: "mc-profile-description mc-profile-properties", children: [
      node("summary", { text: "Qualities & Flaws" }),
      ...row.properties.map(property => node("div", { className: "mc-profile-property", children: [
        node("strong", { text: property.label }), renderEnrichedDescription(property.description, "", { ...descriptionOptions, fragment: true }).content
      ] }))
    ] }) : null;
    const heading = node("dt", { className: "mc-profile-item-name", children: [label, secondary] });
    const lock = secondary && resource?.querySelector('[data-profile-counter-lock]');
    if (lock) heading.append(lock);
    return node("div", { className: `mc-profile-row${equipmentColumn ? " mc-profile-equipment-row" : ""}`, dataset: { profileField: row.id }, children: [
      heading, row.value === undefined || (row.edit && row.editControl === "counter") || row.edit?.id.startsWith("quantity:") || row.edit?.id.startsWith("coin-") ? null : node("dd", { children: [
        row.valueLabel ? node("span", { className: "mc-profile-value-label", text: `${row.valueLabel} ` }) : null,
        node("span", { text: `${row.valuePrefix ?? ""}${valueText(row)}` })
      ] }), description, properties, resource, equipment
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
  const appendSections = (entries, destination, nested = false) => {
    for (const section of entries) {
      if (section.kind === "group") {
        summary = null;
        const body = node("div", { className: "mc-profile-group-content" });
        appendSections(section.sections, body, true);
        const heading = section.collapsible ? node("summary", { children: [node("h3", { text: section.label })] }) : node("h3", { text: section.label });
        const group = node(section.collapsible ? "details" : "section", { className: "mc-profile-group mc-profile-section", dataset: { profileSection: section.id }, children: [heading, body] });
        if (section.collapsible) {
          const key = `${active.id}:${section.id}`;
          group.open = presentation.openSections.has(key);
          bindDetailsDisclosure(group, heading, open => {
            if (open) presentation.openSections.add(key); else presentation.openSections.delete(key);
          }, scope);
        }
        if (nested) destination.append(group); else destination.push(group);
        continue;
      }
      if (section.kind === "conditions") {
        summary = null;
        sections.push(renderProfileConditions(section, actor, commands, scope, presentation));
        continue;
      }
      const compact = section.layout !== "table" && ["values", "counters"].includes(section.kind) && section.rows.length === 1;
      const inventorySection = inventory && section.id === "gear";
      const equipmentLabel = section.rows.find(row => row.equipment?.edit)?.equipment.label;
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
      const sectionHeading = compact && section.label === section.rows[0].label && !section.summary?.length ? null
        : node(section.collapsible ? "summary" : "header", { className: "mc-profile-section-heading", children: [
          ...(inventorySection ? [node("div", { className: "mc-profile-section-title", children: heading }), inventory.button] : heading),
          equipmentLabel ? node("span", { className: "mc-profile-equipment-heading", text: equipmentLabel }) : null,
          ...(section.controls ?? []).filter(row => row.edit).map(row => {
            const reference = row.tooltip ? renderProfileTooltip(row, `${prefix}-control-${row.id}-tooltip`, scope) : null;
            return node("div", { className: "mc-profile-labelled-control", children: [
              reference?.trigger ?? node("span", { text: row.label }), renderProfileResourceEditor(row, actor, commands, scope), reference?.tooltip
            ] });
          })
        ] });
      const rows = section.groupByValue ? [...new Set(section.rows.map(row => row.value))].map(value => {
        const group = section.rows.filter(row => row.value === value);
        const heading = node(section.collapsibleTiers ? "summary" : "h4", { text: `${group[0].valueLabel ?? ""} ${valueText(group[0])}`.trim() });
        const tier = node(section.collapsibleTiers ? "details" : "div", { className: "mc-profile-tier", dataset: { profileTier: value }, children: [
          heading,
          node("dl", { children: group.map(row => renderRow(row, false, true)) })
        ] });
        if (section.collapsibleTiers) bindSection(tier, heading, `${active.id}:${section.id}:tier:${value}`, true);
        return tier;
      }) : [node("dl", { children: section.rows.map(row => renderRow(row, Boolean(equipmentLabel))) })];
      const element = node(section.collapsible ? "details" : "section", {
        className: `mc-profile-section mc-profile-${section.kind}${section.collapsible ? " mc-profile-inventory-disclosure" : ""}${equipmentLabel ? " mc-profile-equipment-section" : ""}${section.layout === "inline" ? " mc-profile-section-inline" : section.layout === "table" ? " mc-profile-section-table" : section.layout === "rows" ? " mc-profile-section-rows" : ""}`, dataset: { profileSection: section.id },
        children: [sectionHeading, inventorySection ? inventory.body : null, ...(section.kind === "text" ? [node("p", { text: section.text })] : rows), disclosure]
      });
      if (section.collapsible && sectionHeading) {
        const key = `${active.id}:${section.id}`;
        bindSection(element, sectionHeading, key, section.defaultOpen);
      }
      if (nested) { destination.append(element); }
      else if (compact) {
        if (!summary) { summary = node("div", { className: `mc-profile-summary${active.summaryLayout === "counter-pairs" ? " mc-profile-summary-triple mc-profile-summary-counter-pairs" : ["paired", "triple"].includes(active.summaryLayout) ? ` mc-profile-summary-${active.summaryLayout}` : ""}` }); sections.push(summary); }
        summary.append(element);
      } else { summary = null; sections.push(element); }
    }
  };
  appendSections(active.sections, sections);
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
