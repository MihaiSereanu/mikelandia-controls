import { localizedText, localizedCount } from "../../ui/localized-text.mjs";
import { icon, node } from "../../ui/dom.mjs";
import { renderImageViewer } from "../../ui/image-viewer.mjs";
import { buildJournalTree, journalBranchCount } from "./model.mjs";

export function renderJournals({ state, commands, scope }) {
  if (state.journal) return journalReader(state, commands, scope);
  const journals = state.snapshot?.journals ?? [];
  const localize = (key, fallback, data) => commands.localize?.(key, fallback, data) ?? fallback;
  const status = node("p", { className: `mc-journal-status${state.journalError ? " is-error" : ""}`, attrs: { role: "status", "aria-live": "polite" }, text: state.journalLoading ? localize("MIKELANDIA_CONTROLS.Journals.Opening", "Opening journal…") : localize(state.journalError, state.journalError) });
  return node("section", { className: "mc-list-screen mc-journal-library", attrs: { "aria-busy": String(Boolean(state.journalLoading)) }, children: [
    node("header", { children: [node("div", { children: [node("small", { text: localize("MIKELANDIA_CONTROLS.Journals.Library", "Library").toLocaleUpperCase() }), node("h2", { text: localize("MIKELANDIA_CONTROLS.Journals.Title", "Journals") })] }), node("span", { className: "mc-count", text: journals.length })] }),
    status,
    journals.length ? node("div", { className: "mc-journal-tree", children: renderBranch(buildJournalTree(journals), commands, scope) }) : node("div", { className: "mc-empty", children: [icon("fa-book-open"), node("p", { text: localize("MIKELANDIA_CONTROLS.Journals.None", "No visible journals.") })] })
  ] });
}

function renderBranch(branch, commands, scope) {
  return [...Array.from(branch.folders.values()).map((child) => folderNode(child, commands, scope)), ...branch.journals.map((journal) => journalButton(journal, commands, scope))];
}

function folderNode(branch, commands, scope) {
  const details = node("details", { className: "mc-journal-folder", children: [
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
  const editCurrentPage = async () => {
    editStatus.hidden = true;
    try { await commands.openNativeJournalEditor(journal.id, page?.id ?? ""); }
    catch (error) {
      editStatus.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.TheNativeJournalEditorCouldNotBeOpened", "The native Journal editor could not be opened.");
      editStatus.hidden = false;
    }
  };
  return node("section", { className: "mc-journal-reader", children: [
    node("header", { children: [
      node("button", { attrs: { type: "button", "aria-label": localize("MIKELANDIA_CONTROLS.Journals.Back", "Back to journals") }, on: { click: commands.closeJournal }, children: [icon("fa-arrow-left")] }, scope),
      node("div", { children: [node("small", { text: localize("MIKELANDIA_CONTROLS.Journals.Journal", "Journal").toLocaleUpperCase() }), node("h2", { text: journal.name })] }),
      journal.canEdit && (!page || page.canEdit) ? node("button", { className: "mc-journal-native-edit", attrs: { type: "button" }, on: { click: () => void editCurrentPage() }, text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Journals.Edit", "Edit") }, scope) : null
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
