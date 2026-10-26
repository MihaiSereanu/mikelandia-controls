import { ACTOR_COMMANDS } from "../../kernel/command-names.mjs";
import { CommandError } from "../../foundry/command-error.mjs";
import { localizeFoundry } from "../../foundry/localization.mjs";
import { createProfilePanels } from "../profile-view.mjs";
import { fallbackIntegration } from "../fallback/integration.mjs";
import { readWarhammerContext } from "./context.mjs";
import { createWarhammerCharacterProfile } from "./profile.mjs";
import { spellForActor, castChannelSheet, magicWinds } from "./magic.mjs";
import { ownedWarhammerItem, weaponForActor, warhammerWeaponMode } from "./items.mjs";
import { warhammerResourceEdits, editWarhammerResource } from "./resources.mjs";

const allowedKeys = new Set(["actorSourceUuid", "actorId", "actionId", "actionRevision"]);
const unavailable = () => new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Panels.ActionUnavailable", "This game action is no longer available."));

function skillForActor(actor, id) {
  return ownedWarhammerItem(actor, id, "skill");
}

function availableActions(actor, game, user = game?.user) {
  const context = readWarhammerContext(game);
  if (!context || actor?.type !== "character" || !fallbackIntegration.isActorEligible(actor, user)) return [];
  const tabs = createProfilePanels(actor, createWarhammerCharacterProfile(actor, context), context);
  const actions = [];
  for (const tab of tabs) for (const section of tab.sections) {
    if (section.id === "characteristics" && typeof actor.setupCharacteristic === "function") {
      for (const row of section.rows) actions.push(Object.freeze({ id: `characteristic:${row.id}`, revision: context.revision, label: row.label }));
    }
    if (tab.id === "skills" && typeof actor.setupSkill === "function") {
      for (const row of section.rows) if (/^[a-zA-Z0-9_-]{1,128}$/u.test(row.id) && skillForActor(actor, row.id)) actions.push(Object.freeze({ id: `skill:${row.id}`, revision: context.revision, label: row.label }));
    }
    if (["melee-weapons", "ranged-weapons"].includes(section.id) && typeof actor.setupWeapon === "function") {
      for (const row of section.rows) if (/^[a-zA-Z0-9_-]{1,128}$/u.test(row.id) && weaponForActor(actor, row.id)) actions.push(Object.freeze({ id: `weapon:${row.id}`, revision: context.revision, label: row.label }));
    }
    if (["petty-spells", "lore-spells"].includes(section.id) && typeof actor.setupCast === "function"
      && (context.use5e || (castChannelSheet(actor) && (section.id === "petty-spells" || typeof actor.setupChannell === "function")))) {
      for (const row of section.rows) if (/^[a-zA-Z0-9_-]{1,128}$/u.test(row.id) && spellForActor(actor, row.id, context)) {
        actions.push(Object.freeze({ id: `spell:${row.id}`, revision: context.revision, label: row.label }));
      }
    }
  }
  if (typeof actor.setupChannelling === "function") for (const wind of magicWinds(actor, context)) {
    actions.push(Object.freeze({ id: `wind:${wind.key}`, revision: context.revision, label: wind.label }));
  }
  return Object.freeze(actions);
}

