import {
  createOfflineStorage,
  libraryIdentity,
  OFFLINE_VERSION,
} from "./storage.mjs";
import {
  actorDocument,
  offlineHtml,
  offlineImageUrls,
  pruneLibrary,
  safeUrl,
} from "./content.mjs";
import { createFoundryDescriptionGateway } from "../foundry/actors/description-gateway.mjs";
import { SESSION_INVALIDATION_MAP } from "../foundry/session/session-gateway.mjs";
import { prepareOfflineReader } from "./assets.mjs";

/** Authenticated projection only. No offline command path exists. */
export function createOfflineController({
  session,
  biographyGateway,
  getGame = () => globalThis.game,
  base = new URL(
    "./",
    globalThis.location.href.replace(/\/game(?:[/?#].*)?$/, "/"),
  ).href,
  isConnected = () => getGame()?.socket?.connected === true,
  storage = null,
  descriptions = createFoundryDescriptionGateway(),
  fetch = globalThis.fetch,
  prepareReader = prepareOfflineReader,
  getPreferences = () => ({}),
  getTargeting = () => null,
} = {}) {
  let revision = 0,
    timer,
    owner,
    running = false,
    pending = false,
    channel,
    current = {
      available: true,
      enabled: false,
      message: "Not saved on this device.",
    };
  storage ??= createOfflineStorage({
    onChange: () => channel?.postMessage({ type: "data" }),
  });
  const listeners = new Set();
  const publish = (patch) => {
    current = { ...current, ...patch };
    for (const listener of listeners) listener(current);
  };
  const identity = () => {
    const game = getGame();
    if (!game?.user || game.user.isGM) return null;
    return libraryIdentity(
      base,
      {
        id: game.world.id,
        title: game.world.title ?? game.world.id,
        systemId: game.system.id,
        systemVersion: game.system.version ?? "",
      },
      { id: game.user.id, name: game.user.name },
    );
  };
  const schedule = () => {
    if (!owner || owner.disposed) return;
    revision++;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void save();
    }, 500);
  };
  const save = async () => {
    if (running || owner?.disposed || !isConnected()) return;
    pending = false;
    running = true;
    const ticket = revision,
      meta = identity(),
      startedAt = Date.now();
    const assertCurrent = () => {
      if (
        owner?.disposed ||
        ticket !== revision ||
        !isConnected() ||
        identity()?.id !== meta?.id
      )
        throw new Error("Saving paused while the game changes.");
    };
    try {
      if (!meta) {
        publish({
          available: false,
          enabled: false,
          message: "Offline saving is available to players only.",
        });
        return;
      }
      const record = await storage.get(meta.id);
      assertCurrent();
      publish({
        enabled: Boolean(record?.enabled),
        available: true,
        savedAt: record?.data?.savedAt ?? null,
      });
      if (!record?.enabled) return;
      const manifest = session.read();
      const actorRecords = new Map(),
        actorStamps = new Map(),
        journalStamps = new Map();
      for (const entry of manifest.actors) {
        assertCurrent();
        try {
          const actor = session.readOfflineActor(entry.sourceUuid);
          actorRecords.set(entry.sourceUuid, actor);
          actorStamps.set(entry.sourceUuid, await fingerprint(actor));
        } catch {
          assertCurrent();
        }
      }
      for (const entry of manifest.journals) {
        assertCurrent();
        try {
          journalStamps.set(
            entry.id,
            await session.readOfflineJournalStamp(entry.id, {
              worldId: meta.world.id,
              userId: meta.user.id,
            }),
          );
        } catch {
          assertCurrent();
        }
      }
      // Reconcile before enrichment/network work, so failed refreshes cannot keep
      // characters or Journal pages whose access has already been revoked.
      const pruned =
        record.version === OFFLINE_VERSION
          ? pruneLibrary(
              record.data,
              manifest,
              actorStamps,
              journalStamps,
              base,
            )
          : null;
      if (pruned) {
        assertCurrent();
        if (
          !(await storage.save(
            meta.id,
            record.token,
            { ...pruned, startedAt },
            meta,
          ))
        )
          return;
      }
      const data = {
        startedAt,
        savedAt: null,
        actors: [],
        journals: [],
        party: null,
        references: [],
        media: [],
        incomplete: false,
        warnings: [],
        world: manifest.world ?? meta.world,
        user: manifest.user ?? meta.user,
        preferences: getPreferences(),
        locale: getGame().i18n?.lang ?? "en",
        translations: getGame().i18n?.translations ?? {},
        fallbackTranslations: getGame().i18n?._fallback ?? {},
        combat: manifest.combat ?? null,
        targeting: getTargeting(),
        selectedActorSourceUuid: manifest.selectedActorSourceUuid ?? "",
      };
      const references = new Map();
      const html = (
        source,
        relativeUuid,
        collect = true,
        keepSecrets = false,
      ) => {
        const result = offlineHtml(source, { base, keepSecrets });
        const template = document.createElement("template");
        template.innerHTML = result;
        for (const link of template.content.querySelectorAll(
          "a.content-link[data-uuid]",
        )) {
          const uuid = link.dataset.uuid,
            key = JSON.stringify([uuid, relativeUuid]);
          if (collect) references.set(key, { uuid, relativeUuid });
        }
        return template.innerHTML;
      };
      const enrich = async (uuid, content, { fragment = false } = {}) => {
        assertCurrent();
        try {
          const result = await descriptions.enrich({
            uuid,
            content,
            fragment,
            readOnly: true,
          });
          assertCurrent();
          return result.html;
        } catch (error) {
          assertCurrent();
          data.incomplete = true;
          return "Description unavailable offline.";
        }
      };
      for (let index = 0; index < manifest.actors.length; index++) {
        assertCurrent();
        publish({
          message: `Saving characters ${index + 1} / ${manifest.actors.length}…`,
        });
        const entry = manifest.actors[index];
        try {
          const actor = actorRecords.get(entry.sourceUuid);
          if (!actor || !actorStamps.has(entry.sourceUuid))
            throw new Error("Character access could not be checked.");
          const saved = await actorDocument(actor, {
            html: (source, relativeUuid) => html(source, relativeUuid),
            enrich,
            image: (source) => safeUrl(source, base),
          });
          saved.access = actorStamps.get(entry.sourceUuid);
          if (actor.notesAvailable || (actor.biography && biographyGateway)) {
            const notes = await biographyGateway.read(
              { actorSourceUuid: actor.sourceUuid, readOnly: true },
              { worldId: meta.world.id, userId: meta.user.id },
            );
            saved.notesHtml = html(
              notes.html,
              actor.sourceUuid,
              true,
              notes.owner === true,
            );
          }
          assertCurrent();
          saved.img = safeUrl(saved.img, base);
          saved.view.img = saved.img;
          data.actors.push(saved);
        } catch (error) {
          assertCurrent();
          data.incomplete = true;
          data.warnings.push(`Could not save ${entry.name}.`);
          const previous = pruned?.actors.find(
            (actor) => actor.id === entry.sourceUuid,
          );
          if (previous) data.actors.push(previous);
        }
      }
      for (let index = 0; index < manifest.journals.length; index++) {
        assertCurrent();
        publish({
          message: `Saving Journals ${index + 1} / ${manifest.journals.length}…`,
        });
        const entry = manifest.journals[index];
        try {
          if (!journalStamps.has(entry.id))
            throw new Error("Journal access could not be checked.");
          const journal = await session.readJournal(entry.id, {
            worldId: meta.world.id,
            userId: meta.user.id,
          });
          assertCurrent();
          data.journals.push({
            ...entry,
            id: journal.id,
            name: journal.name,
            canEdit: false,
            access: journalStamps.get(entry.id),
            pages: journal.pages.map((page) => {
              const uuid = `JournalEntry.${journal.id}.JournalEntryPage.${page.id}`;
              const src = page.type === "image" ? safeUrl(page.src, base) : "";
              return {
                id: page.id,
                sourceUuid: uuid,
                name: page.name,
                type: page.type,
                caption: page.caption,
                src,
                canEdit: false,
                toc: page.toc ?? [],
                level: page.level,
                sort: page.sort,
                html:
                  page.type === "text"
                    ? html(page.html, uuid, true, page.canEdit === true)
                    : "",
              };
            }),
          });
        } catch (error) {
          assertCurrent();
          data.incomplete = true;
          data.warnings.push(`Could not save ${entry.name}.`);
          const previous = pruned?.journals.find(
            (journal) => journal.id === entry.id,
          );
          if (previous) data.journals.push(previous);
        }
      }
      if (manifest.party) {
        data.party = (
          await actorDocument(
            { ...manifest.party, sourceUuid: "" },
            {
              html: (source) => html(source, ""),
              enrich: null,
              image: (source) => safeUrl(source, base),
            },
          )
        ).view;
      }
      for (const [key, target] of references) {
        assertCurrent();
        try {
          const preview = await descriptions.preview({
            ...target,
            readOnly: true,
          });
          assertCurrent();
          data.references.push({
            key,
            id: preview.uuid,
            name: preview.name,
            html: html(preview.html, preview.uuid, false),
          });
        } catch {
          assertCurrent();
          data.incomplete = true;
        }
      }
      // Bounded sequential image downloads avoid exhausting mobile memory. A failed
      // or oversized image is a placeholder, never an implicit network dependency.
      let bytes = 0,
        attempted = 0;
      const images = offlineImageUrls(data, base);
      const previousMedia = new Map(
        (pruned?.media ?? []).map((entry) => [entry.url, entry.blob]),
      );
      for (const url of images) {
        assertCurrent();
        publish({
          message: `Saving images ${++attempted} / ${images.size}…`,
        });
        try {
          const previous = previousMedia.get(url);
          if (previous && bytes + previous.size <= 128 * 1024 * 1024) {
            bytes += previous.size;
            data.media.push({ url, blob: previous });
            continue;
          }
          const abort = new AbortController();
          const timeout = setTimeout(() => abort.abort(), 12000);
          let response, blob;
          try {
            response = await fetch(url, {
              credentials:
                new URL(url).origin === new URL(base).origin
                  ? "same-origin"
                  : "omit",
              signal: abort.signal,
              cache: "no-store",
            });
            if (
              !response.ok ||
              !/^image\/(?:png|jpe?g|webp|gif|avif|bmp|svg\+xml|x-icon|vnd.microsoft.icon)(?:;|$)/i.test(
                response.headers.get("content-type") ?? "",
              ) ||
              Number(response.headers.get("content-length")) > 8 * 1024 * 1024
            )
              throw new Error("Image unavailable.");
            const chunks = [],
              reader = response.body?.getReader();
            let size = 0;
            if (!reader) throw new Error("Image streaming is unavailable.");
            try {
              while (true) {
                const part = await reader.read();
                if (part.done) break;
                size += part.value.byteLength;
                if (size > 8 * 1024 * 1024) {
                  abort.abort();
                  throw new Error("Image exceeds offline size limit.");
                }
                chunks.push(part.value);
              }
            } finally {
              reader.releaseLock();
            }
            blob = new Blob(chunks, {
              type: response.headers.get("content-type").split(";")[0],
            });
            if (blob.type === "image/svg+xml") blob = await safeSvg(blob);
          } finally {
            clearTimeout(timeout);
          }
          assertCurrent();
          if (
            blob.size > 8 * 1024 * 1024 ||
            bytes + blob.size > 128 * 1024 * 1024
          )
            throw new Error("Image storage limit reached.");
          bytes += blob.size;
          data.media.push({ url, blob });
        } catch {
          assertCurrent();
          data.incomplete = true;
        }
      }
      let readerError = "";
      publish({ message: "Preparing offline access…" });
      try {
        await prepareReader({
          base,
          actors: data.actors.map((actor) => actor.view),
          preferences: data.preferences,
        });
      } catch (error) {
        readerError = error?.message || "Offline reader installation failed.";
        data.incomplete = true;
        data.warnings.push(readerError);
      }
      assertCurrent();
      data.savedAt = new Date().toISOString();
      if (await storage.save(meta.id, record.token, data, meta))
        publish({
          enabled: true,
          savedAt: data.savedAt,
          message: readerError
            ? `Content saved, but offline access is not ready: ${readerError}`
            : data.incomplete
              ? "Saved with some content unavailable offline."
              : "Saved. Updates automatically while connected.",
        });
      else
        publish({
          enabled: false,
          message: "Saving was turned off in another tab.",
        });
    } catch (error) {
      publish({ message: error.message || "Could not save offline content." });
    } finally {
      running = false;
      if (pending && !owner?.disposed && isConnected()) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          void save();
        }, 500);
      }
    }
  };
  return Object.freeze({
    refresh: schedule,
    snapshot: () => current,
    watch: (scope, listener) => {
      listeners.add(listener);
      listener(current);
      scope.own(() => listeners.delete(listener));
    },
    async setEnabled(enabled) {
      const meta = identity();
      if (!meta)
        throw new Error("Offline saving is available to players only.");
      revision++;
      if (enabled) {
        if (!isConnected())
          throw new Error("Reconnect to the game before enabling saving.");
        await storage.enable(meta);
        publish({ enabled: true, message: "Preparing your offline library…" });
        // Best-effort request; denial does not prevent ordinary browser storage.
        void globalThis.navigator?.storage?.persist?.().catch(() => {});
        schedule();
      } else {
        await storage.forget(meta.id);
        publish({
          enabled: false,
          savedAt: null,
          message: "Saved copies deleted from this browser.",
        });
      }
      channel?.postMessage({ id: meta.id });
    },
    start(scope) {
      owner = scope;
      if (typeof BroadcastChannel === "function") {
        channel = new BroadcastChannel("mikelandia-offline-preferences");
        channel.onmessage = (event) => {
          if (event.data?.type !== "data") schedule();
        };
        scope.own(() => channel.close());
      }
      for (const hook of [
        ...Object.keys(SESSION_INVALIDATION_MAP).filter(
          (name) => !/ChatMessage|Token/.test(name),
        ),
        "updateSetting",
        "updateCompendium",
        "deleteCompendium",
      ])
        scope.hook(hook, schedule);
      scope.listen(globalThis.window, "online", schedule);
      scope.own(() => {
        revision++;
        clearTimeout(timer);
        listeners.clear();
      });
      schedule();
    },
  });
}

async function fingerprint(value) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function safeSvg(blob) {
  const svg = new DOMParser().parseFromString(
    await blob.text(),
    "image/svg+xml",
  );
  if (
    svg.documentElement.localName !== "svg" ||
    svg.querySelector("parsererror")
  )
    throw new Error("Invalid SVG image.");
  const allowed = new Set(
    "svg g path rect circle ellipse line polyline polygon defs linearGradient radialGradient stop use clipPath mask title desc".split(
      " ",
    ),
  );
  for (const element of [svg.documentElement, ...svg.querySelectorAll("*")]) {
    if (!allowed.has(element.localName)) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      if (
        /^on/iu.test(attribute.localName) ||
        ["style", "xml:base"].includes(attribute.name) ||
        (/href$/iu.test(attribute.name) && !attribute.value.startsWith("#")) ||
        [...attribute.value.matchAll(/url\(\s*['"]?([^\s'"\)]+)/giu)].some(
          (match) => !match[1].startsWith("#"),
        )
      )
        element.removeAttribute(attribute.name);
    }
  }
  return new Blob([new XMLSerializer().serializeToString(svg)], {
    type: "image/svg+xml",
  });
}
