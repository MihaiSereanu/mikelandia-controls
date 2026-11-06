import { healthStatus } from "./combat-health.mjs";

/** Party reads are independent of the owned Character directory. */
export function readParty(integration, actors, user) {
  if (!integration.party) return null;
  const members = Array.from(actors?.contents ?? actors ?? []).flatMap(actor => {
    try {
      if (actor.isToken || !integration.party.isPC(actor) || !user
        || (!user.isGM && actor.testUserPermission?.(user, "OBSERVER") !== true)) return [];
      const health = integration.readCombatHealth(actor);
      return [Object.freeze({ id: String(actor.id), sourceUuid: String(actor.uuid), name: String(actor.name), img: String(actor.img ?? ""),
        health: health ? { ...health, status: healthStatus(health) } : null,
        ...integration.party.readMember(actor, user) })];
    } catch { return []; }
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return Object.freeze({ supplies: integration.party.supplies === true, members: Object.freeze(members) });
}

