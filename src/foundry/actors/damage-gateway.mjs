import { actorSourceUuid, resolveActorSource } from "./character-source.mjs";
import { resolveSystemIntegration } from "../../systems/registry.mjs";

export function createFoundryDamageGateway({
  getIntegration = () => resolveSystemIntegration(globalThis.game?.system?.id),
  resolveActor = resolveActorSource
} = {}) {
  return Object.freeze({
    watch(scope, { getSource, isActive, onDamage, onReset }) {
      let source = "", baseline = null, enabled = false;
      const read = actor => {
        try {
          if (!actor || !(actor.testUserPermission?.(globalThis.game?.user, "OWNER") ?? actor.isOwner ?? false)) return null;
          return getIntegration().readDamageHealth?.(actor) ?? null;
        } catch { return null; }
      };
      const resolve = () => { try { return source ? resolveActor(source) : null; } catch { return null; } };
      const refresh = () => {
        const nextSource = getSource() ?? "", nextEnabled = Boolean(isActive());
        if (nextSource !== source || nextEnabled !== enabled) {
          source = nextSource; enabled = nextEnabled;
          baseline = enabled ? read(resolve()) : null;
          onReset();
        } else if (enabled && !read(resolve())) {
          baseline = null;
          onReset();
        }
      };
      scope.hook("updateActor", actor => {
        refresh();
        if (!enabled || actorSourceUuid(actor) !== source) return;
        const next = read(resolve());
        const previous = baseline;
        baseline = next;
        if (!next) { onReset(); return; }
        if (!previous) return;
        if (previous.value !== next.value) onReset();
        // Count net resource loss; replenishment in the same update offsets loss.
        const amount = previous.value + previous.temp - next.value - next.temp;
        if (Number.isFinite(amount) && amount > 0) onDamage({ amount, noun: next.noun, down: previous.value > 0 && next.value <= 0 });
      });
      scope.own(() => { baseline = null; onReset(); });
      refresh();
      return Object.freeze({ refresh });
    }
  });
}
