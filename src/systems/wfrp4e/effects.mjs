import { localizeFoundry as localize } from "../../foundry/settings/localization.mjs";
import { warhammer5eConditionDescriptions } from "./condition-descriptions.mjs";
import { readWarhammerContext } from "./context.mjs";

const values = source => Array.from(source?.contents ?? source ?? []);
const conditionId = effect => effect?.conditionId ?? effect?.id;
const safeId = id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,64}$/u.test(id);

/** Native edition configuration owns condition availability and stacking. */
export function readWarhammerConditions(actor, game = globalThis.game) {
  const use5e = readWarhammerContext(game)?.use5e;
  return values(game?.wfrp4e?.config?.statusEffects).flatMap(definition => {
    const id = conditionId(definition);
    if (!safeId(id) || ["dead", "engaged"].includes(id)) return [];
    const effect = actor.hasCondition?.(id) || null;
    const numbered = Boolean(definition.system?.condition?.numbered);
    const count = effect ? Number(effect.conditionValue ?? effect.system?.condition?.value ?? 1) : 0;
    const scripts = effect?.manualScripts ?? [];
    const revision = JSON.stringify([id, effect?.uuid ?? effect?.id ?? "", count,
      Boolean(effect?.disabled), scripts.map(script => script.label)]);
    return [{ id, label: localize(definition.name, definition.name), numbered,
      ...(use5e && warhammer5eConditionDescriptions[id]
        ? { description: warhammer5eConditionDescriptions[id] } : {}),
      active: Boolean(effect), value: Number.isFinite(count) ? count : 0, revision,
      scripts: scripts.map((script, index) => ({ index, label: String(script.label ?? effect.name) })) }];
  });
}

export function warhammerConditionActions(actor, game, edition) {
  if (typeof actor.addCondition !== "function" || typeof actor.removeCondition !== "function") return [];
  return readWarhammerConditions(actor, game).flatMap(condition => [
    ...(!condition.active || condition.numbered ? ["add"] : []),
    ...(condition.active ? ["remove"] : []),
    ...condition.scripts.map(script => `apply-${script.index}`)
  ].map(operation => ({ id: `condition:${condition.id}:${operation}`,
    revision: `${edition}|${condition.revision}`, label: condition.label })));
}

export async function executeWarhammerCondition(actor, action) {
  const [, id, operation] = action.id.split(":");
  if (operation === "add") return actor.addCondition(id, 1);
  if (operation === "remove") return actor.removeCondition(id, 1);
  const script = actor.hasCondition(id)?.manualScripts?.[Number(operation.slice(6))];
  if (!script) throw new Error(localize("MIKELANDIA_CONTROLS.Panels.ActionUnavailable", "This game action is no longer available."));
  return script.execute({ actor });
}

/** Read-only rows follow native grouping and visibility without mutating Effects. */
export function warhammerEffectSections(actor) {
  const groups = { disabled: [] };
  for (const effect of actor.allApplicableEffects?.(true) ?? []) {
    if (!effect.show || !effect.disabled) continue;
    groups.disabled.push(effect);
  }
  return Object.entries(groups).flatMap(([id, effects]) => {
    const rows = [];
    const grouped = new Map();
    for (const effect of effects) {
      const prior = grouped.get(effect.name);
      if (prior) { prior.count++; continue; }
      grouped.set(effect.name, { effect, count: 1 });
    }
    for (const { effect, count } of grouped.values()) {
      const source = effect.item?.type === "disease" && !effect.item.system?.show ? "???"
        : effect.isCrewApplied ? effect.actor?.name : effect.source;
      rows.push({ id: String(effect.id), label: `${effect.name}${count > 1 ? ` (${count})` : ""}`,
        value: String(source ?? ""), format: "display" });
    }
    const labelKey = `SHEET.${id[0].toUpperCase()}${id.slice(1)}Effects`;
    return rows.length ? [{ id: `${id}-effects`, label: localize(labelKey, `${id[0].toUpperCase()}${id.slice(1)} Effects`),
      kind: "items", layout: "rows", rows }] : [];
  });
}

export function conditionSection(actor, actions, game = globalThis.game) {
  const byId = new Map((actions ?? []).map(action => [action.id, action]));
  return { id: "conditions", label: localize("Conditions", "Conditions"), kind: "conditions", rows: [],
    conditions: readWarhammerConditions(actor, game).map(condition => ({ ...condition,
      add: byId.get(`condition:${condition.id}:add`), remove: byId.get(`condition:${condition.id}:remove`),
      scripts: condition.scripts.flatMap(script => {
        const action = byId.get(`condition:${condition.id}:apply-${script.index}`);
        return action ? [{ ...script, action }] : [];
      }) })) };
}
