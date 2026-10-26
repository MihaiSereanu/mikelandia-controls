import { ACTOR_COMMANDS } from "../../kernel/command-names.mjs";

const COLLECTIVE_ITEM_COMMANDS = new Set([ACTOR_COMMANDS.USE_ITEM, ACTOR_COMMANDS.OPEN_ITEM_SHEET,
  ACTOR_COMMANDS.UPDATE_CURRENCY, ACTOR_COMMANDS.SET_ITEM_EQUIPPED, ACTOR_COMMANDS.SET_ITEM_ATTUNED, ACTOR_COMMANDS.SET_ITEM_FAVORITE]);
const VEHICLE_COMMANDS = new Set([...COLLECTIVE_ITEM_COMMANDS, ACTOR_COMMANDS.ROLL_ABILITY, ACTOR_COMMANDS.ROLL_SAVE,
  ACTOR_COMMANDS.ROLL_INITIATIVE, ACTOR_COMMANDS.EDIT_HIT_POINTS, ACTOR_COMMANDS.TOGGLE_CONDITION]);

/** Bind the existing native operations without duplicating their rules. */
export function createDnd5eCommands(legacy) {
  const {
    rollAbility,
    rollSkill,
    rollTool,
    rollInitiative,
    rollDeathSave,
    setInspiration,
    toggleCondition,
    setExhaustionLevel,
    editHitPoints,
    addExperience,
    updateBiographySection,
    updateCurrency,
    setSpellSlotValue,
    setItemEquipped,
    setItemAttuned,
    setItemFavorite,
    setSpellPrepared,
    openItemSheet,
    adjustHitDice,
    takeRest,
    useItem,
    keysOf,
    toolKeys,
    supportsAbilityCheck,
    supportsAbilitySave,
    canRollDeathSave,
    editableSpellSlotKeys,
    supportsHitDiceEditing,
    usableItemIds
  } = legacy;
  const handlers = Object.freeze({
    [ACTOR_COMMANDS.ROLL_ABILITY]: (actor, payload) => rollAbility(actor, payload.ability, false),
    [ACTOR_COMMANDS.ROLL_SAVE]: (actor, payload) => rollAbility(actor, payload.ability, true),
    [ACTOR_COMMANDS.ROLL_SKILL]: (actor, payload) => rollSkill(actor, payload.skill),
    [ACTOR_COMMANDS.ROLL_TOOL]: (actor, payload) => rollTool(actor, payload.tool),
    [ACTOR_COMMANDS.ROLL_INITIATIVE]: (actor) => rollInitiative(actor),
    [ACTOR_COMMANDS.ROLL_DEATH_SAVE]: (actor) => rollDeathSave(actor),
    [ACTOR_COMMANDS.SET_INSPIRATION]: (actor, payload) => setInspiration(actor, payload),
    [ACTOR_COMMANDS.TOGGLE_CONDITION]: (actor, payload) => toggleCondition(actor, payload),
    [ACTOR_COMMANDS.SET_EXHAUSTION_LEVEL]: (actor, payload) => setExhaustionLevel(actor, payload),
    [ACTOR_COMMANDS.EDIT_HIT_POINTS]: (actor, payload) => editHitPoints(actor, payload),
    [ACTOR_COMMANDS.ADD_EXPERIENCE]: (actor, payload) => addExperience(actor, payload),
    [ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION]: (actor, payload) => updateBiographySection(actor, payload),
    [ACTOR_COMMANDS.UPDATE_CURRENCY]: (actor, payload) => updateCurrency(actor, payload),
    [ACTOR_COMMANDS.SET_SPELL_SLOT_VALUE]: (actor, payload) => setSpellSlotValue(actor, payload),
    [ACTOR_COMMANDS.SET_ITEM_EQUIPPED]: (actor, payload) => setItemEquipped(actor, payload),
    [ACTOR_COMMANDS.SET_ITEM_ATTUNED]: (actor, payload) => setItemAttuned(actor, payload),
    [ACTOR_COMMANDS.SET_ITEM_FAVORITE]: (actor, payload) => setItemFavorite(actor, payload),
    [ACTOR_COMMANDS.SET_SPELL_PREPARED]: (actor, payload) => setSpellPrepared(actor, payload),
    [ACTOR_COMMANDS.OPEN_ITEM_SHEET]: (actor, payload) => openItemSheet(actor, payload),
    [ACTOR_COMMANDS.ADJUST_HIT_DICE]: (actor, payload) => adjustHitDice(actor, payload),
    [ACTOR_COMMANDS.TAKE_REST]: (actor, payload) => takeRest(actor, payload),
    [ACTOR_COMMANDS.USE_ITEM]: (actor, payload) => useItem(actor, payload.itemId, payload.activityId)
  });

  return Object.freeze({
    handlers,
    canExecute(actor, name) {
      return !(actor.type === "group" && !COLLECTIVE_ITEM_COMMANDS.has(name))
        && !(actor.type === "vehicle" && !VEHICLE_COMMANDS.has(name));
    },
    capabilitiesForActor(actor) {
      const abilities = keysOf(actor.system?.abilities);
      const skills = keysOf(actor.system?.skills);
      const tools = toolKeys(actor);
      const collective = ["group", "vehicle"].includes(actor.type);
      const group = actor.type === "group";
      return Object.freeze({
        ...(collective ? { nativeActorEditor: typeof actor.update === "function" } : {}),
        rollAbility: !group && supportsAbilityCheck(actor) ? abilities : Object.freeze([]),
        rollSave: !group && supportsAbilitySave(actor) ? abilities : Object.freeze([]),
        rollSkill: !collective && typeof actor.rollSkill === "function" ? skills : Object.freeze([]),
        rollTool: !collective && typeof actor.rollToolCheck === "function" ? tools : Object.freeze([]),
        rollInitiative: !group && typeof actor.rollInitiative === "function",
        rollDeathSave: !collective && canRollDeathSave(actor),
        editInspiration: actor.type === "character" && typeof actor.update === "function" && typeof actor.system?.attributes?.inspiration === "boolean",
        configureArmorClass: ["character", "npc"].includes(actor.type) && Boolean(actor.system?.attributes?.ac),
        toggleConditions: !group && typeof actor.toggleStatusEffect === "function",
        editExhaustion: ["character", "npc"].includes(actor.type) && typeof actor.update === "function"
          && Number.isSafeInteger(actor.system?.attributes?.exhaustion),
        editHitPoints: !group && typeof actor.update === "function" && typeof actor.applyDamage === "function"
          && (actor.type !== "vehicle" || Number.isFinite(actor.system?.attributes?.hp?.value)),
        editExperience: actor.type === "character" && typeof actor.update === "function"
          && Number.isSafeInteger(actor.system?.details?.xp?.value) && actor.system.details.xp.value >= 0,
        editBiography: ["character", "npc"].includes(actor.type) && typeof actor.update === "function" && Boolean(actor.system?.details),
        updateCurrency: Boolean(actor.system?.currency) && typeof actor.update === "function",
        editSpellSlots: collective ? Object.freeze([]) : editableSpellSlotKeys(actor),
        adjustHitDice: !collective && supportsHitDiceEditing(actor),
        shortRest: !collective && typeof actor.shortRest === "function",
        longRest: !collective && typeof actor.longRest === "function",
        useItem: usableItemIds(actor)
      });
    }
  });
}
