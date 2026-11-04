import { addItemSpells } from "/tests/helpers/shadowdark-item-spells.mjs";
import { createShadowdarkFixture } from "/tests/helpers/shadowdark.mjs";
import { createActor, collection } from "/tests/helpers/foundry.mjs";
import { createFoundrySessionGateway } from "/src/foundry/session/session-gateway.mjs";
import { createFoundryCommandGateway } from "/src/foundry/commands/command-gateway.mjs";
import { enableMobileApplications, mobileDialogElements } from "/src/foundry/presentation/mobile-presentation.mjs";
import { resolveSystemIntegration } from "/src/systems/registry.mjs";
import { renderCharacters } from "/src/features/characters/presenter.mjs";
import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";
import { createMcBackDispatcher } from "/src/ui/navigation/mc-back-dispatcher.mjs";

import { runMobileApplicationWorkflow } from "/src/foundry/presentation/mobile-ui-isolation.mjs";

const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const scope = createTaskScope("shadowdark-browser");
try {
  const params = new URLSearchParams(location.search), initialPulp = params.get("pulp") === "true";
  if (params.has("native-assets")) {
    // Match native button sizing and icon glyphs without importing page typography.
    const nativeResponse = await fetch("/native-fixture/foundry2.css");
    check("native Foundry stylesheet available for Shadowdark controls", nativeResponse.ok);
    const nativeButtonRule = (await nativeResponse.text()).match(/a\.button,\s*button\s*\{[^}]+\}/u)?.[0];
    check("native Foundry button defaults found", Boolean(nativeButtonRule));
    const nativeStyles = document.createElement("style");
    nativeStyles.textContent = `@layer modules { ${nativeButtonRule} }`;
    document.head.prepend(nativeStyles);
    const font = new FontFace("Native fixture icons", 'url("/native-fixture/fa-solid-900.woff2")', { weight: "900" });
    document.fonts.add(await font.load());
    const iconStyles = document.createElement("style");
    iconStyles.textContent = '.mc-profile-action i, [data-profile-add-item] i { font-family: "Native fixture icons"; font-weight: 900; font-style: normal; } .mc-profile-action .fa-dice::before { content: "\\f522"; } [data-profile-add-item] .fa-plus::before { content: "\\f067"; }';
    document.head.append(iconStyles);
  }
  document.querySelector("main").dataset.formFactor = params.get("layout") ?? "phone";
  if (params.has("large")) document.querySelector("main").style.setProperty("font-size", "24px", "important");
  const f = createShadowdarkFixture({ pulp: initialPulp, specialAbilities: true });
  f.actor.items.get("sword").system.description = '<p>A <strong>keen blade</strong>.</p><div class="secret">Hidden inventory secret</div>';
  f.actor.items.get("torch").system.description = '<p>Burns for an hour.</p>';
  f.actor.items.get("dagger").system.description = '<p>&nbsp;<br></p>';
  globalThis.game = f.game; globalThis.Hooks = f.hooks;
  let removal;
  const previousFoundry = globalThis.foundry;
  class RemovalDialog {
    static confirm(config) {
      return new Promise((resolve, reject) => {
        const application = new RemovalDialog();
        application.options = { modal: true };
        application.element = document.createElement("form");
        application.element.className = "application";
        application.element.setAttribute("role", "dialog");
        application.element.innerHTML = `<header class="window-header"><h1 class="window-title"></h1></header><div class="application-content">${config.content}</div>`;
        application.element.querySelector("h1").textContent =
          config.window.title;
        application.close = () => {
          application.element.remove();
          Hooks.emit("closeApplicationV2", application);
          resolve(null);
        };
        for (const name of ["no", "yes"]) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.removalAnswer = name;
          button.textContent = config[name].label;
          button.onclick = async () => {
            try {
              const result = await config[name].callback?.();
              resolve(result);
            } catch (error) {
              reject(error);
            } finally {
              application.close();
            }
          };
          application.element.append(button);
        }
        application.element.onkeydown = (event) => {
          if (event.key === "Escape") application.close();
        };
        document.body.append(application.element);
        Hooks.emit("renderApplicationV2", application, application.element);
        removal = application;
        application.element.querySelector('[data-removal-answer="no"]').focus();
      });
    }
  }
  globalThis.foundry = {
    ...previousFoundry,
    applications: {
      ...previousFoundry?.applications,
      api: { ...previousFoundry?.applications?.api, DialogV2: RemovalDialog },
    },
  };
  scope.own(() => {
    removal?.close();
    globalThis.foundry = previousFoundry;
  });
  const answerRemoval = async (answer) => {
    removal.element.querySelector(`[data-removal-answer="${answer}"]`).click();
    await tick();
  };
  game.i18n = { localize: key => key };
  const dsnStyle = document.createElement("style");
  dsnStyle.textContent = ".dsn-hide { display: none !important; }";
  document.head.append(dsnStyle);
  const chatScreen = document.createElement("section");
  chatScreen.className = "mc-native-chat-screen";
  chatScreen.style.cssText = "position:absolute;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;visibility:hidden";
  chatScreen.innerHTML = '<div id="chat" class="mc-native-chat"><div class="chat-log"><div class="chat-message"><div class="dice-roll dsn-hide"></div></div></div></div>';
  document.querySelector("main").append(chatScreen);
  const hiddenRollCard = chatScreen.querySelector(".dsn-hide");
  const unrelatedHiddenCard = document.createElement("div");
  unrelatedHiddenCard.className = "dsn-hide";
  document.body.append(unrelatedHiddenCard);
  check("Mikelandia Controls native chat reveals Dice So Nice roll content during animation", getComputedStyle(hiddenRollCard).display === "block");
  const wholeCard = document.createElement("li");
  wholeCard.className = "message chat-message dsn-hide";
  chatScreen.querySelector(".chat-log").append(wholeCard);
  check("Mikelandia Controls native chat reveals the complete Shadowdark card hidden by DSN", getComputedStyle(wholeCard).display === "flex");
  check("Dice So Nice visibility remains unchanged outside Mikelandia Controls native chat", getComputedStyle(unrelatedHiddenCard).display === "none");
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
    application.element.innerHTML = '<header class="window-header"><h1 class="window-title">check</h1><button type="button" data-action="close" aria-label="Close">X</button></header><div class="application-content"><label>Bonus <input type="number" value="0"></label><button type="button" data-native-confirm>Roll</button><button type="button" data-native-cancel>Cancel</button></div>';
    application.element.querySelector("[data-native-confirm]").onclick = () => {
      config.nativeInput = Number(application.element.querySelector("input").value);
      settled = true; application.close(); resolve(true);
    };
    application.element.querySelector("[data-native-cancel]").onclick = () => application.close();
    application.element.querySelector('[data-action="close"]').onclick = () => application.close();
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
    execute: (name, payload) => runMobileApplicationWorkflow(() => gateway.execute(name, payload, { isCurrent: () => !scope.disposed && state.snapshot.selectedActorSourceUuid === payload.actorSourceUuid }), () => !scope.disposed),
    selectCharacterTab: tab => { state = { ...state, characterTab: tab }; screen.__mcUpdateCharacter({ state, commands }); },
    selectActor: source => { state = { ...state, snapshot: session.selectCharacterSource(source) }; screen.__mcUpdateCharacter({ state, commands }); },
    openNativeActorEditor: async () => {}
  };
  state = { characterTab: "overview", snapshot: session.watch(scope, snapshot => {
    state = { ...state, snapshot }; screen.__mcUpdateCharacter({ state, commands });
  }, error => { watchError = error; }) };
  screen = renderCharacters({ state, commands, scope }); document.querySelector("main").append(screen); await tick();
  check("portrait preserves the top of the image", getComputedStyle(screen.querySelector('.mc-native-sheet-identity img')).objectPosition === "50% 0%");
  const tab = async id => { screen.querySelector(`[data-profile-tab="${id}"]`).click(); await tick(); };
  const field = id => { const counter = screen.querySelector(`[data-profile-field="${id}"] .mc-profile-counter`); if (counter) return screen.querySelector(`[data-profile-field="${id}"] dt`).textContent + counter.querySelector("[data-profile-edit]").textContent; const copy = screen.querySelector(`[data-profile-field="${id}"]`)?.cloneNode(true); copy?.querySelectorAll("[data-profile-resource]").forEach(node => node.remove()); return copy?.textContent; };
  const begin = async id => { screen.querySelector(`[data-profile-action="${id}"]`).click(); await tick(); };
  const confirm = async () => { dialog.element.querySelector("[data-native-confirm]").click(); await tick(); };
  const cancel = async () => { dialog.element.querySelector("[data-native-cancel]").click(); await tick(); };
  const checkedEditors = new Set();
  const resource = async id => {
    const lock = screen.querySelector(`[data-profile-counter-lock="${id}"]`);
    if (lock?.getAttribute("aria-pressed") === "true") lock.click();
    screen.querySelector(`[data-profile-edit="${id}"]`).click(); await tick();
    const input = screen.querySelector(`[data-profile-resource-input="${id}"]`);
    if (!checkedEditors.has(id)) {
      const form = input.closest('form'), label = form.querySelector('label > span');
      const [save, cancel] = form.querySelectorAll('button');
      const bounds = input.getBoundingClientRect(), labelBounds = label.getBoundingClientRect();
      const saveBounds = save.getBoundingClientRect(), cancelBounds = cancel.getBoundingClientRect();
      check(`${id} editor centers its label above a compact input`, labelBounds.bottom <= bounds.top
        && Math.abs(labelBounds.left + labelBounds.width / 2 - bounds.left - bounds.width / 2) <= 1 && bounds.width <= 145);
      check(`${id} editor aligns equal Save and Cancel buttons below input`, saveBounds.top >= bounds.bottom
        && Math.abs(saveBounds.top - cancelBounds.top) <= 1 && Math.abs(saveBounds.width - cancelBounds.width) <= 1
        && saveBounds.height >= 44 && cancelBounds.height >= 44);
      const card = form.closest('.mc-profile-section').getBoundingClientRect();
      check(`${id} editor stays within its card`, saveBounds.bottom <= card.bottom + 1 && cancelBounds.bottom <= card.bottom + 1
        && bounds.left >= card.left && bounds.right <= card.right);
      check(`${id} editor retains selected numeric input and fits viewport`, input.inputMode === 'numeric'
        && document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length
        && document.documentElement.scrollWidth <= innerWidth + 1);
      checkedEditors.add(id);
    }
    return input;
  };
  const save = async input => { input.dispatchEvent(new Event("input", { bubbles: true })); input.closest("form").querySelector("[data-profile-resource-save]").click(); await tick(); };
  check("PC uses Main/Spells/Inventory labels", [...screen.querySelectorAll('[role="tab"]')].map(node => node.textContent).join(",") === "Main,Spells,Inventory");
  check("prepared stats and modifiers are displayed", field("str") === "Str14 (+2)");
  check("native HP and AC values are used", field("hp") === "HP7 / 12" && field("ac") === "AC14");
  check("Luck follows Pulp Mode", field("luck") === (initialPulp ? "Luck2" : "Luck1"));
  check("unrelated game controls are absent", !/Wounds|Fortune|Spell Slots|Death Saves|Long Rest/.test(screen.textContent));
  check("PC profile fits the viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  await begin("stat:str");
  check("native roll dialog is admitted", dialog.element.classList.contains("mc-mobile-admitted-app"));
  check("Shadowdark V2 roll dialog has a DOM admission fallback", mobileDialogElements(document.body).includes(dialog.element));
  check("native V2 roll dialog keeps modal admission", dialog.element.classList.contains("mc-mobile-dialog")
    && document.body.classList.contains("mc-mobile-dialog-open"));
  check("native Check title is capitalized", getComputedStyle(dialog.element.querySelector(".window-title")).textTransform === "capitalize");
  check("native modal backdrop avoids full-screen blur", getComputedStyle(document.querySelector(".mc-mobile-app"), "::after").backdropFilter === "none");
  check("pending action blocks duplicate taps", screen.querySelector('[data-profile-action="stat:str"]').disabled);
  dialog.element.querySelector("input").value = "3"; await confirm();
  check("native stat workflow runs once with native input", f.rolls.length === 1 && f.calls[0].config.nativeInput === 3);
  check("roll completion leaves no confirmation in the sheet", !screen.querySelector('.mc-profile-action-status') && !screen.textContent.includes('Native workflow finished'));
  check("scoped native hook is removed after completion", Hooks.count("SD-Stat-Check") === 0);
  omitRenderHook = true;
  await begin("stat:str");
  check("DOM-only Shadowdark roll dialog is admitted as modal", dialog.element.classList.contains("mc-mobile-dialog")
    && document.body.classList.contains("mc-mobile-dialog-open"));
  await cancel();
  check("cancelled native dialogs cause no extra roll", f.rolls.length === 1 && admissions.admissions.size === 0);
  for (const dismiss of ["header", "mobile"]) {
    await begin("stat:str");
    check(`${dismiss} dismissal permits reopening the same stat`, dialog.element.isConnected && screen.querySelector('[data-profile-action="stat:str"]').disabled);
    if (dismiss === "header") dialog.element.querySelector('[data-action="close"]').click();
    else admissions.admissions.closeTopmost();
    await tick();
    check(`${dismiss} dismissal silently releases the stat`, !screen.querySelector('[data-profile-action="stat:str"]').disabled && f.rolls.length === 1 && notices.length === 0);
  }
  await begin("attack-ranged:dagger"); await confirm();
  check("thrown ranged attacks use native UUID and attack type", f.calls.at(-1).target === f.actor.items.get("dagger").uuid && f.calls.at(-1).config.attack.type === "ranged" && f.rolls.length === 2);
  await begin("attack-melee:sword");
  const sword = f.actor.items.get("sword"); sword.system.equipped = false; Hooks.emit("updateItem", sword, {}); await tick(); await confirm();
  check("stale unequipped weapon cannot roll", f.rolls.length === 2 && !screen.querySelector('[data-profile-action="attack-melee:sword"]'));
  sword.system.equipped = true; Hooks.emit("updateItem", sword, {}); await tick();
  await begin("stat:str"); f.settings.usePulpMode = !initialPulp; Hooks.emit("updateSetting", { key: "shadowdark.usePulpMode" }, {}); await tick(); await confirm();
  check("Pulp Mode changes invalidate pending native dialogs", f.rolls.length === 2);
  check("Pulp Mode refresh changes the Luck control", field("luck") === (!initialPulp ? "Luck2" : "Luck1"));
  f.settings.usePulpMode = initialPulp; Hooks.emit("updateSetting", { key: "shadowdark.usePulpMode" }, {}); await tick();
  const resourceOrder = [...screen.querySelectorAll('.mc-profile-summary-triple > section')].map(e => e.dataset.profileSection);
  check("Shadowdark resources use HP/AC/DEF, XP/Grit/Luck order", resourceOrder.join(",") === "hp,ac,def,xp,grit,luck");
  check("resource labels appear once inside their boxes", !screen.querySelector('.mc-profile-summary-triple h3'));
  const boxes = resourceOrder.map(id => screen.querySelector(`[data-profile-section="${id}"]`).getBoundingClientRect());
  check("counter cards use available width without overflow", boxes.every(box => box.width >= 160 && box.right <= innerWidth));
  if (params.get("layout") === "tablet") {
    check("tablet resources form HP AC DEF above XP Grit Luck", boxes.slice(0, 3).every(box => Math.abs(box.top - boxes[0].top) < 1)
      && boxes.slice(3).every(box => Math.abs(box.top - boxes[3].top) < 1) && boxes[3].top >= boxes[0].bottom
      && boxes[0].left < boxes[1].left && boxes[1].left < boxes[2].left);
    const statBoxes = ["str", "dex", "con", "int", "wis", "cha"].map(id => screen.querySelector(`[data-profile-section="stats"] [data-profile-field="${id}"]`).getBoundingClientRect());
    check("tablet Stats form three columns and two rows", statBoxes.slice(0, 3).every(box => Math.abs(box.top - statBoxes[0].top) < 1)
      && statBoxes.slice(3).every(box => Math.abs(box.top - statBoxes[3].top) < 1) && statBoxes[3].top >= statBoxes[0].bottom
      && statBoxes[0].left < statBoxes[1].left && statBoxes[1].left < statBoxes[2].left);
  }
  const counter = id => screen.querySelector(`[data-profile-resource="${id}"]`);
  const delta = (id, n) => counter(id).querySelector(`[data-profile-counter-delta="${n}"]`);
  const lock = id => screen.querySelector(`[data-profile-counter-lock="${id}"]`);
  check("all five counters start locked", ["hp", "def", "xp", "grit", "luck"].every(id => lock(id).getAttribute("aria-pressed") === "true"
    && [...counter(id).querySelectorAll("[data-profile-counter-delta], [data-profile-edit]")].every(b => b.disabled)));
  check("AC remains read-only", !screen.querySelector('[data-profile-resource="ac"]'));
  check("HP and read-only AC cards have equal height", Math.abs(boxes[0].height - boxes[1].height) < 1);
  check("locked padlocks have no background", ["hp", "def", "xp", "grit", "luck"].every(id => getComputedStyle(lock(id)).backgroundColor === "rgba(0, 0, 0, 0)"));
  check("resource labels stay on one line", resourceOrder.every(id => {
    const range = document.createRange(); range.selectNodeContents(screen.querySelector(`[data-profile-field="${id}"] dt span`));
    return range.getClientRects().length === 1;
  }));
  check("padlocks and adjustments have 44px touch targets", [...screen.querySelectorAll("[data-profile-counter-lock], [data-profile-counter-delta]")].every(b => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44));
  check("locked clicks do not write", (() => { const n = f.writes.length; delta("hp", 1).click(); return f.writes.length === n; })());
  lock("hp").click();
  check("unlocked padlocks have no background", getComputedStyle(lock("hp")).backgroundColor === "rgba(0, 0, 0, 0)");
  check("unlocking one counter leaves others locked", !delta("hp", 1).disabled && delta("xp", 1).disabled);
  delta("hp", 1).click(); await tick();
  check("HP increment saves immediately and stays unlocked after refresh", f.actor.system.attributes.hp.value === 8 && !delta("hp", 1).disabled);
  delta("hp", -1).click(); await tick();
  check("HP decrement saves immediately", f.actor.system.attributes.hp.value === 7);
  let hpInput = await resource("hp"); hpInput.value = "13";
  hpInput.dispatchEvent(new Event("input", { bubbles: true }));
  check("HP entry rejects values above maximum", !hpInput.checkValidity());
  hpInput.value = "12"; await save(hpInput);
  check("maximum HP disables increment", delta("hp", 1).disabled && !delta("hp", -1).disabled);
  hpInput = await resource("hp"); hpInput.value = "7"; await save(hpInput);
  await tab("inventory"); await tab("abilities");
  check("lock choices survive tab navigation", lock("hp").getAttribute("aria-pressed") === "false" && delta("xp", 1).disabled);
  lock("hp").click();
  check("relocking disables numeric entry and both buttons", counter("hp").querySelector('[data-profile-edit]').disabled && delta("hp", 1).disabled && delta("hp", -1).disabled);
  lock("def").click();
  check("zero disables decrement", delta("def", -1).disabled && !delta("def", 1).disabled);
  const nativeResourceUpdate = f.actor.update;
  let finishResourceWrite;
  f.actor.update = () => new Promise(resolve => { finishResourceWrite = resolve; });
  delta("def", 1).click(); await tick();
  check("pending writes disable all counter buttons", [...counter("def").querySelectorAll('button')].every(b => b.disabled));
  finishResourceWrite(false); await tick();
  check("cancelled writes restore controls without changing value", !delta("def", 1).disabled && delta("def", -1).disabled && field("def") === "DEF0");
  f.actor.update = async () => { throw new Error("counter write failure"); };
  delta("def", 1).click(); await tick();
  check("failed counter writes restore controls and report an error", !delta("def", 1).disabled && notices.at(-1)?.includes("counter write failure"));
  f.actor.update = nativeResourceUpdate;
  lock("luck").click();
  if (!initialPulp) {
    check("standard Luck caps at one", delta("luck", 1).disabled);
    delta("luck", -1).click(); await tick();
    check("standard Luck decrement writes false and displays zero", f.actor.system.luck.available === false && field("luck") === "Luck0" && delta("luck", -1).disabled);
    delta("luck", 1).click(); await tick();
    check("standard Luck increment writes true", f.actor.system.luck.available === true && delta("luck", 1).disabled);
  }
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
    check(`${id} saves and refreshes its PC flag`, f.actor.flags["mikelandia-controls"].shadowdarkResources[id] === 3 && field(id).endsWith("3"));
  }
  let input = await resource("xp"); input.value = "19"; await save(input);
  check("XP uses native current XP and saves to the native field", f.actor.system.level.xp === 19 && field("xp") === "XP19");
  input = await resource("hp"); input.value = "0"; await save(input);
  check("zero HP disables decrement", screen.querySelector('[data-profile-resource="hp"] [data-profile-counter-delta="-1"]').disabled);
  check("zero HP saves through native updates and refreshes", field("hp") === "HP0 / 12" && f.writes.some(write => write[0]["system.attributes.hp.value"] === 0));
  input = await resource("luck");
  check("Luck editor uses numeric entry with native limits", input.type === "text" && (initialPulp || input.max === "1"));
  if (!initialPulp) {
    input.value = "2"; input.dispatchEvent(new Event("input", { bubbles: true }));
    check("standard Luck entry rejects values above one", !input.checkValidity());
  }
  input.value = initialPulp ? "4" : "0";
  await save(input);
  check("Luck save refreshes the correct native field", field("luck") === (initialPulp ? "Luck4" : "Luck0"));
  await tab("spells");
  const addTierSpell = (id, name, tier, lost = false) => {
    const item = { id, name, type: "Spell", parent: f.actor, uuid: `${f.actor.uuid}.Item.${id}`,
      system: { isSpell: true, tier, lost, description: `<p>${name} spell description.</p>` } };
    f.actor.items.push(item); Hooks.emit("createItem", item, {});
    return item;
  };
  const extraSpells = [addTierSpell("zebra", "Zebra", 1), addTierSpell("cloud", "Cloud", 2),
    addTierSpell("arcane", "Arcane", 3), addTierSpell("lostextra", "Zzz lost", 1, true)];
  await tick();
  const spellSection = id => screen.querySelector(`[data-profile-section="${id}"]`);
  const tier = () => spellSection("known-spells").querySelector('[data-profile-tier="2"]');
  check("Tiers start expanded with accessible headings", tier().open && tier().querySelector('summary').getAttribute('aria-expanded') === "true");
  check("Tier headings match the former row value size and weight", getComputedStyle(tier().querySelector('summary')).fontSize === getComputedStyle(spellSection("known-spells").querySelector('.mc-profile-spell-row dd')).fontSize
    && getComputedStyle(tier().querySelector('summary')).fontWeight === '600');
  check("grouped spell rows omit their redundant Tier value", [...spellSection("known-spells").querySelectorAll('.mc-profile-spell-row dd')].every(element => !element.textContent.trim()));
  tier().querySelector('summary').click(); await tick();
  check("Tier heading collapses its spell list", !tier().open && tier().querySelector('summary').getAttribute('aria-expanded') === "false");
  await tab("abilities"); await tab("spells");
  check("Tier closure survives tab changes", !tier().open);
  const orderIds = id => [...spellSection(id).querySelectorAll('[data-profile-field]')].map(row => row.dataset.profileField).join(",");
  check("spell tiers ascend before alphabetical names", orderIds("known-spells") === "spell,lost,zebra,lostextra,cloud,arcane"
    && [...spellSection("known-spells").querySelectorAll('[data-profile-tier]')].map(group => group.dataset.profileTier).join(",") === "1,2,3");
  check("spell ordering has no manual reorder controls", !screen.querySelector('[data-profile-reorder-toggle], [data-profile-reorder]'));
  const zebra = f.actor.items.get("zebra");
  zebra.name = "AAA renamed"; Hooks.emit("updateItem", zebra, {}); await tick();
  check("Tier closure survives actor refresh", !tier().open);
  check("spell renames refresh alphabetical order within tier", orderIds("known-spells") === "zebra,spell,lost,lostextra,cloud,arcane");
  zebra.system.lost = true; Hooks.emit("updateItem", zebra, {}); await tick();
  check("Lost spells keep alphabetical positions and have disabled casting", orderIds("known-spells") === "zebra,spell,lost,lostextra,cloud,arcane"
    && screen.querySelector('[data-profile-field="zebra"] s') && screen.querySelector('[data-profile-field="zebra"] button:disabled')
    && !screen.querySelector('[data-profile-action="spell:zebra"]'));
  zebra.system.lost = false; Hooks.emit("updateItem", zebra, {}); await tick();
  check("recovered spells return to alphabetical tier order", orderIds("known-spells") === "zebra,spell,lost,lostextra,cloud,arcane");
  for (const item of extraSpells) { f.actor.items.splice(f.actor.items.indexOf(item), 1); Hooks.emit("deleteItem", item, {}); }
  await tick();
  check("known and lost spells share one section", screen.textContent.includes("Spells Known") && !screen.textContent.includes("Lost Spells") && !screen.querySelector('[data-profile-action="spell:lost"]') && screen.querySelector('[data-profile-field="lost"] button:disabled'));
  const spellDescription = screen.querySelector('[data-profile-field="spell"] details');
  const lostDescription = screen.querySelector('[data-profile-field="lost"] details');
  check("known and lost spell descriptions start collapsed", spellDescription && lostDescription && !spellDescription.open && !lostDescription.open);
  const rollsBeforeDescription = f.rolls.length, callsBeforeDescription = f.calls.length;
  spellDescription.querySelector('summary').click(); await tick();
  check("spell name expands formatted player description without rolling", spellDescription.open && spellDescription.querySelector('p strong')?.textContent === 'missile text'
    && spellDescription.querySelector('ul li') && !spellDescription.querySelector('script') && !spellDescription.textContent.includes('GM spell secret')
    && f.rolls.length === rollsBeforeDescription && f.calls.length === callsBeforeDescription);
  spellDescription.querySelector('summary').click(); await tick();
  lostDescription.querySelector('summary').click(); await tick();
  check("spell names toggle closed and lost spell remains readable", !spellDescription.open && lostDescription.open && lostDescription.textContent.includes('Native sleep text'));
  const manualCalls = f.calls.length;
  const lostInput = () => screen.querySelector('[data-profile-spell-loss="lost"]');
  check("Lost checkbox lives inside the expanded description and reflects native state", lostInput().checked && lostInput().closest('details').open);
  lostInput().click(); await tick();
  check("manual recovery restores casting and retains the open description", !f.actor.items.get("lost").system.lost && !lostInput().checked
    && lostInput().closest('details').open && screen.querySelector('[data-profile-action="spell:lost"]'));
  lostInput().click(); await tick();
  check("manual loss strikes the name and disables casting without rolling", f.actor.items.get("lost").system.lost
    && screen.querySelector('[data-profile-field="lost"] s') && !screen.querySelector('[data-profile-action="spell:lost"]') && f.calls.length === manualCalls);
  f.success = false; await begin("spell:spell"); await confirm();
  check("failed casting retains native spell loss", f.rolls.length === 3 && f.actor.items.get("spell").system.lost && !screen.querySelector('[data-profile-action="spell:spell"]'));
  check("spell hook is removed after failure", Hooks.count("SD-Player-Spell") === 0);
  const magic = addItemSpells(f);
  globalThis.fromUuidSync = magic.resolve;
  Hooks.emit("updateActor", f.actor, {}); await tick();
  check("item spells show Wands and Scrolls with source names", spellSection("item-spells")?.textContent.includes("Spells from Items")
    && spellSection("wands").textContent.includes("Ivory Wand") && spellSection("scrolls").textContent.includes("Scroll of Light"));
  check("item spell category fits the viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  check("item subsections start expanded and lost wand spells are disabled", spellSection("wands").open && spellSection("scrolls").open
    && spellSection("wands").querySelector('[data-profile-field="wand-0"] s') && spellSection("wands").querySelector('[data-profile-field="wand-0"] button:disabled'));
  spellSection("wands").querySelector('summary').click(); await tick();
  await tab("abilities"); await tab("spells");
  check("Wand closure survives tab changes independently of Scrolls", !spellSection("wands").open && spellSection("scrolls").open);
  spellSection("wands").querySelector('summary').click(); await tick();
  const itemDescription = spellSection("wands").querySelector('[data-profile-field="wand-1"] details');
  const itemCalls = f.calls.length;
  itemDescription.querySelector('summary').click(); await tick();
  check("item spell description opens independently of casting", itemDescription.open && itemDescription.querySelector('strong')?.textContent === "light" && f.calls.length === itemCalls);
  const wandLost = () => screen.querySelector('[data-profile-spell-loss="wand-1"]');
  wandLost().click(); await tick();
  check("manual wand loss changes only its native reference", magic.wand.system.spells[1].lost && !magic.spells[0].system.lost
    && wandLost().checked && wandLost().closest('details').open && !screen.querySelector('[data-profile-action="item-spell:wand-1"]'));
  wandLost().click(); await tick();
  check("manual wand recovery restores native casting and Scrolls have no Lost control", !magic.wand.system.spells[1].lost
    && screen.querySelector('[data-profile-action="item-spell:wand-1"]') && !spellSection("scrolls").querySelector('[data-profile-spell-loss]'));
  f.success = true; await begin("item-spell:scroll-0"); await cancel();
  check("cancelled scroll casting preserves its item", f.actor.items.get("scroll"));
  await begin("item-spell:scroll-0"); await confirm();
  check("native scroll casting consumes item and hides empty Scrolls subsection", !f.actor.items.get("scroll") && !spellSection("scrolls")
    && f.calls.at(-1).config.itemUuid === magic.scroll.uuid && f.calls.at(-1).target === magic.spells[0].uuid);
  f.success = false; await begin("item-spell:wand-1"); await confirm();
  check("native wand failure strikes through its spell and disables casting", magic.wand.system.spells[1].lost
    && spellSection("wands").querySelector('[data-profile-field="wand-1"] s') && !screen.querySelector('[data-profile-action="item-spell:wand-1"]'));
  magic.wand.system.broken = true; Hooks.emit("updateItem", magic.wand, {}); await tick();
  check("no eligible item spells hides the whole category", !spellSection("item-spells"));
  f.actor.items.splice(f.actor.items.indexOf(magic.wand), 1); Hooks.emit("deleteItem", magic.wand, {}); await tick();
  await tab("abilities");
  const ability = f.actor.items.get("ability");
  const abilitySection = () => screen.querySelector('[data-profile-section="special-abilities"]');
  const abilityDescription = abilitySection().querySelector('details');
  check("Main includes owned Special Abilities and native remaining uses", abilitySection().textContent.includes('Special Abilities') && abilitySection().textContent.includes('2 / 3') && !abilityDescription.open);
  const abilityCalls = f.calls.length;
  abilityDescription.querySelector('summary').click(); await tick();
  check("ability name expands description independently of Use", abilityDescription.open && abilityDescription.querySelector('strong')?.textContent === 'ability text'
    && !abilityDescription.textContent.includes('GM ability secret') && f.calls.length === abilityCalls);
  f.success = true; await begin("ability:ability"); await cancel();
  check("cancelling Special Ability keeps native uses", ability.system.uses.available === 2 && Hooks.count("SD-Player-classAbility") === 0);
  await begin("ability:ability"); await confirm();
  check("Special Ability invokes native Use once and refreshes remaining uses", f.calls.at(-1).kind === 'ability' && f.calls.at(-1).target === ability.uuid
    && ability.system.uses.available === 1 && abilitySection().textContent.includes('1 / 3') && Hooks.count("SD-Player-classAbility") === 0);
  await begin("ability:ability"); await confirm();
  check("exhausted Special Ability stays readable without Use", ability.system.uses.available === 0 && !!abilitySection().querySelector('details') && !screen.querySelector('[data-profile-action="ability:ability"]'));
  f.actor.items.splice(f.actor.items.indexOf(ability), 1); Hooks.emit('deleteItem', ability, {}); await tick();
  check("Special Abilities section disappears when the PC has none", !abilitySection());
  f.actor.items.push(ability); Hooks.emit('createItem', ability, {}); await tick();
  await tab("inventory");
  const checkItemDescription = (id, section, text) => {
    const row = screen.querySelector(`[data-profile-section="${section}"] [data-profile-field="${id}"]`);
    const toggle = row.querySelector('.mc-profile-item-disclosure'), content = row.querySelector('.mc-profile-description');
    check(`${id} name toggle starts closed`, toggle?.textContent === f.actor.items.get(id).name && toggle.getAttribute("aria-expanded") === "false" && content.hidden);
    const arrow = toggle.querySelector('.mc-profile-disclosure-arrow').getBoundingClientRect();
    check(`${id} toggle keeps a visible arrow and touch target`, arrow.width > 0 && arrow.height > 0 && toggle.getBoundingClientRect().height >= 44);
    toggle.click();
    check(`${id} name opens formatted description`, !content.hidden && content.textContent.includes(text) && toggle.getAttribute("aria-expanded") === "true");
    toggle.click();
    check(`${id} name closes description`, content.hidden && toggle.getAttribute("aria-expanded") === "false");
  };
  checkItemDescription("sword", "equipped-gear", "keen blade");
  checkItemDescription("torch", "gear", "Burns for an hour");
  check("inventory preserves safe formatting and excludes secret content", !!screen.querySelector('[data-profile-field="sword"] .mc-description-content strong') && !screen.textContent.includes("Hidden inventory secret"));
  check("empty HTML descriptions have no toggle", !screen.querySelector('[data-profile-field="dagger"] .mc-profile-item-disclosure'));
  const equipment = () => screen.querySelector('[data-profile-resource-input="equipped:sword"]');
  check("equipped and carried gear occupy separate sections", screen.querySelector('[data-profile-section="equipped-gear"]').textContent.includes('Sword')
    && !screen.querySelector('[data-profile-section="gear"]').textContent.includes('Sword') && screen.querySelector('[data-profile-section="gear"]').textContent.includes('Torch'));
  check("equipped gear keeps native checkbox with read-only quantity", equipment().checked && !screen.querySelector('[data-profile-resource="quantity:sword"]'));
  equipment().click(); await tick();
  check("PC can unequip into Carried Gear", !sword.system.equipped && !equipment().checked && screen.querySelector('[data-profile-section="gear"]').textContent.includes('Sword')
    && !screen.querySelector('[data-profile-section="equipped-gear"]').textContent.includes('Sword'));
  check("unequipped gear gains quantity controls", !!screen.querySelector('[data-profile-resource="quantity:sword"]'));
  equipment().click(); await tick();
  check("PC can equip into Equipped Gear", sword.system.equipped && equipment().checked && screen.querySelector('[data-profile-section="equipped-gear"]').textContent.includes('Sword'));
  await tab('abilities');
  check("equipping refreshes native Main attacks", !!screen.querySelector('[data-profile-action="attack-melee:sword"]'));
  await tab('inventory');
  const quantity = () => screen.querySelector('[data-profile-resource="quantity:torch"]');
  check("carried gear has three touch-friendly quantity controls", quantity().querySelectorAll("button").length === 3 && [...quantity().querySelectorAll("button")].every(b => b.getBoundingClientRect().height >= 44));
  quantity().querySelector('[data-profile-quantity-delta="1"]').click(); await tick();
  check("quantity increment persists and refreshes", f.actor.items.get("torch").system.quantity === 2 && quantity().querySelector('[data-profile-edit]').textContent === "2");
  input = await resource("quantity:torch"); input.value = "0"; await save(input);
  check(
    "direct zero waits for a visible removal confirmation",
    f.actor.items.get("torch").system.quantity === 2 &&
      removal.element.isConnected &&
      getComputedStyle(removal.element).display !== "none" &&
      removal.element.textContent.includes("Remove Torch from inventory?") &&
      removal.element.classList.contains("mc-mobile-admitted-app"),
  );
  await answerRemoval("no");
  check(
    "Cancel preserves quantity and restores controls",
    f.actor.items.get("torch").system.quantity === 2 &&
      !quantity().querySelector('[data-profile-quantity-delta="-1"]').disabled,
  );
  input = await resource("quantity:torch");
  input.value = "0";
  await save(input);
  await answerRemoval("yes");
  check("saving zero deletes the native item and mobile row", !f.actor.items.get("torch") && !quantity());
  const restoredTorch = { id: "torch", uuid: f.actor.uuid + ".Item.torch", type: "Basic", name: "Torch", parent: f.actor,
    system: { isPhysical: true, isIdentified: true, stashed: false, quantity: 1, slots: { per_slot: 20 }, light: { isSource: true, active: false, remainingSecs: 3600 } } };
  f.actor.items.push(restoredTorch); Hooks.emit("createItem", restoredTorch, {}); await tick();
  const nativeQuantityUpdate = f.actor.updateEmbeddedDocuments;
  f.actor.updateEmbeddedDocuments = async () => { throw new Error("quantity write failure"); };
  quantity().querySelector('[data-profile-quantity-delta="1"]').click(); await tick();
  check("failed quantity writes restore original boundary controls", !quantity().querySelector('[data-profile-quantity-delta="-1"]').disabled && !quantity().querySelector('[data-profile-quantity-delta="1"]').disabled);
  f.actor.updateEmbeddedDocuments = nativeQuantityUpdate;
  check("inventory has no redundant Open sheet button", ![...screen.querySelectorAll('.mc-profile-inventory-tools button')].some(b => b.textContent === "Open sheet"));
  check("inventory has no token-light buttons", !screen.querySelector('[data-profile-action^="light:"]'));
  check("quantity controls reserve their full width in item flow", getComputedStyle(quantity()).position === "static");
  screen.querySelector('[data-profile-add-item]').click(); await tick();
  const chooser = document.querySelector('.mc-profile-inventory-choice');
  check("Add item opens a focused modal without rendering either form", chooser?.getAttribute("aria-modal") === "true"
    && chooser.contains(document.activeElement) && !screen.querySelector('.mc-profile-custom-item, .mc-profile-catalog-results'));
  chooser.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
  check("choice modal wraps keyboard focus", document.activeElement === chooser.querySelector('button:last-child'));
  chooser.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  check("Escape dismisses the chooser and returns focus", !chooser.isConnected && document.activeElement === screen.querySelector('[data-profile-add-item]'));
  screen.querySelector('[data-profile-add-item]').click(); await tick();
  const back = createMcBackDispatcher({ getState: () => ({ route: "characters" }), commands, getRoot: () => document.querySelector("main") });
  check("Mikelandia Controls Back dismisses the chooser", back.back() === "inventory-choice" && !document.querySelector('.mc-profile-inventory-choice'));
  screen.querySelector('[data-profile-add-item]').click(); await tick();
  document.querySelector('[data-profile-item-mode="custom"]').click(); await tick();
  check("custom choice renders only its inline form", !!screen.querySelector('.mc-profile-custom-item') && !document.querySelector('.mc-profile-inventory-choice, .mc-profile-catalog-results'));
  const customForm = screen.querySelector('.mc-profile-custom-item');
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
  check("custom addition removes its temporary editor", !screen.querySelector('.mc-profile-custom-item') && !screen.querySelector('[data-profile-add-item]').hidden);
  const mobileRope = f.actor.items.find(item => item.name === "Mobile Rope");
  const ropeQuantity = () => screen.querySelector(`[data-profile-resource="quantity:${mobileRope.id}"]`);
  check("new custom items can increase beyond one unit per slot", !ropeQuantity().querySelector('[data-profile-quantity-delta="1"]').disabled);
  ropeQuantity().querySelector('[data-profile-quantity-delta="1"]').click(); await tick();
  check("custom increment saves native quantity without changing weight", mobileRope.system.quantity === 2 && mobileRope.system.slots.per_slot === 1 && mobileRope.system.slots.slots_used === 2);
  ropeQuantity().querySelector('[data-profile-quantity-delta="-1"]').click(); await tick();
  screen.querySelector(`[data-profile-resource="quantity:${mobileRope.id}"] [data-profile-quantity-delta="-1"]`).click(); await tick();
  check(
    "minus at one preserves the item until removal is confirmed",
    mobileRope.system.quantity === 1 &&
      !!f.actor.items.get(mobileRope.id) &&
      removal.element.isConnected,
  );
  removal.element.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await tick();
  check(
    "Escape preserves the last item",
    mobileRope.system.quantity === 1 && !!f.actor.items.get(mobileRope.id),
  );
  ropeQuantity().querySelector('[data-profile-quantity-delta="-1"]').click();
  await tick();
  await answerRemoval("yes");
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
  const results = screen.querySelector('.mc-profile-catalog-results'), search = screen.querySelector('input[type="search"]');
  check("catalog loads automatically with all results beyond 100", indexLoads === 1 && results.querySelectorAll('button').length === 126 && !screen.querySelector('.mc-profile-custom-item'));
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
  check("catalog selection uses native acquisition and removes temporary results", f.actor.items.some(item => item.name === 'Item.catalog124') && !screen.querySelector('.mc-profile-catalog-results'));
  await openCatalog();
  screen.querySelector('[data-profile-inventory-cancel]').click(); await tick();
  check("Cancel removes the temporary catalog", !screen.querySelector('.mc-profile-catalog-results') && !screen.querySelector('[data-profile-add-item]').hidden);
  let finishIndex;
  const pack = game.packs.contents?.[0] ?? [...game.packs][0], getIndex = pack.getIndex;
  pack.getIndex = () => new Promise(resolve => { finishIndex = resolve; });
  await openCatalog();
  check("catalog search remains usable while its index loads", !screen.querySelector('input[type="search"]').disabled);
  screen.querySelector('[data-profile-inventory-cancel]').click();
  finishIndex([]); await tick();
  check("late catalog results cannot reopen a cancelled editor", !screen.querySelector('.mc-profile-catalog-results') && !screen.querySelector('[data-profile-add-item]').hidden);
  pack.getIndex = getIndex;
  check("unidentified names are omitted from inventory", !screen.textContent.includes("Secret Relic"));
  const torch = f.actor.items.get("torch");
  check("token-light actions are absent from capabilities", !screen.querySelector('[data-profile-action^="light:"]'));
  const dangerous = { ...torch, id: "hidden", uuid: `${f.actor.uuid}.Item.hidden`, visible: false, name: '<img id="secret-injection">' }; f.actor.items.push(dangerous); Hooks.emit("createItem", dangerous, {}); await tick();
  check("hidden items cannot inject markup or names", !document.querySelector("#secret-injection") && !screen.textContent.includes("secret-injection"));
  f.actor.system.slots = 12; f.actor.system.coins = { gp: 25, sp: 3, cp: 0 };
  f.actor.system.getSlotUsage = () => ({ total: 8, coins: 1 });
  const addItem = (id, type, system) => { const item = { id, name: id, type, system, parent: f.actor, uuid: `${f.actor.uuid}.Item.${id}` }; f.actor.items.push(item); Hooks.emit("createItem", item, {}); };
  addItem("stash", "Basic", { isPhysical: true, isIdentified: true, stashed: true, quantity: 2, description: '<p>Supplies at the inn.</p>' });
  addItem("talent", "Talent", { talentClass: "class", description: '<p>Native <strong>talent text</strong></p><p>Second paragraph<br>Next line</p><ul><li><em>Talent benefit</em></li></ul><script>bad()</script><div class="secret">GM secret</div>' });
  await tick(); await tab("inventory");
  checkItemDescription("stash", "stashed", "Supplies at the inn");
  check("Inventory displays native used and maximum Slots", screen.querySelector('[data-profile-field="slots"]').textContent.includes("8 / 12"));
  check("Coins displays native denominations and slot use", screen.querySelector('[data-profile-section="coins"]').textContent.includes("25") && screen.querySelector('[data-profile-metric="coin-slots"]').textContent.includes("1"));
  const coinBoxes = [...screen.querySelectorAll('[data-profile-section="coins"] [data-profile-field]')].map(e => e.getBoundingClientRect());
  check("all three compact coin rows fit their card", coinBoxes.length === 3 && coinBoxes.every(r => r.left >= 0 && r.right <= innerWidth));
  if (params.get("layout") === "tablet") check("tablet coins use three columns", coinBoxes.every(box => Math.abs(box.top - coinBoxes[0].top) < 1)
    && coinBoxes[0].left < coinBoxes[1].left && coinBoxes[1].left < coinBoxes[2].left);
  const gearHeader = screen.querySelector('[data-profile-section="gear"] header'), addButton = gearHeader.querySelector('[data-profile-add-item]');
  const slotsSection = screen.querySelector('[data-profile-section="slots"]'), equippedSection = screen.querySelector('[data-profile-section="equipped-gear"]');
  check("Slots has its own row above Equipped Gear", slotsSection.getBoundingClientRect().bottom <= equippedSection.getBoundingClientRect().top
    && !gearHeader.querySelector('[data-profile-metric="slots"]') && screen.querySelectorAll('[data-profile-field="slots"]').length === 1);
  check("Carried Gear keeps the add icon at the right", !!addButton.querySelector(".fa-plus") && !addButton.textContent.trim()
    && Math.abs(addButton.getBoundingClientRect().right - gearHeader.getBoundingClientRect().right) < 2);
  for (const denomination of ["gp", "sp", "cp"]) {
    const coin = () => screen.querySelector(`[data-profile-resource="coin-${denomination}"]`);
    const original = f.actor.system.coins[denomination];
    const coinRow = coin().closest('[data-profile-field]');
    const sameLine = [...coinRow.querySelectorAll('dt, [data-profile-edit], [data-profile-quantity-delta]')].map(element => element.getBoundingClientRect());
    check(denomination + " label, amount and controls share one line", sameLine.every(rect => Math.abs(rect.top + rect.height / 2 - (sameLine[0].top + sameLine[0].height / 2)) < 2));
    coin().querySelector('[data-profile-quantity-delta="1"]').click(); await tick();
    check(denomination + " increment updates the native coin value", f.actor.system.coins[denomination] === original + 1);
    coin().querySelector('[data-profile-quantity-delta="-1"]').click(); await tick();
    check(denomination + " decrement updates the native coin value", f.actor.system.coins[denomination] === original);
    input = await resource('coin-' + denomination); input.value = "0"; await save(input);
    check(denomination + " direct edit stops at zero without deleting items", f.actor.system.coins[denomination] === 0 && coin().querySelector('[data-profile-quantity-delta="-1"]').disabled && !!f.actor.items.get("torch"));
  }
  check("coin controls stay inside their boxes", [...screen.querySelectorAll('.mc-profile-coin button')].every(button => {
    const rect = button.getBoundingClientRect(), row = button.closest('.mc-profile-row').getBoundingClientRect();
    return rect.left >= row.left && rect.right <= row.right && rect.height >= 44;
  }));
  check("coin editors do not add horizontal scrolling", document.documentElement.scrollWidth <= innerWidth + 1);
  torch.system.light.active = true;
  const lightsBeforeDeletion = f.lights.length;
  quantity().querySelector('[data-profile-quantity-delta="-1"]').click(); await tick();
  await answerRemoval("yes");
  check("decrementing Torch deletes gear without toggling token light", !f.actor.items.get("torch") && !quantity() && torch.system.light.active && f.lights.length === lightsBeforeDeletion);

  check("Stashed Gear has a separate section", screen.querySelector('[data-profile-section="stashed"]').textContent.includes("stash") && !screen.querySelector('[data-profile-section="gear"]').textContent.includes("stash"));
  input = await resource("quantity:stash");
  input.value = "0";
  await save(input);
  await answerRemoval("no");
  check(
    "stashed zero cancellation preserves the stack",
    f.actor.items.get("stash").system.quantity === 2,
  );
  input = await resource("quantity:stash");
  input.value = "0";
  await save(input);
  await answerRemoval("yes");
  check(
    "stashed zero confirmation removes the item",
    !f.actor.items.get("stash"),
  );
  addItem("stash", "Basic", { isPhysical: true, isIdentified: true, stashed: true, quantity: 2 }); await tick();
  await tab("talents");
  const details = screen.querySelector("details"); details.open = true; await tick();
  check("Talents details are readable text without secret content or scripts", details.textContent.includes("Native talent text") && !details.textContent.includes("GM secret") && !details.querySelector("script"));
  check("Talents retain native paragraph and list formatting", details.querySelectorAll('p').length === 2 && details.querySelector('strong')
    && details.querySelector('br') && details.querySelector('ul li em'));
  check("Talents panel fits the viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  await tab("abilities"); f.error = true; await begin("stat:str"); await confirm(); f.error = false;
  check("action errors use notifications without inline text", notices.at(-1) === "native roll failure" && !screen.textContent.includes("native roll failure") && !screen.querySelector('.mc-profile-action-status'));
  await tab("inventory"); screen.querySelector('[data-profile-add-item]').click(); await tick();
  commands.selectActor(npc.uuid); await tick();
  check("actor changes dispose the item chooser", !document.querySelector('.mc-profile-inventory-choice'));
  check("NPCs remain on native sheets", !screen.querySelector(".mc-profile-content") && screen.textContent.includes("Native NPC"));
  commands.selectActor(f.actor.uuid); await tick();
  check("session watcher stays healthy", !watchError && state.snapshot.selectedActor.profileId === "shadowdark-player");
  await tab("abilities"); input = await resource("luck");
  check("open resource editor fits the viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  screen.querySelector('[data-profile-resource-cancel]').click(); await tick();
  check("HP unlock choice survives actor navigation", lock("hp").getAttribute("aria-pressed") === "false");
  for (const id of ["hp", "def", "xp", "grit", "luck"]) if (lock(id).getAttribute("aria-pressed") === "false") lock(id).click();
  const preview = params.get("preview");
  if (["spells", "item-spells"].includes(preview)) {
    const spell = f.actor.items.get("spell");
    spell.system.lost = false; Hooks.emit("updateItem", spell, { "system.lost": false }); await tick();
    await tab("spells");
    addTierSpell("light", "Light", 1);
    addTierSpell("invisibility", "Invisibility", 2);
    addTierSpell("dispel", "Dispel Magic", 3);
    const previewMagic = addItemSpells(f); globalThis.fromUuidSync = previewMagic.resolve;
    Hooks.emit("updateActor", f.actor, {});
    await tick();
    for (const disclosure of screen.querySelectorAll('.mc-profile-spell-description')) disclosure.open = true;
    if (preview === "item-spells") spellSection("item-spells").scrollIntoView({ block: "start" });
  } else if (preview === "inventory") {
    f.actor.system.coins = { gp: 25, sp: 3, cp: 0 };
    Hooks.emit("updateActor", f.actor, { "system.coins": f.actor.system.coins }); await tick();
    await tab("inventory");
    screen.querySelector('[data-profile-field="sword"] .mc-profile-item-disclosure').click();
  }
  else if (["coin-editor", "quantity-editor", "resource-editor"].includes(preview)) {
    if (preview === "resource-editor") { await tab("abilities"); await resource("hp"); }
    else {
      await tab("inventory");
      if (preview === "coin-editor") await resource("coin-gp");
      else {
        const [item] = await f.actor.createEmbeddedDocuments("Item", [{ name: "Torch", type: "Basic", system: { quantity: 10 } }]);
        await tick(); await resource(`quantity:${item.id}`);
      }
    }
    screen.querySelector('.mc-profile-resource-form-stacked').closest('.mc-profile-section').scrollIntoView({ block: 'center' });
  }
  else if (preview === "main") {
    await tab("abilities");
    screen.querySelector('[data-profile-section="hp"]').scrollIntoView({ block: 'start' });
  } else if (preview === "abilities") {
    const ability = f.actor.items.get("ability");
    ability.system.lost = false; ability.system.uses.available = 2;
    Hooks.emit("updateItem", ability, { "system.lost": false, "system.uses.available": 2 }); await tick();
    await tab("abilities");
    const section = screen.querySelector('[data-profile-section="special-abilities"]');
    section.querySelector('details').open = true;
    section.scrollIntoView({ block: 'center' });
  }
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  scope.dispose(); document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
