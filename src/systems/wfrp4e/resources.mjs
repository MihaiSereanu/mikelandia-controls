import { readProfilePath } from "../profile-view.mjs";
import { localizeFoundry } from "../../foundry/settings/localization.mjs";
import { CommandError } from "../../foundry/commands/command-error.mjs";
import { readWarhammerContext } from "./context.mjs";
import { fallbackIntegration } from "../fallback/integration.mjs";
import { ownedWarhammerItem } from "./items.mjs";
import { warhammerMount, mountRevision } from "./mount.mjs";

// Paths and operations come from the installed native sheet/model, never requests.
const resources = Object.freeze([
  { id: "wounds", label: "Wounds", path: "system.status.wounds.value", maxPath: "system.status.wounds.max", method: "setWounds" },
  ...["fortune", "fate", "resolve", "resilience", "corruption"].map(id => ({ id, label: id[0].toUpperCase() + id.slice(1), path: `system.status.${id}.value` })),
  { id: "advantage", label: "Advantage", path: "system.status.advantage.value", method: "setAdvantage" },
  { id: "momentum", label: "Momentum", path: "system.status.momentum", kind: "boolean" }
]);
const unavailable = () => new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("MIKELANDIA_CONTROLS.Panels.ActionUnavailable", "This game action is no longer available."));
const stale = () => new CommandError("STALE_STATE", localizeFoundry("MIKELANDIA_CONTROLS.Panels.ResourceChanged", "This resource changed. Reopen the editor and try again."));
const integer = value => Number.isSafeInteger(value) && value >= 0;

function resourceState(actor, game, resource, context) {
  if ((["resolve", "resilience", "advantage"].includes(resource.id) && context.use5e)
    || (resource.id === "momentum" && !context.use5e)
    || typeof actor[resource.method ?? "update"] !== "function") return null;
  const value = readProfilePath(actor, resource.path);
  const kind = resource.kind ?? "integer";
  if (kind === "boolean" ? typeof value !== "boolean" : !integer(value)) return null;
  let max = resource.maxPath ? readProfilePath(actor, resource.maxPath) : undefined;
  let group = null;
  let advantageSettings = null;
  if (resource.id === "advantage") {
    if (context.groupAdvantage) {
      const combatant = game.combat?.getCombatantByActor?.(actor);
      if (!combatant || combatant.actor !== actor || !["players", "enemies"].includes(actor.advantageGroup)) return null;
      const sharedValue = game.settings.get("wfrp4e", "groupAdvantageValues")?.[actor.advantageGroup];
      if (!integer(sharedValue) || sharedValue !== value) return null;
      group = [game.combat.id, combatant.id, actor.advantageGroup, sharedValue];
    } else {
      max = readProfilePath(actor, "system.status.advantage.max");
      advantageSettings = [game.settings.get("wfrp4e", "capAdvantageIB"), game.settings.get("wfrp4e", "advantagemax")];
    }
  }
  if ((resource.maxPath || (resource.id === "advantage" && !context.groupAdvantage)) && !integer(max)) return null;
  const labelKey = resource.id === "advantage" && context.groupAdvantage ? "SHEET.GroupAdvantage" : resource.label;
  const label = resource.id === "advantage" && context.groupAdvantage ? "Group Advantage" : resource.label;
  return Object.freeze({ id: resource.id, label: localizeFoundry(labelKey, label), kind,
    revision: JSON.stringify([context.revision, context.groupAdvantage, max ?? null, group, advantageSettings]),
    ...(kind === "integer" ? { min: 0, ...(max !== undefined ? { max } : {}) } : {}), value });
}

export function warhammerResourceEdits(actor, game, user = game?.user) {
  const context = readWarhammerContext(game);
  if (!context || actor?.type !== "character" || !fallbackIntegration.isActorEligible(actor, user)) return [];
  return Object.freeze(resources.flatMap(resource => {
    try { const state = resourceState(actor, game, resource, context); return state ? [state] : []; }
    catch { return []; }
  }).concat(equipmentEdits(actor, context), mountedEdit(actor, context)));
}

