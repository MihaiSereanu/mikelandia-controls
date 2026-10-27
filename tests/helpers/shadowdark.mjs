import { createActor, createGame, createHooks, collection } from "./foundry.mjs";

export function createShadowdarkFixture({ pulp = false } = {}) {
  const hooks = createHooks(), calls = [], rolls = [], writes = [], lights = [];
  const settings = { usePulpMode: pulp, autoConsumeAmmunition: true, rollDamage: true, trackLightSources: true };
  const actor = createActor({ type: "Player", name: "Mara", system: {
    attributes: { hp: { value: 7, max: 12 }, ac: { value: 14 } },
    abilities: Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((key, index) => [key, { value: 14 - index, mod: 2 - index }])),
    level: { xp: 8 }, coins: { gp: 0, sp: 0, cp: 0 }, luck: { available: true, remaining: 2 }, isSpellCaster: true, class: "Item.class", spellcasting: { classes: ["wizard"] }
  } });
  const physical = { isPhysical: true, isIdentified: true, stashed: false, quantity: 1, slots: { per_slot: 20 } };
  actor.items = collection([
    { id: "sword", type: "Weapon", name: "Sword", system: { ...physical, equipped: true, isWeapon: true, type: "melee", isThrown: false, handedness: "1h", subtext: "Melee • Close • 1d8" } },
    { id: "dagger", type: "Weapon", name: "Dagger", system: { ...physical, equipped: true, isWeapon: true, type: "melee", isThrown: true, handedness: "1h", subtext: "Melee • Close • 1d4" } },
    { id: "spell", type: "Spell", name: "Magic Missile", system: { isSpell: true, tier: 1, lost: false, class: ["Item.class"], duration: { type: "instant", value: 0 } } },
    { id: "lost", type: "Spell", name: "Sleep", system: { isSpell: true, tier: 1, lost: true } },
    { id: "torch", type: "Basic", name: "Torch", system: { ...physical, light: { isSource: true, active: false, remainingSecs: 3600 } } },
    { id: "secret", type: "Basic", name: "Secret Relic", system: { ...physical, isIdentified: false } }
  ]);
  for (const item of actor.items) { item.parent = actor; item.uuid = `${actor.uuid}.Item.${item.id}`; }
  const game = createGame([actor], "shadowdark");
  game.settings.get = (_namespace, key) => settings[key] ?? false;
  game.user.character = actor;
  game.shadowdark = { lightSourceTracker: { toggleLightSource: (...args) => lights.push(args) } };
  const fixture = { actor, game, hooks, calls, rolls, writes, lights, settings, prompt: async () => true, success: true, error: false };
  const native = kind => async (target, config) => {
    calls.push({ kind, target, config, receiver: actor.system });
    config.actorUuid = actor.uuid;
    if (kind === "stat") config.check = { stat: target };
    else config.itemUuid = target;
    if (kind === "spell") config.cast = { spellUuid: target };
    if (!await fixture.prompt(kind, target, config)) return false;
    const hook = kind === "stat" ? "SD-Stat-Check" : kind === "spell" ? "SD-Player-Spell" : "SD-Player-Attack";
    if (!hooks.call(hook, config)) return false;
    if (fixture.error) throw new Error("native roll failure");
    rolls.push({ kind, target });
    if (kind === "spell" && !fixture.success) {
      const spell = actor.items.find(item => item.uuid === target);
      spell.system.lost = true;
      hooks.emit("updateItem", spell, {});
    }
    return fixture.success;
  };
  actor.system.rollStatCheck = native("stat"); actor.system.rollAttack = native("attack"); actor.system.castSpell = native("spell");
  actor.update = async (...args) => {
    writes.push(args);
    for (const [path, value] of Object.entries(args[0])) {
      const keys = path.split(".");
      keys.slice(0, -1).reduce((value, key) => value[key] ??= {}, actor)[keys.at(-1)] = value;
    }
    hooks.emit("updateActor", actor, args[0]);
    return actor;
  };
  actor.updateEmbeddedDocuments = async (_type, updates) => {
    for (const update of updates) {
      const item = actor.items.get(update._id);
      item.system.quantity = update["system.quantity"];
      hooks.emit("updateItem", item, update);
    }
    return updates;
  };
  actor.deleteEmbeddedDocuments = async (_type, ids) => ids.map(id => {
    const item = actor.items.get(id);
    actor.items.splice(actor.items.indexOf(item), 1);
    hooks.emit("deleteItem", item, {});
    return item;
  });
  actor.createEmbeddedDocuments = async (_type, records) => records.map(record => {
    const id = `new${actor.items.length}`;
    const item = { ...record, id, parent: actor, uuid: `${actor.uuid}.Item.${id}`,
      system: { ...physical, ...record.system } };
    if (hooks.call("preCreateItem", item, record, {}, game.user.id) === false) return null;
    actor.items.push(item); hooks.emit("createItem", item, {}); return item;
  }).filter(Boolean);
  actor.isClaimedByUser = async () => true;
  actor.sheet = { actor, async _onDropItemSD(_event, data) { return actor.createEmbeddedDocuments("Item", [{ name: data.uuid, type: "Basic", system: {} }]); }, async _toggleLightSource(item) {
    item.system.light.active = !item.system.light.active;
    game.shadowdark.lightSourceTracker.toggleLightSource(actor, item);
    hooks.emit("updateItem", item, {});
  } };
  return fixture;
}
