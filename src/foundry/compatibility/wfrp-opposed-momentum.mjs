import { readWarhammerContext } from "../../systems/wfrp4e/context.mjs";
import { localizeFoundry } from "../settings/localization.mjs";

export const MOMENTUM_QUERY = "mikelandia-controls.opposedMomentum";
const FIELD = "system.status.momentum";

/** Repair native 5e opposed writes without granting general actor-update access. */
export function installWfrpOpposedMomentum(scope, {
  game = globalThis.game, config = globalThis.CONFIG,
  is5e = () => readWarhammerContext(game)?.use5e === true,
  report = error => globalThis.ui?.notifications?.error(localizeFoundry(
    "MIKELANDIA_CONTROLS.Interface.OpposedMomentum.Failed",
    "The opposed roll completed, but Momentum could not be updated: {reason}", { reason: error.message }))
} = {}) {
  if (game?.system?.id !== "wfrp4e") return false;
  const handlerPrototype = game.wfrp4e?.opposedHandler?.prototype;
  const actorPrototype = game.wfrp4e?.documents?.ActorWFRP4e?.prototype;
  if (!handlerPrototype?.computeOpposeResult || !actorPrototype?.update || !config?.queries) return false;
  if (Object.hasOwn(config.queries, MOMENTUM_QUERY)) return false;

  const originalCompute = handlerPrototype.computeOpposeResult;
  const originalUpdate = actorPrototype.update;
  const hadOwnUpdate = Object.hasOwn(actorPrototype, "update");
  const completed = new Set();
  let current = null, queue = Promise.resolve();

  const query = async (request, { user } = {}) => {
    if (!game.user?.isGM || !is5e() || !user?.active) throw new Error("Momentum request is unavailable.");
    if (!request || Object.keys(request).sort().join(",") !== "actorUuid,handlerId,resultId,value"
      || typeof request.value !== "boolean") throw new Error("Invalid Momentum request.");
    const handlerMessage = game.messages.get(request.handlerId);
    const handler = handlerMessage?.system?.opposedHandler;
    const resultMessage = game.messages.get(request.resultId);
    if (handlerMessage?.type !== "handler" || resultMessage?.type !== "opposed"
      || !handler || handler.data.resultMessageId !== request.resultId
      || resultMessage?.system?.handlerId !== request.handlerId) throw new Error("The opposed result is no longer current.");
    const opposed = resultMessage.system.opposedTest;
    const tests = [opposed?.attackerTest, opposed?.defenderTest];
    if (!tests.some(test => test?.actor?.testUserPermission(user, "OWNER"))) {
      throw new Error("The requester does not own a participant in this opposed test.");
    }
    for (const [index, test] of tests.entries()) {
      const id = index === 0 ? handler.data.attackerMessageId : handler.data.defenderMessageId;
      if (!id && index === 1 && test?.context?.unopposed && handler.defender?.uuid === test.actor?.uuid) continue;
      const message = game.messages.get(id);
      const original = message?.system?.test;
      if (message?.type !== "test5e" || !original?.e5 || test?.context?.messageId !== id
        || original.actor?.uuid !== test.actor?.uuid || original.item?.id !== test.item?.id
        || !original.actor?.testUserPermission(message.author, "OWNER")
        || (!original.actor.testUserPermission(user, "OWNER")
          && !original.context?.opposedMessageIds?.includes(request.handlerId))) {
        throw new Error("The opposed result is not linked to authorized participant rolls.");
      }
    }
    // Use persisted native results and native actor resolution, including token deltas.
    const index = tests.findIndex(test => test?.actor?.uuid === request.actorUuid);
    const winner = opposed?.result?.winner;
    if (index < 0 || !["attacker", "defender"].includes(winner)) throw new Error("Invalid opposed participant.");
    const test = tests[index];
    const won = (index === 0 ? "attacker" : "defender") === winner;
    if (!test.item?.system?.isMelee || request.value !== won || (won && !test.actor.inCombat)) {
      throw new Error("Momentum does not match the native opposed result.");
    }
    const key = `${request.resultId}:${request.actorUuid}:${request.value}`;
    if (completed.has(key)) return true;
    // Reserve before awaiting so duplicate requests cannot write twice.
    completed.add(key);
    try {
      await test.actor.update({ [FIELD]: request.value });
    } catch (error) {
      completed.delete(key);
      throw error;
    }
    if (completed.size > 1000) completed.delete(completed.values().next().value);
    return true;
  };

  async function update(data, ...args) {
    if (!current || !is5e() || game.user.isGM || this.isOwner
      || !current.actors.has(this.uuid) || !data || Object.keys(data).length !== 1
      || typeof data[FIELD] !== "boolean") return originalUpdate.call(this, data, ...args);
    current.writes.set(this.uuid, data[FIELD]);
    // Native Momentum scripts do not await their writes. Flush after the result
    // is persisted, allowing the GM to validate it rather than trusting a payload.
    return this;
  }

  function compute(...args) {
    if (!is5e() || game.user.isGM) return originalCompute.apply(this, args);
    const handler = this;
    const run = async () => {
      const context = { actors: new Set([handler.attacker?.uuid, handler.defender?.uuid].filter(Boolean)), writes: new Map() };
      current = context;
      let result;
      try { result = await originalCompute.apply(handler, args); }
      finally { current = null; }
      for (const [actorUuid, value] of context.writes) {
        try {
          const gm = game.users.activeGM;
          if (!gm?.active) throw new Error(localizeFoundry(
            "MIKELANDIA_CONTROLS.Interface.OpposedMomentum.NoGM", "An active GM is required."));
          await gm.query(MOMENTUM_QUERY, {
            handlerId: handler.message.id, resultId: handler.data.resultMessageId, actorUuid, value
          }, { timeout: 10000 });
        } catch (error) { report(error); }
      }
      return result;
    };
    // Keep participant tracking unambiguous when several rolls finish together.
    const pending = queue.then(run);
    queue = pending.catch(() => {});
    return pending;
  }

  config.queries[MOMENTUM_QUERY] = query;
  actorPrototype.update = update;
  handlerPrototype.computeOpposeResult = compute;
  scope.own(() => {
    if (config.queries[MOMENTUM_QUERY] === query) delete config.queries[MOMENTUM_QUERY];
    if (handlerPrototype.computeOpposeResult === compute) handlerPrototype.computeOpposeResult = originalCompute;
    if (actorPrototype.update === update) {
      if (hadOwnUpdate) actorPrototype.update = originalUpdate;
      else delete actorPrototype.update;
    }
    current = null;
  });
  return true;
}
