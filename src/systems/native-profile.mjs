import { fallbackIntegration } from "./fallback/integration.mjs";
import { createProfilePanels, readProfilePath } from "./profile-view.mjs";
import { nativeActorNotes } from "./actor-notes.mjs";
import { ACTOR_COMMANDS } from "../kernel/state/command-names.mjs";
import { CommandError } from "../foundry/commands/command-error.mjs";
import { localizeFoundry } from "../foundry/settings/localization.mjs";

export const documents = collection => Array.from(collection?.contents ?? collection ?? []);
export const safeKey = key => typeof key === "string" && /^[a-zA-Z0-9_-]{1,128}$/u.test(key)
  && !["__proto__", "constructor", "prototype"].includes(key);
export function ownedItem(actor, item) {
  return item && safeKey(item.id) && item.parent === actor && item.visible !== false && item.isOwner !== false
    && item.system?.identified !== false;
}
export const valueField = (id, label, path, extra = {}) => ({ id, label, path, ...extra });
export const resourceField = (id, label, path, extra = {}) => valueField(id, label, path,
  { editId: id, editControl: "counter", ...extra });
export const valuesSection = (id, label, fields) => ({ id, label, kind: "values", fields });
export const resourceSections = fields => fields.map(field => ({ id: field.id, label: field.label,
  kind: field.editControl === "counter" ? "counters" : "values", fields: [field] }));
export const itemSection = (id, label, itemTypes, extra = {}) => ({ id, label, kind: "items", collectionPath: "items",
  itemTypes, descriptionPath: "system.description", descriptionToggle: "name",
  include: (item, _context, actor) => ownedItem(actor, item), ...extra });

const fail = (code, message) => new CommandError(code, message);
const nativeSource = doc => doc?.toObject?.() ?? doc?.system;

