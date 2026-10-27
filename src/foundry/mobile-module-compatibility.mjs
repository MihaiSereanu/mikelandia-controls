const MOBILE_COMPATIBILITY_MODULES = Object.freeze(["crlngn-ui", "narrator-tools"]);
const CAROLINGIAN_UI_SETTING = "crlngn-ui.disable-ui";
const COMPATIBILITY_STORAGE_PREFIX = "ve-mobile:module-compatibility:v1";
// Foundry's hook entries have no owning-module metadata, so target only the
// Narrator Tools callbacks installed by its current main/compatibility scripts.
const NARRATOR_HOOK_MATCHERS = Object.freeze({
  setup: source => source.includes("NarratorToolsApi._setup()") || source.includes("chat-commands-lib.js"),
  ready: source => source.includes("NarratorToolsApi._ready()"),
  chatMessage: (_source, name) => name === "bound _chatMessage",
  renderChatMessageHTML: (_source, name) => name === "bound _renderChatMessage",
  getSceneControlButtons: (_source, name) => name === "bound _getSceneControlButtons",
  pauseGame: source => source.includes("NarratorToolsApi._pause()")
});

export function createMobileModuleCompatibilityGateway({
  getGame = () => globalThis.game,
  getHooks = () => globalThis.Hooks,
  readDocument = () => globalThis.document,
  MutationObserverClass = globalThis.MutationObserver,
  getStorage = () => globalThis.localStorage,
  requestReload = () => {
    const reload = globalThis.foundry?.utils?.debouncedReload;
    if (typeof reload === "function") reload();
    else globalThis.window?.location?.reload?.();
  }
} = {}) {
  return Object.freeze({
    async reconcileCarolingianUi(mobileMode) {
      const game = getGame();
      if (!game?.modules?.get?.("crlngn-ui")?.active) return Object.freeze({ changed: false, reason: "module-inactive" });
      const setting = game.settings?.settings?.get?.(CAROLINGIAN_UI_SETTING);
      if (setting?.scope !== "client") {
        throw new Error("Carolingian UI's client-only disable setting is unavailable; no module setting was changed.");
      }
      const storage = getStorage();
      if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
        throw new Error("Local storage is unavailable; Carolingian UI's previous client setting cannot be preserved.");
      }
      const key = compatibilityStorageKey();
      const snapshot = readCompatibilitySnapshot(storage, key);
      const currentValue = Boolean(game.settings.get("crlngn-ui", "disable-ui"));

      if (mobileMode) {
        if (snapshot) {
          if (currentValue) return Object.freeze({ changed: false, reason: "already-disabled" });
        } else if (currentValue) {
          return Object.freeze({ changed: false, reason: "user-disabled" });
        } else {
          storage.setItem(key, JSON.stringify({ version: 1, previousValue: false }));
        }
        await game.settings.set("crlngn-ui", "disable-ui", true);
        if (!game.settings.get("crlngn-ui", "disable-ui")) {
          throw new Error("Carolingian UI's effective client setting remained enabled; it was not reloaded.");
        }
        // Carolingian checks disable-ui during initialization, so restart after
        // updating its client setting to prevent its UI hooks from starting.
        requestReload();
        return Object.freeze({ changed: true, reloadPending: true });
      }

      if (!snapshot) return Object.freeze({ changed: false, reason: "no-mobile-override" });
      if (currentValue !== snapshot.previousValue) {
        await game.settings.set("crlngn-ui", "disable-ui", snapshot.previousValue);
        if (Boolean(game.settings.get("crlngn-ui", "disable-ui")) !== snapshot.previousValue) {
          throw new Error("Carolingian UI's prior client setting could not be restored; the saved setting was retained.");
        }
        // Reinitialize Carolingian with the restored user preference.
        requestReload();
        storage.removeItem(key);
        return Object.freeze({ changed: true, reloadPending: true });
      }
      storage.removeItem(key);
      return Object.freeze({ changed: false, reason: "already-restored" });
    },
    suppress(scope, enabled) {
      if (!enabled) return Object.freeze({ active: false, modules: Object.freeze([]) });
      const game = getGame();
      const modules = MOBILE_COMPATIBILITY_MODULES.filter(id => game?.modules?.get?.(id)?.active);
      if (!modules.length) return Object.freeze({ active: false, modules: Object.freeze([]) });

      const documentRef = readDocument();
      const hooks = getHooks();
      const suppressed = new Set();
      if (modules.includes("narrator-tools")) {
        suppressed.add("narrator-tools");
        removeNarratorHooks(hooks);
      }

      const removeModuleStyles = root => {
        for (const link of root?.querySelectorAll?.("link[href]") ?? []) {
          const href = String(link.getAttribute?.("href") ?? link.href ?? "").toLowerCase();
          const moduleId = modules.find(id => href.includes(`/modules/${id}/`) || href.includes(`modules/${id}/`));
          if (!moduleId) continue;
          link.remove?.();
          suppressed.add(moduleId);
        }
      };
      const removeNarratorElements = root => {
        for (const element of root?.querySelectorAll?.("#narrator, .nt-selection-menu, #narratorWebFont") ?? []) {
          element.remove?.();
        }
        if (root?.matches?.("#narrator, .nt-selection-menu, #narratorWebFont")) root.remove?.();
      };
      const removeCarolingianBodyClasses = () => {
        const body = documentRef?.body;
        for (const name of Array.from(body?.classList ?? [])) {
          if (name.startsWith("crlngn")) body.classList.remove(name);
        }
      };
      const reconcile = () => {
        removeModuleStyles(documentRef?.head);
        removeNarratorElements(documentRef?.body);
        removeCarolingianBodyClasses();
      };

      reconcile();
      if (typeof MutationObserverClass === "function") {
        const observer = new MutationObserverClass(records => {
          for (const record of records) {
            for (const node of record.addedNodes ?? []) {
              if (node.nodeType !== 1) continue;
              removeModuleStyles(node.matches?.("link[href]") ? node.parentElement : node);
              removeNarratorElements(node);
            }
          }
          removeCarolingianBodyClasses();
        });
        if (documentRef?.head) observer.observe(documentRef.head, { childList: true });
        if (documentRef?.body) {
          observer.observe(documentRef.body, { childList: true, attributes: true, attributeFilter: ["class"] });
        }
        scope?.own?.(() => observer.disconnect());
      }

      return Object.freeze({ active: true, modules: Object.freeze([...suppressed]) });
    }
  });
}

function compatibilityStorageKey() {
  return `${COMPATIBILITY_STORAGE_PREFIX}:crlngn-ui`;
}

function readCompatibilitySnapshot(storage, key) {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  const snapshot = JSON.parse(raw);
  if (snapshot?.version !== 1 || typeof snapshot.previousValue !== "boolean") {
    throw new Error("The saved Carolingian UI setting snapshot is invalid; it was not changed.");
  }
  return snapshot;
}

function removeNarratorHooks(hooks) {
  if (!hooks?.events || typeof hooks.off !== "function") return;
  for (const [hook, matcher] of Object.entries(NARRATOR_HOOK_MATCHERS)) {
    for (const entry of [...(hooks.events[hook] ?? [])]) {
      const callback = entry?.fn;
      if (typeof callback !== "function") continue;
      if (matcher(Function.prototype.toString.call(callback), callback.name)) hooks.off(hook, entry.id);
    }
  }
}
