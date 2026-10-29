import { readProfilePath } from "./profile-view.mjs";

/** Explicit native remaining-health mappings; temporary HP is a separate resource. */
export function readCombatHealth(actor, path, labelKey, label) {
  try {
    const value = readProfilePath(actor, `${path}.value`);
    const max = readProfilePath(actor, `${path}.max`);
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0
      || typeof max !== "number" || !Number.isFinite(max) || max <= 0) return null;
    return { value, max, labelKey, label };
  } catch { return null; }
}

/** Visible combat rows share the same disposition and remaining-health rules. */
export function projectCombatHealth(integration, token) {
  if (!token || typeof token.disposition !== "number" || !Number.isFinite(token.disposition)) return null;
  try {
    const health = integration.readCombatHealth?.(token.actor);
    if (!health) return null;
    // Enemy records carry only a status, never the underlying numbers.
    return token.disposition === 1 ? health : {
      status: health.value <= health.max * .1 ? "Critical" : health.value <= health.max * .5 ? "Bloodied" : "Healthy"
    };
  } catch { return null; }
}

/** Parent object replacements and native dotted updates both affect health. */
export function combatHealthChanged(integration, fields) {
  return (integration.combatHealthPaths ?? []).some(path => fields.some(field =>
    field === path || field.startsWith(`${path}.`) || path.startsWith(`${field}.`)));
}
