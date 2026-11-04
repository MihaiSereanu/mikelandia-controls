import { journalSearchTextFromHtml, readJournalSearchText } from "/src/foundry/journals/journal-search-text.mjs";
const wait = () => new Promise(resolve => setTimeout(resolve, 320));
export async function checkJournalSearch({ root, store, hooks, journal, page, check }) {
  const original = page.text.content;
  const extracted = journalSearchTextFromHtml('<p title="attribute-only">caf&eacute; <b>tower</b></p><p>next</p><section class="secret">unreadable</section><section class="secret revealed">revealed</section><script>unsafe</script><span hidden>hidden</span>@UUID[secret-id]{Authored label} @Embed[secret-id] [[1d20]]{Roll label}');
  check("search extracts readable authored text with block boundaries and native secret rules", extracted === 'caf\u00e9 tower next revealed Authored label Roll label');
  check("owners can search their readable secrets", journalSearchTextFromHtml('<section class="secret">owned</section>', { secrets: true }) === 'owned');
  const converter = globalThis.TextPageSheet;
  globalThis.foundry.utils ??= {};
  const cleanHTML = globalThis.foundry.utils.cleanHTML;
  globalThis.foundry.utils.cleanHTML = value => value;
  globalThis.TextPageSheet = { _converter: { makeHtml: value => `<p>${value}</p>` } };
  check("Markdown search uses source instead of stale HTML", readJournalSearchText({ text: { format: 2, markdown: 'Current source', content: 'stale cache' } }) === 'Current source');
  globalThis.TextPageSheet = converter;
  globalThis.foundry.utils.cleanHTML = cleanHTML;
  page.text.content = '<p>The old tower stands beside a caf&eacute;.</p><section class="secret">forbiddenword</section>';
  hooks.emit('updateJournalEntryPage', { ...page, parent: journal }, { 'text.content': page.text.content });
  const input = root.querySelector('.mc-journal-search-input');
  const search = async query => { input.value = query; input.dispatchEvent(new Event('input', { bubbles: true })); await wait(); };
  input.focus(); await search('OLD cafe');
  check("search finds content and ignores case and accents", root.querySelectorAll('.mc-journal-search-result').length === 1);
  check("typing and async results preserve input identity and focus", root.querySelector('.mc-journal-search-input') === input && document.activeElement === input);
  check("result excerpts highlight authored matches safely", root.querySelectorAll('.mc-journal-search-excerpt mark').length === 2 && !root.querySelector('.mc-journal-search-result section.secret'));
  check("search and result touch targets fit both layouts", input.getBoundingClientRect().height >= 44 && root.querySelector('.mc-journal-search-result').getBoundingClientRect().height >= 44 && document.documentElement.scrollWidth <= innerWidth + 1);
  const beforeLayoutCheck = store.state.journalSearch;
  const protectedStyle = root.hasAttribute('data-mc-style-authority');
  for (const protectedMode of [false, true]) {
    root.toggleAttribute('data-mc-style-authority', protectedMode);
    for (const fontSize of [16, 22]) {
      root.style.setProperty('font-size', `${fontSize}px`, 'important');
      journalSearchLayoutPreview(store, journal.id, page.id);
      checkJournalSearchLayout({ root, check, label: `Search layout protection=${protectedMode}, font=${fontSize}` });
    }
  }
  root.style.removeProperty('font-size');
  root.toggleAttribute('data-mc-style-authority', protectedStyle);
  store.dispatch({ type: "journal-search-changed", search: beforeLayoutCheck });
  root.querySelector('.mc-journal-search-result').click(); await wait();
  check("result opens the exact matching page", store.state.journalPageId === page.id && !!root.querySelector('.mc-journal-reader'));
  root.querySelector('.mc-journal-reader header button').click(); await wait();
  check("return from reader retains the query and results", root.querySelector('.mc-journal-search-input').value === 'OLD cafe' && !!root.querySelector('.mc-journal-search-result'));
  const restored = root.querySelector('.mc-journal-search-input');
  restored.focus(); restored.setSelectionRange(1, 4);
  page.text.content = '<p>The replacement text.</p>';
  hooks.emit('updateJournalEntryPage', { ...page, parent: journal }, { 'text.content': page.text.content });
  check("body-only edits immediately withdraw stale results", root.querySelectorAll('.mc-journal-search-result').length === 0);
  await wait();
  check("body-only edits rebuild without losing input focus", !root.querySelector('.mc-journal-search-result') && document.activeElement === restored && restored.selectionStart === 1 && restored.selectionEnd === 4 && /No matching/.test(root.querySelector('.mc-journal-status').textContent));
  restored.value = 'shared replacement'; restored.dispatchEvent(new Event('input', { bubbles: true })); await wait();
  check("matches combine Journal title and page body", !!root.querySelector('.mc-journal-search-result'));
  root.querySelector('[data-route="chat"]').click(); await wait(); root.querySelector('[data-route="journals"]').click(); await wait();
  check("search survives tab navigation", root.querySelector('.mc-journal-search-input').value === 'shared replacement');
  const originalLength = journal.pages.length;
  for (let i = 0; i < 20; i++) journal.pages.push({ ...page, id: `extra-${i}`, name: `Extra page ${i}`, text: { content: '<p>Replacement text in another page.</p>' } });
  hooks.emit('updateJournalEntry', journal, {}); await wait();
  const viewport = root.querySelector('.mc-viewport'); viewport.scrollTop = 350;
  const priorTop = viewport.scrollTop;
  hooks.emit('updateJournalEntryPage', { ...page, parent: journal }, { 'text.content': page.text.content });
  check("refresh withdraws results while retaining results scroll", !root.querySelector('.mc-journal-search-result') && Math.abs(viewport.scrollTop - priorTop) < 2);
  await wait();
  check("rebuilt results retain the reader's results position", Math.abs(viewport.scrollTop - priorTop) < 2);
  journal.pages.splice(originalLength);
  hooks.emit('updateJournalEntry', journal, {}); await wait();
  store.dispatch({ type: "journal-search-changed", search: { ...store.state.journalSearch, results: [], error: "fixture failure" } });
  check("failed search exposes an accessible status and Retry", root.querySelector('.mc-journal-status').getAttribute('role') === 'status' && !root.querySelector('.mc-journal-library > button').hidden);
  root.querySelector('.mc-journal-library > button').click(); await wait();
  check("Retry rebuilds results after failure", !!root.querySelector('.mc-journal-search-result') && !store.state.journalSearch.error);
  root.querySelector('.mc-journal-search button').click(); await wait();
  check("Clear restores folder tree and focuses search", !!root.querySelector('.mc-journal-tree') && !root.querySelector('.mc-journal-search-input').value && document.activeElement === root.querySelector('.mc-journal-search-input'));
  page.text.content = original;
  hooks.emit('updateJournalEntryPage', { ...page, parent: journal }, { 'text.content': original });
  await wait();
}


