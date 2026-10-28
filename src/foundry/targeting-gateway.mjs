import { resolveActorSource } from "./character-source.mjs";
import { targetDistance } from "./target-distance.mjs";
import { localizeFoundry } from "./localization.mjs";

const values = collection => Array.from(collection?.values?.() ?? collection ?? []);
const text = (key, fallback) => localizeFoundry(`MIKELANDIA_CONTROLS.Targets.${key}`, fallback);

/** Native user targeting; never controls tokens or writes world documents. */
export function createFoundryTargetingGateway({ getGame = () => globalThis.game,
  getCanvas = () => globalThis.canvas,
  resolveActor = uuid => resolveActorSource(uuid), measure = targetDistance,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis) ?? (callback => setTimeout(callback, 16)),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis) ?? clearTimeout } = {}) {
  let sourceUuid = "", context = "", sourceChoice = "", effectiveSource = "", expanded = false, publish = () => {};
  let lastState;
  const acquired = new Set();
  const targeted = document => values(getGame()?.user?.targets).find(token =>
    token.document?.id === document.id && token.document?.parent?.id === document.parent?.id);
  const release = token => {
    const canvas = getCanvas(), user = getGame()?.user;
    if (canvas?.ready && token.document?.parent?.id === canvas.scene?.id && typeof token.setTarget === "function") {
      token.setTarget(false, { releaseOthers: false });
    } else if (user?.targets?.delete(token)) {
      // Native UserTargets.delete emits targetToken, including on canvas teardown.
      user.broadcastActivity?.({ targets: values(user.targets).map(entry => entry.id) });
    }
    acquired.delete(token);
  };
  const snapshot = () => {
    const game = getGame(), canvas = getCanvas(), combat = game?.combat, scene = canvas?.scene;
    const combatSceneId = (typeof combat?.scene === "string" ? combat.scene : combat?.scene?.id)
      ?? combat?.sceneId ?? combat?._source?.scene ?? "";
    const turns = Array.from(combat?.turns ?? []);
    // Native encounters may be globally available (scene:null). Each combatant
    // then supplies its own sceneId; an explicit encounter scene still wins.
    const tokenSceneId = combatant => combatant.sceneId ?? combatant.token?.parent?.id ?? combatSceneId;
    const visible = Boolean(scene && combat?.started && (combatSceneId ? combatSceneId === scene.id
      : turns.some(combatant => tokenSceneId(combatant) === scene.id)));
    const nextContext = `${game?.user?.id ?? ""}|${sourceUuid}|${scene?.id ?? ""}|${combat?.id ?? ""}|${visible}`;
    if (context !== nextContext) {
      context = nextContext; sourceChoice = "";
      for (const token of [...acquired]) release(token);
    }
    if (!visible) return null;
    let actor = null;
    try { actor = sourceUuid ? resolveActor(sourceUuid) : null; } catch { /* Invalidated Actor. */ }
    const canUseActor = actor && (actor.isOwner || actor.testUserPermission?.(game.user, "OWNER"));
    const sources = canUseActor ? values(scene.tokens).filter(token => actor.isToken
      ? token.id === actor.token?.id && token.parent?.id === actor.token?.parent?.id
      : (token.actorId ?? token.actor?.id) === actor.id) : [];
    const source = sources.length === 1 ? sources[0] : sources.find(token => token.id === sourceChoice);
    if (effectiveSource !== (source?.id ?? "")) {
      effectiveSource = source?.id ?? "";
      for (const token of [...acquired]) release(token);
    }
    const documents = new Map();
    for (const combatant of turns) {
      if (tokenSceneId(combatant) !== scene.id) continue;
      const token = scene.tokens?.get?.(combatant.tokenId ?? combatant.token?.id);
      if (!token || token.parent?.id !== scene.id || combatant.hidden || combatant.visible === false || token.hidden) continue;
      if (!documents.has(token.id)) documents.set(token.id, { token, combatant });
    }
    for (const token of [...acquired]) {
      if (!game.user.targets.has(token)) acquired.delete(token);
      else if (!source || !documents.has(token.document?.id)) release(token);
    }
    const ready = Boolean(canvas.ready && source);
    const entries = [...documents.values()].map(({ token, combatant }) => {
      const placeable = canvas.tokens?.get?.(token.id);
      return { id: token.id, name: String(token.name ?? combatant.name ?? ""), img: String(token.texture?.src ?? ""),
        friendly: token.disposition === 1, defeated: Boolean(combatant.isDefeated ?? combatant.defeated),
        self: token.id === source?.id, selected: Boolean(targeted(token)),
        distance: source ? measure(scene, source, token, game.release?.generation) : null,
        enabled: Boolean(ready && typeof placeable?.setTarget === "function") };
    });
    return { context, sourceUuid, sourceId: source?.id ?? "", expanded, entries,
      sources: sources.map(token => ({ id: token.id, name: String(token.name ?? "") })), units: String(scene.grid?.units ?? ""),
      reason: !source ? sources.length > 1 ? text("ChooseSource", "Choose your token to enable targeting.")
        : text("NoSource", "Place the selected character in this scene to enable targeting.")
        : !canvas.ready ? text("NotReady", "Targeting is unavailable until the scene finishes loading.")
        : entries.some(entry => !entry.enabled) ? text("NativeUnavailable", "Some tokens are unavailable for native targeting.") : "" };
  };
  const requireCurrent = request => {
    const state = snapshot();
    if (!state || request.context !== state.context || request.sourceId !== state.sourceId) throw new Error(text("Stale", "The target selection has changed. Try again."));
    return state;
  };
  const gateway = {
    snapshot,
    refresh(uuid = sourceUuid) {
      sourceUuid = uuid;
      const state = snapshot();
      if (JSON.stringify(state) !== JSON.stringify(lastState)) { lastState = state; publish(state); }
      return state;
    },
    setExpanded(value) { expanded = Boolean(value); return gateway.refresh(); },
    selectSource(request) {
      const state = requireCurrent(request);
      if (!state.sources.some(token => token.id === request.tokenId)) throw new Error(text("SourceMissing", "Your token is no longer available."));
      for (const token of [...acquired]) release(token);
      sourceChoice = request.tokenId;
      return gateway.refresh();
    },
    toggle(request) {
      const state = requireCurrent(request), entry = state.entries.find(token => token.id === request.tokenId);
      if (!entry?.enabled) throw new Error(text("Unavailable", "This token is no longer available for targeting."));
      const token = getCanvas().tokens.get(entry.id);
      if (entry.selected) { token.setTarget(false, { releaseOthers: false }); acquired.delete(token); }
      else { acquired.add(token); try { token.setTarget(true, { releaseOthers: false }); } catch (error) { acquired.delete(token); throw error; } }
      return gateway.refresh();
    },
    watch(scope, readSource, onChange, { isVisible = () => true } = {}) {
      publish = onChange;
      lastState = undefined;
      let queued = false;
      let animationFrame = null;
      const refresh = () => {
        if (queued || scope.disposed) return;
        queued = true;
        queueMicrotask(() => { queued = false; if (!scope.disposed) gateway.refresh(readSource()); });
      };
      for (const hook of ["createToken", "updateToken", "deleteToken", "createCombat", "updateCombat", "deleteCombat",
        "createCombatant", "updateCombatant", "deleteCombatant", "updateScene", "canvasReady", "canvasTearDown", "updateActor", "deleteActor", "updateUser", "updateSetting"]) scope.hook(hook, refresh);
      scope.hook("refreshToken", (token, flags) => {
        // Animation changes the live TokenDocument after updateToken. Measure
        // those positions once per frame without polling or rebuilding controls.
        if (scope.disposed || !isVisible() || !lastState?.expanded || animationFrame !== null) return;
        if (flags && !flags.refreshPosition && !flags.refreshSize) return;
        const document = token?.document;
        if (document?.parent?.id !== getCanvas()?.scene?.id) return;
        if (document.id !== lastState.sourceId && !lastState.entries.some(entry => entry.id === document.id)) return;
        animationFrame = requestFrame(() => {
          animationFrame = null;
          if (!scope.disposed && isVisible()) gateway.refresh(readSource());
        });
      });
      scope.hook("targetToken", (user, token, selected) => {
        if (user?.id !== getGame()?.user?.id) return;
        if (!selected) acquired.delete(token);
        refresh();
      });
      scope.own(() => {
        if (animationFrame !== null) cancelFrame(animationFrame);
        animationFrame = null;
        publish = () => {};
        for (const token of [...acquired]) release(token);
      });
      return gateway.refresh(readSource());
    }
  };
  return Object.freeze(gateway);
}
