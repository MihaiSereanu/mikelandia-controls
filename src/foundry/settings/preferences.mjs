import { resolveSystemIntegration } from "../../systems/registry.mjs";
import { supportsPreference, effectiveColorScheme, characterPresentation } from "../../systems/presentation-policy.mjs";
import { COLOR_SCHEME_CHOICES } from "../../features/characters/appearance/character-theme.mjs";
import { localizeFoundry } from "./localization.mjs";
import { classifyRuntimeMode } from "../session/activation-policy.mjs";

import { MODULE_ID } from "../compatibility/branding-migration.mjs";
export { MODULE_ID };
export const BOOTSTRAP_PREFERENCES_KEY = "mikelandia-controls:bootstrap-preferences:v1";
export const LOAD_TIMING_KEYS = Object.freeze({ FULL: "lastSuccessfulFullLoadMs", RESYNC: "lastSuccessfulResyncMs" });

const KEYS = Object.freeze({
  MODE: "mode",
  THEME: "theme",
  COLOR_SCHEME: "colorScheme",
  HEADER_ARTWORK: "headerArtwork",
  HEADER_ARTWORK_OPACITY: "headerArtworkOpacity",

  SHOW_ACTION_SUMMARIES: "showActionSummaries",
  COMPACT_ACTION_SUMMARIES: "compactActionSummaries",

  DICE_RENDERING: "diceRendering",

  GRAPHICS_SETTINGS_SNAPSHOT: "graphicsSettingsSnapshot",
  THEME_SETTINGS_SNAPSHOT: "themeSettingsSnapshot",
  PENDING_DESKTOP_RESTORE: "pendingDesktopRestore",
  MOBILE_ENTRY_HANDOFF: "mobileEntryHandoff",
  GRAPHICS_RECOVERY_ACKNOWLEDGED: "graphicsRecoveryAcknowledged",

  GRAPHICS_PROFILE_TRANSACTION: "graphicsProfileTransaction",

  KEEP_SCREEN_AWAKE: "keepScreenAwake",
  PROTECT_MC_STYLING: "protectMcStyling",

  CHARACTER_INVENTORY_SORT: "characterInventorySort",
  CHARACTER_SPELL_SORT: "characterSpellSort",
  CHARACTER_SPELL_FILTER: "characterSpellFilter",
  CHARACTER_FEATURE_SORT: "characterFeatureSort",
  CHARACTER_FAVOURITES_SORT: "characterFavouritesSort",
  CHARACTER_EFFECTS_SORT: "characterEffectsSort",
  CHARACTER_FAVOURITES_SOURCE: "characterFavouritesSource"
});

const CHOICES = Object.freeze({
  [KEYS.MODE]: Object.freeze(["auto", "phone", "tablet", "native"]),
  [KEYS.THEME]: Object.freeze(["system", "light", "dark"]),
  [KEYS.COLOR_SCHEME]: COLOR_SCHEME_CHOICES,
  [KEYS.HEADER_ARTWORK]: Object.freeze(["automatic", "race", "heroic1", "heroic2", "heroic3", "heroic4", "off"]),

  [KEYS.DICE_RENDERING]: Object.freeze(["auto", "static", "reduced", "normal"]),

  [KEYS.CHARACTER_INVENTORY_SORT]: Object.freeze(["manual", "alphabetical"]),
  [KEYS.CHARACTER_SPELL_SORT]: Object.freeze(["manual", "alphabetical"]),
  [KEYS.CHARACTER_SPELL_FILTER]: Object.freeze(["all", "prepared"]),
  [KEYS.CHARACTER_FEATURE_SORT]: Object.freeze(["manual", "alphabetical"]),
  [KEYS.CHARACTER_FAVOURITES_SORT]: Object.freeze(["manual", "alphabetical"]),
  [KEYS.CHARACTER_EFFECTS_SORT]: Object.freeze(["manual", "alphabetical"]),
  [KEYS.CHARACTER_FAVOURITES_SOURCE]: Object.freeze(["core", "tidy", "both", "off"]),
});

const DEFAULTS = Object.freeze({ mode: "auto", theme: "system", colorScheme: "class", headerArtwork: "automatic", headerArtworkOpacity: 1, showActionSummaries: true, compactActionSummaries: false, diceRendering: "auto", keepScreenAwake: false, protectMcStyling: true, characterInventorySort: "manual", characterSpellSort: "manual", characterSpellFilter: "all", characterFeatureSort: "manual", characterFavouritesSort: "manual", characterEffectsSort: "manual", characterFavouritesSource: "core" });

const CHARACTER_COLLECTION_SETTING_KEYS = Object.freeze({
  inventorySort: KEYS.CHARACTER_INVENTORY_SORT,
  spellSort: KEYS.CHARACTER_SPELL_SORT,
  spellFilter: KEYS.CHARACTER_SPELL_FILTER,
  featureSort: KEYS.CHARACTER_FEATURE_SORT,
  favouritesSort: KEYS.CHARACTER_FAVOURITES_SORT,
  effectsSort: KEYS.CHARACTER_EFFECTS_SORT
});

