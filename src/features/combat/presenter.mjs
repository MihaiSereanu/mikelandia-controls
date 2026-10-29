import { localizedText, localizedCount, localizedNumber } from "../../ui/primitives/localized-text.mjs";
import { icon, node } from "../../ui/primitives/dom.mjs";
import { renderTargets } from "./targets.mjs";
import { combatHealthText } from "./health.mjs";

export function renderCombat({ state, commands, scope }) {
  const combat = state.snapshot?.combat;
  if (!combat) return emptyCombat(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.NoActiveCombat", "No active combat"), localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.JoinAnEncounterToSeeItsTurnOrderHere", "Join an encounter to see its turn order here."));
  const status = node("p", { className: "mc-combat-status", attrs: { role: "status", "aria-live": "polite" } });
  const list = node("ol", {
    className: "mc-combat-list",
    attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.CombatTurnOrder", "Combat turn order") },
    children: combat.combatants.map((combatant) => combatantRow(combat, combatant, commands, status, scope))
  });
  const endTurn = combat.canEndTurn ? node("button", {
    className: "mc-combat-end-turn",
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.EndTurn", "End Turn"), title: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.EndTurn", "End Turn") },
    on: { click: async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      status.classList.remove("is-error");
      status.textContent = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.EndingTurn", "Ending turn…");
      try {
        await commands.endCombatTurn(combat.id);
        if (!scope.disposed) status.textContent = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.TurnEnded", "Turn ended.");
      } catch (error) {
        if (!scope.disposed) {
          status.classList.add("is-error");
          status.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.FoundryCouldNotEndTheTurn", "Foundry could not end the turn.");
          button.disabled = false;
        }
      }
    } },
    children: endTurnContents(commands)
  }, scope) : null;

  const targets = renderTargets({ targeting: state.targeting, commands, scope });
  const screen = node("section", { className: "mc-combat-screen", children: [
    node("header", { className: "mc-combat-heading", children: [
      node("span", { className: "mc-combat-round", children: [node("small", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.Round", "Round") }), node("strong", { text: combat.round || "—" })] }),
      node("div", { className: "mc-combat-heading-copy", children: [node("h2", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Navigation.Initiative", "Initiative") }), node("p", { text: combat.started ? localizedCount(commands.localize, "MIKELANDIA_CONTROLS.Combat.Count", { one: "{count} combatant", other: "{count} combatants" }, combat.combatants.length, commands.readLocale?.() ?? "en") : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.WaitingToBegin", "Waiting to begin") })] }),
      endTurn
    ].filter(Boolean) }),
    status,
    targets,
    combat.combatants.length ? list : emptyCombat(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.NoVisibleCombatants", "No visible combatants"), localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.TheEncounterHasNoCombatantsYouCanView", "The encounter has no combatants you can view."))
  ].filter(Boolean) });
  const combatStructure = value => value ? JSON.stringify({ ...value,
    combatants: value.combatants.map(({ health, ...row }) => row) }) : "";
  const initialStructure = combatStructure(combat);
  const healthNodes = new Map(Array.from(list.querySelectorAll("[data-combatant-id]"), row =>
    [row.dataset.combatantId, row.querySelector(".mc-combat-health")]));
  screen.__mcUpdateCombatState = (nextCombat, nextTargets) => {
    if (!nextCombat || combatStructure(nextCombat) !== initialStructure) return false;
    if (targets ? !targets.__mcUpdateTargetDistances(nextTargets) : nextTargets !== null && nextTargets !== undefined) return false;
    for (const combatant of nextCombat.combatants) {
      const element = healthNodes.get(combatant.id);
      if (!element) continue;
      const text = combatHealthText(combatant.health, commands);
      if (element.textContent !== text) element.textContent = text;
      element.hidden = !combatant.health;
    }
    return true;
  };
  screen.__mcUpdateCombatTargets = next => targets?.__mcUpdateTargetDistances(next) ?? false;
  return screen;
}

