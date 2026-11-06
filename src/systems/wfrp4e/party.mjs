import { readWarhammerConditions } from "./effects.mjs";

export const warhammerParty = Object.freeze({
  isPC: actor => actor.type === "character",
  readMember(actor) {
    return { conditions: readWarhammerConditions(actor, globalThis.game, { includeMarkers: true }).filter(condition => condition.active)
      .map(({ id, label, numbered, value, description }) => ({ id, label, numbered, value,
        ...(description ? { description } : {}) })),
    injuries: Array.from(actor.items?.contents ?? actor.items ?? []).filter(item => item.parent === actor
      && item.visible !== false && ["injury", "critical"].includes(item.type))
      .map(item => ({ id: String(item.id), name: String(item.name), type: item.type })) };
  }
});
