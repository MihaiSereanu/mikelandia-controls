const DICE_RENDERING_MODES = Object.freeze(["auto", "static", "reduced", "normal"]);

/** Resolve local dice rendering from browser hints without reading the canvas. */
export function resolveMobileGraphicsPolicy({
  diceRendering = "auto",
  navigatorRef = globalThis.navigator,
  screenRef = globalThis.screen,
  getPixelRatio = () => globalThis.devicePixelRatio
} = {}) {
  const requested = DICE_RENDERING_MODES.includes(diceRendering) ? diceRendering : "auto";
  const dice = requested === "auto"
    ? automaticDiceMode(navigatorRef, screenRef, getPixelRatio)
    : requested;
  return Object.freeze({ dice });
}

function automaticDiceMode(navigatorRef, screenRef, getPixelRatio) {
  const userAgent = String(navigatorRef?.userAgent ?? "");
  const appleTouchDesktop = /Mac/iu.test(String(navigatorRef?.platform ?? ""))
    && Number(navigatorRef?.maxTouchPoints ?? 0) > 1;
  if (!/Android|iPad|iPhone|iPod/iu.test(userAgent) && !appleTouchDesktop) return "normal";

  const memoryGb = finitePositive(navigatorRef?.deviceMemory);
  const logicalCores = finitePositive(navigatorRef?.hardwareConcurrency);
  if (memoryGb !== null && memoryGb <= 4 && logicalCores !== null && logicalCores <= 4) return "static";

  const width = finitePositive(screenRef?.width) ?? 0;
  const height = finitePositive(screenRef?.height) ?? 0;
  const pixelRatio = Math.max(1, finitePositive(getPixelRatio?.()) ?? 1);
  const capable = ((memoryGb !== null && memoryGb >= 8) || (logicalCores !== null && logicalCores >= 8))
    && (logicalCores === null || logicalCores >= 6)
    && width * height * pixelRatio * pixelRatio <= 14_000_000;
  return capable ? "normal" : "reduced";
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
