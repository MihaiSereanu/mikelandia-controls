import { readProfilePath } from "../profile-view.mjs";
import { isShadowdarkPlayer, shadowdarkContext } from "./context.mjs";
import { CommandError } from "../../foundry/command-error.mjs";
import { localizeFoundry } from "../../foundry/localization.mjs";

const integer = n => Number.isSafeInteger(n) && n >= 0;
const error = (code, key, fallback) => new CommandError(code, localizeFoundry(`VEMOBILE.Panels.${key}`, fallback));
export function shadowdarkResourceEdits(actor, game, user = game?.user) {
  const context = shadowdarkContext(game);
  if (!context || !isShadowdarkPlayer(actor, user) || typeof actor.update !== "function") return [];
  const hp = readProfilePath(actor, "system.attributes.hp.value"), max = readProfilePath(actor, "system.attributes.hp.max");
  const luck = readProfilePath(actor, context.pulp ? "system.luck.remaining" : "system.luck.available");
  return Object.freeze([
    ...(integer(hp) && integer(max) ? [{ id: "hp", kind: "integer", min: 0, max, value: hp, revision: JSON.stringify([context.revision, max]) }] : []),
    ...((context.pulp ? integer(luck) : typeof luck === "boolean") ? [{ id: "luck", kind: context.pulp ? "integer" : "boolean", ...(context.pulp ? { min: 0 } : {}), value: luck, revision: context.revision }] : [])
  ].map(Object.freeze));
}
export async function editShadowdarkResource(payload, context, game) {
  const { actor, assertCurrent, sourceUuid } = context;
  const edits = shadowdarkResourceEdits(actor, game);
  const edit = edits.find(edit => edit.id === payload.resourceId);
  if (!edit) throw error("CAPABILITY_UNAVAILABLE", "ActionUnavailable", "This game action is no longer available.");
  if (Object.keys(payload).some(key => !["actorSourceUuid", "actorId", "resourceId", "resourceRevision", "expectedValue", "value"].includes(key))) throw error("INVALID_INPUT", "InvalidResource", "Invalid resource edit.");
  if (payload.resourceRevision !== edit.revision || payload.expectedValue !== edit.value) throw error("STALE_STATE", "ResourceChanged", "This resource changed. Reopen the editor and try again.");
  if (edit.kind === "boolean" ? typeof payload.value !== "boolean" : !integer(payload.value) || (edit.max !== undefined && payload.value > edit.max)) throw error("INVALID_INPUT", "InvalidResourceValue", "Enter a valid value within this resource's limits.");
  assertCurrent();
  if (payload.value === edit.value) return { ok: true, unchanged: true, actorSourceUuid: sourceUuid };
  const path = edit.id === "hp" ? "system.attributes.hp.value" : shadowdarkContext(game).pulp ? "system.luck.remaining" : "system.luck.available";
  const updated = await actor.update({ [path]: payload.value });
  return { ok: true, actorSourceUuid: sourceUuid, cancelled: !updated };
}
