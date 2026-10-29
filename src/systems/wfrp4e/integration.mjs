import { warhammerNotes } from "../actor-notes.mjs";
import { readCombatHealth } from "../combat-health.mjs";
import { fallbackIntegration } from "../fallback/integration.mjs";
import { createProfilePanels } from "../profile-view.mjs";
import { createWarhammerCharacterProfile } from "./profile.mjs";
import { readWarhammerContext } from "./context.mjs";
import { createWarhammerCommands } from "./commands.mjs";

export const warhammerIntegration = Object.freeze({
  ...fallbackIntegration,
  id: "wfrp4e",
  readCombatHealth: actor => readCombatHealth(actor, "system.status.wounds", "Wounds", "Wounds"),
  combatHealthPaths: Object.freeze(["system.status.wounds.value", "system.status.wounds.max"]),
  features: Object.freeze({ ...fallbackIntegration.features, profilePanels: true, biography: true }),
  notes: warhammerNotes,
  createCommands: createWarhammerCommands,
  refreshSelectedActorForHook(hook) {
    return ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"].includes(hook);
  },
  settingInvalidation(key) {
    return ["wfrp4e.editionSettings", "wfrp4e.useGroupAdvantage", "wfrp4e.groupAdvantageValues", "wfrp4e.capAdvantageIB", "wfrp4e.advantagemax"].includes(key)
      ? { domains: ["actors"], refreshSelectedActor: true } : null;
  },
  createActorViewRecord(actor, user, capabilitiesForActor = () => ({})) {
    const identity = fallbackIntegration.createActorViewRecord(actor, user);
    if (actor.type !== "character" || !fallbackIntegration.isActorEligible(actor, user)) return identity;
    const context = readWarhammerContext(globalThis.game);
    if (!context) return identity;
    const capabilities = capabilitiesForActor(actor, user);
    const notesFields = warhammerNotes.fields(actor, globalThis.game);
    const panels = createProfilePanels(actor, createWarhammerCharacterProfile(actor, context), { ...context, actions: capabilities?.profileActions, edits: capabilities?.profileEdits });
    return panels.length ? Object.freeze({ ...identity, presentation: "profile", profileId: "wfrp4e-character",
      edition: context.revision, notesAvailable: warhammerNotes.available(actor), notesFields,
      notesRevision: JSON.stringify([warhammerNotes.available(actor) ? warhammerNotes.read(actor) : "", notesFields]), capabilities: { editBiography: true }, panels }) : identity;
  }
});
