import { buildJournalMarkdown, installJournalExportControls, prepareJournalExportHtml } from "/src/foundry/journals/journal-export.mjs";
import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";

export async function checkJournalExport({ root, journal, page, check, tick }) {
  if (!new URLSearchParams(location.search).has("native-assets")) throw new Error("Journal export checks require --native-assets for the native Markdown converter.");
  const script = document.createElement("script");
  script.src = "/native-editor/node_modules/showdown/dist/showdown.js";
  const loaded = new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; });
  document.head.append(script); await loaded;
  const base = document.createElement("base"); base.href = `${location.origin}/`; document.head.prepend(base);
  const params = new URLSearchParams(location.search);
  root.toggleAttribute("data-mc-style-authority", !params.has("unprotected"));
  if (params.has("large")) root.style.setProperty("font-size", "22px", "important");
  const converter = new showdown.Converter({ tables: true, strikethrough: true });
  globalThis.TextPageSheet = { _converter: converter };
  const originalText = page.text, originalPages = journal.pages, originalName = journal.name;
  const downloads = [], originalSave = foundry.utils.saveDataToFile;
  foundry.utils.saveDataToFile = (...args) => downloads.push(args);
  const scope = createTaskScope();
  try {
    journal.name = "Travel: Notes";
    page.isOwner = false;
    page.sort = 5;
    page.text = { format: 1, content: '<h1>Town</h1><p>A <strong>bold</strong> and <em>italic</em> café.</p><ul><li>Rope</li><li>Torch</li></ul><table><tr><td>Cell one</td><td>Cell two</td></tr></table><section class="secret"><p>Unrevealed word</p></section><section class="secret revealed"><p>Revealed word</p></section><p hidden>Hidden word</p><div style="display:none">Invisible word</div><!--Comment word--><script>Script word</script><p>@UUID[JournalEntry.private]{Authored label} [[1d20]]{Attack roll}</p><p><a class="content-link" data-uuid="private"><i>icon</i>Linked title</a></p><p><img src="assets/portrait one.webp" alt="Portrait"></p><p><a href="docs/handout.pdf">Handout</a></p>' };
    const markdownPage = { ...page, id: "markdown", name: "Markdown page", sort: 10,
      text: { format: 2, markdown: '## Source heading\n\nCurrent **Markdown** source.\n\n<section class="secret">Markdown secret</section>', content: 'Stale HTML cache' } };
    const imagePage = { ...page, id: "image", name: "Map", type: "image", sort: 15, src: "assets/map.webp", image: { caption: "Map caption" } };
    const pdfPage = { ...page, id: "pdf", name: "PDF", type: "pdf", sort: 20, src: "docs/file.pdf" };
    journal.pages = [pdfPage, markdownPage, imagePage, ...originalPages];
    const result = buildJournalMarkdown(journal), md = result.markdown;
    check("export uses one safe Markdown filename", result.filename === 'Travel_ Notes.md');
    check("export nests readable pages and authored headings in sort order", md.startsWith('# Travel: Notes\n') && md.includes('## Public page') && md.includes('### Town') && md.indexOf('## Public page') < md.indexOf('## Markdown page') && md.indexOf('## Markdown page') < md.indexOf('## Map') && md.indexOf('## Map') < md.indexOf('## PDF'));
    check("native converter preserves bold, italic, lists and Unicode", md.includes('**bold**') && md.includes('*italic*') && /[-*+] Rope/.test(md) && md.includes('café'));
    check("headerless table cells survive conversion", md.includes('Cell one') && md.includes('Cell two') && md.includes('|'));
    check("Observer export hides denied pages, unrevealed secrets and hidden content", !/Private page|Hidden page|Unrevealed word|Hidden word|Invisible word|Comment word|Script word|Markdown secret/.test(md));
    check("revealed secrets export as Markdown paragraphs", md.includes('Revealed word') && !md.includes('<section'));
    check("Foundry references and rolls become readable labels without resolving targets", md.includes('Authored label') && md.includes('Attack roll') && md.includes('Linked title') && !/@UUID|\[\[|JournalEntry.private|data-uuid/.test(md));
    check("Markdown pages use current source instead of cached HTML", md.includes('Current **Markdown** source.') && md.includes('#### Source heading') && !md.includes('Stale HTML cache'));
    check("inline images and file links become absolute URLs", md.includes(`${location.origin}/assets/portrait%20one.webp`) && md.includes(`${location.origin}/docs/handout.pdf`));
    check("image pages retain image links and captions; PDF pages use ordinary links", md.includes(`![Map](<${location.origin}/assets/map.webp>)`) && md.includes('Map caption') && md.includes(`[PDF](<${location.origin}/docs/file.pdf>)`));
    page.isOwner = true;
    check("owners retain secret sections they may read", buildJournalMarkdown(journal).markdown.includes('Unrevealed word'));
    page.isOwner = false;
    const sanitized = prepareJournalExportHtml('<p><a href="javascript:alert(1)" onclick="bad()">Label</a><img src="javascript:bad()" onerror="bad()"></p>');
    check("export strips executable URLs and HTML handlers", !/javascript|onclick|onerror/.test(sanitized));
    const exportButton = root.querySelector('.mc-journal-export');
    check("companion exposes a named export button with a 44px touch target", exportButton.getAttribute('aria-label') === 'Export Markdown' && exportButton.getBoundingClientRect().width >= 44 && exportButton.getBoundingClientRect().height >= 44);
    exportButton.click(); await tick();
    check("companion button downloads the current Journal as Markdown", downloads.length === 1 && downloads[0][0] === md && downloads[0][1] === 'text/markdown;charset=utf-8' && downloads[0][2] === result.filename && !exportButton.disabled);
    installJournalExportControls(scope);
    const controls = [];
    Hooks.emit('getHeaderControlsJournalEntrySheet', { document: journal }, controls);
    controls[0].onClick();
    check("native Journal header action uses the same export", controls.length === 1 && downloads.length === 2 && downloads[1][0] === md);
    const permission = journal.testUserPermission;
    journal.testUserPermission = () => false;
    exportButton.click(); await tick();
    check("companion rechecks revoked rights and shows an error without downloading", downloads.length === 2 && /no longer available/.test(root.querySelector('.mc-journal-status').textContent) && !exportButton.disabled);
    journal.testUserPermission = permission;
    // Leave a readable reader for the retained screenshot and adjacent editor checks.
    root.querySelector('.mc-journal-status').hidden = true;
  } finally {
    scope.dispose(); base.remove();
    root.style.removeProperty("font-size"); root.setAttribute("data-mc-style-authority", "");
    journal.name = originalName; journal.pages = originalPages; page.text = originalText;
    delete page.isOwner; delete page.sort;
    foundry.utils.saveDataToFile = originalSave;
    delete globalThis.TextPageSheet;
  }
}
