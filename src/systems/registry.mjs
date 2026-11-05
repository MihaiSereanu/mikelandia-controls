import { dnd5eIntegration } from "./dnd5e/integration.mjs";
import { fallbackIntegration } from "./fallback/integration.mjs";
import { warhammerIntegration } from "./wfrp4e/integration.mjs";
import { shadowdarkIntegration } from "./shadowdark/integration.mjs";
import { swadeIntegration } from "./swade/integration.mjs";
import { intrigueIntegration } from "./honor-and-intrigue/integration.mjs";

/** Exact Foundry system IDs; actor shape never selects a rules integration. */
export function resolveSystemIntegration(systemId) {
  if (systemId === "dnd5e") return dnd5eIntegration;
  if (systemId === "wfrp4e") return warhammerIntegration;
  if (systemId === "shadowdark") return shadowdarkIntegration;
  if (systemId === "swade") return swadeIntegration;
  if (systemId === "honor-and-intrigue") return intrigueIntegration;
  return fallbackIntegration;
}

/** Composition runs before Foundry setup. Do not retain a pre-setup fallback. */
export function createSystemIntegrationResolver(getSystemId = () => globalThis.game?.system?.id) {
  let selected = null;
  return () => {
    if (selected) return selected;
    const systemId = getSystemId();
    if (!systemId) return fallbackIntegration;
    selected = resolveSystemIntegration(systemId);
    return selected;
  };
}
