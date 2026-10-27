import { createShadowdarkFixture } from "/tests/helpers/shadowdark.mjs";
import { createActor, collection } from "/tests/helpers/foundry.mjs";
import { createFoundrySessionGateway } from "/src/foundry/session-gateway.mjs";
import { createFoundryCommandGateway } from "/src/foundry/command-gateway.mjs";
import { enableMobileApplications, mobileDialogElements } from "/src/foundry/mobile-presentation.mjs";
import { resolveSystemIntegration } from "/src/systems/registry.mjs";
import { renderCharacters } from "/src/features/characters/presenter.mjs";
import { createTaskScope } from "/src/kernel/task-scope.mjs";
import { createVeBackDispatcher } from "/src/ui/ve-back-dispatcher.mjs";

const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const scope = createTaskScope("shadowdark-browser");
try {
  const params = new URLSearchParams(location.search), initialPulp = params.get("pulp") === "true";
  document.querySelector("main").dataset.formFactor = params.get("layout") ?? "phone";
  if (params.has("large")) document.querySelector("main").style.setProperty("font-size", "24px", "important");
  const f = createShadowdarkFixture({ pulp: initialPulp });
  globalThis.game = f.game; globalThis.Hooks = f.hooks;
  game.i18n = { localize: key => key };
  const dsnStyle = document.createElement("style");
  dsnStyle.textContent = ".dsn-hide { display: none !important; }";
  document.head.append(dsnStyle);
  const chatScreen = document.createElement("section");
  chatScreen.className = "ve-native-chat-screen";
  chatScreen.style.cssText = "position:absolute;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;visibility:hidden";
  chatScreen.innerHTML = '<div id="chat" class="ve-native-chat"><div class="chat-log"><div class="chat-message"><div class="dice-roll dsn-hide"></div></div></div></div>';
  document.querySelector("main").append(chatScreen);
  const hiddenRollCard = chatScreen.querySelector(".dsn-hide");
  const unrelatedHiddenCard = document.createElement("div");
  unrelatedHiddenCard.className = "dsn-hide";
  document.body.append(unrelatedHiddenCard);
  check("VE native chat reveals Dice So Nice roll content during animation", getComputedStyle(hiddenRollCard).display === "block");
  const wholeCard = document.createElement("li");
  wholeCard.className = "message chat-message dsn-hide";
  chatScreen.querySelector(".chat-log").append(wholeCard);
  check("VE native chat reveals the complete Shadowdark card hidden by DSN", getComputedStyle(wholeCard).display === "flex");
  check("Dice So Nice visibility remains unchanged outside VE native chat", getComputedStyle(unrelatedHiddenCard).display === "none");
  chatScreen.remove(); unrelatedHiddenCard.remove(); dsnStyle.remove();
  f.actor.img = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#39413d"/><circle cx="40" cy="28" r="17" fill="#b3bdb6"/></svg>');
  const npc = createActor({ id: "npc", uuid: "Actor.npc", type: "NPC", name: "Native NPC" });
  for (const key of ["system", "items"]) Object.defineProperty(npc, key, { get() { throw new Error("NPC data must stay native"); } });
  game.actors = collection([f.actor, npc]);
  const integration = resolveSystemIntegration("shadowdark");
  const admissions = enableMobileApplications(scope, {
    getExistingApplications: () => [],
    isNativeDialog: application => integration.isNativeDialog(application)
  });
  let dialog, omitRenderHook = false;
  f.prompt = (kind, target, config) => new Promise(resolve => {
    let settled = false;
    const application = { id: "sd-roll-dialog", element: document.createElement("form"), close() {
      this.element.remove(); Hooks.emit("closeApplicationV2", this);
      if (!settled) { settled = true; resolve(false); }
    } };
    application.element.className = "application";
    application.element.id = "sd-roll-dialog";
    application.element.innerHTML = '<header class="window-header"><h1 class="window-title">check</h1></header><div class="application-content"><label>Bonus <input type="number" value="0"></label><button type="button" data-native-confirm>Roll</button><button type="button" data-native-cancel>Cancel</button></div>';
    application.element.querySelector("[data-native-confirm]").onclick = () => {
      config.nativeInput = Number(application.element.querySelector("input").value);
      settled = true; application.close(); resolve(true);
    };
    application.element.querySelector("[data-native-cancel]").onclick = () => application.close();
    document.body.append(application.element);
    if (!omitRenderHook) Hooks.emit("renderApplicationV2", application, application.element);
    dialog = application;
  });
  const gateway = createFoundryCommandGateway();
  const session = createFoundrySessionGateway({ capabilitiesForActor: gateway.capabilitiesForActor });
  let state, screen, watchError;
  const notices = [];
  const commands = {
    reportCharacterMutationError: error => notices.push(error.message),
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
  check("Shadowdark V2 roll dialog has a DOM admission fallback", mobileDialogElements(document.body).includes(dialog.element));
  check("native V2 roll dialog keeps modal admission", dialog.element.classList.contains("ve-mobile-dialog")
    && document.body.classList.contains("ve-mobile-dialog-open"));
  check("native Check title is capitalized", getComputedStyle(dialog.element.querySelector(".window-title")).textTransform === "capitalize");
  check("native modal backdrop avoids full-screen blur", getComputedStyle(document.querySelector(".ve-mobile-app"), "::after").backdropFilter === "none");
  check("pending action blocks duplicate taps", screen.querySelector('[data-profile-action="stat:str"]').disabled);
  dialog.element.querySelector("input").value = "3"; await confirm();
  check("native stat workflow runs once with native input", f.rolls.length === 1 && f.calls[0].config.nativeInput === 3);
  check("roll completion leaves no confirmation in the sheet", !screen.querySelector('.ve-profile-action-status') && !screen.textContent.includes('Native workflow finished'));
  check("scoped native hook is removed after completion", Hooks.count("SD-Stat-Check") === 0);
  omitRenderHook = true;
  await begin("stat:str");
  check("DOM-only Shadowdark roll dialog is admitted as modal", dialog.element.classList.contains("ve-mobile-dialog")
    && document.body.classList.contains("ve-mobile-dialog-open"));
  await cancel();
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
  const resourceOrder = [...screen.querySelectorAll('.ve-profile-summary-triple > section')].map(e => e.dataset.profileSection);
  check("Shadowdark resources use HP/AC/DEF, XP/Grit/Luck order", resourceOrder.join(",") === "hp,ac,def,xp,grit,luck");
  check("resource labels appear once inside their boxes", !screen.querySelector('.ve-profile-summary-triple h3'));
  const boxes = resourceOrder.map(id => screen.querySelector(`[data-profile-section="${id}"]`).getBoundingClientRect());
  check("Shadowdark resources have three cards per row", [0, 3].every(i => [1, 2].every(j => Math.abs(boxes[i].top - boxes[i + j].top) < 1)) && boxes[3].top > boxes[0].top);
  check("short resource labels fit on one line", resourceOrder.every(id => {
    const range = document.createRange(); range.selectNodeContents(screen.querySelector(`[data-profile-field="${id}"] dt span`));
    return range.getClientRects().length === 1;
  }));
  check("resource pencils align with labels at the top right", ["hp", "xp", "def", "grit", "luck"].every(id => {
    const pencil = screen.querySelector(`[data-profile-edit="${id}"] i`).getBoundingClientRect();
    const button = screen.querySelector(`[data-profile-edit="${id}"]`).getBoundingClientRect();
    const row = screen.querySelector(`[data-profile-field="${id}"]`).getBoundingClientRect();
    return Math.abs(pencil.right - (row.right - 4)) < 2 && pencil.top <= row.top + 10 && pencil.width > 0 && button.height >= 44;
  }));
  check("resource values have an extra inset from the left", resourceOrder.every(id => {
    const row = screen.querySelector(`[data-profile-field="${id}"]`), text = row.querySelector("dd span");
    return text.getBoundingClientRect().left >= row.getBoundingClientRect().left + 12;
  }));
  for (const id of ["def", "grit"]) {
    const custom = await resource(id);
    if (id === "def") {
      check("integer resources use selectable text inputs with a numeric keyboard", custom.type === "text"
        && custom.inputMode === "numeric" && custom.pattern === "[0-9]*");
      custom.value = "3.5";
      custom.dispatchEvent(new Event("input", { bubbles: true }));
      check("integer resources reject fractional values", !custom.checkValidity());
      custom.value = "3";
      custom.dispatchEvent(new Event("input", { bubbles: true }));
    }
    custom.value = "3"; await save(custom);
    check(`${id} saves and refreshes its PC flag`, f.actor.flags["ve-mobile"].shadowdarkResources[id] === 3 && field(id).endsWith("3"));
  }
  let input = await resource("xp"); input.value = "19"; await save(input);
  check("XP uses native current XP and saves to the native field", f.actor.system.level.xp === 19 && field("xp") === "XP19");
  input = await resource("hp"); input.value = "0"; await save(input);
  check("zero HP saves through native updates and refreshes", field("hp") === "HP0 / 12" && f.writes.some(write => write[0]["system.attributes.hp.value"] === 0));
  input = await resource("luck");
  check("Luck editor has selectable numeric/boolean mode", input.type === (initialPulp ? "text" : "checkbox"));
  if (initialPulp) input.value = "4"; else input.checked = false;
  await save(input);
  check("Luck save refreshes the correct native field", field("luck") === (initialPulp ? "Luck4" : "LuckInactive"));
  await tab("spells");
  check("known and lost spells use separate sections", screen.textContent.includes("Spells Known") && screen.textContent.includes("Lost Spells") && !screen.querySelector('[data-profile-action="spell:lost"]'));
  f.success = false; await begin("spell:spell"); await confirm();
  check("failed casting retains native spell loss", f.rolls.length === 3 && f.actor.items.get("spell").system.lost && !screen.querySelector('[data-profile-action="spell:spell"]'));
  check("spell hook is removed after failure", Hooks.count("SD-Player-Spell") === 0);
  await tab("inventory");
  const quantity = () => screen.querySelector('[data-profile-resource="quantity:torch"]');
  check("carried gear has three touch-friendly quantity controls", quantity().querySelectorAll("button").length === 3 && [...quantity().querySelectorAll("button")].every(b => b.getBoundingClientRect().height >= 44));
  quantity().querySelector('[data-profile-quantity-delta="1"]').click(); await tick();
  check("quantity increment persists and refreshes", f.actor.items.get("torch").system.quantity === 2 && quantity().querySelector('[data-profile-edit]').textContent === "2");
  input = await resource("quantity:torch"); input.value = "0"; await save(input);
  check("saving zero deletes the native item and mobile row", !f.actor.items.get("torch") && !quantity());
  const restoredTorch = { id: "torch", uuid: f.actor.uuid + ".Item.torch", type: "Basic", name: "Torch", parent: f.actor,
    system: { isPhysical: true, isIdentified: true, stashed: false, quantity: 1, slots: { per_slot: 20 }, light: { isSource: true, active: false, remainingSecs: 3600 } } };
  f.actor.items.push(restoredTorch); Hooks.emit("createItem", restoredTorch, {}); await tick();
  const nativeQuantityUpdate = f.actor.updateEmbeddedDocuments;
  f.actor.updateEmbeddedDocuments = async () => { throw new Error("quantity write failure"); };
  quantity().querySelector('[data-profile-quantity-delta="1"]').click(); await tick();
  check("failed quantity writes restore original boundary controls", !quantity().querySelector('[data-profile-quantity-delta="-1"]').disabled && !quantity().querySelector('[data-profile-quantity-delta="1"]').disabled);
  f.actor.updateEmbeddedDocuments = nativeQuantityUpdate;
  check("inventory has no redundant Open sheet button", ![...screen.querySelectorAll('.ve-profile-inventory-tools button')].some(b => b.textContent === "Open sheet"));
  check("inventory has no token-light buttons", !screen.querySelector('[data-profile-action^="light:"]'));
  check("quantity controls reserve their full width in item flow", getComputedStyle(quantity()).position === "static");
  screen.querySelector('[data-profile-add-item]').click(); await tick();
  const chooser = document.querySelector('.ve-profile-inventory-choice');
  check("Add item opens a focused modal without rendering either form", chooser?.getAttribute("aria-modal") === "true"
    && chooser.contains(document.activeElement) && !screen.querySelector('.ve-profile-custom-item, .ve-profile-catalog-results'));
  chooser.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
  check("choice modal wraps keyboard focus", document.activeElement === chooser.querySelector('button:last-child'));
  chooser.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  check("Escape dismisses the chooser and returns focus", !chooser.isConnected && document.activeElement === screen.querySelector('[data-profile-add-item]'));
  screen.querySelector('[data-profile-add-item]').click(); await tick();
  const back = createVeBackDispatcher({ getState: () => ({ route: "characters" }), commands, getRoot: () => document.querySelector("main") });
  check("VE Back dismisses the chooser", back.back() === "inventory-choice" && !document.querySelector('.ve-profile-inventory-choice'));
  screen.querySelector('[data-profile-add-item]').click(); await tick();
  document.querySelector('[data-profile-item-mode="custom"]').click(); await tick();
  check("custom choice renders only its inline form", !!screen.querySelector('.ve-profile-custom-item') && !document.querySelector('.ve-profile-inventory-choice, .ve-profile-catalog-results'));
  const customForm = screen.querySelector('.ve-profile-custom-item');
  check("custom creation has no item type selector", !customForm.querySelector("select"));
  const slotsInput = customForm.querySelector('[data-profile-custom-weight="slotsUsed"]'), perInput = customForm.querySelector('[data-profile-custom-weight="perQuantity"]');
  check("custom weight starts at one slot per item", slotsInput.value === "1" && perInput.value === "1");
  perInput.value = "0"; perInput.dispatchEvent(new Event("input", { bubbles: true }));
  check("custom weight rejects a zero quantity denominator", !customForm.checkValidity());
  perInput.value = "1"; perInput.dispatchEvent(new Event("input", { bubbles: true }));
  slotsInput.value = "1.5"; slotsInput.dispatchEvent(new Event("input", { bubbles: true }));
  check("custom weight rejects fractions", !customForm.checkValidity());
  slotsInput.value = "0"; slotsInput.dispatchEvent(new Event("input", { bubbles: true }));
  check("custom weight allows weightless gear", slotsInput.checkValidity() && perInput.checkValidity());
  slotsInput.value = "2"; slotsInput.dispatchEvent(new Event("input", { bubbles: true }));
  customForm.querySelector('input').value = "Mobile Rope"; customForm.querySelector('button').click(); await tick();
  check("custom acquisition creates Basic with native slot fields", f.actor.items.some(item => item.name === "Mobile Rope" && item.type === "Basic"
    && item.system.quantity === 1 && item.system.slots.slots_used === 2 && item.system.slots.per_slot === 1 && item.system.slots.free_carry === 0));
  check("custom addition removes its temporary editor", !screen.querySelector('.ve-profile-custom-item') && !screen.querySelector('[data-profile-add-item]').hidden);
  const mobileRope = f.actor.items.find(item => item.name === "Mobile Rope");
  const ropeQuantity = () => screen.querySelector(`[data-profile-resource="quantity:${mobileRope.id}"]`);
  check("new custom items can increase beyond one unit per slot", !ropeQuantity().querySelector('[data-profile-quantity-delta="1"]').disabled);
  ropeQuantity().querySelector('[data-profile-quantity-delta="1"]').click(); await tick();
  check("custom increment saves native quantity without changing weight", mobileRope.system.quantity === 2 && mobileRope.system.slots.per_slot === 1 && mobileRope.system.slots.slots_used === 2);
  ropeQuantity().querySelector('[data-profile-quantity-delta="-1"]').click(); await tick();
  screen.querySelector(`[data-profile-resource="quantity:${mobileRope.id}"] [data-profile-quantity-delta="-1"]`).click(); await tick();
  check("decrementing from one deletes the native item and mobile row", !f.actor.items.get(mobileRope.id) && !screen.querySelector(`[data-profile-field="${mobileRope.id}"]`));
  game.items = collection(Array.from({ length: 125 }, (_, i) => ({ id: 'catalog' + i, uuid: 'Item.catalog' + i,
    name: 'Catalog Rope ' + String(i).padStart(3, '0'), type: 'Basic', system: { isPhysical: true } })));
  let indexLoads = 0;
  game.packs = collection([{ documentName: "Item", visible: true, collection: "test.gear", title: "Gear",
    getIndex: async () => { indexLoads++; return [{ _id: "cafe", name: "Café Lantern", type: "Basic" }]; } }]);
  const openCatalog = async () => {
    screen.querySelector('[data-profile-add-item]').click(); await tick();
    document.querySelector('[data-profile-item-mode="catalog"]').click(); await tick();
  };
  await openCatalog();
  const results = screen.querySelector('.ve-profile-catalog-results'), search = screen.querySelector('input[type="search"]');
  check("catalog loads automatically with all results beyond 100", indexLoads === 1 && results.querySelectorAll('button').length === 126 && !screen.querySelector('.ve-profile-custom-item'));
  check("catalog has a bounded scrollable results list", results.scrollHeight > results.clientHeight && results.clientHeight > 0 && getComputedStyle(results).overflowY === 'auto');
  results.scrollTop = results.scrollHeight; await tick();
  check("catalog scrolling reaches the final item", results.scrollTop > 0 && results.lastElementChild.getBoundingClientRect().bottom <= results.getBoundingClientRect().bottom + 1);
  search.value = '124 world rope'; search.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  check("catalog filters automatically by unordered name and source words", results.children.length === 1 && results.firstElementChild.dataset.profileCatalogItem === 'Item.catalog124');
  search.value = 'cafe'; search.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  check("catalog search tolerates accents", results.children.length === 1 && results.textContent.includes('Lantern'));
  search.value = 'not present'; search.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  check("empty search results are explained", results.children.length === 0 && screen.querySelector('[role="status"]').textContent === 'No matching gear.');
  search.value = '124'; search.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  globalThis.fromUuid = async uuid => game.items.find(item => item.uuid === uuid);
  results.firstElementChild.click(); await tick();
  check("catalog selection uses native acquisition and removes temporary results", f.actor.items.some(item => item.name === 'Item.catalog124') && !screen.querySelector('.ve-profile-catalog-results'));
  await openCatalog();
  screen.querySelector('[data-profile-inventory-cancel]').click(); await tick();
  check("Cancel removes the temporary catalog", !screen.querySelector('.ve-profile-catalog-results') && !screen.querySelector('[data-profile-add-item]').hidden);
  let finishIndex;
  const pack = game.packs.contents?.[0] ?? [...game.packs][0], getIndex = pack.getIndex;
  pack.getIndex = () => new Promise(resolve => { finishIndex = resolve; });
  await openCatalog();
  check("catalog search remains usable while its index loads", !screen.querySelector('input[type="search"]').disabled);
  screen.querySelector('[data-profile-inventory-cancel]').click();
  finishIndex([]); await tick();
  check("late catalog results cannot reopen a cancelled editor", !screen.querySelector('.ve-profile-catalog-results') && !screen.querySelector('[data-profile-add-item]').hidden);
  pack.getIndex = getIndex;
  check("unidentified names are omitted from inventory", !screen.textContent.includes("Secret Relic"));
  const torch = f.actor.items.get("torch");
  check("token-light actions are absent from capabilities", !screen.querySelector('[data-profile-action^="light:"]'));
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
  const coinBoxes = [...screen.querySelectorAll('[data-profile-section="coins"] [data-profile-field]')].map(e => e.getBoundingClientRect());
  check("all three compact coin boxes share one row", coinBoxes.length === 3 && coinBoxes.every(r => Math.abs(r.top - coinBoxes[0].top) < 1));
  const gearHeader = screen.querySelector('[data-profile-section="gear"] header'), addButton = gearHeader.querySelector('[data-profile-add-item]');
  const gearTitle = gearHeader.querySelector("h3").getBoundingClientRect(), slotsMetric = gearHeader.querySelector('[data-profile-metric="slots"]').getBoundingClientRect();
  check("Gear groups Slots beside its title and the add icon at the right", !!addButton.querySelector(".fa-plus") && !addButton.textContent.trim()
    && slotsMetric.left >= gearTitle.right && slotsMetric.left - gearTitle.right <= 13
    && Math.abs(addButton.getBoundingClientRect().right - gearHeader.getBoundingClientRect().right) < 2);
  for (const denomination of ["gp", "sp", "cp"]) {
    const coin = () => screen.querySelector(`[data-profile-resource="coin-${denomination}"]`);
    const original = f.actor.system.coins[denomination];
    check(denomination + " has controls below its editable amount", coin().querySelector('.ve-profile-coin-controls').getBoundingClientRect().top >= coin().querySelector('[data-profile-edit]').getBoundingClientRect().bottom);
    coin().querySelector('[data-profile-quantity-delta="1"]').click(); await tick();
    check(denomination + " increment updates the native coin value", f.actor.system.coins[denomination] === original + 1);
    coin().querySelector('[data-profile-quantity-delta="-1"]').click(); await tick();
    check(denomination + " decrement updates the native coin value", f.actor.system.coins[denomination] === original);
    input = await resource('coin-' + denomination); input.value = "0"; await save(input);
    check(denomination + " direct edit stops at zero without deleting items", f.actor.system.coins[denomination] === 0 && coin().querySelector('[data-profile-quantity-delta="-1"]').disabled && !!f.actor.items.get("torch"));
  }
  check("coin controls stay inside their boxes", [...screen.querySelectorAll('.ve-profile-coin button')].every(button => {
    const rect = button.getBoundingClientRect(), row = button.closest('.ve-profile-row').getBoundingClientRect();
    return rect.left >= row.left && rect.right <= row.right && rect.height >= 44;
  }));
  check("coin editors do not add horizontal scrolling", document.documentElement.scrollWidth <= innerWidth + 1);
  torch.system.light.active = true;
  const lightsBeforeDeletion = f.lights.length;
  quantity().querySelector('[data-profile-quantity-delta="-1"]').click(); await tick();
  check("decrementing Torch deletes gear without toggling token light", !f.actor.items.get("torch") && !quantity() && torch.system.light.active && f.lights.length === lightsBeforeDeletion);

  check("Stashed Gear has a separate section", screen.querySelector('[data-profile-section="stashed"]').textContent.includes("stash") && !screen.querySelector('[data-profile-section="gear"]').textContent.includes("stash"));
  await tab("talents");
  const details = screen.querySelector("details"); details.open = true; await tick();
  check("Talents details are readable text without secret content or scripts", details.textContent.includes("Native talent text") && !details.textContent.includes("GM secret") && !details.querySelector("script"));
  check("Talents panel fits the viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  await tab("abilities"); f.error = true; await begin("stat:str"); await confirm(); f.error = false;
  check("action errors use notifications without inline text", notices.at(-1) === "native roll failure" && !screen.textContent.includes("native roll failure") && !screen.querySelector('.ve-profile-action-status'));
  await tab("inventory"); screen.querySelector('[data-profile-add-item]').click(); await tick();
  commands.selectActor(npc.uuid); await tick();
  check("actor changes dispose the item chooser", !document.querySelector('.ve-profile-inventory-choice'));
  check("NPCs remain on native sheets", !screen.querySelector(".ve-profile-content") && screen.textContent.includes("Native NPC"));
  commands.selectActor(f.actor.uuid); await tick();
  check("session watcher stays healthy", !watchError && state.snapshot.selectedActor.profileId === "shadowdark-player");
  await tab("abilities"); input = await resource("luck");
  check("open resource editor fits the viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  scope.dispose(); document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
