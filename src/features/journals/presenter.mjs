import { journalMatchRanges, journalSearchWords } from "./search.mjs";
import { preserveTextLineBreaks } from "../../ui/primitives/text-line-breaks.mjs";
import { openTextEditor } from "../../ui/primitives/text-editor.mjs";
import { localizedText, localizedCount } from "../../ui/primitives/localized-text.mjs";
import { icon, node } from "../../ui/primitives/dom.mjs";
import { renderImageViewer } from "../../ui/media/image-viewer.mjs";
import { buildJournalTree, journalBranchCount } from "./model.mjs";

export function renderJournals({ state, commands, scope }) {
  if (state.journal) return journalReader(state, commands, scope);
  const localize = (key, fallback) => commands.localize?.(`MIKELANDIA_CONTROLS.Journals.${key}`, fallback) ?? fallback;
  const input = node("input", { className: "mc-journal-search-input", attrs: { type: "search", placeholder: localize("Search", "Search journals and pages"), "aria-label": localize("Search", "Search journals and pages") }, on: { input: event => commands.setJournalSearch(event.target.value) } }, scope);
  const clear = node("button", { attrs: { type: "button" }, text: localize("ClearSearch", "Clear"), on: { click: () => { commands.setJournalSearch(""); input.focus(); } } }, scope);
  const status = node("p", { className: "mc-journal-status", attrs: { role: "status", "aria-live": "polite" } });
  const retry = node("button", { attrs: { type: "button" }, text: localize("RetrySearch", "Retry search"), on: { click: () => commands.retryJournalSearch() } }, scope);
  const count = node("span", { className: "mc-count" });
  const body = node("div", { className: "mc-journal-library-body" });
  const screen = node("section", { className: "mc-list-screen mc-journal-library", children: [
    node("header", { children: [node("div", { children: [node("small", { text: localize("Library", "Library").toLocaleUpperCase() }), node("h2", { text: localize("Title", "Journals") })] }), count] }),
    node("div", { className: "mc-journal-search", children: [input, clear] }), status, retry, body
  ] });
  let bodyScope = null, previous = null, pendingScrollTop = null;
  screen.updateJournalLibrary = next => {
    const journals = next.snapshot?.journals ?? [];
    const search = next.journalSearch ?? { query: "", results: [] };
    const active = Boolean(search.query.trim());
    if (input.value !== search.query) input.value = search.query;
    clear.hidden = !search.query;
    retry.hidden = !search.error;
    count.textContent = active ? search.results.length : journals.length;
    screen.setAttribute("aria-busy", String(Boolean(search.loading || next.journalLoading)));
    status.classList.toggle("is-error", Boolean(search.error || next.journalError));
    status.textContent = next.journalLoading ? localize("Opening", "Opening journal\u2026")
      : search.error ? localize("SearchFailed", "Journal search could not be completed.")
      : next.journalError ? commands.localize?.(next.journalError, next.journalError) ?? next.journalError
      : search.loading ? localize("Searching", "Searching journals\u2026")
      : active && !search.results.length ? localize("NoSearchResults", "No matching journals or pages.") : "";
    if (previous?.journals === journals && previous?.results === search.results && previous?.query === search.query) return;
    const folders = new Set([...body.querySelectorAll("details[open]")].map(el => el.dataset.folderId));
    const scroller = screen.closest(".mc-viewport");
    const top = scroller?.scrollTop;
    if (search.loading && previous?.query === search.query && pendingScrollTop === null) {
      pendingScrollTop = top ?? 0;
      body.style.minHeight = `${body.getBoundingClientRect().height}px`;
    }

    bodyScope?.dispose(); bodyScope = scope.child("journal-library-results");
    const owner = bodyScope;
    if (!active) {
      body.replaceChildren(journals.length ? node("div", { className: "mc-journal-tree", children: renderBranch(buildJournalTree(journals), commands, owner) })
        : node("div", { className: "mc-empty", children: [icon("fa-book-open"), node("p", { text: localize("None", "No visible journals.") })] }));
      for (const folder of body.querySelectorAll("details")) folder.open = folders.has(folder.dataset.folderId);
    } else {
      const words = journalSearchWords(search.query);
      body.replaceChildren(...search.results.map(journal => node("section", { className: "mc-journal-search-group", children: [
        node("h3", { children: [node("button", { className: "mc-journal-search-heading", attrs: { type: "button" }, children: highlighted(journal.name, words), on: { click: () => void commands.openJournal(journal.id).catch(() => {}) } }, owner)] }),
        ...journal.pages.map(page => node("button", { className: "mc-journal-search-result", attrs: { type: "button" }, on: { click: () => void commands.openJournal(journal.id, { pageId: page.id }).catch(() => {}) }, children: [
          node("strong", { children: highlighted(page.name, words) }),
          page.excerpt ? node("span", { className: "mc-journal-search-excerpt", children: highlighted(page.excerpt, words) }) : null
        ] }, owner))
      ] })));
    }
    if (!search.loading) body.style.minHeight = "";
    if (scroller && previous?.query === search.query) scroller.scrollTop = pendingScrollTop ?? top;
    if (!search.loading) pendingScrollTop = null;
    previous = { journals, results: search.results, query: search.query };
  };
  screen.updateJournalLibrary(state);
  return screen;
}

