const MODULE_ID = "mikelandia-controls";
export const HIT_LOCATION_SETTING = "fixWfrp5HitLocations";
const AUTO_ROLL = "mikelandiaAutomaticRoll";

export function registerWfrpHitLocationSetting(game = globalThis.game) {
  if (game?.system?.id !== "wfrp4e") return;
  game.settings.register(MODULE_ID, HIT_LOCATION_SETTING, {
    name: "MIKELANDIA_CONTROLS.Settings.WfrpHitLocation.Name",
    hint: "MIKELANDIA_CONTROLS.Settings.WfrpHitLocation.Hint",
    scope: "world", config: true, restricted: true, type: Boolean, default: true
  });
}

/** Supply the reversed final attack result to the native table lookup. */
export function installWfrpHitLocation(scope, game = globalThis.game) {
  if (game?.system?.id !== "wfrp4e") return false;
  const prototype = game.wfrp4e?.rolls5e?.TestWFRP5e?.prototype;
  if (typeof prototype?.computeHitLocation !== "function" || typeof prototype?._reverseDice !== "function") return false;
  const original = prototype.computeHitLocation;
  async function computeHitLocation(...args) {
    if (game.settings.get(MODULE_ID, HIT_LOCATION_SETTING)) {
      const location = this.testData.hitLocation;
      if (location.selected === "roll") {
        // Persist ownership of automatic values through native chat recreation.
        if (!location.roll || location.roll === location[AUTO_ROLL]) {
          location.roll = this._reverseDice(this.result.roll);
          location[AUTO_ROLL] = location.roll;
        } else delete location[AUTO_ROLL];
      }
    }
    return original.apply(this, args);
  }
  prototype.computeHitLocation = computeHitLocation;
  scope.own(() => {
    if (prototype.computeHitLocation === computeHitLocation) prototype.computeHitLocation = original;
  });
  return true;
}
