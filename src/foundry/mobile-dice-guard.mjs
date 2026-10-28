/**
 * Keep Dice So Nice integrated with Foundry while adapting only its local
 * renderer. No DSN user flags or world settings are changed.
 */
export function enableMobileDiceGuard(scope, {
  policy = Object.freeze({ dice: "static" }),
  getGame = () => globalThis.game,
  diagnostics = null,
  journal = null
} = {}) {
  const mode = ["static", "reduced", "normal"].includes(policy?.dice) ? policy.dice : "static";
  let guardedInstance = null;
  let restoreInstance = null;
  let earlyInstance = null;
  let restoreEarlyInstance = null;

  const primeStaticInstance = (instance) => {
    if (mode !== "static" || !instance || earlyInstance === instance || guardedInstance === instance) return;
    restoreEarlyInstance?.();
    const originalEnabled = instance.isEnabled;
    const originalMessageHookDisabled = instance.messageHookDisabled;
    const staticEnabled = () => false;
    instance.isEnabled = staticEnabled;
    instance.messageHookDisabled = true;
    earlyInstance = instance;
    restoreEarlyInstance = () => {
      if (instance.isEnabled === staticEnabled) instance.isEnabled = originalEnabled;
      instance.messageHookDisabled = originalMessageHookDisabled;
      earlyInstance = null;
      restoreEarlyInstance = null;
    };
  };

  const install = (readyInstance = null) => {
    const game = getGame();
    if (!game?.modules?.get?.("dice-so-nice")?.active) return;
    const instance = readyInstance?.box ? readyInstance : game.dice3d;
    if (!instance || guardedInstance === instance) return;
    restoreInstance?.();
    if (earlyInstance === instance) restoreEarlyInstance?.();
    guardedInstance = instance;
    restoreInstance = guardDiceInstance(instance, { mode, diagnostics, journal });
  };

  scope.hook("diceSoNiceInit", primeStaticInstance);
  install();
  scope.hook("diceSoNiceReady", install);
  scope.timeout(install, 0);
  scope.own(() => {
    restoreInstance?.();
    restoreEarlyInstance?.();
    restoreInstance = null;
    guardedInstance = null;
  });
  return true;
}

export function guardDiceInstance(instance, { mode = "static", diagnostics = null, journal = null } = {}) {
  const cleanups = [];
  const own = (cleanup) => cleanups.push(cleanup);

  const originalShow = instance.show;
  if (mode !== "static" && typeof originalShow === "function") {
    const guardedShow = function (...args) {
      journal?.recordRisk?.("dice-so-nice-roll", `mode:${mode}`);
      const result = originalShow.apply(this, args);
      if (typeof result?.then === "function") {
        return result.then((shown) => {
          if (shown !== false) journal?.recordDiceSuccess?.();
          return shown;
        });
      }
      if (result !== false) journal?.recordDiceSuccess?.();
      return result;
    };
    instance.show = guardedShow;
    own(() => { if (instance.show === guardedShow) instance.show = originalShow; });
  }

  if (mode === "static") {
    const originalEnabled = instance.isEnabled;
    const originalMessageHookDisabled = instance.messageHookDisabled;
    const staticEnabled = () => false;
    instance.isEnabled = staticEnabled;
    instance.messageHookDisabled = true;
    drainHiddenAnimations(instance);
    try { instance.box?.clearAll?.(); } catch { /* An idle renderer may not have a scene yet. */ }
    const restoreRenderer = suspendDiceRenderer(instance);
    if (restoreRenderer) own(restoreRenderer);
    diagnostics?.record?.("info", "Graphics safety is using static native dice results on this device");
    own(() => {
      if (instance.isEnabled === staticEnabled) instance.isEnabled = originalEnabled;
      instance.messageHookDisabled = originalMessageHookDisabled;
    });
  } else if (mode === "reduced") {
    const restoreQuality = reduceDiceQuality(instance);
    if (restoreQuality) own(restoreQuality);
    diagnostics?.record?.("info", "Graphics safety reduced Dice So Nice GPU quality on this device");
  }

  return () => {
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { cleanup(); } catch (error) {
        diagnostics?.record?.("warn", "Could not fully restore Dice So Nice rendering", error);
      }
    }
  };
}

