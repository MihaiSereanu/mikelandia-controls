import test from "node:test";
import assert from "node:assert/strict";
import { createMobileModuleCompatibilityGateway } from "../src/foundry/compatibility/mobile-module-compatibility.mjs";

function createNode({ href = "", id = "", classNames = [] } = {}) {
  const classes = new Set(classNames);
  return {
    nodeType: 1,
    href,
    id,
    parentElement: null,
    removed: false,
    children: [],
    classList: {
      [Symbol.iterator]: () => classes[Symbol.iterator](),
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    getAttribute(name) { return name === "href" ? href : null; },
    matches(selector) {
      return selector.includes("link[href]") && Boolean(href)
        || selector.includes("#narrator") && id === "narrator";
    },
    querySelectorAll(selector) {
      return this.children.flatMap(child => [
        ...(child.matches(selector) ? [child] : []),
        ...child.querySelectorAll(selector)
      ]);
    },
    append(child) {
      child.parentElement = this;
      this.children.push(child);
    },
    remove() {
      this.removed = true;
      this.parentElement?.children.splice(this.parentElement.children.indexOf(this), 1);
    }
  };
}

function createHooks() {
  const setup = () => NarratorToolsApi._setup();
  const chatCommandsImport = () => import("./chat-commands-lib.js");
  const ready = () => NarratorToolsApi._ready();
  const chatMessage = function _chatMessage() {}.bind({});
  const renderChat = function _renderChatMessage() {}.bind({});
  const sceneControls = function _getSceneControlButtons() {}.bind({});
  const pause = () => NarratorToolsApi._pause();
  const unrelated = () => {};
  const events = {
    setup: [setup, chatCommandsImport, unrelated].map((fn, id) => ({ id, fn })),
    ready: [{ id: 3, fn: ready }, { id: 4, fn: unrelated }],
    chatMessage: [{ id: 5, fn: chatMessage }],
    renderChatMessageHTML: [{ id: 6, fn: renderChat }],
    getSceneControlButtons: [{ id: 7, fn: sceneControls }],
    pauseGame: [{ id: 8, fn: pause }]
  };
  return {
    events,
    off(hook, id) {
      events[hook] = events[hook].filter(entry => entry.id !== id);
    }
  };
}

class TestMutationObserver {
  static instances = [];
  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    TestMutationObserver.instances.push(this);
  }
  observe(target, options) { this.targets.push({ target, options }); }
  disconnect() { this.disconnected = true; }
  trigger(records) { this.callback(records); }
}

function createDocument() {
  const head = createNode(), body = createNode({ classNames: ["crlngn-ui", "mc-mobile-running"] });
  return { head, body };
}

test("mobile mode suppresses Carolingian styles and Narrator Tools hooks locally", () => {
  TestMutationObserver.instances = [];
  const documentRef = createDocument();
  const carolingianStyles = createNode({ href: "modules/crlngn-ui/styles/crlngn-ui-v14.css" });
  const narratorStyles = createNode({ href: "modules/narrator-tools/narrator.css" });
  const unrelatedStyles = createNode({ href: "modules/other-module/style.css" });
  const narratorOverlay = createNode({ id: "narrator" });
  documentRef.head.append(carolingianStyles);
  documentRef.head.append(narratorStyles);
  documentRef.head.append(unrelatedStyles);
  documentRef.body.append(narratorOverlay);
  const hooks = createHooks();
  let cleanup;
  const result = createMobileModuleCompatibilityGateway({
    getGame: () => ({ modules: new Map([
      ["crlngn-ui", { active: true }],
      ["narrator-tools", { active: true }]
    ]) }),
    getHooks: () => hooks,
    readDocument: () => documentRef,
    MutationObserverClass: TestMutationObserver
  }).suppress({ own(callback) { cleanup = callback; } }, true);

  assert.deepEqual(new Set(result.modules), new Set(["crlngn-ui", "narrator-tools"]));
  assert.equal(carolingianStyles.removed, true);
  assert.equal(narratorStyles.removed, true);
  assert.equal(unrelatedStyles.removed, false);
  assert.equal(documentRef.body.classList.contains("crlngn-ui"), false);
  assert.equal(documentRef.body.classList.contains("mc-mobile-running"), true);
  assert.equal(narratorOverlay.removed, true);
  assert.deepEqual(hooks.events.setup.map(entry => entry.fn.name), ["unrelated"]);
  assert.deepEqual(hooks.events.ready.map(entry => entry.fn.name), ["unrelated"]);
  assert.equal(hooks.events.chatMessage.length, 0);
  assert.equal(hooks.events.renderChatMessageHTML.length, 0);
  assert.equal(hooks.events.getSceneControlButtons.length, 0);
  assert.equal(hooks.events.pauseGame.length, 0);
  assert.equal(TestMutationObserver.instances.length, 1);

  const lateStyles = createNode({ href: "/modules/crlngn-ui/styles/late.css" });
  const lateNarrator = createNode({ id: "narrator" });
  documentRef.head.append(lateStyles);
  documentRef.body.append(lateNarrator);
  TestMutationObserver.instances[0].trigger([
    { addedNodes: [lateStyles] },
    { addedNodes: [lateNarrator] },
    { addedNodes: [], attributeName: "class" }
  ]);
  assert.equal(lateStyles.removed, true);
  assert.equal(lateNarrator.removed, true);

  cleanup();
  assert.equal(TestMutationObserver.instances[0].disconnected, true);
});