const BOOTSTRAP_DEFAULTS = Object.freeze({
  mode: "auto",
  theme: "system",
  keepScreenAwake: false
});

export function registerPreferences({
  onApplicationChange,
  onPresentationChange,
  onWakeChange,
  onVisualIsolationChange,
  isMobilePresentation = () => true,
  mobileDevice = classifyRuntimeMode() !== "native",
  openControlsGuide,
  getSystemIntegration = () => resolveSystemIntegration(globalThis.game?.system?.id)
} = {}) {
  const features = getSystemIntegration().features;
  const mobileControls = mobileDevice && isMobilePresentation();
  const changed = (key, notify) => (value) => {
    syncBootstrapPreferences();
    notify?.(Object.freeze({ key, value }));
  };
  game.settings.register(MODULE_ID, KEYS.MODE, {
    name: "MIKELANDIA_CONTROLS.Settings.Mode.Name",
    hint: "MIKELANDIA_CONTROLS.Settings.Mode.Hint",
    scope: "client",
    config: mobileDevice,
    type: String,
    choices: {
      auto: "MIKELANDIA_CONTROLS.Settings.Mode.Auto",
      phone: "MIKELANDIA_CONTROLS.Settings.Mode.Phone",
      tablet: "MIKELANDIA_CONTROLS.Settings.Mode.Tablet",
      native: "MIKELANDIA_CONTROLS.Settings.Mode.Native"
    },
    default: "auto",
    onChange: changed(KEYS.MODE, onPresentationChange)
  });
  const storedMode = readSetting(KEYS.MODE, "auto");
  if (storedMode === "desktop" || storedMode === "off") {
    // Native Settings reads the stored value directly when selecting a choice.
    // Retire aliases so an opted-out phone still shows its selected mode.
    void Promise.resolve(game.settings.set(MODULE_ID, KEYS.MODE, "native")).catch(error => {
      console.warn("Mikelandia Controls | Could not normalize the native-interface preference", error);
    });
  }

  game.settings.register(MODULE_ID, KEYS.THEME, {
    name: "MIKELANDIA_CONTROLS.Settings.Theme.Name",
    hint: "MIKELANDIA_CONTROLS.Settings.Theme.Hint",
    scope: "client",
    config: mobileControls,
    type: String,
    choices: {
      system: "MIKELANDIA_CONTROLS.Settings.Theme.System",
      light: "MIKELANDIA_CONTROLS.Settings.Theme.Light",
      dark: "MIKELANDIA_CONTROLS.Settings.Theme.Dark"
    },
    default: "system",
    onChange: changed(KEYS.THEME, onPresentationChange)
  });

  game.settings.register(MODULE_ID, KEYS.COLOR_SCHEME, {
    name: "MIKELANDIA_CONTROLS.Settings.ColourScheme.Name",
    hint: features.legacyCharacterSheet ? "MIKELANDIA_CONTROLS.Settings.ColourScheme.Hint" : "MIKELANDIA_CONTROLS.Settings.ColourScheme.PlainHint",
    scope: "client",
    config: mobileControls && features.legacyCharacterSheet === true,
    type: String,
    choices: {
      class: "MIKELANDIA_CONTROLS.Settings.ColourScheme.Class",
      red: "MIKELANDIA_CONTROLS.Settings.ColourScheme.Red",
      neutral: "MIKELANDIA_CONTROLS.Settings.ColourScheme.Neutral",
      bestiary: "MIKELANDIA_CONTROLS.Settings.ColourScheme.Bestiary"
    },
    default: "class",
    onChange: changed(KEYS.COLOR_SCHEME, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.HEADER_ARTWORK, {
    name: "MIKELANDIA_CONTROLS.Settings.HeaderArtwork.Name",
    hint: "MIKELANDIA_CONTROLS.Settings.HeaderArtwork.Hint",
    scope: "client",
    config: mobileControls && supportsPreference(KEYS.HEADER_ARTWORK, features),
    type: String,
    choices: Object.fromEntries(CHOICES[KEYS.HEADER_ARTWORK].map(value => [value, "MIKELANDIA_CONTROLS.Settings.HeaderArtwork." + value[0].toUpperCase() + value.slice(1)])),
    default: DEFAULTS.headerArtwork,
    onChange: changed(KEYS.HEADER_ARTWORK, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.HEADER_ARTWORK_OPACITY, {
    name: "MIKELANDIA_CONTROLS.Settings.HeaderArtworkOpacity.Name",
    hint: "MIKELANDIA_CONTROLS.Settings.HeaderArtworkOpacity.Hint",
    scope: "client",
    config: mobileControls && supportsPreference(KEYS.HEADER_ARTWORK_OPACITY, features),
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 1,
    onChange: changed(KEYS.HEADER_ARTWORK_OPACITY, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.SHOW_ACTION_SUMMARIES, {
    name: "MIKELANDIA_CONTROLS.Settings.ShowActionSummaries.Name",
    hint: "MIKELANDIA_CONTROLS.Settings.ShowActionSummaries.Hint",
    scope: "client",
    config: mobileControls && supportsPreference(KEYS.SHOW_ACTION_SUMMARIES, features),
    type: Boolean,
    default: DEFAULTS.showActionSummaries,
    onChange: changed(KEYS.SHOW_ACTION_SUMMARIES, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.COMPACT_ACTION_SUMMARIES, {
    name: "MIKELANDIA_CONTROLS.Settings.CompactActionSummaries.Name",
    hint: "MIKELANDIA_CONTROLS.Settings.CompactActionSummaries.Hint",
    scope: "client",
    config: mobileControls && supportsPreference(KEYS.COMPACT_ACTION_SUMMARIES, features),
    type: Boolean,
    default: DEFAULTS.compactActionSummaries,
    onChange: changed(KEYS.COMPACT_ACTION_SUMMARIES, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.DICE_RENDERING, {
    name: "MIKELANDIA_CONTROLS.Settings.DiceRendering.Name",
    hint: "MIKELANDIA_CONTROLS.Settings.DiceRendering.Hint",
    scope: "client",
    config: mobileControls,
    type: String,
    choices: {
      auto: "MIKELANDIA_CONTROLS.Settings.DiceRendering.Auto",
      static: "MIKELANDIA_CONTROLS.Settings.DiceRendering.Static",
      reduced: "MIKELANDIA_CONTROLS.Settings.DiceRendering.Reduced",
      normal: "MIKELANDIA_CONTROLS.Settings.DiceRendering.Normal"
    },
    default: DEFAULTS.diceRendering,
    onChange: changed(KEYS.DICE_RENDERING, onApplicationChange)
  });

  game.settings.register(MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT, {
    name: "Mikelandia Controls graphics settings snapshot",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, KEYS.THEME_SETTINGS_SNAPSHOT, {
    name: "Mikelandia Controls native theme restoration snapshot",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, KEYS.PENDING_DESKTOP_RESTORE, {
    name: "Mikelandia Controls legacy settings cleanup",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, KEYS.MOBILE_ENTRY_HANDOFF, {
    name: "Mikelandia Controls fresh performance capture handoff",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, KEYS.GRAPHICS_RECOVERY_ACKNOWLEDGED, {
    name: "Mikelandia Controls graphics recovery acknowledgement",
    scope: "client",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(MODULE_ID, KEYS.GRAPHICS_PROFILE_TRANSACTION, {
    name: "Mikelandia Controls graphics profile transaction",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, KEYS.KEEP_SCREEN_AWAKE, {
    name: "MIKELANDIA_CONTROLS.Settings.KeepScreenAwake.Name",
    hint: "MIKELANDIA_CONTROLS.Settings.KeepScreenAwake.Hint",
    scope: "client",
    config: mobileControls,
    type: Boolean,
    default: false,
    onChange: changed(KEYS.KEEP_SCREEN_AWAKE, onWakeChange)
  });

  game.settings.register(MODULE_ID, KEYS.PROTECT_MC_STYLING, {
    name: "MIKELANDIA_CONTROLS.Settings.ProtectMcStyling.Name",
    hint: "MIKELANDIA_CONTROLS.Settings.ProtectMcStyling.Hint",
    scope: "client",
    config: mobileControls,
    type: Boolean,
    default: true,
    onChange: changed(KEYS.PROTECT_MC_STYLING, onVisualIsolationChange)
  });

  for (const key of Object.values(CHARACTER_COLLECTION_SETTING_KEYS)) {
    game.settings.register(MODULE_ID, key, {
      name: `Mikelandia Controls ${key}`,
      scope: "client",
      config: false,
      type: String,
      default: DEFAULTS[key],
      onChange: changed(key, onApplicationChange)
    });
  }

  const tidyDetected = isTidy5eActive(game);
  game.settings.register(MODULE_ID, KEYS.CHARACTER_FAVOURITES_SOURCE, {
    name: "MIKELANDIA_CONTROLS.Settings.CharacterFavouritesSource.Name",
    hint: "MIKELANDIA_CONTROLS.Settings.CharacterFavouritesSource.Hint",
    scope: "client",
    config: mobileControls && supportsPreference(KEYS.CHARACTER_FAVOURITES_SOURCE, features),
    type: String,
    choices: {
      core: "MIKELANDIA_CONTROLS.Settings.CharacterFavouritesSource.Core",
      ...(tidyDetected ? {
        tidy: "MIKELANDIA_CONTROLS.Settings.CharacterFavouritesSource.Tidy",
        both: "MIKELANDIA_CONTROLS.Settings.CharacterFavouritesSource.Both"
      } : {}),
      off: "MIKELANDIA_CONTROLS.Settings.CharacterFavouritesSource.Off"
    },
    default: DEFAULTS.characterFavouritesSource,
    onChange: changed(KEYS.CHARACTER_FAVOURITES_SOURCE, onApplicationChange)
  });

  for (const key of Object.values(LOAD_TIMING_KEYS)) {
    game.settings.register(MODULE_ID, key, {
      name: `Mikelandia Controls ${key}`,
      scope: "client",
      config: false,
      type: Number,
      default: 0
    });
  }

  if (mobileControls && typeof game.settings.registerMenu === "function" && typeof openControlsGuide === "function") {
    game.settings.registerMenu(MODULE_ID, "controlsGuide", {
      name: "MIKELANDIA_CONTROLS.Controls.Title", label: "MIKELANDIA_CONTROLS.Controls.View", hint: "MIKELANDIA_CONTROLS.Controls.MenuHint",
      icon: "fa-solid fa-hand-pointer", type: controlsGuideMenuType(openControlsGuide), restricted: false
    });
  }
  syncBootstrapPreferences();
  const storedArtwork = readSetting(KEYS.HEADER_ARTWORK, DEFAULTS.headerArtwork);
  if (features.legacyCharacterSheet && isMobilePresentation() && typeof storedArtwork === "string" && !CHOICES[KEYS.HEADER_ARTWORK].includes(storedArtwork)) {
    // One client-setting migration at registration; snapshots never write.
    void Promise.resolve(game.settings.set(MODULE_ID, KEYS.HEADER_ARTWORK, DEFAULTS.headerArtwork)).catch((error) => {
      console.warn("Mikelandia Controls | Could not migrate obsolete Header Artwork setting", error);
    });
  }
}

function controlsGuideMenuType(openControlsGuide) {
  const Base = globalThis.foundry?.applications?.api?.ApplicationV2 ?? globalThis.FormApplication ?? class {};
  return class MCControlsGuideMenu extends Base {
    render() { queueMicrotask(openControlsGuide); return this; }
  };
}

export function readPreferences() {
  const cached = readBootstrapPreferences();
  return {
    mode: normalizedModePreference(readSetting(KEYS.MODE, cached.mode)),
    theme: readSetting(KEYS.THEME, cached.theme)
  };
}

/** Cheap native locale read for Intl formatters used by presentation code. */
export function readLocale(gameRef = globalThis.game) {
  return String(gameRef?.i18n?.lang ?? "en");
}

export function readKeepScreenAwake() {
  return Boolean(readSetting(KEYS.KEEP_SCREEN_AWAKE, readBootstrapPreferences().keepScreenAwake));
}

export function readProtectMcStyling() {
  return readSetting(KEYS.PROTECT_MC_STYLING, true) !== false;
}

export function readLoggingLevel() { return "warn"; }

export function readBootstrapPreferences({ getStorage = () => globalThis.localStorage } = {}) {
  try {
    const parsed = JSON.parse(getStorage()?.getItem?.(BOOTSTRAP_PREFERENCES_KEY) ?? "null");
    return Object.freeze({
      mode: normalizedModePreference(parsed?.mode),
      theme: CHOICES[KEYS.THEME].includes(parsed?.theme) ? parsed.theme : BOOTSTRAP_DEFAULTS.theme,
      keepScreenAwake: typeof parsed?.keepScreenAwake === "boolean" ? parsed.keepScreenAwake : BOOTSTRAP_DEFAULTS.keepScreenAwake
    });
  } catch {
    return BOOTSTRAP_DEFAULTS;
  }
}

export function syncBootstrapPreferences(getGame = () => globalThis.game, { getStorage = () => globalThis.localStorage } = {}) {
  const cached = readBootstrapPreferences({ getStorage });
  const game = getGame();
  const read = (key, fallback) => {
    try {
      const value = game?.settings?.get?.(MODULE_ID, key);
      return value === undefined ? fallback : value;
    } catch {
      return fallback;
    }
  };
  const next = {
    mode: normalizedModePreference(read(KEYS.MODE, cached.mode)),
    theme: read(KEYS.THEME, cached.theme),
    keepScreenAwake: Boolean(read(KEYS.KEEP_SCREEN_AWAKE, cached.keepScreenAwake))
  };
  try {
    getStorage()?.setItem?.(BOOTSTRAP_PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // Client settings remain authoritative when storage is unavailable.
  }
  return Object.freeze(next);
}

/** Permission-safe access to Mikelandia Controls's finite set of client preferences. */
export function createFoundryPreferencesGateway({
  getGame = () => globalThis.game,
  getSystemIntegration = () => resolveSystemIntegration(getGame()?.system?.id),
  getNavigator = () => globalThis.navigator,
  getRoute = (path) => globalThis.foundry.utils.getRoute(path),
  navigate = (url) => { globalThis.window.location.href = url; }
} = {}) {
  const localize = (key, data) => localizeValue(getGame(), key, data);
  const setting = (key) => getGame()?.settings?.get?.(MODULE_ID, key);

  const readers = {
    mode: () => normalizedModePreference(setting(KEYS.MODE)),

    colorScheme: () => effectiveColorScheme(normalizedColorScheme(setting(KEYS.COLOR_SCHEME)), getSystemIntegration().features),
    headerArtwork: () => getSystemIntegration().features.legacyCharacterSheet ? normalizedChoice(KEYS.HEADER_ARTWORK, setting(KEYS.HEADER_ARTWORK), DEFAULTS.headerArtwork) : "off",
    headerArtworkOpacity: () => normalizedOpacity(setting(KEYS.HEADER_ARTWORK_OPACITY)),

    showActionSummaries: () => getSystemIntegration().features.actionSummaries && setting(KEYS.SHOW_ACTION_SUMMARIES) !== false,
    compactActionSummaries: () => getSystemIntegration().features.actionSummaries && setting(KEYS.COMPACT_ACTION_SUMMARIES) === true,

    diceRendering: () => normalizedChoice(KEYS.DICE_RENDERING, setting(KEYS.DICE_RENDERING), DEFAULTS.diceRendering),

    keepScreenAwake: () => Boolean(setting(KEYS.KEEP_SCREEN_AWAKE)),
    protectMcStyling: () => setting(KEYS.PROTECT_MC_STYLING) !== false,
    characterCollections: () => getSystemIntegration().features.legacyCharacterSheet ? Object.freeze({
        inventorySort: normalizedChoice(KEYS.CHARACTER_INVENTORY_SORT, setting(KEYS.CHARACTER_INVENTORY_SORT), DEFAULTS.characterInventorySort),
        spellSort: normalizedChoice(KEYS.CHARACTER_SPELL_SORT, setting(KEYS.CHARACTER_SPELL_SORT), DEFAULTS.characterSpellSort),
        spellFilter: normalizedChoice(KEYS.CHARACTER_SPELL_FILTER, setting(KEYS.CHARACTER_SPELL_FILTER), DEFAULTS.characterSpellFilter),
        featureSort: normalizedChoice(KEYS.CHARACTER_FEATURE_SORT, setting(KEYS.CHARACTER_FEATURE_SORT), DEFAULTS.characterFeatureSort),
        favouritesSort: normalizedChoice(KEYS.CHARACTER_FAVOURITES_SORT, setting(KEYS.CHARACTER_FAVOURITES_SORT), DEFAULTS.characterFavouritesSort),
        effectsSort: normalizedChoice(KEYS.CHARACTER_EFFECTS_SORT, setting(KEYS.CHARACTER_EFFECTS_SORT), DEFAULTS.characterEffectsSort)
      }) : Object.freeze({}),
    characterFavouritesSource: favourites => favourites().effective,
    characterFavouritesConfiguredSource: favourites => favourites().configured,
    characterFavouritesEnabled: favourites => favourites().enabled,
    characterFavouritesStale: favourites => favourites().stale,
    tidy5eDetected: favourites => favourites().tidyDetected,
  };
  const pick = keys => {
    let favouriteRecord;
    const favourites = () => favouriteRecord ??= getSystemIntegration().features.legacyCharacterSheet
      ? resolveCharacterFavouritesSource(setting(KEYS.CHARACTER_FAVOURITES_SOURCE), getGame())
      : Object.freeze({ configured: "off", effective: "off", enabled: false, stale: false, tidyDetected: false });
    return Object.freeze(Object.fromEntries((keys ?? Object.keys(readers)).map(key => [key, readers[key](favourites)])));
  };
  const presentation = () => pick();
  let restoring = false;
  return Object.freeze({
    localize(key, data) {
      return localize(key, data);
    },
    readLocale: () => readLocale(getGame()),
    controls: () => Object.freeze({ systemId: getSystemIntegration().id, characterPresentation: characterPresentation(getSystemIntegration().features) }),
    presentation,
    layout: () => pick(["mode", ]),
    frame: () => pick(["colorScheme", "headerArtworkOpacity", "protectMcStyling", ]),
    character: () => pick(["colorScheme", "headerArtwork", "characterCollections", "characterFavouritesSource", "characterFavouritesEnabled"]),

    actionSummaries: () => pick(["showActionSummaries", "compactActionSummaries"]),
    snapshot() {
      const fields = preferenceFields(setting, localize, getNavigator, getGame, getSystemIntegration().features);
      return Object.freeze({
        ...presentation(),
        wakeLockSupported: typeof getNavigator()?.wakeLock?.request === "function",
        logoutLabel: localize("MENU.Logout"),
        labels: settingsLabels(localize),

        fields
      });
    },

    async set({ namespace = MODULE_ID, key, value }) {
      const game = getGame();
      if (!game?.settings?.set) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.FoundrySettingsUnavailable", "Foundry settings are unavailable."));
      if (namespace === MODULE_ID && (!supportsPreference(key, getSystemIntegration().features)
        || (key === KEYS.COLOR_SCHEME && value === "class" && !getSystemIntegration().features.legacyCharacterSheet))) {
        throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.GamePreferenceUnavailable", "This preference is unavailable for the current game."));
      }
      const registered = findRegisteredSetting(game, namespace, key);
      // The shared mobile color picker remains available without exposing
      // D&D's class option in Foundry's native settings form.
      assertSettingAuthority(game, namespace === MODULE_ID && key === KEYS.COLOR_SCHEME && !getSystemIntegration().features.legacyCharacterSheet && registered
        ? { ...registered, config: true } : registered, namespace, key);
      const normalized = namespace === MODULE_ID
        ? normalizeSetting(key, value)
        : normalizeRegisteredSetting(registered, value);
      await game.settings.set(namespace, key, normalized);
      const stored = game.settings.get(namespace, key);
      if (namespace === MODULE_ID) syncBootstrapPreferences(() => game);
      return Object.freeze({
        ok: true,
        namespace,
        key,
        value: namespace === MODULE_ID ? normalizeSetting(key, stored) : serializableValue(stored),
        requiresReload: Boolean(registered?.requiresReload)
      });
    },

    async setCharacterCollectionPreference({ key, value }) {
      const settingKey = CHARACTER_COLLECTION_SETTING_KEYS[key];
      if (!settingKey) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.CollectionPreferenceUnsupported", "That character collection preference is not supported."));
      if (!supportsPreference(settingKey, getSystemIntegration().features)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.GamePreferenceUnavailable", "This preference is unavailable for the current game."));
      const game = getGame();
      if (!game?.settings?.set) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.FoundrySettingsUnavailable", "Foundry settings are unavailable."));
      const normalized = normalizeSetting(settingKey, value);
      await game.settings.set(MODULE_ID, settingKey, normalized);
      return Object.freeze({ ok: true, key, value: normalizeSetting(settingKey, game.settings.get(MODULE_ID, settingKey)) });
    },

    async restoreDefaults() {
      if (restoring) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.DefaultsRestoring", "Defaults are already being restored."));
      restoring = true;
      try {
        const session = getGame();
        const fields = preferenceFields(setting, localize, getNavigator, getGame, getSystemIntegration().features);
        let requiresReload = false;

        for (const settingKey of Object.values(CHARACTER_COLLECTION_SETTING_KEYS)) {
          if (supportsPreference(settingKey, getSystemIntegration().features) && setting(settingKey) !== DEFAULTS[settingKey]) await session.settings.set(MODULE_ID, settingKey, DEFAULTS[settingKey]);
        }
        if (supportsPreference(KEYS.CHARACTER_FAVOURITES_SOURCE, getSystemIntegration().features) && setting(KEYS.CHARACTER_FAVOURITES_SOURCE) !== DEFAULTS.characterFavouritesSource) {
          await session.settings.set(MODULE_ID, KEYS.CHARACTER_FAVOURITES_SOURCE, DEFAULTS.characterFavouritesSource);
        }

        // Browser defaults never reset the GM-owned world graphics policy.
        if (Object.keys(setting(KEYS.GRAPHICS_PROFILE_TRANSACTION) ?? {}).length) {
          await session.settings.set(MODULE_ID, KEYS.GRAPHICS_PROFILE_TRANSACTION, {});
        }

        // Auto-detect may stop a forced mobile view, so restore mode last.
        const ordered = [...fields].sort((a, b) => Number(a.key === KEYS.MODE) - Number(b.key === KEYS.MODE));
        for (const field of ordered) {
          if (getGame() !== session) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.SessionChanged", "The session changed. Try restoring defaults again."));
          if ((field.namespace !== MODULE_ID && field.supported === false) || field.value === field.defaultValue) continue;
          const result = await this.set({ namespace: field.namespace, key: field.key, value: field.defaultValue });
          requiresReload ||= result.requiresReload;
        }
        return Object.freeze({ ok: true, requiresReload });
      } finally {
        restoring = false;
      }
    },

    async logout() {
      // The mobile login establishes the native /join session, ending the world login.
      await navigate(`${getRoute("mobile")}/`);
      return Object.freeze({ ok: true });
    }
  });
}

/** A live proxy description of Foundry v13's native client performance setting. */

function preferenceFields(setting, localize, getNavigator, getGame, features) {
  return Object.freeze([
    choiceField(KEYS.MODE, "Mode", normalizedModePreference(setting(KEYS.MODE)), localize),
    choiceField(KEYS.THEME, "Theme", setting(KEYS.THEME), localize),
    choiceField(KEYS.COLOR_SCHEME, "ColourScheme", setting(KEYS.COLOR_SCHEME), localize),
    booleanField(KEYS.PROTECT_MC_STYLING, "ProtectMcStyling", setting(KEYS.PROTECT_MC_STYLING) !== false, localize),
    choiceField(KEYS.HEADER_ARTWORK, "HeaderArtwork", setting(KEYS.HEADER_ARTWORK), localize),
    Object.freeze({
      namespace: MODULE_ID,
      key: KEYS.HEADER_ARTWORK_OPACITY,
      type: "range",
      name: localize("MIKELANDIA_CONTROLS.Settings.HeaderArtworkOpacity.Name"),
      hint: localize("MIKELANDIA_CONTROLS.Settings.HeaderArtworkOpacity.Hint"),
      value: normalizedOpacity(setting(KEYS.HEADER_ARTWORK_OPACITY)),
      min: 0,
      max: 1,
      step: 0.05,
      suffix: "%"
    }),

    booleanField(KEYS.SHOW_ACTION_SUMMARIES, "ShowActionSummaries", setting(KEYS.SHOW_ACTION_SUMMARIES) !== false, localize),
    booleanField(KEYS.COMPACT_ACTION_SUMMARIES, "CompactActionSummaries", setting(KEYS.COMPACT_ACTION_SUMMARIES) === true, localize),

    choiceField(KEYS.DICE_RENDERING, "DiceRendering", normalizedChoice(KEYS.DICE_RENDERING, setting(KEYS.DICE_RENDERING), DEFAULTS.diceRendering), localize),

    Object.freeze({
      ...booleanField(KEYS.KEEP_SCREEN_AWAKE, "KeepScreenAwake", setting(KEYS.KEEP_SCREEN_AWAKE), localize),
      supported: typeof getNavigator()?.wakeLock?.request === "function",
      unsupported: localize("MIKELANDIA_CONTROLS.Settings.KeepScreenAwake.Unsupported"),
      wakeLock: true,
      failure: localize("MIKELANDIA_CONTROLS.Settings.KeepScreenAwake.Failure")
    })
  ].filter(field => field.namespace !== MODULE_ID || supportsPreference(field.key, features)).map(field => Object.freeze({
    ...field,
    ...(field.key === KEYS.COLOR_SCHEME && !features.legacyCharacterSheet ? {
      value: effectiveColorScheme(normalizedColorScheme(field.value), features),
      choices: field.choices.filter(choice => choice.value !== "class"),
      hint: localize("MIKELANDIA_CONTROLS.Settings.ColourScheme.PlainHint")
    } : {}),
    defaultValue: field.namespace === MODULE_ID ? (field.key === KEYS.COLOR_SCHEME ? effectiveColorScheme(DEFAULTS[field.key], features) : DEFAULTS[field.key])
      : (findRegisteredSetting(getGame(), field.namespace, field.key)?.default ?? false)
  })));
}

function settingControlType(registered, choices, range) {
  if (choices.length) return "choice";
  const name = registered.type?.constructor?.name ?? registered.type?.name ?? "";
  if (registered.type === Boolean || name === "BooleanField") return "boolean";
  if (registered.type === Number || name === "NumberField") return range ? "range" : "number";
  if (name === "ColorField") return "color";
  if (registered.type === String || ["StringField", "FilePathField"].includes(name) || registered.filePicker) return "text";
  return null;
}

function settingChoices(registered, game = globalThis.game) {
  let raw = registered.choices ?? registered.type?.choices;
  try {
    if (typeof raw === "function") raw = raw();
  } catch {
    return Object.freeze([]);
  }
  const entries = raw instanceof Map ? [...raw.entries()] : Object.entries(raw ?? {});
  return Object.freeze(entries.map(([value, label]) => Object.freeze({
    value: String(value),
    label: localizeValue(game, label)
  })));
}

function settingRange(registered) {
  const source = registered.range ?? registered.type;
  const min = Number(source?.min);
  const max = Number(source?.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const step = Number(source?.step);
  return Object.freeze({ min, max, step: Number.isFinite(step) && step > 0 ? step : 1 });
}

function findRegisteredSetting(game, namespace, key) {
  return game?.settings?.settings?.get?.(`${namespace}.${key}`)
    ?? registryValues(game?.settings?.settings).find((entry) => entry?.namespace === namespace && entry?.key === key)
    ?? null;
}

function assertSettingAuthority(game, registered, namespace, key) {
  if (!registered) {
    if (namespace === MODULE_ID) return;
    throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.FoundrySettingMissing", "That Foundry setting does not exist."));
  }
  if (!registered.config) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.FoundrySettingNotConfigurable", "That Foundry setting is not configurable here."));
  if (registered.scope === "world" && !game?.user?.can?.("SETTINGS_MODIFY")) {
    throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.WorldSettingPermission", "You do not have permission to change that world setting."));
  }
  if (registered.namespace !== namespace || registered.key !== key) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.FoundrySettingMissing", "That Foundry setting does not exist."));
}

function normalizeRegisteredSetting(registered, value) {
  const choices = settingChoices(registered);
  if (choices.length) {
    const choice = String(value ?? "");
    if (!choices.some((entry) => entry.value === choice)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.ChoiceUnsupported", "That setting choice is not supported."));
    return isNumberSetting(registered) ? Number(choice) : choice;
  }
  const type = settingControlType(registered, choices, settingRange(registered));
  if (type === "boolean") {
    if (typeof value !== "boolean") throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.BooleanExpected", "That setting requires an on or off value."));
    return value;
  }
  if (type === "number" || type === "range") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.NumberExpected", "That setting requires a number."));
    const range = settingRange(registered);
    if (range && (number < range.min || number > range.max)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.RangeExceeded", "That setting is outside its allowed range."));
    return number;
  }
  if (type === "text" || type === "color") return String(value ?? "");
  throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.MobileTypeUnsupported", "That setting type is not supported on mobile."));
}

function isNumberSetting(registered) {
  const name = registered.type?.constructor?.name ?? registered.type?.name ?? "";
  return registered.type === Number || name === "NumberField";
}

function registryValues(registry) {
  try {
    return typeof registry?.values === "function" ? [...registry.values()] : [];
  } catch {
    return [];
  }
}

function serializableValue(value) {
  if (["string", "number", "boolean"].includes(typeof value) || value === null) return value;
  return String(value ?? "");
}

function settingsLabels(localize) {
  const keys = [
    "SettingsSubtitle", "MobileSettingsTitle", "DeviceLabel", "DeviceResolving", "PhoneModeEnabled", "TabletModeEnabled",
    "NativeModeEnabled", "PhoneModeSelected", "TabletModeSelected", "NativeModeSelected", "Left", "Right", "JoystickCurrently",
    "ModuleOverlayExplanation", "ModuleOverlayWarning", "ModuleOverlayScan", "ModuleOverlayRescan", "ModuleOverlayNotScanned",
    "ModuleOverlayNone", "ModuleOverlayDetectedOne", "ModuleOverlayDetectedMany", "ModuleOverlayShow", "ModuleOverlayUnavailable",
    "ModuleOverlayScanning", "ModuleOverlayOrderHint", "ModuleOverlayScale", "SessionTitle", "Online", "LatencyTitle", "FpsTitle", "SessionMetricsNote"
  ];
  return Object.freeze(Object.fromEntries(keys.map((key) => [key[0].toLowerCase() + key.slice(1), localize(`MIKELANDIA_CONTROLS.Settings.Copy.${key}`)])));
}

function localizeValue(game, value, data) {
  const text = String(value ?? "");
  if (data && typeof game?.i18n?.format === "function") return game.i18n.format(text, data);
  return game?.i18n?.localize?.(text) ?? text;
}

function choiceField(key, group, value, localize) {
  return Object.freeze({
    namespace: MODULE_ID,
    key,
    type: "choice",
    name: localize(`MIKELANDIA_CONTROLS.Settings.${group}.Name`),
    hint: localize(`MIKELANDIA_CONTROLS.Settings.${group}.Hint`),
    value: CHOICES[key].includes(value) ? value : CHOICES[key][0],
    choices: Object.freeze(CHOICES[key].map((choice) => Object.freeze({
      value: choice,
      label: localize(`MIKELANDIA_CONTROLS.Settings.${group}.${choice[0].toUpperCase()}${choice.slice(1)}`)
    })))
  });
}

function booleanField(key, group, value, localize) {
  return Object.freeze({
    namespace: MODULE_ID,
    key,
    type: "boolean",
    name: localize(`MIKELANDIA_CONTROLS.Settings.${group}.Name`),
    hint: localize(`MIKELANDIA_CONTROLS.Settings.${group}.Hint`),
    value: Boolean(value),
    supported: true
  });
}

function normalizeSetting(key, value) {
  if ([KEYS.KEEP_SCREEN_AWAKE, KEYS.PROTECT_MC_STYLING, KEYS.SHOW_ACTION_SUMMARIES, KEYS.COMPACT_ACTION_SUMMARIES].includes(key)) {
    if (typeof value !== "boolean") throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.BooleanExpected", "That setting requires an on or off value."));
    return value;
  }
  if (key === KEYS.MODE && ["off", "desktop"].includes(value)) return "native";
  if (CHOICES[key]) {
    const choice = String(value ?? "");
    if (!CHOICES[key].includes(choice)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.ChoiceUnsupported", "That setting choice is not supported."));
    return choice;
  }

  if (key === KEYS.HEADER_ARTWORK_OPACITY) return normalizedOpacity(value);

  throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Settings.Errors.McSettingMissing", "That Mikelandia Controls setting does not exist."));
}

export function isTidy5eActive(game = globalThis.game) {
  return Boolean(game?.modules?.get?.("tidy5e-sheet")?.active);
}

export function resolveCharacterFavouritesSource(value, game = globalThis.game) {
  const configured = normalizedChoice(KEYS.CHARACTER_FAVOURITES_SOURCE, value, DEFAULTS.characterFavouritesSource);
  const tidyDetected = isTidy5eActive(game);
  const stale = !tidyDetected && ["tidy", "both"].includes(configured);
  const effective = stale ? "core" : configured;
  return Object.freeze({ configured, effective, enabled: effective !== "off", tidyDetected, stale });
}

function normalizedModePreference(value) {
  const mode = ["off", "desktop"].includes(value) ? "native" : String(value ?? "");
  return CHOICES[KEYS.MODE].includes(mode) ? mode : BOOTSTRAP_DEFAULTS.mode;
}

function normalizedChoice(key, value, fallback) {
  const choice = String(value ?? "");
  return CHOICES[key]?.includes(choice) ? choice : fallback;
}

function normalizedColorScheme(value) {
  const scheme = String(value ?? "class");
  return CHOICES[KEYS.COLOR_SCHEME].includes(scheme) ? scheme : "class";
}

function normalizedOpacity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.round(Math.min(1, Math.max(0, number)) * 20) / 20;
}

function readSetting(key, fallback) {
  try {
    const value = game?.settings?.get?.(MODULE_ID, key);
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

export { KEYS };
