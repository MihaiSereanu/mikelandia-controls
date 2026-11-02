import { createActor, createGame, createHooks, collection } from "./foundry.mjs";

export function createShadowdarkFixture({ pulp = false, specialAbilities = false } = {}) {
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
    { id: "spell", type: "Spell", name: "Magic Missile", system: { isSpell: true, tier: 1, lost: false, class: ["Item.class"], duration: { type: "instant", value: 0 }, description: '<p>Native <strong>missile text</strong></p><ul><li>Spell effect</li></ul><script>bad()</script><div class="secret">GM spell secret</div>' } },
    { id: "lost", type: "Spell", name: "Sleep", system: { isSpell: true, tier: 1, lost: true, description: '<p>Native sleep text</p>' } },
    { id: "torch", type: "Basic", name: "Torch", system: { ...physical, light: { isSource: true, active: false, remainingSecs: 3600 } } },
    { id: "secret", type: "Basic", name: "Secret Relic", system: { ...physical, isIdentified: false } }
  ]);
  if (specialAbilities) actor.items.push({ id: "ability", type: "Class Ability", name: "Battle Cry", system: {
    isAbility: true, group: "Warrior", description: '<p>Native <strong>ability text</strong></p><div class="secret">GM ability secret</div>',
    limitedUses: true, uses: { available: 2, max: 3 }, lost: false, loseOnFailure: true,
    get subtext() { return `${this.group} • ${this.uses.available} / ${this.uses.max}`; }
  } });
  for (const item of actor.items) if (["Weapon", "Armor"].includes(item.type)) item.system.canBeEquipped = true;
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
    else config.itemUuid ??= target;
    if (kind === "spell") config.cast = { spellUuid: target };
    if (!await fixture.prompt(kind, target, config)) return false;
    const hook = kind === "stat" ? "SD-Stat-Check" : kind === "spell" ? "SD-Player-Spell" : kind === "ability" ? "SD-Player-classAbility" : "SD-Player-Attack";
    if (!hooks.call(hook, config)) return false;
    if (fixture.error) throw new Error("native roll failure");
    if (kind === "ability") {
      const ability = actor.items.find(item => item.uuid === target);
      if (ability.system.lost || (ability.system.limitedUses && ability.system.uses.available <= 0)) return false;
      if (ability.system.limitedUses) ability.system.uses.available--;
      if (!fixture.success && ability.system.loseOnFailure) ability.system.lost = true;
      hooks.emit("updateItem", ability, {});
    }
    rolls.push({ kind, target });
    if (kind === "spell") {
      const source = actor.items.find(item => item.uuid === config.itemUuid);
      if (source?.type === "Scroll") await actor.deleteEmbeddedDocuments("Item", [source.id]);
      else if (!fixture.success) {
        if (source?.type === "Wand") source.system.spells.find(link => link.uuid === target).lost = true;
        else source.system.lost = true;
        hooks.emit("updateItem", source, {});
      }
    }
    return fixture.success;
  };
  actor.system.rollStatCheck = native("stat"); actor.system.rollAttack = native("attack"); actor.system.castSpell = native("spell"); actor.system.useAbility = native("ability");
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
      for (const [path, value] of Object.entries(update)) {
        if (path === "_id") continue;
        const keys = path.split(".");
        keys.slice(0, -1).reduce((value, key) => value[key] ??= {}, item)[keys.at(-1)] = value;
      }
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
  actor.sheet = { actor, async _onToggleEquipped(event) {
    event.preventDefault();
    const item = actor.items.get(event.currentTarget.dataset.itemId);
    return actor.updateEmbeddedDocuments("Item", [{ _id: item.id, "system.equipped": !item.system.equipped, "system.stashed": false }]);
  }, async _onDropItemSD(_event, data) { return actor.createEmbeddedDocuments("Item", [{ name: data.uuid, type: "Basic", system: {} }]); }, async _toggleLightSource(item) {
    item.system.light.active = !item.system.light.active;
    game.shadowdark.lightSourceTracker.toggleLightSource(actor, item);
    hooks.emit("updateItem", item, {});
  } };
  return fixture;
}
