import { ACTOR_COMMANDS } from "../../kernel/state/command-names.mjs";
import { CommandError } from "../../foundry/commands/command-error.mjs";
import { fallbackIntegration } from "../fallback/integration.mjs";
import { readWarhammerContext } from "./context.mjs";

export const WARHAMMER_CATALOGUE = "world.wfrp5-consumers-guide";
const physicalTypes = new Set(["weapon", "armour", "ammunition", "trapping", "container", "money"]);
const fail = (code, message) => new CommandError(code, message);
const readable = (pack, user) => pack?.documentName === "Item" && pack.visible === true
  && (typeof pack.testUserPermission !== "function" || pack.testUserPermission(user, "OBSERVER"));

export function warhammerInventoryAvailable(actor, game, user = game?.user) {
  return !!readWarhammerContext(game) && actor?.type === "character" && fallbackIntegration.isActorEligible(actor, user)
    && typeof actor.createEmbeddedDocuments === "function";
}

export async function executeWarhammerInventory(name, payload, { actor, assertCurrent, sourceUuid }, game) {
  if (!warhammerInventoryAvailable(actor, game)) throw fail("CAPABILITY_UNAVAILABLE", "Trapping creation is unavailable for this character.");
  const keys = ["actorSourceUuid", "actorId", ...(name === ACTOR_COMMANDS.ADD_PROFILE_ITEM ? ["itemUuid", "name", "quantity", "encumbrance", "price", "description"] : [])];
  if (Object.keys(payload).some(key => !keys.includes(key))) throw fail("INVALID_INPUT", "Invalid trapping request.");
  const check = () => {
    assertCurrent();
    if (!warhammerInventoryAvailable(actor, game)) throw fail("CAPABILITY_UNAVAILABLE", "Trapping creation is no longer available.");
  };
  if (name === ACTOR_COMMANDS.LIST_PROFILE_ITEMS || payload.itemUuid !== undefined) {
    const pack = game.packs?.get?.(WARHAMMER_CATALOGUE);
    if (!readable(pack, game.user)) throw fail("CAPABILITY_UNAVAILABLE", "The trapping catalogue is unavailable or you do not have access.");
    const index = await pack.getIndex({ fields: ["type"] });
    check();
    if (game.packs?.get?.(WARHAMMER_CATALOGUE) !== pack || !readable(pack, game.user)) throw fail("FORBIDDEN", "Catalogue access changed.");
    const items = Array.from(index?.contents ?? index ?? []).filter(item => physicalTypes.has(item.type)).map(item => ({
      uuid: `Compendium.${WARHAMMER_CATALOGUE}.${item._id ?? item.id}`, name: String(item.name), source: pack.title ?? WARHAMMER_CATALOGUE
    })).sort((a, b) => a.name.localeCompare(b.name));
    if (name === ACTOR_COMMANDS.LIST_PROFILE_ITEMS) return { ok: true, items };
    if (typeof payload.itemUuid !== "string" || Object.keys(payload).some(key => !["actorSourceUuid", "actorId", "itemUuid"].includes(key))
      || !items.some(item => item.uuid === payload.itemUuid)) throw fail("INVALID_INPUT", "Choose an item from the trapping catalogue.");
    const id = payload.itemUuid.split(".").at(-1);
    const item = await pack.getDocument(id);
    check();
    if (game.packs?.get?.(WARHAMMER_CATALOGUE) !== pack || !readable(pack, game.user) || !item || item.visible === false
      || !physicalTypes.has(item.type) || String(item.id) !== id
      || (typeof item.testUserPermission === "function" && !item.testUserPermission(game.user, "OBSERVER"))) throw fail("FORBIDDEN", "This catalogue item is no longer available.");
    const data = item.toObject();
    delete data._id;
    const created = await actor.createEmbeddedDocuments("Item", [data]);
    return { ok: true, actorSourceUuid: sourceUuid, cancelled: !created?.length };
  }
  if (typeof payload.name !== "string" || !payload.name.trim() || payload.name.trim().length > 200
    || !Number.isSafeInteger(payload.quantity) || payload.quantity < 0
    || typeof payload.encumbrance !== "number" || !Number.isFinite(payload.encumbrance) || payload.encumbrance < 0
    || !payload.price || Object.keys(payload.price).some(key => !["gc", "ss", "bp"].includes(key))
    || ["gc", "ss", "bp"].some(key => !Number.isSafeInteger(payload.price[key]) || payload.price[key] < 0)
    || typeof payload.description !== "string" || payload.description.length > 100000) throw fail("INVALID_INPUT", "Enter a name, nonnegative quantity, encumbrance and coin amounts, and a description.");
  check();
  const created = await actor.createEmbeddedDocuments("Item", [{ name: payload.name.trim(), type: "trapping", system: {
    trappingType: { value: "misc" }, quantity: { value: payload.quantity }, encumbrance: { value: payload.encumbrance },
    price: { ...payload.price }, description: { value: payload.description }
  } }]);
  return { ok: true, actorSourceUuid: sourceUuid, cancelled: !created?.length };
}
