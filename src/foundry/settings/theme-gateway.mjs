const CORE_THEME_SETTING = "core.uiConfig";

/** Apply mobile colors in memory; Foundry's saved UI configuration stays native. */
export function createFoundryThemeGateway({ getGame = () => globalThis.game, getDocument = () => globalThis.document } = {}) {
  let knownConfig = null, appliedFingerprint = "", started = false;
  let readMobileTheme = () => "", setMobileTheme = async () => {};
  let queue = Promise.resolve();
  const readCoreConfig = () => copyUiConfig(getGame()?.settings?.get?.("core", "uiConfig"));
  const sync = requested => {
    const game = getGame(), config = readCoreConfig();
    const theme = normalizedTheme(requested) ?? normalizedTheme(config.colorScheme.interface) ?? documentTheme(getDocument());
    const next = { ...config, colorScheme: { ...config.colorScheme, applications: theme, interface: theme } };
    const fingerprint = JSON.stringify(next);
    if (typeof game?.configureUI === "function" && fingerprint !== appliedFingerprint) {
      game.configureUI(next);
      appliedFingerprint = fingerprint;
    }
    updateHostedSurfaces(getDocument(), theme);
    return true;
  };
  return Object.freeze({
    start(scope, { readTheme, setTheme } = {}) {
      if (started || !scope?.hook || typeof readTheme !== "function" || typeof setTheme !== "function") return false;
      started = true; readMobileTheme = readTheme; setMobileTheme = setTheme;
      knownConfig = readCoreConfig();
      scope.hook("clientSettingChanged", (key, value) => {
        if (key !== CORE_THEME_SETTING || !started) return;
        const next = copyUiConfig(value), previous = knownConfig?.colorScheme.interface;
        knownConfig = next;
        appliedFingerprint = ""; // Foundry has just applied its native choice.
        const theme = normalizedTheme(next.colorScheme.interface) ?? documentTheme(getDocument());
        if (next.colorScheme.interface !== previous && readMobileTheme() !== theme) {
          queue = queue.then(async () => {
            if (!started) return;
            await setMobileTheme(theme);
            if (started) sync(theme);
          }).catch(error => console.warn("Mikelandia Controls | Mobile theme could not be updated", error));
        } else sync(readMobileTheme());
      });
      scope.own(() => { started = false; readMobileTheme = () => ""; setMobileTheme = async () => {}; });
      sync(readMobileTheme());
      return true;
    },
    sync,
    whenIdle: () => queue
  });
}

function normalizedTheme(value) { return value === "light" || value === "dark" ? value : null; }
function documentTheme(document) { return document?.body?.classList?.contains?.("theme-light") ? "light" : "dark"; }
function copyUiConfig(config) {
  const source = config ?? {};
  return { ...source, colorScheme: { ...(source.colorScheme ?? {}) }, fade: { ...(source.fade ?? {}) } };
}
function updateHostedSurfaces(document, theme) {
  for (const element of document?.querySelectorAll?.(".mc-native-chat-screen, .mc-mobile-dialog.themed") ?? []) {
    element.classList?.add?.("themed");
    element.classList?.remove?.("theme-light", "theme-dark");
    element.classList?.add?.(`theme-${theme}`);
  }
}
