import { createAppFrame } from "../ui/frame/app-frame.mjs";
import { createSignalStore } from "../kernel/state/signal-store.mjs";
import { initialAppState, reduceAppState } from "../kernel/state/app-state.mjs";
import { createTaskScope } from "../kernel/lifecycle/task-scope.mjs";
import { offlineHtml } from "./content.mjs";
import { icon } from "../ui/primitives/dom.mjs";

const HIDE =
  ".mc-native-sheet-open,.mc-biography-edit,.mc-journal-native-edit,.mc-profile-add-item,.mc-profile-condition-picker,.mc-profile-condition-editor,.mc-character-item-menu,.mc-effect-context-menu,.mc-sheet-item-inline-actions,.mc-currency-edit";
const DISABLE =
  '[data-profile-action],[data-profile-edit],[data-profile-condition],[data-profile-resource-input],.mc-profile-counter-lock,.mc-profile-ingredient-trigger,.mc-sheet-item-use,.mc-sheet-card-action,.mc-death-save-roll,.mc-spell-slot-trigger,.mc-character-inspiration,.mc-character-header-hp-main,.mc-character-header-xp,.mc-combat-roll-initiative,.mc-combat-end-turn,.mc-target-row,[data-route="chat"]';

/** The normal companion frame and presenters, supplied only with cached reads and local navigation. */
export function mountCachedApp(library, { onClose = () => {} } = {}) {
  const data = library.data,
    scope = createTaskScope("cached-app");
  const urls = [];
  const media = new Map(
    (data.media ?? []).map((entry) => {
      const url = URL.createObjectURL(entry.blob);
      urls.push(url);
      return [entry.url, url];
    }),
  );
  const imageUrl = (source) => media.get(source) ?? "";
  const html = (source) => {
    const template = document.createElement("template");
    template.innerHTML = offlineHtml(source, { base: library.server });
    for (const img of template.content.querySelectorAll("img[src]")) {
      const url = imageUrl(img.getAttribute("src"));
      if (url) img.setAttribute("src", url);
      else {
        const missing = document.createElement("span");
        missing.textContent = "Image unavailable offline";
        img.replaceWith(missing);
      }
    }
    return template.innerHTML;
  };
  const prepare = (value) => {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(prepare);
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        ["img", "src"].includes(key) && typeof child === "string"
          ? imageUrl(child)
          : ["description", "descriptionHtml", "html", "text"].includes(key) &&
              typeof child === "string"
            ? html(child)
            : prepare(child),
      ]),
    );
  };
  const actors = data.actors.map((actor) => ({
    ...prepare(actor.view),
    notesHtml: html(actor.notesHtml),
  }));
  const journals = data.journals.map(prepare);
  const preferences = structuredClone(data.preferences ?? {});
  const localize = (key, fallback = key, values) => {
    const find = (dictionary) =>
      key.split(".").reduce((value, part) => value?.[part], dictionary);
    const translated =
      find(data.translations) ?? find(data.fallbackTranslations);
    const text = typeof translated === "string" ? translated : fallback;
    return values
      ? String(text).replace(
          /\{([^}]+)\}/gu,
          (token, name) => values[name] ?? token,
        )
      : text;
  };
  const layout = () => ({
    active: true,
    theme: preferences.theme ?? "dark",
    formFactor: innerWidth >= 720 ? "tablet" : "phone",
    orientation: innerWidth > innerHeight ? "landscape" : "portrait",
  });
  const selected =
    actors.find((actor) => actor.sourceUuid === data.selectedActorSourceUuid) ??
    actors[0];
  const snapshot = {
    world: data.world ?? library.world,
    user: data.user ?? library.user,
    actors,
    selectedActor: selected ?? null,
    selectedActorSourceUuid: selected?.sourceUuid ?? "",
    preferredActorId: selected?.id ?? "",
    party: prepare(data.party),
    journals,
    combat: data.combat ? { ...prepare(data.combat), canEndTurn: false } : null,
    combatControls: { isGM: false },
    chat: [],
  };
  const store = createSignalStore(
    {
      ...initialAppState,
      ...layout(),
      status: "ready",
      snapshot,
      selectedActorId: selected?.id ?? "",
      selectedActorSourceUuid: selected?.sourceUuid ?? "",
      targeting: prepare(data.targeting),
    },
    reduceAppState,
  );
  const dispatch = (type, payload = {}) => store.dispatch({ type, ...payload });
  const unavailable = async () => {
    throw new Error(
      "Saved copies are read-only. Join the game to perform this action.",
    );
  };
  let frame;
  const commands = new Proxy(
    {
      readOnly: true,
      offlineLibrary: null,
      localize,
      readLocale: () => data.locale ?? "en",
      readFramePreferences: () => ({
        protectMcStyling: true,
        ...preferences.frame,
      }),
      readCharacterPreferences: () => preferences.character ?? {},
      readSettings: () => preferences.settings ?? {},
      readSessionStatus: () => ({ users: [] }),
      readControlsContext: () => ({}),
      controlsUiReady: () => false,
      controlsInvitationSeen: () => true,
      readActionSummaryPreferences: () => ({ showActionSummaries: false }),
      navigate: (route) => {
        if (route !== "chat") dispatch("navigate", { route });
      },
      navigateBack: () => dispatch("navigate-back"),
      returnToCharacter: () => dispatch("return-to-character"),
      toggleTabletNavSide: () => dispatch("toggle-tablet-nav-side"),
      selectActor: (sourceUuid) => {
        const actor = actors.find((entry) => entry.sourceUuid === sourceUuid);
        if (!actor) return;
        dispatch("session-loaded", {
          snapshot: {
            ...store.state.snapshot,
            selectedActor: actor,
            selectedActorSourceUuid: sourceUuid,
          },
        });
        dispatch("select-actor", { actorId: actor.id, sourceUuid });
        dispatch("targeting-updated", {
          targeting:
            sourceUuid === data.selectedActorSourceUuid
              ? prepare(data.targeting)
              : null,
        });
      },
      selectCharacterTab: (tab) => dispatch("select-character-tab", { tab }),
      openCharacterItem: (itemId) =>
        dispatch("open-character-item", { itemId }),
      closeCharacterItem: () => dispatch("close-character-item"),
      setExpandedCharacterItem: (itemId) =>
        dispatch("set-expanded-character-item", { itemId }),
      initializeCharacterSections: (sourceUuid, tab, sectionIds) =>
        dispatch("initialize-character-sections", {
          sourceUuid,
          tab,
          sectionIds,
        }),
      setCharacterSectionExpanded: (sectionId, expanded) =>
        dispatch("set-character-section-expanded", { sectionId, expanded }),
      setCharacterSectionsExpanded: (sectionIds) =>
        dispatch("set-character-sections-expanded", { sectionIds }),
      setCombatTargetsExpanded: (expanded) =>
        dispatch("targeting-updated", {
          targeting: { ...store.state.targeting, expanded },
        }),
      openCharacterPortrait: (image) =>
        dispatch("open-character-portrait", { image }),
      closeCharacterPortrait: () => dispatch("close-character-portrait"),
      readCharacterBiography: async (sourceUuid) => ({
        actorSourceUuid: sourceUuid,
        html:
          actors.find((actor) => actor.sourceUuid === sourceUuid)?.notesHtml ??
          "",
        editable: false,
        inlineRollsInteractive: false,
      }),
      readCharacterItemMenu: () => ({ items: [] }),
      openJournal: async (id, target = {}) => {
        const journal = journals.find((entry) => entry.id === id);
        if (journal) dispatch("journal-loaded", { journal, target });
      },
      closeJournal: () => dispatch("close-journal"),
      selectJournalPage: (pageId) =>
        dispatch("select-journal-page", { pageId }),
      selectJournalHeading: (pageId, heading) =>
        dispatch("select-journal-heading", { pageId, heading }),
      toggleJournalMenu: () => dispatch("toggle-journal-menu"),
      closeJournalMenu: () => dispatch("close-journal-menu"),
      openJournalImage: (image) => dispatch("open-journal-image", { image }),
      closeJournalImage: () => dispatch("close-journal-image"),
      setJournalSearch: (query) => {
        const words = query.toLowerCase().trim().split(/\s+/u).filter(Boolean);
        const results = journals.flatMap((journal) =>
          journal.pages
            .filter((page) =>
              words.every((word) =>
                `${journal.name} ${page.name} ${page.html ?? ""}`
                  .toLowerCase()
                  .includes(word),
              ),
            )
            .map((page) => ({
              journalId: journal.id,
              journalName: journal.name,
              pageId: page.id,
              pageName: page.name,
              snippet: "",
            })),
        );
        dispatch("journal-search-changed", {
          search: { query, loading: false, results, error: "" },
        });
      },
      descriptions: {
        readOnly: true,
        enrich: async ({ uuid, content }) => ({ uuid, html: content }),
        preview: async ({ uuid, relativeUuid }) => {
          const preview = data.references.find(
            (entry) =>
              entry.key === JSON.stringify([uuid, relativeUuid]) ||
              entry.id === uuid,
          );
          if (!preview)
            throw new Error(
              "Unavailable offline. Join the game to open this reference.",
            );
          return {
            uuid: preview.id,
            name: preview.name,
            html: html(preview.html),
          };
        },
        roll: unavailable,
      },
      execute: unavailable,
      updateSetting: unavailable,
      logout: async () => onClose(),
      reloadApplication: () => onClose(),
      openControlsGuide: (anchor) => frame?.openControlsGuide(anchor),
      reportCharacterMutationError: () => {},
    },
    {
      get(target, key) {
        return key in target
          ? target[key]
          : typeof key === "string" && key.startsWith("close")
            ? () => {}
            : unavailable;
      },
    },
  );
  frame = createAppFrame({ store, commands, policy: layout, scope });
  frame.mount();
  const root = document.querySelector(".mc-mobile-app");
  root.dataset.offline = "true";
  const banner = document.createElement("div");
  banner.className = "mc-offline-status";
  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Library";
  back.addEventListener("click", onClose);
  const saved = document.createElement("div");
  saved.className = "mc-offline-copy";
  const label = document.createElement("strong");
  label.textContent = "Read only ";
  const timestamp = document.createElement("time");
  timestamp.dateTime = data.savedAt;
  timestamp.textContent = `Saved ${new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(data.savedAt))}`;
  saved.append(label, timestamp);
  banner.append(back, saved);
  root.prepend(banner);
  const reserveToolbar = () =>
    root.style.setProperty(
      "--mc-offline-toolbar-height",
      `${Math.ceil(banner.getBoundingClientRect().height)}px`,
    );
  const toolbarObserver = new ResizeObserver(reserveToolbar);
  toolbarObserver.observe(banner);
  reserveToolbar();
  scope.own(() => toolbarObserver.disconnect());
  const freeze = () => {
    for (const img of root.querySelectorAll('img:not([src]),img[src=""]')) {
      const placeholder = document.createElement("span");
      placeholder.className = "mc-offline-image-placeholder";
      placeholder.setAttribute("role", "img");
      placeholder.setAttribute("aria-label", "Image unavailable offline");
      placeholder.append(icon("fa-user"));
      img.replaceWith(placeholder);
    }
    for (const element of root.querySelectorAll(HIDE)) element.hidden = true;
    for (const element of root.querySelectorAll(DISABLE)) {
      element.disabled = true;
      element.setAttribute("aria-disabled", "true");
    }
    for (const input of root.querySelectorAll("input,select,textarea"))
      if (!input.matches('[type="search"],.mc-character-search'))
        input.disabled = true;
  };
  scope.listen(
    root,
    "click",
    (event) => {
      if (event.target.closest(`${HIDE},${DISABLE}`)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
  const observer = new MutationObserver(freeze);
  observer.observe(root, { childList: true, subtree: true });
  freeze();
  scope.listen(window, "resize", () =>
    dispatch("layout-policy-changed", layout()),
  );
  return {
    store,
    commands,
    dispose() {
      observer.disconnect();
      frame.unmount();
      scope.dispose();
      urls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}
