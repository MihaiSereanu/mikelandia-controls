import { localizeFoundry } from "./localization.mjs";
import { actorSourceUuid, resolveActorSource, validSourceUuid } from "./character-source.mjs";
import { resolveSystemIntegration } from "../systems/registry.mjs";

let nextNativeSheetId = 0;

/** Explicit native editing sessions are owned by mobile runtime, not by the
 * persistent Desktop sheet. Admission is instance-specific, never a selector
 * or an Actor-backed-application exception. Native systems enforce edits. */
export function createActorEditorGateway({ getGame = () => globalThis.game, isActive = () => false,
  getConnectionGeneration = () => 0,
  getSystemIntegration = () => resolveSystemIntegration(getGame()?.system?.id) } = {}) {
  const sessions = new Map();
  const pending = new Set();
  const owners = new Set();
  const requireActor = (sourceUuid, expected, owner, original = null) => {
    const game = getGame();
    if (!owner || owner.disposed || !isActive() || !game?.ready || !game.user
      || (expected.worldId !== undefined && expected.worldId !== game.world?.id)
      || (expected.userId !== undefined && expected.userId !== game.user.id)
      || (expected.connectionGeneration !== undefined && expected.connectionGeneration !== getConnectionGeneration())) {
      throw new Error(localizeFoundry("VEMOBILE.Character.ActorEditorGateway.ThisNativeEditorSessionIsNoLongerActive", "This native editor session is no longer active."));
    }
    const actor = resolveActorSource(validSourceUuid(sourceUuid), { game });
    if (!actor || (original && actor !== original)
      || !getSystemIntegration().canOpenNativeActor(actor, game.user)) throw new Error(localizeFoundry("VEMOBILE.Character.ActorEditorGateway.ThisActorIsNoLongerEditable", "This actor is no longer editable."));
    return actor;
  };
  return Object.freeze({
    ownsApplication: application => sessions.has(application),
    closeAll: () => { for (const owner of [...owners]) owner.dispose(); },
    async open({ actorSourceUuid: sourceUuid }, expected = {}, owner) {
      const actor = requireActor(sourceUuid, expected, owner);
      if (pending.has(sourceUuid)) {
        throw new Error(localizeFoundry("VEMOBILE.Character.ActorEditorGateway.ThisNativeEditorIsAlreadyOpen", "This native editor is already open."));
      }
      const existing = [...sessions].find(([, session]) => session.sourceUuid === sourceUuid);
      if (existing) {
        const [application] = existing;
        requireActor(sourceUuid, expected, owner, application.actor ?? application.document ?? actor);
        await application.maximize?.();
        requireActor(sourceUuid, expected, owner, application.actor ?? application.document ?? actor);
        const legacyType = globalThis.foundry?.appv1?.sheets?.ActorSheet;
        const legacy = application.isV2 === false || (typeof legacyType === "function" && application instanceof legacyType);
        const currentRoot = [application.element, application.element?.[0]].find(candidate => candidate?.nodeType === 1);
        if (application.rendered === false || currentRoot?.isConnected === false) {
          const viewMode = application.constructor.MODES?.PLAY ?? application.constructor.MODES?.VIEW;
          await application.render(legacy ? true : { force: true, ...(viewMode === undefined ? {} : { mode: viewMode }) });
          requireActor(sourceUuid, expected, owner, application.actor ?? application.document ?? actor);
        }
        application.bringToFront?.();
        application.bringToTop?.();
        const candidates = [application.element, application.element?.[0]];
        const element = candidates.find(candidate => candidate?.nodeType === 1);
        const EventType = element?.ownerDocument?.defaultView?.Event;
        if (EventType) element.dispatchEvent(new EventType("ve-mobile-reveal-native", { bubbles: true }));
        return Object.freeze({ actorSourceUuid: sourceUuid, opened: true, existing: true });
      }
      pending.add(sourceUuid);
      const scope = owner.child("native-actor-editor");
      owners.add(scope);
      scope.own(() => owners.delete(scope));
      let application = null;
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (application) sessions.delete(application);
        try { void Promise.resolve(application?.close?.()).catch(() => {}); } catch { /* preserve original failure */ }
      };
      scope.own(close);
      try {
        const assigned = actor.sheet;
        if (!assigned?.constructor || typeof assigned.render !== "function") throw new Error(localizeFoundry("VEMOBILE.Character.ActorEditorGateway.TheNativeActorEditorIsUnavailable", "The native Actor editor is unavailable."));
        const id = `ve-mobile-native-sheet-${++nextNativeSheetId}`;
        const ApplicationV1 = globalThis.foundry?.appv1?.sheets?.ActorSheet;
        const legacy = assigned.isV2 === false || (typeof ApplicationV1 === "function" && assigned instanceof ApplicationV1);
        application = legacy
          ? new assigned.constructor(actor, { editable: true, id }) : new assigned.constructor({ document: actor, id });
        // Legacy DocumentSheet IDs are derived from the document, ignoring
        // options.id. Keep this editor separate from the assigned desktop sheet.
        if (legacy && application.id !== id) Object.defineProperty(application, "id", { value: id, configurable: true });
        sessions.set(application, { sourceUuid: actorSourceUuid(actor) });
        const markEditor = (app, html) => {
          if (app !== application) return;
          const candidates = [app.element, app.element?.[0], html, html?.[0]];
          // HTMLFormElement[0] is its first control, not a jQuery root.
          const element = candidates.find(candidate => candidate?.nodeType === 1) ?? candidates.find(candidate => candidate?.classList);
          element?.classList?.add("ve-mobile-native-editor");
          if (element?.dataset) element.dataset.veNativeSystem = getGame()?.system?.id ?? "";
        };
        for (const hook of ["renderApplication", "renderApplicationV1", "renderApplicationV2", "renderActorSheet"]) scope.hook(hook, markEditor);
        for (const hook of ["closeApplication", "closeApplicationV1", "closeApplicationV2", "closeActorSheet"]) scope.hook(hook, app => {
          if (app !== application) return;
          closed = true;
          sessions.delete(application);
          scope.dispose();
        });
        const revalidate = () => {
          try { requireActor(sourceUuid, expected, scope, actor); } catch { scope.dispose(); }
        };
        for (const hook of ["updateActor", "deleteActor", "updateUser", "deleteToken", "updateToken"]) scope.hook(hook, revalidate);
        requireActor(sourceUuid, expected, scope, actor);
        // Opening native access must not start editable rich-text controls:
        // some native sheets autosave normalized HTML on blur/close. Owners
        // can deliberately enter Edit using the native sheet's own control.
        const viewMode = application.constructor.MODES?.PLAY ?? application.constructor.MODES?.VIEW;
        try {
          if (legacy) await Promise.resolve(application.render(true));
          else await Promise.resolve(application.render({ force: true, ...(viewMode === undefined ? {} : { mode: viewMode }) }));
        } finally {
          // Native rendering can finish after teardown closed the provisional
          // instance. Dispose any late native resources too, preserving errors.
          if (scope.disposed) {
            try { await Promise.resolve(application.close?.()); } catch { /* preserve render/cancellation error */ }
          }
        }
        requireActor(sourceUuid, expected, scope, actor);
        if (closed) throw new Error(localizeFoundry("VEMOBILE.Character.ActorEditorGateway.ThisNativeEditorWasClosedWhileOpening", "This native editor was closed while opening."));
        return Object.freeze({ actorSourceUuid: sourceUuid, opened: true });
      } catch (error) {
        scope.dispose();
        throw error;
      } finally { pending.delete(sourceUuid); }
    }
  });
}
