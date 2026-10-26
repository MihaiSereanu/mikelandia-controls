import test from "node:test";
import assert from "node:assert/strict";
import { createActorEditorGateway } from "../src/foundry/actor-editor-gateway.mjs";
import { classifyMobileApplication, createMobileApplicationAdmissions } from "../src/foundry/mobile-presentation.mjs";
import { createTaskScope } from "../src/kernel/task-scope.mjs";
import { createActor, createGame, createHooks, installGlobals } from "./helpers/foundry.mjs";

function fixture(t, { v1 = false, systemId = "shadowdark", type = "Player", render = () => {} } = {}) {
  const hooks = createHooks();
  const instances = [];
  class Sheet {
    static MODES = { PLAY: "play" };
    constructor(first, options) {
      this.document = v1 ? first : first.document;
      this.options = v1 ? options : first;
      this.isV2 = !v1;
      this.closeCount = 0;
      instances.push(this);
    }
    render(...args) { this.renderArguments = args; return render(this); }
    close() { this.closeCount++; hooks.emit(v1 ? "closeApplication" : "closeApplicationV2", this); }
  }
  const actor = createActor({ type });
  actor.sheet = v1 ? new Sheet(actor, {}) : new Sheet({ document: actor });
  const assigned = actor.sheet;
  const game = createGame([actor], systemId);
  game.ready = true;
  const owner = createTaskScope("native-test");
  t.after(() => owner.dispose());
  installGlobals(t, { game, Hooks: hooks, foundry: { applications: { sheets: { ActorSheetV2: Sheet } } } });
  const gateway = createActorEditorGateway({ isActive: () => true });
  const open = () => gateway.open({ actorSourceUuid: actor.uuid }, { worldId: "world", userId: "player", connectionGeneration: 0 }, owner);
  return { actor, game, gateway, owner, open, assigned, instances, hooks };
}

function element(modal = false) {
  const classes = new Set();
  const properties = new Map();
  return {
    isConnected: true,
    closest: () => null,
    matches: selector => modal && selector.split(", ").includes("dialog"),
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) },
    style: { getPropertyValue: name => properties.get(name) ?? "", getPropertyPriority: () => "",
      setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name) }
  };
}

for (const v1 of [true, false]) {
  test(`native Application ${v1 ? "V1" : "V2"} opens a separate instance with native arguments`, async t => {
    const { open, gateway, assigned, instances, owner } = fixture(t, { v1 });
    await open();
    const app = instances.at(-1);
    assert.notEqual(app, assigned);
    assert.equal(gateway.ownsApplication(assigned), false);
    assert.equal(gateway.ownsApplication(app), true);
    assert.deepEqual(app.renderArguments, v1 ? [true] : [{ force: true, mode: "play" }]);
    assert.match(app.options.id, /^ve-mobile-native-sheet-/);
    owner.dispose();
    assert.equal(gateway.ownsApplication(app), false);
    assert.equal(app.closeCount, 1);
    assert.equal(assigned.closeCount, 0);
  });
}

test("only the deliberately opened actor sheet is admitted", async t => {
  const { open, gateway, instances, assigned } = fixture(t);
  await open();
  const options = { isActorEditor: gateway.ownsApplication };
  assert.equal(classifyMobileApplication(element(), assigned, options).admitted, false);
  assert.equal(classifyMobileApplication(element(), instances.at(-1), options).admitted, true);
});

test("duplicate native opens are rejected and the close hook permits reopening", async t => {
  const { open, instances, gateway } = fixture(t);
  await open();
  await assert.rejects(open(), /already open/);
  instances.at(-1).close();
  assert.equal(gateway.ownsApplication(instances.at(-1)), false);
  assert.equal((await open()).opened, true);
});

test("ownership loss closes the admitted sheet", async t => {
  const { open, actor, hooks, gateway, instances } = fixture(t);
  await open();
  actor.testUserPermission = () => false;
  hooks.emit("updateActor", actor);
  assert.equal(gateway.ownsApplication(instances.at(-1)), false);
  assert.equal(instances.at(-1).closeCount, 1);
  await assert.rejects(open(), /no longer editable/);
});

