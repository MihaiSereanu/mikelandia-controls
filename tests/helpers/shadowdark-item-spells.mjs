export function addItemSpells(f) {
  const spells = [
    { id: "lightItem", uuid: "Compendium.test.spells.Item.light", type: "Spell", name: "Light", system: { isSpell: true, tier: 1, lost: false, description: "<p>A bright <strong>light</strong>.</p>" } },
    { id: "sleepItem", uuid: "Compendium.test.spells.Item.sleep", type: "Spell", name: "Sleep", system: { isSpell: true, tier: 1, lost: false, description: "<p>Creatures fall asleep.</p>" } }
  ];
  f.actor.system.canUseMagicItems = true;
  const add = (id, type, name, fields) => {
    const item = { id, type, name, parent: f.actor, uuid: `${f.actor.uuid}.Item.${id}`,
      system: { isPhysical: true, isIdentified: true, stashed: false, quantity: 1, ...fields } };
    f.actor.items.push(item);
    return item;
  };
  const wand = add("wand", "Wand", "Ivory Wand", { broken: false, spells: [{ uuid: spells[1].uuid, lost: true }, { uuid: spells[0].uuid, lost: false }] });
  wand.system.toggleSpellLost = async uuid => {
    const spells = wand.system.spells.map(link => ({ ...link, ...(link.uuid === uuid ? { lost: !link.lost } : {}) }));
    await f.actor.updateEmbeddedDocuments("Item", [{ _id: wand.id, "system.spells": spells, "system.broken": false }]);
  };
  const scroll = add("scroll", "Scroll", "Scroll of Light", { spellUuid: spells[0].uuid });
  return { spells, wand, scroll, resolve: uuid => spells.find(spell => spell.uuid === uuid) ?? null };
}
