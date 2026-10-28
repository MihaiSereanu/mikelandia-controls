import { createActorDirectoryRecord, createActorViewRecord } from "../../foundry/actors/actor-view.mjs";
import { collectiveReferenceUuids } from "../../foundry/actors/collective-actor-view.mjs";
import { createDnd5eCommandGateway } from "./legacy-gateway.mjs";

export const dnd5eIntegration = Object.freeze({
  id: "dnd5e",
  settingInvalidation(key) {
    if (["dnd5e.levelingMode", "dnd5e.metricLengthUnits", "dnd5e.metricWeightUnits", "dnd5e.metricTravelUnits"].includes(key)) {
      return { domains: ["actors"], refreshSelectedActor: true };
    }
    return key === "dnd5e.initiativeDexTiebreaker" ? { domains: ["combat"] } : null;
  },
  features: Object.freeze({ biography: true, armorClassEditor: true, actionSummaries: true, legacyCharacterSheet: true }),
  itemChangesDirectory: item => item?.type === "class",
  canOpenNativeActor(actor, user) {
    return ["group", "vehicle"].includes(actor?.type) && permitted(actor, user, "OWNER");
  },
  initiativeDecimals(game) {
    try { return game?.settings?.get?.("dnd5e", "initiativeDexTiebreaker") === true ? 2 : 0; }
    catch { return 0; }
  },
  isActorEligible(actor, user) {
    if (["character", "group", "vehicle"].includes(actor?.type)) return permitted(actor, user, "OBSERVER");
    if (actor?.type === "npc") return Boolean(user?.isGM) || permitted(actor, user, "OWNER");
    return false;
  },
  createActorDirectoryRecord,
  createActorViewRecord,
  referenceSources: collectiveReferenceUuids,
  createCommands: createDnd5eCommandGateway
});

function permitted(actor, user, level) {
  try {
    return actor.testUserPermission?.(user, level) ?? (level === "OBSERVER" ? actor.visible ?? false : false);
  } catch {
    return false;
  }
}
