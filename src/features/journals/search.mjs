import { buildJournalTree } from "./model.mjs";
export const normalizeJournalSearch = value => String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
export const journalSearchWords = query => normalizeJournalSearch(query).trim().split(/\s+/u).filter(Boolean);

// Keep original offsets so accented characters and combining marks highlight correctly.
export function journalMatchRanges(text, words) {
  let normalized = "";
  const offsets = [];
  let offset = 0;
  for (const character of text) {
    const folded = normalizeJournalSearch(character);
    for (let i = 0; i < folded.length; i++) offsets.push(offset);
    normalized += folded;
    offset += character.length;
  }
  offsets.push(text.length);
  const ranges = [];
  for (const word of words) {
    for (let start = normalized.indexOf(word); start >= 0; start = normalized.indexOf(word, start + Math.max(1, word.length))) {
      ranges.push([offsets[start], offsets[start + word.length]]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  return ranges.reduce((merged, range) => {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
    return merged;
  }, []);
}

export function searchJournalIndex(index, query) {
  const words = journalSearchWords(query);
  if (!words.length) return [];
  const ordered = branch => [...[...branch.folders.values()].flatMap(ordered), ...branch.journals];
  return ordered(buildJournalTree(index)).flatMap(journal => {
    const pages = journal.pages.flatMap(page => {
      const body = page.text ?? "";
      const haystack = normalizeJournalSearch(`${journal.name} ${page.name} ${body}`);
      if (!words.every(word => haystack.includes(word))) return [];
      const first = journalMatchRanges(body, words)[0]?.[0];
      const start = first === undefined ? 0 : Math.max(0, first - 60);
      const excerpt = first === undefined ? "" : `${start ? "\u2026" : ""}${body.slice(start, start + 180)}${body.length > start + 180 ? "\u2026" : ""}`;
      return [{ ...page, excerpt }];
    });
    return pages.length || (!journal.pages.length && words.every(word => normalizeJournalSearch(journal.name).includes(word)))
      ? [{ ...journal, pages }] : [];
  });
}
