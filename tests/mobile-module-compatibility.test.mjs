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

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    values
  };
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

test("desktop mode leaves enabled modules and hooks untouched", () => {
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

test("Carolingian UI is disabled and restored with its client-scoped preference", async () => {
  const storage = createStorage();
  const modules = new Map([["crlngn-ui", { active: true }]]);
  const clientSetting = { scope: "client" };
  let disableUi = false, reloads = 0;
  const game = {
    modules,
    world: { id: "world-a" },
    user: { id: "user-a" },
    settings: {
      settings: new Map([["crlngn-ui.disable-ui", clientSetting]]),
      get: () => disableUi,
      async set(namespace, setting, value) {
        assert.equal(namespace, "crlngn-ui");
        assert.equal(setting, "disable-ui");
        disableUi = value;
      }
    }
  };
  const gateway = createMobileModuleCompatibilityGateway({
    getGame: () => game,
    getStorage: () => storage,
    requestReload: () => { reloads += 1; }
  });

  assert.deepEqual(await gateway.reconcileCarolingianUi(true), { changed: true, reloadPending: true });
  assert.equal(disableUi, true);
  assert.equal(reloads, 1);
  assert.deepEqual(await gateway.reconcileCarolingianUi(true), { changed: false, reason: "already-disabled" });
  assert.equal(reloads, 1);

  assert.deepEqual(await gateway.reconcileCarolingianUi(false), { changed: true, reloadPending: true });
  assert.equal(disableUi, false);
  assert.equal(reloads, 2);
  assert.equal(storage.values.size, 0);
});

test("Carolingian UI's pre-existing client disable preference is preserved", async () => {
  const storage = createStorage();
  let disableUi = true;
  const gateway = createMobileModuleCompatibilityGateway({
    getGame: () => ({
      modules: new Map([["crlngn-ui", { active: true }]]),
      world: { id: "world-a" },
      user: { id: "user-a" },
      settings: {
        settings: new Map([["crlngn-ui.disable-ui", { scope: "client" }]]),
        get: () => disableUi,
        async set(_namespace, _setting, value) { disableUi = value; }
      }
    }),
    getStorage: () => storage,
    requestReload() { throw new Error("A user-disabled module should not cause a reload"); }
  });

  assert.deepEqual(await gateway.reconcileCarolingianUi(true), { changed: false, reason: "user-disabled" });
  assert.deepEqual(await gateway.reconcileCarolingianUi(false), { changed: false, reason: "no-mobile-override" });
  assert.equal(disableUi, true);
});

test("Carolingian UI setting is never changed unless its setting is client-scoped", async () => {
  let setCalled = false;
  const gateway = createMobileModuleCompatibilityGateway({
    getGame: () => ({
      modules: new Map([["crlngn-ui", { active: true }]]),
      settings: {
        settings: new Map([["crlngn-ui.disable-ui", { scope: "world" }]]),
        get: () => false,
        async set() { setCalled = true; }
      }
    }),
    getStorage: createStorage
  });

  await assert.rejects(gateway.reconcileCarolingianUi(true), /client-only disable setting is unavailable/u);
  assert.equal(setCalled, false);
});
