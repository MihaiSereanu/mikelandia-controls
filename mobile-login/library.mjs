const moduleUrl = new URL("../modules/mikelandia-controls/src/offline/reader.mjs", import.meta.url);
try {
  const { mountOfflineLibrary } = await import(moduleUrl);
  const library = mountOfflineLibrary();
  addEventListener("pagehide", () => library.dispose(), { once: true });
} catch {
  const button = document.getElementById("saved-characters");
  button.addEventListener("click", () => { document.getElementById("status").textContent = "Join a game with Mikelandia Controls while online to prepare saved-character access on this browser."; });
}
