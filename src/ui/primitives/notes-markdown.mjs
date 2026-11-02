/** Small, escaped Markdown subset for actor Notes; native storage remains HTML. */
export function notesMarkdownToHTML(value) {
  const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&#60;").replaceAll(">", "&#62;").replaceAll('"', "&quot;");
  const inline = text => {
    const tokens = [];
    const stash = html => `\u0000${tokens.push(html) - 1}\u0000`;
    let result = escape(text).replace(/\\([\\*#_`\[\]{}()+.!>-])/gu, (_match, character) => stash(character));
    result = result.replace(/\*\*([^*\n]+)\*\*/gu, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/gu, "<em>$1</em>");
    return result.replace(/\u0000(\d+)\u0000/gu, (_match, index) => tokens[Number(index)]);
  };
  const lines = String(value ?? "").replace(/\r\n?/gu, "\n").replaceAll("\u0000", "").split("\n");
  const blocks = [];
  let prose = [], list = [], listType = "";
  const flushProse = () => { if (prose.length) blocks.push(`<p>${prose.map(inline).join("<br>")}</p>`); prose = []; };
  const flushList = () => { if (list.length) blocks.push(`<${listType}>${list.map(text => `<li>${inline(text)}</li>`).join("")}</${listType}>`); list = []; listType = ""; };
  for (const line of lines) {
    const heading = /^(#{1,6}) +(.+)$/u.exec(line);
    const item = /^(?:([-*])|\d+\.) +(.+)$/u.exec(line);
    if (heading) {
      flushProse(); flushList();
      blocks.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    } else if (item) {
      flushProse();
      const type = item[1] ? "ul" : "ol";
      if (listType && type !== listType) flushList();
      listType = type; list.push(item[2]);
    } else {
      flushList(); prose.push(line);
    }
  }
  flushProse(); flushList();
  return value === "" ? "" : blocks.join("");
}

/** Parse HTML inertly; never place native source markup in the textarea. */
export function notesHTMLToMarkdown(value, document = globalThis.document) {
  const source = String(value ?? "").replace(/\r\n?/gu, "\n");
  if (!/<\/?[a-z][^>]*>/iu.test(source)) return source;
  const template = document.createElement("template");
  template.innerHTML = source;
  const blocks = new Set(["P", "DIV", "SECTION", "ARTICLE", "BLOCKQUOTE", "PRE", "TABLE", "TR", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6"]);
  const children = parent => {
    let result = "", previousBlock = false, visited = false;
    for (const child of parent.childNodes) {
      const block = blocks.has(child.nodeName);
      // Ignore source indentation between blocks, while keeping actual text newlines.
      if (child.nodeType === 3 && !child.textContent.trim() && /\n/u.test(child.textContent) && (previousBlock || blocks.has(child.nextSibling?.nodeName))) continue;
      if (child.nodeType !== 1 && child.nodeType !== 3) continue;
      if (visited && (block || previousBlock)) result += "\n";
      result += walk(child);
      previousBlock = block; visited = true;
    }
    return result;
  };
  const walk = element => {
    if (element.nodeType === 3) return element.textContent.replace(/([\\*])/gu, "\\$1");
    if (element.nodeType !== 1) return "";
    const tag = element.nodeName;
    if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "TEMPLATE"].includes(tag)) return "";
    if (tag === "BR") return "\n";
    if (tag === "IMG") return element.getAttribute("alt") ?? "";
    const text = children(element);
    if (tag === "STRONG" || tag === "B") return text ? `**${text}**` : "";
    if (tag === "EM" || tag === "I") return text ? `*${text}*` : "";
    if (/^H[1-6]$/u.test(tag)) return `${"#".repeat(Number(tag[1]))} ${text}`;
    if (tag === "LI") return `${element.parentElement?.nodeName === "OL" ? `${[...element.parentElement.children].indexOf(element) + 1}.` : "-"} ${text}`;
    if (tag === "TD" || tag === "TH") return `${text} `;
    return text;
  };
  return children(template.content).replaceAll("\u00a0", " ");
}
