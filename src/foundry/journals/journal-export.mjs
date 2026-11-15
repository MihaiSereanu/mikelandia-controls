import { isJournalVisible, isJournalPageVisible } from "./journal-visibility.mjs";
import { localizeFoundry } from "../settings/localization.mjs";

export function journalExportLabel() {
  return localizeFoundry("MIKELANDIA_CONTROLS.Journals.ExportMarkdown", "Export Markdown");
}

/** Export authored content synchronously, without resolving references or executing rolls. */
export function buildJournalMarkdown(journal, { game = globalThis.game, baseUrl = globalThis.document?.baseURI } = {}) {
  if (journal?.pack || !isJournalVisible(journal, game?.user, game)) throw new Error("This journal is no longer available for export.");
  const pages = Array.from(journal.pages ?? []).filter(page => isJournalPageVisible(page, journal, game.user))
    .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
  const sections = [`# ${markdownLabel(journal.name || "Journal")}`];
  for (const page of pages) {
    const name = markdownLabel(page.name || "Untitled page");
    let body = "";
    if (page.type === "text" || !page.type) {
      const converter = globalThis.foundry?.applications?.sheets?.journal?.JournalEntryPageTextSheet?._converter
        ?? page.sheet?.constructor?._converter ?? globalThis.TextPageSheet?._converter;
      if (typeof converter?.makeMarkdown !== "function") throw new Error("Foundry Markdown conversion is unavailable.");
      const format = page.text?.format ?? 1;
      let html = String(page.text?.content ?? "");
      if (format === 2) {
        if (typeof converter.makeHtml !== "function") throw new Error("Foundry Markdown rendering is unavailable.");
        html = converter.makeHtml(String(page.text?.markdown ?? ""));
      } else if (format !== 1) throw new Error("This Journal text format is unavailable.");
      body = converter.makeMarkdown(prepareJournalExportHtml(html, {
        secrets: Boolean(page.isOwner ?? journal.isOwner), baseUrl
      })).trim();
    } else {
      const url = exportUrl(page.src, baseUrl);
      if (url) body = `${page.type === "image" ? "!" : ""}[${name}](<${url}>)`;
      if (page.image?.caption) body += `\n\n${markdownLabel(page.image.caption)}`;
    }
    sections.push(`## ${name}${body ? `\n\n${body}` : ""}`);
  }
  const filename = String(journal.name || "Journal").replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
    .replace(/[. ]+$/u, "").slice(0, 120) || "Journal";
  return { markdown: `${sections.join("\n\n")}\n`, filename: `${filename}.md` };
}

export function downloadJournalMarkdown(journalId) {
  const journal = globalThis.game?.journal?.get(journalId);
  const result = buildJournalMarkdown(journal);
  const save = globalThis.foundry?.utils?.saveDataToFile ?? globalThis.saveDataToFile;
  if (typeof save !== "function") throw new Error("Foundry file downloads are unavailable.");
  save(result.markdown, "text/markdown;charset=utf-8", result.filename);
  return result;
}

export function installJournalExportControls(scope) {
  scope.hook("getHeaderControlsJournalEntrySheet", (sheet, controls) => {
    const journal = sheet.document;
    if (journal?.documentName !== "JournalEntry" || journal.pack || !isJournalVisible(journal, game.user)) return;
    controls.push({ icon: "fa-solid fa-file-export", label: journalExportLabel(),
      onClick: () => {
        try { downloadJournalMarkdown(journal.id); }
        catch (error) { globalThis.ui?.notifications?.error?.(error.message); }
      } });
  });
}

export function prepareJournalExportHtml(html, { secrets = false, baseUrl = globalThis.document?.baseURI } = {}) {
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  const content = template.content;
  content.querySelectorAll("script, style, iframe, object, embed, template, svg, math, form, input, button, select, textarea, [hidden], [aria-hidden='true']")
    .forEach(element => element.remove());
  if (!secrets) content.querySelectorAll("section.secret:not(.revealed)").forEach(element => element.remove());
  for (const element of content.querySelectorAll("[style]")) {
    if (element.style.display === "none" || ["hidden", "collapse"].includes(element.style.visibility)) element.remove();
  }
  for (const element of content.querySelectorAll("a.content-link, a.inline-roll")) {
    element.querySelectorAll("i").forEach(icon => icon.remove());
    element.replaceWith(document.createTextNode(element.textContent));
  }
  const textNodes = document.createTreeWalker(content, 4);
  while (textNodes.nextNode()) {
    const text = textNodes.currentNode;
    if (text.parentElement?.closest("code, pre")) continue;
    text.nodeValue = text.nodeValue
      .replace(/@[A-Za-z][\w.]*\[[^\]]*\](?:\{([^}]*?)\})?/g, (_match, label) => label ?? "Document reference")
      .replace(/\[\[([\s\S]*?)\]\](?:\{([^}]*?)\})?/g, (_match, roll, label) => label ?? roll);
  }
  for (const element of content.querySelectorAll("[src], a[href]")) {
    const attribute = element.hasAttribute("src") ? "src" : "href";
    const url = exportUrl(element.getAttribute(attribute), baseUrl, attribute === "href");
    if (url) element.setAttribute(attribute, url);
    else element.removeAttribute(attribute);
  }
  for (const element of content.querySelectorAll("audio, video")) {
    const url = exportUrl(element.getAttribute("src") || element.querySelector("source")?.getAttribute("src"), baseUrl);
    const link = document.createElement("a");
    link.textContent = element.getAttribute("title") || element.localName;
    if (url) link.setAttribute("href", url);
    element.replaceWith(link);
  }
  for (const heading of content.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const nested = document.createElement(`h${Math.min(6, Number(heading.localName[1]) + 2)}`);
    nested.append(...heading.childNodes);
    heading.replaceWith(nested);
  }
  // Showdown drops body cells when a table has no thead/th cells.
  for (const table of content.querySelectorAll("table")) {
    if (table.querySelector(":scope > thead > tr > th")) continue;
    const first = table.rows[0];
    if (!first) continue;
    const head = table.createTHead(), row = head.insertRow();
    if (Array.from(first.cells).every(cell => cell.localName === "th")) row.replaceWith(first);
    else for (let i = 0; i < first.cells.length; i++) row.append(document.createElement("th"));
  }
  // Generic Foundry wrappers otherwise survive Showdown as raw HTML.
  for (const element of content.querySelectorAll("div, section, article, aside, header, footer, figure, figcaption, span")) {
    const block = element.localName !== "span";
    element.replaceWith(...(block ? [document.createTextNode("\n\n"), ...element.childNodes, document.createTextNode("\n\n")] : element.childNodes));
  }
  for (const element of content.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      if (!["href", "src", "alt", "title", "start"].includes(attribute.name)) element.removeAttribute(attribute.name);
    }
  }
  const comments = document.createTreeWalker(content, 128), remove = [];
  while (comments.nextNode()) remove.push(comments.currentNode);
  remove.forEach(comment => comment.remove());
  return template.innerHTML;
}

function exportUrl(value, baseUrl, link = false) {
  if (!value) return "";
  if (link && String(value).startsWith("#")) return String(value);
  try {
    const url = new URL(value, baseUrl);
    return (link ? ["http:", "https:", "mailto:", "tel:"] : ["http:", "https:"]).includes(url.protocol)
      ? url.href.replaceAll("<", "%3C").replaceAll(">", "%3E") : "";
  } catch { return ""; }
}

function markdownLabel(value) {
  return String(value).replace(/\s+/gu, " ").replace(/[\\`*_{}\[\]<>#!|]/gu, "\\$&").trim();
}
