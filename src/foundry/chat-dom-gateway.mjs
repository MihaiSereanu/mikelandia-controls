import { localizeFoundry } from "./localization.mjs";
const CHATLOG_PRUNE_ID = "chatlog-prune";
const MIDI_QOL_ID = "midi-qol";
const DEFAULT_BATCH_SIZE = 25;

/**
 * Inspect Chat Log Prune without depending on its implementation or API.
 * The module exposes no runtime API; its client setting and replacement class
 * are the stable observable integration points.
 */
export function inspectChatLogPrune(game = globalThis.game, config = globalThis.CONFIG) {
  const module = game?.modules?.get?.(CHATLOG_PRUNE_ID);
  const installed = Boolean(module);
  const moduleActive = Boolean(module?.active);
  const setting = readPruneSetting(game);
  const className = String(config?.ui?.chat?.name ?? "");
  const classActive = /ChatLogPrune/u.test(className);
  // The module's default is enabled. Treat an active module as the owner even
  // if Mikelandia Controls's init hook runs before its setting/class hook; only an explicit
  // stored/registered false releases ownership.
  const active = moduleActive && setting !== false;
  return Object.freeze({
    installed,
    moduleActive,
    settingEnabled: setting,
    classActive,
    active,
    version: module?.version ?? null
  });
}

