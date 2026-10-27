/** Match native permissions and the storage rows hidden by journal modules. */
export function isJournalVisible(journal, user, game = globalThis.game) {
  if (!canObserveJournalDocument(journal, user)) return false;
  if (game?.modules?.get("sequencer")?.active && journal.name === "sequencerDatabase") return false;
  if (!game?.modules?.get("calendaria")?.active) return true;
  try {
    if (user?.isGM && game.settings?.get("calendaria", "devMode")) return true;
  } catch { /* An unavailable setting must not reveal internal records. */ }
  const flags = journal.flags?.calendaria;
  if (flags?.isCalendarNote || flags?.isCalendarJournal) return false;
  const seen = new Set();
  let folder = journal.folder;
  while (folder && !seen.has(folder)) {
    seen.add(folder);
    if (typeof folder === "string") folder = game?.folders?.get(folder);
    if (!folder) break;
    const flags = folder.flags?.calendaria;
    if (flags?.isCalendarNotesFolder || flags?.isCalendarFolder) return false;
    folder = folder.folder ?? folder.parent;
  }
  return true;
}

export function isJournalPageVisible(page, journal, user, sheet = journal?.sheet) {
  if (!canObserveJournalDocument(page, user)) return false;
  try {
    return sheet?.isPageVisible?.(page) ?? true;
  } catch {
    return false;
  }
}

function canObserveJournalDocument(document, user) {
  if (!document || !user) return false;
  try {
    return document.testUserPermission?.(user, "OBSERVER") ?? document.visible ?? false;
  } catch {
    return false;
  }
}
