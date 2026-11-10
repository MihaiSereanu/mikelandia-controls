import { checkJournalSearch, journalSearchLayoutPreview, checkJournalSearchLayout } from "/tests/browser/journal-search.mjs";
import { installRichEditorFixture, editorInput, prepareEditorGame } from "/tests/browser/rich-editor-fixture.mjs";
import { createShadowdarkFixture } from "/tests/helpers/shadowdark.mjs";
import { createWarhammerActor, createWarhammerGame, addWarhammerMagic } from "/tests/helpers/warhammer.mjs";
import { createActor, createGame, createHooks, collection } from "/tests/helpers/foundry.mjs";
import { createAppKernel as currentAppKernel } from "/src/kernel/app-kernel.mjs";
import { createSignalStore } from "/src/kernel/state/signal-store.mjs";
import { initialAppState, reduceAppState } from "/src/kernel/state/app-state.mjs";
import { createFoundrySessionGateway } from "/src/foundry/session/session-gateway.mjs";
import { createFoundryCommandGateway } from "/src/foundry/commands/command-gateway.mjs";
import { createFoundryCombatGateway } from "/src/foundry/combat/combat-gateway.mjs";
import { createFoundryTargetingGateway } from "/src/foundry/combat/targeting-gateway.mjs";
import { targetingFixture } from "/tests/helpers/targeting.mjs";
import { createFoundryPreferencesGateway, registerPreferences } from "/src/foundry/settings/preferences.mjs";
import { createConnectionGeneration } from "/src/kernel/connection/connection-generation.mjs";
import { checkDamageFeedback } from "/tests/browser/damage-feedback.mjs";

import { createAppFrame } from "/src/ui/frame/app-frame.mjs";
import { checkReconnect } from "/tests/browser/reconnect.mjs";
import { checkParty } from "/tests/browser/party.mjs";
import { checkRollChat } from "/tests/browser/roll-chat.mjs";

