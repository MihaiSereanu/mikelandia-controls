import { createNativeProfileIntegration } from "../native-profile.mjs";
import { swadeProfile, setting } from "./profile.mjs";
import { swadeActions, swadeEdits } from "./commands.mjs";
import { swadeConditionDescriptions } from "./condition-descriptions.mjs";

export const swadeIntegration = createNativeProfileIntegration({ id: "swade", actorType: "character",
  conditionControl: "checkbox",
  conditionDescription: id => swadeConditionDescriptions[id],
  notesPath: "system.details.notes", toggleStatus: "toggleActiveEffect", profile: swadeProfile, actions: swadeActions, edits: swadeEdits,
  settings: game => ["enableConviction", "wealthType", "noPowerPoints", "ammoManagement", "hardChoices"].map(key => setting(game, key)),
  bio: actor => [["biography", "Biography", actor.system.details?.biography?.value], ["goals", "Goals", actor.system.details?.goals]]
    .filter(([, , text]) => typeof text === "string" && text.trim()).map(([id, label, text]) => ({ id, label, kind: "text", richText: true, text, rows: [] })),
  integration: {
    readDamageHealth: actor => actor.type === "character" && Number.isFinite(actor.system.wounds?.value)
      ? { value: actor.system.wounds.value, temp: 0, noun: "wounds", increasing: true,
        down: actor.statuses?.has("incapacitated") === true } : null,
    readCombatHealth: actor => Number.isFinite(actor?.system?.wounds?.value) && Number.isFinite(actor.system.wounds.max)
      ? { value: actor.system.wounds.value, max: actor.system.wounds.max, labelKey: "SWADE.Wounds", label: "Wounds",
        status: actor.statuses?.has("incapacitated") ? "Incapacitated" : actor.system.wounds.value > 0 ? "Wounded" : "Healthy" } : null,
    combatHealthPaths: ["system.wounds.value", "system.wounds.max"],
    initiativeLabel: combatant => [combatant.system?.cardString, combatant.system?.roundHeld ? "Hold" : "",
      combatant.system?.turnLost ? "Turn lost" : ""].filter(Boolean).join(" · "),
    isNativeDialog: application => application?.options?.classes?.includes("swade") && application.options.classes.includes("roll-dialog")
  }
});