test("native mode leaves enabled modules and hooks untouched", () => {
  const documentRef = createDocument();
  const styles = createNode({ href: "modules/crlngn-ui/styles/crlngn-ui-v14.css" });
  documentRef.head.append(styles);
  const hooks = createHooks();
  const result = createMobileModuleCompatibilityGateway({
    getGame: () => ({ modules: new Map([["crlngn-ui", { active: true }]]) }),
    getHooks: () => hooks,
    readDocument: () => documentRef,
    MutationObserverClass: TestMutationObserver
  }).suppress(null, false);

  assert.deepEqual(result, { active: false, modules: [] });
  assert.equal(styles.removed, false);
  assert.equal(hooks.events.setup.length, 3);
  assert.equal(documentRef.body.classList.contains("crlngn-ui"), true);
});

test("Carolingian suppression overrides only its local read before init without writes or reloads", () => {
  let storedDisabled = false, reads = 0;
  const settings = {
    settings: new Map([["crlngn-ui.disable-ui", { scope: "client" }]]),
    get(namespace, key) { assert.equal(this, settings); reads++; return namespace === "crlngn-ui" && key === "disable-ui" ? storedDisabled : `${namespace}.${key}`; },
    set() { throw Error("must not persist suppression"); }
  };
  const original = settings.get, cleanups = [];
  const result = createMobileModuleCompatibilityGateway({
    getGame: () => ({ settings, modules: new Map([["crlngn-ui", { active: true }]]) }),
    readDocument: () => null, getHooks: () => null, MutationObserverClass: null
  }).suppress({ own: cleanup => cleanups.push(cleanup) }, true);
  assert.deepEqual(result.modules, ["crlngn-ui"]);
  assert.equal(settings.get("crlngn-ui", "disable-ui"), true, "Carolingian init and ready see disabled UI");
  assert.equal(reads, 0);
  assert.equal(storedDisabled, false);
  assert.equal(settings.get("core", "uiConfig"), "core.uiConfig");
  assert.equal(settings.get("crlngn-ui", "other"), "crlngn-ui.other");
  storedDisabled = true;
  for (const cleanup of cleanups.reverse()) cleanup();
  assert.equal(settings.get, original);
  assert.equal(settings.get("crlngn-ui", "disable-ui"), true, "user changes are never restored over");
});

test("Carolingian registers its disable setting after the early guard is installed", () => {
  const settings = { settings: new Map(), get: () => false };
  let cleanup;
  createMobileModuleCompatibilityGateway({
    getGame: () => ({ settings, modules: new Map([["crlngn-ui", { active: true }]]) }),
    readDocument: () => null, getHooks: () => null, MutationObserverClass: null
  }).suppress({ own: callback => { cleanup = callback; } }, true);
  settings.settings.set("crlngn-ui.disable-ui", { scope: "client" });
  assert.equal(settings.get("crlngn-ui", "disable-ui"), true);
  cleanup();
  assert.equal(settings.get("crlngn-ui", "disable-ui"), false);
});

test("Carolingian guard leaves unsupported schemas and newer method wrappers intact", () => {
  const settings = { settings: new Map([["crlngn-ui.disable-ui", { scope: "world" }]]), get: () => false };
  let cleanup;
  createMobileModuleCompatibilityGateway({
    getGame: () => ({ settings, modules: new Map([["crlngn-ui", { active: true }]]) }),
    readDocument: () => null, getHooks: () => null, MutationObserverClass: null
  }).suppress({ own: callback => { cleanup = callback; } }, true);
  assert.equal(settings.get("crlngn-ui", "disable-ui"), false);
  const inner = settings.get;
  const newer = (...args) => inner(...args);
  settings.get = newer;
  cleanup();
  assert.equal(settings.get, newer);
  settings.settings.set("crlngn-ui.disable-ui", { scope: "client" });
  assert.equal(settings.get("crlngn-ui", "disable-ui"), false, "retained outer wrappers cannot keep suppression active");
});
