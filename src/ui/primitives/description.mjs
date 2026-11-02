import { node } from "./dom.mjs";

const FORMATTING = new Set("p div span br hr strong b em i u s strike del ins sub sup h1 h2 h3 h4 h5 h6 ul ol li dl dt dd blockquote pre code table caption colgroup col thead tbody tfoot tr th td a img".split(" "));

/** Copy description formatting without native controls, secrets or executable markup. */
export function renderDescription(source, className = "", { enriched = false } = {}) {
  const template = document.createElement("template");
  template.innerHTML = String(source ?? "");
  template.content.querySelectorAll("script, style, iframe, object, embed, template, svg, math, form, input, button, select, textarea, .secret").forEach(element => element.remove());
  const content = node("div", { className: `mc-description-content ${className}`.trim() });
  if (!template.content.children.length) content.classList.add("is-plain-text");
  const copy = (source, parent) => {
    for (const child of source.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(child.textContent)); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.localName;
      if (!FORMATTING.has(tag)) { copy(child, parent); continue; }
      const element = document.createElement(tag);
      if (enriched && tag === "a" && (child.classList.contains("content-link") || child.classList.contains("inline-roll"))) {
        for (const name of ["content-link", "inline-roll", "inline-result", "broken", "roll", "gmroll", "blindroll", "selfroll", "publicroll"]) {
          if (child.classList.contains(name)) element.classList.add(name);
        }
        for (const name of ["data-uuid", "data-id", "data-type", "data-pack", "data-link", "data-formula", "data-mode", "data-flavor", "data-roll", "data-tooltip", "data-tooltip-text"]) {
          if (child.hasAttribute(name)) element.setAttribute(name, child.getAttribute(name));
        }
        element.setAttribute("role", "button");
        element.tabIndex = 0;
      }
      if (enriched && tag === "i") {
        for (const name of child.classList) if (/^fa[srlbd]?$|^fa-[a-z0-9-]+$/u.test(name)) element.classList.add(name);
        element.setAttribute("aria-hidden", "true");
      }
      for (const name of ["href", "src"]) {
        if ((tag !== "a" || name !== "href") && (tag !== "img" || name !== "src")) continue;
        const value = child.getAttribute(name);
        if (!value) continue;
        try {
          const url = new URL(value, document.baseURI);
          if (["http:", "https:", ...(name === "href" ? ["mailto:"] : [])].includes(url.protocol)) element.setAttribute(name, value);
        } catch { /* Invalid URLs remain inactive. */ }
      }
      for (const name of ["colspan", "rowspan", "start", "reversed", "scope", "alt", "title"]) {
        if (child.hasAttribute(name)) element.setAttribute(name, child.getAttribute(name));
      }
      copy(child, element);
      parent.append(element);
    }
  };
  copy(template.content, content);
  const preview = content.cloneNode(true);
  preview.querySelectorAll("p, div, li, br, h1, h2, h3, h4, h5, h6, tr, blockquote, pre").forEach(element => element.append("\n"));
  return { content, text: preview.textContent.trim() };
}