function highlighted(text, words) {
  const children = [];
  let offset = 0;
  for (const [start, end] of journalMatchRanges(text, words)) {
    children.push(document.createTextNode(text.slice(offset, start)), node("mark", { text: text.slice(start, end) }));
    offset = end;
  }
  children.push(document.createTextNode(text.slice(offset)));
  return children;
}

function renderBranch(branch, commands, scope) {
  return [...Array.from(branch.folders.values()).map((child) => folderNode(child, commands, scope)), ...branch.journals.map((journal) => journalButton(journal, commands, scope))];
}

function folderNode(branch, commands, scope) {
  const details = node("details", { className: "mc-journal-folder", dataset: { folderId: branch.folder.id }, children: [
    node("summary", { attrs: { "aria-expanded": "false" }, children: [icon("fa-chevron-right"), icon("fa-folder"), node("strong", { text: branch.folder.name }), node("small", { text: journalBranchCount(branch) })] }),
    node("div", { className: "mc-journal-folder-contents", children: renderBranch(branch, commands, scope) })
  ] });
  scope.listen(details, "toggle", () => details.querySelector(":scope > summary")?.setAttribute("aria-expanded", String(details.open)));
  return details;
}

function journalButton(journal, commands, scope) {

  return node("button", { className: "mc-journal-entry", attrs: { type: "button" }, on: { click: () => void commands.openJournal(journal.id).catch(() => {}) }, children: [
    journal.img ? node("img", { attrs: { src: journal.img, alt: "" } }) : node("span", { className: "mc-journal-entry-icon", children: [icon("fa-book")] }),
    node("span", { children: [node("strong", { text: journal.name }), node("small", { text: localizedCount(commands.localize, "MIKELANDIA_CONTROLS.Journals.PageCount", { one: "{count} page", other: "{count} pages" }, journal.pages.length, commands.readLocale?.() ?? "en") })] }),
    icon("fa-chevron-right")
  ] }, scope);
}

