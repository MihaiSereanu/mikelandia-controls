import { isJournalVisible, isJournalPageVisible } from "../journals/journal-visibility.mjs";

/** Native rich text for readable documents, with access rechecked after async work. */
export function createFoundryDescriptionGateway({
  getGame = () => globalThis.game,
  resolve = (uuid, options) => (globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid)?.(uuid, options),
  getEditor = () => globalThis.CONFIG?.ux?.TextEditor ?? globalThis.TextEditor?.implementation
    ?? globalThis.foundry?.applications?.ux?.TextEditor?.implementation,
  getRoll = () => globalThis.Roll,
  getChat = () => globalThis.foundry?.utils?.getDocumentClass?.("ChatMessage") ?? globalThis.ChatMessage,
  stripPrivateContent = content => {
    const template = globalThis.document.createElement("template");
    template.innerHTML = content;
    template.content.querySelectorAll(".secret, script, style, iframe, object, embed, template, svg, math, form, input, button, select, textarea").forEach(element => element.remove());
    // Foundry parses this into a live element during enrichment. Remove executable
    // attributes and source-supplied action metadata before it reaches that parser.
    const allowed = new Set(["href", "src", "colspan", "rowspan", "start", "reversed", "scope", "alt", "title"]);
    const formatting = new Set("p div span br hr strong b em i u s strike del ins sub sup h1 h2 h3 h4 h5 h6 ul ol li dl dt dd blockquote pre code table caption colgroup col thead tbody tfoot tr th td a img".split(" "));
    for (const element of template.content.querySelectorAll("*")) {
      if (!formatting.has(element.localName)) { element.replaceWith(...element.childNodes); continue; }
      for (const attribute of [...element.attributes]) {
        if (!allowed.has(attribute.name)) { element.removeAttribute(attribute.name); continue; }
        if (["href", "src"].includes(attribute.name)) {
          if ((attribute.name === "src" && element.localName !== "img") || (attribute.name === "href" && element.localName !== "a")) {
            element.removeAttribute(attribute.name); continue;
          }
          try {
            const url = new URL(attribute.value, globalThis.document.baseURI);
            if (!["http:", "https:", ...(attribute.name === "href" ? ["mailto:"] : [])].includes(url.protocol)) element.removeAttribute(attribute.name);
          } catch { element.removeAttribute(attribute.name); }
        }
      }
    }
    return template.innerHTML;
  }
} = {}) {
  const begin = () => ({ game: getGame(), user: getGame()?.user });
  const check = (session, doc) => {
    if (!session.user || getGame() !== session.game || getGame()?.user !== session.user
      || !readable(doc, session.user, session.game)) throw new Error("This description is unavailable or you do not have access to it.");
  };
  const load = async (uuid, session, relativeTo) => {
    if (typeof uuid !== "string" || !uuid || uuid.length > 512) throw new Error("This reference is unavailable.");
    const doc = await resolve(uuid, { relative: relativeTo });
    check(session, doc);
    return doc;
  };
  const verify = async (doc, session) => {
    if (await resolve(doc.uuid) !== doc) throw new Error("This description is no longer available.");
    check(session, doc);
  };
  const enrich = async (doc, content, session) => {
    check(session, doc);
    const editor = getEditor();
    if (typeof editor?.enrichHTML !== "function") throw new Error("Foundry text enrichment is unavailable.");
    const html = String(await editor.enrichHTML(stripPrivateContent(content), {
      secrets: false, documents: true, links: true, rolls: true, custom: true, embeds: false,
      relativeTo: doc, rollData: rollData(doc)
    }));
    await verify(doc, session);
    return { html, uuid: doc.uuid, name: String(doc.name ?? "Description") };
  };
  return Object.freeze({
    async enrich({ uuid, content, fragment = false }) {
      const session = begin();
      const doc = await load(uuid, session);
      const source = descriptionSource(doc, session);
      if (fragment && doc.system?.identified === false) throw new Error("This description is unavailable.");
      const result = await enrich(doc, fragment ? String(content ?? "") : source, session);
      if (descriptionSource(doc, session) !== source) throw new Error("The description changed. Open it again.");
      return result;
    },
    async preview({ uuid, relativeUuid }) {
      const session = begin();
      const relative = relativeUuid ? await load(relativeUuid, session) : undefined;
      const doc = await load(uuid, session, relative);
      const content = descriptionSource(doc, session);
      const result = await enrich(doc, content || "No description is available for this document.", session);
      if (relative) await verify(relative, session);
      // A field or identification change during enrichment must never reveal stale content.
      if (descriptionSource(doc, session) !== content) throw new Error("The description changed. Open the reference again.");
      return result;
    },
    async roll({ uuid, formula, mode = "roll", flavor = "" }) {
      const session = begin();
      const doc = await load(uuid, session);
      const actor = actorFor(doc);
      if (actor && !actor.testUserPermission?.(session.user, "OWNER")) throw new Error("You do not have permission to roll for this character.");
      if (!formula || typeof formula !== "string" || formula.length > 1000
        || !["roll", "publicroll", "gmroll", "blindroll", "selfroll", "public", "gm", "blind", "self"].includes(mode)) throw new Error("This inline roll is invalid.");
      const Roll = getRoll(), Chat = getChat();
      if (typeof Roll?.create !== "function" || typeof Chat?.getSpeaker !== "function") throw new Error("Foundry rolls are unavailable.");
      check(session, doc);
      const roll = Roll.create(formula, rollData(doc));
      const speaker = Chat.getSpeaker({ actor, user: session.user });
      const legacyMode = { public: "publicroll", gm: "gmroll", blind: "blindroll", self: "selfroll" }[mode] ?? mode;
      const options = typeof Roll._mapLegacyRollMode === "function"
        ? { messageMode: Roll._mapLegacyRollMode(legacyMode) } : { rollMode: legacyMode };
      return roll.toMessage({ speaker, flavor: String(flavor).slice(0, 500) }, options);
    }
  });
}