/** Shared profile plumbing; each integration supplies code-owned native operations. */
export function createNativeProfileIntegration(spec) {
  const revisions = new WeakMap();
  let nextRevision = 0;
  const notes = nativeActorNotes({ actorType: spec.actorType,
    read: actor => readProfilePath(actor, spec.notesPath),
    update: (actor, value) => actor.update({ [spec.notesPath]: value }) });
  const eligible = (actor, user) => actor?.type === spec.actorType && fallbackIntegration.isActorEligible(actor, user);
  const available = (actor, game, user = game?.user) => game?.system?.id === spec.id && eligible(actor, user);
  const revision = (actor, game) => {
    const signature = JSON.stringify([game?.system?.version, spec.settings?.(game), actor.system?.toObject?.() ?? actor.system,
      documents(actor.items).map(item => [item.id, item.visible, item.isOwner, nativeSource(item)]),
      documents(actor.effects).map(effect => [effect.id, effect.disabled, nativeSource(effect), Array.from(effect.statuses ?? [])]), Array.from(actor.statuses ?? [])]);
    let current = revisions.get(actor);
    if (current?.signature !== signature) revisions.set(actor, current = { signature, value: `${spec.id}:${++nextRevision}` });
    return current.value;
  };
  const conditions = actor => Object.values(globalThis.CONFIG?.statusEffects ?? {}).filter(status => safeKey(status?.id)).map(status => ({
    id: status.id, label: localizeFoundry(status.name ?? status.label, status.name ?? status.label ?? status.id),
    active: actor.statuses?.has(status.id) === true, description: spec.conditionDescription?.(status.id)
  }));
  const toggleCondition = async (actor, status) => {
    const active = !status.active, hooks = globalThis.Hooks;
    let resolve, timer;
    const changed = new Promise(done => { resolve = done; });
    const check = document => {
      if ((document === actor || document?.parent === actor) && actor.statuses?.has(status.id) === active) resolve();
    };
    const events = ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateActor"];
    for (const event of events) hooks?.on?.(event, check);
    try {
      // H+I's override starts the native update without returning its promise.
      await actor[spec.toggleStatus](status.id, { active });
      if (actor.statuses?.has(status.id) !== active) await Promise.race([changed, new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(fail("COMMAND_FAILED", "Foundry did not confirm the condition change.")), 5000);
      })]);
      return true;
    } finally {
      clearTimeout(timer);
      for (const event of events) hooks?.off?.(event, check);
    }
  };
  const actions = (actor, game, user) => {
    if (!available(actor, game, user)) return [];
    const current = revision(actor, game);
    return [...spec.actions(actor, game), ...(typeof actor[spec.toggleStatus] === "function" ? conditions(actor).map(status => ({
      id: `status:${status.id}`, label: status.label, active: status.active, icon: "fa-lightbulb",
      invoke: () => toggleCondition(actor, status)
    })) : [])].map(action => ({ ...action, revision: current }));
  };
  const edits = (actor, game, user) => {
    if (!available(actor, game, user)) return [];
    const current = revision(actor, game);
    return spec.edits(actor, game).filter(edit => (edit.kind === "number" ? typeof edit.value === "number" && Number.isFinite(edit.value)
      : Number.isSafeInteger(edit.value))
      && Number.isSafeInteger(edit.min ?? 0) && (edit.max === undefined || Number.isSafeInteger(edit.max)))
      .map(edit => ({ kind: "integer", min: 0, ...edit, revision: current }));
  };
  const publicRecord = ({ invoke: _invoke, write: _write, roll: _roll, ...record }) => Object.freeze(record);
  const createCommands = ({ getGame = () => globalThis.game } = {}) => Object.freeze({
    commandKey: name => name === ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION ? `${spec.id}:native-action` : undefined,
    supportsCommand: name => [ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE,
      ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION].includes(name),
    capabilitiesForActor(actor, user) {
      return { profileActions: actions(actor, getGame(), user).map(publicRecord), profileEdits: edits(actor, getGame(), user).map(publicRecord) };
    },
    async execute(name, payload, _expected, _observer, context) {
      const { actor, assertCurrent, sourceUuid } = context, game = getGame();
      if (!available(actor, game)) throw fail("CAPABILITY_UNAVAILABLE", "This character is unavailable.");
      if (name === ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION) return notes.save(actor, payload, assertCurrent, game);
      const editing = name === ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE;
      if (!editing && name !== ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION) throw fail("CAPABILITY_UNAVAILABLE", "This action is unavailable.");
      const keys = editing ? ["resourceId", "resourceRevision", "expectedValue", "value"] : ["actionId", "actionRevision"];
      if (Object.keys(payload).some(key => !["actorId", "actorSourceUuid", ...keys].includes(key))) throw fail("INVALID_INPUT", "Invalid game action.");
      const entry = (editing ? edits(actor, game) : actions(actor, game)).find(entry => entry.id === payload[editing ? "resourceId" : "actionId"]);
      if (!entry) throw fail("CAPABILITY_UNAVAILABLE", "This action is no longer available.");
      if (entry.revision !== payload[editing ? "resourceRevision" : "actionRevision"] || (editing && entry.value !== payload.expectedValue))
        throw fail("STALE_STATE", "The character changed. Reopen the action.");
      if (editing && ((entry.kind === "number" ? typeof payload.value !== "number" || !Number.isFinite(payload.value) : !Number.isSafeInteger(payload.value)) || payload.value < entry.min
        || payload.value > (entry.max ?? Number.MAX_SAFE_INTEGER)
        || (entry.choices && !entry.choices.some(choice => choice.value === payload.value)))) throw fail("INVALID_INPUT", "Enter a value within this resource's limits.");
      assertCurrent();
      if (editing) {
        if (payload.value === entry.value) return { ok: true, unchanged: true, actorSourceUuid: sourceUuid };
        const result = await entry.write(payload.value, assertCurrent);
        return { ok: true, cancelled: result === false, actorSourceUuid: sourceUuid };
      }
      let rolled = false;
      let failure, committed = false;
      const hooks = globalThis.Hooks;
      const checkpoint = () => {
        try {
          assertCurrent();
          if (!committed && revision(actor, getGame()) !== entry.revision) throw fail("STALE_STATE", "The character changed while the action was open.");
          committed = true;
        } catch (error) { failure = error; return false; }
      };
      const guardWrite = document => {
        if (document === actor || document.parent === actor) return checkpoint();
      };
      const actorMessage = message => message.speaker?.actor === actor.id || documents(actor.items).some(item => typeof item.uuid === "string" &&
        [message.system?.uuid, message.system?.maneuver, message.system?.relatedItemUuid].includes(item.uuid));
      const guardMessage = message => { if (actorMessage(message)) return checkpoint(); };
      const observe = message => {
        const author = message.author?.id ?? message.user?.id ?? message.user;
        if (String(author) === String(game.user.id) && actorMessage(message) && message.rolls?.length) rolled = true;
      };
      hooks?.on?.("createChatMessage", observe);
      hooks?.on?.("preCreateChatMessage", guardMessage);
      hooks?.on?.("preUpdateActor", guardWrite);
      hooks?.on?.("preUpdateItem", guardWrite);
      try {
        context.rollTiming?.mark("native-invoked");
        const result = await entry.invoke(() => {
          assertCurrent();
          if (revision(actor, getGame()) !== entry.revision) throw fail("STALE_STATE", "The character changed while the action was opening.");
        });
        if (failure) throw failure;
        if (result?.rolls?.length) rolled = true;
        return { ok: true, actorSourceUuid: sourceUuid, nativeHandled: true, rolled, cancelled: entry.roll === true && result == null && !rolled };
      } finally {
        hooks?.off?.("createChatMessage", observe); hooks?.off?.("preCreateChatMessage", guardMessage);
        hooks?.off?.("preUpdateActor", guardWrite); hooks?.off?.("preUpdateItem", guardWrite);
      }
    }
  });
  return Object.freeze({ ...fallbackIntegration, ...spec.integration, id: spec.id, notes, createCommands,
    features: Object.freeze({ ...fallbackIntegration.features, profilePanels: true, biography: true }),
    refreshSelectedActorForHook: hook => /^(create|update|delete)(Item|ActiveEffect|Combat|Combatant)$/u.test(hook),
    settingInvalidation: key => key.startsWith(`${spec.id}.`) ? { domains: ["actors", "combat"], refreshSelectedActor: true } : null,
    createActorViewRecord(actor, user, capabilitiesForActor = () => ({})) {
      const identity = fallbackIntegration.createActorViewRecord(actor, user);
      if (!available(actor, globalThis.game, user)) return identity;
      const capabilities = capabilitiesForActor(actor, user);
      const profile = spec.profile(actor, globalThis.game);
      profile.tabs.push({ id: "effects", label: "Conditions", sections: [valuesSection("conditions", "Conditions",
        conditions(actor).map(status => valueField(status.id, status.label, null,
          { read: () => status.active, format: "boolean", ...(spec.conditionControl === "checkbox" ? { editControl: "checkbox" } : {}),
            ...(status.description?.length ? { readTooltip: () => [{ label: status.label, bullets: status.description }] } : {}), actionId: `status:${status.id}` })))] });
      const panels = createProfilePanels(actor, profile, { actions: capabilities.profileActions, edits: capabilities.profileEdits });
      const notesSections = spec.bio(actor);
      return Object.freeze({ ...identity, presentation: "profile", profileId: `${spec.id}-${spec.actorType}`,
        numericEditorLayout: "stacked", panels, notesAvailable: notes.available(actor), notesTabLabel: "Bio", notesSections,
        ...(spec.notesAfterSections ? { notesAfterSections: true } : {}),
        notesRevision: JSON.stringify([notes.read(actor), notesSections]), capabilities: { editBiography: notes.available(actor) } });
    }
  });
}

export function resourceEdit(actor, id, path, { min = 0, max, ...extra } = {}) {
  return { id, value: readProfilePath(actor, path), min, max, write: async value => {
    await actor.update({ [path]: value });
    return readProfilePath(actor, path) === value;
  }, ...extra };
}
export function inventoryEdits(actor, types, equipment) {
  return documents(actor.items).filter(item => ownedItem(actor, item) && types.includes(item.type)).flatMap(item => [
    ...(typeof item.update === "function" ? [{ id: `quantity:${item.id}`, value: item.system.quantity, min: 0,
      write: value => item.update({ "system.quantity": value }) }] : []),
    ...equipment(item)
  ]);
}