export function journalSearchLayoutPreview(store, journalId, pageId) {
  store.dispatch({ type: "journal-search-changed", search: { query: "extra", loading: false, error: "", results: [
    { id: journalId, name: "Homebrew Feats", pages: [
      { id: pageId, name: "FIGHTER FEATS", excerpt: "After rest, you can skip your turn to allow an ally to take an extra turn. Champion. When attacking, rolls of 19 also count as critical hits. Extra Attack. You can make two attacks." },
      { id: pageId, name: "PRIEST FEATS", excerpt: "Your Turn Undead also affects elementals, demons, and other extraplanar creatures in addition to undead. Some creatures return to their original planes when destroyed. Consequences vary." }
    ] },
    { id: journalId, name: "Extra options for exploring distant realms and returning safely to the campaign's home region", pages: [
      { id: pageId, name: "Extra choices for characters travelling through unfamiliar lands and meeting their inhabitants", excerpt: "Take extra care when travelling beyond familiar roads. Villagers can explain which routes are passable and where to find shelter. Keep enough supplies for the return journey." }
    ] }
  ] } });
}

export function checkJournalSearchLayout({ root, check, label }) {
  const inside = (inner, outer) => inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1 && inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
  const contentBounds = element => {
    const range = document.createRange(); range.selectNodeContents(element);
    return range.getBoundingClientRect();
  };
  const headings = [...root.querySelectorAll('.mc-journal-search-heading')];
  const cards = [...root.querySelectorAll('.mc-journal-search-result')];
  check(`${label}: heading text fits inside its button`, headings.every(el => inside(contentBounds(el), el.getBoundingClientRect())));
  check(`${label}: title and multi-line excerpt fit inside each card`, cards.every(card => {
    const box = card.getBoundingClientRect();
    const title = card.querySelector('strong'), excerpt = card.querySelector('.mc-journal-search-excerpt');
    return inside(contentBounds(title), box) && inside(contentBounds(excerpt), box)
      && contentBounds(title).bottom <= contentBounds(excerpt).top + 1;
  }));
  const rows = [...root.querySelectorAll('.mc-journal-search-heading, .mc-journal-search-result')];
  check(`${label}: adjacent headings and results never overlap`, rows.every((row, i) => !i || rows[i-1].getBoundingClientRect().bottom <= row.getBoundingClientRect().top + 1));
  check(`${label}: long result text stays within the viewport width`, root.querySelector('.mc-viewport').scrollWidth <= root.querySelector('.mc-viewport').clientWidth + 1);
}