function actorFor(doc) {
  for (let parent = doc; parent; parent = parent.parent) if (parent.documentName === "Actor") return parent;
  return doc.actor ?? null;
}

function rollData(doc) {
  return doc.getRollData?.() ?? doc.parent?.getRollData?.() ?? actorFor(doc)?.getRollData?.() ?? {};
}

function readable(doc, user, game) {
  if (!doc) return false;
  // Embedded documents may inherit access through their containing document.
  for (let parent = doc; parent; parent = parent.parent) {
    if (typeof parent.testUserPermission === "function" && !parent.testUserPermission(user, "OBSERVER")) return false;
    if (parent.visible === false) return false;
    if (parent.pack && game?.packs?.get(parent.pack)?.testUserPermission?.(user, "OBSERVER") === false) return false;
    if (parent.documentName === "JournalEntry" && !isJournalVisible(parent, user, game)) return false;
    if (parent.documentName === "JournalEntryPage" && !isJournalPageVisible(parent, parent.parent, user)) return false;
  }
  return typeof doc.testUserPermission === "function" || doc.visible === true || Boolean(doc.parent && readable(doc.parent, user, game));
}

function descriptionSource(doc, session) {
  if (doc.documentName === "JournalEntryPage") return doc.type === "text" ? String(doc.text?.content ?? "") : "";
  if (doc.documentName === "JournalEntry") return Array.from(doc.pages?.contents ?? doc.pages ?? [])
    .filter(page => page.type === "text" && readable(page, session.user, session.game))
    .map(page => String(page.text?.content ?? "")).join("<hr>");
  const system = doc.system ?? {};
  if (doc.documentName === "Actor") {
    const biography = system.details?.biography;
    if (biography) return String(biography[doc.type === "npc" && !doc.testUserPermission?.(session.user, "OWNER") ? "public" : "value"] ?? "");
    if (typeof system.notes === "string") return system.notes;
  }
  if (system.identified === false) return String(system.unidentified?.description ?? "");
  const value = system.description;
  return typeof value === "string" ? value : String(value?.value ?? doc.description ?? "");
}