function journalReader(state, commands, scope) {
  const localize = (key, fallback, data) => commands.localize?.(key, fallback, data) ?? fallback;
  const journal = state.journal;
  const pages = journal.pages ?? [];
  const selectedIndex = Math.max(0, pages.findIndex((page) => page.id === state.journalPageId));
  const page = pages[selectedIndex] ?? null;
  const editStatus = node("p", { className: "mc-journal-status is-error", attrs: { role: "status", "aria-live": "polite", hidden: true } });
  let openingEditor = false;
  const editCurrentPage = async (anchor) => {
    if (openingEditor) return;
    openingEditor = true;
    editStatus.hidden = true;
    try {
      if (page?.type !== "text") await commands.openNativeJournalEditor(journal.id, page?.id ?? "");
      else {
        const source = await commands.readJournalText(journal.id, page.id);
        if (scope.disposed || !anchor.isConnected) return;
        openTextEditor(anchor, {
          section: "journal", subjectName: journal.name, label: page.name, iconName: "fa-book",
          richText: true, value: source.value,
          markdown: source.format === 2,
          sourceLabel: source.format === 2 ? "Markdown" : undefined,
          save: value => commands.saveJournalText({ journalId: journal.id, pageId: page.id, value,
            originalValue: source.originalValue, format: source.format }),
          onClose: () => { if (!scope.disposed) void commands.openJournal(journal.id, { pageId: page.id }).catch(() => {}); }
        }, commands, editStatus, scope);
      }
    }
    catch (error) {
      editStatus.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.TheNativeJournalEditorCouldNotBeOpened", "The native Journal editor could not be opened.");
      editStatus.hidden = false;
    } finally { openingEditor = false; }
  };
  return node("section", { className: "mc-journal-reader", children: [
    node("header", { children: [
      node("button", { attrs: { type: "button", "aria-label": localize("MIKELANDIA_CONTROLS.Journals.Back", "Back to journals") }, on: { click: commands.closeJournal }, children: [icon("fa-arrow-left")] }, scope),
      node("div", { children: [node("small", { text: localize("MIKELANDIA_CONTROLS.Journals.Journal", "Journal").toLocaleUpperCase() }), node("h2", { text: journal.name })] }),
      journal.canEdit && (!page || page.canEdit) ? node("button", { className: "mc-journal-native-edit", attrs: { type: "button" }, on: { click: event => void editCurrentPage(event.currentTarget) }, text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Journals.Edit", "Edit") }, scope) : null
    ].filter(Boolean) }),
    editStatus,
    pages.length ? node("nav", { className: "mc-journal-page-nav", attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Journals.PagesAndHeadings", "Journal pages and headings") }, children: [
      node("button", { className: "mc-journal-page-selector", attrs: { type: "button", "aria-expanded": String(Boolean(state.journalMenuOpen)), "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Journals.ChoosePageOrHeading", "Choose Journal page or heading") }, on: { click: commands.toggleJournalMenu }, children: [node("span", { text: page?.name ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Journals.ChoosePage", "Choose page") }), icon("fa-chevron-down")] }, scope),
      state.journalMenuOpen ? node("div", { className: "mc-journal-page-menu", attrs: { "data-mc-back-dismissable": "true", "data-mc-back-kind": "journal-page-menu" }, children: pages.flatMap((entry) => [
        node("button", { className: `mc-journal-page-choice${entry.id === page?.id ? " is-selected" : ""}`, attrs: { type: "button", "aria-current": entry.id === page?.id ? "page" : null, "data-level": String(entry.level ?? 1) }, on: { click: () => commands.selectJournalPage(entry.id) }, children: [node("span", { text: entry.name }), entry.id === page?.id ? icon("fa-check") : null].filter(Boolean) }, scope),
        ...(entry.toc ?? []).map((heading) => node("button", { className: `mc-journal-heading-choice${entry.id === page?.id && heading.slug === state.journalHeading ? " is-selected" : ""}`, attrs: { type: "button", "data-level": String(heading.level) }, on: { click: () => commands.selectJournalHeading(entry.id, heading.slug) }, text: heading.text }, scope))
      ]) }) : null
    ].filter(Boolean) }) : null,
    page ? journalPage(page, state.journalHeading, commands, scope) : node("div", { className: "mc-journal-reader-empty", children: [icon("fa-file-circle-xmark"), node("p", { text: localize("MIKELANDIA_CONTROLS.Journals.Empty", "This journal has no visible pages.") })] }),
    state.journalImage ? renderImageViewer(state.journalImage, commands.closeJournalImage, scope, { localize: commands.localize }) : null
  ].filter(Boolean) });
}

function journalPage(page, selectedHeading, commands, scope) {
  if (page.type === "text") {
    const content = node("article", { className: "mc-journal-rich-text" });
    content.innerHTML = String(page.html ?? "");
    preserveTextLineBreaks(content);
    if (selectedHeading) queueMicrotask(() => {
      if (scope.disposed || !content.isConnected) return;
      const headings = [...content.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter((heading) => !heading.hasAttribute("data-no-toc"));
      const toc = page.toc ?? [];
      const index = toc.findIndex((heading) => heading.slug === selectedHeading);
      const target = [...content.querySelectorAll("[id]")].find((element) => element.id === selectedHeading) ?? headings[index];
      const scroller = content.closest(".mc-viewport");
      if (!target || !scroller) return;
      scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12;
    });
    scope.listen(content, "click", (event) => {
      const image = event.target?.closest?.("img");
      if (!image?.src) return;
      event.preventDefault();
      commands.openJournalImage({ src: image.currentSrc || image.src, name: image.alt || page.name });
    });
    return node("div", { className: "mc-journal-page", children: [node("h3", { text: page.name }), content] });
  }
  if (page.type === "image" && page.src) return node("div", { className: "mc-journal-page mc-journal-image-page", children: [node("h3", { text: page.name }), node("button", { attrs: { type: "button", "aria-label": commands.localize?.("MIKELANDIA_CONTROLS.Journals.Enlarge", `Enlarge ${page.name}`, { name: page.name }) ?? `Enlarge ${page.name}` }, on: { click: () => commands.openJournalImage({ src: page.src, name: page.name }) }, children: [node("img", { attrs: { src: page.src, alt: page.caption || page.name } })] }, scope), page.caption ? node("p", { text: page.caption }) : null].filter(Boolean) });
  return node("div", { className: "mc-journal-page mc-journal-attachment", children: [node("h3", { text: page.name }), page.src ? node("a", { attrs: { href: page.src, target: "_blank", rel: "noopener noreferrer" }, children: [icon(page.type === "video" ? "fa-circle-play" : "fa-file-arrow-up"), node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Journals.OpenAttachment", "Open attachment") })] }) : node("p", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.ThisPageTypeHasNoReadableSource", "This page type has no readable source.") })] });
}
