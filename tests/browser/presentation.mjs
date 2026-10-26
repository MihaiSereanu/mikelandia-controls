import { createGame } from "/tests/helpers/foundry.mjs";
import { createFoundryPreferencesGateway, registerPreferences } from "/src/foundry/preferences.mjs";
import { renderSettings } from "/src/features/settings/presenter.mjs";
import { createControlsGuide } from "/src/ui/controls-guide.mjs";
import { createTaskScope } from "/src/kernel/task-scope.mjs";

const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const owner = createTaskScope("presentation-browser");
try {
  const params = new URLSearchParams(location.search), layout = params.get("layout") ?? "phone";
  const main = document.querySelector("main"); main.dataset.formFactor = layout;
  const dictionary = await fetch("/locales/en.json").then(response => response.json());
  const localize = (key, fallback = key) => key.split(".").reduce((entry, part) => entry?.[part], dictionary) ?? fallback;
  let currentScope;
  for (const system of ["dnd5e", "custom", "shadowdark", "wfrp4e"]) {
    currentScope?.dispose(); main.replaceChildren(); currentScope = owner.child(system);
    const game = createGame([], system), definitions = new Map(), writes = [];
    const values = new Map([["ve-mobile.colorScheme", "class"], ["ve-mobile.headerArtwork", "race"], ["ve-mobile.quickbarSource", "character"], ["ve-mobile.showActionSummaries", true]]);
    game.i18n = { localize }; game.settings = {
      settings: definitions,
      register(namespace, key, data) { definitions.set(`${namespace}.${key}`, { ...data, namespace, key }); },
      get(namespace, key) { return values.has(`${namespace}.${key}`) ? values.get(`${namespace}.${key}`) : definitions.get(`${namespace}.${key}`)?.default; },
      async set(namespace, key, value) { writes.push([namespace, key, value]); values.set(`${namespace}.${key}`, value); return value; }
    };
    globalThis.game = game;
    registerPreferences();
    const preferences = createFoundryPreferencesGateway({ getGame: () => game, getNavigator: () => ({}) });
    const guide = createControlsGuide({ scope: currentScope, localize, readContext: () => ({
      presentation: layout, split: layout === "tablet", canPlaceActor: true, actionBarSource: preferences.actionMenu().quickbarSource,
      ...preferences.controls()
    }) });
    const commands = {
      localize, readSettings: () => preferences.snapshot(), readPresentationPreferences: () => preferences.presentation(),
      updateSetting: request => preferences.set(request), readLocale: () => "en",
      readSessionStatus: () => ({ users: [] }), readModuleOverlays: () => ({ scanned: false, entries: [] }),
      readActionSummaryPreferences: () => preferences.actionSummaries(), readDeviceIdentity: async () => ({ label: "Browser fixture" }),
      openControlsGuide: anchor => guide.show(anchor)
    };
    const settings = renderSettings({ commands, scope: currentScope }); main.append(settings, guide.element); await tick();
    const legacy = system === "dnd5e";
    const field = key => settings.querySelector(`#ve-setting-ve-mobile-${key}`);
    check(`${system}: class color availability follows the integration`, !!field("colorScheme").querySelector('option[value="class"]') === legacy);
    check(`${system}: effective color keeps stored class choice separate`, field("colorScheme").value === (legacy ? "class" : "neutral") && values.get("ve-mobile.colorScheme") === "class");
    for (const key of ["headerArtwork", "headerArtworkOpacity", "quickbarSource", "showActionSummaries", "compactActionSummaries"]) {
      check(`${system}: ${key} control follows capability`, !!field(key) === legacy);
    }
    check(`${system}: rendering performs no preference writes`, writes.length === 0);
    field("colorScheme").value = "red"; field("colorScheme").dispatchEvent(new Event("change", { bubbles: true })); await tick();
    check(`${system}: shared color change saves through actual settings control`, preferences.frame().colorScheme === "red" && writes.some(([_namespace, key, value]) => key === "colorScheme" && value === "red"));
    check(`${system}: unrelated saved preferences survive`, values.get("ve-mobile.headerArtwork") === "race" && values.get("ve-mobile.quickbarSource") === "character");
    guide.show(field("colorScheme")); await tick();
    const text = guide.element.textContent;
    check(`${system}: help matches actual character interactions`, legacy ? text.includes("Tap the portrait") && text.includes("Hold a row") : text.includes("Open Character Sheet opens") && !text.includes("Tap the portrait") && !text.includes("Hold a row"));
    check(`${system}: native action/resource instructions follow mapped panels`, text.includes("Choose Edit on an available resource") === ["wfrp4e", "shadowdark"].includes(system));
    check(`${system}: action-bar help matches the effective source`, text.includes(legacy ? "Character Quickbar slot" : "Foundry Hotbar slot"));
    check(`${system}: guide fits the emulated viewport`, guide.element.querySelector(".ve-controls-guide-card").getBoundingClientRect().right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
    guide.hide(); await tick();
    check(`${system}: guide closes without rebuilding Settings`, guide.element.hidden && settings.dataset.veSettingsContentBuilds === "1");
    if (system === "wfrp4e") {
      guide.show(field("colorScheme"));
      const body = guide.element.querySelector(".ve-controls-guide-body");
      const character = body.querySelectorAll(":scope > section")[2];
      body.scrollTop = character.offsetTop - body.offsetTop;
    }
  }
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  owner.dispose(); document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
