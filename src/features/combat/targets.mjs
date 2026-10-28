import { node, vectorIcon } from "../../ui/primitives/dom.mjs";
import { localizedText, localizedNumber } from "../../ui/primitives/localized-text.mjs";

export function renderTargets({ targeting, commands, scope }) {
  if (!targeting) return null;
  const t = (key, fallback, data) => localizedText(commands.localize, `MIKELANDIA_CONTROLS.Targets.${key}`, fallback, data);
  const request = tokenId => ({ context: targeting.context, sourceId: targeting.sourceId, tokenId });
  const status = node("p", { className: "mc-target-status", attrs: { role: "status", "aria-live": "polite" }, text: targeting.reason });
  const run = async (button, action) => {
    button.disabled = true;
    try { await action(); } catch (error) { if (!scope.disposed) status.textContent = error.message; }
    finally { if (!scope.disposed && button.isConnected) button.disabled = false; }
  };
  const selected = targeting.entries.filter(entry => entry.selected);
  const summary = selected.length ? selected.map(entry => entry.name).join(", ") : t("None", "No targets selected");
  const distanceText = (entry, units) => entry.distance === null ? t("DistanceUnavailable", "Distance unavailable")
    : `${localizedNumber(Math.round(entry.distance * 100) / 100, commands.readLocale?.() ?? "en")} ${units}`.trim();
  const distances = new Map();
  const distanceNode = entry => {
    if (entry.self) return null;
    const element = node("span", { className: "mc-target-distance", text: distanceText(entry, targeting.units) });
    distances.set(entry.id, element);
    return element;
  };
  const row = entry => node("button", {
    className: `mc-target-row${entry.selected ? " is-selected" : ""}`,
    attrs: { type: "button", "aria-pressed": String(entry.selected), disabled: !entry.enabled },
    dataset: { targetId: entry.id },
    on: { click: event => run(event.currentTarget, () => commands.toggleCombatTarget(request(entry.id))) },
    children: [entry.img ? node("img", { attrs: { src: entry.img, alt: "" } }) : null,
      node("span", { className: "mc-target-name", children: [node("strong", { children: [entry.name,
        entry.self ? node("span", { className: "mc-target-you", text: ` (${t("You", "You")})` }) : null] }),
        entry.defeated ? node("small", { text: t("Defeated", "Defeated") }) : null] }),
      distanceNode(entry),
      node("span", { className: "mc-target-check", attrs: { "aria-hidden": "true" }, text: entry.selected ? "✓" : "○" })]
  }, scope);
  const groups = [true, false].map(friendly => {
    const entries = targeting.entries.filter(entry => entry.friendly === friendly);
    return entries.length ? node("div", { className: "mc-target-group", children: [
      node("h3", { text: friendly ? t("Friendly", "Friendly") : t("Enemies", "Enemies") }), ...entries.map(row)] }) : null;
  });
  const selector = targeting.sources.length > 1 ? node("label", { className: "mc-target-source", children: [
    node("span", { text: t("YourToken", "Your token") }), node("select", {
      attrs: { "aria-label": t("YourToken", "Your token") },
      children: [node("option", { attrs: { value: "", selected: !targeting.sourceId, disabled: true }, text: t("ChooseToken", "Choose a token") }),
        ...targeting.sources.map(token => node("option", { attrs: { value: token.id, selected: token.id === targeting.sourceId }, text: token.name }))],
      on: { change: event => run(event.currentTarget, () => commands.selectCombatTargetSource(request(event.currentTarget.value))) }
    }, scope)] }) : null;
  const caret = vectorIcon("0 0 24 24", [{ tag: "path", attrs: {
    d: targeting.expanded ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6", fill: "none", stroke: "currentColor",
    "stroke-width": "2.5", "stroke-linecap": "round", "stroke-linejoin": "round"
  } }], "mc-targets-caret");
  const section = node("section", { className: "mc-targets", children: [
    node("button", { className: "mc-targets-heading", attrs: { type: "button", "aria-expanded": String(targeting.expanded) },
      on: { click: () => commands.setCombatTargetsExpanded(!targeting.expanded) },
      children: [node("strong", { className: "mc-targets-title", children: [caret, t("Title", "Targets")] }),
        node("span", { className: "mc-targets-summary", text: summary })] }, scope),
    targeting.expanded ? node("div", { className: "mc-targets-body", children: [selector, status,
      ...groups, targeting.entries.length ? null : node("p", { text: t("Empty", "No visible combat tokens.") })] }) : null
  ] });
  // Preserve rows, focused controls and disclosure state during token animation.
  const structure = state => JSON.stringify({ ...state, entries: state.entries.map(({ distance, ...entry }) => entry) });
  const initialStructure = structure(targeting);
  section.__mcUpdateTargetDistances = next => {
    if (!next || structure(next) !== initialStructure) return false;
    for (const entry of next.entries) {
      const element = distances.get(entry.id);
      if (!element) continue;
      const text = distanceText(entry, next.units);
      if (element.textContent !== text) element.textContent = text;
    }
    return true;
  };
  return section;
}