const checks = [];
const check = (name, condition) => { if (!condition) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 60));
let kernel;
try {
  await installRichEditorFixture();
  const params = new URLSearchParams(location.search);
  const { createAppKernel } = params.get("baseline") === "true"
    ? await import("/dist/reconnect-baseline-kernel.mjs") : { createAppKernel: currentAppKernel };
  let timings;
  const legacy = params.get("system") === "dnd5e";
  const warhammer = params.get("system") === "wfrp4e";
  const actor = warhammer ? createWarhammerActor() : legacy ? createActor() : null;
  if (warhammer) addWarhammerMagic(actor, true);
  const f = legacy || warhammer ? { actor, game: warhammer ? createWarhammerGame([actor], { use5e: params.get("edition") !== "4e" }) : createGame([actor]), hooks: createHooks() } : createShadowdarkFixture();
  f.game.user.character = f.actor;
  globalThis.game = f.game; globalThis.Hooks = f.hooks;
  globalThis.TextEditor = { implementation: { enrichHTML: async value => value } };
  const dictionary = await fetch("/locales/en.json").then(r => r.json());
  const translate = key => key.split(".").reduce((entry, part) => entry?.[part], dictionary) ?? key;
  game.i18n = { lang: "en", localize: translate };
  prepareEditorGame(game);
  const definitions = new Map(), values = new Map(), originalGet = game.settings.get;
  game.settings = {
    settings: definitions,
    register(namespace, key, data) { definitions.set(`${namespace}.${key}`, { ...data, namespace, key }); },
    get(namespace, key) { return namespace === "mikelandia-controls" ? values.get(key) ?? definitions.get(`${namespace}.${key}`)?.default : originalGet(namespace, key); },
    async set(namespace, key, value) { values.set(key, value); return value; }
  };
  registerPreferences({ isMobilePresentation: () => true });
  game.user.isGM = true;
  const nativeCalls = [];
  const combatant = { id: "fighter", actor: f.actor, actorId: f.actor.id, name: "Fighter", visible: true, isOwner: true, initiative: null };
  game.combat = {
    id: "encounter", started: true, round: 1, turn: 0, turns: [combatant], combatant,
    combatants: new Map([[combatant.id, combatant]]),
    async rollInitiative(ids) { nativeCalls.push(["initiative", ids]); combatant.initiative = 17; },
    async nextTurn() { nativeCalls.push(["next"]); },
    async previousTurn() { nativeCalls.push(["previous"]); },
    async startCombat() { nativeCalls.push(["start"]); },
    async endCombat() {},
    async delete() { nativeCalls.push(["end"]); }
  };
  const handoutPage = (id, allowed = true) => ({ id, name: id, type: "text", text: { content: "A shared handout." }, testUserPermission: () => allowed });
  const handout = { id: "handout", documentName: "JournalEntry", name: "Shared Handout", pages: collection([handoutPage("Public page"), handoutPage("Private page", false), handoutPage("Hidden page")]), testUserPermission: () => true, sheet: { isPageVisible: page => page.id !== "Hidden page" } };
  let journalWrites = 0, journalWriteMode = "immediate", releaseJournalWrite;
  const publicPage = handout.pages.get("Public page");
  publicPage.update = async changes => {
    if (journalWriteMode === "deferred") await new Promise(resolve => { releaseJournalWrite = resolve; });
    if (journalWriteMode === "rejected") throw new Error("Journal write rejected");
    journalWrites++;
    for (const field of ["content", "markdown"]) if (`text.${field}` in changes) publicPage.text[field] = changes[`text.${field}`];
    Hooks.emit("updateJournalEntryPage", { ...publicPage, parent: handout }, changes);
  };
  const storage = (id, extra) => ({ ...handout, id, name: id, ...extra });
  game.modules.set("sequencer", { active: true }); game.modules.set("calendaria", { active: true });
  game.journal = collection([handout,
    storage("sequencerDatabase"),
    storage("Calendar Notes", { flags: { calendaria: { isCalendarNote: true } } }),
    storage("Private Journal", { testUserPermission: () => false })]);
  // No map or token API is available to this complete kernel/frame fixture.
  globalThis.canvas = undefined;
  const layout = params.get("layout") ?? "phone";
  const policy = () => ({ active: true, sessionReady: true, runtimeMode: layout, formFactor: layout, orientation: layout === "tablet" ? "landscape" : "portrait", theme: "dark", canvasAvailable: false });
  const store = createSignalStore(initialAppState, reduceAppState);
  const commands = createFoundryCommandGateway();
  const combat = createFoundryCombatGateway({
    isMobileActive: () => kernel?.active && store.state.route === "combat",
    getLifecycleToken: () => kernel?.combatControlLifecycleToken(),
    getEndCombatDialog: () => ({ confirm: async options => options.yes.callback() })
  });
  const session = createFoundrySessionGateway({ capabilitiesForActor: commands.capabilitiesForActor, combatForSnapshot: combat.snapshot, combatControlsForSnapshot: combat.controlsSnapshot });
  let recovery = async () => ({ applied: true });
  let reloads = 0, uiCommands;
  kernel = createAppKernel({
    createFrame: options => { uiCommands = options.commands; return createAppFrame(options); },
    store, session, commandGateway: commands, combatGateway: combat, targetingGateway: createFoundryTargetingGateway(),
    authoritativeGateway: { resync: context => recovery(context) },
    reloadApplication: () => { reloads++; },
    connectionGeneration: createConnectionGeneration(),
    preferencesGateway: createFoundryPreferencesGateway(),
    readPolicy: policy, isControlsUiReady: () => true,
    controlsGuideGateway: { seen: () => true },
    settingsCompatibilityGateway: { snapshot: () => ({}) },
    sessionStatusGateway: { snapshot: () => ({ users: [] }) },
    disable() {}
  });
  kernel.reconcile(); await tick(); await tick();
  check("complete kernel starts without a canvas", kernel.active);
  const root = document.querySelector(".mc-mobile-app");
  if (params.get("party") === "true") {
    await checkParty({ f, store, uiCommands, root, check, tick, params });
  } else if (params.get("rollChat") === "true") {
    await checkRollChat({ f, store, commands, uiCommands, root, values, legacy, warhammer, check, tick });
  } else if (params.get("timing") === "true") {
    const samples = [];
    recovery = async () => { await new Promise(resolve => setTimeout(resolve, 25)); return { applied: true }; };
    for (let i = 1; i <= 9; i++) {
      kernel.beginReconnect(i);
      const started = performance.now();
      await kernel.resync(i);
      if (i > 2) samples.push(performance.now() - started);
      check(`timing run ${i} restores readiness`, !store.state.reconnect);
    }
    timings = { samplesMs: samples, medianMs: [...samples].sort((a, b) => a - b)[3], simulatedFetchMs: 25 };
  } else if (params.get("reconnect") === "true") {
    await checkReconnect({ kernel, store, root, f, check, tick,
      commands: uiCommands, setRecovery: callback => { recovery = callback; }, getReloads: () => reloads });
  } else {
  check("main Combat navigation is now Initiative", root.querySelector('[data-route="combat"]').textContent === "Initiative");
  check("application uses Mikelandia Controls name", root?.getAttribute("aria-label") === "Mikelandia Controls");
  check("system navigation includes its supported routes", [...root.querySelectorAll(".mc-main-nav-item")].filter(b => !b.hidden).map(b => b.dataset.route).join(",") === (legacy ? "characters,chat,journals,combat,settings" : "characters,party,chat,journals,combat,settings"));
  const nav = root.querySelector(".mc-bottom-nav");
  const standalone = params.get("standalone") === "true";
  for (const protectedStyle of [false, true]) {
    root.toggleAttribute("data-mc-style-authority", protectedStyle);
    for (const safeTop of [0, 24]) {
      root.style.setProperty("--mc-safe-top", `${safeTop}px`);
      await tick();
      const viewport = root.querySelector(".mc-viewport").getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      check(`app clears top inset; standalone=${standalone}, protection=${protectedStyle}, safe=${safeTop}`, Math.abs(viewport.top - (standalone ? safeTop + 8 : 0)) <= 1);
      check(`bottom navigation stays inside viewport; protection=${protectedStyle}, safe=${safeTop}`, navRect.bottom <= innerHeight + 1 && root.getBoundingClientRect().bottom <= innerHeight + 1);
    }
  }
  root.style.removeProperty("--mc-safe-top");
  root.setAttribute("data-mc-style-authority", "");
  check("bottom navigation has no empty slots", nav.getBoundingClientRect().height > nav.getBoundingClientRect().width || getComputedStyle(nav).gridTemplateColumns.split(" ").length === (legacy ? 5 : 6));
  check("character renders without token selection", !!root.querySelector(legacy ? ".mc-character-selector" : ".mc-profile-section"));
  check("no map or split viewport mounts", !root.querySelector(".mc-scene-screen, .mc-split-scene-viewport, .mc-tablet-split-toggle"));
  check("no light or token placement controls mount", !root.querySelector('[data-profile-action^="light:"], .mc-portrait-action-menu, .mc-portrait-token-ghost'));
  root.querySelector('[data-route="journals"]').click(); await tick();
  check("journal library hides module storage and denied documents", root.querySelectorAll(".mc-journal-entry").length === 1 && root.querySelector(".mc-journal-entry")?.textContent.includes("Shared Handout"));
  check("journal summary excludes hidden page names", !/Private page|Hidden page/.test(root.querySelector(".mc-journal-library")?.textContent));
  if (params.get("search") === "true") await checkJournalSearch({ root, store, game, hooks: Hooks, journal: handout, page: publicPage, check });
  root.querySelector(".mc-journal-entry").click(); await tick();
  check("permitted journal opens in mobile reader", root.querySelector(".mc-journal-rich-text")?.textContent.includes("A shared handout."));
  check("reader excludes private and sheet-hidden pages", !/Private page|Hidden page/.test(root.querySelector(".mc-journal-reader")?.textContent));
  publicPage.text.content = "<p>First paragraph</p>\n\n<p>Second paragraph</p>\n<ul>\n<li>One</li>\n</ul>\n<table>\n<tbody><tr><td>Cell</td></tr></tbody>\n</table>";
  Hooks.emit("updateJournalEntryPage", { ...publicPage, parent: handout }, {}); await tick();
  const rich = root.querySelector(".mc-journal-rich-text");
  check("formatted journal HTML keeps normal block spacing", getComputedStyle(rich).whiteSpace === "normal"
    && !rich.querySelector(".mc-preserve-lines") && !!rich.querySelector("table td"));
  publicPage.text.content = "<p>First line\nSecond line</p>";
  Hooks.emit("updateJournalEntryPage", { ...publicPage, parent: handout }, {}); await tick();
  check("typed newline inside existing HTML is preserved", getComputedStyle(root.querySelector(".mc-journal-rich-text p span")).whiteSpace === "pre-wrap");
  publicPage.text.content = "A shared handout.";
  Hooks.emit("updateJournalEntryPage", { ...publicPage, parent: handout }, {}); await tick();
  root.querySelector(".mc-journal-native-edit").click(); await tick();
  check("owned journal opens shared multiline editor", editorInput(root)?.value === "A shared handout.");
  editorInput(root).value = "Cancelled journal";
  root.querySelector(".mc-modal-button.is-secondary").click(); await tick();
  check("journal Cancel leaves native content unchanged", journalWrites === 0 && !editorInput(root));
  root.querySelector(".mc-journal-native-edit").click(); await tick();
  editorInput(root).value = "First line\nSecond line\n\nFourth line";
  journalWriteMode = "deferred";
  root.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
  const journalDraft = editorInput(root);
  Hooks.emit("updateJournalEntry", handout, { name: handout.name }); await tick();
  check("journal pending save survives refresh and blocks duplicate submit", editorInput(root) === journalDraft && journalDraft.disabled);
  releaseJournalWrite(); await tick(); await tick();
  check("journal Save refreshes multiline content", journalWrites === 1 && !editorInput(root)
    && root.querySelector(".mc-journal-rich-text").textContent === "First lineSecond lineFourth line"
    && root.querySelectorAll(".mc-journal-rich-text br").length === 3);
  root.querySelector(".mc-journal-native-edit").click(); await tick();
  const activeDraft = editorInput(root); activeDraft.value = "My journal draft";
  activeDraft.focus(); activeDraft.setSelectionRange(2, 5);
  publicPage.text.content = "External journal update";
  Hooks.emit("updateJournalEntryPage", { ...publicPage, parent: handout }, {}); await tick();
  check("journal external update preserves draft focus and selection", editorInput(root) === activeDraft
    && document.activeElement === activeDraft.element && activeDraft.selectionStart === 2 && activeDraft.selectionEnd === 5);
  root.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
  check("journal concurrent save rejects with retained draft", journalWrites === 1 && activeDraft.value === "My journal draft"
    && root.querySelector(".mc-biography-editor-status").textContent.includes("changed"));
  root.querySelector(".mc-modal-button.is-secondary").click(); await tick();
  root.querySelector(".mc-journal-native-edit").click(); await tick();
  editorInput(root).value = "Retry journal"; journalWriteMode = "rejected";
  root.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
  check("journal rejected save retains draft and enables retry", editorInput(root).value === "Retry journal"
    && !editorInput(root).disabled && root.querySelector(".mc-biography-editor-status").textContent === "Journal write rejected");
  journalWriteMode = "immediate"; root.querySelector("form.mc-biography-editor").requestSubmit(); await tick(); await tick();
  check("journal retry saves once", journalWrites === 2 && !editorInput(root) && publicPage.text.content === "<p>Retry journal</p>");
  publicPage.text.format = 2;
  publicPage.text.markdown = Array.from({ length: 60 }, (_, index) => `Journal line ${index + 1}`).join("\n");
  const htmlBeforeMarkdown = publicPage.text.content;
  Hooks.emit("updateJournalEntryPage", { ...publicPage, parent: handout }, {}); await tick();
  root.querySelector(".mc-journal-native-edit").click(); await tick();
  const markdownInput = editorInput(root);
  check("Markdown journals retain their source editor and open at the bottom", markdownInput?.tagName === "TEXTAREA"
    && markdownInput.scrollTop + markdownInput.clientHeight >= markdownInput.scrollHeight - 2
    && !root.querySelector(".mc-rich-text-editor"));
  markdownInput.value += "\n**Added in Markdown**";
  root.querySelector("form.mc-biography-editor").requestSubmit(); await tick(); await tick();
  check("Markdown saves only the native Markdown field", publicPage.text.format === 2 && publicPage.text.content === htmlBeforeMarkdown
    && publicPage.text.markdown.endsWith("**Added in Markdown**"));
  publicPage.text.format = 1;
  Hooks.emit("updateJournalEntryPage", { ...publicPage, parent: handout }, {}); await tick();
  root.querySelector('[data-route="combat"]').click(); await tick();
  check("Combat lists initiative without a canvas", root.querySelector(".mc-combat-name")?.textContent === "Fighter");
  check("Combat has no focus or targeting controls", !root.querySelector(".fa-bullseye, .fa-arrows-to-eye"));
  root.querySelector(".mc-combat-roll-initiative").click(); await tick();
  check("initiative uses native combat workflow", nativeCalls[0]?.[0] === "initiative");
  root.querySelector(".mc-combat-end-turn").click(); await tick();
  check("End Turn uses native progression", nativeCalls.at(-1)?.[0] === "next");
  root.querySelector(".mc-gm-combat-previous").click(); await tick();
  check("GM Previous remains available", nativeCalls.at(-1)?.[0] === "previous");
  root.querySelector(".mc-gm-combat-next").click(); await tick();
  check("GM Next remains available", nativeCalls.at(-1)?.[0] === "next");
  root.querySelector(".mc-gm-combat-center").click(); await tick();
  check("GM End Combat remains available", nativeCalls.at(-1)?.[0] === "end");
  game.combat.started = false; Hooks.emit("updateCombat", game.combat, {}); await tick();
  root.querySelector(".mc-gm-combat-center").click(); await tick();
  check("GM Start Combat remains available", nativeCalls.at(-1)?.[0] === "start");
  // Exercise real kernel/store/frame targeting updates after the canvas-free checks.
  const targeting = targetingFixture();
  for (const token of targeting.scene.tokens) if (token.id === "pc") token.actorId = f.actor.id;
  globalThis.canvas = targeting.canvas;
  const runningEncounter = targeting.game.combat;
  runningEncounter.scene = null; // Native global encounter.
  game.combat = null;
  game.user.targets = targeting.game.user.targets;
  // Native placeables emit into this kernel's existing session hooks.
  for (const token of canvas.tokens) {
    const original = token.setTarget;
    token.setTarget = function(selected, options) { original.call(this, selected, options); Hooks.emit("targetToken", game.user, this, selected); };
  }
  Hooks.emit("renderCombatTracker", {}); await tick();
  Hooks.emit("canvasReady"); await tick();
  check("loading before tracker selection keeps Initiative in its empty state", !root.querySelector(".mc-targets, .mc-combat-list"));
  game.combat = runningEncounter;
  Hooks.emit("renderCombatTracker", {}); await tick();
  check("late tracker selection restores running Initiative and Targets without navigation", !!root.querySelector(".mc-targets")
    && !!root.querySelector(".mc-combat-list") && store.state.snapshot.combat.id === runningEncounter.id);
  game.combat.started = false;
  Hooks.emit("updateCombat", game.combat, {}); await tick();
  check("kernel renders targeting before combat starts in active scene", !!root.querySelector(".mc-targets"));
  check("kernel starts targeting collapsed", !root.querySelector(".mc-target-row"));
  root.querySelector(".mc-targets-heading").click(); await tick();
  root.querySelector('[data-target-id="enemy"]').click(); await tick();
  check("kernel updates pressed state without combat snapshot change", root.querySelector('[data-target-id="enemy"]').getAttribute("aria-pressed") === "true");
  const combatScreen = root.querySelector(".mc-combat-screen"), enemyRow = root.querySelector('[data-target-id="enemy"]');
  enemyRow.focus(); targeting.enemy.x = 500;
  Hooks.emit("refreshToken", canvas.tokens.get("enemy"), { refreshPosition: true }); await tick();
  check("kernel patches animation distance without replacing rows or focus", enemyRow.querySelector(".mc-target-distance").textContent === "25 ft" && root.querySelector(".mc-combat-screen") === combatScreen && root.querySelector('[data-target-id="enemy"]') === enemyRow && document.activeElement === enemyRow);
  targeting.pc.x = 100; Hooks.emit("refreshToken", canvas.tokens.get("pc"), { refreshPosition: true }); await tick();
  check("kernel patches source movement distances", enemyRow.querySelector(".mc-target-distance").textContent === "20 ft" && root.querySelector('[data-target-id="enemy"]') === enemyRow);
  root.querySelector('[data-route="characters"]').click(); await tick();
  root.querySelector(warhammer ? '[data-profile-tab="combat"]' : legacy ? '[data-character-tab="overview"]' : '[data-profile-tab="abilities"]').click(); await tick();
  check("character tab reuses native Target Selector", root.querySelector('[data-target-id="enemy"]')?.getAttribute("aria-pressed") === "true");
  const spellTab = warhammer ? '[data-profile-tab="magic"]' : legacy ? '[data-character-tab="spells"]' : '[data-profile-tab="spells"]';
  root.querySelector(spellTab).click(); await tick();
  check("spell tab shares selected combat targets", root.querySelector('[data-target-id="enemy"]')?.getAttribute("aria-pressed") === "true");
  check("spell tab places Targets before its content", root.querySelector(legacy ? ".mc-sheet-panel" : ".mc-profile-content").firstElementChild?.classList.contains("mc-targets"));
  const characterEnemy = root.querySelector('[data-target-id="enemy"]');
  characterEnemy.focus(); targeting.enemy.x = 600;
  Hooks.emit("refreshToken", canvas.tokens.get("enemy"), { refreshPosition: true }); await tick();
  check("character animation patches distance and preserves focus", root.querySelector('[data-target-id="enemy"]') === characterEnemy
    && document.activeElement === characterEnemy && characterEnemy.querySelector(".mc-target-distance").textContent === "25 ft");
  characterEnemy.click(); await tick();
  check("character target toggle updates native selection", root.querySelector('[data-target-id="enemy"]').getAttribute("aria-pressed") === "false" && !game.user.targets.has(canvas.tokens.get("enemy")));
  root.querySelector(".mc-targets-heading").click(); await tick();
  check("character selector collapses on state update", !root.querySelector(".mc-target-row"));
  root.querySelector(warhammer ? '[data-profile-tab="combat"]' : legacy ? '[data-character-tab="overview"]' : '[data-profile-tab="abilities"]').click(); await tick();
  check("combat and spell tabs share collapsed state", !!root.querySelector(".mc-targets") && !root.querySelector(".mc-target-row"));
  root.querySelector(spellTab).click(); await tick();
  root.querySelector(".mc-targets-heading").click(); await tick();
  game.combat.started = false; Hooks.emit("updateCombat", game.combat, {}); await tick();
  check("character selector stays available for a prepared encounter", !!root.querySelector(".mc-targets"));
  game.combat.started = true; Hooks.emit("updateCombat", game.combat, {}); await tick();
  root.querySelector('[data-route="combat"]').click(); await tick();
  root.querySelector(".mc-targets-heading").click(); await tick();
  check("kernel remembers collapsed targeting state", !root.querySelector(".mc-target-row"));
  root.querySelector('[data-route="characters"]').click(); await tick();
  root.querySelector(warhammer ? '[data-profile-tab="combat"]' : legacy ? '[data-character-tab="overview"]' : '[data-profile-tab="abilities"]').click(); await tick();
  game.combat = { ...runningEncounter, id: "foreign-encounter", scene: { id: "other-scene" } };
  Hooks.emit("renderCombatTracker", {}); await tick();
  Hooks.emit("canvasReady"); await tick();
  check("scene-ready with an old foreign-scene tracker does not expose Targets", !root.querySelector(".mc-targets"));
  game.combat = runningEncounter;
  Hooks.emit("renderCombatTracker", {}); await tick();
  check("late scene tracker selection restores character Targets without a tab switch", !!root.querySelector(".mc-targets"));
  root.querySelector('[data-route="combat"]').click(); await tick();
  check("Initiative also adopts the encounter selected after the scene change", store.state.snapshot.combat.id === runningEncounter.id
    && !!root.querySelector(".mc-combat-list") && !!root.querySelector(".mc-targets"));
  check("navigation fits viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  check("GM controls fit viewport", root.querySelector(".mc-gm-combat-controls").getBoundingClientRect().right <= innerWidth + 1);
  root.querySelector('[data-route="settings"]').click(); await tick();
  check("Settings no longer exposes Scene, movement, memory or overlays", !/Scene & Controls|Joystick|Mobile Asset Optimizer|Memory Protection|Module Overlays/.test(root.querySelector(".mc-settings")?.textContent ?? ""));
  const settings = root.querySelector(".mc-settings");
  check("Settings renders successfully", !!settings);
  if (params.get("damage") === "true") await checkDamageFeedback({ root, actor: f.actor, warhammer, hooks: f.hooks, check, tick });
  if (params.get("search") === "true") {
    root.querySelector('[data-route="journals"]').click(); await tick();
    if (root.querySelector(".mc-journal-reader")) { root.querySelector('.mc-journal-reader header button').click(); await tick(); }
    const input = root.querySelector('.mc-journal-search-input'); input.value = "Retry"; input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 350));
    journalSearchLayoutPreview(store, handout.id, publicPage.id);
    checkJournalSearchLayout({ root, check, label: "Final multi-result preview" });

  }
  if (params.get("preview") === "journal-editor") {
    root.querySelector('[data-route="journals"]').click(); await tick();
    if (!root.querySelector(".mc-journal-reader")) { root.querySelector(".mc-journal-entry").click(); await tick(); }
    root.querySelector(".mc-journal-native-edit").click(); await tick();
    const composer = editorInput(root);
    composer.value = "First line\nSecond line\n\nA new paragraph";
    const dialog = root.querySelector(".mc-biography-editor").getBoundingClientRect();
    check("journal editor fits viewport with visible Save and Cancel", dialog.left >= 0 && dialog.right <= innerWidth
      && dialog.top >= 0 && dialog.bottom <= innerHeight && document.activeElement === composer.element
      && [...root.querySelectorAll(".mc-modal-button")].every(button => button.getBoundingClientRect().height >= 44));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  }
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", timings, width: innerWidth, height: innerHeight, checks });
} catch (error) {
  kernel?.stop();
  document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
