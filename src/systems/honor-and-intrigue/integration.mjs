import { createNativeProfileIntegration } from "../native-profile.mjs";
import { intrigueProfile } from "./profile.mjs";
import { intrigueActions, intrigueEdits } from "./commands.mjs";
import { localizeFoundry } from "../../foundry/settings/localization.mjs";
import { intrigueConditionDescriptions } from "./condition-descriptions.mjs";

export const intrigueIntegration = createNativeProfileIntegration({ id: "honor-and-intrigue", actorType: "hero",
  notesAfterSections: true,
  conditionControl: "checkbox", conditionDescription: id => intrigueConditionDescriptions[id],
  notesPath: "system.notes", toggleStatus: "toggleStatusEffect", profile: intrigueProfile, actions: intrigueActions, edits: intrigueEdits,
  bio: actor => [["motivation", "Motivation", "HONOR_INTRIGUE.Sheet.Labels.Motivation", actor.system.motivation, false],
    ...Object.entries({ description: ["Description", "Description"], backstory: ["Backstory", "Backstory"], origin: ["Origin", "Origin"],
      friendsAndContacts: ["Friends & Contacts", "FriendsContacts"], rivalsAndEnemies: ["Rivals & Enemies", "RivalsEnemies"] })
      .map(([id, [label, key]]) => [id, label, `HONOR_INTRIGUE.Actor.Sheet.Labels.Background.${key}`, actor.system.background?.[id], true])]
    .flatMap(([id, label, key, text, richText]) => typeof text === "string" && text.trim()
      ? [{ id, label: localizeFoundry(key, label), kind: "text", richText, text, rows: [] }] : []),
  integration: {
    readDamageHealth: actor => actor.type === "hero" && Number.isFinite(actor.system.lifeblood?.value)
      ? { value: actor.system.lifeblood.value, temp: 0, noun: "lifeblood" } : null,
    readCombatHealth: actor => Number.isFinite(actor?.system?.lifeblood?.value) && actor.system.lifeblood.max > 0
      ? { value: actor.system.lifeblood.value, max: actor.system.lifeblood.max, label: "Lifeblood", labelKey: "HONOR_INTRIGUE.Sheet.Labels.Lifeblood",
        status: actor.statuses?.has("dead") ? "Dead" : actor.system.lifeblood.value <= 0 ? "Dying" : actor.system.lifeblood.value < actor.system.lifeblood.max ? "Wounded" : "Healthy" } : null,
    combatHealthPaths: ["system.lifeblood.value", "system.lifeblood.max", "system.advantage"],
    isNativeDialog: application => application?.options?.classes?.includes("honor-intrigue") && application.options.classes.includes("roll-dialog")
  }
});
