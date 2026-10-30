import { localizedNumber, localizedText, localizedCount } from "../../ui/primitives/localized-text.mjs";
import { ACTOR_COMMANDS } from "../../kernel/state/command-names.mjs";
import { icon, node } from "../../ui/primitives/dom.mjs";
import { countInventoryContents, favouriteItemMetadata, filterSpellsByAvailability, groupFavourites, groupFeatures, groupNpcFeatures, groupInventory, groupSpells, isSpellUnprepared, itemSubtitle } from "./collections.mjs";
import { sheetTabIcon } from "./sheets/sheet-icons.mjs";
import { resolveCharacterTheme } from "./appearance/character-theme.mjs";
import { bindLongPress } from "../../ui/primitives/long-press.mjs";
import { renderActionSessionModal } from "../../ui/frame/action-session-modal.mjs";
import { bindDetailsDisclosure } from "../../ui/primitives/disclosure.mjs";
import { hasCharacterDisclosure } from "../../kernel/state/app-state.mjs";
import { renderImageViewer } from "../../ui/media/image-viewer.mjs";
import { renderRollResultOverlay } from "../../ui/media/roll-result-overlay.mjs";
import { resolveHeaderBanner } from "./appearance/header-banner.mjs";
import { actorSheetTabs, actorOriginBack, collectiveHeaderContent, renderCollectivePanel } from "./sheets/collective-sheet.mjs";
import { renderNativeCharacter } from "./sheets/native-sheet.mjs";
import { renderTargets } from "../combat/targets.mjs";
import { characterHasTargets } from "../combat/targeting-surface.mjs";
import { renderDescription } from "../../ui/primitives/description.mjs";

const SHEET_TABS = Object.freeze([
  ["favourites", "favourites", "Favourites"],
  ["overview", "overview", "Overview"],
  ["inventory", "inventory", "Inventory"],
  ["spells", "spells", "Spells"],
  ["features", "features", "Features"],
  ["biography", "biography", "Biography"]
]);
const SHEET_PAGES = new Set([...SHEET_TABS.map(([key]) => key), "abilities", "effects"]);
const CURRENCY_DENOMINATIONS = Object.freeze(["pp", "gp", "ep", "sp", "cp"]);
const DEATH_SAVE_PRESENTATION_BY_ACTOR = new Map();
const SPEED_SELECTION_BY_ACTOR = new Map();

