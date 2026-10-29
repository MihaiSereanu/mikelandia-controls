import { createActor, createGame } from "./foundry.mjs";

export function createWarhammerWeapon({ id = "sword", name = "Sword", mode = "melee", damage = 7, equipped = true, ...overrides } = {}) {
  return { id, name, type: "weapon", system: { isEquipped: equipped, isMelee: mode === "melee", isRanged: mode === "ranged",
    DamageString: damage, currentAmmo: { value: "ammo" }, loaded: { value: true, amt: 1 } }, ...overrides };
}

export function createWarhammerActor(overrides = {}) {
  const actor = createActor({
    name: "Elsa Becker", type: "character",
    system: {
      characteristics: Object.fromEntries(["ws", "bs", "s", "t", "i", "ag", "dex", "int", "wp", "fel"]
        .map((key, index) => [key, { value: 41 + index, initial: 10, advances: 0, modifier: 0 }])),
      status: { wounds: { value: 9, max: 13 }, fortune: { value: 0 }, fate: { value: 2 },
        resolve: { value: 1 }, resilience: { value: 3 }, corruption: { value: 2, max: 7 },
        advantage: { value: 4 }, momentum: true, encumbrance: { current: "4.50", max: 8, state: 0.5625 } }
    },
    items: [
      { id: "athletics", name: "Athletics", type: "skill", system: { advanced: { value: "bsc" }, grouped: { value: "noSpec" }, total: { value: 54 } } },
      { id: "language", name: "Language (Magick)", type: "skill", system: { advanced: { value: "adv" }, grouped: { value: "isSpec" }, total: { value: 62 } } },
      { id: "melee", name: "Melee (Basic)", type: "skill", system: { advanced: { value: "bsc" }, grouped: { value: "isSpec" }, total: { value: 49 } } },
      { id: "parent", name: "Language", type: "skill", system: { advanced: { value: "bsc" }, grouped: { value: "grouped" }, total: { value: 0 } } },
      { id: "hidden", name: "Hidden Skill", type: "skill", visible: false, system: { advanced: { value: "bsc" }, grouped: { value: "noSpec" }, total: { value: 99 } } },
      createWarhammerWeapon(),
      createWarhammerWeapon({ id: "handgun", name: "Handgun", mode: "ranged", damage: "8+ 1d10" }),
      { id: "weapon", name: "Unidentified Weapon", type: "weapon", get system() { throw new Error("weapon data must not be read"); } }
    ],
    ...overrides
  });
  for (const item of actor.items) item.parent ??= actor;
  return actor;
}

export function createWarhammerGame(actors, { use5e = false, groupAdvantage = false } = {}) {
  const game = createGame(actors, "wfrp4e");
  game.settings.get = (namespace, key) => namespace === "wfrp4e"
    ? key === "editionSettings" ? { use5e } : key === "useGroupAdvantage" ? groupAdvantage : undefined
    : undefined;
  return game;
}

export function addWarhammerMagic(actor, use5e) {
  for (const [id, lore] of [["petty", "petty"], ["lore", "fire"]]) actor.items.push({ id, name: id === "petty" ? "Light" : "Bolt", type: "spell", parent: actor,
    system: { lore: { value: [lore] }, cn: { value: id === "petty" ? 0 : 4 } } });
  actor.system.status.channelling = { wind: "aqshy", value: 3, winds: { aqshy: { label: "Aqshy" } },
    getWinds(spells) { return spells.some(spell => spell.system.lore.value.includes("fire")) ? { aqshy: { label: "Aqshy" } } : {}; } };
}

/** Minimal native condition fixture; real WFRP rules remain outside this harness. */
export function addWarhammerConditions(actor, game, hooks = null) {
  game.wfrp4e = { config: { statusEffects: [
    ["bleeding", true], ["poisoned", true], ["ablaze", true], ["deafened", true], ["stunned", true],
    ["entangled", true], ["fatigued", true], ["blinded", true], ["broken", true], ["prone", false],
    ["besmirched", false], ["surprised", false], ["unconscious", false], ["grappling", false], ["engaged", false], ["dead", false]
  ].map(([id, numbered]) => ({ id, name: id[0].toUpperCase() + id.slice(1), system: { condition: { numbered } } })) } };
  const calls = [];
  actor.hasCondition = id => actor.effects.find(effect => effect.conditionId === id);
  actor.addCondition = async (id, value) => {
    calls.push(["add", id, value]);
    let effect = actor.hasCondition(id);
    if (!effect) {
      effect = { id: `effect-${id}`, uuid: `${actor.uuid}.ActiveEffect.effect-${id}`, parent: actor,
        conditionId: id, name: id, conditionValue: 0, manualScripts: id === "bleeding" ? [{ label: "Apply Bleeding", execute: async context => { calls.push(["apply", context.actor]); } }] : [] };
      actor.effects.push(effect);
    }
    effect.conditionValue += value;
    hooks?.emit("updateActor", actor, {});
  };
  actor.removeCondition = async (id, value) => {
    calls.push(["remove", id, value]);
    const effect = actor.hasCondition(id);
    effect.conditionValue -= value;
    if (!effect.conditionValue) actor.effects.splice(actor.effects.indexOf(effect), 1);
    hooks?.emit("updateActor", actor, {});
  };
  return calls;
}
