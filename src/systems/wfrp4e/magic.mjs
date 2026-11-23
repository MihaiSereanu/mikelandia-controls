import { ownedWarhammerItem } from "./items.mjs";
import { CommandError } from "../../foundry/commands/command-error.mjs";
import { localizeFoundry } from "../../foundry/settings/localization.mjs";

/** Use the same prepared getters as the native spell expansion. */
export function warhammerSpellDetails(item) {
  const model = item.system;
  const details = [["Range", model.Range], ["Target", model.Target], ["Duration", model.Duration]];
  if (model.magicMissile?.value) details.push(["Magic Missile", `+${model.Damage}`]);
  else if (model.damage?.value || model.damage?.dice) details.push(["Damage", `${model.Damage ?? model.DamageString ?? ""}${model.damage.dice ? ` + ${model.damage.dice}` : ""}`]);
  return details.filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([label, value]) => `${localizeFoundry(label, label)}: ${value}`);
}

/** Native 10.1.2 lore is an array; templates coerce single entries. */
export function spellForActor(actor, id, context) {
  const item = ownedWarhammerItem(actor, id, "spell");
  try {
    const lore = item?.system?.lore?.value;
    const valid = context && Array.isArray(lore) && lore.length > 0 && lore.every(key => typeof key === "string" && key.length > 0);
    return valid && Number.isFinite(item.system.cn?.value) ? item : null;
  } catch { return null; }
}

/** Ask the native model for Winds using only spells this profile may expose. */
export function magicWinds(actor, context) {
  if (!context) return [];
  try {
    const channelling = actor.system.status.channelling;
    if (typeof channelling.getWinds !== "function" || !Number.isFinite(channelling.value)) return [];
    const spells = Array.from(actor.items?.contents ?? actor.items ?? []).filter(item => spellForActor(actor, String(item.id), context) === item);
    const winds = channelling.getWinds(spells);
    return Object.entries(winds).filter(([key, wind]) => /^[a-zA-Z0-9_!-]{1,128}$/u.test(key)
      && Object.hasOwn(channelling.winds ?? {}, key) && typeof wind?.label === "string" && wind.label.trim())
      .map(([key, wind]) => ({ key, label: wind.label }));
  } catch { return []; }
}

/** Native ingredient links belong to the spell; filter documents before reading labels. */
export function spellIngredients(actor, spell) {
  return Array.from(actor.items?.contents ?? actor.items ?? []).filter(item => {
    try {
      return /^[a-zA-Z0-9_-]{1,128}$/u.test(item.id) && ownedWarhammerItem(actor, String(item.id), "trapping") === item
        && item.system?.trappingType?.value === "ingredient" && item.system?.spellIngredient?.value === spell.id
        && Number.isSafeInteger(item.system?.quantity?.value) && item.system.quantity.value >= 0;
    } catch { return false; }
  });
}

export function ingredientEdits(actor, context) {
  return Array.from(actor.items?.contents ?? actor.items ?? []).flatMap(spell => {
    if (spellForActor(actor, String(spell.id), context) !== spell || spell.system.lore.value == "petty"
      || typeof spell.update !== "function" || typeof spell.system.currentIng?.value !== "string") return [];
    const ingredients = spellIngredients(actor, spell);
    const choices = [{ value: "", label: localizeFoundry("None", "None") },
      ...ingredients.map(item => ({ value: String(item.id), label: `${item.name} (${item.system.quantity.value})` }))];
    return [{ id: `ingredient:${spell.id}`, label: localizeFoundry("Ingredient", "Ingredient"), kind: "choice",
      value: spell.system.currentIng.value, choices, quantity: ingredients.find(item => item.id === spell.system.currentIng.value)?.system.quantity.value ?? null,
      revision: JSON.stringify([context.revision, spell.uuid ?? spell.id, spell._stats?.modifiedTime ?? null,
        ingredients.map(item => [item.id, item.uuid ?? item.id, item.system.quantity.value])]) }];
  });
}

export function selectedIngredient(actor, spell) {
  return spellIngredients(actor, spell).find(item => item.id === spell.system.currentIng?.value && item.system.quantity.value > 0) ?? null;
}

/** Companion casts spend once; native/script reductions stay authoritative. */
export async function consumeCastIngredient(actor, spell, captured, test, assertCurrent) {
  if (!captured || test.context?.reroll || test.context?.edited) return;
  const { item, quantity } = captured;
  try {
    assertCurrent();
    if (ownedWarhammerItem(actor, String(spell.id), "spell") !== spell || !spellIngredients(actor, spell).includes(item)) throw new Error("Ingredient changed");
    const current = item.system.quantity.value;
    // shortcut: any reduction counts as consumption; provenance needs a native consumption API.
    if (current < quantity) return;
    if (current !== quantity || spell.system.currentIng?.value !== item.id) throw new Error("Ingredient changed");
    if (!await item.update({ "system.quantity.value": current - 1 })) throw new Error("Ingredient update cancelled");
  } catch (cause) {
    throw new CommandError("INGREDIENT_NOT_SPENT", localizeFoundry("MIKELANDIA_CONTROLS.Panels.IngredientNotSpent",
      "The cast completed, but its ingredient could not be spent. Check the ingredient quantity before casting again."), { cause });
  }
}
