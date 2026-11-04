import { ACTOR_COMMANDS } from "/src/kernel/state/command-names.mjs";

export async function checkRollChat({ f, store, commands, uiCommands, root, values, legacy, warhammer, check, tick }) {
  const key = "moveToChatAfterRoll";
  let mode = "roll", release, sequence = 0;
  const prompt = async () => {
    if (mode === "wait") await new Promise(resolve => { release = resolve; });
    if (mode === "error") throw new Error("native roll failed");
    return mode !== "cancel";
  };
  if (legacy) f.actor.rollAbilityCheck = async () => await prompt()
    ? [{ total: 1, formula: "1d20", parent: { id: `roll-${++sequence}` } }] : null;
  else if (warhammer) f.actor.setupCharacteristic = async () => await prompt()
    ? { actor: f.actor, roll: async () => {} } : null;
  else f.prompt = prompt;
  uiCommands.selectActor(f.actor.uuid);
  await tick();
  const roll = () => {
    const actionId = warhammer ? "characteristic:ws" : "stat:str";
    const revision = commands.capabilitiesForActor(f.actor).profileActions?.find(action => action.id === actionId)?.revision;
    return uiCommands.execute(legacy ? ACTOR_COMMANDS.ROLL_ABILITY : ACTOR_COMMANDS.EXECUTE_PROFILE_ACTION,
      { actorSourceUuid: f.actor.uuid, ...(legacy ? { ability: "str" } : { actionId, actionRevision: revision }) });
  };
  check("Move to Chat defaults Off", game.settings.get("mikelandia-controls", key) === false);
  await roll();
  check("Off preserves Character after rolling", store.state.route === "characters");
  uiCommands.navigate("settings"); await tick();
  const actions = [...root.querySelectorAll(".mc-settings-group-toggle")].find(element => element.textContent.includes("Action Results"));
  if (actions?.getAttribute("aria-expanded") !== "true") actions.click();
  const label = [...root.querySelectorAll("label")].find(element => element.textContent.includes("Move to Chat after rolling"));
  check("setting has its requested label", !!label);
  check("setting description omits the default suffix", !label.closest(".mc-setting-copy").textContent.includes("Default:"));
  const toggle = label.control;
  check("setting is an unchecked toggle", toggle?.type === "checkbox" && !toggle.checked);
  toggle.click(); await tick();
  check("setting toggle saves On", values.get(key) === true);
  uiCommands.navigate("characters"); await tick();
  mode = "cancel";
  await roll();
  check("cancellation preserves Character", store.state.route === "characters");
  mode = "error";
  let failed = false;
  try { await roll(); } catch { failed = true; }
  check("roll error preserves Character", failed && store.state.route === "characters");
  mode = "roll";
  if (!legacy && !warhammer) f.success = false;
  await roll(); await tick();
  check("completed roll moves to Chat, including an unsuccessful check", store.state.route === "chat");
  uiCommands.navigate("characters"); await tick();
  mode = "wait";
  const pending = roll(); await tick();
  uiCommands.navigate("journals");
  uiCommands.navigate("characters");
  mode = "roll"; release();
  await pending.catch(() => {});
  check("late result respects intervening navigation even after returning to Character", store.state.route === "characters");
  values.set(key, false);
  uiCommands.navigate("settings"); await tick();
  const group = [...root.querySelectorAll(".mc-settings-group-toggle")].find(element => element.textContent.includes("Action Results"));
  if (group?.getAttribute("aria-expanded") !== "true") group.click();
}
