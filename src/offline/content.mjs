const TAGS = new Set("p div span br hr strong b em i u s del ins sub sup h1 h2 h3 h4 h5 h6 ul ol li dl dt dd blockquote pre code table caption thead tbody tfoot tr th td a img".split(" "));

/** No native handlers, executable content, source classes or roll metadata survive. */
export function offlineHtml(source, { document = globalThis.document, base = document.baseURI, keepSecrets = false } = {}) {
  const template = document.createElement("template");
  template.innerHTML = String(source ?? "");
  template.content.querySelectorAll(`script,style,iframe,object,embed,template,svg,math,form,input,button,select,textarea${keepSecrets ? "" : ",.secret"}`).forEach(node => node.remove());
  for (const element of [...template.content.querySelectorAll("*")]) {
    if (!TAGS.has(element.localName)) { element.replaceWith(...element.childNodes); continue; }
    const reference = element.localName === "a" && element.classList.contains("content-link") ? element.dataset.uuid : null;
    const roll = element.classList.contains("inline-roll");
    if (roll) {
      const text = document.createElement("span"); text.textContent = element.textContent;
      text.title = "Rolls are unavailable in saved copies."; element.replaceWith(text); continue;
    }
    const src = element.localName === "img" ? safeUrl(element.getAttribute("src") || "", base) : "";
    const href = element.localName === "a" && !reference && !roll ? safeUrl(element.getAttribute("href") || "", base) : "";
    for (const attr of [...element.attributes]) {
      if (!["colspan", "rowspan", "alt", "title"].includes(attr.name)) element.removeAttribute(attr.name);
    }
    if (reference) { element.className = "content-link"; element.dataset.uuid = reference; }
    if (src) element.setAttribute("src", src);
    if (href) element.setAttribute("href", href);
  }
  return template.innerHTML;
}

export function safeUrl(value, base) {
  if (!value) return "";
  try {
    const url = new URL(value, base);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

const PRIVATE_KEYS = new Set(["revision", "notesRevision", "capabilities", "originalSource", "editorText", "originalValue"]);

export function offlineSystemLabel(library) {
  const id = library.world.systemId;
  if (id === "wfrp4e") return library.data?.actors?.some(actor => actor.view?.edition === "5e") ? "WFRP 5e" : "WFRP";
  return { dnd5e: "D&D5e", shadowdark: "Shadowdark", swade: "SWADE", "honor-and-intrigue": "Honor + Intrigue" }[id] ?? id;
}

/** Keep the existing prepared renderer model, removing commands and enriching content online. */
export async function actorDocument(actor, { html, enrich, image = source => source }) {
  const copy = async (value, relativeUuid) => {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return Promise.all(value.map(entry => copy(entry, relativeUuid)));
    const uuid = value.descriptionUuid || value.effectUuid || value.sourceUuid || relativeUuid;
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      if (PRIVATE_KEYS.has(key)) continue;
      if (["action", "secondaryAction", "lossAction", "edit"].includes(key)) {
        // Keep only the display contract so the same controls render disabled.
        // The cached command provider rejects every command, independently of UI state.
        if (child && typeof child === "object" && typeof child.id === "string") result[key] = {
          ...Object.fromEntries(Object.entries(child).filter(([name]) => ["id", "kind", "active", "icon", "label", "min", "max", "choices"].includes(name))), revision: "offline"
        };
        continue;
      }
      if (key === "img" && typeof child === "string") { result[key] = image(child); continue; }
      if (["description", "descriptionHtml", "text", "html"].includes(key) && typeof child === "string") {
        const source = uuid && enrich ? await enrich(uuid, child, { fragment: !value.descriptionUuid && !value.effectUuid }) : child;
        result[key] = html(source, uuid);
      } else result[key] = await copy(child, uuid);
    }
    if (value.capabilities) result.capabilities = {};
    if (value.profileInventory !== undefined) result.profileInventory = false;
    return result;
  };
  return { id: actor.sourceUuid, name: actor.name, img: actor.img, view: await copy(actor, actor.sourceUuid) };
}

export function portraitUrls({ actors = [], party = null }, base = globalThis.document?.baseURI) {
  return new Set([...actors.map(actor => actor.img || actor.view?.img), ...(party?.members ?? []).map(member => member.img)]
    .map(source => safeUrl(source, base)).filter(Boolean));
}

/** Collect only permitted portraits and images on explicitly named handout pages. */
export function offlineImageUrls(data, base = globalThis.document?.baseURI, document = globalThis.document) {
  const urls = portraitUrls(data, base);
  for (const journal of data.journals ?? []) {
    for (const page of journal.pages ?? []) {
      if (!/handouts/i.test(journal.name ?? "") && !/handouts/i.test(page.name ?? "")) continue;
      if (page.type === "image") {
        const url = safeUrl(page.src, base);
        if (url) urls.add(url);
      } else if (page.type === "text" && page.html) {
        const template = document.createElement("template");
        template.innerHTML = page.html;
        for (const image of template.content.querySelectorAll("img[src]")) {
          const url = safeUrl(image.getAttribute("src"), base);
          if (url) urls.add(url);
        }
      }
    }
  }
  return urls;
}

export function pruneLibrary(data, manifest, actorStamps = null, journalStamps = null, base) {
  if (!data) return null;
  const actors = new Set(manifest.actors.map(actor => actor.sourceUuid));
  const journals = new Map(manifest.journals.map(journal => [journal.id, new Set(journal.pages.map(page => page.id))]));
  const permittedActors = data.actors.filter(actor => actors.has(actor.id) && (!actorStamps || actor.access === actorStamps.get(actor.id)));
  const permittedJournals = data.journals.filter(journal => journals.has(journal.id) && (!journalStamps || journal.access === journalStamps.get(journal.id)))
    .map(journal => ({ ...journal, pages: journal.pages.filter(page => journals.get(journal.id).has(page.id)) }));
  const urls = offlineImageUrls({ actors: permittedActors, party: manifest.party, journals: permittedJournals }, base);
  // Retain only current permitted portraits and handouts. References are rechecked separately.
  return { ...data, actors: permittedActors, journals: permittedJournals,
    party: null, combat: null, targeting: null, references: [], media: (data.media ?? []).filter(entry => urls.has(entry.url)), incomplete: true };
}
