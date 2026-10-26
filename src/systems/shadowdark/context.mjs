import { fallbackIntegration } from "../fallback/integration.mjs";

export const abilities = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
export function isShadowdarkPlayer(actor, user) {
  return actor?.type === "Player" && fallbackIntegration.isActorEligible(actor, user);
}
export function shadowdarkContext(game) {
  try {
    const pulp = game.settings.get("shadowdark", "usePulpMode");
    if (typeof pulp !== "boolean") return null;
    const settings = ["useMomentumMode", "autoConsumeAmmunition", "rollDamage", "trackLightSources", "realtimeLightTracking", "trackInactiveUserLightSources"]
      .map(key => game.settings.get("shadowdark", key) ?? null);
    return { pulp, revision: JSON.stringify(["Player-v1", pulp, ...settings]) };
  } catch { return null; }
}

export function ownedItem(actor, id, type) {
  try {
    const item = actor.items?.get?.(id) ?? Array.from(actor.items?.contents ?? actor.items ?? []).find(item => String(item.id) === id);
    return item && (!type || item.type === type) && item.parent === actor && item.visible !== false && item.isOwner !== false
      && item.uuid === `${actor.uuid}.Item.${item.id}` ? item : null;
  } catch { return null; }
}
export const physicalTypes = Object.freeze(["Basic", "Armor", "Weapon", "Potion", "Scroll", "Wand", "Gem", "Effect"]);
export function carriedItem(item, actor) {
  try { return physicalTypes.includes(item.type) && ownedItem(actor, String(item.id)) === item
    && item.system.isPhysical === true && item.system.isIdentified === true && item.system.stashed === false; }
  catch { return false; }
}
export function weaponMode(item, actor, mode) {
  try { return carriedItem(item, actor) && item.type === "Weapon" && item.system.isWeapon === true && item.system.equipped === true
    && ["melee", "ranged"].includes(item.system.type)
    && (item.system.type === mode || (mode === "ranged" && item.system.isThrown === true)); }
  catch { return false; }
}
export function knownSpell(item, actor) {
  try { return ownedItem(actor, String(item.id), "Spell") === item && item.system.isSpell === true && actor.system.isSpellCaster === true; }
  catch { return false; }
}
export function nativeLightSheet(actor, game) {
  try {
    // The installed native tracker gathers world Player actors assigned to users.
    // Native isClaimedByUser() is async in 4.0.6. Exact current-user
    // assignment already establishes the claim without awaiting in projection.
    if (actor.isToken || game.actors?.get?.(actor.id) !== actor || game.user.character !== actor) return null;
    const sheet = actor.sheet;
    return sheet?.actor === actor && typeof sheet._toggleLightSource === "function"
      && typeof game.shadowdark?.lightSourceTracker?.toggleLightSource === "function" ? sheet : null;
  } catch { return null; }
}
