/**
 * Resolve the user's preference and the page-lifetime device class separately.
 * Auto detection is intentionally sticky: browser chrome, orientation changes,
 * reconnects and display zoom may change viewport geometry, not the device.
 */
export function createActivationPolicyResolver({
  getWindow = () => globalThis.window,
  getNavigator = () => globalThis.navigator
} = {}) {
  let resolvedAutoMode = null;
  return Object.freeze({
    resolve(preferences = {}) {
      const window = getWindow();
      const navigator = getNavigator();
      const preference = normalizedPreference(preferences.mode);
      if (preference === "auto" && !resolvedAutoMode) {
        resolvedAutoMode = classifyRuntimeMode({ window, navigator });
      }
      const runtimeMode = preference === "auto"
        ? resolvedAutoMode
        : preference === "off" || preference === "desktop"
          ? "desktop"
          : preference;
      const width = Math.max(1, window.visualViewport?.width ?? window.innerWidth);
      const height = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
      return Object.freeze({
        active: runtimeMode !== "desktop",
        preference,
        runtimeMode,
        formFactor: runtimeMode,
        orientation: resolveOrientation({ window, navigator, width, height }),
        theme: resolveTheme(preferences.theme, window)
      });
    },
    get resolvedAutoMode() {
      return resolvedAutoMode;
    }
  });
}

/** Physical keyboards and software keyboards may change the visual viewport's
 * aspect ratio without rotating the device. Prefer the device orientation API
 * only for touch/mobile runtimes; desktop forced-mode testing still follows
 * the resized browser viewport. */
export function resolveOrientation({ window = globalThis.window, navigator = globalThis.navigator, width, height } = {}) {
  const viewportWidth = Math.max(1, Number(width) || window?.visualViewport?.width || window?.innerWidth || 1);
  const viewportHeight = Math.max(1, Number(height) || window?.visualViewport?.height || window?.innerHeight || 1);
  const userAgent = String(navigator?.userAgent ?? "");
  const touchRuntime = (navigator?.maxTouchPoints ?? 0) > 0
    || Boolean(window?.matchMedia?.("(pointer: coarse)")?.matches)
    || /Android|iPhone|iPad|iPod|Mobile|Tablet/iu.test(userAgent);
  if (touchRuntime) {
    const type = String(window?.screen?.orientation?.type ?? "");
    if (type.startsWith("landscape")) return "landscape";
    if (type.startsWith("portrait")) return "portrait";
    const angle = Number(window?.orientation);
    if (Number.isFinite(angle)) return Math.abs(angle) % 180 === 90 ? "landscape" : "portrait";
  }
  return viewportWidth > viewportHeight ? "landscape" : "portrait";
}

export function classifyRuntimeMode({ window = globalThis.window, navigator = globalThis.navigator } = {}) {
  const userAgent = String(navigator.userAgent ?? "");
  const platform = String(navigator.userAgentData?.platform ?? navigator.platform ?? "");
  const reportsMobile = navigator.userAgentData?.mobile;

  if (reportsMobile === true || /iPhone|iPod|Mobile.+Android|Android.+Mobile/iu.test(userAgent)) return "phone";
  if (/iPad|Tablet|Silk|Kindle|PlayBook/iu.test(userAgent)) return "tablet";
  if (/Android/iu.test(userAgent) || /^Android$/iu.test(platform)) return /Mobile/iu.test(userAgent) ? "phone" : "tablet";
  // iPadOS desktop-site mode identifies itself as Macintosh with touch.
  if (/^MacIntel$/iu.test(navigator.platform ?? "") && /Macintosh/iu.test(userAgent)
    && !navigator.userAgentData?.platform && (navigator.maxTouchPoints ?? 0) > 1) return "tablet";
  // Touch, coarse pointers, small windows and display zoom are not evidence of
  // a mobile device. Unknown devices and laptops stay in Foundry's desktop UI.
  return "desktop";
}

/** A page-lifetime override used by "Return to desktop interface". */
export function createSessionActivationOverride() {
  let suspended = false;
  return Object.freeze({
    apply(policy) {
      return suspended ? Object.freeze({ ...policy, active: false }) : policy;
    },
    suspend() {
      suspended = true;
    }
  });
}

function normalizedPreference(value) {
  return ["auto", "phone", "tablet", "desktop", "off"].includes(value) ? value : "auto";
}

function resolveTheme(preference, window = globalThis.window) {
  if (preference === "light" || preference === "dark") return preference;
  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
}