export function renderGmCombatControls({ controls, commands, scope }) {
  if (!controls?.isGM) return null;
  const combatExists = Boolean(controls.combatId);
  const request = () => ({
    combatId: controls.combatId,
    combatInstanceRevision: controls.combatInstanceRevision,
    round: controls.round,
    turn: controls.turn,
    currentCombatantId: controls.currentCombatantId
  });
  const status = node("span", { className: "mc-gm-combat-controls-status", attrs: { role: "status", "aria-live": "polite" } });
  const run = async (button, action) => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = "";
    status.textContent = "";
    try { await action(request()); }
    catch (error) {
      if (!scope.disposed && status.isConnected) status.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.CombatGateway.FoundryRefusedTheCombatAction", "Foundry refused the combat action.");
    }
    finally { if (!scope.disposed && button.isConnected) button.disabled = button.dataset.available !== "true"; }
  };
  const button = ({ className, visible, accessible, enabled, iconName, invoke, reason }) => node("button", {
    className,
    attrs: {
      type: "button",
      "aria-label": accessible,
      title: enabled ? accessible : reason,
      "aria-disabled": String(!enabled),
      disabled: !enabled,
      "data-available": String(enabled)
    },
    on: { click: (event) => { void run(event.currentTarget, invoke); } },
    children: [icon(iconName), node("span", { text: visible })]
  }, scope);
  const noCombat = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.NoActiveCombatForProgression", "No active combat");
  const waiting = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.StartCombatBeforeProgressing", "Start combat before changing turns");
  const noTurn = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.NoAppropriateCombatTurn", "No appropriate combat turn");
  const previous = button({
    className: "mc-gm-combat-control mc-gm-combat-previous",
    visible: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.PreviousShort", "Previous"),
    accessible: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.PreviousTurn", "Previous Turn"),
    enabled: Boolean(combatExists && controls.canPrevious),
    iconName: "fa-chevron-left",
    reason: !combatExists ? noCombat : !controls.started ? waiting : noTurn,
    invoke: commands.previousCombatTurn
  });
  const centerEnabled = Boolean(combatExists && (controls.started ? controls.canEnd : controls.canStart));
  const center = button({
    className: "mc-gm-combat-control mc-gm-combat-center",
    visible: localizedText(commands.localize, controls.started ? "MIKELANDIA_CONTROLS.Interface.AppFrame.EndCombat" : "MIKELANDIA_CONTROLS.Interface.AppFrame.StartCombat", controls.started ? "End Combat" : "Start Combat"),
    accessible: localizedText(commands.localize, controls.started ? "MIKELANDIA_CONTROLS.Interface.AppFrame.EndCombat" : "MIKELANDIA_CONTROLS.Interface.AppFrame.StartCombat", controls.started ? "End Combat" : "Start Combat"),
    enabled: centerEnabled,
    iconName: controls.started ? "fa-stop" : "fa-play",
    reason: !combatExists ? noCombat : noTurn,
    invoke: controls.started ? commands.endCombat : commands.startCombat
  });
  const next = button({
    className: "mc-gm-combat-control mc-gm-combat-next",
    visible: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.NextShort", "Next"),
    accessible: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.NextTurn", "Next Turn"),
    enabled: Boolean(combatExists && controls.canNext),
    iconName: "fa-chevron-right",
    reason: !combatExists ? noCombat : !controls.started ? waiting : noTurn,
    invoke: commands.nextCombatTurn
  });
  return node("div", {
    className: "mc-gm-combat-controls",
    attrs: { role: "group", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.AppFrame.GMCombatControls", "GM combat controls") },
    children: [previous, center, next, status]
  });
}

function combatantRow(combat, combatant, commands, status, scope) {
  const run = async (button, action) => {
    button.disabled = true;
    status.classList.remove("is-error");
    status.textContent = "";
    try { await action(); }
    catch (error) {
      if (!scope.disposed) {
        status.classList.add("is-error");
        status.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.TheCombatActionFailed", "The combat action failed.");
      }
    } finally {
      if (!scope.disposed) button.disabled = false;
    }
  };
  const controls = [];
  if (combatant.canRollInitiative) controls.push(node("button", {
    className: "mc-combat-roll-initiative",
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.RollInitiativeFor", "Roll initiative for {name}", { name: (combatant.name) }), title: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.RollInitiative", "Roll initiative") },
    on: { click: (event) => run(event.currentTarget, () => commands.rollCombatInitiative(combat.id, combatant.id)) },
    children: [icon("fa-dice-d20")]
  }, scope));

  return node("li", {
    className: `${combatant.current ? "is-current" : ""}${combatant.defeated ? " is-defeated" : ""}${combatant.enemy ? " is-enemy" : ""}`,
    dataset: { combatantId: combatant.id },
    attrs: { "aria-current": combatant.current ? "step" : undefined },
    children: [
      node("span", { className: "mc-combat-portrait", children: [combatant.img ? node("img", { attrs: { src: combatant.img, alt: "" } }) : icon("fa-user")] }),
      node("div", { className: "mc-combat-name", children: [node("span", { className: "mc-combat-name-line", children: [
        node("strong", { text: combatant.name }),
        node("small", { className: "mc-combat-health", text: combatHealthText(combatant.health, commands), attrs: { hidden: !combatant.health } })
      ].filter(Boolean) }), combatant.defeated ? node("small", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.Defeated", "Defeated") }) : null].filter(Boolean) }),
      combatant.initiative === null ? node("span", { className: "mc-combat-initiative is-empty", text: "—" }) : node("span", { className: "mc-combat-initiative", text: formatInitiative(combatant.initiative, combat.initiativeDecimals, commands.readLocale?.() ?? "en") }),
      controls.length ? node("div", { className: "mc-combat-row-controls", children: controls }) : null
    ].filter(Boolean)
  });
}

function emptyCombat(title, detail) {
  return node("div", { className: "mc-combat-empty", children: [icon("fa-shield-halved"), node("h2", { text: title }), node("p", { text: detail })] });
}

export function formatInitiative(value, decimals = 0, locale = "en") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return localizedNumber(Number(value), locale, Number(decimals) === 2 ? 2 : 0);
}

function endTurnContents(commands) {
  return [
    node("span", { className: "mc-combat-end-turn-copy mc-combat-end-turn-line", text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.EndTurn", "End Turn") }),
    node("span", { className: "mc-combat-end-turn-chevron", children: [icon("fa-chevron-right")] })
  ];
}