export function renderCharacters({ state, commands, scope, overlayHost = null, retained = null }) {
  const actors = state.snapshot?.actors ?? [];
  const actor = Object.hasOwn(state.snapshot ?? {}, "selectedActor")
    ? state.snapshot.selectedActor
    : actors.find((entry) => entry.id === state.selectedActorId) ?? null;
  if (["native", "profile"].includes(actor?.presentation)) {
    return renderNativeCharacter({ state, commands, scope, createChooser: createCharacterMenuController, renderNotes: (actor, commands, status, scope, editorScope) => biographyPanel(actor, commands, status, scope, true, editorScope), retained });
  }
  if (!actor) {
    const chooser = createCharacterMenuController({ actors, selectedActor: null, commands, onClose: () => {}, scope, embedded: true });
    chooser.mount();
    return node("section", { className: "mc-character-screen mc-character-unselected", children: [
      node("header", { className: "mc-character-selection-notice", children: [icon("fa-user"), node("h2", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.PleaseSelectACharacter", "Please select a character") })] }),
      actors.length ? chooser.element : node("p", { className: "mc-empty", text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NoSupportedCharactersAreAvailableToThisUser", "No supported characters are available to this user.") })
    ] });
  }

  const ownerScope = scope;
  const shell = retained ?? { scope: ownerScope, actor: null, headerPreferences: null };
  shell.paneScope?.dispose();
  shell.overlayScope?.dispose();
  shell.paneScope = ownerScope.child("character-pane");
  shell.overlayScope = ownerScope.child("character-overlays");
  scope = shell.paneScope;
  // Disclosure initialization belongs to this pane, including its async task.
  const sourceUuid = actor.sourceUuid ?? state.selectedActorSourceUuid;
  // This presentation choice belongs to the retained character shell. It
  // survives publications/tab changes but never crosses exact Actor sources.
  if (shell.spellcastingSelection?.sourceUuid !== sourceUuid) shell.spellcastingSelection = { sourceUuid, classId: "" };
  let defaultClaimed = hasCharacterDisclosure(state, sourceUuid, state.characterTab)
    || Boolean(state.characterOpenSections?.length);
  const suppliedCommands = commands;
  commands = { ...commands, claimDefaultCharacterSection: (sectionId) => {
    if (defaultClaimed || !sectionId) return false;
    defaultClaimed = true;
    queueMicrotask(() => {
      if (!scope.disposed) suppliedCommands.initializeCharacterSections?.(sourceUuid, state.characterTab, [sectionId]);
    });
    return true;
  } };
  const status = shell.status ??= node("p", { className: "mc-action-status", attrs: { role: "status", "aria-live": "polite" } });
  const selectedItem = actorItemById(actor, state.characterItemId);
  const openItem = (item) => commands.openCharacterItem(item.id);
  const itemModal = itemDetailModal(selectedItem, commands.closeCharacterItem, shell.overlayScope, commands);
  const actionModal = renderActionSessionModal(state.actionSession, commands, shell.overlayScope);
  const hpModal = hitPointEditor(actor, state.hitPointEditor, commands, shell.overlayScope);
  const restModal = hitDiceRestEditor(actor, state.restEditor, commands, shell.overlayScope);
  const spellSlotModal = spellSlotEditor(actor, state.spellSlotEditor, commands, shell.overlayScope);
  const xpModal = experienceEditor(actor, state.xpEditor, commands, shell.overlayScope);
  const portraitModal = renderImageViewer(state.portraitImage, commands.closeCharacterPortrait, shell.overlayScope, { localize: commands.localize });
  const settings = commands.readCharacterPreferences();
  const collectiveTabs = actorSheetTabs(actor.type);
  const favouritesEnabled = !collectiveTabs && settings.characterFavouritesEnabled !== false && settings.characterFavouritesSource !== "off";
  const visibleTabs = collectiveTabs ?? (favouritesEnabled ? SHEET_TABS : SHEET_TABS.filter(([key]) => key !== "favourites"));
  const activePage = (collectiveTabs ? collectiveTabs.some(([key]) => key === state.characterTab) : SHEET_PAGES.has(state.characterTab) && (state.characterTab !== "favourites" || favouritesEnabled)) ? state.characterTab : "overview";
  const activeTab = ["abilities", "effects"].includes(activePage) ? "overview" : activePage;
  const characterTheme = resolveCharacterTheme(actor.themeClassKey, settings.colorScheme);
  const overlays = [itemModal, hpModal, restModal, spellSlotModal, xpModal, portraitModal, actionModal, renderRollResultOverlay(state.rollResult, commands, shell.overlayScope)].filter(Boolean);
  shell.overlayScope.own(() => overlays.forEach(element => element.remove()));
  if (overlayHost) overlayHost.append(...overlays);

  const tabsKey = visibleTabs.map(([key]) => key).join(":");
  if (!shell.tabBar || shell.tabsKey !== tabsKey) {
    shell.navScope?.dispose();
    shell.navScope = ownerScope.child("character-tabs");
    const tabBar = node("div", {
      className: "mc-sheet-tabs",
      attrs: { role: "tablist", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CharacterSheetSections", "Character sheet sections") },
      dataset: { count: String(visibleTabs.length) },
      children: visibleTabs.map(([key, iconName, label]) => {
        const localizedLabel = commands.localize?.(`${collectiveTabs ? "MIKELANDIA_CONTROLS.Collective" : "MIKELANDIA_CONTROLS.Character.Tabs"}.${label}`, label) ?? label;
        return node("button", {
          className: key === activeTab ? "is-active" : "",
          attrs: { type: "button", role: "tab", "aria-label": localizedLabel, title: localizedLabel, "data-character-tab": key, "aria-selected": String(key === activeTab) },
          on: { click: () => commands.selectCharacterTab(key) },
          children: [sheetTabIcon(iconName), node("span", { text: localizedLabel })]
        }, shell.navScope);
      })
    });

    shell.tabBar?.replaceWith(tabBar);
    shell.tabBar = tabBar;
    shell.tabsKey = tabsKey;
  }
  const tabBar = shell.tabBar;
  for (const button of tabBar.querySelectorAll("[data-character-tab]")) {
    const active = button.dataset.characterTab === activeTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  updateCharacterSharedHeader(shell, { actors, actor, state, commands, status, settings, ownerScope, overlayHost });
  const panel = node("div", { className: "mc-sheet-panel", children: [collectiveTabs ? renderCollectivePanel(actor, activePage, { commands, status, scope, state }, {
      inventory: () => inventoryPanel(actor, commands, status, openItem, state.expandedCharacterItemId, state.characterOpenSections, scope, settings),
      biography: () => biographyPanel(actor, commands, status, scope),
      features: excluded => {
        const features = actor.features.filter(item => !excluded.has(item.id));
        return features.length ? featuresPanel({ ...actor, features }, commands, status, openItem, state.expandedCharacterItemId, state.characterOpenSections, scope, settings) : null;
      },
      item: item => itemRow(item, actor, commands, status, openItem, state.expandedCharacterItemId, scope),
      abilities: () => compactAbilitiesPanel(actor, commands, status, scope),
      traits: () => traitsPanel(actor, commands.localize),
      effects: owner => effectsPanel(actor, commands, status, state.characterOpenSections, owner, settings)
    }) : renderSheetPanel(activePage, actor, commands, status, openItem, state.expandedCharacterItemId, state.characterOpenSections, scope, settings, shell.spellcastingSelection)] });
  if (!collectiveTabs && characterHasTargets(actor, activePage)) {
    const targets = renderTargets({ targeting: state.targeting, commands, scope });
    if (targets) panel.prepend(targets);
  }
  const screen = shell.screen ??= node("section", {
    className: "mc-character-screen mc-character-shared-shell",
    dataset: { characterTheme, actorType: actor.type },
    children: [actorOriginBack(state, commands, ownerScope), node("div", { className: "mc-character-heading", children: [shell.selector, tabBar] }), status,
      node("div", { className: "mc-character-content-scroller", attrs: { tabindex: "0" } })]
  });
  screen.classList.toggle("has-roll-result", Boolean(state.rollResult));
  screen.classList.toggle("has-action-session", Boolean(state.actionSession));
  screen.dataset.characterTheme = characterTheme;
  screen.dataset.actorType = actor.type;
  const contentHost = screen.querySelector(".mc-character-content-scroller");
  contentHost.replaceChildren(panel);
  if (!overlayHost) screen.append(...overlays);
  screen.__mcUpdateCharacterHeader = ({ state: nextState, commands: nextCommands }) => {
    const nextActors = nextState.snapshot?.actors ?? [];
    const nextActor = Object.hasOwn(nextState.snapshot ?? {}, "selectedActor")
      ? nextState.snapshot.selectedActor : nextActors.find(entry => entry.id === nextState.selectedActorId);
    if (!nextActor) return false;
    return updateCharacterSharedHeader(shell, { actors: nextActors, actor: nextActor, state: nextState,
      commands: nextCommands, status, settings: nextCommands.readCharacterPreferences(), ownerScope, overlayHost });
  };
  screen.__mcUpdateCharacter = next => renderCharacters({ ...next, scope: ownerScope, overlayHost, retained: shell });

  screen.__mcCharacterOverlayHost = overlayHost;

  return screen;
}

function updateCharacterSharedHeader(shell, { actors, actor, state, commands, status, settings, ownerScope, overlayHost }) {
  // Snapshot identity is the invalidation boundary. A tab tap reuses the
  // authoritative Actor record and never constructs a selector or menu.
  const headerPreferences = { artwork: settings.headerArtwork, colorScheme: settings.colorScheme };
  const headerPreferencesChanged = !shell.headerPreferences
    || shell.headerPreferences.artwork !== headerPreferences.artwork
    || shell.headerPreferences.colorScheme !== headerPreferences.colorScheme;
  if (!shell.selector || shell.actor !== actor || headerPreferencesChanged || shell.actors !== actors) {
    shell.headerScope?.dispose();
    shell.headerScope = ownerScope.child("character-header");
    const selector = characterSelector(actors, actor, state, commands, status, shell.headerScope, settings, overlayHost);
    shell.selector?.replaceWith(selector);
    shell.selector = selector;
    shell.actor = actor;
    shell.actors = actors;
    shell.headerPreferences = headerPreferences;
    if (shell.screen) {
      shell.screen.dataset.actorType = actor.type;
      shell.screen.dataset.characterTheme = resolveCharacterTheme(actor.themeClassKey, settings.colorScheme);
    }
  }
  else return false;
  return true;
}

function characterSelector(actors, actor, state, commands, status, scope, settings, overlayHost = null) {
  let open = false;
  const arrow = icon("fa-chevron-down");
  const bannerResolution = resolveHeaderBanner(actor, settings.headerArtwork);
  const menuController = createCharacterMenuController({ actors, selectedActor: actor, commands, onClose: () => setOpen(false), scope });
  const menu = menuController.element;

  const trigger = node("button", {
    className: "mc-character-select-trigger",
    attrs: { type: "button", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.SelectCharacterCurrentCharacter", "Select character. Current character: {name}", { name: (actor.name) }) },
    on: { click: () => setOpen(!open) },
    children: [arrow]
  }, scope);
  const characterName = node("h2", { text: actor.name, attrs: { title: actor.name } });
  if (!actor.collective) bindCharacterNameLines(characterName, actor.name, scope);
  const portraitTitle = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.PortraitOf", "{name}'s portrait", { name: (actor.name) });
  const portraitButton = node("button", { className: "mc-character-portrait-button", attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.ViewPortrait", "View {name} portrait", { name: (actor.name) }) }, on: { click: () => commands.openCharacterPortrait({ src: actor.img, name: portraitTitle }) }, children: [node("img", { attrs: { src: actor.img, alt: portraitTitle } })] }, scope);
  const deathSave = actor.collective ? null : deathSaveControl(actor, commands, status, scope);
  const header = node("article", {
    className: actor.collective ? "mc-sheet-identity mc-collective-header" : "mc-sheet-identity mc-compact-header",
    dataset: { classArt: "fallback" },
    children: actor.collective ? collectiveHeaderContent(actor, { portraitButton, characterName, trigger, commands, scope, status }) : [
      node("div", { className: "mc-character-identity-band", children: [
        node("div", { className: `mc-sheet-portrait-frame${shouldRenderDeathSaves(actor) ? " is-downed" : ""}`, children: [
          portraitButton,
          deathSave?.roll
        ] }),
        node("div", { className: "mc-sheet-identity-copy", children: [
          characterName,
          actor.type === "npc" ? null : node("p", { children: [classIconNode(actor), node("span", { text: characterClassLine(actor) })] }),
          characterOriginLine(actor, commands),
          node("p", { className: "mc-character-compact-summary", attrs: { "aria-hidden": "true" }, children: [node("span", { className: "mc-character-compact-level", text: `${actor.type === "npc" ? `${localizedText(commands.localize, "DND5E.AbbreviationCR", "CR")} ${actor.npc?.challengeRatingLabel ?? "—"}` : characterClassLine(actor)}${Number.isFinite(actor.proficiency) ? ` · ${headerLabel(actor, "proficiencyAbbr", "PB")} ${formatModifier(actor.proficiency)}` : ""}` }), actor.type === "npc" ? node("span", { className: "mc-character-compact-npc", text: npcIdentityLines(actor, commands).join(" · ") }) : null] })
        ] }),
        node("div", { className: "mc-character-identity-controls", children: [trigger,
          node("div", { className: "mc-character-badge-group", children: [characterLevelBadge(actor), heroicInspirationControl(actor, commands, status, scope)] })
        ] }),
        deathSave?.row
      ] }),
      node("div", { className: "mc-character-vitals-group", children: [
        characterHitPoints(actor, commands, status, scope),
        characterHealthTrack(actor, commands.localize)
      ] }),
      characterExperience(actor, commands, scope),
      characterHeaderVitals(actor, commands, status, scope)
    ]
  });
  loadBannerArtwork(header, bannerResolution.candidates, scope);
  if (overlayHost) { overlayHost.append(menu); scope.own(() => menu.remove()); }
  const selector = node("div", { className: "mc-character-selector", children: [header, ...(overlayHost ? [] : [menu])] });
  function setOpen(next) {
    open = Boolean(next);
    selector.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", String(open));
    arrow.classList.toggle("fa-chevron-down", !open);
    arrow.classList.toggle("fa-chevron-up", open);
    if (open) menuController.mount();
    else menuController.unmount();
    menu.toggleAttribute("hidden", !open);
  }

  scope.listen(document, "pointerdown", (event) => {
    if (open && !selector.contains(event.target) && !menu.contains(event.target)) setOpen(false);
  }, { passive: true });
  return selector;
}

const bannerImageCache = new Map();

function readyBanner(url) {
  if (bannerImageCache.has(url)) return bannerImageCache.get(url);
  const image = new Image();
  image.decoding = "async";
  const entry = { image, loaded: false, ready: null };
  const ready = new Promise((resolve, reject) => {
    image.onload = () => {
      Promise.resolve().then(() => typeof image.decode === "function" ? image.decode() : undefined)
        .then(() => resolve(image), reject);
    };
    image.onerror = reject;
    image.src = url;
  });
  entry.ready = ready;
  bannerImageCache.set(url, entry);
  ready.then(() => {
    entry.loaded = true;
    // Keep only two decoded image objects for rapid revisits.
    while (bannerImageCache.size > 2) bannerImageCache.delete(bannerImageCache.keys().next().value);
  }, () => bannerImageCache.delete(url));
  return entry;
}

export function loadBannerArtwork(header, candidates, scope) {
  if (!candidates.length || typeof Image !== "function") return;
  let cancelled = false;
  scope.own(() => { cancelled = true; });
  const apply = (url) => {
    header.style.setProperty("--mc-class-art", `url("${url}")`);
    header.dataset.bannerCatalogue = "true";
  };
  const first = bannerImageCache.get(candidates[0].url);
  if (first?.loaded) {
    apply(candidates[0].url);
    return;
  }
  const tryCandidate = async () => {
    for (const candidate of candidates) {
      if (cancelled) return;
      try {
        await readyBanner(candidate.url).ready;
        if (cancelled) return;
        apply(candidate.url);
        return;
      } catch { /* Try the next catalogue fallback. */ }
    }
  };
  void tryCandidate();
}

export function splitCharacterName(name, width, measure) {
  const text = String(name ?? "").trim();
  if (!text || measure(text) <= width) return [text, ""];
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(characters.slice(0, middle).join("")) <= width) low = middle;
    else high = middle - 1;
  }
  const prefix = characters.slice(0, Math.max(1, low)).join("");
  const boundary = /^\s/u.test(text.slice(prefix.length)) ? prefix.length : prefix.search(/\s+\S*$/u);
  const split = boundary > 0 ? boundary : prefix.length;
  return [text.slice(0, split).trimEnd(), text.slice(split).trimStart()];
}

function bindCharacterNameLines(heading, name, scope) {
  const first = node("span", { className: "mc-character-name-first", text: name, attrs: { "aria-hidden": "true" } });
  const second = node("span", { className: "mc-character-name-second", attrs: { "aria-hidden": "true", hidden: true } });
  heading.setAttribute("aria-label", name);
  heading.replaceChildren(first, second);
  let previousWidth = -1;
  const layout = (force = false) => {
    if (scope.disposed || !heading.isConnected) return;
    const width = heading.getBoundingClientRect().width;
    if (width <= 0 || (!force && width === previousWidth)) return;
    previousWidth = width;
    first.textContent = name;
    const range = document.createRange();
    const text = first.firstChild;
    const lines = splitCharacterName(name, width, prefix => {
      if (!prefix || !text) return 0;
      range.setStart(text, 0);
      range.setEnd(text, prefix.length);
      return range.getBoundingClientRect().width;
    });
    first.textContent = lines[0];
    second.textContent = lines[1];
    second.hidden = !lines[1];
  };
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => layout()) : null;
  observer?.observe(heading);
  scope.own(() => observer?.disconnect());
  scope.listen(document.fonts, "loadingdone", () => layout(true));
  scope.timeout(() => layout(true), 0);
}

function deathSaveControl(actor, commands, status, scope) {
  // Recovery also clears the retained final result before this UI disappears.
  const presentation = deathSavePresentation(actor);
  if (!shouldRenderDeathSaves(actor)) return null;
  const { successes, failures, outcome } = presentation;
  const enabled = Boolean(actor.capabilities?.rollDeathSave) && !outcome;
  const outcomeLabel = outcome === "stabilised" ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Stabilised", "Stabilized") : outcome === "dead" ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Dead", "Dead") : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.DeathSaves", "Death Saves");
  return {
    roll: node("button", {
      className: "mc-death-save-roll",
      attrs: { type: "button", disabled: !enabled, "aria-label": outcome ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.DeathSavingThrowsConcluded", "{outcomeLabel}; death saving throws concluded", { outcomeLabel: (outcomeLabel) }) : enabled ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.RollDeathSavingThrow", "Roll death saving throw") : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.DeathSavingThrowUnavailable", "Death saving throw unavailable") },
      on: { click: (event) => runActorCommand(event.currentTarget, ACTOR_COMMANDS.ROLL_DEATH_SAVE, actor, {}, commands, status, localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.RollingDeathSave", "Rolling death save…"), localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.DeathSave", "Death save"), scope) },
      children: [node("span", { className: "mc-death-save-d20", attrs: { "aria-hidden": "true" } })]
    }, scope),
    row: node("section", { className: `mc-death-saves${outcome ? ` is-concluded is-${outcome}` : ""}`, attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.DeathSavesSuccessesAndFailures", "Death saves: {successes} successes and {failures} failures{outcome}", { successes, failures, outcome: outcome ? `; ${outcomeLabel}` : "" }) }, children: [
    node("div", { className: "mc-death-save-pips", attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.SuccessesAndFailures", "{successes} successes and {failures} failures", { successes: (successes), failures: (failures) }) }, children: [
      deathPips("Successes", successes, "success"),
      deathPips("Failures", failures, "failure")
    ] }),
    outcome ? node("strong", { className: "mc-death-save-outcome", text: outcomeLabel }) : null
  ] })
  };
}

export function shouldRenderDeathSaves(actor) {
  const rawHitPoints = actor?.hp?.value;
  if (rawHitPoints === null || rawHitPoints === undefined || rawHitPoints === "") return false;
  const hitPoints = Number(rawHitPoints);
  return Number.isFinite(hitPoints) && hitPoints === 0;
}

export function deathSavePresentation(actor) {
  const key = String(actor?.sourceUuid ?? actor?.uuid ?? (actor?.id ? `Actor.${actor.id}` : ""));
  const hitPoints = Number(actor?.hp?.value);
  const native = Object.freeze({
    successes: Math.max(0, Math.min(3, Number(actor?.deathSaves?.successes) || 0)),
    failures: Math.max(0, Math.min(3, Number(actor?.deathSaves?.failures) || 0))
  });
  if (Number.isFinite(hitPoints) && hitPoints > 0) {
    if (key) DEATH_SAVE_PRESENTATION_BY_ACTOR.delete(key);
    return Object.freeze({ ...native, outcome: "" });
  }
  if (!Number.isFinite(hitPoints) || hitPoints !== 0) return Object.freeze({ ...native, outcome: "" });
  const outcome = native.failures >= 3 ? "dead" : native.successes >= 3 ? "stabilised" : "";
  if (outcome) {
    const completed = Object.freeze({ ...native, outcome });
    if (key) DEATH_SAVE_PRESENTATION_BY_ACTOR.set(key, completed);
    return completed;
  }
  return DEATH_SAVE_PRESENTATION_BY_ACTOR.get(key) ?? Object.freeze({ ...native, outcome: "" });
}

function deathPips(label, count, kind) {
  return node("span", { className: `is-${kind}`, attrs: { title: label }, children: [node("small", { text: label }), node("span", { className: "mc-death-save-kind", text: kind === "success" ? "✓" : "×", attrs: { "aria-hidden": "true" } }), ...Array.from({ length: 3 }, (_, index) => node("i", { className: index < count ? "is-filled" : "", attrs: { "aria-hidden": "true" } }))] });
}

export function buildCharacterMenuTree(actors) {
  const root = { folders: new Map(), actors: [] };
  for (const actor of actors) {
    let branch = root;
    for (const folder of actor.folderPath ?? []) {
      if (!branch.folders.has(folder.id)) branch.folders.set(folder.id, { folder, folders: new Map(), actors: [] });
      branch = branch.folders.get(folder.id);
    }
    branch.actors.push(actor);
  }
  return root;
}

export function createCharacterMenuController({ actors, selectedActor, commands, onClose, scope, embedded = false }) {
  const root = buildCharacterMenuTree(actors);
  const expandedFolderIds = new Set();
  const selectedDirectoryActor = actors.find((entry) => characterRecordSourceUuid(entry) === characterRecordSourceUuid(selectedActor)) ?? null;
  const element = node("div", {
    className: `mc-character-menu${embedded ? " mc-character-menu-inline" : ""}`,
    attrs: { role: "menu", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.AvailableCharacters", "Available characters"), hidden: !embedded }
  });
  let bodyScope = null;

  const unmount = () => {
    bodyScope?.dispose();
    bodyScope = null;
    element.replaceChildren();
  };

  const mount = () => {
    if (bodyScope || scope.disposed) return;
    for (const folder of selectedDirectoryActor?.folderPath ?? []) expandedFolderIds.add(String(folder.id));
    bodyScope = scope.child("character-menu-body");
    const owner = bodyScope;
    const context = { selectedActor, commands, onClose, expandedFolderIds };
    const heading = node("header", { className: "mc-character-menu-heading", children: [
      node("strong", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.SelectCharacter", "Select character") }),
      node("button", { className: "mc-character-menu-close", attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CloseCharacterSelector", "Close character selector") }, on: { click: onClose }, children: [icon("fa-xmark")] }, owner)
    ] });
    element.replaceChildren(...(embedded ? [] : [heading]), ...renderCharacterMenuBranch(root, context, owner));
    afterCharacterMenuLayout(owner, () => {
      if (bodyScope !== owner || embedded) return;
      const current = element.querySelector('[aria-current="true"]');
      if (!current) return;
      if (typeof current.scrollIntoView === "function") current.scrollIntoView({ block: "center", inline: "nearest" });
      else element.scrollTop = Math.max(0, current.offsetTop - (element.clientHeight - current.offsetHeight) / 2);
    });
  };

  scope.own(() => {
    unmount();
    expandedFolderIds.clear();
  });
  return Object.freeze({ element, expandedFolderIds, mount, unmount });
}

function afterCharacterMenuLayout(scope, callback) {
  let cancelled = false;
  const requestFrame = globalThis.requestAnimationFrame;
  if (typeof requestFrame === "function") {
    const frame = requestFrame(() => {
      if (!cancelled && !scope.disposed) callback();
    });
    scope.own(() => {
      cancelled = true;
      globalThis.cancelAnimationFrame?.(frame);
    });
    return;
  }
  scope.own(() => { cancelled = true; });
  queueMicrotask(() => {
    if (!cancelled && !scope.disposed) callback();
  });
}

function renderCharacterMenuBranch(branch, context, scope) {
  const folders = Array.from(branch.folders.values())
    .sort((left, right) => Number(left.folder.sort) - Number(right.folder.sort) || left.folder.name.localeCompare(right.folder.name));
  const actors = [...branch.actors]
    .sort((left, right) => Number(left.sort) - Number(right.sort) || left.name.localeCompare(right.name));
  return [
    ...folders.map((folder) => characterMenuFolder(folder, context, scope)),
    ...actors.map((actor) => characterMenuActor(actor, context.selectedActor, context.commands, context.onClose, scope))
  ];
}

function characterMenuFolder(branch, context, scope) {
  const folderId = String(branch.folder.id);
  const folderScope = scope.child(`folder:${folderId}`);
  const initiallyOpen = context.expandedFolderIds.has(folderId);
  const chevron = icon("fa-chevron-right");
  const summary = node("summary", {
    attrs: { role: "menuitem", "aria-expanded": String(initiallyOpen) },
    children: [chevron, icon("fa-folder"), node("strong", { text: branch.folder.name }), node("small", { text: characterFolderCount(branch) })]
  });
  const details = node("details", {
    className: "mc-character-menu-folder",
    attrs: { open: initiallyOpen, "data-folder-id": folderId },
    children: [summary]
  });
  let contents = null;
  let contentsScope = null;

  const disposeContents = () => {
    contentsScope?.dispose();
    contentsScope = null;
    contents?.remove();
    contents = null;
  };
  const renderContents = () => {
    if (contents || folderScope.disposed) return;
    contentsScope = folderScope.child("contents");
    contents = node("div", {
      className: "mc-character-menu-folder-contents",
      children: renderCharacterMenuBranch(branch, context, contentsScope)
    });
    details.append(contents);
  };

  folderScope.own(disposeContents);
  bindDetailsDisclosure(details, summary, (nextOpen) => {
    if (nextOpen) {
      context.expandedFolderIds.add(folderId);
      renderContents();
    } else {
      context.expandedFolderIds.delete(folderId);
      disposeContents();
    }
  }, folderScope);
  if (initiallyOpen) renderContents();
  return details;
}

function characterMenuActor(entry, selectedActor, commands, setOpen, scope) {
  const active = characterRecordSourceUuid(entry) === characterRecordSourceUuid(selectedActor);
  return node("button", {
    className: `mc-character-menu-actor${active ? " is-active" : ""}`,
    attrs: { type: "button", role: "menuitem", "aria-current": active ? "true" : undefined, "data-actor-source": characterRecordSourceUuid(entry) },
    on: { click: () => {
      setOpen(false);
      commands.selectActor(characterRecordSourceUuid(entry));
    } },
    children: [
      node("span", { className: "mc-character-menu-portrait", children: [node("img", { attrs: { src: entry.img, alt: "", loading: "lazy", decoding: "async" } })] }),
      node("span", { className: "mc-character-menu-copy", children: [node("strong", { text: entry.name }), node("small", { text: characterIdentityLine(entry, commands) })] }),
      active ? icon("fa-check") : null
    ]
  }, scope);
}

export function characterFolderCount(branch) {
  return branch.actors.length + Array.from(branch.folders.values()).reduce((total, folder) => total + characterFolderCount(folder), 0);
}

export function characterIdentityLine(actor, commands = null) {
  if (["native", "profile"].includes(actor.presentation)) return actor.typeLabel ?? "";
  if (actor.type === "group") return commands?.localize?.("MIKELANDIA_CONTROLS.Collective.Group", "Group") ?? "Group";
  if (actor.type === "vehicle") return commands?.localize?.("MIKELANDIA_CONTROLS.Collective.Vehicle", "Vehicle") ?? "Vehicle";
  if (actor.type === "npc") {
    return actor.npc?.creatureType || "NPC";
  }
  const classNames = actor.classes?.length ? actor.classes.map((entry) => entry.name).join(" / ") : "Character";
  return `${headerLabel(actor, "level", localizedText(commands?.localize, "MIKELANDIA_CONTROLS.Character.Header.level", "Level"))} ${actor.level || "—"} ${classNames}`;
}

function characterClassLine(actor) {
  return characterIdentityLine(actor);
}

function characterClassIcon(actor) {
  const classes = Array.isArray(actor.classes)
    ? actor.classes.filter((entry) => String(entry?.name ?? "").trim())
    : [];
  if (classes.length > 1) return dnd5eSymbol("multiclass");
  if (classes.length === 0) return dnd5eSymbol("original-class");

  const classIcons = {
    barbarian: dnd5eSymbol("barbarian"),
    bard: dnd5eSymbol("bard"),
    cleric: dnd5eSymbol("cleric"),
    druid: dnd5eSymbol("druid"),
    fighter: dnd5eSymbol("fighter"),
    monk: dnd5eSymbol("monk"),
    paladin: dnd5eSymbol("paladin"),
    ranger: dnd5eSymbol("ranger"),
    rogue: dnd5eSymbol("rogue"),
    sorcerer: dnd5eSymbol("sorcerer"),
    warlock: dnd5eSymbol("warlock"),
    wizard: dnd5eSymbol("wizard")
  };
  return classIcons[String(classes[0].name).trim().toLowerCase()] ?? dnd5eSymbol("original-class");
}

function classIconNode(actor) {
  const classIcon = characterClassIcon(actor);
  return themedSymbol(classIcon, "mc-character-class-symbol");
}

function characterOriginLine(actor, commands) {
  if (actor.type === "npc") {
    const lines = npcIdentityLines(actor, commands);
    return node("p", {
      className: "mc-character-origin mc-npc-metadata",
      children: lines.map((line) => node("span", { className: "mc-npc-metadata-line", attrs: { title: line }, text: line }))
    });
  }
  if (!actor.species && !actor.background) return null;
  const originIcon = characterSpeciesIcon(actor);
  return node("p", {
    className: "mc-character-origin",
    children: [
      themedSymbol(originIcon, "mc-character-origin-symbol"),
      node("span", { className: "mc-character-origin-copy", children: [
        actor.species ? node("span", { className: "mc-character-species-name", text: actor.species }) : null,
        actor.background ? node("span", { className: "mc-character-background-name", text: `${actor.species ? " " : ""}${actor.background}` }) : null
      ] })
    ]
  });
}

export function npcIdentityLines(actor, commands) {
  const sizeAndType = [actor.npc?.size, characterIdentityLine(actor)].filter(Boolean).join(" ");
  const xp = actor.npc?.xpLabel;
  return [
    sizeAndType,
    actor.npc?.alignment,
    actor.npc?.habitat,
    xp ? `${commands.localize?.("DND5E.ExperiencePoints.Abbreviation", "XP") ?? "XP"} ${xp}` : ""
  ].filter(Boolean);
}

function characterSpeciesIcon(actor) {
  const species = String(actor.species ?? "").trim().toLowerCase();
  const speciesIcons = [
    ["changeling", { name: "fa-masks-theater", style: "solid" }],
    // Foundry 13.351 does not bundle the newer fa-user-beard glyph; keep a
    // visible native fallback until the supported Foundry font exposes it.
    ["human", { name: "fa-person", style: "solid" }],
    ["dragonborn", dnd5eSymbol("monster")],
    ["tiefling", { name: "fa-fire", style: "solid" }],
    ["dwarf", { name: "fa-mountain", style: "solid" }],
    ["goliath", { name: "fa-mountain", style: "solid" }],
    ["elf", { name: "fa-feather-pointed", style: "solid" }],
    ["halfling", { name: "fa-shoe-prints", style: "solid" }],
    ["gnome", { name: "fa-hat-wizard", style: "solid" }],
    ["aasimar", { name: "fa-sun", style: "solid" }],
    ["genasi", { name: "fa-wind", style: "solid" }],
    ["kenku", { name: "fa-crow", style: "solid" }],
    ["tabaxi", { name: "fa-cat", style: "solid" }],
    ["tortle", { name: "fa-turtle", style: "solid" }],
    ["warforged", { name: "fa-robot", style: "solid" }]
  ];
  return speciesIcons.find(([name]) => species.includes(name))?.[1] ?? characterBackgroundIcon(actor);
}

function dnd5eSymbol(name) {
  return Object.freeze({ symbol: name });
}

function themedSymbol(symbol, className) {
  if (!symbol?.symbol) return icon(symbol?.name ?? "fa-sparkles", symbol?.style ?? "solid");
  return node("span", {
    className: `${className} is-${symbol.symbol}`,
    attrs: { "aria-hidden": "true" }
  });
}

function characterBackgroundIcon(actor) {
  const background = String(actor.background ?? "").trim().toLowerCase();
  const backgroundIcons = [
    ["acolyte", "fa-hands-praying"],
    ["charlatan", "fa-masks-theater"],
    ["criminal", "fa-user-secret"],
    ["spy", "fa-user-secret"],
    ["entertainer", "fa-music"],
    ["folk hero", "fa-star"],
    ["guild artisan", "fa-hammer"],
    ["merchant", "fa-briefcase"],
    ["hermit", "fa-tent"],
    ["noble", "fa-crown"],
    ["outlander", "fa-compass"],
    ["sage", "fa-book-open"],
    ["sailor", "fa-anchor"],
    ["soldier", "fa-shield-halved"],
    ["urchin", "fa-shoe-prints"],
    ["haunted one", "fa-ghost"],
    ["courtier", "fa-comments"],
    ["far traveler", "fa-route"],
    ["inheritor", "fa-gem"],
    ["knight", "fa-chess-knight"],
    ["mercenary veteran", "fa-medal"],
    ["pirate", "fa-skull-crossbones"],
    ["investigator", "fa-magnifying-glass"],
    ["gladiator", "fa-trophy"]
  ];
  const name = backgroundIcons.find(([label]) => background.includes(label))?.[1];
  // The bundled Pro font renders both unsupported Sharp Duotone layers as
  // separate complete glyphs. Use its supported single-layer DNA fallback.
  return { name: name ?? "fa-dna", style: "solid" };
}

function characterHitPoints(actor, commands, status, scope) {
  const maximum = healthValue(actor.hp?.max);
  const value = healthValue(actor.hp?.value);
  const temporary = healthValue(actor.hp?.temp);
  const editable = Boolean(actor.capabilities?.editHitPoints);
  return node("section", { className: "mc-character-header-hp", attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.HitPointsOfTemporaryHitPoints", "Hit points {value} of {maximum}; temporary hit points {temporary}", { value: (value), maximum: (maximum), temporary: (temporary) }) }, children: [
    node("button", { className: "mc-character-header-hp-main", attrs: { type: "button", disabled: !editable, "aria-label": editable ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.EditHitPointsOf", "Edit hit points. {value} of {maximum}", { value: (value), maximum: (maximum) }) : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.HitPointsOf", "Hit points {value} of {maximum}", { value: (value), maximum: (maximum) }) }, on: { click: () => commands.openHitPointEditor("hp") }, children: [
      node("small", { text: headerLabel(actor, "hitPoints", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Header.hitPoints", "Hit Points")) }),
      node("div", { className: "mc-character-header-hp-value", children: [node("i", { className: "fa-sharp fa-solid fa-heart", attrs: { "aria-hidden": "true" } }), node("strong", { text: value }), node("span", { text: `/ ${maximum}` })] })
    ] }, scope),
    node("button", { className: "mc-character-header-temp-hp", attrs: { type: "button", disabled: !editable, "aria-label": editable ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.EditTemporaryHitPointsCurrentValue", "Edit temporary hit points. Current value {temporary}", { temporary: (temporary) }) : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.TemporaryHitPoints", "Temporary hit points {temporary}", { temporary: (temporary) }) }, on: { click: () => commands.openHitPointEditor("temp") }, children: [
      node("small", { text: headerLabel(actor, "tempHp", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Header.tempHp", "Temp HP")) }),
      node("div", { children: [node("i", { className: "fa-sharp fa-solid fa-shield-heart", attrs: { "aria-hidden": "true" } }), node("strong", { text: temporary })] })
    ] }, scope)
  ] });
}

function healthValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : "—";
}

/** Both layers use maximum HP. Visual clamping never changes the displayed record. */
export function characterHealthTrack(actor, localize = null) {
  const { value, max, temp } = actor.hp ?? {};
  const proportional = typeof max === "number" && Number.isFinite(max) && max > 0;
  const percent = value => proportional && typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value / max * 100)) : 0;
  const fill = node("i", { className: "mc-character-health-current" });
  fill.style.width = `${percent(value)}%`;
  const temporary = proportional && percent(temp) > 0 ? node("i", { className: "mc-character-health-temp" }) : null;
  if (temporary) temporary.style.width = `${percent(temp)}%`;
  return node("div", {
    className: `mc-character-header-health-track${proportional ? "" : " is-neutral"}`,
    attrs: { role: "img", "aria-label": localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.HealthTrack", "Hit points {value}; maximum hit points {maximum}; temporary hit points {temporary}", { value: healthValue(value), maximum: healthValue(max), temporary: healthValue(temp) }) },
    children: [fill, temporary]
  });
}

export function characterLevelBadge(actor) {
  const value = actor.type === "character" ? actor.header?.level : actor.type === "npc" ? actor.npc?.challengeRatingLabel : null;
  if (value === null || value === undefined || value === "") return null;
  const label = actor.type === "npc" ? "CR" : headerLabel(actor, "level", "Level");
  return node("div", { className: "mc-character-level-badge", attrs: { "aria-label": `${label} ${value}` }, children: [
    actor.type === "npc" ? node("small", { text: label }) : null,
    node("strong", { text: value }),
    typeof actor.proficiency === "number" && Number.isFinite(actor.proficiency)
      ? node("small", { className: "mc-character-proficiency", attrs: { "aria-label": `${headerLabel(actor, "proficiency", "Proficiency bonus")} ${formatModifier(actor.proficiency)}` }, children: [
        node("span", { text: `${headerLabel(actor, "proficiencyAbbr", "PB")} ` }),
        node("b", { text: formatModifier(actor.proficiency) })
      ] }) : null
  ] });
}

function heroicInspirationControl(actor, commands, status, scope) {
  if (actor.type !== "character") return null;
  const active = Boolean(actor.inspiration);
  const editable = Boolean(actor.capabilities?.editInspiration);
  return node("button", {
    className: `mc-character-inspiration${active ? " is-active" : ""}`,
    attrs: {
      type: "button",
      disabled: !editable,
      "aria-pressed": String(active),
      "aria-label": editable ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.HeroicInspiration", "{action} Heroic Inspiration", { action: localizedText(commands.localize, active ? "MIKELANDIA_CONTROLS.Character.Presenter.Remove" : "MIKELANDIA_CONTROLS.Character.Presenter.Grant", active ? "Remove" : "Grant") }) : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.HeroicInspiration2", "Heroic Inspiration {state}", { state: localizedText(commands.localize, active ? "MIKELANDIA_CONTROLS.Character.Presenter.ActiveState" : "MIKELANDIA_CONTROLS.Character.Presenter.InactiveState", active ? "active" : "inactive") }),
      title: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Header.inspiration", "Heroic Inspiration")
    },
    on: { click: (event) => setHeroicInspiration(event.currentTarget, actor, !active, commands) },
    children: [node("span", { className: "mc-inspiration-emblem", attrs: { "aria-hidden": "true" } })]
  }, scope);
}

async function setHeroicInspiration(button, actor, active, commands) {
  if (button.disabled || button.getAttribute("aria-busy") === "true") return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    await commands.execute(ACTOR_COMMANDS.SET_INSPIRATION, {
      actorSourceUuid: characterRecordSourceUuid(actor),
      active
    });
  } catch (error) {
    commands.reportCharacterMutationError?.(error);
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
}

function headerLabel(actor, key, fallback) {
  return actor.header?.labels?.[key] || fallback;
}

export function characterExperience(actor, commands = null, scope = null) {
  const xp = actor.header?.experience;
  if (!xp) return null;
  const locale = actor.header?.locale ?? commands?.readLocale?.() ?? "en";
  const values = xp.next === null ? localizedNumber(xp.value, locale) : `${localizedNumber(xp.value, locale)} / ${localizedNumber(xp.next, locale)}`;
  const label = headerLabel(actor, "experience", localizedText(commands?.localize, "MIKELANDIA_CONTROLS.Character.Header.experience", "Experience progress"));
  const boons = xp.boonsEarned === null ? "" : `${headerLabel(actor, "boons", "Epic boons earned")}: ${localizedNumber(xp.boonsEarned, locale)}`;
  const fill = node("i");
  fill.style.width = `${xp.percent}%`;
  const editable = Boolean(commands && actor.capabilities?.editExperience);
  return node(editable ? "button" : "div", { className: "mc-character-header-xp", attrs: { type: editable ? "button" : undefined, title: boons || label, "aria-label": editable ? commands.localize?.("MIKELANDIA_CONTROLS.Character.AddExperience", "Add experience") ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.AddExperience", "Add experience") : undefined }, on: editable ? { click: () => commands.openExperienceEditor() } : undefined, children: [
    node("small", { children: [icon("fa-star"), node("span", { text: headerLabel(actor, "xp", localizedText(commands?.localize, "MIKELANDIA_CONTROLS.Character.Header.xp", "XP")) })] }),
    node("span", { className: "mc-character-xp-track", attrs: { role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": xp.percent, "aria-valuetext": `${values}; ${localizedNumber(xp.percent, locale)}%${boons ? `; ${boons}` : ""}` }, children: [fill] }),
    node("span", { className: "mc-character-xp-values", text: values })
  ] }, scope);
}

function experienceEditor(actor, open, commands, scope) {
  if (!open || !actor.capabilities?.editExperience) return null;
  let pending = false;
  const current = Math.max(0, Math.trunc(Number(actor.header?.experience?.value) || 0));
  const locale = actor.header?.locale ?? commands.readLocale?.() ?? "en";
  const localize = (key, fallback, data) => commands.localize?.(key, fallback, data) ?? fallback;
  const status = node("p", { className: "mc-hp-editor-status", attrs: { role: "status", "aria-live": "polite" } });
  const input = node("input", { className: "mc-hp-editor-amount", attrs: { type: "number", inputmode: "numeric", pattern: "[0-9]*", min: "0", max: "1000000000", step: "1", autocomplete: "off", required: true, placeholder: "0", "aria-label": localize("MIKELANDIA_CONTROLS.Character.ExperienceAmount", "Experience to add") } });
  const close = node("button", { className: "mc-hp-editor-close", attrs: { type: "button", "aria-label": localize("MIKELANDIA_CONTROLS.Character.CloseExperience", "Close experience editor") }, on: { click: () => { if (!pending) commands.closeExperienceEditor(); } }, children: [icon("fa-xmark")] }, scope);
  const submit = node("button", { className: "mc-hp-editor-submit", attrs: { type: "submit" }, children: [icon("fa-plus"), node("span", { text: localize("MIKELANDIA_CONTROLS.Character.AddXp", "Add XP") })] });
  const form = node("form", {
    className: "mc-hp-editor mc-xp-editor",
    attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "mc-xp-editor-title" },
    on: { submit: async (event) => {
      event.preventDefault();
      if (pending || !input.reportValidity()) return;
      const amount = Number(input.value);
      if (!Number.isSafeInteger(amount) || amount < 0) {
        status.classList.add("is-error");
        status.textContent = localize("MIKELANDIA_CONTROLS.Character.ValidExperience", "Enter a whole, non-negative XP amount.");
        return;
      }
      pending = true;
      form.setAttribute("aria-busy", "true");
      input.disabled = submit.disabled = close.disabled = true;
      status.classList.remove("is-error");
      status.textContent = localize("MIKELANDIA_CONTROLS.Character.AddingExperience", "Adding experience…");
      try {
        await commands.execute(ACTOR_COMMANDS.ADD_EXPERIENCE, { actorSourceUuid: characterRecordSourceUuid(actor), amount });
        if (!scope.disposed) commands.closeExperienceEditor();
      } catch (error) {
        if (!scope.disposed) {
          pending = false;
          form.removeAttribute("aria-busy");
          input.disabled = submit.disabled = close.disabled = false;
          status.classList.add("is-error");
          status.textContent = error?.message ?? localize("MIKELANDIA_CONTROLS.Character.ExperienceFailed", "Foundry could not add that experience.");
        }
      }
    } },
    children: [
      node("header", { children: [node("span", { className: "mc-hp-editor-heading-icon", children: [icon("fa-star")] }), node("div", { children: [node("small", { text: actor.name }), node("h2", { attrs: { id: "mc-xp-editor-title" }, text: localize("MIKELANDIA_CONTROLS.Character.AddExperience", "Add experience") })] }), close] }),
      node("div", { className: "mc-hp-editor-summary", children: [node("span", { children: [node("small", { text: localize("MIKELANDIA_CONTROLS.Character.CurrentXp", "Current XP") }), node("strong", { text: localizedNumber(current, locale) })] })] }),
      node("label", { className: "mc-hp-editor-amount-label", children: [node("span", { text: localize("MIKELANDIA_CONTROLS.Character.ExperienceAmount", "Experience to add") }), input] }),
      status,
      submit
    ]
  }, scope);
  queueMicrotask(() => input.focus?.());
  return node("div", { className: "mc-hp-editor-layer", attrs: { role: "presentation" }, children: [form] });
}

function hitPointEditor(actor, requestedEditor, commands, scope) {
  if (!requestedEditor || !actor.capabilities?.editHitPoints) return null;
  const hp = {
    value: Math.max(0, Math.trunc(Number(actor.hp?.value) || 0)),
    max: Math.max(0, Math.trunc(Number(actor.hp?.max) || 0)),
    temp: Math.max(0, Math.trunc(Number(actor.hp?.temp) || 0))
  };
  let operation = requestedEditor === "temp" ? "set-temp" : "damage";
  let pending = false;
  const modalStatus = node("p", { className: "mc-hp-editor-status", attrs: { role: "status", "aria-live": "polite" } });
  const amountInput = node("input", {
    className: "mc-hp-editor-amount",
    attrs: { type: "number", inputmode: "numeric", pattern: "[0-9]*", step: "1", autocomplete: "off", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Amount", "Amount") },
    on: { input: () => updateSubmitLabel() }
  }, scope);
  const submitLabel = node("span");
  const operationButtons = new Map();
  const editableControls = [];

  const operationChoices = [
    ["damage", "Damage", "fa-heart-crack"],
    ["heal", "Heal", "fa-heart"],
    ["set-hp", "Set HP", "fa-sliders"],
    ["set-temp", "Temp HP", "fa-shield"]
  ];
  const operationPicker = node("div", {
    className: "mc-hp-editor-modes",
    attrs: { role: "tablist", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.HitPointOperation", "Hit point operation") },
    children: operationChoices.map(([key, label, iconName]) => {
      const button = node("button", {
        attrs: { type: "button", role: "tab" },
        on: { click: () => setOperation(key, true) },
        children: [icon(iconName), node("span", { text: label })]
      }, scope);
      operationButtons.set(key, button);
      editableControls.push(button);
      return button;
    })
  });
  const decrement = node("button", { className: "mc-hp-editor-step", attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.DecreaseAmount", "Decrease amount") }, on: { click: () => stepAmount(-1) }, children: [icon("fa-minus")] }, scope);
  const increment = node("button", { className: "mc-hp-editor-step", attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.IncreaseAmount", "Increase amount") }, on: { click: () => stepAmount(1) }, children: [icon("fa-plus")] }, scope);
  editableControls.push(decrement, amountInput, increment);
  const quickAmounts = node("div", { className: "mc-hp-editor-quick", attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.QuickAmounts", "Quick amounts") }, children: [1, 5, 10].map((amount) => {
    const decrease = node("button", { attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.DecreaseAmountBy", "Decrease amount by {amount}", { amount: (amount) }) }, on: { click: () => stepAmount(-amount) }, children: [icon("fa-minus")] }, scope);
    const increase = node("button", { attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.IncreaseAmountBy", "Increase amount by {amount}", { amount: (amount) }) }, on: { click: () => stepAmount(amount) }, children: [icon("fa-plus")] }, scope);
    editableControls.push(decrease, increase);
    return node("div", { className: "mc-hp-editor-quick-step", attrs: { role: "group", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.AdjustAmountBy", "Adjust amount by {amount}", { amount: (amount) }) }, children: [decrease, node("span", { text: amount, attrs: { "aria-hidden": "true" } }), increase] });
  }) });
  const submit = node("button", { className: "mc-hp-editor-submit", attrs: { type: "submit" }, children: [icon("fa-check"), submitLabel] });
  editableControls.push(submit);
  const closeButton = node("button", { className: "mc-hp-editor-close", attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CloseHitPointEditor", "Close hit point editor") }, on: { click: () => { if (!pending) commands.closeHitPointEditor(); } }, children: [icon("fa-xmark")] }, scope);

  const form = node("form", {
    className: "mc-hp-editor",
    attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "mc-hp-editor-title" },
    on: { submit: async (event) => {
      event.preventDefault();
      if (pending || !amountInput.reportValidity()) return;
      const amount = Number(amountInput.value);
      if (!Number.isSafeInteger(amount)) return;
      pending = true;
      form.classList.add("is-pending");
      form.setAttribute("aria-busy", "true");
      for (const control of editableControls) control.disabled = true;
      closeButton.disabled = true;
      modalStatus.classList.remove("is-error");
      modalStatus.textContent = operationStatus(operation, amount, commands.localize);
      try {
        await commands.execute(ACTOR_COMMANDS.EDIT_HIT_POINTS, { actorSourceUuid: characterRecordSourceUuid(actor), operation, amount });
        if (!scope.disposed) commands.closeHitPointEditor();
      } catch (error) {
        if (!scope.disposed) {
          modalStatus.classList.add("is-error");
          modalStatus.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.FoundryCouldNotUpdateTheseHitPoints", "Foundry could not update these hit points.");
        }
      } finally {
        if (!scope.disposed) {
          pending = false;
          form.classList.remove("is-pending");
          form.removeAttribute("aria-busy");
          for (const control of editableControls) control.disabled = false;
          closeButton.disabled = false;
        }
      }
    } },
    children: [
      node("header", { children: [
        node("span", { className: "mc-hp-editor-heading-icon", children: [icon("fa-heart-pulse")] }),
        node("div", { children: [node("small", { text: actor.name }), node("h2", { attrs: { id: "mc-hp-editor-title" }, text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.EditHitPoints", "Edit Hit Points") })] }),
        closeButton
      ] }),
      node("div", { className: "mc-hp-editor-summary", children: [
        node("span", { children: [node("small", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Header.hitPoints", "Hit Points") }), node("strong", { text: `${hp.value} / ${hp.max}` })] }),
        node("span", { children: [node("small", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Header.tempHp", "Temp HP") }), node("strong", { text: hp.temp })] })
      ] }),
      operationPicker,
      node("label", { className: "mc-hp-editor-amount-label", children: [node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Amount", "Amount") }), node("div", { children: [decrement, amountInput, increment] })] }),
      quickAmounts,
      modalStatus,
      submit
    ]
  }, scope);

  setOperation(operation, true);
  return node("div", { className: "mc-hp-editor-layer", attrs: { role: "presentation" }, children: [form] });

  function setOperation(next, reset) {
    operation = next;
    for (const [key, button] of operationButtons) {
      const active = key === operation;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    }
    const minimum = ["damage", "heal"].includes(operation) ? 1 : 0;
    const maximum = operation === "set-hp" ? hp.max : 1_000_000;
    amountInput.min = String(minimum);
    amountInput.max = String(maximum);
    if (reset) setAmount(operation === "set-hp" ? hp.value : operation === "set-temp" ? hp.temp : 1);
    else updateSubmitLabel();
    modalStatus.textContent = "";
    modalStatus.classList.remove("is-error");
  }

  function setAmount(value) {
    const minimum = Number(amountInput.min) || 0;
    const maximum = Number(amountInput.max) || 1_000_000;
    amountInput.value = String(Math.max(minimum, Math.min(maximum, Math.trunc(Number(value) || 0))));
    updateSubmitLabel();
  }

  function stepAmount(delta) {
    setAmount((Number(amountInput.value) || 0) + delta);
  }

  function updateSubmitLabel() {
    const amount = Math.max(0, Math.trunc(Number(amountInput.value) || 0));
    submitLabel.textContent = operationSubmitLabel(operation, amount, commands.localize);
  }
}

function operationSubmitLabel(operation, amount, localize) {
  if (operation === "damage") return localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.ApplyDamage", "Apply {amount} Damage", { amount });
  if (operation === "heal") return localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.HealHitPoints", "Heal {amount} HP", { amount });
  if (operation === "set-temp") return localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.SetTemporaryHitPoints", "Set Temp HP to {amount}", { amount });
  return localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.SetHitPoints", "Set HP to {amount}", { amount });
}

function operationStatus(operation, amount, localize) {
  if (operation === "damage") return localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.ApplyingDamage", "Applying {amount} damage…", { amount });
  if (operation === "heal") return localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.ApplyingHealing", "Applying {amount} healing…", { amount });
  if (operation === "set-temp") return localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.UpdatingTemporaryHitPoints", "Updating temporary hit points…");
  return localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.UpdatingHitPoints", "Updating hit points…");
}

function hitDiceRestEditor(actor, open, commands, scope) {
  if (!open) return null;
  const pools = (actor.hitDice?.pools ?? []).map(pool => ({
    denomination: String(pool.denomination),
    value: Math.max(0, Math.trunc(Number(pool.value) || 0)),
    max: Math.max(0, Math.trunc(Number(pool.max) || 0))
  }));
  let selected = pools[0]?.denomination ?? "";
  let pending = false;
  const canAdjust = Boolean(actor.capabilities?.adjustHitDice && pools.length);
  const modalStatus = node("p", { className: "mc-rest-editor-status", attrs: { role: "status", "aria-live": "polite" } });
  const value = node("strong");
  const select = node("select", {
    className: "mc-rest-editor-select",
    attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.HitDieType", "Hit die type"), disabled: pools.length < 2 },
    children: pools.map(pool => node("option", { attrs: { value: pool.denomination }, text: poolLabel(pool) })),
    on: { change: event => { selected = event.currentTarget.value; refreshPool(); } }
  }, scope);
  const decrease = node("button", {
    className: "mc-rest-editor-step",
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.UseOneHitDie", "Use one hit die") },
    on: { click: () => adjust("decrease") },
    children: [icon("fa-minus")]
  }, scope);
  const increase = node("button", {
    className: "mc-rest-editor-step",
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.RestoreOneHitDie", "Restore one hit die") },
    on: { click: () => adjust("increase") },
    children: [icon("fa-plus")]
  }, scope);
  const shortRest = restButton(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.ShortRest", "Short Rest"), "fa-campground", "short", Boolean(actor.capabilities?.shortRest));
  const longRest = restButton(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.LongRest", "Long Rest"), "fa-moon", "long", Boolean(actor.capabilities?.longRest));
  const close = node("button", {
    className: "mc-hp-editor-close",
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CloseHitDiceAndRest", "Close hit dice and rest") },
    on: { click: () => { if (!pending) commands.closeRestEditor(); } },
    children: [icon("fa-xmark")]
  }, scope);
  const panel = node("section", {
    className: "mc-hp-editor mc-rest-editor",
    attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "mc-rest-editor-title" },
    children: [
      node("header", { children: [
        node("span", { className: "mc-hp-editor-heading-icon", children: [icon("fa-dice-d20")] }),
        node("div", { children: [node("small", { text: actor.name }), node("h2", { attrs: { id: "mc-rest-editor-title" }, text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Header.hitDice", "Hit Dice & Rest") })] }),
        close
      ] }),
      pools.length ? node("div", { className: "mc-rest-editor-pool", children: [
        node("label", { children: [node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.HitDieType2", "Hit Die Type") }), select] }),
        node("div", { className: "mc-rest-editor-adjust", children: [decrease, value, increase] }),
        node("small", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.UseOrToCorrectTheAvailableTotalManually", "Use − or + to correct the available total manually.") })
      ] }) : node("p", { className: "mc-rest-editor-empty", text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ThisCharacterHasNoHitDiePoolsAvailableTo", "This character has no hit-die pools available to edit.") }),
      node("div", { className: "mc-rest-editor-actions", children: [shortRest, longRest] }),
      modalStatus
    ]
  });
  refreshPool();
  return node("div", { className: "mc-hp-editor-layer", attrs: { role: "presentation" }, children: [panel] });

  function poolLabel(pool) {
    return `${pool.denomination} — ${pool.value} / ${pool.max}`;
  }

  function refreshPool() {
    const pool = pools.find(entry => entry.denomination === selected);
    value.textContent = pool ? `${pool.value} / ${pool.max}` : "—";
    for (const option of select.options ?? []) {
      const optionPool = pools.find(entry => entry.denomination === option.value);
      if (optionPool) option.textContent = poolLabel(optionPool);
    }
    select.disabled = pending || pools.length < 2;
    decrease.disabled = pending || !canAdjust || !pool || pool.value <= 0;
    increase.disabled = pending || !canAdjust || !pool || pool.value >= pool.max;
    shortRest.disabled = pending || !actor.capabilities?.shortRest;
    longRest.disabled = pending || !actor.capabilities?.longRest;
    close.disabled = pending;
  }

  async function adjust(direction) {
    const pool = pools.find(entry => entry.denomination === selected);
    if (pending || !pool) return;
    pending = true;
    modalStatus.classList.remove("is-error");
    modalStatus.textContent = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.UpdatingHitDice", "Updating hit dice…");
    refreshPool();
    try {
      const outcome = await commands.execute(ACTOR_COMMANDS.ADJUST_HIT_DICE, { actorSourceUuid: characterRecordSourceUuid(actor), denomination: selected, direction });
      const updated = outcome?.hitDice;
      if (updated && !scope.disposed) {
        pool.value = Math.max(0, Math.min(pool.max, Number(updated.value) || 0));
        modalStatus.textContent = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.HitDiceUpdated", "Hit dice updated.");
      }
    } catch (error) {
      if (!scope.disposed) {
        modalStatus.classList.add("is-error");
        modalStatus.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.FoundryCouldNotUpdateThoseHitDice", "Foundry could not update those hit dice.");
      }
    } finally {
      if (!scope.disposed) {
        pending = false;
        refreshPool();
      }
    }
  }

  function restButton(label, iconName, type, enabled) {
    return node("button", {
      attrs: { type: "button", disabled: !enabled },
      on: { click: async event => {
        if (pending) return;
        pending = true;
        modalStatus.classList.remove("is-error");
        modalStatus.textContent = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.OpeningOptions", "Opening {label} options…", { label: label.toLowerCase() });
        refreshPool();
        try {
          await commands.execute(ACTOR_COMMANDS.TAKE_REST, { actorSourceUuid: characterRecordSourceUuid(actor), type });
          if (!scope.disposed) commands.closeRestEditor();
        } catch (error) {
          if (!scope.disposed) {
            pending = false;
            modalStatus.classList.add("is-error");
            modalStatus.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.FoundryCouldNotStartTheWorkflow", "Foundry could not start the {label} workflow.", { label: label.toLowerCase() });
            refreshPool();
          }
        }
      } },
      children: [icon(iconName), node("span", { text: label })]
    }, scope);
  }
}

function characterHeaderVitals(actor, commands, status, scope) {
  const hitDice = actor.resources?.find((resource) => resource.kind === "hit-dice");
  const hitDiceAvailable = hitDice ? `${hitDice.value} / ${hitDice.max}` : "—";
  return node("div", { className: "mc-character-header-vitals", attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CharacterVitals", "Character vitals") }, children: [
    headerArmorClass(actor, commands, status, scope),
    headerSpeedVital(actor, commands, scope),
    headerInitiative(actor, commands, status, scope),
    headerRestVital(actor, hitDiceAvailable, commands, scope)
  ] });
}

function headerSpeedVital(actor, commands, scope) {
  const modes = actor.speed?.modes ?? [];
  const source = characterRecordSourceUuid(actor);
  const saved = SPEED_SELECTION_BY_ACTOR.get(source);
  const selected = modes.find((entry) => entry.key === saved)
    ?? modes.find((entry) => entry.key === "walk") ?? modes[0] ?? null;
  if (selected && saved && selected.key !== saved) SPEED_SELECTION_BY_ACTOR.set(source, selected.key);
  const label = headerLabel(actor, "speed", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Header.speed", "Speed"));
  const hoverLabel = commands.localize?.("DND5E.MOVEMENT.Hover", "Hover") ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Collective.Hover", "Hover");
  const movementLabel = entry => entry && entry.key !== "walk" ? `${label} · ${entry.label}` : label;
  const movementValue = entry => entry ? `${entry.value} ${actor.speed.units}` : "—";
  const value = movementValue(selected);
  if (modes.length < 2) return headerVital(movementLabel(selected), value, movementIcon(selected?.key), "is-speed");
  let open = false;
  const extension = node("div", { className: "mc-speed-extension", attrs: {
    hidden: true, "data-mc-back-dismissable": "true", "data-mc-back-kind": "speed-selector"
  } });
  const valueNode = node("strong", { text: value });
  const labelNode = node("small", { text: movementLabel(selected) });
  const symbol = movementIcon(selected.key);
  const button = node("button", {
    className: "mc-speed-trigger", attrs: { type: "button", "aria-haspopup": "true", "aria-expanded": "false",
      "aria-label": `${label}: ${selected.label}${selected.hover ? ` (${hoverLabel})` : ""}, ${selected.value} ${actor.speed.units}` },
    on: { click: () => setOpen(!open) },
    children: [labelNode, node("span", { className: "mc-header-vital-value", children: [symbol, valueNode] })]
  }, scope);
  const control = node("div", { className: "mc-character-header-vital is-speed is-interactive", children: [button, extension] });
  const draw = () => {
    const current = SPEED_SELECTION_BY_ACTOR.get(source) || selected.key;
    extension.replaceChildren(...modes.filter((entry) => entry.key !== current).map((entry) => {
      const itemLabel = `${entry.label}${entry.hover ? ` (${hoverLabel})` : ""}: ${entry.value} ${actor.speed.units}`;
      return node("button", { className: "mc-speed-option", attrs: { type: "button", "aria-label": itemLabel, title: itemLabel },
        on: { click: (event) => {
          event.stopPropagation();
          SPEED_SELECTION_BY_ACTOR.set(source, entry.key);
          labelNode.textContent = movementLabel(entry);
          valueNode.textContent = movementValue(entry);
          symbol.className = movementIconClass(entry.key);
          button.setAttribute("aria-label", `${label}: ${itemLabel}`);
          setOpen(false);
          draw();
        } }, children: [movementIcon(entry.key), node("span", { className: "mc-speed-option-name", text: `${entry.label}${entry.hover ? ` (${hoverLabel})` : ""}` }), node("strong", { text: `${entry.value} ${actor.speed.units}` })]
      }, scope);
    }));
  };
  const setOpen = (next) => {
    open = Boolean(next);
    control.classList.toggle("is-open", open);
    extension.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      const rect = control.getBoundingClientRect();
      const pane = control.closest(".mc-character-screen")?.getBoundingClientRect();
      const visual = globalThis.visualViewport;
      const placement = speedExtensionGeometry(rect, pane, visual, extension.getBoundingClientRect().width,
        globalThis.innerWidth ?? Infinity);
      extension.style.inlineSize = `${placement.width}px`;
      extension.style.insetInlineStart = `${placement.offset}px`;
      const visibleTop = Math.max(pane?.top ?? -Infinity, visual?.offsetTop ?? 0);
      const visibleBottom = Math.min(pane?.bottom ?? Infinity, (visual?.offsetTop ?? 0) + (visual?.height ?? globalThis.innerHeight ?? Infinity));
      const availableDown = visibleBottom - rect.bottom;
      const availableUp = rect.top - visibleTop;
      const up = extension.scrollHeight > availableDown && availableUp > availableDown;
      extension.classList.toggle("opens-up", up);
      extension.style.maxHeight = `${Math.max(40, Math.floor(up ? availableUp : availableDown))}px`;
    }
  };
  draw();
  scope.listen(document, "pointerdown", (event) => { if (open && !control.contains(event.target)) setOpen(false); }, { passive: true });
  scope.listen(extension, "mc-close", () => setOpen(false));
  return control;
}

export function speedExtensionGeometry(control, pane, viewport, preferredWidth, windowWidth = Infinity) {
  const visibleLeft = Math.max(pane?.left ?? 0, viewport?.offsetLeft ?? 0);
  const visibleRight = Math.min(pane?.right ?? windowWidth,
    (viewport?.offsetLeft ?? 0) + (viewport?.width ?? windowWidth));
  const width = Math.max(0, Math.min(preferredWidth, visibleRight - visibleLeft - 12));
  const left = Math.min(Math.max(control.left + control.width / 2 - width / 2, visibleLeft + 6), visibleRight - width - 6);
  return Object.freeze({ width, offset: left - control.left, left, right: left + width });
}

function movementIconClass(key) {
  return `fas fa-shoe-prints mc-movement-icon is-${String(key || "walk").replace(/[^a-z0-9-]/gu, "")}`;
}

function movementIcon(key) {
  return node("i", { className: movementIconClass(key), attrs: { "aria-hidden": "true" } });
}

function headerArmorClass(actor, commands, status, scope) {
  const enabled = Boolean(actor.capabilities?.configureArmorClass);
  const actionLabel = commands.localize?.("MIKELANDIA_CONTROLS.Character.ConfigureArmourClass", "Configure Armor Class") ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.ConfigureArmourClass", "Configure Armor Class");
  const unavailableLabel = commands.localize?.("MIKELANDIA_CONTROLS.Character.ArmourClassUnavailable", "Unavailable") ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.ArmourClassUnavailable", "Unavailable");
  return node("button", {
    className: "mc-character-header-vital is-armour",
    attrs: {
      type: "button", disabled: !enabled,
      "aria-label": `${headerLabel(actor, "armourClass", "Armor Class")} ${actor.ac ?? "—"}. ${enabled ? actionLabel : unavailableLabel}`
    },
    on: { click: async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      try { await commands.openArmorClass(characterRecordSourceUuid(actor)); }
      catch (error) { status.textContent = error?.message ?? (commands.localize?.("MIKELANDIA_CONTROLS.Character.ArmourClassFailed", "Armor Class configuration could not open.") ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.ArmourClassFailed", "Armor Class configuration could not open.")); }
      finally { if (!scope.disposed) button.disabled = false; }
    } },
    children: [node("small", { text: headerLabel(actor, "armourClass", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Header.armourClass", "Armor Class")) }), headerVitalValue(icon("fa-shield-halved", "sharp fa-solid"), actor.ac ?? "—")]
  }, scope);
}

function headerRestVital(actor, value, commands, scope) {
  const enabled = Boolean(actor.capabilities?.adjustHitDice || actor.capabilities?.shortRest || actor.capabilities?.longRest);
  return node("button", {
    className: "mc-character-header-vital is-hit-dice",
    attrs: { type: "button", disabled: !enabled, "aria-label": enabled ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.HitDiceOpenHitDiceAndRestControls", "Hit Dice {value}. Open hit dice and rest controls", { value: (value) }) : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.HitDice", "Hit Dice {value}", { value: (value) }) },
    on: { click: () => commands.openRestEditor() },
    children: [node("small", { text: headerLabel(actor, "hitDice", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Header.hitDice", "Hit Dice & Rest")) }), headerVitalValue(characterHitDieIcon(actor, scope), value)]
  }, scope);
}

function headerVital(label, value, symbol, className) {
  return node("span", { className: `mc-character-header-vital ${className}`, children: [node("small", { text: label }), headerVitalValue(symbol, value)] });
}

function headerVitalValue(symbol, value) {
  return node("span", { className: "mc-header-vital-value", children: [symbol, node("strong", { text: value })] });
}

export function characterHitDieIcon(actor, scope) {
  const requested = actor.classes?.[0]?.hitDie;
  const denomination = /^d(?:4|6|8|10|12|20)$/u.test(requested ?? "") ? requested : "d8";
  const fallback = "systems/dnd5e/icons/svg/dice/d8.svg";
  return node("img", {
    className: "mc-header-hit-die",
    attrs: { src: `systems/dnd5e/icons/svg/dice/${denomination}.svg`, alt: "", "aria-hidden": "true" },
    on: { error: (event) => {
      const image = event.currentTarget;
      if (image.getAttribute("src") !== fallback) image.setAttribute("src", fallback);
    } }
  }, scope);
}

function headerInitiative(actor, commands, status, scope) {
  const enabled = Boolean(actor.capabilities?.rollInitiative);
  return node("button", {
    className: "mc-character-header-vital is-initiative",
    attrs: { type: "button", disabled: !enabled, title: enabled ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.RollInitiative", "Roll initiative") : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.InitiativeRollUnavailable", "Initiative roll unavailable") },
    on: { click: (event) => runActorCommand(event.currentTarget, ACTOR_COMMANDS.ROLL_INITIATIVE, actor, {}, commands, status, localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.RollingInitiative", "Rolling initiative…"), localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Initiative", "Initiative")) },
    children: [node("small", { text: headerLabel(actor, "initiative", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Header.initiative", "Initiative")) }), headerVitalValue(icon("fa-bolt", "sharp fa-solid"), formatModifier(actor.initiative))]
  }, scope);
}

function renderSheetPanel(tab, actor, commands, status, openItem, expandedItemId, openSectionIds, scope, settings, spellcastingSelection) {
  if (tab === "effects") return effectsPanel(actor, commands, status, openSectionIds, scope, settings);
  if (tab === "abilities") return abilitiesFullPanel(actor, commands, status, scope);
  if (tab === "favourites") return favouritesPanel(actor, commands, status, openItem, expandedItemId, openSectionIds, scope, settings);
  if (tab === "inventory") return inventoryPanel(actor, commands, status, openItem, expandedItemId, openSectionIds, scope, settings);
  if (tab === "spells") return spellsPanel(actor, commands, status, openItem, expandedItemId, openSectionIds, scope, settings, spellcastingSelection);
  if (tab === "features") return featuresPanel(actor, commands, status, openItem, expandedItemId, openSectionIds, scope, settings);
  if (tab === "biography") return biographyPanel(actor, commands, status, scope);
  return overviewPanel(actor, commands, status, scope);
}

function favouritesPanel(actor, commands, status, openItem, expandedItemId, openSectionIds, scope, settings) {
  const sourceMode = settings.characterFavouritesSource === "tidy" ? "tidy" : settings.characterFavouritesSource === "both" ? "both" : "core";
  let sortMode = settings.characterCollections?.favouritesSort ?? "manual";
  let renderScope = null;
  const openSections = new Set(openSectionIds ?? []);
  const body = node("div", { className: "mc-sheet-collection-body mc-favourites-body" });
  const controls = collectionControls(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Favourites", "Favorites"), sortMode, () => {
    sortMode = sortMode === "alphabetical" ? "manual" : "alphabetical";
    persistCollectionPreference(commands, "favouritesSort", sortMode, status);
    draw();
  }, () => body.querySelectorAll("details.mc-sheet-collection-section"), (sectionIds, expanded) => {
    openSections.clear();
    for (const sectionId of sectionIds) openSections.add(sectionId);
    if (!expanded) commands.setExpandedCharacterItem("");
    commands.setCharacterSectionsExpanded(sectionIds);
  }, scope, { localize: commands.localize });
  const card = collectionCard(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Favourites", "Favorites"), sheetTabIcon("favourites"), [body], controls.element);
  card.classList.add("mc-favourites-card");
  card.dataset.sourceMode = sourceMode;

  const draw = () => {
    const openContainers = new Set(Array.from(body.querySelectorAll("details[data-container][open]")).map((entry) => entry.dataset.container));
    renderScope?.dispose();
    renderScope = scope.child("favourites-list");
    const sections = groupFavourites(actor.favourites ?? [], sortMode, actor.resources ?? [], commands.localize);
    if (commands.claimDefaultCharacterSection?.(sections.length ? `favourites:${sections[0].key}` : "")) openSections.add(`favourites:${sections[0].key}`);
    const inventoryGroups = groupInventory(actor.inventory ?? [], sortMode, commands.localize);
    body.replaceChildren(...(sections.length ? sections.map((section) => {
      const key = `favourites:${section.key}`;
      const heading = node("span", { className: "mc-favourite-section-heading", children: [icon(section.icon), node("span", { text: section.label }), section.resource ? favouriteSpellSlotIndicator(section.resource, commands.localize) : null] });
      return collectionSection(key, heading, section.items.length, section.items.map((item) => {
        const containerEntry = ["backpack", "container"].includes(item.type) ? findInventoryEntry(inventoryGroups, item.id) : null;
        return containerEntry
          ? inventoryNode(containerEntry, actor, commands, status, openItem, expandedItemId, renderScope, 0, openContainers)
          : favouriteRow(item, actor, commands, status, openItem, expandedItemId, sourceMode, renderScope);
      }), openSections.has(key) || section.items.some((item) => item.id === expandedItemId), (open) => {
        if (open) openSections.add(key);
        else openSections.delete(key);
        commands.setCharacterSectionExpanded(key, open);
      }, renderScope);
    }) : [node("div", { className: "mc-favourites-empty", children: [icon("fa-star", "regular"), node("strong", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NoFavouritesYet", "No favorites yet.") }), node("p", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.FavouriteItemsFromInventorySpellsOrFeaturesToKeep", "Favorite items from Inventory, Spells, or Features to keep them close at hand.") })] })]));
    controls.updateSort(sortMode);
    controls.updateExpansion();
  };
  scope.listen(body, "click", () => queueMicrotask(controls.updateExpansion));
  draw();
  return card;
}

function findInventoryEntry(groups, itemId) {
  const visit = (entry) => {
    if (entry.item?.id === itemId) return entry;
    for (const child of entry.children ?? []) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };
  for (const group of groups ?? []) {
    for (const entry of group.nodes ?? []) {
      const found = visit(entry);
      if (found) return found;
    }
  }
  return null;
}

function favouriteSpellSlotIndicator(resource, localize) {
  const value = Number(resource?.value);
  const maximum = Number(resource?.max);
  if (!Number.isInteger(value) || !Number.isInteger(maximum) || maximum <= 0) return null;
  return node("span", {
    className: "mc-favourite-slot-indicator",
    attrs: { "aria-label": localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.SpellSlotsRemaining", "{value} of {maximum} spell slots remaining", { value, maximum }), title: localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.SpellSlotsRemainingShort", "{value} / {maximum} spell slots remaining", { value, maximum }) },
    children: [capacityIndicator(value, maximum), node("small", { text: `${value}/${maximum}` })]
  });
}

function favouriteRow(item, actor, commands, status, openItem, expandedItemId, sourceMode, scope) {
  let detail;
  const metadata = favouriteItemMetadata(item, commands.localize);
  const copy = node("span", { className: "mc-sheet-item-copy", children: [node("strong", { text: characterItemDisplayName(item) })] });
  const immediate = node("span", {
    className: "mc-favourite-immediate",
    attrs: metadata.values.length
      ? { "aria-label": metadata.values.map((entry) => `${entry.label}: ${entry.value}`).join(", ") }
      : { "aria-hidden": "true" },
    children: metadata.columns.map((entry) => node("span", {
      className: `mc-favourite-metadata is-${entry.key}${entry.value ? "" : " is-empty"}`,
      attrs: entry.value ? { title: `${entry.label}: ${entry.value}` } : { "aria-hidden": "true" },
      text: entry.value
    }))
  });
  const middle = node("span", { className: "mc-sheet-item-middle mc-favourite-middle", children: [copy, immediate] });
  const overflow = node("button", {
    className: "mc-favourite-overflow",
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ActionsFor", "Actions for {name}", { name: (item.name) }), "aria-haspopup": "menu" },
    on: { click: (event) => {
      event.preventDefault();
      event.stopPropagation();
      showCharacterItemActionMenu(event.currentTarget, event, item, actor, commands, status, scope);
    } },
    children: [icon("fa-ellipsis-vertical")]
  }, scope);
  const summary = node("summary", {
    className: "mc-sheet-item-row mc-favourite-row",
    attrs: { "aria-expanded": String(expandedItemId === item.id), "aria-label": `${expandedItemId === item.id ? "Collapse" : "Expand"} ${item.name}` },
    on: { click: (event) => {
      event.preventDefault();
      const willOpen = !detail.open;
      for (const other of detail.closest(".mc-character-screen")?.querySelectorAll("details.mc-sheet-item-detail[open], details.mc-sheet-container[open]") ?? []) {
        if (other !== detail && !other.contains(detail)) {
          other.open = false;
          other.querySelector(":scope > summary")?.setAttribute("aria-expanded", "false");
        }
      }
      detail.open = willOpen;
      summary.setAttribute("aria-expanded", String(willOpen));
      summary.setAttribute("aria-label", `${willOpen ? "Collapse" : "Expand"} ${item.name}`);
      commands.setExpandedCharacterItem(willOpen ? item.id : "");
    } },
    children: [itemActionButton(item, actor, commands, status, scope), middle, overflow]
  }, scope);
  bindCharacterItemMenu(summary, item, actor, commands, status, scope);
  detail = node("details", {
    className: "mc-sheet-item-detail mc-favourite-detail",
    attrs: { open: expandedItemId === item.id },
    dataset: { itemId: item.id, favouriteSource: sourceMode },
    children: [summary, itemInlineSummary(item, actor, commands, status, openItem, scope)]
  });
  return detail;
}

function overviewPanel(actor, commands, status, scope) {
  return node("div", { className: "mc-sheet-stack", children: [
    activeEffectsPreview(actor, () => commands.selectCharacterTab("effects"), commands, scope),
    abilitiesSavesPreview(actor, () => commands.selectCharacterTab("abilities"), commands, status, scope),
    traitsPanel(actor, commands.localize)
  ] });
}

function skillsPanel(actor, commands, status, scope, compact = false) {
  return node("section", { className: "mc-sheet-card", children: [sectionHeading(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Skills", "Skills"), "fa-list-check"), node("div", { className: `mc-skill-list${compact ? " mc-skill-list-compact" : ""}`, children: (actor.skills ?? []).map((skill) => {
    const enabled = actor.capabilities?.rollSkill?.includes(skill.key);
    const proficiency = skillProficiencyLabel(skill.proficiency, commands.localize);
    return node("button", {
          className: `mc-skill-row is-${proficiency.key}`,
      attrs: { type: "button", disabled: !enabled, title: proficiency.label, "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Roll", "Roll {label} {modifier}; {proficiency}", { label: skill.label, modifier: formatModifier(skill.modifier), proficiency: proficiency.label }),  },
      on: { click: (event) => runActorCommand(event.currentTarget, ACTOR_COMMANDS.ROLL_SKILL, actor, { skill: skill.key }, commands, status, localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.RollingSkill", "Rolling {label}…", { label: skill.label }), skill.label) },
      children: [node("span", { className: "mc-proficiency-mark" }), compact ? node("span", { text: skill.label }) : node("span", { children: [node("strong", { text: skill.label }), node("small", { text: [skill.ability, skill.passive === null ? "" : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Passive", "Passive {passive}", { passive: (skill.passive) })].filter(Boolean).join(" · ") })] }), node("b", { text: formatModifier(skill.modifier) }), icon("fa-dice-d20")]
    }, scope);
  }) })] });
}

function compactAbilitiesPanel(actor, commands, status, scope) {
  return node("section", { className: "mc-sheet-card mc-abilities-saves-preview", children: [
    sectionHeading(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.AbilitiesAndSaves", "Abilities and saves"), "fa-dumbbell"),
    abilityScoresPreview(actor, commands, status, scope)
  ] });
}

function abilitiesFullPanel(actor, commands, status, scope) {
  return node("div", { className: "mc-sheet-stack", children: [
    node("button", { className: "mc-sheet-back", attrs: { type: "button" }, on: { click: () => commands.selectCharacterTab("overview") }, children: [icon("fa-chevron-left"), node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Overview", "Overview") })] }, scope),
    compactAbilitiesPanel(actor, commands, status, scope),
    skillsPanel(actor, commands, status, scope, true)
  ] });
}

function traitsPanel(actor, localize = null) {
  const traits = actor.traits ?? [];
  if (!traits.length) return null;
  return node("section", { className: "mc-sheet-card mc-traits-preview", children: [
    sectionHeading(localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Traits", "Traits"), "fa-flag"),
    node("div", { className: "mc-traits-list", children: traits.map((trait) => node("article", { className: "mc-trait-group", children: [
      node("h4", { children: [icon(trait.icon), node("span", { text: trait.label })] }),
      node("div", { className: "mc-trait-pills", children: trait.entries.map((entry) => node("span", { text: entry.value ? `${entry.label} · ${entry.value}` : entry.label })) })
    ] })) })
  ] });
}

function inventoryPanel(actor, commands, status, openItem, expandedItemId, openSectionIds, scope, settings) {
  let sortMode = settings.characterCollections?.inventorySort ?? "manual";
  let renderScope = null;
  const openSections = new Set(openSectionIds ?? []);
  const body = node("div", { className: "mc-sheet-collection-body" });
  const controls = collectionControls(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Inventory", "Inventory"), sortMode, () => {
    sortMode = sortMode === "alphabetical" ? "manual" : "alphabetical";
    persistCollectionPreference(commands, "inventorySort", sortMode, status);
    draw();
  }, () => body.querySelectorAll("details.mc-sheet-collection-section, details.mc-sheet-container"), (sectionIds, expanded) => {
    openSections.clear();
    for (const sectionId of sectionIds) openSections.add(sectionId);
    if (!expanded) commands.setExpandedCharacterItem("");
    commands.setCharacterSectionsExpanded(sectionIds);
  }, scope, { localize: commands.localize });
  const card = collectionCard(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Inventory", "Inventory"), sheetTabIcon("inventory"), [
    currencyStrip(actor, commands, status, scope),
    encumbranceMeter(actor.encumbrance, commands.readLocale?.() ?? "en", commands.localize),
    body
  ], controls.element);

  const draw = () => {
    const openContainers = new Set(Array.from(body.querySelectorAll("details[data-container][open]")).map((entry) => entry.dataset.container));
    renderScope?.dispose();
    renderScope = scope.child("inventory-list");
    const groups = groupInventory(actor.inventory, sortMode, commands.localize);
    if (commands.claimDefaultCharacterSection?.(groups[0]?.key)) openSections.add(groups[0].key);
    body.replaceChildren(...(groups.length
      ? groups.map((group) => collectionSection(group.key, group.label, group.nodes.length, group.nodes.map((entry) => inventoryNode(entry, actor, commands, status, openItem, expandedItemId, renderScope, 0, openContainers)), openSections.has(group.key) || group.nodes.some((entry) => inventoryEntryContains(entry, expandedItemId)), (open) => {
        if (open) openSections.add(group.key);
        else openSections.delete(group.key);
        commands.setCharacterSectionExpanded(group.key, open);
      }, renderScope))
      : [emptyCollection(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NoInventoryItemsAreVisible", "No inventory items are visible."))]));
    controls.updateSort(sortMode);
    controls.updateExpansion();
  };
  scope.listen(body, "click", () => queueMicrotask(controls.updateExpansion));
  draw();
  return card;
}

function inventoryNode(entry, actor, commands, status, openItem, expandedItemId, scope, depth = 0, openContainers = new Set()) {
  const item = entry.item;
  if (!["backpack", "container"].includes(item.type)) return itemRow(item, actor, commands, status, openItem, expandedItemId, scope, depth);
  const locale = commands.readLocale?.() ?? "en";
  const contents = countInventoryContents(entry);
  const capacity = item.containerCapacity;
  const capacityText = capacity ? `${formatCapacity(capacity.value, locale)} / ${capacity.max === null ? "∞" : formatCapacity(capacity.max, locale)}${capacity.units ? ` ${capacity.units}` : ""}` : "";
  const initiallyOpen = openContainers.has(item.id) || inventoryEntryContains(entry, expandedItemId);
  const toggleIcon = icon("fa-chevron-down");
  let container;
  const setContainerOpen = (open) => {
    if (open) {
      for (const other of container.closest(".mc-character-screen")?.querySelectorAll("details.mc-sheet-item-detail[open], details.mc-sheet-container[open]") ?? []) {
        if (other !== container && !other.contains(container)) other.open = false;
      }
    }
    container.open = open;
    commands.setExpandedCharacterItem(open ? item.id : "");
  };
  const toggle = node("button", {
    className: "mc-sheet-container-toggle",
    attrs: { type: "button", "aria-label": `${initiallyOpen ? "Collapse" : "Expand"} ${item.name}`, "aria-expanded": initiallyOpen },
    on: { click: (event) => {
      event.preventDefault();
      event.stopPropagation();
      setContainerOpen(!container.open);
    } },
    children: [toggleIcon]
  }, scope);
  container = node("details", {
    className: "mc-sheet-container",
    attrs: { open: initiallyOpen },
    dataset: { container: item.id },
    children: [
      node("summary", {
        on: { click: (event) => {
          event.preventDefault();
          setContainerOpen(!container.open);
        } },
        children: [itemActionButton(item, actor, commands, status, scope), itemMiddle(item, actor, commands, status, scope, contents ? localizedCount(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.ItemCount", { one: "{count} item", other: "{count} items" }, contents, commands.readLocale?.() ?? "en") : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Emptycontainer", "Empty container")), capacityText ? node("b", { text: capacityText }) : null, toggle]
      }, scope),
      node("div", { className: "mc-sheet-container-contents", children: entry.children.map((child) => inventoryNode(child, actor, commands, status, openItem, expandedItemId, scope, depth + 1, openContainers)) })
    ]
  });
  bindCharacterItemMenu(container.querySelector(":scope > summary"), item, actor, commands, status, scope);
  scope.listen(container, "toggle", () => {
    toggle.setAttribute("aria-expanded", String(container.open));
    toggle.setAttribute("aria-label", `${container.open ? "Collapse" : "Expand"} ${item.name}`);
  });
  return container;
}

function spellsPanel(actor, commands, status, openItem, expandedItemId, openSectionIds, scope, settings, selection) {
  const preferences = settings.characterCollections ?? {};
  let sortMode = preferences.spellSort ?? "manual";
  let filterMode = preferences.spellFilter ?? "all";
  let renderScope = null;
  const openSections = new Set(openSectionIds ?? []);
  const body = node("div", { className: "mc-sheet-collection-body" });
  const controls = collectionControls(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Spells", "Spells"), sortMode, () => {
    sortMode = sortMode === "alphabetical" ? "manual" : "alphabetical";
    persistCollectionPreference(commands, "spellSort", sortMode, status);
    draw();
  }, () => body.querySelectorAll("details.mc-sheet-collection-section"), (sectionIds, expanded) => {
    openSections.clear();
    for (const sectionId of sectionIds) openSections.add(sectionId);
    if (!expanded) commands.setExpandedCharacterItem("");
    commands.setCharacterSectionsExpanded(sectionIds);
  }, scope, { localize: commands.localize });
  const filterButton = collectionFilterButton(filterMode, () => {
    filterMode = filterMode === "prepared" ? "all" : "prepared";
    persistCollectionPreference(commands, "spellFilter", filterMode, status);
    draw();
  }, scope, commands.localize);
  controls.element.prepend(filterButton.element);
  const card = collectionCard(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Spells", "Spells"), sheetTabIcon("spells"), [body], controls.element);

  const draw = () => {
    renderScope?.dispose();
    renderScope = scope.child("spell-list");
    const visibleSpells = filterSpellsByAvailability(actor.spells, filterMode === "prepared");
    const sections = groupSpells(visibleSpells, sortMode, commands.localize);
    if (commands.claimDefaultCharacterSection?.(sections[0]?.key)) openSections.add(sections[0].key);
    const hasSpellcasting = actor.spellcasting?.attackBonus != null || actor.spellcasting?.saveDC != null
      || groupSpells(actor.spells, sortMode, commands.localize).some((section) => section.group === "spellcasting");
    let priorGroup = "";
    const children = [];
    const castingHeading = () => spellGroupDivider(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Spellcasting", "Spellcasting"), actor.spellcasting, commands.localize, selection, renderScope);
    if (hasSpellcasting && !sections.some((section) => section.group === "spellcasting")) children.push(castingHeading());
    for (const section of sections) {
        if (section.group !== priorGroup) {
          children.push(section.group === "spellcasting" ? castingHeading() : spellGroupDivider(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Collections.Spells.Other", "Other Spells")));
          priorGroup = section.group;
        }
        const slots = section.level > 0 ? actor.resources?.find((resource) => resource.id === `spell-slot:spell${section.level}`) : null;
        const heading = slots ? node("span", { className: "mc-sheet-collection-heading", children: [
          node("span", { text: section.label }),
          spellSlotTrigger(slots, actor, commands, renderScope)
        ] }) : section.label;
        children.push(collectionSection(section.key, heading, section.spells.length, section.spells.map((spell) => itemRow(spell, actor, commands, status, openItem, expandedItemId, renderScope, 0, isSpellUnprepared(spell))), openSections.has(section.key) || section.spells.some((spell) => spell.id === expandedItemId), (open) => {
          if (open) openSections.add(section.key);
          else openSections.delete(section.key);
          commands.setCharacterSectionExpanded(section.key, open);
        }, renderScope));
    }
    if (!sections.length) children.push(emptyCollection(filterMode === "prepared" ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NoPreparedOrAlwaysAvailableSpellsAreVisible", "No prepared or always-available spells are visible.") : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NoSpellsAreVisible", "No spells are visible.")));
    body.replaceChildren(...children);
    controls.updateSort(sortMode);
    filterButton.update(filterMode);
    controls.updateExpansion();
  };
  scope.listen(body, "click", () => queueMicrotask(controls.updateExpansion));
  draw();
  return card;
}

function featuresPanel(actor, commands, status, openItem, expandedItemId, openSectionIds, scope, settings) {
  let sortMode = settings.characterCollections?.featureSort ?? "manual";
  let renderScope = null;
  const openSections = new Set(openSectionIds ?? []);
  const body = node("div", { className: "mc-sheet-collection-body" });
  const controls = collectionControls(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Features", "Features"), sortMode, () => {
    sortMode = sortMode === "alphabetical" ? "manual" : "alphabetical";
    persistCollectionPreference(commands, "featureSort", sortMode, status);
    draw();
  }, () => body.querySelectorAll("details.mc-sheet-collection-section"), (sectionIds, expanded) => {
    openSections.clear();
    for (const sectionId of sectionIds) openSections.add(sectionId);
    if (!expanded) commands.setExpandedCharacterItem("");
    commands.setCharacterSectionsExpanded(sectionIds);
  }, scope, { localize: commands.localize });
  const resourceStrip = actor.type === "npc" ? npcResourceStrip(actor, commands) : null;
  const card = collectionCard(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Features", "Features"), sheetTabIcon("features"), [resourceStrip, body].filter(Boolean), controls.element);

  const draw = () => {
    renderScope?.dispose();
    renderScope = scope.child("features-list");
    const sections = actor.type === "npc" ? groupNpcFeatures(actor.features, sortMode, commands.localize) : groupFeatures(actor.features, sortMode, commands.localize);
    if (commands.claimDefaultCharacterSection?.(sections[0]?.key)) openSections.add(sections[0].key);
    body.replaceChildren(...(sections.length
      ? sections.map((section) => collectionSection(section.key, section.label, section.features.length, section.features.map((feature) => itemRow(feature, actor, commands, status, openItem, expandedItemId, renderScope)), openSections.has(section.key) || section.features.some((feature) => feature.id === expandedItemId), (open) => {
        if (open) openSections.add(section.key);
        else openSections.delete(section.key);
        commands.setCharacterSectionExpanded(section.key, open);
      }, renderScope))
      : [emptyCollection(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NoFeaturesAreVisible", "No features are visible."))]));
    controls.updateSort(sortMode);
    controls.updateExpansion();
  };
  scope.listen(body, "click", () => queueMicrotask(controls.updateExpansion));
  draw();
  return card;
}

function npcResourceStrip(actor, commands) {
  const legendary = actor.npcResources?.legendary;
  const lair = actor.npcResources?.lair;
  if (!legendary && !lair) return null;
  const localize = (key, fallback, data) => commands.localize?.(key, fallback, data) ?? fallback;
  return node("div", { className: "mc-npc-resource-strip", children: [
    legendary ? node("div", {
      className: "mc-npc-resource-block",
      attrs: { "aria-label": localize("MIKELANDIA_CONTROLS.Character.LegendaryRemaining", `${legendary.remaining} of ${legendary.max} Legendary Actions remaining`, { remaining: legendary.remaining, max: legendary.max }) },
      children: [node("small", { text: localize("DND5E.LegendaryAction.LabelPl", "Legendary Actions") }),
        node("span", { className: "mc-npc-resource-pips", attrs: { "aria-hidden": "true" }, children: Array.from({ length: legendary.max }, (_, index) => node("i", { className: index < legendary.remaining ? "is-available" : "is-spent" })) })]
    }) : null,
    lair ? node("div", { className: "mc-npc-resource-block mc-npc-lair", children: [
      node("small", { text: localize("DND5E.LAIR.Action.Label", "Lair Action") }),
      node("strong", { text: lair.initiative ?? "—" })
    ] }) : null
  ] });
}

function biographyPanel(actor, commands, status, scope, notes = false, editorScope = scope) {
  const storyLabel = notes ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Notes", "Notes") : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Biography", "Biography");
  const biography = actor.biography ?? {};
  const sourceUuid = characterRecordSourceUuid(actor);
  const canEdit = Boolean(actor.capabilities?.editBiography);
  let storyEditor = null;
  const storyEdit = biographyEditAction(storyLabel, false, (anchor) => {
    if (!storyEditor) return;
    openBiographyEditor(anchor, {
      actor,
      section: notes ? "notes" : "biography",
      label: storyLabel,
      iconName: "fa-feather-pointed",
      value: storyEditor.editorText,
      originalValue: storyEditor.originalSource,
      biographyField: storyEditor.editField,
      richText: true
    }, commands, status, editorScope);
  }, scope, commands.localize);
  const description = node("div", {
    className: "mc-character-biography-prose is-loading",
    attrs: { "aria-busy": "true", "data-actor-source-uuid": sourceUuid },
    children: [node("p", { className: "mc-sheet-empty", text: localizedText(commands.localize, notes ? "MIKELANDIA_CONTROLS.Character.Presenter.LoadingNotes" : "MIKELANDIA_CONTROLS.Character.Presenter.LoadingBiography", notes ? "Loading notes..." : "Loading biography…") })]
  });
  scope.listen(description, "click", (event) => {
    const roll = event.target.closest?.("a.inline-roll:not(.inline-result)");
    if (!roll || !description.contains(roll)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (roll.getAttribute("aria-disabled") === "true") {
      status.classList.add("is-error");
      status.textContent = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.InlineRollsRequireCurrentOWNERPermissionForThisExact", "Inline rolls require current OWNER permission for this exact actor.");
      return;
    }
    void commands.rollCharacterBiographyInline({
      actorSourceUuid: sourceUuid,
      formula: roll.dataset.formula,
      mode: roll.dataset.mode,
      flavor: roll.dataset.flavor
    }).catch((error) => {
      if (scope.disposed) return;
      status.classList.add("is-error");
      status.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.FoundryCouldNotCompleteThatInlineRoll", "Foundry could not complete that inline roll.");
    });
  }, { capture: true });
  void commands.readCharacterBiography(sourceUuid).then((result) => {
    if (scope.disposed || result?.actorSourceUuid !== sourceUuid || description.dataset.actorSourceUuid !== sourceUuid) return;
    description.classList.remove("is-loading");
    description.removeAttribute("aria-busy");
    if (result.html) description.innerHTML = result.html;
    else description.replaceChildren(node("p", { className: "mc-sheet-empty", text: localizedText(commands.localize, notes ? "MIKELANDIA_CONTROLS.Character.Copy.NoNotesRecorded" : "MIKELANDIA_CONTROLS.Character.Copy.Nobiographyhasbeenrecorded", notes ? "No notes have been recorded." : "No biography has been recorded.") }));
    storyEditor = result.editable && result.editField ? result : null;
    storyEdit.disabled = !(canEdit && storyEditor);
    storyEdit.setAttribute("aria-disabled", String(storyEdit.disabled));
    storyEdit.title = storyEdit.disabled ? `${storyLabel} is read-only` : `Edit ${storyLabel}`;
    if (!result.inlineRollsInteractive) {
      for (const roll of description.querySelectorAll("a.inline-roll:not(.inline-result)")) {
        roll.classList.add("is-disabled");
        roll.setAttribute("aria-disabled", "true");
        roll.setAttribute("title", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.InlineRollUnavailable", "Inline roll unavailable without OWNER permission"));
      }
    }
  }).catch((error) => {
    if (scope.disposed || description.dataset.actorSourceUuid !== sourceUuid) return;
    description.classList.remove("is-loading");
    description.removeAttribute("aria-busy");
    description.replaceChildren(node("p", { className: "mc-sheet-empty", text: error?.message ?? (notes ? "Notes could not be loaded." : "Biography could not be loaded.") }));
  });
  if (notes || ["npc", "group", "vehicle"].includes(actor.type)) {
    return node("div", { className: "mc-sheet-stack mc-character-biography", children: [
      node("section", { className: "mc-sheet-card mc-character-biography-story", children: [sectionHeading(storyLabel, "fa-feather-pointed", storyEdit), description] }),
      ...(notes ? renderNotesFields(actor, commands, status, scope, editorScope) : [])
    ] });
  }
  const textBlocks = [
    ["ideal", "MIKELANDIA_CONTROLS.Character.Presenter.BiographyIdeals", "Ideals", "fa-seedling", biography.ideal],
    ["bond", "MIKELANDIA_CONTROLS.Character.Presenter.BiographyBonds", "Bonds", "fa-link", biography.bond],
    ["flaw", "MIKELANDIA_CONTROLS.Character.Presenter.BiographyFlaws", "Flaws", "fa-heart-crack", biography.flaw],
    ["trait", "MIKELANDIA_CONTROLS.Character.Presenter.BiographyPersonalityTraits", "Personality traits", "fa-puzzle-piece", biography.trait],
    ["appearance", "MIKELANDIA_CONTROLS.Character.Presenter.BiographyAppearance", "Appearance", "fa-image-portrait", biography.appearance]
  ];
  const characteristics = biography.characteristics ?? [];
  const characteristicValues = Object.fromEntries(characteristics.map((entry) => [entry.key, entry.value ?? ""]));
  const characteristicsLabel = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Characteristics", "Characteristics");
  const characteristicsEdit = biographyEditAction(characteristicsLabel, canEdit, (anchor) => openBiographyEditor(anchor, {
    actor,
    section: "characteristics",
    label: characteristicsLabel,
    iconName: "fa-address-card",
    fields: characteristics,
    values: characteristicValues,
    originalValues: characteristicValues
  }, commands, status, scope), scope, commands.localize);
  return node("div", { className: "mc-sheet-stack mc-character-biography", children: [
    node("section", { className: "mc-sheet-card", children: [
      sectionHeading(characteristicsLabel, "fa-address-card", characteristicsEdit),
      node("dl", { className: "mc-character-biography-characteristics", children: characteristics.flatMap((entry) => [
        node("div", { children: [node("dt", { text: entry.label }), node("dd", { text: entry.value || "—" })] })
      ]) })
    ] }),
    node("div", { className: "mc-character-biography-blocks", children: textBlocks.map(([section, key, fallback, iconName, value]) => {
      const label = localizedText(commands.localize, key, fallback);
      return node("section", {
      className: `mc-sheet-card mc-character-biography-block${section === "appearance" ? " is-appearance" : ""}`,
      children: [sectionHeading(label, iconName, biographyEditAction(label, canEdit, (anchor) => openBiographyEditor(anchor, {
        actor,
        section,
        label,
        iconName,
        value: value ?? "",
        originalValue: value ?? ""
      }, commands, status, scope), scope, commands.localize)), node("p", { text: value || localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NotRecorded", "Not recorded.") })]
    }); }) }),
    node("section", { className: "mc-sheet-card mc-character-biography-story", children: [sectionHeading(storyLabel, "fa-feather-pointed", storyEdit), description] })
  ] });
}

function renderNotesFields(actor, commands, status, scope, editorScope) {
  const groups = new Map();
  for (const field of actor.notesFields ?? []) {
    if (!groups.has(field.group)) groups.set(field.group, []);
    groups.get(field.group).push(field);
  }
  return [...groups.values()].map(fields => node("section", { className: "mc-sheet-card mc-character-notes-fields", children: [
    ...(fields.length > 1 ? [sectionHeading(localizedText(commands.localize, fields[0].groupLabelKey, fields[0].groupLabelKey), "fa-bullseye")] : []),
    ...fields.map(field => {
      const label = localizedText(commands.localize, field.labelKey, field.labelKey);
      const editorLabel = fields.length > 1 ? `${localizedText(commands.localize, field.groupLabelKey, field.groupLabelKey)}: ${label}` : label;
      const edit = biographyEditAction(editorLabel, Boolean(actor.capabilities?.editBiography), anchor => openBiographyEditor(anchor, {
        actor, section: "notes", label: editorLabel, iconName: "fa-bullseye", richText: false,
        value: field.value, originalValue: field.value, biographyField: field.id, notesContextRevision: field.revision
      }, commands, status, editorScope), scope, commands.localize);
      return node("div", { dataset: { notesField: field.id }, children: [sectionHeading(label, "fa-bullseye", edit),
        node("p", { text: field.value || localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NotRecorded", "Not recorded.") })] });
    })
  ] }));
}

function biographyEditAction(label, enabled, onEdit, scope, localize) {
  return node("button", {
    className: "mc-biography-edit",
    attrs: { type: "button", disabled: !enabled, "aria-label": localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.Edit", "Edit {label}", { label }), title: localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.Edit", "Edit {label}", { label }) },
    on: { click: (event) => onEdit(event.currentTarget) },
    children: [icon("fa-pen-to-square")]
  }, scope);
}

function openBiographyEditor(anchor, config, commands, pageStatus, scope) {
  const screen = anchor.closest(".mc-character-screen");
  const host = screen?.__mcCharacterOverlayHost ?? screen ?? anchor.ownerDocument?.body;
  if (!host) return;
  host.querySelector?.(".mc-biography-editor-layer")?.dispatchEvent(new Event("mc-close"));
  const editorScope = scope.child(`biography-editor:${config.section}`);
  const editorStatus = node("p", { className: "mc-biography-editor-status", attrs: { role: "status", "aria-live": "polite" } });
  let pending = false;
  let layer;
  let close = () => {};
  const controls = [];
  const fields = config.section === "characteristics"
    ? (config.fields ?? []).map((entry) => {
      const input = node("input", { attrs: { type: "text", maxlength: "200", autocomplete: "off", "data-biography-field": entry.key, value: config.values?.[entry.key] ?? "" } }, editorScope);
      controls.push(input);
      return node("label", { children: [node("span", { text: entry.label }), input] });
    })
    : [];
  const composer = config.section === "characteristics" ? null : node("textarea", {
    attrs: {
      maxlength: config.richText ? "100000" : "20000",
      rows: config.richText ? "12" : "8",
      spellcheck: "true",
      "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Text", "{label} text", { label: (config.label) })
    }
  }, editorScope);
  if (composer) {
    composer.value = String(config.value ?? "");
    controls.push(composer);
  }
  const cancel = node("button", {
    className: "mc-modal-button is-secondary",
    attrs: { type: "button" },
    on: { click: () => { if (!pending) close(); } },
    children: [icon("fa-xmark"), node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Action.Cancel", "Cancel") })]
  }, editorScope);
  const save = node("button", {
    className: "mc-modal-button is-primary",
    attrs: { type: "submit" },
    children: [icon("fa-check"), node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Save", "Save") })]
  });
  controls.push(cancel, save);
  const form = node("form", {
    className: "mc-biography-editor",
    attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "mc-biography-editor-title" },
    on: { submit: async (event) => {
      event.preventDefault();
      if (pending || !form.reportValidity()) return;
      pending = true;
      form.classList.add("is-pending");
      form.setAttribute("aria-busy", "true");
      for (const control of controls) control.disabled = true;
      editorStatus.classList.remove("is-error");
      editorStatus.textContent = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Saving", "Saving…");
      const payload = config.section === "characteristics"
        ? {
            actorSourceUuid: characterRecordSourceUuid(config.actor),
            section: config.section,
            values: Object.fromEntries(fields.map((label) => {
              const input = label.querySelector("input");
              return [input.dataset.biographyField, input.value];
            })),
            originalValues: config.originalValues
          }
        : {
            actorSourceUuid: characterRecordSourceUuid(config.actor),
            section: config.section,
            value: composer.value,
            originalValue: config.originalValue,
            biographyField: config.biographyField,
            ...(config.notesContextRevision !== undefined ? { notesContextRevision: config.notesContextRevision } : {})
          };
      try {
        await commands.execute(ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION, payload);
        if (editorScope.disposed) return;
        pageStatus.classList.remove("is-error");
        pageStatus.classList.add("is-success");
        pageStatus.textContent = "";
        close();
      } catch (error) {
        if (editorScope.disposed) return;
        pending = false;
        form.classList.remove("is-pending");
        form.removeAttribute("aria-busy");
        for (const control of controls) control.disabled = false;
        editorStatus.classList.add("is-error");
        editorStatus.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CouldNotBeSaved", "{label} could not be saved.", { label: (config.label) });
      }
    } },
    children: [
      node("header", { children: [
        node("span", { className: "mc-hp-editor-heading-icon", children: [icon(config.iconName)] }),
        node("div", { children: [node("small", { text: config.actor.name }), node("h2", { attrs: { id: "mc-biography-editor-title" }, text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Edit", "Edit {label}", { label: (config.label) }) })] }),
        node("button", { className: "mc-hp-editor-close", attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CloseEditor", "Close {label} editor", { label: (config.label) }) }, on: { click: () => { if (!pending) close(); } }, children: [icon("fa-xmark")] }, editorScope)
      ] }),
      config.section === "characteristics"
        ? node("div", { className: "mc-biography-editor-fields", children: fields })
        : node("label", { className: "mc-biography-editor-composer", children: [node("span", { text: config.richText ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.TextAndFoundryRichHTML", "Text and Foundry-rich HTML") : config.label }), composer] }),
      editorStatus,
      node("div", { className: "mc-modal-actions", children: [cancel, save] })
    ]
  }, editorScope);
  layer = node("div", { className: `mc-biography-editor-layer${host === screen ? "" : " is-pane-scoped"}`, attrs: { role: "presentation" }, children: [form] });
  close = () => {
    if (editorScope.disposed) return;
    layer.remove();
    editorScope.dispose();
  };
  editorScope.listen(layer, "mc-close", close);
  editorScope.listen(layer, "pointerdown", (event) => { if (event.target === layer && !pending) close(); });
  editorScope.listen(anchor.ownerDocument ?? document, "keydown", (event) => { if (event.key === "Escape" && !pending) close(); });
  editorScope.own(() => layer.remove());
  host.append(layer);
  queueMicrotask(() => (fields[0]?.querySelector("input") ?? composer)?.focus?.({ preventScroll: true }));
}

function effectsPanel(actor, commands, status, openSectionIds, scope, settings) {
  const definitions = [
    ["temporary", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.TemporaryEffects", "Temporary Effects"), (effect) => !effect.isCondition && effect.isTemporary && !effect.disabled && !effect.isSuppressed],
    ["passive", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.PassiveEffects", "Passive Effects"), (effect) => !effect.isCondition && !effect.isTemporary && !effect.disabled && !effect.isSuppressed],
    ["inactive", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.InactiveEffects", "Inactive Effects"), (effect) => !effect.isCondition && effect.disabled && !effect.isSuppressed],
    ["unavailable", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.UnavailableEffects", "Unavailable Effects"), (effect) => !effect.isCondition && effect.isSuppressed]
  ];
  const emptyMessages = { temporary: "No temporary effects.", passive: "No passive effects.", inactive: "No inactive effects.", unavailable: "No unavailable effects." };
  let sortMode = settings.characterCollections?.effectsSort ?? "manual";
  let renderScope = null;
  const openSections = new Set(openSectionIds ?? []);
  const body = node("div", { className: "mc-sheet-collection-body mc-effects-body" });
  const controls = collectionControls(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Effects", "Effects"), sortMode, () => {
    sortMode = sortMode === "alphabetical" ? "manual" : "alphabetical";
    persistCollectionPreference(commands, "effectsSort", sortMode, status);
    draw();
  }, () => body.querySelectorAll("details.mc-sheet-collection-section"), (sectionIds) => {
    openSections.clear();
    for (const sectionId of sectionIds) openSections.add(sectionId);
    commands.setCharacterSectionsExpanded(sectionIds);
  }, scope, { localize: commands.localize });
  const card = collectionCard(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Collective.EffectsConditions", "Effects & conditions"), "fa-sparkles", [body], controls.element);
  scope.own(() => { void commands.closeActiveEffectContextMenu?.(); });
  scope.own(() => renderScope?.dispose());

  const draw = () => {
    renderScope?.dispose();
    renderScope = scope.child("effects-list");
    const sections = definitions.map(([key, label, matches]) => {
      const effects = (actor.effects ?? []).filter(matches);
      if (sortMode === "alphabetical") effects.sort((left, right) => left.name.localeCompare(right.name));
      return { key, label, effects };
    });
    const first = sections.find(section => section.effects.length)?.key ?? "conditions";
    if (commands.claimDefaultCharacterSection?.(first)) openSections.add(first);
    body.replaceChildren(
      ...sections.map((section) => collectionSection(section.key, section.label, section.effects.length, section.effects.length ? section.effects.map((effect) => effectRow(effect, actor, commands, renderScope)) : [emptyCollection(localizedText(commands.localize, `MIKELANDIA_CONTROLS.Character.EffectsEmpty.${section.key}`, emptyMessages[section.key]))], openSections.has(section.key), (open) => {
        if (open) openSections.add(section.key);
        else openSections.delete(section.key);
        commands.setCharacterSectionExpanded(section.key, open);
      }, renderScope)),
      conditionsSection(actor, commands, status, openSections, renderScope)
    );
    controls.updateSort(sortMode);
    controls.updateExpansion();
  };
  scope.listen(body, "click", () => queueMicrotask(controls.updateExpansion));
  draw();
  return node("div", { className: "mc-sheet-stack", children: [
    node("button", { className: "mc-sheet-back", attrs: { type: "button" }, on: { click: () => commands.selectCharacterTab("overview") }, children: [icon("fa-chevron-left"), node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Overview", "Overview") })] }, scope),
    card
  ] });
}

function conditionsSection(actor, commands, status, openSections, scope) {
  const conditions = actor.conditions ?? [];
  const activeCount = conditions.filter((condition) => condition.active).length;
  const label = node("span", { className: "mc-condition-section-label", children: [icon("fa-heart-pulse"), node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Conditions", "Conditions") }), node("small", { className: "mc-condition-count", text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Active", "{activeCount} Active", { activeCount: (activeCount) }) })] });
  const details = collectionSection("conditions", label, conditions.length, [conditions.length ? node("div", { className: "mc-condition-grid", children: conditions.map((condition) => conditionControl(condition, actor, commands, status, scope)) }) : emptyCollection(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NoNativeDDEConditionsAreAvailable", "No native D&D5e conditions are available."))], openSections.has("conditions"), (open) => {
    if (open) openSections.add("conditions");
    else openSections.delete("conditions");
    commands.setCharacterSectionExpanded("conditions", open);
  }, scope);
  details.classList.add("mc-conditions-panel");
  details.setAttribute("aria-label", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Conditions", "Conditions"));
  return details;
}

function conditionControl(condition, actor, commands, status, scope) {
  if (condition.id === "exhaustion" && condition.maximumLevel) return exhaustionControl(condition, actor, commands, status, scope);
  const editable = Boolean(actor.capabilities?.toggleConditions);
  const label = condition.active && condition.level ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Level", "{label} · Level {level}", { label: (condition.label), level: (condition.level) }) : condition.label;
  return node("button", {
    className: `mc-condition-control${condition.active ? " is-active" : ""}`,
    attrs: {
      type: "button",
      disabled: !editable,
      "aria-pressed": String(Boolean(condition.active)),
      "aria-label": `${condition.active ? "Remove" : "Apply"} ${label}`,
      title: condition.maximumLevel ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.LevelledConditionLevels", "{label}; leveled condition ({maximumLevel} levels)", { label: (label), maximumLevel: (condition.maximumLevel) }) : label
    },
    on: { click: (event) => runActorCommand(event.currentTarget, ACTOR_COMMANDS.TOGGLE_CONDITION, actor, { conditionId: condition.id, active: !condition.active }, commands, status, localizedText(commands.localize, condition.active ? "MIKELANDIA_CONTROLS.Character.Presenter.RemovingCondition" : "MIKELANDIA_CONTROLS.Character.Presenter.ApplyingCondition", condition.active ? "Removing {label}…" : "Applying {label}…", { label: condition.label }), "") },
    children: [
      node("span", { className: "mc-condition-art", children: condition.img ? [node("img", { attrs: { src: condition.img, alt: "", draggable: "false" } })] : [icon("fa-circle-exclamation")] }),
      node("span", { className: "mc-condition-label", text: label }),
      node("span", { className: "mc-condition-switch", attrs: { "aria-hidden": "true" }, children: [node("i")] })
    ]
  }, scope);
}

function effectRow(effect, actor, commands, scope) {
  const source = effect.source ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Sourcesource", "Source: {source}", { source: effect.source }) : "";
  const meta = [source, effect.duration].filter(Boolean).join(" · ") || (effect.disabled ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Inactive", "Inactive") : effect.isSuppressed ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Settings.UI.AssetStatus.Unavailable", "Unavailable") : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Settings.UI.AssetStatus.Active", "Active"));
  const summary = node("summary", {
    attrs: { "data-effect-id": effect.id },
    children: [node("span", { className: "mc-effect-art", children: effect.img ? [node("img", { attrs: { src: effect.img, alt: "", draggable: "false" } })] : [icon("fa-wand-magic-sparkles")] }), node("span", { className: "mc-sheet-item-copy", children: [node("strong", { text: effect.name }), node("small", { text: meta })] }), icon("fa-chevron-right")]
  });
  bindEffectContextMenu(summary, effect, actor, commands, scope);
  return node("details", { className: "mc-effect-detail", children: [
    summary,
    effect.descriptionHtml || effect.description ? renderDescription(effect.descriptionHtml || effect.description, "mc-effect-description").content : null,
    node("p", { className: "mc-effect-metadata", text: meta })
  ] });
}

function collectionCard(title, iconName, children, action = null) {
  return node("section", { className: "mc-sheet-card mc-sheet-collection", children: [sectionHeading(title, iconName, action), ...children] });
}

function collectionSection(key, label, count, children, expanded = false, onChange = null, scope = null) {
  const summary = node("summary", { attrs: { "aria-expanded": String(expanded) }, children: [icon("fa-chevron-right"), label instanceof Node ? label : node("span", { text: label }), node("b", { text: count })] });
  const details = node("details", {
    className: "mc-sheet-collection-section",
    attrs: { open: expanded },
    dataset: { section: key },
    children: [summary, node("div", { className: "mc-sheet-collection-list", children })]
  });
  if (onChange && scope) bindDetailsDisclosure(details, summary, onChange, scope);
  return details;
}

function exhaustionControl(condition, actor, commands, status, scope) {
  const level = condition.level ?? 0;
  const editable = Boolean(actor.capabilities?.editExhaustion);
  let pending = false;
  const buttons = [];
  const adjustButton = (direction) => {
    const label = localizedText(commands.localize, direction < 0 ? "MIKELANDIA_CONTROLS.Character.Presenter.Decrease2" : "MIKELANDIA_CONTROLS.Character.Presenter.Increase2", direction < 0 ? "Decrease {label}" : "Increase {label}", { label: condition.label });
    const button = node("button", {
      className: "mc-exhaustion-step",
      attrs: { type: "button", "aria-label": label, title: label, disabled: !editable || level + direction < 0 || level + direction > condition.maximumLevel },
      children: [icon(direction < 0 ? "fa-minus" : "fa-plus")],
      on: { click: async () => {
        if (pending || scope.disposed || button.disabled) return;
        pending = true;
        const action = runActorCommand(button, ACTOR_COMMANDS.SET_EXHAUSTION_LEVEL, actor, { originalLevel: level, level: level + direction }, commands, status, localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.UpdatingExhaustion", "Updating exhaustion…"), "");
        for (const entry of buttons) entry.disabled = true;
        try { await action; }
        finally {
          pending = false;
          if (!scope.disposed) for (const [index, entry] of buttons.entries()) entry.disabled = !editable || (index === 0 ? level <= 0 : level >= condition.maximumLevel);
        }
      } }
    }, scope);
    buttons.push(button);
    return button;
  };
  return node("div", {
    className: `mc-condition-control mc-exhaustion-control${level > 0 ? " is-active" : ""}`,
    children: [
      node("span", { className: "mc-condition-art", children: condition.img ? [node("img", { attrs: { src: condition.img, alt: "", draggable: "false" } })] : [icon("fa-circle-exclamation")] }),
      node("span", { className: "mc-condition-label", text: condition.label }),
      node("span", { className: "mc-exhaustion-controls", attrs: { role: "group", "aria-label": condition.label }, children: [
        adjustButton(-1),
        node("span", { className: "mc-exhaustion-level", attrs: { "aria-live": "polite" }, text: localizedNumber(level, actor.header?.locale) }),
        adjustButton(1)
      ] })
    ]
  });
}

function spellGroupDivider(label, spellcasting = null, localize, selection = { classId: "" }, scope) {
  const classes = spellcasting?.classes ?? [];
  if (!classes.some(entry => entry.id === selection.classId)) {
    selection.classId = classes.find(entry => entry.id === spellcasting?.defaultClassId)?.id
      ?? classes.find(entry => entry.attackBonus === spellcasting?.attackBonus && entry.saveDC === spellcasting?.saveDC)?.id
      ?? classes[0]?.id ?? "";
  }
  const current = classes.find(entry => entry.id === selection.classId) ?? spellcasting;
  const selector = classes.length > 1 ? node("select", {
    className: "mc-spellcasting-class",
    attrs: { "aria-label": localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.SpellcastingClass", "Spellcasting class") },
    children: classes.map(entry => node("option", { attrs: { value: entry.id, selected: selection.classId === entry.id }, text: entry.label })),
    on: { change: () => { selection.classId = selector.value; updateStats(); } }
  }, scope) : null;
  const stats = node("span", { className: "mc-spellcasting-stats", attrs: { "aria-live": "polite" } });
  function updateStats() {
    const casting = classes.find(entry => entry.id === selection.classId) ?? spellcasting;
    stats.replaceChildren(...spellcastingStats(casting, localize));
  }
  stats.append(...spellcastingStats(current, localize));
  return node("h3", { className: "mc-spell-group-divider", children: [
    node("span", { className: "mc-spellcasting-heading", text: label }),
    spellcasting ? node("span", { className: "mc-spellcasting-summary", children: [selector, stats] }) : null
  ] });
}

function spellcastingStats(spellcasting, localize) {
  const stats = [];
  if (spellcasting?.attackBonus != null) stats.push(node("span", { text: localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.SpellAttackBonus", "Spell attack {modifier}", { modifier: formatModifier(spellcasting.attackBonus) }) }));
  if (spellcasting?.saveDC != null) stats.push(node("span", { text: localizedText(localize, "MIKELANDIA_CONTROLS.Character.Presenter.SpellSaveDC", "Save DC {dc}", { dc: spellcasting.saveDC }) }));
  return stats;
}

function itemRow(item, actor, commands, status, openItem, expandedItemId, scope, depth = 0, muted = false) {
  let detail;
  const chevron = icon("fa-chevron-right");
  const summary = node("summary", {
    className: `mc-sheet-item-row${muted ? " is-muted" : ""}`,
    attrs: { "aria-expanded": String(expandedItemId === item.id), "aria-label": `${expandedItemId === item.id ? "Collapse" : "Expand"} ${item.name}` },
    on: { click: (event) => {
      event.preventDefault();
      const willOpen = !detail.open;
      for (const other of detail.closest(".mc-character-screen")?.querySelectorAll("details.mc-sheet-item-detail[open], details.mc-sheet-container[open]") ?? []) {
        if (other !== detail && !other.contains(detail)) {
          other.open = false;
          other.querySelector(":scope > summary")?.setAttribute("aria-expanded", "false");
        }
      }
      detail.open = willOpen;
      summary.setAttribute("aria-expanded", String(willOpen));
      summary.setAttribute("aria-label", `${willOpen ? "Collapse" : "Expand"} ${item.name}`);
      commands.setExpandedCharacterItem(willOpen ? item.id : "");
    } },
    children: [
      itemActionButton(item, actor, commands, status, scope),
      itemMiddle(item, actor, commands, status, scope),
      chevron
    ]
  }, scope);
  if (depth) summary.style.paddingLeft = `${12 + depth * 18}px`;
  bindCharacterItemMenu(summary, item, actor, commands, status, scope);
  detail = node("details", {
    className: "mc-sheet-item-detail",
    attrs: { open: expandedItemId === item.id },
    dataset: { itemId: item.id },
    children: [summary, itemInlineSummary(item, actor, commands, status, openItem, scope)]
  });
  return detail;
}

function itemMiddle(item, actor, commands, status, scope, subtitle = itemSubtitle(item) || localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Labels.Noadditionaldetails", "No additional details")) {
  if (actor.type === "npc" && item.npcGroup && item.activation) subtitle = [subtitle, item.activation].filter(Boolean).join(" · ");
  const displayName = characterItemDisplayName(item);
  const copy = node("span", { className: "mc-sheet-item-copy", children: [node("strong", { text: displayName }), node("small", { text: subtitle })] });
  const middle = node("span", { className: "mc-sheet-item-middle", children: [copy, itemStatusCluster(item, commands.localize)] });
  return middle;
}

function itemStatusCluster(item, localize = null) {
  const statuses = characterItemStatuses(item, localize).map((entry) => entry.id === "uses"
    ? node("span", { className: "mc-item-uses", attrs: { title: entry.label, "aria-label": entry.label }, text: entry.text })
    : statusIcon(entry.icon, entry.label, entry.active, entry.className, entry.inactiveStyle));
  return statuses.length ? node("span", { className: "mc-item-status-cluster", children: statuses }) : null;
}

export function characterItemDisplayName(item) {
  return item.type !== "spell" && item.quantityApplicable && Number(item.quantity) !== 1
    ? `${item.name} (x${Math.max(0, Number(item.quantity) || 0)})`
    : item.name;
}

export function characterItemStatuses(item, localize = null) {
  const statuses = [];
  if (item.uses) statuses.push({ id: "uses", label: localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.UsesRemaining", "{value} of {maximum} uses remaining", { value: item.uses.value, maximum: item.uses.max }), text: `${item.uses.value}/${item.uses.max}` });
  if (item.type === "spell") {
    if (item.alwaysPrepared) statuses.push({ id: "preparation", icon: "fa-book", label: localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.AlwaysPrepared", "Always Prepared"), active: true, className: "is-preparation is-always" });
    else if (item.preparationEligible) {
      const prepared = item.preparationState === 1;
      statuses.push({ id: "preparation", icon: "fa-book", label: prepared ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Prepared", "Prepared") : localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Unprepared", "Unprepared"), active: prepared, className: "is-preparation" });
    }
  } else {
    if (item.attunementApplicable) statuses.push({ id: "attunement", icon: "fa-sun", label: item.attuned ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Attuned", "Attuned") : item.attunement === "required" ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.RequiresAttunement", "Requires Attunement") : localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.OptionalAttunement", "Optional Attunement"), active: item.attuned, className: "is-attunement" });
    if (item.equippedApplicable) statuses.push({ id: "equipped", icon: "fa-shield-halved", label: item.equipped ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Equipped", "Equipped") : localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Notequipped", "Not equipped"), active: item.equipped, className: "is-equipped", inactiveStyle: "solid" });
  }
  if (item.favoriteApplicable) statuses.push({ id: "favorite", icon: "fa-bookmark", label: item.favorite ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Favorite", "Favorite") : localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Notfavorite", "Not favorite"), active: item.favorite, className: "is-favorite" });
  return Object.freeze(statuses.map((entry) => Object.freeze(entry)));
}

function statusIcon(iconName, label, active, extraClass = "", inactiveStyle = "regular") {
  return node("span", {
    className: `mc-item-status ${active ? "is-active" : "is-inactive"} ${extraClass}`.trim(),
    attrs: { title: label, "aria-label": label, role: "img" },
    children: [icon(iconName, active ? "solid" : inactiveStyle)]
  });
}

export function characterItemActions(item, {   localize = null } = {}) {
  const actions = [];
  if (item.type === "spell" && item.canPrepare) actions.push({ id: "prepare", label: item.preparationState === 0 ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Prepare", "Prepare") : localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Unprepare", "Unprepare"), icon: "fa-book", command: ACTOR_COMMANDS.SET_SPELL_PREPARED, valueKey: "prepared", value: item.preparationState === 0 ? 1 : 0 });
  if (item.type !== "spell" && item.canEquip) actions.push({ id: "equip", label: item.equipped ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Unequip", "Unequip") : localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Equip", "Equip"), icon: "fa-shield-halved", command: ACTOR_COMMANDS.SET_ITEM_EQUIPPED, valueKey: "equipped", value: !item.equipped });
  if (item.type !== "spell" && item.canAttune) actions.push({ id: "attune", label: item.attuned ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.EndAttunement", "End Attunement") : localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Attune", "Attune"), icon: "fa-sun", command: ACTOR_COMMANDS.SET_ITEM_ATTUNED, valueKey: "attuned", value: !item.attuned });
  if (item.favoriteApplicable) actions.push({ id: "favorite", label: item.favorite ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Unfavorite", "Unfavorite") : localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Favorite", "Favorite"), icon: "fa-bookmark", command: ACTOR_COMMANDS.SET_ITEM_FAVORITE, valueKey: "favorite", value: !item.favorite });

  if (item.canEdit) actions.push({ id: "edit", label: localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.EditinFoundry", "Edit in Foundry"), icon: "fa-pen-to-square", command: ACTOR_COMMANDS.OPEN_ITEM_SHEET });
  return Object.freeze(actions.map((action) => Object.freeze(action)));
}

export function resolveCharacterItemMenu(item, actor, commands) {
  const record = commands.readCharacterItemMenu({ actorSourceUuid: characterRecordSourceUuid(actor), itemId: item.id,
    ...(item.activityId ? { activityId: item.activityId } : {}), favouriteContext: Array.isArray(item.favouriteIds) });
  const actions = characterItemActions(record.item, {
    localize: commands.localize
  });
  return { item: record.item, actions };
}

function bindCharacterItemMenu(target, item, actor, commands, status, scope) {
  target.dataset.mcItemActions = "true";
  const open = event => showCharacterItemActionMenu(target, event, item, actor, commands, status, scope);
  bindLongPress(target, scope, open);
  scope.listen(target, "keydown", event => {
    if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
    event.preventDefault();
    open(event);
  });
}

function showCharacterItemActionMenu(anchor, event, item, actor, commands, status, scope) {
  if (scope.disposed) return;
  let actions;
  try { ({ item, actions } = resolveCharacterItemMenu(item, actor, commands)); }
  catch (error) {
    status.classList.add("is-error");
    status.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ThisItemIsNoLongerAvailable", "This item is no longer available.");
    return;
  }
  if (!actions.length) return;
  const screen = anchor.closest(".mc-character-screen");
  const host = screen?.__mcCharacterOverlayHost ?? screen ?? anchor.ownerDocument?.body;
  if (!host) return;
  host.querySelector?.(".mc-character-item-menu")?.dispatchEvent(new Event("mc-close"));
  const menuScope = scope.child(`item-actions-${item.id}`);
  let close = () => {};
  const menu = node("div", {
    className: `mc-character-item-menu${host === screen ? "" : " is-pane-scoped"}`,
    attrs: { role: "menu", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Actions", "{name} actions", { name: (item.name) }) },
    children: actions.map((action) => node("button", {
      attrs: { type: "button", role: "menuitem", "aria-label": `${action.label} ${item.name}` },
      on: { click: async (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        if (clickEvent.currentTarget.disabled) return;
        clickEvent.currentTarget.disabled = true;
        const payload = { actorSourceUuid: characterRecordSourceUuid(actor), itemId: item.id };
        if (action.valueKey) payload[action.valueKey] = action.value;
        if (action.id === "favorite" && action.value === false && item.favouriteIds?.length) payload.favouriteIds = [...item.favouriteIds];
        close();
        try {
          await commands.execute(action.command, payload);
        } catch (error) {
          status.classList.add("is-error");
          status.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.FailedFor", "{label} failed for {name}.", { label: (action.label), name: (item.name) });
        }
      } },
      children: [icon(action.icon), node("span", { text: action.label })]
    }, menuScope))
  });
  host.append(menu);
  positionCharacterMenu(menu, host, event);
  menu.querySelector("button")?.focus?.({ preventScroll: true });
  close = () => {
    menu.remove();
    menuScope.dispose();
  };
  menuScope.listen(menu, "mc-close", close);
  menuScope.listen(menu, "keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); close(); anchor.focus?.({ preventScroll: true }); }
  });
  menuScope.listen(document, "pointerdown", (outsideEvent) => {
    if (!menu.contains(outsideEvent.target)) close();
  }, { capture: true, passive: true });
  menuScope.own(() => menu.remove());
}

function positionCharacterMenu(menu, host, event) {
  const width = 210;
  const height = Math.max(52, menu.childElementCount * 44 + 12);
  const paneScoped = menu.classList.contains("is-pane-scoped");
  const bounds = paneScoped ? host.getBoundingClientRect() : { left: 0, top: 0, width: globalThis.visualViewport?.width ?? globalThis.innerWidth ?? 360, height: globalThis.visualViewport?.height ?? globalThis.innerHeight ?? 640 };
  const anchorBounds = event.currentTarget?.getBoundingClientRect?.() ?? menu.getBoundingClientRect();
  const x = (Number.isFinite(event.clientX) ? event.clientX : anchorBounds.left + anchorBounds.width / 2) - bounds.left;
  const y = (Number.isFinite(event.clientY) ? event.clientY : anchorBounds.bottom) - bounds.top;
  menu.style.left = `${Math.max(8, Math.min(bounds.width - width - 8, x - width / 2))}px`;
  menu.style.top = `${Math.max(8, Math.min(bounds.height - height - 8, y + 10))}px`;
}

function currencyStrip(actor, commands, status, scope) {
  const edit = node("button", {
    className: "mc-currency-edit",
    attrs: { type: "button", disabled: !actor.capabilities?.updateCurrency, "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.EditCurrency", "Edit {name} currency", { name: (actor.name) }) },
    children: [icon("fa-pen"), node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Edit2", "Edit") })]
  }, scope);
  const strip = node("div", {
    className: "mc-currency-strip",
    attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Currency", "Currency") },
    children: [
      ...CURRENCY_DENOMINATIONS.map((denomination) => node("span", {
        className: `is-${denomination}`,
        attrs: { title: `${denomination.toUpperCase()} ${actor.currency?.[denomination] ?? 0}` },
        children: [node("small", { text: denomination.toUpperCase() }), node("strong", { text: actor.currency?.[denomination] ?? 0 })]
      })),
      edit
    ]
  });
  scope.listen(edit, "click", () => openCurrencyEditor(edit, actor, commands, status, scope));
  return strip;
}

function openCurrencyEditor(anchor, actor, commands, pageStatus, scope) {
  if (anchor.disabled) return;
  const screen = anchor.closest(".mc-character-screen");
  const host = screen?.__mcCharacterOverlayHost ?? screen ?? anchor.ownerDocument?.body;
  host?.querySelector?.(".mc-currency-editor-layer")?.dispatchEvent(new Event("mc-close"));
  const editorScope = scope.child("currency-editor");
  const initial = Object.fromEntries(CURRENCY_DENOMINATIONS.map((key) => [key, Number(actor.currency?.[key]) || 0]));
  const inputs = {};
  const editorStatus = node("p", { className: "mc-currency-editor-status", attrs: { role: "status", "aria-live": "polite" } });
  let pending = false;
  const close = () => editorScope.dispose();
  const rows = CURRENCY_DENOMINATIONS.map((denomination) => {
    const input = node("input", { attrs: { type: "number", inputmode: "numeric", min: "0", step: "1", value: initial[denomination], "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Value", "{denomination} value", { denomination: denomination.toUpperCase() }) } });
    inputs[denomination] = input;
    const step = (delta) => { input.value = String(Math.max(0, Math.trunc(Number(input.value) || 0) + delta)); };
    return node("label", { className: `mc-currency-editor-row is-${denomination}`, children: [
      node("span", { children: [icon("fa-coins"), node("strong", { text: denomination.toUpperCase() })] }),
      node("button", { attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Decrease", "Decrease {denomination}", { denomination: denomination.toUpperCase() }) }, on: { click: () => step(-1) }, children: [icon("fa-minus")] }, editorScope),
      input,
      node("button", { attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Increase", "Increase {denomination}", { denomination: denomination.toUpperCase() }) }, on: { click: () => step(1) }, children: [icon("fa-plus")] }, editorScope)
    ] });
  });
  const form = node("form", {
    className: "mc-currency-editor",
    attrs: { role: "dialog", "aria-modal": "true", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.EditCurrency", "Edit {name} currency", { name: (actor.name) }) },
    on: { submit: async (event) => {
      event.preventDefault();
      if (pending) return;
      const values = {};
      for (const denomination of CURRENCY_DENOMINATIONS) {
        const value = Number(inputs[denomination].value);
        if (!Number.isSafeInteger(value) || value < 0) {
          editorStatus.classList.add("is-error");
          editorStatus.textContent = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.MustBeANonNegativeWholeNumber", "{denomination} must be a non-negative whole number.", { denomination: denomination.toUpperCase() });
          return;
        }
        if (value !== initial[denomination]) values[denomination] = value;
      }
      if (!Object.keys(values).length) return close();
      pending = true;
      for (const control of form.querySelectorAll("button, input")) control.disabled = true;
      editorStatus.classList.remove("is-error");
      editorStatus.textContent = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.UpdatingCurrency", "Updating currency…");
      try {
        await commands.execute(ACTOR_COMMANDS.UPDATE_CURRENCY, { actorSourceUuid: characterRecordSourceUuid(actor), values });
        pageStatus.textContent = "";
        close();
      } catch (error) {
        if (editorScope.disposed) return;
        pending = false;
        for (const control of form.querySelectorAll("button, input")) control.disabled = false;
        editorStatus.classList.add("is-error");
        editorStatus.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CurrencyCouldNotBeUpdated", "Currency could not be updated.");
      }
    } },
    children: [
      node("header", { children: [node("span", { className: "mc-hp-editor-heading-icon", children: [icon("fa-coins")] }), node("div", { children: [node("small", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Inventory", "Inventory") }), node("h2", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.EditCurrency2", "Edit Currency") })] }), node("button", { className: "mc-hp-editor-close", attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CloseCurrencyEditor", "Close currency editor") }, on: { click: close }, children: [icon("fa-xmark")] }, editorScope)] }),
      node("div", { className: "mc-currency-editor-rows", children: rows }),
      editorStatus,
      node("button", { className: "mc-currency-editor-submit", attrs: { type: "submit" }, children: [icon("fa-check"), node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.SaveChanges", "Save Changes") })] })
    ]
  }, editorScope);
  const layer = node("div", { className: `mc-currency-editor-layer${host === screen ? "" : " is-pane-scoped"}`, children: [form] });
  host?.append(layer);
  editorScope.listen(layer, "mc-close", close);
  editorScope.listen(layer, "pointerdown", (event) => { if (event.target === layer) close(); });
  editorScope.own(() => layer.remove());
}

function encumbranceMeter(encumbrance = {}, locale = "en", localize = null) {
  const value = Number(encumbrance.value);
  const maximum = Number(encumbrance.max ?? encumbrance.thresholds?.maximum);
  const pct = Number(encumbrance.pct);
  const validValue = Number.isFinite(value) ? value : 0;
  const validMaximum = Number.isFinite(maximum) && maximum > 0 ? maximum : 0;
  const validPct = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  const fill = node("i", { className: "mc-encumbrance-fill", attrs: { "aria-hidden": "true" } });
  fill.style.width = `${validPct}%`;
  const meter = node("div", {
    className: "mc-encumbrance-meter",
    attrs: { role: "meter", "aria-valuenow": validValue, "aria-valuemin": "0", "aria-valuemax": validMaximum, "aria-valuetext": `${formatCapacity(validValue, locale)} of ${validMaximum ? formatCapacity(validMaximum, locale) : "unknown"} weight` },
    children: [
      node("span", { className: "mc-encumbrance-label", children: [icon("fa-weight-hanging"), node("strong", { text: `${formatCapacity(validValue, locale)} / ${validMaximum ? formatCapacity(validMaximum, locale) : "—"}` })] }),
      node("span", { className: "mc-encumbrance-track", children: [
        fill,
        thresholdMarker(encumbrance.stops?.encumbered, localizedText(localize, "MIKELANDIA_CONTROLS.Character.Copy.Encumberedthreshold", "Encumbered threshold")),
        thresholdMarker(encumbrance.stops?.heavilyEncumbered, localizedText(localize, "MIKELANDIA_CONTROLS.Character.Copy.Heavilyencumberedthreshold", "Heavily encumbered threshold"))
      ] })
    ]
  });
  meter.dataset.pct = String(Number.isFinite(pct) ? pct : "");
  meter.dataset.thresholdEncumbered = String(encumbrance.thresholds?.encumbered ?? "");
  meter.dataset.thresholdHeavilyEncumbered = String(encumbrance.thresholds?.heavilyEncumbered ?? "");
  return meter;
}

function thresholdMarker(stop, label) {
  const value = Number(stop);
  if (!Number.isFinite(value)) return null;
  const marker = node("i", { className: "mc-encumbrance-stop", attrs: { title: label, "aria-label": label } });
  marker.style.left = `${Math.max(0, Math.min(100, value))}%`;
  return marker;
}

function itemInlineSummary(item, actor, commands, status, openItem, scope) {
  const description = node("div", { className: "mc-sheet-item-inline-description" });
  if (item.descriptionHtml) {
    description.innerHTML = item.descriptionHtml;
    scope.listen(description, "click", (event) => {
      if (event.target.closest?.("a")) event.preventDefault();
    });
  } else {
    description.append(node("p", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NoDescriptionIsAvailableForThisItem", "No description is available for this item.") }));
  }

  const enabled = actor.capabilities?.useItem?.includes(item.id) ?? false;
  const actionLabel = item.type === "spell" ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Cast", "Cast") : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Use", "Use");
  return node("div", { className: "mc-sheet-item-inline", children: [
    item.properties?.length ? node("div", { className: "mc-sheet-item-inline-tags", children: item.properties.slice(0, 8).map((property) => node("span", { text: property })) }) : null,
    item.details?.length ? node("dl", {
      className: "mc-sheet-item-inline-facts",
      children: item.details.slice(0, 6).flatMap((detail) => [node("dt", { text: detail.label }), node("dd", { text: detail.value })])
    }) : null,
    description,
    node("div", { className: "mc-sheet-item-inline-actions", children: [
      node("button", {
        className: "is-primary",
        attrs: { type: "button", disabled: !enabled, title: enabled ? `${actionLabel} ${item.name}` : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.YouDoNotHavePermissionToUse", "You do not have permission to use {name}", { name: (item.name) }),  },
        on: { click: (event) => runItemAction(event.currentTarget, item, actor, commands, status) },
        children: [icon(item.type === "spell" ? "fa-wand-magic-sparkles" : "fa-play"), node("span", { text: actionLabel })]
      }, scope),
      node("button", {
        attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ViewFullDetailsFor", "View full details for {name}", { name: (item.name) }) },
        on: { click: () => {
          commands.setExpandedCharacterItem(item.id);
          openItem(item);
        } },
        children: [icon("fa-circle-info"), node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Collective.Details", "Details") })]
      }, scope)
    ] })
  ] });
}

function inventoryEntryContains(entry, itemId) {
  if (!itemId) return false;
  return entry.item?.id === itemId || (entry.children ?? []).some((child) => inventoryEntryContains(child, itemId));
}

function collectionControls(label, initialSortMode, onToggleSort, getExpandable, onSetExpandedSections, scope, { showSort = true, localize = null } = {}) {
  const sortIcon = icon("fa-arrow-down-short-wide");
  const expansionIcon = icon("fa-angles-right");
  const sortButton = node("button", {
    attrs: { type: "button" },
    on: { click: onToggleSort },
    children: [sortIcon]
  }, scope);
  const expansionButton = node("button", {
    attrs: { type: "button" },
    on: { click: () => {
      const entries = Array.from(getExpandable());
      const expand = !entries.some((entry) => entry.open);
      for (const entry of entries) entry.open = expand;
      onSetExpandedSections(Array.from(getExpandable()).filter((entry) => entry.open && entry.dataset.section).map((entry) => entry.dataset.section), expand);
      controls.updateExpansion();
    } },
    children: [expansionIcon]
  }, scope);
  const controls = {
    element: node("div", { className: "mc-collection-controls", children: [showSort ? sortButton : null, expansionButton] }),
    updateSort(sortMode) {
      const alphabetical = sortMode === "alphabetical";
      sortIcon.className = `fa-solid ${alphabetical ? "fa-arrow-down-a-z" : "fa-arrow-down-short-wide"}`;
      sortButton.title = alphabetical ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Copy.SortedAtoZswitchtoFoundryorder", "Sorted A to Z; switch to Foundry order") : localizedText(localize, "MIKELANDIA_CONTROLS.Character.Copy.UsingFoundryorderswitchtoAtoZ", "Using Foundry order; switch to A to Z");
      sortButton.setAttribute("aria-label", alphabetical ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Copy.collectionsortedAtoZSwitchtoFoundryorder", "{collection}: sorted A to Z. Switch to Foundry order", { collection: label }) : localizedText(localize, "MIKELANDIA_CONTROLS.Character.Copy.collectionusingFoundryorderSwitchtoAtoZ", "{collection}: using Foundry order. Switch to A to Z", { collection: label }));
    },
    updateExpansion() {
      const entries = Array.from(getExpandable());
      const anyOpen = entries.some((entry) => entry.open);
      expansionIcon.className = `fa-solid ${anyOpen ? "fa-angles-down" : "fa-angles-right"}`;
      expansionButton.title = anyOpen ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Copy.Collapseallcollectionsections", "Collapse all {collection} sections", { collection: label }) : localizedText(localize, "MIKELANDIA_CONTROLS.Character.Copy.Expandallcollectionsections", "Expand all {collection} sections", { collection: label });
      expansionButton.setAttribute("aria-label", expansionButton.title);
    }
  };
  controls.updateSort(initialSortMode);
  return controls;
}

function collectionFilterButton(initialFilter, onToggle, scope, localize = null) {
  const label = node("span");
  const element = node("button", {
    className: "mc-collection-filter",
    attrs: { type: "button" },
    on: { click: onToggle },
    children: [icon("fa-filter"), label]
  }, scope);
  const update = (filter) => {
    const prepared = filter === "prepared";
    label.textContent = prepared ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Prepared", "Prepared") : localizedText(localize, "MIKELANDIA_CONTROLS.Settings.UI.AssetAll", "All");
    element.title = prepared ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Copy.Showingpreparedandalwaysavailablespellsshowallspells", "Showing prepared and always-available spells; show all spells") : localizedText(localize, "MIKELANDIA_CONTROLS.Character.Copy.Showingallspellsshowpreparedandalwaysavailablespells", "Showing all spells; show prepared and always-available spells");
    element.setAttribute("aria-label", element.title);
    element.setAttribute("aria-pressed", String(prepared));
  };
  update(initialFilter);
  return Object.freeze({ element, update });
}

function persistCollectionPreference(commands, key, value, status) {
  void Promise.resolve(commands.updateCharacterCollectionPreference?.(key, value)).catch((error) => {
    status.classList.add("is-error");
    status.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ThatDisplayPreferenceCouldNotBeSaved", "That display preference could not be saved.");
  });
}

function itemDetailModal(item, close, scope, commands) {
  if (!item) return null;
  const element = node("div", {
    className: "mc-item-modal",
    attrs: { role: "dialog", "aria-modal": "true", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ItemDetails", "{name} details", { name: item.name }) },
    children: [itemDetailContent(item, close, scope, commands)]
  });
  scope.listen(document, "keydown", (event) => {
    if (event.key === "Escape") close();
  });
  queueMicrotask(() => element.querySelector(".mc-item-modal-close")?.focus());
  return element;
}

function actorItemById(actor, itemId) {
  if (!itemId) return null;
  return [...(actor.inventory ?? []), ...(actor.spells ?? []), ...(actor.features ?? []), ...(actor.items ?? [])]
    .find((item) => item.id === itemId) ?? null;
}

function itemDetailContent(item, close, scope, commands) {
  const subtitle = [
    item.typeLabel || item.type,
    item.type === "spell" ? (Number(item.level) === 0 ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Cantrip", "Cantrip") : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.ActorView.Level", "Level {level}", { level: localizedNumber(Number(item.level) || 0, commands.readLocale?.() ?? "en") })) : null,
    item.equipped ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Labels.Equipped", "Equipped") : null,
    Number(item.quantity) > 1 ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Quantityquantity", "Quantity {quantity}", { quantity: localizedNumber(item.quantity, commands.readLocale?.() ?? "en") }) : null
  ].filter(Boolean).join(" / ");
  const sections = [];

  if (item.descriptionHtml) {
    const description = node("div", { className: "mc-item-modal-description" });
    description.innerHTML = item.descriptionHtml;
    scope.listen(description, "click", (event) => {
      if (event.target.closest?.("a")) event.preventDefault();
    });
    sections.push(itemModalSection(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Description", "Description"), [description]));
  }

  if (item.details?.length) {
    sections.push(itemModalSection(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Collective.Details", "Details"), [node("dl", {
      className: "mc-item-modal-facts",
      children: item.details.flatMap((detail) => [node("dt", { text: detail.label }), node("dd", { text: detail.value })])
    })]));
  }

  if (item.properties?.length) {
    sections.push(itemModalSection(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Properties", "Properties"), [node("div", {
      className: "mc-item-modal-properties",
      children: item.properties.map((property) => node("span", { text: property }))
    })]));
  }

  if (item.activities?.length) {
    sections.push(itemModalSection(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Activitiescount", "Activities ({count})", { count: localizedNumber(item.activities.length, commands.readLocale?.() ?? "en") }), item.activities.map((activity) => activityDetail(activity))));
  }

  if (item.effects?.length) {
    sections.push(itemModalSection(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Effectscount", "Effects ({count})", { count: localizedNumber(item.effects.length, commands.readLocale?.() ?? "en") }), item.effects.map((effect) => embeddedEffectDetail(effect, commands.localize))));
  }

  return node("div", { className: "mc-item-modal-screen", children: [
    node("header", { className: "mc-item-modal-header", children: [
      node("div", { children: [node("small", { text: item.typeLabel || item.type }), node("h2", { text: item.name })] }),
      node("button", { className: "mc-item-modal-close", attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CloseItemDetails", "Close item details") }, on: { click: close }, children: [icon("fa-xmark")] }, scope)
    ] }),
    node("main", { className: "mc-item-modal-content", children: [
      node("section", { className: "mc-item-modal-hero", children: [
        node("span", { className: "mc-item-modal-art", children: item.img ? [node("img", { attrs: { src: item.img, alt: "" } })] : [icon(item.type === "spell" ? "fa-sparkles" : "fa-diamond")] }),
        node("div", { children: [node("h3", { text: item.name }), node("p", { text: subtitle }), item.source ? node("small", { text: item.source }) : null] })
      ] }),
      ...sections,
      !sections.length ? node("p", { className: "mc-item-modal-empty", text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NoAdditionalItemInformation", "No additional information is available for this item.") }) : null
    ] })
  ] });
}

function itemModalSection(title, children) {
  return node("section", { className: "mc-item-modal-section", children: [node("h3", { text: title }), ...children] });
}

function activityDetail(activity) {
  return node("article", { className: "mc-item-activity", children: [
    node("header", { children: [
      node("span", { className: "mc-item-activity-art", children: activity.img ? [node("img", { attrs: { src: activity.img, alt: "" } })] : [icon("fa-bolt")] }),
      node("span", { children: [node("strong", { text: activity.name }), activity.type ? node("small", { text: activity.type }) : null] })
    ] }),
    activity.details?.length ? node("dl", { children: activity.details.flatMap((detail) => [node("dt", { text: detail.label }), node("dd", { text: detail.value })]) }) : null,
    activity.damage?.length ? node("div", { className: "mc-item-activity-damage", children: activity.damage.map((damage) => node("span", { text: damage })) }) : null
  ] });
}

function embeddedEffectDetail(effect, localize = null) {
  const state = effect.isSuppressed ? localizedText(localize, "MIKELANDIA_CONTROLS.Settings.UI.AssetStatus.Unavailable", "Unavailable") : effect.disabled ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Copy.Inactive", "Inactive") : localizedText(localize, "MIKELANDIA_CONTROLS.Settings.UI.AssetStatus.Active", "Active");
  return node("article", { className: `mc-item-effect${!effect.isSuppressed && !effect.disabled ? "" : " is-muted"}`, children: [
    node("span", { children: effect.img ? [node("img", { attrs: { src: effect.img, alt: "" } })] : [icon("fa-wand-magic-sparkles")] }),
    node("strong", { text: effect.name }),
    node("small", { text: state })
  ] });
}

function itemActionButton(item, actor, commands, status, scope) {
  const hasActivity = item.useMode === "activity";
  const enabled = actor.capabilities?.useItem?.includes(item.id) ?? false;
  const actionLabel = hasActivity
    ? (item.type === "spell" ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Castname", "Cast {name}", { name: item.name }) : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Copy.Usename", "Use {name}", { name: item.name }))
    : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ShowInChat", "Show {name} in chat", { name: (item.name) });
  return node("button", {
    className: "mc-sheet-item-art mc-sheet-item-use",
    attrs: {
      type: "button",
      disabled: !enabled,
      title: enabled ? actionLabel : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.YouDoNotHavePermissionToUse", "You do not have permission to use {name}", { name: (item.name) }),
      "aria-label": enabled ? actionLabel : localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Unavailable", "{actionLabel}; unavailable", { actionLabel: (actionLabel) }),

    },
    on: { click: (event) => {
      event.preventDefault();
      event.stopPropagation();
      runItemAction(event.currentTarget, item, actor, commands, status);
    } },
    children: item.img ? [node("img", { attrs: { src: item.img, alt: "" } })] : [icon(item.type === "spell" ? "fa-sparkles" : "fa-diamond")]
  }, scope);
}

function runItemAction(button, item, actor, commands, status) {
  const hasActivity = item.useMode === "activity";
  return runActorCommand(button, ACTOR_COMMANDS.USE_ITEM, actor,
    { itemId: item.id, ...(item.activityId ? { activityId: item.activityId } : {}) },
    commands, status, localizedText(commands.localize, hasActivity ? "MIKELANDIA_CONTROLS.Character.Presenter.UsingItem" : "MIKELANDIA_CONTROLS.Character.Presenter.SharingItem", hasActivity ? "Using {name}…" : "Sharing {name}…", { name: item.name }), item.name);
}

function emptyCollection(message) {
  return node("p", { className: "mc-sheet-empty", text: message });
}

function activeEffectsPreview(actor, onViewAll, commands, scope) {
  const effects = (actor.effects ?? []).filter((effect) => !effect.disabled && !effect.isSuppressed && (effect.isTemporary || effect.isCondition)).slice(0, 6);
  return node("section", { className: "mc-sheet-card mc-active-effects-preview", children: [
    sectionHeading(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ActiveEffects", "Active effects"), "fa-sparkles", cardAction(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ViewAll", "View All"), onViewAll, scope)),
    effects.length ? node("div", { className: "mc-effect-preview", attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ActiveEffects", "Active effects") }, children: effects.map((effect) => {
      const entry = node("article", { attrs: { title: effect.name, "aria-label": effect.name }, children: [node("span", { className: "mc-effect-art", children: effect.img ? [node("img", { attrs: { src: effect.img, alt: "" } })] : [icon("fa-wand-magic-sparkles")] }), node("strong", { text: effect.name })] });
      bindEffectContextMenu(entry, effect, actor, commands, scope);
      return entry;
    }) }) : node("p", { className: "mc-effect-preview-empty", text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NoTemporaryActiveEffects", "No temporary active effects.") })
  ] });
}

function bindEffectContextMenu(element, effect, actor, commands, scope) {
  const identity = {
    actorSourceUuid: characterRecordSourceUuid(actor),
    effectId: effect.effectId || effect.id,
    effectUuid: effect.effectUuid || "",
    parentId: effect.effectParentId || ""
  };
  element.dataset.mcActiveEffect = "true";
  element.dataset.actorSourceUuid = identity.actorSourceUuid;
  element.dataset.effectId = String(identity.effectId);
  bindLongPress(element, scope, (event) => {
    void Promise.resolve(commands.openActiveEffectContextMenu?.({ ...identity, clientX: event.clientX, clientY: event.clientY }))
      .then((result) => {
        commands.traceActiveEffectHold?.({ ...identity, phase: "context-result", action: result?.action ?? "missing" });
        if (result?.action === "opened" && result.menu) renderEffectContextMenu(element, result.menu, commands, scope);
      })
      .catch((error) => {
        commands.traceActiveEffectHold?.({ ...identity, phase: "context-error", message: String(error?.message ?? error) });
        commands.reportCharacterMutationError?.(error);
      });
  }, {
    claimPointer: true,
    trace: (entry) => commands.traceActiveEffectHold?.({ ...identity, ...entry })
  });
}

function renderEffectContextMenu(anchor, menuRecord, commands, scope) {
  const surface = anchor.closest?.(".mc-character-screen, .mc-mobile-app") ?? anchor.ownerDocument?.body;
  surface?.__mcEffectMenuCleanup?.();
  const menu = node("nav", {
    className: "mc-effect-context-menu",
    attrs: { role: "menu", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ActiveEffectActions", "Active Effect actions") }
  });
  let closed = false;
  const dismiss = (closeGateway = true) => {
    if (closed) return;
    closed = true;
    menu.remove?.();
    if (surface?.__mcEffectMenuCleanup === dismiss) delete surface.__mcEffectMenuCleanup;
    if (closeGateway) void commands.closeActiveEffectContextMenu?.();
  };
  if (surface) surface.__mcEffectMenuCleanup = dismiss;
  for (const option of menuRecord.options ?? []) {
    const button = node("button", {
      className: "mc-effect-context-option",
      attrs: { type: "button", role: "menuitem", "data-group": option.group ?? "" }
    });
    if (option.icon) button.insertAdjacentHTML?.("afterbegin", option.icon);
    button.append(node("span", { text: option.label }));
    scope.listen(button, "click", () => {
      button.disabled = true;
      void Promise.resolve(commands.selectActiveEffectContextOption?.({ menuId: menuRecord.id, optionId: option.id }))
        .catch((error) => commands.reportCharacterMutationError?.(error))
        .finally(() => dismiss(false));
    });
    menu.append(button);
  }
  surface?.append?.(menu);
  positionEffectContextMenu(menu, surface, menuRecord);
  commands.traceActiveEffectHold?.({ actorId: menuRecord.actorId, effectId: menuRecord.effectId, phase: "menu-mounted", optionCount: menuRecord.options?.length ?? 0 });
  scope.listen(anchor.ownerDocument ?? document, "pointerdown", (event) => {
    if (!menu.contains?.(event.target) && event.target !== anchor && !anchor.contains?.(event.target)) dismiss();
  }, { capture: true, passive: true });
  scope.listen(anchor.ownerDocument ?? document, "scroll", () => dismiss(), { capture: true, passive: true });
  scope.own(() => dismiss());
  menu.querySelector?.("button")?.focus?.({ preventScroll: true });
}

function positionEffectContextMenu(menu, surface, record) {
  const bounds = surface?.getBoundingClientRect?.() ?? { left: 0, top: 0, right: globalThis.innerWidth, bottom: globalThis.innerHeight };
  const rect = menu.getBoundingClientRect?.() ?? { width: 220, height: 240 };
  const margin = 8;
  const left = Math.max(bounds.left + margin, Math.min(Number(record.clientX), bounds.right - rect.width - margin));
  const top = Math.max(bounds.top + margin, Math.min(Number(record.clientY), bounds.bottom - rect.height - margin));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function abilitiesSavesPreview(actor, onViewAll, commands, status, scope) {
  const trainedSkills = (actor.skills ?? []).filter((skill) => Number(skill.proficiency) > 0).sort((first, second) => first.label.localeCompare(second.label));
  const toolProficiencies = actor.toolProficiencies ?? [];
  return node("section", { className: "mc-sheet-card mc-abilities-saves-preview", children: [
    sectionHeading(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.AbilitiesAndSaves", "Abilities and saves"), "fa-dumbbell", cardAction(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ViewAll", "View All"), onViewAll, scope)),
    abilityScoresPreview(actor, commands, status, scope),
    node("div", { className: "mc-trained-skills-preview", children: [
      node("p", { className: "mc-trained-skills-heading", text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.SkillProficiencies", "Skill Proficiencies") }),
      trainedSkills.length ? node("div", { className: "mc-trained-skills-list", children: trainedSkills.map((skill) => {
        const enabled = actor.capabilities?.rollSkill?.includes(skill.key);
        const proficiency = skillProficiencyLabel(skill.proficiency, commands.localize);
        return node("button", {
          className: `mc-trained-skill is-${proficiency.key}`,
          attrs: { type: "button", disabled: !enabled, title: `${proficiency.label} · ${skill.ability}`, "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Roll", "Roll {label} {modifier}; {proficiency}", { label: skill.label, modifier: formatModifier(skill.modifier), proficiency: proficiency.label }),  },
          on: { click: (event) => runActorCommand(event.currentTarget, ACTOR_COMMANDS.ROLL_SKILL, actor, { skill: skill.key }, commands, status, localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.RollingSkill", "Rolling {label}…", { label: skill.label }), skill.label) },
          children: [node("span", { text: skill.label }), node("b", { text: formatModifier(skill.modifier) }), icon("fa-dice-d20")]
        }, scope);
      }) }) : node("p", { className: "mc-trained-skills-empty", text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NoSkillProficiencies", "No skill proficiencies.") })
    ] }),
    node("div", { className: "mc-trained-skills-preview mc-tool-proficiencies-preview", children: [
      node("p", { className: "mc-trained-skills-heading", text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ToolProficiencies", "Tool Proficiencies") }),
      toolProficiencies.length ? node("div", { className: "mc-trained-skills-list", children: toolProficiencies.map((tool) => toolProficiencyButton(tool, actor, commands, status, scope)) }) : node("p", { className: "mc-trained-skills-empty", text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.NoToolProficiencies", "No tool proficiencies.") })
    ] })
  ] });
}

function abilityScoresPreview(actor, commands, status, scope) {
  return node("div", { className: "mc-abilities-saves-grid", children: (actor.abilities ?? []).map((ability) => {
    const canCheck = actor.capabilities?.rollAbility?.includes(ability.key);
    const canSave = actor.capabilities?.rollSave?.includes(ability.key);
    return node("article", { attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Score", "{label}: score {score}", { label: (ability.label), score: (ability.score) }) }, children: [
      node("div", { className: "mc-ability-preview-score", children: [node("strong", { text: ability.short }), node("span", { text: ability.score })] }),
      node("div", { className: "mc-ability-preview-actions", children: [
        abilityPreviewRoll(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Check", "Check"), ability.modifier, canCheck, (button) => runActorCommand(button, ACTOR_COMMANDS.ROLL_ABILITY, actor, { ability: ability.key }, commands, status, localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.RollingAbilityCheck", "Rolling {label} check…", { label: ability.label }), localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.AbilityCheck", "{label} check", { label: ability.label })), scope, false, commands.localize),
        abilityPreviewRoll(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.SavingThrowShort", "Save"), ability.saveModifier, canSave, (button) => runActorCommand(button, ACTOR_COMMANDS.ROLL_SAVE, actor, { ability: ability.key }, commands, status, localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.RollingAbilitySave", "Rolling {label} save…", { label: ability.label }), localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.AbilitySave", "{label} save", { label: ability.label })), scope, Number(ability.proficiency) > 0, commands.localize, localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.SavingThrow", "Saving throw"))
      ] })
    ] });
  }) });
}

function toolProficiencyButton(tool, actor, commands, status, scope) {
  const enabled = actor.capabilities?.rollTool?.includes(tool.key);
  const proficiency = skillProficiencyLabel(tool.proficiency, commands.localize);
  return node("button", {
    className: `mc-trained-skill is-${proficiency.key}`,
    attrs: { type: "button", disabled: !enabled, title: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Tool", "{label} · tool", { label: proficiency.label }), "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Roll", "Roll {label} {modifier}; {proficiency}", { label: tool.label, modifier: formatModifier(tool.modifier), proficiency: proficiency.label }) },
    on: { click: (event) => runActorCommand(event.currentTarget, ACTOR_COMMANDS.ROLL_TOOL, actor, { tool: tool.key }, commands, status, localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.RollingTool", "Rolling {label}…", { label: tool.label }), tool.label) },
    children: [node("span", { text: tool.label }), node("b", { text: formatModifier(tool.modifier) }), icon("fa-dice-d20")]
  }, scope);
}

function skillProficiencyLabel(value, localize = null) {
  const multiplier = Number(value) || 0;
  if (multiplier >= 2) return { key: "expertise", label: localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Expertise", "Expertise") };
  if (multiplier >= 1) return { key: "proficient", label: localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Proficient", "Proficient") };
  if (multiplier > 0) return { key: "half", label: localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Halfproficient", "Half proficient") };
  return { key: "none", label: localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Notproficient", "Not proficient") };
}

function abilityPreviewRoll(label, modifier, enabled, onClick, scope, proficientSave = false, localize = null, accessibleLabel = label) {
  return node("button", {
    className: proficientSave ? "is-save-proficient" : "",
    attrs: { type: "button", disabled: !enabled, title: proficientSave ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Proficientsavingthrow", "Proficient saving throw") : undefined, "aria-label": localizedText(localize, proficientSave ? "MIKELANDIA_CONTROLS.Character.Labels.ProficientRoll" : "MIKELANDIA_CONTROLS.Character.Labels.Roll", proficientSave ? "{label} {value}; proficient" : "{label} {value}", { label: accessibleLabel, value: formatModifier(modifier) }) },
    on: { click: (event) => onClick(event.currentTarget) },
    children: [abilityActionLabel(label, proficientSave), node("b", { text: formatModifier(modifier) }), icon("fa-dice-d20")]
  }, scope);
}

function spellSlotTrigger(resource, actor, commands, scope) {
  const slotKey = String(resource.id ?? "").replace(/^spell-slot:/u, "");
  const editable = actor.capabilities?.editSpellSlots?.includes(slotKey) ?? false;
  return node("button", {
    className: "mc-spell-slot-trigger",
    attrs: {
      type: "button",
      disabled: !editable,
      "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.OfAvailable", "{label}, {value} of {max} available", { label: (resource.label), value: (resource.value), max: (resource.max) })
    },
    on: { click: (event) => {
      event.preventDefault();
      event.stopPropagation();
      commands.openSpellSlotEditor(resource.id);
    } },
    children: [capacityIndicator(resource.value, resource.max)]
  }, scope);
}

function spellSlotEditor(actor, requestedEditor, commands, scope) {
  if (!requestedEditor || requestedEditor.actorSourceUuid !== characterRecordSourceUuid(actor)) return null;
  const resource = actor.resources?.find((entry) => entry.id === requestedEditor.resourceId && entry.kind === "spell-slot");
  const slotKey = String(resource?.id ?? "").replace(/^spell-slot:/u, "");
  if (!resource || !(actor.capabilities?.editSpellSlots?.includes(slotKey) ?? false)) return null;

  const maximum = Math.max(0, Math.trunc(Number(resource.max) || 0));
  let value = Math.max(0, Math.min(maximum, Math.trunc(Number(resource.value) || 0)));
  let pending = false;
  const modalStatus = node("p", { className: "mc-spell-slot-editor-status", attrs: { role: "status", "aria-live": "polite" } });
  const pips = capacityIndicator(value, maximum);
  pips.classList.add("mc-spell-slot-editor-pips");
  const fraction = node("strong", { className: "mc-spell-slot-editor-fraction", text: `${value} / ${maximum}` });
  const current = node("strong", { className: "mc-spell-slot-editor-current", text: value });
  const minus = node("button", { attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Decrease2", "Decrease {label}", { label: (resource.label) }) }, children: [icon("fa-minus")] });
  const plus = node("button", { attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Increase2", "Increase {label}", { label: (resource.label) }) }, children: [icon("fa-plus")] });
  const closeButton = node("button", {
    className: "mc-hp-editor-close",
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CloseSpellSlotEditor", "Close spell-slot editor") },
    on: { click: () => { if (!pending) commands.closeSpellSlotEditor(); } },
    children: [icon("fa-xmark")]
  }, scope);
  const update = (delta = 0) => {
    value = Math.max(0, Math.min(maximum, value + delta));
    fraction.textContent = `${value} / ${maximum}`;
    current.textContent = String(value);
    pips.setAttribute("aria-label", localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.OfAvailable2", "{value} of {maximum} available", { value: (value), maximum: (maximum) }));
    for (const [index, pip] of Array.from(pips.querySelectorAll("i")).entries()) pip.classList.toggle("is-filled", index < value);
    minus.disabled = pending || value <= 0;
    plus.disabled = pending || value >= maximum;
  };
  scope.listen(minus, "click", () => update(-1));
  scope.listen(plus, "click", () => update(1));

  const form = node("form", {
    className: "mc-spell-slot-editor",
    attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "mc-spell-slot-editor-title" },
    on: { submit: async (event) => {
      event.preventDefault();
      if (pending) return;
      pending = true;
      update();
      closeButton.disabled = true;
      confirm.disabled = true;
      form.setAttribute("aria-busy", "true");
      modalStatus.classList.remove("is-error");
      modalStatus.textContent = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.UpdatingSpellSlots", "Updating spell slots…");
      try {
        await commands.execute(ACTOR_COMMANDS.SET_SPELL_SLOT_VALUE, {
          actorSourceUuid: requestedEditor.actorSourceUuid,
          slotKey,
          value,
          editorGeneration: requestedEditor.connectionGeneration
        });
        if (!scope.disposed) commands.closeSpellSlotEditor();
      } catch (error) {
        if (!scope.disposed) {
          pending = false;
          closeButton.disabled = false;
          confirm.disabled = false;
          form.removeAttribute("aria-busy");
          modalStatus.classList.add("is-error");
          modalStatus.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.SpellSlotsCouldNotBeUpdated", "Spell slots could not be updated.");
          update();
        }
      }
    } },
    children: []
  }, scope);
  const confirm = node("button", {
    className: "mc-spell-slot-editor-confirm",
    attrs: { type: "submit", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.ConfirmValue", "Confirm {label} value", { label: (resource.label) }) },
    children: [icon("fa-check"), node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Confirm", "Confirm") })]
  });
  form.append(
    node("header", { children: [
      node("span", { className: "mc-hp-editor-heading-icon", children: [icon("fa-sparkles")] }),
      node("div", { children: [node("small", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Tabs.Spells", "Spells") }), node("h2", { attrs: { id: "mc-spell-slot-editor-title" }, text: resource.label })] }),
      closeButton
    ] }),
    node("div", { className: "mc-spell-slot-editor-summary", children: [pips, fraction] }),
    node("div", { className: "mc-spell-slot-editor-controls", children: [minus, current, plus] }),
    modalStatus,
    confirm
  );
  update();
  return node("div", { className: "mc-spell-slot-editor-layer", attrs: { role: "presentation" }, children: [form] });
}

function capacityIndicator(value, max) {
  if (max <= 10) return node("span", { className: "mc-capacity-dots", children: Array.from({ length: max }, (_, index) => node("i", { className: index < value ? "is-filled" : "" })) });
  const fill = node("i");
  fill.style.width = `${Math.max(0, Math.min(100, value / max * 100))}%`;
  return node("span", { className: "mc-capacity-track", children: [fill] });
}

function sectionHeading(title, iconOrElement, action = null) {
  const headingIcon = iconOrElement instanceof Node ? iconOrElement : icon(iconOrElement);
  return node("header", { className: "mc-sheet-card-heading", children: [headingIcon, node("h3", { text: title }), action] });
}

function cardAction(label, onClick, scope) {
  return node("button", { className: "mc-sheet-card-action", attrs: { type: "button" }, on: { click: onClick }, children: [node("span", { text: label }), icon("fa-chevron-right")] }, scope);
}

function formatCapacity(value, locale = "en") {
  const rounded = Math.round(Number(value || 0) * 10) / 10;
  return Number.isInteger(rounded) ? localizedNumber(rounded, locale) : localizedNumber(rounded, locale, 1);
}

function compactAction(label, value, enabled, onClick, scope, proficientSave = false, localize = null, accessibleLabel = label) {
  return node("button", {
    className: proficientSave ? "is-save-proficient" : "",
    attrs: { type: "button", disabled: !enabled, title: proficientSave ? localizedText(localize, "MIKELANDIA_CONTROLS.Character.Labels.Proficientsavingthrow", "Proficient saving throw") : undefined, "aria-label": localizedText(localize, proficientSave ? "MIKELANDIA_CONTROLS.Character.Labels.ProficientRoll" : "MIKELANDIA_CONTROLS.Character.Labels.Roll", proficientSave ? "{label} {value}; proficient" : "{label} {value}", { label: accessibleLabel, value }) },
    on: { click: (event) => onClick(event.currentTarget) },
    children: [abilityActionLabel(label, proficientSave), node("b", { text: value })]
  }, scope);
}

function abilityActionLabel(label, proficientSave) {
  return node("span", { className: "mc-ability-action-label", children: [label, proficientSave ? saveProficiencyMarker() : null] });
}

function saveProficiencyMarker() {
  return node("span", { className: "mc-save-proficiency", attrs: { "aria-hidden": "true" }, children: [icon("fa-shield")] });
}

async function runActorCommand(button, command, actor, payload, commands, status, pendingMessage, resultLabel) {
  if (button.disabled) return;
  button.disabled = true;
  button.classList.add("is-pending");
  button.setAttribute("aria-busy", "true");
  status.classList.remove("is-error", "is-success");
  status.textContent = "";
  let openedActionSessionId = "";
  let displayedRollResultId = 0;
  const expectsRollResult = command !== ACTOR_COMMANDS.USE_ITEM && Boolean(resultLabel);
  const openActionSession = (session) => {
    const id = String(session?.rootMessageId ?? "");
    if (!id || id === openedActionSessionId) return;
    openedActionSessionId = id;
    commands.openActionSession(session, "character");
  };
  try {
    if (expectsRollResult) displayedRollResultId = commands.showRollResult({ label: resultLabel, total: 0, pending: true });
    const outcome = await commands.execute(command, { actorSourceUuid: characterRecordSourceUuid(actor), ...payload }, {
      onActionSession: openActionSession
    });
    status.textContent = "";
    if (outcome?.actionSession) openActionSession(outcome.actionSession);
    else if (outcome?.rollResult && resultLabel) {
      if (displayedRollResultId) commands.updateRollResult(displayedRollResultId, { label: resultLabel, ...outcome.rollResult, pending: false });
      else displayedRollResultId = commands.showRollResult({ label: resultLabel, ...outcome.rollResult });
    }
    else if (displayedRollResultId) commands.dismissRollResult(displayedRollResultId);
  } catch (error) {
    if (displayedRollResultId) commands.dismissRollResult(displayedRollResultId);
    commands.reportCharacterMutationError?.(error);
  } finally {
    button.disabled = false;
    button.classList.remove("is-pending");
    button.removeAttribute("aria-busy");
  }
}

function formatModifier(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  return numeric >= 0 ? `+${numeric}` : String(numeric);
}

function ordinal(value) {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

function characterRecordSourceUuid(actor) {
  return String(actor?.sourceUuid ?? (actor?.id ? `Actor.${actor.id}` : ""));
}
