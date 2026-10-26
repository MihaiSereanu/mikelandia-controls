import { createShadowdarkFixture } from "/tests/helpers/shadowdark.mjs";
import { createActor, collection } from "/tests/helpers/foundry.mjs";
import { createFoundrySessionGateway } from "/src/foundry/session-gateway.mjs";
import { createFoundryCommandGateway } from "/src/foundry/command-gateway.mjs";
import { enableMobileApplications } from "/src/foundry/mobile-presentation.mjs";
import { renderCharacters } from "/src/features/characters/presenter.mjs";
import { createTaskScope } from "/src/kernel/task-scope.mjs";

const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const scope = createTaskScope("shadowdark-browser");
try {
  const params = new URLSearchParams(location.search), initialPulp = params.get("pulp") === "true";
  document.querySelector("main").dataset.formFactor = params.get("layout") ?? "phone";
  const f = createShadowdarkFixture({ pulp: initialPulp });
  globalThis.game = f.game; globalThis.Hooks = f.hooks;
  game.i18n = { localize: key => key };
  f.actor.img = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#39413d"/><circle cx="40" cy="28" r="17" fill="#b3bdb6"/></svg>');
  const npc = createActor({ id: "npc", uuid: "Actor.npc", type: "NPC", name: "Native NPC" });
  for (const key of ["system", "items"]) Object.defineProperty(npc, key, { get() { throw new Error("NPC data must stay native"); } });
  game.actors = collection([f.actor, npc]);
  const admissions = enableMobileApplications(scope, { getExistingApplications: () => [] });
  let dialog;
  f.prompt = (kind, target, config) => new Promise(resolve => {
    let settled = false;
    const application = { options: { modal: true }, element: document.createElement("section"), close() {
      this.element.remove(); Hooks.emit("closeApplicationV2", this);
      if (!settled) { settled = true; resolve(false); }
    } };
    application.element.className = "application dialog";
    application.element.innerHTML = '<header class="window-header">Shadowdark Native Roll</header><form class="window-content"><label>Bonus <input type="number" value="0"></label><button type="button" data-native-confirm>Roll</button><button type="button" data-native-cancel>Cancel</button></form>';
    application.element.querySelector("[data-native-confirm]").onclick = () => {
      config.nativeInput = Number(application.element.querySelector("input").value);
      settled = true; application.close(); resolve(true);
    };
    application.element.querySelector("[data-native-cancel]").onclick = () => application.close();
    document.body.append(application.element);
    Hooks.emit("renderApplicationV2", application, application.element); dialog = application;
  });
  const gateway = createFoundryCommandGateway();
  const session = createFoundrySessionGateway({ capabilitiesForActor: gateway.capabilitiesForActor });
  let state, screen, watchError;
  const commands = {
    localize: (key, fallback) => fallback,
    execute: (name, payload) => gateway.execute(name, payload, { isCurrent: () => !scope.disposed && state.snapshot.selectedActorSourceUuid === payload.actorSourceUuid }),
    selectCharacterTab: tab => { state = { ...state, characterTab: tab }; screen.__veUpdateCharacter({ state, commands }); },
    selectActor: source => { state = { ...state, snapshot: session.selectCharacterSource(source) }; screen.__veUpdateCharacter({ state, commands }); },
    openNativeActorEditor: async () => {}
  };
  state = { characterTab: "overview", snapshot: session.watch(scope, snapshot => {
    state = { ...state, snapshot }; screen.__veUpdateCharacter({ state, commands });
  }, error => { watchError = error; }) };
  screen = renderCharacters({ state, commands, scope }); document.querySelector("main").append(screen); await tick();
  const tab = async id => { screen.querySelector(`[data-profile-tab="${id}"]`).click(); await tick(); };
  const field = id => { const copy = screen.querySelector(`[data-profile-field="${id}"]`)?.cloneNode(true); copy?.querySelectorAll("[data-profile-resource]").forEach(node => node.remove()); return copy?.textContent; };
  const begin = async id => { screen.querySelector(`[data-profile-action="${id}"]`).click(); await tick(); };
  const confirm = async () => { dialog.element.querySelector("[data-native-confirm]").click(); await tick(); };
  const cancel = async () => { dialog.element.querySelector("[data-native-cancel]").click(); await tick(); };
  const resource = async id => { screen.querySelector(`[data-profile-edit="${id}"]`).click(); await tick(); return screen.querySelector(`[data-profile-resource-input="${id}"]`); };
  const save = async input => { input.closest("form").querySelector("[data-profile-resource-save]").click(); await tick(); };
  check("PC uses native Abilities/Spells/Inventory labels", [...screen.querySelectorAll('[role="tab"]')].map(node => node.textContent).join(",") === "Abilities,Spells,Inventory");
  check("prepared stats and modifiers are displayed", field("str") === "Str14 (+2)");
  check("native HP and AC values are used", field("hp") === "HP7 / 12" && field("ac") === "AC14");
  check("Luck follows Pulp Mode", field("luck") === (initialPulp ? "Luck2" : "LuckActive"));
  check("unrelated game controls are absent", !/Wounds|Fortune|Spell Slots|Death Saves|Long Rest/.test(screen.textContent));
  check("PC profile fits the viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  await begin("stat:str");
  check("native roll dialog is admitted", dialog.element.classList.contains("ve-mobile-admitted-app"));
  check("pending action blocks duplicate taps", screen.querySelector('[data-profile-action="stat:str"]').disabled);
  dialog.element.querySelector("input").value = "3"; await confirm();
  check("native stat workflow runs once with native input", f.rolls.length === 1 && f.calls[0].config.nativeInput === 3);
  check("scoped native hook is removed after completion", Hooks.count("SD-Stat-Check") === 0);
  await begin("stat:str"); await cancel();
  check("cancelled native dialogs cause no extra roll", f.rolls.length === 1 && admissions.admissions.size === 0);
  await begin("attack-ranged:dagger"); await confirm();
  check("thrown ranged attacks use native UUID and attack type", f.calls.at(-1).target === f.actor.items.get("dagger").uuid && f.calls.at(-1).config.attack.type === "ranged" && f.rolls.length === 2);
  await begin("attack-melee:sword");
  const sword = f.actor.items.get("sword"); sword.system.equipped = false; Hooks.emit("updateItem", sword, {}); await tick(); await confirm();
  check("stale unequipped weapon cannot roll", f.rolls.length === 2 && !screen.querySelector('[data-profile-action="attack-melee:sword"]'));
  sword.system.equipped = true; Hooks.emit("updateItem", sword, {}); await tick();
  await begin("stat:str"); f.settings.usePulpMode = !initialPulp; Hooks.emit("updateSetting", { key: "shadowdark.usePulpMode" }, {}); await tick(); await confirm();
  check("Pulp Mode changes invalidate pending native dialogs", f.rolls.length === 2);
  check("Pulp Mode refresh changes the Luck control", field("luck") === (!initialPulp ? "Luck2" : "LuckActive"));
  f.settings.usePulpMode = initialPulp; Hooks.emit("updateSetting", { key: "shadowdark.usePulpMode" }, {}); await tick();
  let input = await resource("hp"); input.value = "0"; await save(input);
  check("zero HP saves through native updates and refreshes", field("hp") === "HP0 / 12" && f.writes[0][0]["system.attributes.hp.value"] === 0);
  input = await resource("luck");
  check("Luck editor has native numeric/boolean mode", input.type === (initialPulp ? "number" : "checkbox"));
  if (initialPulp) input.value = "4"; else input.checked = false;
  await save(input);
  check("Luck save refreshes the correct native field", field("luck") === (initialPulp ? "Luck4" : "LuckInactive"));
  await tab("spells");
  check("known and lost spells use separate sections", screen.textContent.includes("Spells Known") && screen.textContent.includes("Lost Spells") && !screen.querySelector('[data-profile-action="spell:lost"]'));
  f.success = false; await begin("spell:spell"); await confirm();
  check("failed casting retains native spell loss", f.rolls.length === 3 && f.actor.items.get("spell").system.lost && !screen.querySelector('[data-profile-action="spell:spell"]'));
  check("spell hook is removed after failure", Hooks.count("SD-Player-Spell") === 0);
  await tab("inventory");
  check("unidentified names are omitted from inventory", !screen.textContent.includes("Secret Relic"));
  await begin("light:torch");
  check("light controls use native sheet/tracker without a roll", f.lights.length === 1 && f.actor.items.get("torch").system.light.active && f.rolls.length === 3);
  const torch = f.actor.items.get("torch"); torch.system.light.active = false; Hooks.emit("updateItem", torch, {}); await tick();
  check("native remote light updates refresh the toggle", screen.querySelector('[data-profile-section="lights"]').textContent.includes("Inactive"));
  game.user.character = null; Hooks.emit("updateUser", game.user, {}); await tick();
  check("unassigned PCs retain light display without mobile toggles", !screen.querySelector('[data-profile-action="light:torch"]'));
  game.user.character = f.actor; Hooks.emit("updateUser", game.user, {}); await tick();
  check("reassignment restores native light capability", !!screen.querySelector('[data-profile-action="light:torch"]'));
  const dangerous = { ...torch, id: "hidden", uuid: `${f.actor.uuid}.Item.hidden`, visible: false, name: '<img id="secret-injection">' }; f.actor.items.push(dangerous); Hooks.emit("createItem", dangerous, {}); await tick();
  check("hidden items cannot inject markup or names", !document.querySelector("#secret-injection") && !screen.textContent.includes("secret-injection"));
  f.actor.system.slots = 12; f.actor.system.coins = { gp: 25, sp: 3, cp: 0 };
  f.actor.system.getSlotUsage = () => ({ total: 8, coins: 1 });
  const addItem = (id, type, system) => { const item = { id, name: id, type, system, parent: f.actor, uuid: `${f.actor.uuid}.Item.${id}` }; f.actor.items.push(item); Hooks.emit("createItem", item, {}); };
  addItem("stash", "Basic", { isPhysical: true, isIdentified: true, stashed: true, quantity: 2 });
  addItem("talent", "Talent", { talentClass: "class", description: '<p>Native talent text</p><script>bad()</script><div class="secret">GM secret</div>' });
  await tick(); await tab("inventory");
  check("Gear displays native used and maximum Slots", screen.querySelector('[data-profile-metric="slots"]').textContent.includes("8 / 12"));
  check("Coins displays native denominations and slot use", screen.querySelector('[data-profile-section="coins"]').textContent.includes("25") && screen.querySelector('[data-profile-metric="coin-slots"]').textContent.includes("1"));
  check("Stashed Gear has a separate section", screen.querySelector('[data-profile-section="stashed"]').textContent.includes("stash") && !screen.querySelector('[data-profile-section="gear"]').textContent.includes("stash"));
  await tab("talents");
  const details = screen.querySelector("details"); details.open = true; await tick();
  check("Talents details are readable text without secret content or scripts", details.textContent.includes("Native talent text") && !details.textContent.includes("GM secret") && !details.querySelector("script"));
  check("Talents panel fits the viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  commands.selectActor(npc.uuid); await tick();
  check("NPCs remain on native sheets", !screen.querySelector(".ve-profile-content") && screen.textContent.includes("Native NPC"));
  commands.selectActor(f.actor.uuid); await tick();
  check("session watcher stays healthy", !watchError && state.snapshot.selectedActor.profileId === "shadowdark-player");
  await tab("abilities"); input = await resource("luck");
  check("open resource editor fits the viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  scope.dispose(); document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
