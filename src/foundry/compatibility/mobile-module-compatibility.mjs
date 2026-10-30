const MOBILE_COMPATIBILITY_MODULES = Object.freeze(["crlngn-ui", "narrator-tools"]);
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
  MutationObserverClass = globalThis.MutationObserver
} = {}) {
  return Object.freeze({
    suppress(scope, enabled) {
      if (!enabled) return Object.freeze({ active: false, modules: Object.freeze([]) });
      const game = getGame();
      const modules = MOBILE_COMPATIBILITY_MODULES.filter(id => game?.modules?.get?.(id)?.active);
      if (!modules.length) return Object.freeze({ active: false, modules: Object.freeze([]) });

      const documentRef = readDocument();
      const hooks = getHooks();
      const suppressed = new Set();
      if (modules.includes("crlngn-ui") && suppressCarolingianSetting(scope, game)) {
        suppressed.add("crlngn-ui");
      }
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

/** Carolingian reads this client setting during init and ready. Suppress its
 * UI for this page without persisting anything which would need restoration. */
function suppressCarolingianSetting(scope, game) {
  const settings = game?.settings;
  if (typeof settings?.get !== "function") return false;
  const descriptor = Object.getOwnPropertyDescriptor(settings, "get");
  if (descriptor?.configurable === false) return false;
  const original = settings.get;
  let active = true;
  const guarded = function (namespace, key, ...args) {
    if (active && namespace === "crlngn-ui" && key === "disable-ui") {
      const definition = settings.settings?.get?.("crlngn-ui.disable-ui");
      if (!definition || definition.scope === "client") return true;
    }
    return original.call(this, namespace, key, ...args);
  };
  Object.defineProperty(settings, "get", { configurable: true, writable: true, value: guarded });
  scope?.own?.(() => {
    active = false;
    if (settings.get !== guarded) return;
    if (descriptor) Object.defineProperty(settings, "get", descriptor);
    else delete settings.get;
  });
  return true;
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
