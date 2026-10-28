import { resolveSystemIntegration } from "../systems/registry.mjs";
import { localizeFoundry } from "./localization.mjs";
import { ACTOR_COMMANDS } from "../kernel/command-names.mjs";
import { resolveActorSource, validSourceUuid } from "./character-source.mjs";
import { CommandError } from "./command-error.mjs";

export { ACTOR_COMMANDS, CommandError };

/** Shared authority boundary. Rules execution and result handling belong to adapters. */
export function createFoundryCommandGateway({
  getGame = () => globalThis.game,
  getHooks = () => globalThis.Hooks,
  getNotifications = () => globalThis.ui?.notifications,
  getConnectionGeneration = () => 0,
  rollTiming = null,
  getSystemIntegration = () => resolveSystemIntegration(getGame()?.system?.id)
} = {}) {
  const adapters = new WeakMap();
  const inFlight = new Set();
  const commandsForSystem = () => {
    const integration = getSystemIntegration();
    if (!adapters.has(integration)) adapters.set(integration, integration.createCommands({
      getGame, getHooks, getNotifications, getConnectionGeneration
    }));
    return adapters.get(integration);
  };
  const unavailable = () => new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry(
    "MIKELANDIA_CONTROLS.Character.CommandGateway.ThisActorTypeRequiresItsNativeWorkflowForThat",
    "This Actor type requires its native workflow for that operation."));
  const resolveOwned = (payload, expected) => {
    const game = getGame();
    assertSession(game, expected, getConnectionGeneration);
    let sourceUuid;
    try { sourceUuid = validSourceUuid(payload.actorSourceUuid || (payload.actorId ? `Actor.${payload.actorId}` : "")); }
    catch (error) { throw new CommandError("INVALID_INPUT", error.message, { cause: error }); }
    const actor = resolveActorSource(sourceUuid, { game });
    if (!actor) throw new CommandError("TARGET_MISSING", localizeFoundry("MIKELANDIA_CONTROLS.Character.BiographyGateway.TheSelectedActorIsNoLongerAvailable", "The selected actor is no longer available."));
    if (!canOwn(actor, game.user)) throw new CommandError("FORBIDDEN", localizeFoundry("MIKELANDIA_CONTROLS.Character.CommandGateway.YouNoLongerHavePermissionToControlThisActor", "You no longer have permission to control this actor."));
    return { game, actor, sourceUuid };
  };
  return Object.freeze({
    notifyError(error) {
      const message = error?.message ?? localizeFoundry("MIKELANDIA_CONTROLS.Character.CommandGateway.TheFoundryActionFailed", "The Foundry action failed.");
      getNotifications()?.error?.(message);
      return message;
    },
    capabilitiesForActor(actor, user = getGame()?.user) {
      const commands = commandsForSystem();
      if (!canOwn(actor, user)) return commands.emptyCapabilities?.() ?? Object.freeze({});
      return commands.capabilitiesForActor(actor, user);
    },
    readItemMenu(payload, expectedSession = {}) {
      resolveOwned(payload, expectedSession);
      const commands = commandsForSystem();
      if (typeof commands.readItemMenu !== "function") throw unavailable();
      return commands.readItemMenu(payload, expectedSession);
    },
    async execute(name, payload = {}, expectedSession = {}, observer = {}) {
      if (!Object.values(ACTOR_COMMANDS).includes(name)) throw new CommandError("UNKNOWN_COMMAND", localizeFoundry("MIKELANDIA_CONTROLS.Character.CommandGateway.UnsupportedCommand", "Unsupported command: {name}", { name: String(name) }));
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new CommandError("INVALID_INPUT", localizeFoundry("MIKELANDIA_CONTROLS.Panels.InvalidAction", "Invalid game action request."));
      const { game, actor, sourceUuid } = resolveOwned(payload, expectedSession);
      const commands = commandsForSystem();
      if (commands.supportsCommand?.(name) !== true || typeof commands.execute !== "function") throw unavailable();
      const expected = { ...expectedSession, worldId: expectedSession.worldId ?? game.world.id,
        userId: expectedSession.userId ?? game.user.id,
        connectionGeneration: expectedSession.connectionGeneration ?? getConnectionGeneration() };
      const assertCurrent = () => {
        if (getGame() !== game) throw new CommandError("STALE_SESSION", localizeFoundry("MIKELANDIA_CONTROLS.Panels.SessionChanged", "The Foundry session changed."));
        assertSession(game, expected, getConnectionGeneration);
        if (typeof expected.isCurrent === "function" && expected.isCurrent() !== true) throw new CommandError("STALE_SESSION", localizeFoundry("MIKELANDIA_CONTROLS.Panels.ActionInactive", "This actor action is no longer active."));
        const current = resolveOwned({ actorSourceUuid: sourceUuid }, expected).actor;
        if (current !== actor) throw new CommandError("TARGET_MISSING", localizeFoundry("MIKELANDIA_CONTROLS.Panels.ActorChanged", "The selected actor changed while the action was open."));
        return current;
      };
      const key = commands.commandKey?.(name, sourceUuid, payload) ?? JSON.stringify([name, sourceUuid, payload.actionId, payload.resourceId]);
      if (inFlight.has(key)) throw new CommandError("COMMAND_BUSY", localizeFoundry("MIKELANDIA_CONTROLS.Character.CommandGateway.ThisActionIsAlreadyRunning", "This action is already running."));
      inFlight.add(key);
      const timing = name === ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION
        ? rollTiming?.begin?.({ actorSourceUuid: sourceUuid, actionId: payload.actionId }) : null;
      try {
        assertCurrent();
        const output = await commands.execute(name, payload, expected, observer, { game, actor, sourceUuid, assertCurrent, rollTiming: timing });
        assertCurrent();
        return output;
      } catch (error) {
        timing?.mark("failed");
        if (error instanceof CommandError) throw error;
        throw new CommandError("COMMAND_FAILED", error?.message ?? localizeFoundry("MIKELANDIA_CONTROLS.Character.CommandGateway.TheFoundryActionFailed", "The Foundry action failed."), { cause: error });
      } finally { timing?.finish(); inFlight.delete(key); }
    }
  });
}

function canOwn(actor, user) {
  if (!actor || !user) return false;
  try {
    if (typeof actor.testUserPermission === "function") return actor.testUserPermission(user, "OWNER");
    return Boolean(actor.isOwner && user.id === globalThis.game?.user?.id);
  } catch { return false; }
}

function assertSession(game, expected, getConnectionGeneration) {
  if (!game?.user || !game?.world) throw new CommandError("SESSION_UNAVAILABLE", localizeFoundry("MIKELANDIA_CONTROLS.Character.BiographyGateway.TheFoundrySessionIsNotReady", "The Foundry session is not ready."));
  if ((expected.worldId && expected.worldId !== game.world.id) || (expected.userId && expected.userId !== game.user.id)
    || (expected.connectionGeneration !== undefined && expected.connectionGeneration !== getConnectionGeneration())) {
    throw new CommandError("STALE_SESSION", localizeFoundry("MIKELANDIA_CONTROLS.Character.CommandGateway.TheConnectionChangedWhileThisActionWasRunning", "The connection changed while this action was running."));
  }
}
