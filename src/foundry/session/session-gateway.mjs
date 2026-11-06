import { isJournalVisible, isJournalPageVisible } from "../journals/journal-visibility.mjs";
import { readJournalSearchText } from "../journals/journal-search-text.mjs";
import { localizeFoundry } from "../settings/localization.mjs";
import { ownMobileApplication } from "../presentation/mobile-ui-isolation.mjs";
import { resolveSystemIntegration } from "../../systems/registry.mjs";
import { readParty } from "../../systems/party.mjs";
import { combatHealthChanged } from "../../systems/combat-health.mjs";
import { actorSourceRecord, actorSourceUuid, resolveActorSource, validSourceUuid } from "../actors/character-source.mjs";

const TOKEN_GEOMETRY_FIELDS = new Set(["x", "y", "elevation", "rotation", "sort"]);

export const SESSION_INVALIDATION_MAP = Object.freeze({

  updateUser: Object.freeze(["actors", "combat", "journals", "user"]),

  createActor: Object.freeze(["actors"]),
  updateActor: Object.freeze(["actors"]),
  deleteActor: Object.freeze(["actors"]),
  createItem: Object.freeze(["actors"]),
  updateItem: Object.freeze(["actors"]),
  deleteItem: Object.freeze(["actors"]),
  createActiveEffect: Object.freeze(["actors", "combat"]),
  updateActiveEffect: Object.freeze(["actors", "combat"]),
  deleteActiveEffect: Object.freeze(["actors", "combat"]),
  createFolder: Object.freeze(["journals"]),
  updateFolder: Object.freeze(["journals"]),
  deleteFolder: Object.freeze(["journals"]),
  createJournalEntry: Object.freeze(["journals"]),
  updateJournalEntry: Object.freeze(["journals"]),
  deleteJournalEntry: Object.freeze(["journals"]),
  createJournalEntryPage: Object.freeze(["journals"]),
  updateJournalEntryPage: Object.freeze(["journals"]),
  deleteJournalEntryPage: Object.freeze(["journals"]),
  createChatMessage: Object.freeze(["chat"]),
  updateChatMessage: Object.freeze(["chat"]),
  deleteChatMessage: Object.freeze(["chat"]),
  createCombat: Object.freeze(["combat"]),
  updateCombat: Object.freeze(["combat"]),
  deleteCombat: Object.freeze(["combat"]),
  createCombatant: Object.freeze(["combat"]),
  updateCombatant: Object.freeze(["combat"]),
  deleteCombatant: Object.freeze(["combat"]),
  // The tracker can select its viewed encounter after canvasReady without a document update.
  renderCombatTracker: Object.freeze(["combat"]),

  createToken: Object.freeze(["combat"]),
  deleteToken: Object.freeze(["combat"]),

  });

/**
 * Permission-aware boundary around Foundry globals. Views receive only plain,
 * serializable records from this module.
 */
