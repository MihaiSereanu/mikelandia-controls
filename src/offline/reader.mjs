import { createOfflineStorage, OFFLINE_VERSION } from "./storage.mjs";
import { mountCachedApp } from "./cached-app.mjs";
import { offlineSystemLabel } from "./content.mjs";

/** Pre-login catalogue only. Saved games mount the existing companion app. */
export function mountOfflineLibrary({ document = globalThis.document, storage = null, window = globalThis.window } = {}) {
  const ownsStorage = !storage; storage ??= createOfflineStorage();
  const trigger = document.getElementById("saved-characters"), host = document.getElementById("offline-library"), login = document.querySelector(".login-card");
  let libraries = [], opened = false, disposed = false, app, selectedId;
  const node = (tag, text) => { const result = document.createElement(tag); if (text !== undefined) result.textContent = text; return result; };
  const button = (label, action) => { const result = node("button", label); result.type = "button"; result.addEventListener("click", action); return result; };
  const status = node("p"); status.setAttribute("role", "status");
  const links = [new URL("../../assets/mobile.css", import.meta.url), new URL("../../../../fonts/fontawesome/css/all.min.css", import.meta.url)].map(url => {
    const link = node("link"); link.rel = "stylesheet"; link.href = url.href; document.head.append(link); return link;
  });
  const stopApp = () => { app?.dispose(); app = null; selectedId = null; for (const link of document.querySelectorAll('link[href*="login.css"]')) link.disabled = false; };
  const showIndex = () => {
    stopApp(); host.hidden = false; document.body.classList.add("mc-offline-open");
    host.replaceChildren(button("Back to login", close), node("h1", "Offline Library"), node("p", "Read-only games saved in this browser. Anyone using this browser profile can read them."), status);
    if (!libraries.length) host.append(node("p", "No games saved yet. Join a game and enable Remember on this device in Settings."));
    for (const library of libraries) {
      const section = node("section");
      const characters = node("ul"); characters.className = "offline-pc-list";
      for (const actor of library.data?.actors ?? []) characters.append(node("li", actor.name));
      const actions = node("div"); actions.className = "offline-game-actions";
      actions.append(button("Open", () => openGame(library.id)), button("Forget", () => forget(library)));
      section.append(node("h2", library.world.title), node("p", `Player: ${library.user.name}`), node("p", offlineSystemLabel(library)),
        node("h3", "Available PCs"), characters.childElementCount ? characters : node("p", "No characters saved yet."),
        node("p", library.data?.savedAt ? `Saved ${new Date(library.data.savedAt).toLocaleString()}` : "First save has not finished."),
        actions); host.append(section);
    }
    window.scrollTo(0, 0);
  };
  const openGame = (id, previousState = null, scrollTop = 0) => {
    const library = libraries.find(entry => entry.id === id);
    if (!library?.data) { status.textContent = "Join this game to finish the first save."; return; }
    if (library.version !== OFFLINE_VERSION || library.data.actors.some(actor => !actor.view)) { status.textContent = "Rejoin this game as the same player to update this saved copy."; return; }
    stopApp(); selectedId = id; host.hidden = true; document.body.classList.remove("mc-offline-open");
    for (const link of document.querySelectorAll('link[href*="login.css"]')) link.disabled = true;
    app = mountCachedApp(library, { onClose: showIndex });
    if (previousState) {
      app.commands.selectActor(previousState.selectedActorSourceUuid);
      app.commands.selectCharacterTab(previousState.characterTab);
      app.commands.navigate(previousState.route);
      if (previousState.journal) void app.commands.openJournal(previousState.journal.id, { pageId: previousState.journalPageId });
      const viewport = document.querySelector(".mc-viewport"); if (viewport) viewport.scrollTop = scrollTop;
    }
  };
  const forget = async library => {
    if (!window.confirm(`Forget ${library.world.title} for ${library.user.name}, including all saved PCs and Journals, and turn off automatic saving?`)) return;
    try { await storage.forget(library.id); channel?.postMessage({ id: library.id }); await refresh(); showIndex(); status.textContent = "Saved copies deleted. Automatic saving is off."; }
    catch { status.textContent = "Could not delete saved copies. Try again."; }
  };
  function close() { opened = false; stopApp(); host.hidden = true; login.hidden = false; document.body.classList.remove("mc-offline-open"); trigger.focus(); }
  const refresh = async () => {
    try {
      const next = await storage.list(); if (disposed) return;
      libraries = next.filter(entry => entry.enabled).sort((a, b) => a.world.title.localeCompare(b.world.title) || a.user.name.localeCompare(b.user.name));
      trigger.textContent = "Offline Library";
      if (selectedId && !libraries.some(entry => entry.id === selectedId)) showIndex();
    } catch { status.textContent = "This browser cannot access offline storage."; }
  };
  const open = () => { opened = true; login.hidden = true; showIndex(); };
  trigger.addEventListener("click", open);
  let channel;
  if (typeof window.BroadcastChannel === "function") {
    channel = new window.BroadcastChannel("mikelandia-offline-preferences");
    channel.onmessage = async () => {
      const id = selectedId, state = app?.store.state, top = document.querySelector(".mc-viewport")?.scrollTop ?? 0;
      await refresh();
      if (id && libraries.some(entry => entry.id === id)) openGame(id, state, top);
      else if (opened) showIndex();
    };
  }
  window.addEventListener("focus", refresh); void refresh();
  return { refresh, dispose() { disposed = true; stopApp(); links.forEach(link => link.remove()); channel?.close(); trigger.removeEventListener("click", open); window.removeEventListener("focus", refresh); if (ownsStorage) void storage.close(); } };
}
