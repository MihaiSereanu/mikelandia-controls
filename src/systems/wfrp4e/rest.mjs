import { ownedWarhammerItem } from "./items.mjs";
import { localizeFoundry } from "../../foundry/settings/localization.mjs";

export function warhammerRestState(actor, context) {
  try {
    const tb = actor.characteristics.t.bonus;
    if (!Number.isFinite(tb)) return null;
    const skill = actor.itemTags.skill.find(item => item.name === localizeFoundry("NAME.Endurance", "Endurance"));
    if (skill && ownedWarhammerItem(actor, String(skill.id), "skill") !== skill) return null;
    if (typeof actor[skill ? "setupSkill" : "setupCharacteristic"] !== "function") return null;
    return { skill, tb, revision: JSON.stringify([context.revision, skill?.id ?? null, tb]) };
  } catch { return null; }
}
