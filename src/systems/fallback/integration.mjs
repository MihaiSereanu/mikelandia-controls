import { actorSourceUuid } from "../../foundry/character-source.mjs";
import { localizeFoundry } from "../../foundry/localization.mjs";

const NO_CAPABILITIES = Object.freeze({});
const NO_REFERENCES = Object.freeze([]);
const commands = Object.freeze({
  capabilitiesForActor: () => NO_CAPABILITIES,
  supportsCommand: () => false
});

/** Unprofiled systems expose identity and native access, never inferred rules. */
export const fallbackIntegration = Object.freeze({
  id: "fallback",
  features: Object.freeze({ quickbar: false, biography: false, armorClassEditor: false, actionSummaries: false, legacyCharacterSheet: false }),
  isActorEligible: canAccessActor,
  canOpenNativeActor: canAccessActor,
  initiativeDecimals: () => 0,
  settingInvalidation: () => null,
  createActorDirectoryRecord: identityRecord,
  createActorViewRecord(actor, user) {
    return Object.freeze({ ...identityRecord(actor), nativeSheetAvailable: canAccessActor(actor, user) });
  },
  referenceSources: () => NO_REFERENCES,
  createCommands: () => commands
});
function canAccessActor(actor, user) {
  if (!actor || !user) return false;
  if (user.isGM) return true;
  try { return actor.testUserPermission?.(user, "OWNER") === true; }
  catch { return false; }
}

function identityRecord(actor) {
  // No system, item, effect, or sheet getters: even names of unidentified
  // items can be secret. Native sheets remain responsible for their contents.
  const folderPath = [];
  const seen = new Set();
  for (let folder = actor.folder; folder && !seen.has(folder.id); folder = folder.folder) {
    if (!folder.id) break;
    seen.add(folder.id);
    folderPath.unshift(Object.freeze({ id: String(folder.id), name: String(folder.name ?? ""), sort: Number(folder.sort) || 0 }));
  }
  const type = String(actor.type ?? "");
  return Object.freeze({
    id: String(actor.id ?? ""), sourceUuid: actorSourceUuid(actor),
    name: String(actor.name ?? ""), img: String(actor.img ?? ""), type,
    typeLabel: localizeFoundry(`TYPES.Actor.${type}`, type),
    sort: Number(actor.sort) || 0, folderPath: Object.freeze(folderPath), presentation: "native"
  });
}
