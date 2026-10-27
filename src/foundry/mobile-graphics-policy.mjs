export const GRAPHICS_SAFETY_MODES = Object.freeze(["auto", "strict", "balanced", "off"]);
export const DICE_RENDERING_MODES = Object.freeze(["auto", "static", "reduced", "normal"]);


/**
 * Resolve a lightweight, device-local graphics policy. This deliberately uses
 * browser capability hints and Foundry's existing WebGL context; it does not
 * run a benchmark, create another context, or scan/load media at startup.
 */
export function resolveMobileGraphicsPolicy({
  graphicsSafety = "auto",
  diceRendering = "auto",
  navigatorRef = globalThis.navigator,
  screenRef = globalThis.screen,
  getCanvas = () => globalThis.canvas,
  recovery = null,
  // Retained for callers upgrading from the v1 journal API.
  recoveryRecommended = false,
  contextLossRecoveryRecommended = false
} = {}) {
  const device = inspectGraphicsDevice({ navigatorRef, screenRef, getCanvas });
  const requestedEffects = GRAPHICS_SAFETY_MODES.includes(graphicsSafety) ? graphicsSafety : "auto";
  const requestedDice = DICE_RENDERING_MODES.includes(diceRendering) ? diceRendering : "auto";
  const recoveryState = normalizeRecoveryState(recovery, { recoveryRecommended, contextLossRecoveryRecommended });
  const anyRecovery = recoveryState.ambiguousUncleanExit
    || recoveryState.historicalContextLoss
    || recoveryState.repeatedRecentContextLoss;

  let effects = requestedEffects;
  if (effects === "auto") {
    if (device.family === "apple-touch" || anyRecovery || device.tier === "constrained") effects = "strict";
    else if (device.tier === "balanced") effects = "balanced";
    else effects = "off";
  }

  let dice = requestedDice;
  let diceReason = "explicit";
  if (dice === "auto") {
    if (recoveryState.repeatedRecentContextLoss || device.tier === "constrained") {
      dice = "static";
      diceReason = recoveryState.repeatedRecentContextLoss
        ? "repeated-current-webgl-context-loss"
        : `device-${device.tier}:${device.tierReason}`;
    } else if (recoveryState.historicalContextLoss) {
      dice = "reduced";
      diceReason = "historical-context-loss-recovery";
    } else if (recoveryState.ambiguousUncleanExit || device.tier === "balanced") {
      dice = "reduced";
      diceReason = recoveryState.ambiguousUncleanExit
        ? "ambiguous-unclean-graphics-session"
        : `device-${device.tier}:${device.tierReason}`;
    } else {
      dice = "normal";
      diceReason = `device-${device.tier}:${device.tierReason}`;
    }
  }

  return Object.freeze({
    effects,
    dice,
    requestedEffects,
    requestedDice,
    recoveryRecommended: anyRecovery,
    contextLossRecoveryRecommended: recoveryState.repeatedRecentContextLoss,
    recovery: recoveryState,
    diceReason,
    device
  });
}

export function inspectGraphicsDevice({
  navigatorRef = globalThis.navigator,
  screenRef = globalThis.screen,
  getCanvas = () => globalThis.canvas,
  getPixelRatio = () => globalThis.devicePixelRatio
} = {}) {
  const family = isAppleTouchBrowser(navigatorRef)
    ? "apple-touch"
    : isAndroidBrowser(navigatorRef) ? "android" : "other";
  const memoryGb = finitePositive(navigatorRef?.deviceMemory);
  const logicalCores = finitePositive(navigatorRef?.hardwareConcurrency);
  const maxTextureSize = existingMaxTextureSize(getCanvas);
  const width = finitePositive(screenRef?.width) ?? 0;
  const height = finitePositive(screenRef?.height) ?? 0;
  const pixelRatio = Math.max(1, finitePositive(getPixelRatio?.()) ?? 1);
  const backingPixels = width * height * pixelRatio * pixelRatio;

  let tier = "capable";
  let tierReason = "desktop-default";
  if (family === "apple-touch" || family === "android") {
    const hardGpuLimit = maxTextureSize !== null && maxTextureSize <= 4096;
    const combinedLowResources = memoryGb !== null && memoryGb <= 4
      && logicalCores !== null && logicalCores <= 4;
    const capableEvidence = (memoryGb !== null && memoryGb >= 8)
      || (logicalCores !== null && logicalCores >= 8)
      || (maxTextureSize !== null && maxTextureSize >= 8192);
    const capable = capableEvidence
      && (logicalCores === null || logicalCores >= 6)
      && (maxTextureSize === null || maxTextureSize >= 8192)
      && backingPixels <= 14_000_000;
    if (hardGpuLimit || combinedLowResources) {
      tier = "constrained";
      tierReason = hardGpuLimit ? "webgl-max-texture-4096" : "combined-low-memory-and-cpu";
    } else if (capable) {
      tier = "capable";
      tierReason = "strong-capability-signals";
    } else {
      tier = "balanced";
      tierReason = backingPixels > 14_000_000 ? "large-native-backing-surface" : "incomplete-capability-signals";
    }
  }

  return Object.freeze({
    family,
    tier,
    tierReason,
    memoryGb,
    logicalCores,
    maxTextureSize,
    screenWidth: width,
    screenHeight: height,
    pixelRatio,
    backingPixels: Math.round(backingPixels)
  });
}

export function isAppleTouchBrowser(navigatorRef = {}) {
  const userAgent = String(navigatorRef.userAgent ?? "");
  const platform = String(navigatorRef.platform ?? "");
  const touchPoints = Number(navigatorRef.maxTouchPoints ?? 0);
  return /iPad|iPhone|iPod/iu.test(userAgent)
    || (/Mac/iu.test(platform) && touchPoints > 1);
}

export function isAndroidBrowser(navigatorRef = {}) {
  return /Android/iu.test(String(navigatorRef.userAgent ?? ""));
}

function existingMaxTextureSize(getCanvas) {
  try {
    const renderer = getCanvas?.()?.app?.renderer;
    const value = Number(renderer?.texture?.maxTextureSize ?? renderer?.gl?.getParameter?.(renderer.gl.MAX_TEXTURE_SIZE));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeRecoveryState(value, legacy) {
  return Object.freeze({
    ambiguousUncleanExit: value && typeof value === "object"
      ? Boolean(value.ambiguousUncleanExit)
      : Boolean(legacy.recoveryRecommended && !legacy.contextLossRecoveryRecommended),
    historicalContextLoss: Boolean(value?.historicalContextLoss),
    repeatedRecentContextLoss: value && typeof value === "object"
      ? Boolean(value.repeatedRecentContextLoss)
      : Boolean(legacy.contextLossRecoveryRecommended)
  });
}