export function createFoundrySessionGateway({
  getSystemIntegration = () => resolveSystemIntegration(globalThis.game?.system?.id),
  capabilitiesForActor = () => null,

  combatForSnapshot = () => null,
  combatControlsForSnapshot = () => Object.freeze({ isGM: false }),

  performanceObserver = null,
  journalSearchText = readJournalSearchText
} = {}) {
  const actorEligible = (actor, user) => isActorEligible(actor, user, getSystemIntegration());
  let refreshQueued = false;
  let latestSnapshot = null;
  let latestDomainSignatures = Object.freeze({});
  let watchGeneration = 0;
  const pendingDomains = new Set();
  const pendingDirectoryActorIds = new Set();
  let pendingFullDirectoryRead = false;
  let pendingSelectedActorRead = false;
  let selectedActorSourceUuid = "";
  let selectedReferenceSources = new Set();
  const pendingJournalWrites = new Set();

  const count = (name, amount) => performanceObserver?.increment?.(name, amount);
  const readDomain = (domain, reader) => {
    count(`authoritative.read.${domain}`);
    const finish = performanceObserver?.start?.(`authoritative.read.${domain}`) ?? (() => {});
    try {
      return reader();
    } finally {
      finish();
    }
  };

  const projectSelectedActor = (actor, user) => {
    selectedReferenceSources = new Set([...getSystemIntegration().referenceSources(actor),
      ...(getSystemIntegration().profileDependencySources?.(actor) ?? [])]);
    count("authoritative.actor.projected");
    count("authoritative.actor.detail.projected");
    const finish = performanceObserver?.start?.("authoritative.actor.detail.project") ?? (() => {});
    try {
      return Object.freeze({
        ...getSystemIntegration().createActorViewRecord(actor, user, capabilitiesForActor, game.users),
        source: actorSourceRecord(actor),
        sourceUuid: actorSourceUuid(actor),

      });
    } finally {
      finish();
    }
  };

  const projectDirectoryActor = (actor) => {
    count("authoritative.actor.directory.projected");
    const finish = performanceObserver?.start?.("authoritative.actor.directory.project") ?? (() => {});
    try { return getSystemIntegration().createActorDirectoryRecord(actor); } finally { finish(); }
  };

  const readActors = () => readDomain("actors.directory", () => {
    const user = game.user;
    return Object.freeze(visibleActors(user, getSystemIntegration()).map(projectDirectoryActor));
  });

  const patchActors = (previous, actorIds) => readDomain("actors.incremental", () => {
    const user = game.user;
    const records = new Map((previous ?? []).map((actor) => [String(actor.id), actor]));
    for (const actorId of actorIds) {
      const actor = game.actors?.get?.(actorId) ?? Array.from(game.actors ?? []).find((entry) => String(entry?.id ?? "") === actorId);
      if (actorEligible(actor, user)) records.set(actorId, projectDirectoryActor(actor));
      else records.delete(actorId);
    }
    return Object.freeze([...records.values()].sort((left, right) => Number(right.id === user?.character?.id) - Number(left.id === user?.character?.id) || left.name.localeCompare(right.name)));
  });

  const preferredActorId = (actors) => actors.some((actor) => actor.id === game.user?.character?.id)
    ? game.user.character.id
    : "";

  const preferredActorSourceUuid = (actors) => {
    const preferredId = preferredActorId(actors);
    return actors.find((actor) => actor.id === preferredId)?.sourceUuid ?? "";
  };

  const resolveSelectedActor = (actors, user) => {
    let actor = selectedActorSourceUuid ? resolveActorSource(selectedActorSourceUuid) : null;
    if (!actorEligible(actor, user)) {
      selectedActorSourceUuid = preferredActorSourceUuid(actors);
      actor = selectedActorSourceUuid ? resolveActorSource(selectedActorSourceUuid) : null;
    }
    return actor && actorEligible(actor, user) ? projectSelectedActor(actor, user) : null;
  };

  const read = () => {
    count("authoritative.read.full");
    count("snapshot.build.full");
    const finish = performanceObserver?.start?.("snapshot.build.full") ?? (() => {});
    try {
      const user = game.user;
      const actors = readActors();
      if (!selectedActorSourceUuid) selectedActorSourceUuid = preferredActorSourceUuid(actors);
      const selectedActor = resolveSelectedActor(actors, user);
      const combat = readDomain("combat", () => Object.freeze({
        combat: combatForSnapshot(),
        controls: combatControlsForSnapshot()
      }));
      return Object.freeze({
        capturedAt: new Date().toISOString(),
        world: readDomain("world", () => ({
          id: game.world?.id ?? "",
          title: game.world?.title ?? game.world?.id ?? localizeFoundry("MIKELANDIA_CONTROLS.Interface.SessionGateway.FoundryWorld", "Foundry World"),
          systemId: game.system?.id ?? "",
          systemVersion: game.system?.version ?? ""
        })),
        user: readDomain("user", () => ({
          id: user?.id ?? "",
          name: user?.name ?? "Player",
          isGM: Boolean(user?.isGM)
        })),
        preferredActorId: preferredActorId(actors),
        preferredActorSourceUuid: preferredActorSourceUuid(actors),
        actors,
        party: readParty(getSystemIntegration(), game.actors, user),
        selectedActorSourceUuid,
        selectedActor,

        combat: combat.combat,
        combatControls: combat.controls,
        journals: readDomain("journals", () => Object.freeze(visibleJournals(user).map(journalRecord))),
        chat: readDomain("chat", () => Object.freeze(visibleMessages().slice(-30).map(chatRecord)))
      });
    } finally {
      finish();
    }
  };

  const readIncremental = (domains, actorIds, fullActorRead, refreshSelectedActor) => {
    if (!latestSnapshot) return read();
    count("snapshot.build.incremental");
    const finish = performanceObserver?.start?.("snapshot.build.incremental") ?? (() => {});
    try {
      const next = { ...latestSnapshot, capturedAt: new Date().toISOString() };
      if (domains.has("actors")) {
        next.party = readParty(getSystemIntegration(), game.actors, game.user);
        next.actors = fullActorRead ? readActors() : actorIds.size ? patchActors(latestSnapshot.actors, actorIds) : latestSnapshot.actors;
        next.preferredActorId = preferredActorId(next.actors);
        next.preferredActorSourceUuid = preferredActorSourceUuid(next.actors);

        const currentStillValid = selectedActorSourceUuid && resolveActorSource(selectedActorSourceUuid);
        if (refreshSelectedActor || !currentStillValid) {
          next.selectedActor = resolveSelectedActor(next.actors, game.user);
          next.selectedActorSourceUuid = selectedActorSourceUuid;
        }
      }
      if (domains.has("user")) next.user = readDomain("user", () => ({ id: game.user?.id ?? "", name: game.user?.name ?? "Player", isGM: Boolean(game.user?.isGM) }));

      if (domains.has("combat")) {
        const combat = readDomain("combat", () => Object.freeze({
          combat: combatForSnapshot(),
          controls: combatControlsForSnapshot()
        }));
        next.combat = combat.combat;
        next.combatControls = combat.controls;
      }
      if (domains.has("journals")) next.journals = readDomain("journals", () => Object.freeze(visibleJournals(game.user).map(journalRecord)));
      if (domains.has("chat")) next.chat = readDomain("chat", () => Object.freeze(visibleMessages().slice(-30).map(chatRecord)));

      return Object.freeze(next);
    } finally {
      finish();
    }
  };

  return Object.freeze({
    read,
    adopt(snapshot) {
      if (!snapshot) return;
      latestSnapshot = snapshot;
      selectedActorSourceUuid = String(snapshot.selectedActorSourceUuid ?? snapshot.selectedActor?.sourceUuid ?? selectedActorSourceUuid);
      latestDomainSignatures = snapshotDomainSignatures(snapshot);
    },
    selectCharacterSource(sourceUuid, expectedSession = {}) {
      assertSession(expectedSession);
      const uuid = validSourceUuid(sourceUuid);
      const actor = resolveActorSource(uuid);
      if (!actor || !actorEligible(actor, game.user)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.SessionGateway.ThisActorIsNoLongerAvailable", "This actor is no longer available."));
      selectedActorSourceUuid = uuid;
      if (!latestSnapshot) return read();
      const snapshot = Object.freeze({
        ...latestSnapshot,
        capturedAt: new Date().toISOString(),
        selectedActorSourceUuid,
        selectedActor: projectSelectedActor(actor, game.user)
      });
      latestSnapshot = snapshot;
      latestDomainSignatures = snapshotDomainSignatures(snapshot);
      return snapshot;
    },
    selectReferencedCharacterSource({ originSourceUuid, targetSourceUuid }, expectedSession = {}) {
      assertSession(expectedSession);
      const origin = resolveActorSource(validSourceUuid(originSourceUuid));
      const target = validSourceUuid(targetSourceUuid);
      if (selectedActorSourceUuid !== originSourceUuid || !origin || !actorEligible(origin, game.user)
        || !getSystemIntegration().referenceSources(origin).includes(target)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.SessionGateway.ThisReferenceIsNoLongerAvailable", "This reference is no longer available."));
      return this.selectCharacterSource(target, expectedSession);
    },

    watch(scope, onSnapshot, onError, { onJournalChange = () => {}, onJournalSearchChange = () => {} } = {}) {
      const generation = ++watchGeneration;
      const queueRefresh = (invalidation) => {

        for (const domain of invalidation.domains) {
          pendingDomains.add(domain);
          count(`invalidation.domain.${domain}`);
          count(`invalidation.event.${invalidation.hook}.${domain}`);
        }
        if (invalidation.directoryActorId) pendingDirectoryActorIds.add(invalidation.directoryActorId);
        if (invalidation.fullDirectoryRead) pendingFullDirectoryRead = true;
        if (invalidation.refreshSelectedActor) pendingSelectedActorRead = true;
        if (invalidation.sourceUuid && invalidation.sourceUuid === selectedActorSourceUuid) pendingSelectedActorRead = true;
        if (invalidation.sourceUuid && selectedReferenceSources.has(invalidation.sourceUuid)) pendingSelectedActorRead = true;
        if (invalidation.referenceTokenPrefix && [...selectedReferenceSources].some(uuid => uuid.startsWith(invalidation.referenceTokenPrefix))) pendingSelectedActorRead = true;
        if (invalidation.relatedActorId && invalidation.relatedActorId === String(latestSnapshot?.selectedActor?.id ?? "")) pendingSelectedActorRead = true;
        if (refreshQueued) {
          count("hook.coalesced");
          return;
        }
        refreshQueued = true;
        queueMicrotask(() => {
          if (generation !== watchGeneration) return;
          refreshQueued = false;
          try {
            const domains = new Set(pendingDomains);
            const actorIds = new Set(pendingDirectoryActorIds);
            const fullActorRead = pendingFullDirectoryRead;
            const refreshSelectedActor = pendingSelectedActorRead;
            pendingDomains.clear();
            pendingDirectoryActorIds.clear();
            pendingFullDirectoryRead = false;
            pendingSelectedActorRead = false;
            const snapshot = readIncremental(domains, actorIds, fullActorRead, refreshSelectedActor);
            const changedDomains = new Set();
            for (const domain of domains) {
              count(`snapshot.signature.${domain}`);

              if (snapshotDomainSignature(snapshot, domain) !== latestDomainSignatures[domain]) changedDomains.add(domain);
            }
            if (!changedDomains.size) {
              count("snapshot.deduplicated");
              return;
            }
            const published = { ...snapshot };
            for (const domain of domains) {
              const key = domain;
              if (!changedDomains.has(key)) published[key] = latestSnapshot[key];
            }
            if (domains.has("actors") && !changedDomains.has("actors")) published.preferredActorId = latestSnapshot.preferredActorId;
            latestSnapshot = Object.freeze(published);
            latestDomainSignatures = Object.freeze({
              ...latestDomainSignatures,
              ...Object.fromEntries([...changedDomains].map((domain) => [domain, snapshotDomainSignature(latestSnapshot, domain)]))
            });
            count("snapshot.publish");
            onSnapshot(latestSnapshot);
          } catch (error) {
            onError(error);
          }
        });
      };
      scope.own?.(() => {
        if (watchGeneration !== generation) return;
        watchGeneration += 1;
        refreshQueued = false;
        pendingDomains.clear();
        pendingDirectoryActorIds.clear();
        pendingFullDirectoryRead = false;
        pendingSelectedActorRead = false;
      });

      for (const hook of [...Object.keys(SESSION_INVALIDATION_MAP), "updateToken", "updateSetting"]) {
        scope.hook(hook, (...args) => {
          count(`hook.received.${hook}`);
          if (["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage", "updateJournalEntry"].includes(hook)) {
            const entry = hook.endsWith("Page") ? args[0]?.parent : args[0];
            if (entry?.id) onJournalChange(String(entry.id));
          }

          const invalidation = sessionInvalidationForHook(hook, args[0], args[1], getSystemIntegration());
          if (!invalidation.domains.length) {
            count("hook.ignored");
            return;
          }
          if (invalidation.domains.includes("journals")) onJournalSearchChange();
          queueRefresh(invalidation);
        });
      }

      getSystemIntegration().watchActorProfile?.(scope, sourceUuid => {
        if (generation !== watchGeneration || sourceUuid !== selectedActorSourceUuid) return;
        queueRefresh({ hook: "profileReady", domains: ["actors"], sourceUuid });
      });

      // Hooks are owned before the baseline read. A hook raised during this
      // synchronous projection is coalesced into the following microtask.
      latestSnapshot = read();
      latestDomainSignatures = snapshotDomainSignatures(latestSnapshot);
      return latestSnapshot;
    },
    async readJournalSearchIndex(expectedSession = {}) {
      assertSession(expectedSession);
      const session = { worldId: game.world.id, userId: game.user.id };
      const capturedGame = game;
      const capturedUser = game.user;
      const captures = [];
      const records = [];
      for (const journal of visibleJournals(capturedUser)) {
        const record = journalRecord(journal);
        const pages = [];
        const visiblePages = Array.from(journal.pages ?? []).filter(page => isJournalPageVisible(page, journal, capturedUser))
          .sort((left, right) => (Number(left.sort) || 0) - (Number(right.sort) || 0) || String(left.name ?? "").localeCompare(String(right.name ?? "")));
        const capture = { journal, metadata: JSON.stringify(record), pages: [] };
        captures.push(capture);
        for (const page of visiblePages) {
          const type = String(page.type ?? "text");
          const format = type === "text" ? journalTextFormat(page) : null;
          const source = type === "text" ? journalTextSource(page, format) : "";
          const secrets = Boolean(page.isOwner ?? journal.isOwner);
          capture.pages.push({ page, type, format, source, secrets, sort: Number(page.sort) || 0 });
          const text = type === "text" ? await journalSearchText(page, { secrets }) : "";
          pages.push(Object.freeze({ id: String(page.id ?? ""), name: String(page.name ?? ""), type, text: String(text) }));
        }
        records.push(Object.freeze({ ...record, pages: Object.freeze(pages) }));
      }
      assertSession(expectedSession);
      assertSession(session);
      if (game !== capturedGame || game.user !== capturedUser) throw new Error("The Foundry session changed while searching Journals.");
      const currentJournals = visibleJournals(capturedUser);
      if (currentJournals.length !== captures.length || currentJournals.some((entry, index) => entry !== captures[index].journal)) {
        throw new Error("Journals changed while searching. Try again.");
      }
      for (const { journal, metadata, pages } of captures) {
        if (game.journal?.get?.(journal.id) !== journal || !isJournalVisible(journal, capturedUser)
          || JSON.stringify(journalRecord(journal)) !== metadata) throw new Error("Journals changed while searching. Try again.");
        for (const { page, type, format, source, secrets, sort } of pages) {
          if (journal.pages?.get?.(page.id) !== page || !isJournalPageVisible(page, journal, capturedUser)
            || String(page.type ?? "text") !== type || Boolean(page.isOwner ?? journal.isOwner) !== secrets || (Number(page.sort) || 0) !== sort
            || (type === "text" && (journalTextFormat(page) !== format || journalTextSource(page, format) !== source))) {
            throw new Error("Journal text changed while searching. Try again.");
          }
        }
      }
      return Object.freeze(records);
    },
    async readJournal(journalId, expectedSession = {}) {
      assertSession(expectedSession);
      const id = identifier(journalId, "journalId");
      const journal = game.journal?.get?.(id) ?? Array.from(game.journal ?? []).find((entry) => String(entry.id ?? "") === id);
      if (!isJournalVisible(journal, game.user)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.SessionGateway.ThisJournalIsNoLongerAvailable", "This journal is no longer available."));
      const pages = [];
      const pageDocuments = new Map();
      for (const page of Array.from(journal.pages ?? []).filter((entry) => isJournalPageVisible(entry, journal, game.user))) {
        pageDocuments.set(String(page.id ?? ""), page);
        const type = String(page.type ?? "text");
        const record = {
          id: String(page.id ?? ""),
          name: String(page.name ?? localizeFoundry("MIKELANDIA_CONTROLS.Journals.UntitledPage", "Untitled page")),
          type,
          sort: Number(page.sort) || 0,
          level: Number(page.title?.level) || 1,
          src: String(page.src ?? ""),
          caption: String(page.image?.caption ?? "")
        };
        if (type === "text") record.toc = Object.freeze(Object.values(page.toc ?? {}).map((heading) => Object.freeze({
          text: String(heading.text ?? ""), slug: String(heading.slug ?? ""),
          level: Number(heading.level) || 1, order: Number(heading.order) || 0
        })).sort((left, right) => left.order - right.order));
        if (type === "text") record.html = await enrichJournalHtml(page, journal);
        record.canEdit = canOwn(page, game.user);
        pages.push(Object.freeze(record));
      }
      assertSession(expectedSession);
      if (game.journal?.get?.(id) !== journal || !isJournalVisible(journal, game.user)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.SessionGateway.ThisJournalIsNoLongerAvailable", "This journal is no longer available."));
      const currentPages = pages.filter((record) => {
        const current = journal.pages?.get?.(record.id) ?? Array.from(journal.pages ?? []).find((entry) => entry.id === record.id);
        return current === pageDocuments.get(record.id) && isJournalPageVisible(current, journal, game.user);
      });
      currentPages.sort((left, right) => left.sort - right.sort || left.name.localeCompare(right.name));
      return Object.freeze({ id, name: String(journal.name ?? "Journal"), img: String(journal.img ?? ""),
        canEdit: canOwn(journal, game.user), pages: Object.freeze(currentPages) });
    },
    async readJournalText(journalId, pageId, expectedSession = {}) {
      assertSession(expectedSession);
      const { page } = requireEditableJournalText(journalId, pageId);
      const format = journalTextFormat(page);
      const value = journalTextSource(page, format);
      return Object.freeze({ value, originalValue: value, format });
    },
    async saveJournalText(payload, expectedSession = {}) {
      assertSession(expectedSession);
      if (!payload || Object.keys(payload).some(key => !["journalId", "pageId", "value", "originalValue", "format"].includes(key))
        || typeof payload.value !== "string" || typeof payload.originalValue !== "string"
        || payload.value.length > 100000 || payload.originalValue.length > 100000 || ![1, 2].includes(payload.format)) {
        throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Journals.InvalidEdit", "Invalid Journal text request."));
      }
      const { journal, page } = requireEditableJournalText(payload.journalId, payload.pageId);
      if (pendingJournalWrites.has(page)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Journals.SavePending", "This Journal page is already being saved."));
      if (journalTextFormat(page) !== payload.format || journalTextSource(page, payload.format) !== payload.originalValue) {
        throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Journals.TextChanged", "Journal text changed while being edited. Reopen the editor and try again."));
      }
      const changed = payload.value !== payload.originalValue;
      pendingJournalWrites.add(page);
      try {
        if (changed) await page.update({ [payload.format === 2 ? "text.markdown" : "text.content"]: payload.value });
        assertSession(expectedSession);
        const current = requireEditableJournalText(payload.journalId, payload.pageId);
        if (current.journal !== journal || current.page !== page) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Journals.DocumentChanged", "This Journal page is no longer available."));
        return Object.freeze({ changed });
      } finally {
        pendingJournalWrites.delete(page);
      }
    },
    async openNativeJournalEditor(journalId, pageId = "", expectedSession = {}) {
      assertSession(expectedSession);
      const id = identifier(journalId, "journalId");
      const journal = game.journal?.get?.(id);
      if (!isJournalVisible(journal, game.user) || !canOwn(journal, game.user)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.SessionGateway.YouCannotEditThisJournal", "You cannot edit this Journal."));
      const page = pageId ? journal.pages?.get?.(identifier(pageId, "pageId")) : null;
      if (pageId && (!isJournalPageVisible(page, journal, game.user) || !canOwn(page, game.user))) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.SessionGateway.YouCannotEditThisJournalPage", "You cannot edit this Journal page."));
      // Foundry v13's own JournalEntrySheet opens text and image editors from
      // page.sheet. Other page types use the native parent at the current page.
      const sheet = page && ["text", "image"].includes(String(page.type)) && typeof page.sheet?.render === "function"
        ? page.sheet : journal.sheet;
      if (typeof sheet?.render !== "function") throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.SessionGateway.TheNativeJournalEditorIsUnavailable", "The native Journal editor is unavailable."));
      ownMobileApplication(sheet);
      // Foundry 13.351's JournalEntrySheet is ApplicationV2, while its text
      // and image JournalPageSheet editors still use ApplicationV1.render.
      if (sheet.isV2 === false) await Promise.resolve(sheet.render(true, { mcNativeEdit: true }));
      else await Promise.resolve(sheet.render({ force: true, mcNativeEdit: true,
        ...(sheet === journal.sheet && page ? { pageId: page.id } : {}) }));
      assertSession(expectedSession);
      return Object.freeze({ opened: true });
    },
    async sendChat(content, sourceUuid = "") {
      const text = String(content ?? "").trim();
      if (!text || text.length > 5000) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.SessionGateway.ChatMessagesMustContainBetweenAndCharacters", "Chat messages must contain between 1 and 5,000 characters."));
      const actor = sourceUuid ? resolveActorSource(sourceUuid) : null;
      if (sourceUuid && (!actor || !actorEligible(actor, game.user))) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.SessionGateway.ThisActorIsNoLongerAvailable", "This actor is no longer available."));
      const speaker = actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker({ user: game.user });
      return ChatMessage.create({ content: text, speaker, user: game.user.id });
    }
  });
}

export function sessionInvalidationForHook(hook, document, changes = {}, integration = resolveSystemIntegration(globalThis.game?.system?.id)) {
  if (hook === "updateUser") return Object.freeze({ hook, domains: SESSION_INVALIDATION_MAP.updateUser, fullDirectoryRead: true, refreshSelectedActor: true });
  if (hook === "updateActor") {
    const fields = changedPaths(changes);
    const directoryChanged = !document?.isToken && (fields.length === 0 || fields.some((field) => /^(?:name|img|type|folder|ownership|system\.details\.(?:level|cr|type)|system\.traits\.size)(?:\.|$)/u.test(field)));
    const combatChanged = fields.length === 0 || fields.some(field => /^(?:name|img|ownership)(?:\.|$)/u.test(field))
      || combatHealthChanged(integration, fields);
    const sourceUuid = actorSourceUuid(document);
    const directoryActorId = directoryChanged ? String(document?.id ?? "") : "";
    return Object.freeze({
      hook,
      domains: Object.freeze(["actors", ...(combatChanged ? ["combat"] : [])]),
      sourceUuid,
      relatedActorId: document?.isToken ? "" : String(document?.id ?? ""),
      ...(directoryActorId ? { directoryActorId } : {})
    });
  }
  if (hook === "updateToken") {
    const fields = changedPaths(changes);
    const geometryOnly = fields.length > 0 && fields.every((field) => TOKEN_GEOMETRY_FIELDS.has(field));
    const sourceUuid = actorSourceUuid(document?.actor);
    const tokenActorChanged = fields.includes("actorId") || fields.includes("actorLink");
    return Object.freeze({
      hook, domains: geometryOnly ? Object.freeze([]) : Object.freeze(["actors", "combat"]), sourceUuid,
      ...(tokenActorChanged ? { referenceTokenPrefix: `Scene.${document?.parent?.id}.Token.${document?.id}.Actor.`, tokenActorChanged: true, tokenId: String(document?.id ?? ""), sceneId: String(document?.parent?.id ?? "") } : {})
    });
  }
  if (hook === "updateSetting") {
    const key = String(document?.key ?? document?.id ?? "");
    const namespace = String(document?.namespace ?? "");
    const fullKey = key.includes(".") ? key : namespace && key ? `${namespace}.${key}` : key;
    if (fullKey === "calendaria.devMode") return Object.freeze({ hook, domains: Object.freeze(["journals"]) });
    const contribution = integration.settingInvalidation?.(fullKey);
    if (contribution) return Object.freeze({ hook, ...contribution, domains: Object.freeze([...contribution.domains]) });
    const domains = [].includes(fullKey) ? Object.freeze([])
      : Object.freeze([]);
    return Object.freeze({ hook, domains });
  }
  const configuredDomains = SESSION_INVALIDATION_MAP[hook] ?? Object.freeze([]);
  const refreshSelectedActor = integration.refreshSelectedActorForHook?.(hook) === true;
  const actor = hook === "deleteToken" ? document?.actor : actorForHook(hook, document);
  const sourceUuid = actorSourceUuid(actor);
  const worldActor = actor && !actor.isToken;
  const directoryItemChanged = ["createItem", "updateItem", "deleteItem"].includes(hook) && integration.itemChangesDirectory?.(document) === true;
  const directoryActorId = worldActor && (["createActor", "deleteActor"].includes(hook) || directoryItemChanged) ? String(actor.id ?? "") : "";

  const validatesSelectedSource = ["canvasReady", "canvasTearDown", "deleteScene", "deleteToken"].includes(hook);
  const replacementTokenUuid = hook === "deleteToken" ? String(changes?.replacements?.[document?.id] ?? "") : "";
  const domains = Object.freeze([...new Set([
    ...configuredDomains,
    ...(sourceUuid || validatesSelectedSource || refreshSelectedActor ? ["actors"] : [])
  ])]);
  const fullDirectoryRead = hook === "createActor" || hook === "deleteActor" ? false : configuredDomains.includes("actors") && !sourceUuid && !validatesSelectedSource;
  return Object.freeze({
    hook,
    domains,
    sourceUuid,
    ...(refreshSelectedActor ? { refreshSelectedActor: true } : {}),
    ...(worldActor ? { relatedActorId: String(actor.id ?? "") } : {}),
    ...(directoryActorId ? { directoryActorId } : {}),
    ...(fullDirectoryRead ? { fullDirectoryRead: true } : {}),
    ...(hook === "deleteToken" ? { referenceTokenPrefix: `Scene.${document?.parent?.id}.Token.${document?.id}.Actor.`, refreshSelectedActor: true } : {}),
    ...(replacementTokenUuid ? { replacementTokenUuid, tokenId: String(document?.id ?? ""), sceneId: String(document?.parent?.id ?? "") } : {}),
  });
}

function actorForHook(hook, document) {
  if (!["createActor", "updateActor", "deleteActor", "createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"].includes(hook)) return "";
  if (["createActor", "updateActor", "deleteActor"].includes(hook)) return document ?? null;
  let parent = document?.parent ?? document?.actor ?? null;
  for (let depth = 0; parent && depth < 3; depth += 1) {
    if (["character", "npc"].includes(parent.type) || parent.documentName === "Actor") return parent;
    if (parent.actor?.id) return parent.actor;
    parent = parent.parent ?? null;
  }
  return null;
}

function changedPaths(changes, prefix = "") {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return prefix ? [prefix] : [];
  const paths = [];
  for (const [key, value] of Object.entries(changes)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length) paths.push(...changedPaths(value, path));
    else paths.push(path);
  }
  return paths;
}

function snapshotDomainSignatures(snapshot) {
  return Object.freeze(Object.fromEntries(["actors", "combat", "journals", "chat", "world", "user"]
    .map((domain) => [domain, snapshotDomainSignature(snapshot, domain)])));
}

function snapshotDomainSignature(snapshot, domain) {
  if (domain === "actors") return JSON.stringify({
    preferredActorSourceUuid: snapshot?.preferredActorSourceUuid ?? "",
    actors: snapshot?.actors ?? [],
    party: snapshot?.party ?? null,
    selectedActorSourceUuid: snapshot?.selectedActorSourceUuid ?? "",
    selectedActor: snapshot?.selectedActor ?? null
  });
  return JSON.stringify(snapshot?.[domain] ?? null);
}

function visibleActors(user, integration) {
  return Array.from(game.actors ?? [])
    .filter((actor) => isActorEligible(actor, user, integration))
    .sort((a, b) => Number(b.id === user?.character?.id) - Number(a.id === user?.character?.id) || a.name.localeCompare(b.name));
}

/** The one eligibility policy shared by full and incremental Actor discovery. */
export function isActorEligible(actor, user, integration = resolveSystemIntegration(globalThis.game?.system?.id)) {
  return integration.isActorEligible(actor, user);
}

function visibleJournals(user) {
  return Array.from(game.journal ?? [])
    .filter((journal) => isJournalVisible(journal, user))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function visibleMessages() {
  return Array.from(game.messages ?? []).filter((message) => message.visible !== false);
}

function canOwn(document, user) {
  try {
    return document.testUserPermission?.(user, "OWNER") ?? false;
  } catch {
    return false;
  }
}

function journalRecord(journal) {
  return {
    id: String(journal.id ?? ""),
    name: String(journal.name ?? "Journal"),
    img: String(journal.img ?? ""),
    sort: Number(journal.sort) || 0,
    rootSorting: sortingMode(game.journal?.sortingMode),
    folderPath: journalFolderPath(journal),
    pages: Array.from(journal.pages ?? [])
      .filter((page) => isJournalPageVisible(page, journal, game.user))
      .map((page) => ({ id: page.id, name: page.name, type: page.type }))
  };
}

function journalFolderPath(journal) {
  const folders = [];
  const seen = new Set();
  let folder = journal.folder ?? null;
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    folders.unshift({
      id: String(folder.id ?? ""),
      name: String(folder.name ?? "Folder"),
      sort: Number(folder.sort) || 0,
      sorting: sortingMode(folder.sorting)
    });
    folder = folder.folder ?? folder.parent ?? null;
  }
  return folders;
}

function sortingMode(value) {
  return value === "a" ? "a" : "m";
}

async function enrichJournalHtml(page, journal) {
  const editor = globalThis.CONFIG?.ux?.TextEditor ?? globalThis.TextEditor?.implementation ?? globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
  const format = journalTextFormat(page);
  const source = journalTextSource(page, format);
  let content = source;
  if (format === 2) {
    // Reuse the converter configured by Foundry's native text page sheet.
    const converter = globalThis.foundry?.applications?.sheets?.journal?.JournalEntryPageTextSheet?._converter
      ?? page.sheet?.constructor?._converter ?? globalThis.TextPageSheet?._converter;
    if (typeof converter?.makeHtml !== "function") throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Journals.MarkdownUnavailable", "Foundry Markdown rendering is unavailable."));
    const cleanHTML = globalThis.foundry?.utils?.cleanHTML;
    if (typeof cleanHTML !== "function") throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Journals.MarkdownCleaningUnavailable", "Foundry Markdown HTML cleaning is unavailable."));
    // Markdown is a StringField, so embedded raw HTML has not passed HTMLField cleaning.
    content = String(cleanHTML(String(converter.makeHtml(source))));
  }
  if (typeof editor?.enrichHTML !== "function") return `<p>${escapeHtml(content)}</p>`;
  const html = String(await editor.enrichHTML(content, {
    async: true,
    documents: true,
    links: true,
    rolls: false,
    secrets: Boolean(page.isOwner ?? journal.isOwner),
    relativeTo: page
  }));
  if (journalTextFormat(page) !== format || journalTextSource(page, format) !== source) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Journals.TextChanged", "Journal text changed while being loaded. Reopen the Journal and try again."));
  return html;
}

function journalTextFormat(page) {
  const format = page.text?.format ?? 1;
  if (![1, 2].includes(format)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Journals.UnsupportedFormat", "This Journal text format is unavailable."));
  return format;
}

function journalTextSource(page, format) {
  return String((format === 2 ? page.text?.markdown : page.text?.content) ?? "");
}

function requireEditableJournalText(journalId, pageId) {
  const journal = game.journal?.get?.(identifier(journalId, "journalId"));
  if (!isJournalVisible(journal, game.user) || !canOwn(journal, game.user)) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.SessionGateway.YouCannotEditThisJournal", "You cannot edit this Journal."));
  const page = journal.pages?.get?.(identifier(pageId, "pageId"));
  if (!isJournalPageVisible(page, journal, game.user) || !canOwn(page, game.user)
    || page.type !== "text" || typeof page.update !== "function") throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.SessionGateway.YouCannotEditThisJournalPage", "You cannot edit this Journal page."));
  return { journal, page };
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function assertSession(expected) {
  if (!game?.user || !game?.world) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.CombatGateway.TheFoundrySessionIsNotReady", "The Foundry session is not ready."));
  if (expected.worldId && expected.worldId !== game.world.id) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.CombatGateway.TheActiveFoundryWorldHasChanged", "The active Foundry world has changed."));
  if (expected.userId && expected.userId !== game.user.id) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.CombatGateway.TheActiveFoundryUserHasChanged", "The active Foundry user has changed."));
}

function identifier(value, field) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 128) throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Interface.CharacterSource.IsRequired", "{field} is required.", { field: (field) }));
  return id;
}

function chatRecord(message) {
  const source = message._source ?? message;
  return {
    id: message.id,
    speaker: message.alias ?? message.speaker?.alias ?? message.author?.name ?? "Unknown",
    content: plainText(source.content ?? ""),
    timestamp: Number(source.timestamp ?? Date.now()),
    isRoll: Boolean(message.isRoll || message.rolls?.length)
  };
}

function plainText(html) {
  const holder = document.createElement("div");
  holder.innerHTML = String(html ?? "");
  return holder.textContent?.trim() ?? "";
}
