import { createFoundrySessionGateway } from "/src/foundry/session/session-gateway.mjs";
import { createFoundryCommandGateway } from "/src/foundry/commands/command-gateway.mjs";
import { enableMobileApplications } from "/src/foundry/presentation/mobile-presentation.mjs";
import { renderCharacters } from "/src/features/characters/presenter.mjs";
import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";
import { createHooks } from "/tests/helpers/foundry.mjs";
import { createWarhammerActor, createWarhammerGame, addWarhammerMagic } from "/tests/helpers/warhammer.mjs";

const checks = [];
const check = (name, condition) => { if (!condition) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const scope = createTaskScope("browser-warhammer");
try {
  const params = new URLSearchParams(location.search);
  const initial5e = params.get("edition") === "5e";
  if (params.has("native-assets")) {
    const font = new FontFace("Native fixture icons", 'url("/native-fixture/fa-solid-900.woff2")', { weight: "900" });
    document.fonts.add(await font.load());
    const style = document.createElement("style");
    style.textContent = '.mc-profile-secondary-action i { font-family: "Native fixture icons"; font-weight: 900; font-style: normal; } .mc-profile-secondary-action .fa-bed::before { content: "\\f236"; }';
    document.head.append(style);
  }
  let use5e = initial5e;
  document.querySelector("main").dataset.formFactor = params.get("layout") ?? "phone";
  if (params.has("large")) document.querySelector("main").style.setProperty("font-size", "24px", "important");
  globalThis.Hooks = createHooks();
  const portrait = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#38434f"/><circle cx="40" cy="27" r="15" fill="#b3bdc4"/><path d="M12 80V66a28 28 0 0 1 56 0v14" fill="#b3bdc4"/></svg>');
  const actor = createWarhammerActor({ img: portrait });
  actor.system.details = { status: { value: "Brass 3" } };
  actor.system.details.move = { value: 4, walk: "8", run: "16" };
  actor.system.details.experience = { current: 100, spent: 200, total: 300 };
  actor.system.autoCalc = { walk: true, run: true };
  actor.characteristics = { t: { bonus: 3 } };
  actor.itemTags = { skill: [] };
  actor.system.status.advantage.max = 10;
  actor.advantageGroup = "players";
  const nativeWrites = [], nativeResourceEffects = [];
  let nativeWoundCalls = 0, nativeAdvantageCalls = 0, groupAdvantage = false;
  const groupAdvantageValues = { players: 4, enemies: 2 };
  actor.update = async (...args) => {
    nativeWrites.push(args);
    for (const [path, value] of Object.entries(args[0])) {
      if (!/^system\.status\.(?:(?:wounds|fortune|fate|resolve|resilience|corruption|advantage)\.value|momentum)$/u.test(path)) throw new Error(`unexpected resource path ${path}`);
      const keys = path.split(".");
      keys.slice(0, -1).reduce((record, key) => record[key], actor)[keys.at(-1)] = value;
      if (path === "system.status.corruption.value") nativeResourceEffects.push("corruption");
      if (path === "system.status.momentum") nativeResourceEffects.push("momentum");
      if (path === "system.status.advantage.value" && groupAdvantage) {
        groupAdvantageValues.players = value;
        nativeResourceEffects.push("group-advantage");
        Hooks.emit("updateSetting", { key: "wfrp4e.groupAdvantageValues" }, {});
      }
    }
    Hooks.emit("updateActor", actor, args[0]);
    return actor;
  };
  actor.setWounds = value => { nativeWoundCalls++; return actor.update({ "system.status.wounds.value": value }); };
  actor.setAdvantage = value => { nativeAdvantageCalls++; return actor.update({ "system.status.advantage.value": value }); };
  addWarhammerMagic(actor, use5e);
  const npc = createWarhammerActor({ id: "npc", uuid: "Actor.npc", name: "Guard Captain", type: "npc", img: portrait });
  for (const key of ["system", "items"]) Object.defineProperty(npc, key, { get() { throw new Error("unmapped NPC data read"); } });
  actor.items.push({ id: "injection", type: "skill", name: '<img id="profile-injection" src=x onerror="window.profileInjected=true">',
    system: { total: { value: 10 }, advanced: { value: "bsc" }, grouped: { value: "noSpec" } } });
  globalThis.game = createWarhammerGame([actor, npc]);
  game.user.character = actor;
  game.settings.get = (namespace, key) => namespace === "wfrp4e" ? key === "editionSettings" ? { use5e }
    : key === "useGroupAdvantage" ? groupAdvantage : key === "groupAdvantageValues" ? groupAdvantageValues : key === "advantagemax" ? 10 : false : undefined;
  game.combat = { id: "combat", getCombatantByActor: source => source === actor ? { id: "combatant", actor } : null };
  game.i18n = { localize: key => key === "TYPES.Actor.character" ? "Player Character" : key === "TYPES.Actor.npc" ? "Non-Player Character" : key };
  const applications = enableMobileApplications(scope, { getExistingApplications: () => [], isNativeDialog: app => app?.fixtureNativeRoll === true });
  let nativeDialog;
  const nativeRolls = [];
  const nativeSetups = [];
  let nativeAmmo = 4;
  class WarhammerRollDialogV2 extends EventTarget {}
  globalThis.warhammer = { apps: { WarhammerRollDialogV2 } };
  const setupTest = (kind, target, options = {}, context = {}) => new Promise(resolve => {
    nativeSetups.push({ kind, target, use5e, context, options });
    let settled = false;
    const dialog = Object.assign(new WarhammerRollDialogV2(), { actor, fixtureNativeRoll: true, options: Object.freeze({ modal: true, ...options }), element: document.createElement("section"), close() {
      this.element.remove(); Hooks.emit("closeApplicationV2", this);
      if (!settled && this.options.resolveClose) { settled = true; resolve(undefined); }
      this.dispatchEvent(new Event("close"));
    } });
    dialog.resolve = resolve;
    const finish = test => { settled = true; dialog.submitted = true; resolve(test); dialog.close(); };
    dialog.element.className = "application dialog";
    dialog.element.innerHTML = '<header class="window-header">Native Test<button type="button" data-action="close" aria-label="Close">X</button></header><form class="window-content"><label>Modifier <input name="modifier" type="number" value="0"></label><button type="button" data-native-roll>Roll</button><button type="button" data-native-cancel>Cancel</button></form>';
    dialog.element.querySelector("[data-native-roll]").onclick = () => {
      const modifier = Number(dialog.element.querySelector("input").value);
      finish({ actor, roll: async () => {
        nativeRolls.push({ kind, target, use5e, modifier });
        if (kind === "weapon" && target.system.isRanged) nativeAmmo--;
        if (kind === "channel-spell") target.system.cn.SL = (target.system.cn.SL ?? 0) + 2;
        if (kind === "channel-wind") actor.system.status.channelling.value += 2;
        game.messages.push({ id: `test-${nativeRolls.length}`, content: "Native test result" });
      } });
    };
    dialog.element.querySelector("[data-native-cancel]").onclick = () => dialog.close();
    dialog.element.querySelector('[data-action="close"]').onclick = () => dialog.close();
    document.body.append(dialog.element);
    Hooks.emit("renderApplicationV2", dialog, dialog.element);
    nativeDialog = dialog;
  });
  actor.setupCharacteristic = (key, context, options) => setupTest("characteristic", key, options, context);
  actor.setupSkill = (skill, context, options) => setupTest("skill", skill, options, context);
  actor.setupWeapon = (weapon, context, options) => setupTest("weapon", weapon, options);
  actor.setupCast = (spell, context, options) => setupTest("cast", spell, options);
  actor.setupChannell = (spell, context, options) => setupTest("channel-spell", spell, options);
  actor.setupChannelling = (wind, context, options) => setupTest("channel-wind", wind, options);
  actor.sheet = { actor, castOrChannelPrompt(spell) {
    if (spell.system.lore.value == "petty") return actor.setupCast(spell);
    return new Promise(resolve => {
      let settled = false;
      const dialog = { fixtureNativeRoll: true, options: { modal: true }, element: document.createElement("section"), close() {
        this.element.remove(); Hooks.emit("closeApplicationV2", this);
        if (!settled) { settled = true; resolve(undefined); }
      } };
      dialog.element.className = "application dialog";
      dialog.element.innerHTML = '<header class="window-header">Cast or Channel</header><div class="window-content"><button data-choice="cast">Cast</button><button data-choice="channel">Channel</button><button data-choice="cancel">Cancel</button></div>';
      for (const button of dialog.element.querySelectorAll("button")) button.onclick = () => {
        if (button.dataset.choice === "cancel") { dialog.close(); return; }
        settled = true;
        dialog.close();
        resolve(button.dataset.choice === "cast" ? actor.setupCast(spell) : actor.setupChannell(spell));
      };
      document.body.append(dialog.element);
      Hooks.emit("renderApplicationV2", dialog, dialog.element);
      nativeDialog = dialog;
    });
  } };
  const commandGateway = createFoundryCommandGateway({ getHooks: () => { throw new Error("D&D orchestration used by a Warhammer action"); } });
  const session = createFoundrySessionGateway({ capabilitiesForActor: commandGateway.capabilitiesForActor });
  let state;
  let screen;
  let openedSource = "";
  let watchError;
  const notices = [];
  const commands = {
    reportCharacterMutationError: error => notices.push(error.message),
    localize: (key, fallback) => game.i18n.localize(key) === key ? fallback : game.i18n.localize(key),
    openNativeActorEditor: async request => { openedSource = request.actorSourceUuid; },
    execute: (name, payload) => commandGateway.execute(name, payload, {
      isCurrent: () => !scope.disposed && state.snapshot.selectedActorSourceUuid === payload.actorSourceUuid
    }),
    selectCharacterTab: tab => { state = { ...state, characterTab: tab }; screen.__mcUpdateCharacter({ state, commands }); },
    selectActor: uuid => { state = { ...state, snapshot: session.selectCharacterSource(uuid) }; screen.__mcUpdateCharacter({ state, commands }); }
  };
  state = { characterTab: "overview", snapshot: session.watch(scope, snapshot => {
    state = { ...state, snapshot };
    screen.__mcUpdateCharacter({ state, commands });
  }, error => { watchError = error; }) };
  screen = renderCharacters({ state, commands, scope });
  const viewport = document.createElement("div");
  viewport.className = "mc-viewport";
  viewport.append(screen);
  document.querySelector("main").append(viewport);
  await tick();
  if (document.querySelector("main").dataset.formFactor === "phone") {
    const origin = viewport.getBoundingClientRect().top;
    check("protected phone header reserves exactly four pixels", getComputedStyle(screen).paddingTop === "4px"
      && Math.abs(screen.querySelector('.mc-native-sheet-identity').getBoundingClientRect().top - origin - 4) < 1);
    check("portrait and name both clear the content top", ['.mc-native-sheet-identity img', '.mc-native-sheet-identity h2']
      .every(selector => screen.querySelector(selector).getBoundingClientRect().top >= origin + 4));
  }
  const clickTab = async id => { screen.querySelector(`[data-profile-tab="${id}"]`).click(); await tick(); };
  check("portrait preserves the top of the image", getComputedStyle(screen.querySelector('.mc-native-sheet-identity img')).objectPosition === "50% 0%");
  const field = id => {
    const copy = screen.querySelector(`[data-profile-field="${id}"]`)?.cloneNode(true);
    const counter = copy?.querySelector('.mc-profile-counter');
    if (counter) {
      const value = counter.querySelector('[data-profile-edit]').textContent;
      counter.remove();
      copy.append(value);
    }
    copy?.querySelectorAll("[data-profile-resource]").forEach(editor => editor.remove());
    return copy;
  };
  const encumbranceFits = () => {
    const row = screen.querySelector('[data-profile-field="encumbrance"]');
    const label = row.querySelector("dt"), value = row.querySelector("dd");
    const range = document.createRange(); range.selectNodeContents(label.querySelector("span"));
    const lines = [...range.getClientRects()].filter(rect => rect.width > 0);
    const bounds = row.getBoundingClientRect(), labelBounds = label.getBoundingClientRect(), valueBounds = value.getBoundingClientRect();
    return lines.length === 1 && labelBounds.right <= valueBounds.left && valueBounds.right <= bounds.right + 1
      && Math.abs((labelBounds.top + labelBounds.bottom) - (valueBounds.top + valueBounds.bottom)) < 2;
  };
  check("profile provides native Main/Combat/Skills tabs", ["Main", "Combat", "Skills"].every(label => [...screen.querySelectorAll('[role="tab"]')].some(tab => tab.textContent === label)));
  check("initial shared tab defaults to Main", screen.querySelector('[role="tab"][aria-selected="true"]').textContent === "Main");
  check("native Wounds label and current/max are retained", field("wounds")?.textContent === "Wounds9 / 13");
  check("prepared characteristic totals are used", field("ws")?.textContent === "Weapon Skill41");
  check("zero Fortune remains visible", field("fortune")?.textContent === "Fortune0");
  const cardRect = id => screen.querySelector(`[data-profile-section="${id}"]`).getBoundingClientRect();
  const woundsRect = cardRect('wounds'), corruptionRect = cardRect('corruption'), fateRect = cardRect('fate'), fortuneRect = cardRect('fortune');
  check("Wounds and Corruption share the first resource row", Math.abs(woundsRect.top - corruptionRect.top) < 1 && woundsRect.right <= corruptionRect.left);
  check("Fate and Fortune share the second resource row", Math.abs(fateRect.top - fortuneRect.top) < 1 && fateRect.right <= fortuneRect.left
    && fateRect.top >= Math.max(woundsRect.bottom, corruptionRect.bottom));
  check("paired card controls fit without overlap", ['wounds', 'corruption', 'fate', 'fortune'].every(id => {
    const card = cardRect(id);
    const controls = [...screen.querySelector(`[data-profile-section="${id}"]`).querySelectorAll('[data-profile-counter-delta], [data-profile-edit]')]
      .map(button => button.getBoundingClientRect());
    const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const lock = screen.querySelector(`[data-profile-section="${id}"] [data-profile-counter-lock]`).getBoundingClientRect();
    const label = screen.querySelector(`[data-profile-section="${id}"] dt span`).getBoundingClientRect();
    const bed = screen.querySelector(`[data-profile-section="${id}"] .mc-profile-secondary-action`)?.getBoundingClientRect();
    return !overlap(lock, label) && (!bed || (!overlap(bed, label) && !overlap(bed, lock) && bed.width >= 44 && bed.height >= 44))
      && controls.every((rect, index) => rect.left >= card.left && rect.right <= card.right && rect.width >= 44 && rect.height >= 44
      && controls.slice(index + 1).every(other => !overlap(rect, other)));
  }));
  check("four resource cards begin individually locked", ["wounds", "fortune", "fate", "corruption"].every(id => {
    const row = screen.querySelector(`[data-profile-field="${id}"]`);
    return row.querySelector('[data-profile-counter-lock]').getAttribute('aria-pressed') === 'true'
      && [...row.querySelectorAll('[data-profile-counter-delta], [data-profile-edit]')].every(button => button.disabled);
  }));
  screen.querySelector('[data-profile-counter-lock="fate"]').click();
  check("unlocking one card preserves other locks", !screen.querySelector('[data-profile-edit="fate"]').disabled
    && screen.querySelector('[data-profile-edit="wounds"]').disabled);
  screen.querySelector('[data-profile-counter-lock="fate"]').click();
  check("XP shows Current Spent Total as a read-only table", ['xp-current', 'xp-spent', 'xp-total'].map(id => field(id)?.textContent).join(',') === 'Current100,Spent200,Total300'
    && !screen.querySelector('[data-profile-section="experience"] [data-profile-resource]'));
  const woundsLabel = screen.querySelector('[data-profile-field="wounds"] dt > span');
  const labelRange = document.createRange(); labelRange.selectNodeContents(woundsLabel);
  check("Wounds heading stays readable as a whole word", [...labelRange.getClientRects()].filter(rect => rect.width > 0).length === 1);
  const headingRects = [woundsLabel, screen.querySelector('[data-profile-action="rest"]'), screen.querySelector('[data-profile-counter-lock="wounds"]')]
    .map(element => element.getBoundingClientRect());
  check("Wounds label bed and lock occupy one header row", headingRects.every(rect => Math.abs(rect.top + rect.height / 2 - headingRects[0].top - headingRects[0].height / 2) < 1)
    && headingRects.every((rect, index) => index === 0 || headingRects[index - 1].right <= rect.left + 1));
  const centeredValues = section => [...screen.querySelectorAll(`[data-profile-section="${section}"] dd`)].every(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const text = range.getBoundingClientRect(), cell = element.getBoundingClientRect();
    return getComputedStyle(element).textAlign === 'center' && Math.abs(text.left + text.width / 2 - cell.left - cell.width / 2) < 1;
  });
  check("XP values are centered within their cells", centeredValues('experience'));
  const xpCells = [...screen.querySelectorAll('[data-profile-section="experience"] .mc-profile-row')].map(element => element.getBoundingClientRect());
  check("XP remains a separate three-cell row below resource pairs", xpCells.every(rect => Math.abs(rect.top - xpCells[0].top) < 1)
    && xpCells[0].top >= Math.max(fateRect.bottom, fortuneRect.bottom));
  check("edition-specific Resolve visibility matches native sheet", !!field("resolve") === !use5e);
  check("resource inputs open only on deliberate Edit", !screen.querySelector('.mc-profile-content input, .mc-profile-content textarea, .mc-profile-content [contenteditable]'));
  check("D&D terminology is absent", !/Hit Points|Death Saves|Spell Slots|Attunement|Long Rest/.test(screen.textContent));
  check("Main fits the emulated viewport", screen.getBoundingClientRect().right <= innerWidth + 1);
  check("embedded chooser does not scroll the profile on mount", window.scrollY === 0);
  if (!params.has("layout-only")) {
  const characteristicButton = screen.querySelector('[data-profile-action="characteristic:ws"]');
  characteristicButton.click();
  await tick();
  check("Characteristic button opens an admitted native test dialog", nativeDialog?.element.classList.contains("mc-mobile-admitted-app") && nativeSetups.at(-1).target === "ws");
  check("pending test prevents duplicate taps", characteristicButton.disabled && characteristicButton.getAttribute("aria-busy") === "true");
  check("native test dialog fits the viewport", nativeDialog.element.getBoundingClientRect().left >= -1 && nativeDialog.element.getBoundingClientRect().right <= innerWidth + 1);
  nativeDialog.element.querySelector("input").focus();
  nativeDialog.element.querySelector("input").value = "7";
  nativeDialog.element.querySelector("[data-native-roll]").click();
  await tick();
  check("native dialog input reaches the native roll", nativeRolls.length === 1 && nativeRolls[0].modifier === 7 && nativeRolls[0].use5e === use5e);
  check("native result stays in Chat", game.messages.length === 1 && !screen.querySelector(".mc-roll-result"));
  characteristicButton.click();
  await tick();
  nativeDialog.element.querySelector("[data-native-cancel]").click();
  await tick();
  check("native cancellation releases the button without rolling", !characteristicButton.disabled && nativeRolls.length === 1 && applications.admissions.size === 0);
  for (const dismiss of ["header", "mobile"]) {
    characteristicButton.click(); await tick();
    const reopened = nativeDialog;
    check(`${dismiss} dismissal can reopen the same action`, characteristicButton.disabled && reopened.element.isConnected);
    if (dismiss === "header") reopened.element.querySelector('[data-action="close"]').click();
    else applications.admissions.closeTopmost();
    await tick();
    check(`${dismiss} dismissal releases the action silently`, !characteristicButton.disabled && nativeRolls.length === 1 && notices.length === 0);
  }
  await clickTab("combat");
  check("combat resource follows the edition", use5e ? field("momentum")?.textContent === "MomentumActive" : field("advantage")?.textContent === "Advantage4");
  check("Combat starts with native Encumbrance current/max", screen.querySelector('.mc-profile-content [data-profile-section]').dataset.profileSection === "encumbrance"
    && field("encumbrance")?.textContent === "Encumbrance4.5 / 8");
  check("Encumbrance is read-only", !screen.querySelector('[data-profile-field="encumbrance"] [data-profile-resource]'));
  check("Combat Encumbrance label and value fit on one line", encumbranceFits());
  check("Combat movement table preserves native auto-calculated units", ['move', 'walk', 'run'].map(id => field(id)?.textContent).join(',') === 'Move4,Walk8 yds,Run16 yds'
    && !screen.querySelector('[data-profile-section="movement"] [data-profile-resource]'));
  check("movement values are centered within their cells", centeredValues('movement'));
  if (use5e && innerWidth < 500) check("phone Momentum stacks below Encumbrance", screen.querySelector('[data-profile-section="momentum"]').getBoundingClientRect().top
    >= screen.querySelector('[data-profile-section="encumbrance"]').getBoundingClientRect().bottom);
  actor.system.status.encumbrance.current = "9.75"; actor.system.status.encumbrance.max = 10;
  Hooks.emit("updateActor", actor, { "system.status.encumbrance.current": "9.75" }); await tick();
  check("Combat encumbrance refreshes prepared decimal strings", field("encumbrance")?.textContent === "Encumbrance9.75 / 10");
  await clickTab("trappings");
  check("Trappings starts with the same native Encumbrance counter", screen.querySelector('.mc-profile-content [data-profile-section]').dataset.profileSection === "encumbrance"
    && field("encumbrance")?.textContent === "Encumbrance9.75 / 10");
  check("Encumbrance fits the viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  check("Trappings Encumbrance label and value fit on one line", encumbranceFits());
  check("Trappings shows read-only native Social Status", field("social-status")?.textContent === "Social StatusBrass 3"
    && !screen.querySelector('[data-profile-field="social-status"] [data-profile-resource]'));
  actor.system.details.status.value = "Silver 2";
  Hooks.emit("updateActor", actor, { "system.details.status.value": "Silver 2" }); await tick();
  check("Social Status refreshes after native updates", field("social-status")?.textContent === "Social StatusSilver 2");
  actor.system.details.status.value = "";
  Hooks.emit("updateActor", actor, { "system.details.status.value": "" }); await tick();
  check("missing Social Status is omitted", !field("social-status"));
  await clickTab("combat");
  use5e = !use5e;
  Hooks.emit("updateSetting", { key: "wfrp4e.editionSettings" }, {}, {}, "player");
  await tick();
  check("edition switch refreshes the retained panel", use5e ? !!field("momentum") && !field("advantage") : !!field("advantage") && !field("momentum"));
  await clickTab("skills");
  check("skill totals are read from native prepared data", field("athletics")?.textContent === "Athletics54" && field("language")?.textContent === "Language (Magick)62");
  screen.querySelector('[data-profile-action="skill:athletics"]').click();
  await tick();
  check("Skill action uses its exact native item", nativeSetups.at(-1).target === actor.items.find(item => item.id === "athletics"));
  nativeDialog.element.querySelector("[data-native-roll]").click();
  await tick();
  check("Skill action rolls once through the shared gateway", nativeRolls.length === 2 && nativeRolls[1].kind === "skill");
  check("unidentified items and hidden skills are omitted", !/Unidentified Weapon|Hidden Skill/.test(screen.textContent));
  check("skill names render as text rather than HTML", !document.querySelector("#profile-injection") && !globalThis.profileInjected && screen.textContent.includes('<img id="profile-injection"'));
  check("Skills fits the emulated viewport", screen.getBoundingClientRect().right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
  await clickTab("combat");
  check("native weapon groups appear on Combat", screen.textContent.includes("Melee Weapon(s)") && screen.textContent.includes("Ranged Weapon(s)"));
  check("native DamageString values retain their Damage labels", field("sword")?.textContent === "SwordDamage +7" && field("handgun")?.textContent === "HandgunDamage +8+ 1d10");
  const sword = actor.items.find(item => item.id === "sword");
  const handgun = actor.items.find(item => item.id === "handgun");
  screen.querySelector('[data-profile-action="weapon:sword"]').click();
  await tick();
  check("weapon attack opens a native dialog for the exact equipped Item", nativeSetups.at(-1).kind === "weapon" && nativeSetups.at(-1).target === sword);
  nativeDialog.element.querySelector("[data-native-roll]").click();
  await tick();
  check("melee attack rolls once through the native callback", nativeRolls.length === 3 && nativeRolls[2].target === sword && nativeAmmo === 4);
  screen.querySelector('[data-profile-action="weapon:handgun"]').click();
  await tick();
  nativeDialog.element.querySelector("[data-native-cancel]").click();
  await tick();
  check("cancelled ranged attacks do not consume ammunition", nativeAmmo === 4 && nativeRolls.length === 3);
  screen.querySelector('[data-profile-action="weapon:handgun"]').click();
  await tick();
  check("ranged setup receives the exact equipped Item", nativeSetups.at(-1).target === handgun);
  nativeDialog.element.querySelector("[data-native-roll]").click();
  await tick();
  check("ranged attack consumption belongs to the native callback", nativeAmmo === 3 && nativeRolls.length === 4 && nativeRolls[3].target === handgun);
  screen.querySelector('[data-profile-action="weapon:sword"]').click();
  await tick();
  sword.system.isEquipped = false;
  Hooks.emit("updateItem", sword, { "system.equipped.value": false });
  await tick();
  check("equipment changes remove stale mobile attack controls", !screen.querySelector('[data-profile-action="weapon:sword"]'));
  nativeDialog.element.querySelector("[data-native-roll]").click();
  await tick();
  check("a stale native attack confirmation does not roll", nativeRolls.length === 4 && applications.admissions.size === 0);
  sword.system.isEquipped = true;
  Hooks.emit("updateItem", sword, { "system.equipped.value": true });
  await tick();
  check("re-equipping refreshes the current attack descriptor", !!screen.querySelector('[data-profile-action="weapon:sword"]'));
  check("Combat weapon panels fit the emulated viewport", screen.getBoundingClientRect().right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
  use5e = initial5e;
  Hooks.emit("updateSetting", { key: "wfrp4e.editionSettings" }, {}, {}, "player");
  await tick();
  await clickTab("magic");
  check("Magic uses native Petty Spell and Lore Spell groups", screen.textContent.includes("Petty Spell") && screen.textContent.includes("Lore Spell"));
  check("Lore spells display native CN while Petty spells show names", field("lore")?.textContent === "BoltCN 4" && field("petty")?.textContent === "Light");
  check("Wind channelling follows the edition", !!screen.querySelector('[data-profile-action="wind:aqshy"]') === use5e);
  check("Magic fits the emulated viewport", screen.getBoundingClientRect().right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
  const magicRolls = nativeRolls.length;
  screen.querySelector('[data-profile-action="spell:lore"]').click();
  await tick();
  if (!use5e) {
    check("4e opens an admitted native Cast/Channel choice", !!nativeDialog.element.querySelector('[data-choice="channel"]') && nativeDialog.element.classList.contains("mc-mobile-admitted-app"));
    nativeDialog.element.querySelector('[data-choice="channel"]').click();
    await tick();
  }
  check("magic setup receives the exact spell and correct workflow", nativeSetups.at(-1).target === actor.items.find(item => item.id === "lore") && nativeSetups.at(-1).kind === (use5e ? "cast" : "channel-spell"));
  nativeDialog.element.querySelector('[data-native-roll]').click();
  await tick();
  check("magic confirmation rolls once and retains native chat", nativeRolls.length === magicRolls + 1 && game.messages.length === nativeRolls.length);
  check("4e channelled SL belongs to the native callback", use5e || actor.items.find(item => item.id === "lore").system.cn.SL === 2);
  screen.querySelector('[data-profile-action="spell:petty"]').click();
  await tick();
  check("Petty spells go directly to native casting setup", nativeSetups.at(-1).kind === "cast" && nativeSetups.at(-1).target.id === "petty");
  nativeDialog.element.querySelector('[data-native-cancel]').click();
  await tick();
  check("cancelled magic preserves native resources", nativeRolls.length === magicRolls + 1 && actor.system.status.channelling.value === 3 && applications.admissions.size === 0);
  if (use5e) {
    screen.querySelector('[data-profile-action="wind:aqshy"]').click();
    await tick();
    check("5e Wind setup receives a key rather than a spell", nativeSetups.at(-1).target === "aqshy" && nativeSetups.at(-1).kind === "channel-wind");
    nativeDialog.element.querySelector('[data-native-roll]').click();
    await tick();
    check("5e native Wind confirmation rolls once", nativeRolls.length === magicRolls + 2);
    check("5e channelled power belongs to the native callback", actor.system.status.channelling.value === 5);
  } else {
    screen.querySelector('[data-profile-action="spell:lore"]').click();
    await tick();
    nativeDialog.element.querySelector('[data-choice="cancel"]').click();
    await tick();
    check("4e choice cancellation creates no setup or roll", nativeRolls.length === magicRolls + 1 && applications.admissions.size === 0);
  }
  const beforeStaleMagic = nativeRolls.length;
  screen.querySelector('[data-profile-action="spell:lore"]').click();
  await tick();
  if (!use5e) { nativeDialog.element.querySelector('[data-choice="cast"]').click(); await tick(); }
  const loreSpell = actor.items.find(item => item.id === "lore");
  loreSpell.visible = false;
  Hooks.emit("updateItem", loreSpell, {});
  await tick();
  check("hidden spells remove mobile magic controls", !screen.querySelector('[data-profile-action="spell:lore"]'));
  nativeDialog.element.querySelector('[data-native-roll]').click();
  await tick();
  check("stale spell confirmation cannot roll", nativeRolls.length === beforeStaleMagic && applications.admissions.size === 0);
  loreSpell.visible = true;
  Hooks.emit("updateItem", loreSpell, {});
  await tick();
  await clickTab("main");
  const edit = async id => {
    const lock = screen.querySelector(`[data-profile-counter-lock="${id}"]`);
    if (lock?.getAttribute('aria-pressed') === 'true') lock.click();
    screen.querySelector(`[data-profile-edit="${id}"]`).click(); await tick();
    return screen.querySelector(`[data-profile-resource-input="${id}"]`);
  };
  const saveResource = async input => { input.dispatchEvent(new Event("input", { bubbles: true })); input.closest("form").querySelector("[data-profile-resource-save]").click(); await tick(); };
  check("native rolls did not cause Mikelandia Controls resource writes", nativeWrites.length === 0);
  let resourceInput = await edit("wounds");
  check("Wounds editor retains native limits, selectable text and keyboard focus", resourceInput.max === "13" && resourceInput.min === "0" && resourceInput.type === "text" && document.activeElement === resourceInput && resourceInput.selectionStart === 0 && resourceInput.selectionEnd === resourceInput.value.length);
  resourceInput.value = "0";
  resourceInput.closest("form").querySelector("[data-profile-resource-cancel]").click();
  await tick();
  check("cancelling a resource editor performs no update", nativeWrites.length === 0 && !screen.querySelector("[data-profile-resource-input]"));
  resourceInput = await edit("wounds");
  resourceInput.value = "14";
  await saveResource(resourceInput);
  check("resource form rejects values over the native maximum", nativeWrites.length === 0 && resourceInput.validity.customError);
  resourceInput.value = "";
  await saveResource(resourceInput);
  check("empty input cannot become zero", nativeWrites.length === 0 && resourceInput.validity.valueMissing);
  resourceInput.value = "0";
  await saveResource(resourceInput);
  check("saving zero Wounds invokes the native setter and refreshes", nativeWoundCalls === 1 && nativeWrites.length === 1 && field("wounds").textContent === "Wounds0 / 13");
  check("resource save does not create a roll or extra chat", nativeRolls.length === beforeStaleMagic && game.messages.length === nativeRolls.length);
  resourceInput = await edit("fortune");
  resourceInput.value = "5";
  await saveResource(resourceInput);
  check("Fortune may exceed Fate as on the native sheet", field("fortune").textContent === "Fortune5" && nativeWrites.at(-1).length === 1);
  resourceInput = await edit("corruption");
  resourceInput.value = "8";
  await saveResource(resourceInput);
  check("Corruption may exceed its threshold and retains native side effects", field("corruption").textContent === "Corruption8 / 7" && nativeResourceEffects.includes("corruption"));
  const beforeStaleSave = nativeWrites.length;
  resourceInput = await edit("wounds");
  resourceInput.value = "2";
  actor.system.status.wounds.value = 1;
  await saveResource(resourceInput);
  check("a stale resource save is rejected with a toast, not sheet text", nativeWrites.length === beforeStaleSave && notices.at(-1).includes("This resource changed") && !screen.textContent.includes("This resource changed"));
  resourceInput.closest("form").querySelector("[data-profile-resource-cancel]").click();
  Hooks.emit("updateActor", actor, {});
  await tick();
  resourceInput = await edit("wounds");
  use5e = !use5e;
  resourceInput.value = "2";
  await saveResource(resourceInput);
  check("a changed edition invalidates an editor with a toast", nativeWrites.length === beforeStaleSave && notices.at(-1).includes("This resource changed") && !screen.textContent.includes("This resource changed"));
  use5e = initial5e;
  Hooks.emit("updateSetting", { key: "wfrp4e.editionSettings" }, {});
  await tick();
  resourceInput = await edit("wounds");
  const staleForm = resourceInput.closest("form");
  commands.selectActor(npc.uuid);
  await tick();
  staleForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  check("actor selection disposes a draft resource editor without saving", nativeWrites.length === beforeStaleSave);
  commands.selectActor(actor.uuid);
  await tick();
  await clickTab("combat");
  if (use5e) {
    resourceInput = screen.querySelector('[data-profile-resource-input="momentum"]');
    check("Momentum uses a labeled checkbox", resourceInput.type === "checkbox" && resourceInput.getAttribute("aria-label") === "Momentum");
    const momentumAligned = () => {
      const input = screen.querySelector('[data-profile-resource-input="momentum"]').getBoundingClientRect();
      const value = screen.querySelector('[data-profile-field="momentum"] dd').getBoundingClientRect();
      return input.height === 20 && Math.abs(input.top + input.height / 2 - value.top - value.height / 2) <= 1;
    };
    check("Active Momentum checkbox is centered beside its value", momentumAligned());
    check("Momentum has no pencil or save form", !screen.querySelector('[data-profile-edit="momentum"]') && !resourceInput.closest("form"));
    const execute = commands.execute;
    let complete;
    commands.execute = () => new Promise(resolve => { complete = resolve; });
    resourceInput.click();
    check("Momentum disables while saving", resourceInput.disabled && resourceInput.getAttribute("aria-busy") === "true");
    complete({ cancelled: true }); await tick();
    check("cancelled Momentum restores its value", resourceInput.checked && !resourceInput.disabled);
    commands.execute = async () => { throw new Error("Momentum write failed"); };
    resourceInput.click(); await tick();
    check("failed Momentum restores its value and reports the error", resourceInput.checked && !resourceInput.disabled && notices.at(-1) === "Momentum write failed");
    commands.execute = execute;
    resourceInput.click(); await tick();
    check("Momentum updates natively and refreshes", field("momentum").textContent === "MomentumInactive" && nativeResourceEffects.includes("momentum"));
    resourceInput = screen.querySelector('[data-profile-resource-input="momentum"]');
    check("Momentum checkbox refreshes off", !resourceInput.checked);
    check("Inactive Momentum checkbox is centered beside its value", momentumAligned());
    resourceInput.click(); await tick();
    check("Momentum toggles back on immediately", screen.querySelector('[data-profile-resource-input="momentum"]').checked && field("momentum").textContent === "MomentumActive");
  } else {
    resourceInput = await edit("advantage");
    resourceInput.value = "7";
    await saveResource(resourceInput);
    check("Advantage uses its native setter and cap", nativeAdvantageCalls === 1 && field("advantage").textContent === "Advantage7");
    groupAdvantage = true;
    actor.system.status.advantage.value = groupAdvantageValues.players;
    Hooks.emit("updateSetting", { key: "wfrp4e.useGroupAdvantage" }, {});
    await tick();
    resourceInput = await edit("advantage");
    check("Group Advantage has its native label and no personal cap", resourceInput.getAttribute("aria-label") === "Group Advantage" && !resourceInput.hasAttribute("max"));
    resourceInput.value = "12";
    await saveResource(resourceInput);
    check("Group Advantage synchronization belongs to the native update", nativeAdvantageCalls === 2 && groupAdvantageValues.players === 12 && nativeResourceEffects.includes("group-advantage"));
    game.combat = null;
    Hooks.emit("deleteCombat", { id: "combat" });
    await tick();
    check("leaving combat removes the Group Advantage editor", !screen.querySelector('[data-profile-edit="advantage"]'));
    groupAdvantage = false;
    Hooks.emit("updateSetting", { key: "wfrp4e.useGroupAdvantage" }, {});
    await tick();
  }
  check("resource editors fit the emulated viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  await clickTab("main");
  actor.system.status.wounds.value = 0;
  Hooks.emit("updateActor", actor, { "system.status.wounds.value": 0 });
  await tick();
  check("native actor updates refresh zero-valued counters", field("wounds")?.textContent === "Wounds0 / 13");
  for (const id of ["wounds", "fortune", "fate", "corruption"]) {
    const lock = screen.querySelector(`[data-profile-counter-lock="${id}"]`);
    if (lock.getAttribute('aria-pressed') === 'true') lock.click();
    const value = actor.system.status[id].value;
    screen.querySelector(`[data-profile-field="${id}"] [data-profile-counter-delta="1"]`).click(); await tick();
    check(`${id} plus saves immediately through native updates`, actor.system.status[id].value === value + 1);
    screen.querySelector(`[data-profile-field="${id}"] [data-profile-counter-delta="-1"]`).click(); await tick();
    check(`${id} minus saves immediately through native updates`, actor.system.status[id].value === value);
  }
  [...screen.querySelectorAll("button")].find(button => button.textContent === "Open Character Sheet").click();
  await tick();
  check("native-sheet fallback uses the exact actor source", openedSource === actor.uuid);
  screen.querySelector(".mc-character-select-trigger").click();
  screen.querySelector('[data-actor-source="Actor.npc"]').click();
  await tick();
  check("unmapped NPCs retain safe native access", !screen.querySelector(".mc-profile-content") && screen.querySelector("h2").textContent === "Guard Captain");
  screen.querySelector(".mc-character-select-trigger").click();
  screen.querySelector('[data-actor-source="Actor.hero"]').click();
  await tick();
  use5e = initial5e;
  actor.system.status.wounds.value = 9;
  Hooks.emit("updateSetting", { key: "wfrp4e.editionSettings" }, {}, {}, "player");
  await tick();
  check("session watcher remains healthy after profile/native transitions", !watchError && state.snapshot.selectedActor.presentation === "profile");
  check("profile updates do not scroll to the actor chooser", window.scrollY === 0);
  for (const [id, type, system] of [
    ["rope", "trapping", { quantity: { value: 2 }, description: { value: "<p>A sturdy rope</p>" } }],
    ["talent", "talent", { description: { value: "<p>A native talent</p>" } }]
  ]) { const item = { id, name: id, type, system, parent: actor, uuid: `${actor.uuid}.Item.${id}` }; actor.items.push(item); Hooks.emit("createItem", item, {}); }
  await tick(); await clickTab("trappings");
  check("Trappings has a mobile tab with native quantity", screen.querySelector('[data-profile-field="rope"]').textContent.includes("2"));
  screen.querySelector("details").open = true;
  check("Trappings descriptions are readable on mobile", screen.querySelector("details").textContent.includes("A sturdy rope"));
  await clickTab("talents");
  check("Talents has its own nonempty mobile tab", screen.querySelector('[data-profile-field="talent"]').textContent.includes("A native talent"));
  check("new tabs fit the phone and tablet widths", document.documentElement.scrollWidth <= innerWidth + 1);
  await clickTab("main");
  const restButton = () => screen.querySelector('[data-profile-action="rest"]');
  const execute = commands.execute;
  let finishSave;
  commands.execute = () => new Promise(resolve => { finishSave = resolve; });
  const pendingInput = await edit('wounds');
  pendingInput.closest('form').requestSubmit(); await tick();
  check("numeric save disables the relocated Wounds lock", screen.querySelector('[data-profile-counter-lock="wounds"]').disabled && pendingInput.disabled);
  check("recovery remains independent during a counter save", !restButton().disabled);
  finishSave({ cancelled: true }); await tick();
  check("numeric completion restores the relocated Wounds lock", !screen.querySelector('[data-profile-counter-lock="wounds"]').disabled);
  screen.querySelector('[data-profile-field="wounds"] [data-profile-counter-delta="1"]').click(); await tick();
  check("instant adjustment disables the relocated Wounds lock", screen.querySelector('[data-profile-counter-lock="wounds"]').disabled);
  finishSave({ cancelled: true }); await tick();
  check("instant completion restores the relocated Wounds lock", !screen.querySelector('[data-profile-counter-lock="wounds"]').disabled);
  commands.execute = execute;
  const beforeRecovery = { rolls: nativeRolls.length, writes: nativeWrites.length, messages: game.messages.length };
  restButton().click(); await tick();
  check("recovery opens native Toughness fallback with native context", nativeSetups.at(-1).kind === 'characteristic' && nativeSetups.at(-1).target === 't'
    && JSON.stringify(nativeSetups.at(-1).context) === JSON.stringify({ rest: true, tb: 3, skipTargets: true }) && nativeSetups.at(-1).options.resolveClose);
  check("recovery prevents duplicate taps", restButton().disabled);
  nativeDialog.element.querySelector('[data-native-cancel]').click(); await tick();
  check("recovery cancellation releases its control without healing", !restButton().disabled && nativeRolls.length === beforeRecovery.rolls && nativeWrites.length === beforeRecovery.writes);
  const endurance = { id: 'endurance', name: 'Endurance', type: 'skill', parent: actor, system: {} };
  actor.items.push(endurance); actor.itemTags.skill = [endurance];
  Hooks.emit('updateActor', actor, {}); await tick();
  restButton().click(); await tick();
  check("recovery prefers exact native Endurance item", nativeSetups.at(-1).kind === 'skill' && nativeSetups.at(-1).target === endurance);
  nativeDialog.element.querySelector('[data-native-roll]').click(); await tick();
  check("recovery rolls once into Chat without direct Wounds writes", nativeRolls.length === beforeRecovery.rolls + 1 && game.messages.length === beforeRecovery.messages + 1 && nativeWrites.length === beforeRecovery.writes);
  }
  if (params.has("layout-only")) {
    await clickTab("combat");
    const movementCells = [...screen.querySelectorAll('[data-profile-section="movement"] .mc-profile-row')].map(element => element.getBoundingClientRect());
    check("movement retains three readable cells at narrow enlarged text", movementCells.length === 3
      && movementCells.every(rect => Math.abs(rect.top - movementCells[0].top) < 1 && rect.left >= 0 && rect.right <= innerWidth));
    check("movement values retain native units at narrow enlarged text", ['move', 'walk', 'run'].map(id => field(id)?.textContent).join(',') === 'Move4,Walk8 yds,Run16 yds');
    check("movement values are centered at narrow enlarged text", centeredValues('movement'));
    await clickTab("main");
    screen.querySelector('.mc-profile-summary-counter-pairs').scrollIntoView({ block: "center" });
  }
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  scope.dispose();
  document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
