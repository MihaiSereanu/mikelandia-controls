/** Resolve only a visible, owned embedded Item on the exact represented actor. */
export function ownedWarhammerItem(actor, id, type) {
  const item = actor.items?.get?.(id) ?? Array.from(actor.items?.contents ?? actor.items ?? []).find(item => String(item.id) === id);
  return item?.type === type && item.parent === actor && item.visible !== false && item.isOwner !== false ? item : null;
}

/** Native model getters include mode overrides and equipment effects. */
export function warhammerWeaponMode(item) {
  try {
    if (item?.type !== "weapon" || item.visible === false || item.isOwner === false || item.system.isEquipped !== true) return null;
    if (item.system.isMelee === true && item.system.isRanged === false) return "melee";
    if (item.system.isRanged === true && item.system.isMelee === false) return "ranged";
  } catch { /* Malformed or unprepared items retain native-sheet access. */ }
  return null;
}

export function weaponForActor(actor, id) {
  const item = ownedWarhammerItem(actor, id, "weapon");
  return item && warhammerWeaponMode(item) ? item : null;
}