export function reduceDiceQuality(instance) {
  const box = instance?.box;
  const factory = box?.dicefactory ?? instance?.DiceFactory;
  const renderer = box?.renderer ?? instance?.dice3dRenderers?.board;
  if (!box || !factory) return null;

  const quality = {
    realisticLighting: factory.realisticLighting,
    aa: factory.aa,
    glow: factory.glow,
    useHighDPI: factory.useHighDPI,
    shadows: factory.shadows,
    shadowQuality: factory.shadowQuality,
    lightCastShadow: box.light?.castShadow,
    deskReceiveShadow: box.desk?.receiveShadow,
    shadowMapEnabled: renderer?.shadowMap?.enabled,
    shadowMapType: renderer?.shadowMap?.type,
    pixelRatio: renderer?.getPixelRatio?.()
  };

  const reduced = {
    ...(box.config ?? {}),
    bumpMapping: false,
    antialiasing: "none",
    glow: false,
    useHighDPI: false,
    shadowQuality: "none"
  };
  if (typeof factory.setQualitySettings === "function") factory.setQualitySettings(reduced);
  else {
    factory.realisticLighting = false;
    factory.aa = "none";
    factory.glow = false;
    factory.useHighDPI = false;
    factory.shadows = false;
    factory.shadowQuality = "none";
  }
  if (box.light) box.light.castShadow = false;
  if (box.desk) box.desk.receiveShadow = false;
  if (renderer?.shadowMap) renderer.shadowMap.enabled = false;
  renderer?.setPixelRatio?.(1);

  return () => {
    factory.realisticLighting = quality.realisticLighting;
    factory.aa = quality.aa;
    factory.glow = quality.glow;
    factory.useHighDPI = quality.useHighDPI;
    factory.shadows = quality.shadows;
    factory.shadowQuality = quality.shadowQuality;
    if (box.light && quality.lightCastShadow !== undefined) box.light.castShadow = quality.lightCastShadow;
    if (box.desk && quality.deskReceiveShadow !== undefined) box.desk.receiveShadow = quality.deskReceiveShadow;
    if (renderer?.shadowMap && quality.shadowMapEnabled !== undefined) {
      renderer.shadowMap.enabled = quality.shadowMapEnabled;
      renderer.shadowMap.type = quality.shadowMapType;
    }
    if (Number.isFinite(Number(quality.pixelRatio))) renderer?.setPixelRatio?.(Number(quality.pixelRatio));
  };
}

function drainHiddenAnimations(instance) {
  const queue = Array.isArray(instance?.hiddenAnimationQueue) ? instance.hiddenAnimationQueue.splice(0) : [];
  for (const entry of queue) {
    try { entry?.resolve?.(false); } catch { /* A stale DSN promise is safe to discard. */ }
  }
}

function suspendDiceRenderer(instance) {
  const box = instance?.box;
  const renderer = box?.renderer ?? instance?.dice3dRenderers?.board;
  const wrapper = instance?.canvas?.[0] ?? box?.container ?? null;
  if (!renderer) return null;
  const width = Number(box?.display?.containerWidth ?? wrapper?.clientWidth ?? globalThis.innerWidth ?? 1) || 1;
  const height = Number(box?.display?.containerHeight ?? wrapper?.clientHeight ?? globalThis.innerHeight ?? 1) || 1;
  const pixelRatio = Number(renderer.getPixelRatio?.()) || 1;
  const display = wrapper?.style?.display ?? "";
  renderer.setPixelRatio?.(1);
  renderer.setSize?.(1, 1, false);
  if (wrapper?.style) wrapper.style.display = "none";

  return () => {
    if (wrapper?.style) wrapper.style.display = display;
    renderer.setPixelRatio?.(pixelRatio);
    renderer.setSize?.(width, height, false);
  };
}
