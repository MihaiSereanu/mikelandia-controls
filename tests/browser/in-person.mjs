import { createShadowdarkFixture } from "/tests/helpers/shadowdark.mjs";
import { createActor, createGame, createHooks, collection } from "/tests/helpers/foundry.mjs";
import { createAppKernel } from "/src/kernel/app-kernel.mjs";
import { createSignalStore } from "/src/kernel/signal-store.mjs";
import { initialAppState, reduceAppState } from "/src/kernel/app-state.mjs";
import { createFoundrySessionGateway } from "/src/foundry/session-gateway.mjs";
import { createFoundryCommandGateway } from "/src/foundry/command-gateway.mjs";
import { createFoundryCombatGateway } from "/src/foundry/combat-gateway.mjs";
import { createFoundryPreferencesGateway, registerPreferences } from "/src/foundry/preferences.mjs";
import { createConnectionGeneration } from "/src/kernel/connection-generation.mjs";

const checks = [];
const check = (name, condition) => { if (!condition) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 60));
let kernel;
try {
  const params = new URLSearchParams(location.search);
  const legacy = params.get("system") === "dnd5e";
  const actor = legacy ? createActor() : null;
  const f = legacy ? { actor, game: createGame([actor]), hooks: createHooks() } : createShadowdarkFixture();
  f.game.user.character = f.actor;
  globalThis.game = f.game; globalThis.Hooks = f.hooks;
  const dictionary = await fetch("/locales/en.json").then(r => r.json());
  const translate = key => key.split(".").reduce((entry, part) => entry?.[part], dictionary) ?? key;
  game.i18n = { lang: "en", localize: translate };
  const definitions = new Map(), values = new Map(), originalGet = game.settings.get;
  game.settings = {
    settings: definitions,
    register(namespace, key, data) { definitions.set(`${namespace}.${key}`, { ...data, namespace, key }); },
    get(namespace, key) { return namespace === "mikelandia-controls" ? values.get(key) ?? definitions.get(`${namespace}.${key}`)?.default : originalGet(namespace, key); },
    async set(namespace, key, value) { values.set(key, value); return value; }
  };
  registerPreferences();
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
  kernel = createAppKernel({
    store, session, commandGateway: commands, combatGateway: combat,
    authoritativeGateway: { resync: async () => ({ applied: true }) },
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
  check("application uses Mikelandia Controls name", root?.getAttribute("aria-label") === "Mikelandia Controls");
  check("exactly five navigation screens remain", [...root.querySelectorAll(".mc-main-nav-item")].map(b => b.dataset.route).join(",") === "characters,chat,journals,combat,settings");
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
  check("bottom navigation has no empty sixth slot", nav.getBoundingClientRect().height > nav.getBoundingClientRect().width || getComputedStyle(nav).gridTemplateColumns.split(" ").length === 5);
  check("character renders without token selection", !!root.querySelector(legacy ? ".mc-character-selector" : ".mc-profile-section"));
  check("no map or split viewport mounts", !root.querySelector(".mc-scene-screen, .mc-split-scene-viewport, .mc-tablet-split-toggle"));
  check("no light or token placement controls mount", !root.querySelector('[data-profile-action^="light:"], .mc-portrait-action-menu, .mc-portrait-token-ghost'));
  root.querySelector('[data-route="journals"]').click(); await tick();
  check("journal library hides module storage and denied documents", root.querySelectorAll(".mc-journal-entry").length === 1 && root.querySelector(".mc-journal-entry")?.textContent.includes("Shared Handout"));
  check("journal summary excludes hidden page names", !/Private page|Hidden page/.test(root.querySelector(".mc-journal-library")?.textContent));
  root.querySelector(".mc-journal-entry").click(); await tick();
  check("permitted journal opens in mobile reader", root.querySelector(".mc-journal-rich-text")?.textContent.includes("A shared handout."));
  check("reader excludes private and sheet-hidden pages", !/Private page|Hidden page/.test(root.querySelector(".mc-journal-reader")?.textContent));
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
  check("navigation fits viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  check("GM controls fit viewport", root.querySelector(".mc-gm-combat-controls").getBoundingClientRect().right <= innerWidth + 1);
  root.querySelector('[data-route="settings"]').click(); await tick();
  check("Settings no longer exposes Scene, movement, memory or overlays", !/Scene & Controls|Joystick|Mobile Asset Optimizer|Memory Protection|Module Overlays/.test(root.querySelector(".mc-settings")?.textContent ?? ""));
  const settings = root.querySelector(".mc-settings");
  check("Settings renders successfully", !!settings);
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  kernel?.stop();
  document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
