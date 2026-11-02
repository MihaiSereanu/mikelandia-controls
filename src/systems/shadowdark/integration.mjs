import { shadowdarkNotes } from "../actor-notes.mjs";
import { readCombatHealth } from "../combat-health.mjs";
import { readDamageHealth } from "../damage-health.mjs";
import { fallbackIntegration } from "../fallback/integration.mjs";
import { createProfilePanels } from "../profile-view.mjs";
import { isShadowdarkPlayer, isShadowdarkItemTracker, shadowdarkContext } from "./context.mjs";
import { shadowdarkPlayerProfile } from "./profile.mjs";
import { createShadowdarkCommands } from "./commands.mjs";
import { itemSpells, watchItemSpells } from "./item-spells.mjs";

export const shadowdarkIntegration = Object.freeze({
  ...fallbackIntegration,
  id: "shadowdark",
  readDamageHealth: actor => readDamageHealth(actor, "Player", "system.attributes.hp.value"),
  readCombatHealth: actor => readCombatHealth(actor, "system.attributes.hp", "SHADOWDARK.sheet.actor.hp", "HP"),
  combatHealthPaths: Object.freeze(["system.attributes.hp.value", "system.attributes.hp.max"]),
  features: Object.freeze({ ...fallbackIntegration.features, profilePanels: true, biography: true }),
  notes: shadowdarkNotes,
  createCommands: createShadowdarkCommands,
  watchActorProfile: watchItemSpells,
  profileDependencySources: actor => shadowdarkContext(globalThis.game)
    ? itemSpells(actor).map(row => row.spell.parent?.uuid ?? row.spell.uuid) : [],
  refreshSelectedActorForHook: hook => ["updateItem", "deleteItem"].includes(hook),
  isNativeDialog(application) {
    const RollDialog = globalThis.shadowdark?.apps?.RollDialogSD;
    return (typeof RollDialog === "function" && application instanceof RollDialog)
      || application?.id === "sd-roll-dialog"
      || application?.options?.id === "sd-roll-dialog";
  },
  settingInvalidation(key) {
    return key.startsWith("shadowdark.") ? { domains: ["actors"], refreshSelectedActor: true } : null;
  },
  createActorViewRecord(actor, user, capabilitiesForActor = () => ({})) {
    const identity = fallbackIntegration.createActorViewRecord(actor, user);
    if (!isShadowdarkPlayer(actor, user)) return identity;
    const context = shadowdarkContext(globalThis.game);
    if (!context) return identity;
    const capabilities = capabilitiesForActor(actor, user);
    const panels = createProfilePanels(actor, shadowdarkPlayerProfile(context, actor), { actions: capabilities?.profileActions, edits: capabilities?.profileEdits });
    return panels.length ? Object.freeze({ ...identity, typeLabel: isShadowdarkItemTracker(actor) ? "" : identity.typeLabel, presentation: "profile", profileId: "shadowdark-player", numericEditorLayout: "stacked", profileInventory: capabilities.profileInventory === true, notesAvailable: shadowdarkNotes.available(actor), notesRevision: shadowdarkNotes.available(actor) ? shadowdarkNotes.read(actor) : "", capabilities: { editBiography: true }, panels }) : identity;
  }
});
