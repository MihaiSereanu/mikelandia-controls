import { localizeFoundry } from "../foundry/settings/localization.mjs";
import { localizedText } from "../ui/primitives/localized-text.mjs";

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const validId = value => typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/u.test(value);

/** Read code-owned mappings only. Paths never become update payloads or methods. */
export function readProfilePath(document, path) {
  if (typeof path !== "string") return undefined;
  const keys = path.split(".");
  if (keys.some(key => !/^[a-zA-Z0-9_-]+$/u.test(key) || FORBIDDEN_KEYS.has(key))) return undefined;
  try { return keys.reduce((value, key) => value?.[key], document); }
  catch { return undefined; }
}

/** Shared prepared-value projection with explicitly supplied native actions. */
export function createProfilePanels(actor, profile, { localize = localizeFoundry, ...context } = {}) {
  const actions = new Map((Array.isArray(context.actions) ? context.actions : []).filter(action =>
    action && typeof action.id === "string" && typeof action.revision === "string").map(action => [action.id, action]));
  const actionFor = id => actions.has(id) ? { action: Object.freeze({ id, revision: actions.get(id).revision,
    ...(typeof actions.get(id).active === "boolean" ? { active: actions.get(id).active } : {}),
    ...(actions.get(id).icon === "fa-lightbulb" ? { icon: "fa-lightbulb" } : {}) }) } : {};
  const edits = new Map((Array.isArray(context.edits) ? context.edits : []).filter(edit => edit && typeof edit.id === "string" && /^(?:[a-z][a-z0-9-]{0,63}|quantity:[a-zA-Z0-9_-]{1,128})$/u.test(edit.id)
    && typeof edit.revision === "string" && ["integer", "boolean"].includes(edit.kind)).map(edit => [edit.id, edit]));
  const editFor = (id, value) => {
    const edit = edits.get(id);
    if (!edit || edit.value !== value) return {};
    return { edit: Object.freeze({ id, revision: edit.revision, kind: edit.kind,
      ...(edit.kind === "integer" ? { min: edit.min, ...(edit.max !== undefined ? { max: edit.max } : {}) } : {}) }) };
  };
  const label = entry => typeof entry.label === "string" && entry.label.trim()
    ? localizedText(localize, entry.labelKey ?? entry.label, entry.label) : "";
  const enabled = entry => {
    try { return entry.when === undefined || (typeof entry.when === "function" && entry.when(context) === true); }
    catch { return false; }
  };
  const scalar = (value, format = "number") => format === "number"
    ? typeof value === "number" && Number.isFinite(value)
    : format === "boolean" ? typeof value === "boolean"
      : format === "display" ? (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.trim().length > 0)
      : format === "text" && typeof value === "string" && value.trim().length > 0;
  const rows = entries => {
    const seen = new Set();
    return Object.freeze((Array.isArray(entries) ? entries : []).flatMap(entry => {
      if (!entry || !validId(entry.id) || seen.has(entry.id) || !enabled(entry) || !label(entry)) return [];
      let value;
      try { value = typeof entry.read === "function" ? entry.read(actor, context) : readProfilePath(actor, entry.path); }
      catch { return []; }
      if (!scalar(value, entry.format)) return [];
      seen.add(entry.id);
      const max = entry.maxPath ? readProfilePath(actor, entry.maxPath) : undefined;
      return [Object.freeze({ id: entry.id, label: label(entry), value, format: entry.format ?? "number",
        ...(entry.editControl === "checkbox" && entry.format === "boolean" ? { editControl: "checkbox" } : {}),
        ...(entry.editControl === "counter" ? { editControl: "counter" } : {}),
        ...actionFor(entry.actionId),
        ...(actions.has(entry.secondaryActionId) ? { secondaryAction: Object.freeze({ ...actionFor(entry.secondaryActionId).action,
          label: actions.get(entry.secondaryActionId).label,
          icon: ["fa-bed"].includes(actions.get(entry.secondaryActionId).icon) ? actions.get(entry.secondaryActionId).icon : "fa-dice" }) } : {}),
        ...editFor(entry.editId, value),
        ...(typeof value === "number" && typeof max === "number" && Number.isFinite(max) ? { max } : {}) })];
    }));
  };
  const section = entry => {
    if (!entry || !validId(entry.id) || !enabled(entry) || !label(entry)) return null;
    if (["values", "counters"].includes(entry.kind)) {
      const projected = rows(entry.fields);
      let disclosure;
      try {
        const text = entry.disclosure?.read?.(actor, context);
        if (scalar(text, "text") && label(entry.disclosure)) disclosure = Object.freeze({ label: label(entry.disclosure), text });
      } catch { /* Missing native data leaves the disclosure unavailable. */ }
      return projected.length ? Object.freeze({ id: entry.id, label: label(entry), kind: entry.kind, rows: projected, summary: rows(entry.summary),
        ...(disclosure ? { disclosure } : {}),
        ...(["inline", "table"].includes(entry.layout) ? { layout: entry.layout } : {}) }) : null;
    }
    if (entry.kind === "text") {
      const value = readProfilePath(actor, entry.path);
      return scalar(value, "text") ? Object.freeze({ id: entry.id, label: label(entry), kind: "text", text: value }) : null;
    }
    if (entry.kind === "items" && Array.isArray(entry.itemTypes)) {
      const source = readProfilePath(actor, entry.collectionPath);
      let items;
      try { items = Array.from(source?.contents ?? source ?? []); } catch { return null; }
      const projected = [];
      const seen = new Set();
      for (const item of items) {
        try {
          if (!entry.itemTypes.includes(item?.type) || item.visible === false
            || (entry.include && entry.include(item, context, actor) !== true)) continue;
          const id = String(item.id ?? "");
          const name = readProfilePath(item, entry.namePath ?? "name");
          const value = typeof entry.readValue === "function" ? entry.readValue(item, context, actor) : readProfilePath(item, entry.valuePath);
          if (!id || seen.has(id) || !scalar(name, "text") || ((entry.valuePath !== undefined || typeof entry.readValue === "function") && !scalar(value, entry.format))) continue;
          seen.add(id);
          projected.push(Object.freeze({ id, label: name, value, format: entry.format ?? "number",
            ...(typeof readProfilePath(item, entry.descriptionPath) === "string" ? { description: readProfilePath(item, entry.descriptionPath) } : {}),
            ...(entry.descriptionDisplay === "tooltip" ? { descriptionDisplay: "tooltip" } : {}),
            ...(typeof entry.valueLabel === "string" && entry.valueLabel.trim() ? { valueLabel: localizedText(localize, entry.valueLabelKey ?? entry.valueLabel, entry.valueLabel) } : {}),
            ...(typeof entry.valuePrefix === "string" ? { valuePrefix: entry.valuePrefix } : {}),
            ...(entry.quantityEditable ? editFor(`quantity:${id}`, value) : {}),
            ...actionFor(validId(entry.actionIdPrefix) ? `${entry.actionIdPrefix}:${id}` : undefined) }));
        } catch { /* A malformed item cannot expose extra fields or break a section. */ }
      }
      projected.sort((a, b) => a.label.localeCompare(b.label));
      return projected.length || entry.keepEmpty === true ? Object.freeze({ id: entry.id, label: label(entry), kind: "items", rows: Object.freeze(projected), summary: rows(entry.summary),
        ...(entry.layout === "rows" ? { layout: "rows" } : {}) }) : null;
    }
    return null;
  };
  const seenTabs = new Set();
  const tabs = [];
  for (const tab of Array.isArray(profile?.tabs) ? profile.tabs : []) {
    if (!tab || !validId(tab.id) || seenTabs.has(tab.id) || !enabled(tab) || !label(tab)) continue;
    const seenSections = new Set();
    const sections = (Array.isArray(tab.sections) ? tab.sections : []).flatMap(entry => {
      const result = section(entry);
      if (!result || seenSections.has(result.id)) return [];
      seenSections.add(result.id);
      return [result];
    });
    if (!sections.length) continue;
    seenTabs.add(tab.id);
    tabs.push(Object.freeze({ id: tab.id, label: label(tab), sections: Object.freeze(sections),
      ...(["paired", "triple", "counter-pairs"].includes(tab.summaryLayout) ? { summaryLayout: tab.summaryLayout } : {}) }));
  }
  return Object.freeze(tabs);
}