function equipmentEdits(actor, context) {
  return Array.from(actor.items?.contents ?? actor.items ?? []).flatMap(item => {
    try {
      const equippable = ["weapon", "armour"].includes(item.type)
        || (item.type === "trapping" && item.system?.trappingType?.value === "clothingAccessories")
        || (item.type === "container" && item.system?.wearable?.value === true);
      if (!equippable || !/^[a-zA-Z0-9_-]{1,128}$/u.test(item.id)
        || ownedWarhammerItem(actor, String(item.id), item.type) !== item || typeof item.update !== "function"
        || typeof item.system?.equipped?.value !== "boolean") return [];
      return [Object.freeze({ id: `equipped:${item.id}`, label: localizeFoundry("Equipped", "Equipped"), kind: "boolean",
        value: item.system.equipped.value, revision: JSON.stringify([context.revision, item.type, item.uuid ?? item.id]) })];
    } catch { return []; }
  });
}

function mountedEdit(actor, context) {
  const mount = warhammerMount(actor);
  if (!mount || typeof actor.update !== "function" || typeof actor.system.status.mount.mounted !== "boolean") return [];
  return [Object.freeze({ id: "mounted", label: localizeFoundry("Mounted", "Mounted"), kind: "boolean",
    value: actor.system.status.mount.mounted, revision: JSON.stringify([context.revision, mountRevision(actor, mount)]) })];
}

export async function editWarhammerResource(payload, { actor, assertCurrent, sourceUuid }, game) {
  const edits = warhammerResourceEdits(actor, game);
  if (!edits.length) throw unavailable();
  const keys = new Set(["actorSourceUuid", "actorId", "resourceId", "resourceRevision", "expectedValue", "value"]);
  if (Object.keys(payload).some(key => !keys.has(key)) || typeof payload.resourceId !== "string"
    || typeof payload.resourceRevision !== "string") throw new CommandError("INVALID_INPUT", localizeFoundry("MIKELANDIA_CONTROLS.Panels.InvalidResource", "Invalid resource edit."));
  const edit = edits.find(edit => edit.id === payload.resourceId);
  if (!edit) throw unavailable();
  if (edit.revision !== payload.resourceRevision || edit.value !== payload.expectedValue) throw stale();
  const valid = edit.kind === "boolean" ? typeof payload.value === "boolean"
    : integer(payload.value) && payload.value >= edit.min && (edit.max === undefined || payload.value <= edit.max);
  if (!valid) throw new CommandError("INVALID_INPUT", localizeFoundry("MIKELANDIA_CONTROLS.Panels.InvalidResourceValue", "Enter a valid value within this resource's limits."));
  assertCurrent();
  if (payload.value === edit.value) return Object.freeze({ ok: true, actorId: String(actor.id), actorSourceUuid: sourceUuid, unchanged: true });
  if (edit.id.startsWith("equipped:")) {
    const id = edit.id.slice("equipped:".length);
    const item = Array.from(actor.items?.contents ?? actor.items ?? []).find(item => String(item.id) === id);
    const updated = await item.update({ "system.equipped.value": payload.value });
    return Object.freeze({ ok: true, actorId: String(actor.id), actorSourceUuid: sourceUuid, ...(!updated ? { cancelled: true } : {}) });
  }
  if (edit.id === "mounted") {
    const updated = await actor.update({ "system.status.mount.mounted": payload.value });
    return Object.freeze({ ok: true, actorId: String(actor.id), actorSourceUuid: sourceUuid, ...(!updated ? { cancelled: true } : {}) });
  }
  const resource = resources.find(resource => resource.id === edit.id);
  // Native update hooks retain group routing, corruption tests, and token effects.
  const updated = resource.method ? await actor[resource.method](payload.value) : await actor.update({ [resource.path]: payload.value });
  if (!updated) return Object.freeze({ ok: true, actorId: String(actor.id), actorSourceUuid: sourceUuid, cancelled: true });
  return Object.freeze({ ok: true, actorId: String(actor.id), actorSourceUuid: sourceUuid,
    submitted: edit.id === "advantage" && readWarhammerContext(game)?.groupAdvantage === true });
}