/** Install Mikelandia Controls's bounded ChatLog subclass only when Chat Log Prune is not the owner. */
export function installMcChatWindowClass({
  game = globalThis.game,
  config = globalThis.CONFIG,
  foundry = globalThis.foundry,
  hooks = globalThis.Hooks
} = {}) {
  const prune = inspectChatLogPrune(game, config);
  if (prune.active) return Object.freeze({ installed: false, owner: "ChatLog Prune", prune });
  const midiLegacy = inspectMidiLegacyPruning(game, config);
  if (midiLegacy.active) return Object.freeze({ installed: false, owner: "Midi-QOL legacy", prune, midiLegacy });
  const BaseChatLog = config?.ui?.chat;
  if (typeof BaseChatLog !== "function") {
    return Object.freeze({ installed: false, owner: "none", prune, reason: localizeFoundry("MIKELANDIA_CONTROLS.Interface.ChatDomGateway.ChatLogClassUnavailable", "ChatLog class unavailable") });
  }
  if (BaseChatLog.mcMobileBoundedChat === true) {
    return Object.freeze({ installed: true, owner: "Mikelandia Controls", prune, ChatLogClass: BaseChatLog });
  }

  const Semaphore = foundry?.utils?.Semaphore;
  class McMobileBoundedChatLog extends BaseChatLog {
    static mcMobileBoundedChat = true;
    #mcActive = false;
    #mcRendering = false;
    #mcRenderingForward = false;
    #mcQueue = typeof Semaphore === "function" ? new Semaphore(1) : { add: (fn, ...args) => fn(...args) };
    #mcForwardListener = null;
    #mcLogElement = null;
    #mcLimit = configuredBatchSize(config);

    mcMobileSetBoundedWindow(active, limit = configuredBatchSize(config)) {
      this.#mcActive = Boolean(active && !this.isPopout);
      this.#mcLimit = Math.max(1, Number(limit) || configuredBatchSize(config));
      if (this.#mcActive) this.#mcPruneTop();
    }

    async scrollBottom(options = {}) {
      const result = await super.scrollBottom(options);
      if (this.#mcActive) this.#mcPruneTop();
      return result;
    }

    async renderBatch(size) {
      if (!this.#mcActive) return super.renderBatch(size);
      if (this.#mcRendering) return;
      this.#mcRendering = true;
      return this.#mcQueue.add(async () => {
        try {
          const log = this.element?.querySelector?.(".chat-log");
          const messages = game?.messages?.contents ?? [];
          const oldest = log?.firstElementChild?.dataset?.messageId;
          let end = oldest ? messages.findIndex((message) => message.id === oldest) : messages.length;
          if (end < 0) end = messages.length;
          const start = Math.max(0, end - Math.max(1, Number(size) || this.#mcLimit));
          const present = renderedMessageIds(log);
          const elements = [];
          for (let index = start; index < end; index += 1) {
            const message = messages[index];
            if (!message?.visible || present.has(message.id)) continue;
            try {
              const element = await this.constructor.renderMessage(message);
              elements.push(element);
              present.add(message.id);
              if (!this.isPopout) message.logged = true;
            } catch (error) {
              hooks?.onError?.("McMobileBoundedChatLog#renderBatch", error, {
                msg: `Chat message ${message?.id ?? "unknown"} failed to render`, log: "error"
              });
            }
          }
          if (elements.length) log?.prepend?.(...elements);
          this.#mcPruneBottom();
        } finally {
          this.#mcRendering = false;
        }
      });
    }

    _attachLogListeners(element, options) {
      super._attachLogListeners(element, options);
      this.#mcDetachForwardListener();
      this.#mcForwardListener = () => {
        if (!this.#mcActive || this.#mcRenderingForward) return;
        const denominator = element.scrollHeight - element.clientHeight;
        const ratio = denominator > 0 ? element.scrollTop / denominator : 1;
        if (ratio < 0.99) return;
        void this.#mcRenderForward(configuredBatchSize(config));
      };
      this.#mcLogElement = element;
      element.addEventListener("scroll", this.#mcForwardListener, { passive: true });
    }

    async close(options = {}) {
      this.#mcActive = false;
      this.#mcDetachForwardListener();
      return super.close(options);
    }

    #mcDetachForwardListener() {
      if (this.#mcLogElement && this.#mcForwardListener) {
        this.#mcLogElement.removeEventListener?.("scroll", this.#mcForwardListener);
      }
      this.#mcLogElement = null;
      this.#mcForwardListener = null;
    }

    #mcPruneTop() {
      const log = this.element?.querySelector?.(".chat-log");
      if (!log) return;
      const threshold = this.#mcLimit * 2;
      if ((log.children?.length ?? 0) < threshold) return;
      while ((log.children?.length ?? 0) > this.#mcLimit) this.#mcRemove(log.firstElementChild);
    }

    #mcPruneBottom() {
      const log = this.element?.querySelector?.(".chat-log");
      if (!log) return;
      const threshold = this.#mcLimit * 2;
      if ((log.children?.length ?? 0) < threshold) return;
      while ((log.children?.length ?? 0) > this.#mcLimit) this.#mcRemove(log.lastElementChild);
    }

    #mcRemove(element) {
      const messageId = element?.dataset?.messageId;
      if (!messageId) return element?.remove?.();
      if (!this.isPopout) {
        const message = game?.messages?.get?.(messageId);
        if (message) message.logged = false;
      }
      // Removing the card releases its element-owned listeners with the DOM
      // node. Application roots and ChatMessage documents remain untouched.
      element.remove?.();
    }

    async #mcRenderForward(size) {
      if (this.#mcRenderingForward) return;
      this.#mcRenderingForward = true;
      return this.#mcQueue.add(async () => {
        try {
          const log = this.element?.querySelector?.(".chat-log");
          const messages = game?.messages?.contents ?? [];
          const newest = log?.lastElementChild?.dataset?.messageId;
          let start = newest ? messages.findIndex((message) => message.id === newest) + 1 : messages.length;
          if (!(start > 0)) return;
          const present = renderedMessageIds(log);
          const elements = [];
          for (let index = start; index < messages.length && elements.length < size; index += 1) {
            const message = messages[index];
            if (!message?.visible || present.has(message.id)) continue;
            try {
              elements.push(await this.constructor.renderMessage(message));
              present.add(message.id);
              if (!this.isPopout) message.logged = true;
            } catch (error) {
              hooks?.onError?.("McMobileBoundedChatLog#renderForward", error, {
                msg: `Chat message ${message?.id ?? "unknown"} failed to render`, log: "error"
              });
            }
          }
          if (elements.length) log?.append?.(...elements);
          this.#mcPruneTop();
        } finally {
          this.#mcRenderingForward = false;
        }
      });
    }
  }

  config.ui.chat = McMobileBoundedChatLog;
  return Object.freeze({ installed: true, owner: "Mikelandia Controls", prune, ChatLogClass: McMobileBoundedChatLog });
}

export function createChatDomGateway({
  readGame = () => globalThis.game,
  readUi = () => globalThis.ui,
  readConfig = () => globalThis.CONFIG,
  readDocument = () => globalThis.document
} = {}) {
  const limit = () => configuredBatchSize(readConfig());
  let mcActive = false;
  return Object.freeze({
    activate(chat = readUi()?.chat) {
      if (inspectChatLogPrune(readGame(), readConfig()).active) { mcActive = false; return false; }
      if (inspectMidiLegacyPruning(readGame(), readConfig()).active) { mcActive = false; return false; }
      chat?.mcMobileSetBoundedWindow?.(true, limit());
      mcActive = typeof chat?.mcMobileSetBoundedWindow === "function";
      return mcActive;
    },
    deactivate(chat = readUi()?.chat) {
      chat?.mcMobileSetBoundedWindow?.(false, limit());
      mcActive = false;
    },
    snapshot() {
      const game = readGame();
      const document = readDocument();
      const prune = inspectChatLogPrune(game, readConfig());
      const midiLegacy = inspectMidiLegacyPruning(game, readConfig());
      const nativeRows = document?.querySelectorAll?.("#chat .chat-log > [data-message-id], #chat-popout .chat-log > [data-message-id]")?.length ?? 0;
      const mcRows = document?.querySelectorAll?.(".mc-native-chat-screen .chat-log > [data-message-id]")?.length ?? 0;
      const mcClass = Boolean(readConfig()?.ui?.chat?.mcMobileBoundedChat);
      return Object.freeze({
        chatLogPruneInstalled: prune.installed,
        chatLogPruneActive: prune.active,
        chatLogPruneVersion: prune.version,
        midiQolLegacyPruningActive: midiLegacy.active,
        nativeRenderedRows: nativeRows,
        mcRenderedRows: mcRows,
        mcWindowLimit: limit(),
        nativePruningOwner: prune.active ? "ChatLog Prune" : midiLegacy.active ? "Midi-QOL legacy" : (mcClass && mcActive ? "Mikelandia Controls" : "none")
      });
    }
  });
}

export function inspectMidiLegacyPruning(game = globalThis.game, config = globalThis.CONFIG) {
  const module = game?.modules?.get?.(MIDI_QOL_ID);
  if (!module?.active) return Object.freeze({ active: false, version: module?.version ?? null });
  const enabled = readOptionalSetting(game, MIDI_QOL_ID, "pruneChatLog");
  const className = String(config?.ui?.chat?.name ?? "");
  const classActive = /ChatLogMidi/u.test(className);
  const supportedLegacyBuild = /^13\.0\./u.test(String(module.version ?? ""));
  return Object.freeze({
    active: classActive || (supportedLegacyBuild && enabled !== false),
    classActive,
    settingEnabled: enabled,
    version: module.version ?? null
  });
}

export function configuredBatchSize(config = globalThis.CONFIG) {
  return Math.max(1, Number(config?.ChatMessage?.batchSize) || DEFAULT_BATCH_SIZE);
}

function readPruneSetting(game) {
  try {
    const registered = game?.settings?.settings?.get?.(`${CHATLOG_PRUNE_ID}.enabled`);
    if (registered) return Boolean(game.settings.get(CHATLOG_PRUNE_ID, "enabled"));
    const stored = game?.settings?.storage?.get?.("client")?.get?.(`${CHATLOG_PRUNE_ID}.enabled`);
    if (stored && Object.hasOwn(stored, "value")) return stored.value !== false;
  } catch {
    return null;
  }
  return null;
}

function readOptionalSetting(game, namespace, key) {
  try {
    const registered = game?.settings?.settings?.get?.(`${namespace}.${key}`);
    if (registered) return game.settings.get(namespace, key);
    for (const scope of ["client", "world"]) {
      const stored = game?.settings?.storage?.get?.(scope)?.get?.(`${namespace}.${key}`);
      if (stored && typeof stored === "object" && Object.hasOwn(stored, "value")) return stored.value;
    }
    return game?.settings?.get?.(namespace, key) ?? null;
  } catch { return null; }
}

function renderedMessageIds(log) {
  return new Set(Array.from(log?.children ?? []).map((element) => element?.dataset?.messageId).filter(Boolean));
}