/** Dispatch allowlisted native tests and resource edits without rules calculations. */
export function createWarhammerCommands({ getGame = () => globalThis.game } = {}) {
  return Object.freeze({
    supportsCommand: name => [ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION, ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE].includes(name),
    capabilitiesForActor(actor, user) {
      const profileActions = availableActions(actor, getGame(), user);
      const profileEdits = warhammerResourceEdits(actor, getGame(), user);
      return Object.freeze({ ...(profileActions.length ? { profileActions } : {}), ...(profileEdits.length ? { profileEdits } : {}) });
    },
    async execute(name, payload, _expected, _observer, context) {
      const { actor, assertCurrent, sourceUuid } = context;
      if (name === ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE) return editWarhammerResource(payload, context, getGame());
      const actions = availableActions(actor, getGame());
      if (!actions.length || name !== ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION) throw unavailable();
      if (Object.keys(payload).some(key => !allowedKeys.has(key)) || typeof payload.actionId !== "string"
        || payload.actionId.length > 256 || typeof payload.actionRevision !== "string") {
        throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Panels.InvalidAction", "Invalid game action request."));
      }
      const action = actions.find(action => action.id === payload.actionId);
      if (!action) throw unavailable();
      if (action.revision !== payload.actionRevision) throw new CommandError("STALE_STATE", localizeFoundry("VEMOBILE.Panels.EditionChanged", "The game edition changed. Reopen the action."));
      const [kind, id] = action.id.split(":");
      const skill = kind === "skill" ? skillForActor(actor, id) : null;
      const weapon = kind === "weapon" ? weaponForActor(actor, id) : null;
      const magicContext = readWarhammerContext(getGame());
      const spell = kind === "spell" ? spellForActor(actor, id, magicContext) : null;
      const spellLore = spell ? JSON.stringify(spell.system.lore.value) : null;
      const windSpells = kind === "wind" ? Array.from(actor.items?.contents ?? actor.items ?? [])
        .filter(item => spellForActor(actor, String(item.id), magicContext) === item)
        .map(item => [item, JSON.stringify(item.system.lore.value)]) : null;
      const weaponMode = weapon ? warhammerWeaponMode(weapon) : null;
      if (kind === "skill" && !skill) throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Panels.SkillChanged", "The selected Skill changed while the test was open."));
      if (kind === "weapon" && !weapon) throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Panels.WeaponChanged", "The selected Weapon changed while the test was open."));
      assertCurrent();
      const test = kind === "characteristic" ? await actor.setupCharacteristic(id)
        : kind === "skill" ? await actor.setupSkill(skill)
          : kind === "weapon" ? await actor.setupWeapon(weapon)
            : kind === "wind" ? await actor.setupChannelling(id)
              : magicContext.use5e ? await actor.setupCast(spell) : await castChannelSheet(actor).castOrChannelPrompt(spell);
      if (test === null || test === undefined || test === false) return Object.freeze({ ok: true, command: name,
        actorId: String(actor.id), actorSourceUuid: sourceUuid, cancelled: true });
      assertCurrent();
      if (readWarhammerContext(getGame())?.revision !== action.revision) {
        throw new CommandError("STALE_STATE", localizeFoundry("VEMOBILE.Panels.EditionChanged", "The game edition changed. Reopen the action."));
      }
      if (skill && skillForActor(actor, id) !== skill) throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Panels.SkillChanged", "The selected Skill changed while the test was open."));
      if (weapon && (weaponForActor(actor, id) !== weapon || warhammerWeaponMode(weapon) !== weaponMode)) {
        throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Panels.WeaponChanged", "The selected Weapon changed while the test was open."));
      }
      if ((spell && (spellForActor(actor, id, magicContext) !== spell || JSON.stringify(spell.system.lore.value) !== spellLore))
        || windSpells?.some(([item, lore]) => spellForActor(actor, String(item.id), magicContext) !== item || JSON.stringify(item.system.lore.value) !== lore)) throw unavailable();
      if (!availableActions(actor, getGame()).some(current => current.id === action.id)) throw unavailable();
      if (test.actor && test.actor !== actor) throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Panels.ActorChanged", "The selected actor changed while the action was open."));
      // Native tests may expose a freshly constructed Item view. Authority
      // stays with the original embedded document revalidated above.
      const expectedItem = weapon ?? spell;
      const testItem = expectedItem ? test.item : null;
      if (testItem && (String(testItem.id) !== String(expectedItem.id) || testItem.type !== expectedItem.type || testItem.parent !== actor)) {
        if (spell) throw unavailable();
        throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Panels.WeaponChanged", "The selected Weapon changed while the test was open."));
      }
      if (kind === "wind" && test.context?.wind !== undefined && test.context.wind !== id) throw unavailable();
      if (typeof test.roll !== "function") throw unavailable();
      await test.roll();
      return Object.freeze({ ok: true, command: name, actorId: String(actor.id), actorSourceUuid: sourceUuid });
    }
  });
}
