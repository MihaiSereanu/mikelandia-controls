import { shadowdarkNotes } from "../actor-notes.mjs";
import { ACTOR_COMMANDS } from "../../kernel/state/command-names.mjs";
import { CommandError } from "../../foundry/commands/command-error.mjs";
import { localizeFoundry } from "../../foundry/settings/localization.mjs";
import { createProfilePanels } from "../profile-view.mjs";
import { shadowdarkPlayerProfile } from "./profile.mjs";
import { abilities, isShadowdarkPlayer, shadowdarkContext, ownedItem } from "./context.mjs";
import { shadowdarkResourceEdits, editShadowdarkResource } from "./resources.mjs";

import { inventoryEdits, inventoryAvailable, executeInventory, equipmentEdits, editEquipment } from "./inventory.mjs";

const unavailable = () => new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("MIKELANDIA_CONTROLS.Panels.ActionUnavailable", "This game action is no longer available."));
function actionsFor(actor, game, hooks, user = game?.user) {
  const context = shadowdarkContext(game);
  if (!context || !isShadowdarkPlayer(actor, user)) return [];
  const guarded = typeof hooks?.on === "function" && typeof hooks?.off === "function" && typeof hooks?.call === "function";
  const methods = { stats: "rollStatCheck", "melee-attacks": "rollAttack", "ranged-attacks": "rollAttack", "known-spells": "castSpell", "special-abilities": "useAbility" };
  const prefixes = { stats: "stat", "melee-attacks": "attack-melee", "ranged-attacks": "attack-ranged", "known-spells": "spell", "special-abilities": "ability" };
  const actions = [];
  for (const tab of createProfilePanels(actor, shadowdarkPlayerProfile(context))) for (const section of tab.sections) {
    if (!guarded || typeof actor.system?.[methods[section.id]] !== "function") continue;
    for (const row of section.rows) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(row.id)) continue;
      const kind = prefixes[section.id];
      if (!kind || (kind === "stat" && !abilities.includes(row.id))) continue;
      if (kind === "spell" && ownedItem(actor, row.id, "Spell")?.system.lost !== false) continue;
      const ability = kind === "ability" ? ownedItem(actor, row.id, "Class Ability") : null;
      if (kind === "ability" && (ability?.system.lost !== false || (ability.system.limitedUses === true && !(ability.system.uses?.available > 0)))) continue;
      actions.push(Object.freeze({ id: `${kind}:${row.id}`, revision: kind === "ability" ? JSON.stringify([context.revision, binding(actor, ability)]) : context.revision, label: row.label }));
    }
  }
  return Object.freeze(actions);
}
function binding(actor, item) {
  return JSON.stringify([actor.type, actor.system.class, actor.system.spellcasting?.classes,
    item?.system.type, item?.system.equipped, item?.system.stashed, item?.system.handedness,
    item?.system.isThrown, item?.system.lost, item?.system.class, item?.system.tier, item?.system.duration?.type, item?.system.duration?.value,
    item?.system.limitedUses, item?.system.uses?.available, item?.system.uses?.max, item?.system.ability, item?.system.dc, item?.system.loseOnFailure]);
}
export function createShadowdarkCommands({ getGame = () => globalThis.game, getHooks = () => globalThis.Hooks } = {}) {
  return Object.freeze({
    // Native RollDialogSD uses one fixed DOM ID across actors and roll types.
    // Opening a second workflow would replace the first unresolved prompt.
    commandKey: name => name === ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION ? JSON.stringify([name, "shadowdark-native-roll"]) : undefined,
    supportsCommand: name => [ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, ACTOR_COMMANDS.LIST_PROFILE_ITEMS, ACTOR_COMMANDS.ADD_PROFILE_ITEM].includes(name),
    capabilitiesForActor(actor, user) {
      const profileActions = actionsFor(actor, getGame(), getHooks(), user), profileEdits = [...shadowdarkResourceEdits(actor, getGame(), user), ...inventoryEdits(actor, getGame(), user), ...equipmentEdits(actor, getGame(), user)];
      return Object.freeze({ ...(inventoryAvailable(actor, getGame(), user) ? { profileInventory: true } : {}), ...(profileActions.length ? { profileActions } : {}), ...(profileEdits.length ? { profileEdits } : {}) });
    },
    async execute(name, payload, _expected, _observer, context) {
      if (name === ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION) return shadowdarkNotes.save(context.actor, payload, context.assertCurrent);
      if (name === ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE && payload.resourceId?.startsWith("equipped:")) return editEquipment(payload, context, getGame());
      if ([ACTOR_COMMANDS.LIST_PROFILE_ITEMS, ACTOR_COMMANDS.ADD_PROFILE_ITEM].includes(name)
        || (name === ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE && payload.resourceId?.startsWith("quantity:"))) return executeInventory(name, payload, context, getGame());
      if (name === ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE) return editShadowdarkResource(payload, context, getGame());
      const { actor, assertCurrent, sourceUuid } = context;
      const game = getGame(), hooks = getHooks();
      const actions = actionsFor(actor, game, hooks);
      if (name !== ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION || !actions.length) throw unavailable();
      if (Object.keys(payload).some(key => !["actorSourceUuid", "actorId", "actionId", "actionRevision"].includes(key))
        || typeof payload.actionId !== "string" || typeof payload.actionRevision !== "string") throw new CommandError("INVALID_INPUT", localizeFoundry("MIKELANDIA_CONTROLS.Panels.InvalidAction", "Invalid game action request."));
      const action = actions.find(action => action.id === payload.actionId);
      if (!action) throw unavailable();
      if (action.revision !== payload.actionRevision) throw new CommandError("STALE_STATE", localizeFoundry("MIKELANDIA_CONTROLS.Panels.ActionUnavailable", "This game action is no longer available."));
      const [kind, id] = action.id.split(":");
      const model = actor.system;
      const item = kind === "stat" ? null : ownedItem(actor, id);
      const before = binding(actor, item);
      const checkpoint = () => {
        assertCurrent();
        if (actor.system !== model || (item && ownedItem(actor, id) !== item) || binding(actor, item) !== before
          || !actionsFor(actor, getGame(), getHooks()).some(current => current.id === action.id && current.revision === action.revision)) throw unavailable();
      };
      checkpoint();

      const hook = kind === "stat" ? "SD-Stat-Check" : kind === "spell" ? "SD-Player-Spell" : kind === "ability" ? "SD-Player-classAbility" : "SD-Player-Attack";
      const config = kind.startsWith("attack-") ? { attack: { type: kind.slice(7) } } : {};
      let seen = false, failure;
      const guard = current => {
        if (current !== config) return;
        try {
          checkpoint();
          if (config.actorUuid !== sourceUuid || (item && config.itemUuid !== item.uuid)
            || (kind === "stat" && config.check?.stat !== id) || (kind === "spell" && config.cast?.spellUuid !== item.uuid)
            || (kind.startsWith("attack-") && config.attack?.type !== kind.slice(7))) throw unavailable();
          seen = true;
        } catch (error) { failure = error; return false; }
      };
      hooks.on(hook, guard);
      try {
        // These native methods own dialogs, rolling, chat, and post-roll effects.
        context.rollTiming?.mark("native-invoked");
        if (kind === "stat") await model.rollStatCheck(id, config);
        else if (kind === "spell") await model.castSpell(item.uuid, config);
        else if (kind === "ability") await model.useAbility(item.uuid, config);
        else await model.rollAttack(item.uuid, config);
        if (failure) throw failure;
        return { ok: true, actorSourceUuid: sourceUuid, cancelled: !seen, nativeHandled: true };
      } finally { hooks.off(hook, guard); }
    }
  });
}
