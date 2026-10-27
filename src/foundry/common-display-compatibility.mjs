/** Keep mobile token selection independent of Common Display's GM focus. */
export async function enableCommonDisplayManualControl(scope, {
  getGame = () => globalThis.game, getCanvas = () => globalThis.canvas,
  getHooks = () => globalThis.Hooks,
  loadClass = async () => (await import("/modules/monks-common-display/monks-common-display.js")).MonksCommonDisplay
} = {}) {
  const game = getGame();
  if (!game?.modules?.get?.("monks-common-display")?.active || game.user?.isGM) return { active: false };
  const Display = await loadClass();
  if (scope.disposed || getGame() !== game || !Display) return { active: false };
  const restores = [];
  let depth = 0;
  const manual = () => !scope.disposed && getGame() === game && !game.user?.isGM && Display.playerdata?.display === true;
  const block = (object, key, cleanups) => {
    if (typeof object?.[key] !== "function") return;
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor?.configurable === false) return;
    const blocked = () => false;
    Object.defineProperty(object, key, { configurable: true, writable: true, value: blocked });
    cleanups.push(() => {
      if (object[key] !== blocked) return;
      if (descriptor) Object.defineProperty(object, key, descriptor);
      else delete object[key];
    });
  };
  const wrap = callback => function (...args) {
    if (!manual() || depth) return callback.apply(this, args);
    const cleanups = [];
    depth++;
    try {
      const layer = getCanvas()?.tokens;
      block(layer, "releaseAll", cleanups);
      for (const token of new Set([...(layer?.placeables ?? []), ...(layer?.controlled ?? [])])) {
        block(token, "control", cleanups); block(token, "release", cleanups);
      }
      // In Common Display 14.01 these token operations are synchronous, even
      // in its async-declared controlToken hook. Other UI/bookkeeping runs.
      return callback.apply(this, args);
    } finally {
      for (const restore of cleanups.reverse()) restore();
      depth--;
    }
  };
  for (const key of ["changeFocus", "controlToken", "dataChange"]) {
    const original = Display[key];
    if (typeof original !== "function") continue;
    const descriptor = Object.getOwnPropertyDescriptor(Display, key);
    const wrapped = wrap(original);
    Display[key] = wrapped;
    restores.push(() => {
      if (Display[key] !== wrapped) return;
      if (descriptor) Object.defineProperty(Display, key, descriptor);
      else delete Display[key];
    });
  }
  for (const hook of ["controlToken", "updateCombat"]) {
    for (const entry of getHooks()?.events?.[hook] ?? []) {
      if (typeof entry.fn !== "function") continue;
      const original = entry.fn, source = Function.prototype.toString.call(original);
      if (!source.includes("MonksCommonDisplay") || (hook === "controlToken"
        ? !source.includes("shouldControl") || !source.includes("token.release()")
        : !source.includes("MonksCommonDisplay.focusValue") || !source.includes(".control("))) continue;
      const wrapped = wrap(original);
      entry.fn = wrapped;
      restores.push(() => { if (entry.fn === wrapped) entry.fn = original; });
    }
  }
  scope.own(() => { for (const restore of restores.reverse()) restore(); });
  return Object.freeze({ active: true });
}
