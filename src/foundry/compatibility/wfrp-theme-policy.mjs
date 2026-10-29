const THEME_KEY = "wfrp4e.theme";
const SECTIONS = Object.freeze(["actor", "item", "journal", "sidebar", "apps"]);

/** A permanent browser preference; Desktop mode does not restore this setting. */
export function createWfrpThemePolicy({
  getGame = () => globalThis.game,
  getDocument = () => globalThis.document,
  getSidebar = () => globalThis.ui?.sidebar?.element,
  getApplications = () => globalThis.foundry?.applications?.instances?.values?.() ?? [],
  readMobile = () => false,
  onError = error => console.error("Mikelandia Controls | Could not disable WFRP Theme", error)
} = {}) {
  let queue = Promise.resolve();
  let stopped = false;
  const active = () => !stopped && readMobile() && getGame()?.system?.id === "wfrp4e";
  const withoutTheme = value => Object.fromEntries([
    ...Object.entries(value),
    ...SECTIONS.map(key => [key, { ...value[key], enabled: false }])
  ]);
  const disableElement = element => {
    element?.classList?.add("no-theme");
    element?.classList?.remove("classic-font");
  };
  const apply = theme => {
    const document = getDocument();
    disableElement(document?.body);
    disableElement(getSidebar());
    disableElement(document?.querySelector?.("#chat-notifications"));
    for (const application of getApplications()) {
      const type = application?.document?.documentName;
      if ((type === "Actor" || type === "Item") && typeof application.setTheme === "function") {
        application.setTheme(theme);
      }
      if (application?.element?.classList?.contains("journal-sheet")) disableElement(application.element);
    }
  };
  const reconcile = () => {
    queue = queue.catch(() => {}).then(async () => {
      if (!active()) return;
      const game = getGame();
      if (game.settings?.settings?.get(THEME_KEY)?.scope !== "client") {
        throw new Error("WFRP Theme's client setting is unavailable; no setting was changed.");
      }
      const current = game.settings.get("wfrp4e", "theme");
      if (!SECTIONS.every(key => typeof current?.[key]?.enabled === "boolean")) {
        throw new Error("WFRP Theme's setting format is unsupported; no setting was changed.");
      }
      const disabled = withoutTheme(current);
      if (SECTIONS.some(key => current[key].enabled)) {
        await game.settings.set("wfrp4e", "theme", disabled);
        if (SECTIONS.some(key => game.settings.get("wfrp4e", "theme")?.[key]?.enabled !== false)) {
          throw new Error("WFRP Theme remained enabled after saving its client setting.");
        }
      }
      if (active()) apply(disabled);
    });
    return queue;
  };
  const refresh = () => { void reconcile().catch(onError); };
  return Object.freeze({
    reconcile,
    start(scope) {
      scope.own(() => { stopped = true; });
      scope.hook("ready", refresh);
      scope.hook("clientSettingChanged", key => { if (key === THEME_KEY) refresh(); });
      // The native theme configuration previews changes before saving. Its
      // render hook also removes that preview from already open windows.
      scope.hook("renderApplicationV2", refresh);
      refresh();
    }
  });
}
