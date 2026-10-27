import { ACTOR_COMMANDS } from "../../kernel/command-names.mjs";
import { CommandError } from "../../foundry/command-error.mjs";
import { localizeFoundry } from "../../foundry/localization.mjs";
import { isShadowdarkPlayer, shadowdarkContext, ownedItem, carriedItem, stashedItem, physicalTypes } from "./context.mjs";

const fail = (code, message) => new CommandError(code, localizeFoundry(`VEMOBILE.Inventory.${code}`, message));
const values = source => Array.from(source?.contents ?? source ?? []);
export function inventoryAvailable(actor, game, user = game?.user) {
  return !!shadowdarkContext(game) && isShadowdarkPlayer(actor, user)
    && typeof actor.createEmbeddedDocuments === "function" && typeof actor.sheet?._onDropItemSD === "function";
}
export function inventoryEdits(actor, game, user = game?.user) {
  if (!shadowdarkContext(game) || !isShadowdarkPlayer(actor, user) || typeof actor.updateEmbeddedDocuments !== "function") return [];
  return values(actor.items).flatMap(item => {
    if (!carriedItem(item, actor) && !stashedItem(item, actor)) return [];
    const value = item.system.quantity;
    if (!Number.isSafeInteger(value) || value < 0) return [];
    return [{ id: `quantity:${item.id}`, kind: "integer", min: 0, max: Number.MAX_SAFE_INTEGER, value,
      revision: JSON.stringify([shadowdarkContext(game).revision, item.uuid, item.type, item.system.slots?.per_slot, item.system.slots?.slots_used, item.system.stashed]) }];
  });
}
function readable(item, game) {
  return item && !item.parent && physicalTypes.includes(item.type) && item.visible !== false
    && (typeof item.testUserPermission !== "function" || item.testUserPermission(game.user, "OBSERVER"));
}
async function catalog(game, assertCurrent) {
  const rows = values(game.items).filter(item => readable(item, game)).map(item => ({ uuid: item.uuid, name: item.name, source: "World" }));
  const unavailable = [];
  for (const pack of values(game.packs)) {
    assertCurrent();
    if (pack.documentName !== "Item" || !pack.visible) continue;
    try {
      const index = await pack.getIndex({ fields: ["type"] });
      assertCurrent();
      // Recheck visibility after loading the pack index.
      if (!pack.visible) continue;
      for (const item of values(index)) if (physicalTypes.includes(item.type)) rows.push({
        uuid: `Compendium.${pack.collection}.${item._id ?? item.id}`, name: String(item.name), source: pack.title ?? pack.metadata?.label ?? pack.collection
      });
    } catch (error) { assertCurrent(); unavailable.push(pack.title ?? pack.collection); }
  }
  return { ok: true, items: rows.sort((a, b) => a.name.localeCompare(b.name)), unavailable };
}
export async function executeInventory(name, payload, context, game) {
  const { actor, assertCurrent, sourceUuid } = context;
  const keys = name === ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE
    ? ["resourceId", "resourceRevision", "expectedValue", "value"]
    : name === ACTOR_COMMANDS.LIST_PROFILE_ITEMS ? [] : ["itemUuid", "name", "slotsUsed", "perQuantity"];
  if (Object.keys(payload).some(key => !["actorSourceUuid", "actorId", ...keys].includes(key))) throw fail("INVALID_INPUT", "Invalid inventory request.");
  if (name === ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE) {
    const edit = inventoryEdits(actor, game).find(edit => edit.id === payload.resourceId);
    if (!edit) throw fail("CAPABILITY_UNAVAILABLE", "This item can no longer be changed.");
    if (payload.resourceRevision !== edit.revision || payload.expectedValue !== edit.value) throw fail("STALE_STATE", "The item changed. Reopen the quantity editor.");
    if (!Number.isSafeInteger(payload.value) || payload.value < 0) throw fail("INVALID_INPUT", "Enter a nonnegative whole-number quantity.");
    assertCurrent();
    const item = ownedItem(actor, payload.resourceId.slice(9));
    if (!item) throw fail("CAPABILITY_UNAVAILABLE", "This item can no longer be changed.");
    if (payload.value === 0) {
      if (typeof actor.deleteEmbeddedDocuments !== "function") throw fail("CAPABILITY_UNAVAILABLE", "This item cannot be removed.");
      await actor.deleteEmbeddedDocuments("Item", [item.id]);
      return { ok: true, actorSourceUuid: sourceUuid };
    }
    if (payload.value !== edit.value) await actor.updateEmbeddedDocuments("Item", [{ _id: item.id, "system.quantity": payload.value }]);
    return { ok: true, actorSourceUuid: sourceUuid };
  }
  if (!inventoryAvailable(actor, game)) throw fail("CAPABILITY_UNAVAILABLE", "Item acquisition is unavailable for this character.");
  if (name === ACTOR_COMMANDS.LIST_PROFILE_ITEMS) return catalog(game, assertCurrent);
  if (payload.itemUuid !== undefined) {
    if (typeof payload.itemUuid !== "string" || payload.name !== undefined || payload.slotsUsed !== undefined || payload.perQuantity !== undefined) throw fail("INVALID_INPUT", "Choose an item from the catalog.");
    // A fresh catalog enforces pack/world visibility and excludes actor-owned sources.
    const available = await catalog(game, assertCurrent);
    if (!available.items.some(item => item.uuid === payload.itemUuid)) throw fail("FORBIDDEN", "This catalog item is no longer available.");
    const item = await globalThis.fromUuid(payload.itemUuid);
    assertCurrent();
    if (!readable(item, game) || item.system?.isPhysical !== true) throw fail("FORBIDDEN", "This catalog item is no longer available.");
    if (item.pack && !game.packs?.get?.(item.pack)?.visible) throw fail("FORBIDDEN", "This catalog item is no longer available.");
    const sheet = actor.sheet, data = { type: "Item", uuid: item.uuid };
    const revision = item._stats?.modifiedTime;
    const checkpoint = () => {
      assertCurrent();
      if (actor.sheet !== sheet || !readable(item, game) || item._stats?.modifiedTime !== revision
        || (!item.pack && game.items?.get?.(item.id) !== item) || (item.pack && !game.packs?.get?.(item.pack)?.visible)) {
        throw fail("STALE_STATE", "The character or catalog item changed. Try adding the item again.");
      }
    };
    checkpoint();
    // Native 4.0.6's ordinary branch starts super._onDropItem without returning
    // its promise. Await that inherited implementation explicitly so the command
    // lock and pre-create guard cover the complete acquisition.
    const PlayerSheet = globalThis.shadowdark?.sheets?.PlayerSheetSD;
    const inheritedDrop = PlayerSheet && sheet instanceof PlayerSheet ? Object.getPrototypeOf(PlayerSheet.prototype)?._onDropItem : null;
    let veto, created = false;
    const hooks = globalThis.Hooks;
    const guard = document => {
      if (document.parent !== actor) return;
      try { checkpoint(); } catch (error) { veto = error; return false; }
      created = true;
    };
    const hookId = hooks?.on?.("preCreateItem", guard);
    try {
      if (typeof inheritedDrop === "function") {
        if (await sheet._effectDropNotAllowed(data)) return { ok: true, cancelled: true, actorSourceUuid: sourceUuid };
        checkpoint();
        if (item.effects?.size > 0 || item.effects?.contents?.length > 0) {
          const itemData = await globalThis.shadowdark.effects.createItemWithEffect(item);
          checkpoint();
          if (!itemData) return { ok: true, cancelled: true, actorSourceUuid: sourceUuid };
          await actor.createEmbeddedDocuments("Item", [itemData]);
        } else await inheritedDrop.call(sheet, { preventDefault() {} }, data);
      } else {
        // Alternate sheets must provide an awaitable native acquisition handler.
        await sheet._onDropItemSD({ preventDefault() {} }, data);
        created = true;
      }
      if (veto) throw veto;
      return { ok: true, actorSourceUuid: sourceUuid, nativeHandled: true, cancelled: !created };
    } finally { if (hookId !== undefined) hooks.off("preCreateItem", hookId); }
  }
  if (typeof payload.name !== "string" || !payload.name.trim() || payload.name.trim().length > 200) throw fail("INVALID_INPUT", "Enter an item name of up to 200 characters.");
  const slotsUsed = payload.slotsUsed === undefined ? 1 : payload.slotsUsed;
  const perQuantity = payload.perQuantity === undefined ? 1 : payload.perQuantity;
  if (!Number.isSafeInteger(slotsUsed) || slotsUsed < 0 || !Number.isSafeInteger(perQuantity) || perQuantity < 1) throw fail("INVALID_INPUT", "Use whole numbers: slots at least 0 and per quantity at least 1.");
  assertCurrent();
  const created = await actor.createEmbeddedDocuments("Item", [{ name: payload.name.trim(), type: "Basic",
    system: { quantity: 1, slots: { slots_used: slotsUsed, per_slot: perQuantity, free_carry: 0 } } }]);
  return { ok: true, actorSourceUuid: sourceUuid, cancelled: !created?.length };
}
