import { localizeFoundry } from "../foundry/settings/localization.mjs";
import { CommandError } from "../foundry/commands/command-error.mjs";
import { readWarhammerContext } from "./wfrp4e/context.mjs";

/** Native notes are declared by an adapter; callers never supply a writable path. */
export function nativeActorNotes({ actorType, read, update, fields = () => [] }) {
  return Object.freeze({
    available: actor => actor?.type === actorType && typeof read(actor) === "string",
    read,
    fields: (actor, game) => fields(actor, game).map(({ update: _update, ...field }) => Object.freeze(field)),
    async save(actor, payload, assertCurrent, game = globalThis.game) {
      if (actor?.type !== actorType || typeof read(actor) !== "string" || typeof actor.update !== "function") {
        throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("MIKELANDIA_CONTROLS.Notes.Unavailable", "Notes are unavailable for this actor."));
      }
      const availableFields = fields(actor, game);
      if (payload.biographyField !== "notes" && typeof payload.notesContextRevision === "string"
        && availableFields.length && payload.notesContextRevision !== availableFields[0].revision) {
        throw new CommandError("STALE_STATE", localizeFoundry("MIKELANDIA_CONTROLS.Panels.EditionChanged", "The game edition changed. Reopen the action."));
      }
      const field = payload.biographyField === "notes" ? null : availableFields.find(field => field.id === payload.biographyField);
      if (Object.keys(payload).some(key => !["actorSourceUuid", "actorId", "section", "value", "originalValue", "biographyField", "notesContextRevision"].includes(key))
        || payload.section !== "notes" || (payload.biographyField !== "notes" && !field)
        || typeof payload.value !== "string" || typeof payload.originalValue !== "string"
        || payload.value.length > (field ? 20000 : 100000) || payload.originalValue.length > (field ? 20000 : 100000)) {
        throw new CommandError("INVALID_INPUT", localizeFoundry("MIKELANDIA_CONTROLS.Notes.Invalid", "Invalid notes request."));
      }
      assertCurrent();
      if (field && payload.notesContextRevision !== field.revision) {
        throw new CommandError("STALE_STATE", localizeFoundry("MIKELANDIA_CONTROLS.Panels.EditionChanged", "The game edition changed. Reopen the action."));
      }
      const current = field ? field.value : read(actor);
      if (current !== payload.originalValue) throw new CommandError("STALE_STATE", localizeFoundry("MIKELANDIA_CONTROLS.Notes.Changed", "Notes changed while being edited. Reopen the editor and try again."));
      const changed = payload.value !== current;
      if (changed) await (field ? field.update(actor, payload.value) : update(actor, payload.value));
      assertCurrent();
      return Object.freeze({ section: "notes", changed });
    }
  });
}

function warhammerAmbitions(actor, game) {
  const context = readWarhammerContext(game);
  if (actor?.type !== "character" || !context) return [];
  return ["personal", "party"].flatMap(group => (context.use5e ? ["long"] : ["short", "long"]).map(term => {
    const key = `${group}-ambitions`, leaf = `${term}-term`;
    return {
      id: `${group}-${term}`, group, groupLabelKey: group === "personal" ? "Personal Ambitions" : "Party Ambitions",
      labelKey: context.use5e ? (group === "personal" ? "Personal Ambitions" : "Party Ambitions") : term === "short" ? "Short Term" : "Long Term",
      value: String(actor.system?.details?.[key]?.[leaf] ?? ""), revision: context.revision,
      update: (actor, value) => actor.update({ [`system.details.${key}.${leaf}`]: value })
    };
  }));
}

export const warhammerNotes = nativeActorNotes({ actorType: "character",
  fields: warhammerAmbitions,
  read: actor => actor.system?.details?.biography?.value,
  update: (actor, value) => actor.update({ "system.details.biography.value": value }) });
export const shadowdarkNotes = nativeActorNotes({ actorType: "Player",
  read: actor => actor.system?.notes,
  update: (actor, value) => actor.update({ "system.notes": value }) });