test("late render completion after teardown cannot restore native access", async t => {
  let finish;
  const { open, owner, gateway, instances } = fixture(t, { render: () => new Promise(resolve => { finish = resolve; }) });
  const pending = open();
  const app = instances.at(-1);
  owner.dispose();
  finish();
  await assert.rejects(pending, /no longer active/);
  assert.equal(gateway.ownsApplication(app), false);
  assert.ok(app.closeCount >= 1);
});

test("failed rendering releases the pending lock and admission", async t => {
  let fail = true;
  const { open, gateway, instances } = fixture(t, { render: () => { if (fail) throw new Error("native render failed"); } });
  await assert.rejects(open(), /native render failed/);
  assert.equal(gateway.ownsApplication(instances.at(-1)), false);
  fail = false;
  assert.equal((await open()).opened, true);
});

test("D&D native access remains restricted to its existing group/vehicle policy", async t => {
  const { open, actor } = fixture(t, { systemId: "dnd5e", type: "character" });
  await assert.rejects(open(), /no longer editable/);
  actor.type = "group";
  assert.equal((await open()).opened, true);
});

test("native fallback resolves the exact unlinked token actor", async t => {
  const { actor, open, instances } = fixture(t);
  actor.uuid = "Scene.scene.Token.token.Actor.hero";
  actor.isToken = true;
  installGlobals(t, { fromUuidSync: uuid => uuid === actor.uuid ? actor : null });
  await open();
  assert.equal(instances.at(-1).document, actor);
});

test("nested modal back/close retains the sheet and restoration clears admission styling", () => {
  const body = element();
  const admissions = createMobileApplicationAdmissions(body);
  const sheetElement = element();
  const modalElement = element(true);
  const sheet = { close: () => admissions.release(sheet) };
  const dialog = { close: () => admissions.release(dialog) };
  admissions.admit(sheet, sheetElement, false, null, sheet);
  admissions.admit(dialog, modalElement, true, null, dialog);
  assert.equal(admissions.topmost().application, dialog);
  assert.equal(body.classList.contains("ve-mobile-dialog-open"), true);
  assert.equal(admissions.closeTopmost(), true);
  assert.equal(admissions.topmost().application, sheet);
  assert.equal(body.classList.contains("ve-mobile-dialog-open"), false);
  admissions.clear();
  assert.equal(sheetElement.classList.contains("ve-mobile-admitted-app"), false);
  assert.equal(sheetElement.style.getPropertyValue("--ve-mobile-native-app-layer"), "");
});

test("legacy sheets without an isV2 flag use the legacy constructor", async t => {
  const f = fixture(t, { v1: true });
  const NativeSheet = f.assigned.constructor;
  delete f.assigned.isV2;
  globalThis.foundry.appv1 = { sheets: { ActorSheet: NativeSheet } };
  await f.open();
  assert.equal(f.instances.at(-1).document, f.actor);
  assert.deepEqual(f.instances.at(-1).renderArguments, [true]);
});

test("integration-owned non-dialog roll forms receive modal admission", () => {
  const app = {};
  const result = classifyMobileApplication(element(), app, { isNativeDialog: candidate => candidate === app });
  assert.equal(result.admitted, true);
  assert.equal(result.modal, true);
});

test("Foundry 14 legacy actor base hooks mark and release the exact editor", async t => {
  const f = fixture(t, { v1: true }); await f.open();
  const app = f.instances.at(-1), root = element(); root.dataset = {};
  f.hooks.emit("renderActorSheet", app, root);
  assert.equal(root.classList.contains("ve-mobile-native-editor"), true);
  assert.equal(root.dataset.veNativeSystem, "shadowdark");
  f.hooks.emit("closeActorSheet", app);
  assert.equal(f.gateway.ownsApplication(app), false);
  assert.equal((await f.open()).opened, true);
});
