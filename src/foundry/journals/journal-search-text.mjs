/** Extract authored, readable text without resolving document links or loading embeds. */
export function readJournalSearchText(page, { secrets = false } = {}) {
  const format = page.text?.format ?? 1;
  let html;
  if (format === 1) html = String(page.text?.content ?? "");
  else if (format === 2) {
    const converter = globalThis.foundry?.applications?.sheets?.journal?.JournalEntryPageTextSheet?._converter
      ?? page.sheet?.constructor?._converter ?? globalThis.TextPageSheet?._converter;
    if (typeof converter?.makeHtml !== "function") throw new Error("Foundry Markdown rendering is unavailable.");
    const cleanHTML = globalThis.foundry?.utils?.cleanHTML;
    if (typeof cleanHTML !== "function") throw new Error("Foundry Markdown HTML cleaning is unavailable.");
    html = String(cleanHTML(String(converter.makeHtml(String(page.text?.markdown ?? "")))));
  } else throw new Error("This Journal text format is unavailable.");
  return journalSearchTextFromHtml(html, { secrets });
}

export function journalSearchTextFromHtml(html, { secrets = false } = {}) {
  const template = globalThis.document.createElement("template");
  template.innerHTML = String(html ?? "");
  const content = template.content;
  content.querySelectorAll("script, style, iframe, object, embed, template, svg, math, form, input, button, select, textarea, [hidden], [aria-hidden='true']")
    .forEach(element => element.remove());
  // Match Foundry TextEditor: revealed secrets are readable by nonowners too.
  if (!secrets) content.querySelectorAll("section.secret:not(.revealed)").forEach(element => element.remove());
  for (const element of content.querySelectorAll("[style]")) {
    if (element.style.display === "none" || ["hidden", "collapse"].includes(element.style.visibility)) element.remove();
  }
  const blocks = new Set("address article aside blockquote br caption dd div dl dt figcaption figure footer h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tbody td tfoot th thead tr ul".split(" "));
  const text = node => {
    if (node.nodeType === 3) return node.nodeValue ?? "";
    const value = Array.from(node.childNodes ?? [], text).join("");
    return blocks.has(node.localName) ? ` ${value} ` : value;
  };
  return text(content)
    // Keep authored labels, never identifiers, URLs, roll expressions or embed targets.
    .replace(/@[A-Za-z][\w.]*\[[^\]]*\](?:\{([^}]*?)\})?/g, (_match, label) => label ?? " ")
    .replace(/\[\[[\s\S]*?\]\](?:\{([^}]*?)\})?/g, (_match, label) => label ?? " ")
    .replace(/\s+/gu, " ").trim();
}
