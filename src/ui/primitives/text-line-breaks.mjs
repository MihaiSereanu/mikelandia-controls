/** Preserve typed newlines without exposing whitespace between formatted HTML blocks. */
export function preserveTextLineBreaks(content) {
  const blocks = "p, div, section, article, h1, h2, h3, h4, h5, h6, ul, ol, li, table, blockquote, pre, figure, hr";
  const plain = !content.querySelector(blocks);
  content.classList.toggle("mc-preserve-lines", plain);
  if (plain) return;
  const document = content.ownerDocument;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) {
    const text = walker.currentNode;
    if (/[\r\n]/u.test(text.textContent) && /\S/u.test(text.textContent)
      && !text.parentElement.closest("pre, code, .mc-preserve-lines")) texts.push(text);
  }
  for (const text of texts) {
    const span = document.createElement("span");
    span.className = "mc-preserve-lines";
    text.replaceWith(span);
    span.append(text);
  }
}
