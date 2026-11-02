import test from "node:test";
import assert from "node:assert/strict";
import { notesMarkdownToHTML } from "../src/ui/primitives/notes-markdown.mjs";

test("Notes Markdown preserves every newline and escapes source HTML", () => {
  assert.equal(notesMarkdownToHTML("First\nSecond\n\nFourth\n"), "<p>First<br>Second<br><br>Fourth<br></p>");
  assert.equal(notesMarkdownToHTML("<img src=x onerror=alert(1)> & coins"), "<p>&#60;img src=x onerror=alert(1)&#62; &amp; coins</p>");
  assert.equal(notesMarkdownToHTML(""), "");
});

test("Notes Markdown supports headings, emphasis and lists without accepting attributes", () => {
  assert.equal(notesMarkdownToHTML("## Ledger\n**Gold** and *silver*\n- Rations\n- Torches\n1. First"),
    "<h2>Ledger</h2><p><strong>Gold</strong> and <em>silver</em></p><ul><li>Rations</li><li>Torches</li></ul><ol><li>First</li></ol>");
  assert.equal(notesMarkdownToHTML("\\*literal\\* and **bold**"), "<p>*literal* and <strong>bold</strong></p>");
});
