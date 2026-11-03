import { createMcBackDispatcher } from "/src/ui/navigation/mc-back-dispatcher.mjs";

export async function checkReconnect({ kernel, store, root, f, check, tick, commands, setRecovery, getReloads }) {
  const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
  const viewport = root.querySelector(".mc-viewport");
  const status = root.querySelector(".mc-reconnect-status");
  const back = createMcBackDispatcher({ getState: () => store.state, commands, getRoot: () => root });
  store.dispatch({ type: "mode-transition-started", generation: 1, target: "tablet" });
  await new Promise(resolve => setTimeout(resolve, 280));
  check("mode-transition card remains visible independently of reconnect UI", Number(getComputedStyle(root.querySelector(".mc-mode-transition-card")).opacity) > 0);
  store.dispatch({ type: "mode-transition-finished", generation: 1 });
  for (let i = 0; i < 30; i++) {
    const template = f.actor.items.get("sword");
    const id = `extra-${i}`;
    f.actor.items.push({ ...template, id, uuid: `${f.actor.uuid}.Item.${id}`, name: `Travel gear ${i + 1}`, system: { ...template.system, equipped: false } });
  }
  kernel.refresh();
  commands.selectCharacterTab("inventory"); await tick();
  commands.setCharacterSectionExpanded("gear", true); await tick();
  const scroller = root.querySelector(".mc-character-content-scroller") ?? viewport;
  scroller.scrollTop = 220; await tick();
  check("fixture has scrollable content", scroller.scrollTop > 50);
  const originalTop = scroller.scrollTop;
  const actorId = store.state.selectedActorSourceUuid;
  const sections = JSON.stringify(store.state.characterOpenSections);
  const pane = viewport.firstElementChild;
  // An intact connection never enters recovery merely because visibility changed.
  document.dispatchEvent(new Event("visibilitychange")); await tick();
  check("intact connection keeps the screen ready", !store.state.reconnect && status.hidden && pane === viewport.firstElementChild);
  kernel.beginReconnect(1); await new Promise(resolve => setTimeout(resolve, 135));
  check("disconnect leaves the existing pane mounted", viewport.firstElementChild === pane);
  check("compact status announces reconnect without a modal", !status.hidden && status.textContent.includes("Reconnecting") && status.querySelector('[role="status"]') && !root.querySelector('[aria-modal="true"]:not([hidden])'));
  check("status lives outside the busy reading region", !status.closest('[aria-busy="true"]'));
  check("viewport is readable and scrollable", !viewport.inert && getComputedStyle(viewport).pointerEvents !== "none" && Math.abs(scroller.scrollTop - originalTop) < 2);
  const nav = root.querySelector('[data-route="journals"]');
  nav.click();
  commands.navigate("journals");
  kernel.open("journals");
  back.back();
  check("click, command and Back navigation remain blocked", store.state.route === "characters" && nav.getAttribute("aria-disabled") === "true");
  let rejected = false;
  try { await commands.sendChat("Must not send during recovery"); } catch { rejected = true; }
  check("command guard rejects writes during recovery", rejected);
  const input = document.createElement("input");
  const summary = document.createElement("summary");
  const details = document.createElement("details"); details.append(summary);
  viewport.append(input, details); await tick();
  const typing = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "x" });
  input.dispatchEvent(typing); summary.click();
  check("native input and disclosure activation stay blocked", typing.defaultPrevented && !details.open && input.getAttribute("aria-disabled") === "true");
  input.remove(); details.remove();
  const gate = deferred();
  setRecovery(async () => { await gate.promise; f.actor.name = "Mara returned"; return { applied: true }; });
  const recovering = kernel.resync(1); await tick();
  check("synchronizing uses compact status", status.textContent.includes("Syncing"));
  scroller.scrollTop += 100; await tick();
  const readingTop = scroller.scrollTop;
  check("reading can continue while syncing", readingTop > originalTop);
  const statusBounds = status.getBoundingClientRect(), paneBounds = viewport.getBoundingClientRect();
  check("status does not overlap the reading pane", statusBounds.top >= paneBounds.bottom - 1 || statusBounds.left >= paneBounds.right - 1 || statusBounds.right <= paneBounds.left + 1);
  const originalRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  let finishedWithoutFrames = false;
  try {
    gate.resolve();
    await Promise.race([recovering.then(() => { finishedWithoutFrames = true; }), new Promise(resolve => setTimeout(resolve, 180))]);
    check("recovery finishes even when animation frames are suspended", finishedWithoutFrames);
  } finally { window.requestAnimationFrame = originalRaf; }
  await tick();
  const newScroller = root.querySelector(".mc-character-content-scroller") ?? viewport;
  check("successful recovery restores interaction and fresh data", !store.state.reconnect && status.hidden && root.textContent.includes("Mara returned") && !nav.hasAttribute("aria-disabled"));
  check("actor, tab and disclosures survive recovery", store.state.selectedActorSourceUuid === actorId && store.state.characterTab === "inventory" && JSON.stringify(store.state.characterOpenSections) === sections);
  check("latest reading position survives refreshed data", Math.abs(newScroller.scrollTop - readingTop) < 3);
  // Repeated disconnects must not let an older response remove the new guard.
  const old = deferred(), latest = deferred();
  kernel.beginReconnect(2);
  setRecovery(async () => { await old.promise; return { applied: true }; });
  const oldRun = kernel.resync(2);
  kernel.beginReconnect(3);
  setRecovery(async () => { await latest.promise; return { applied: true }; });
  const latestRun = kernel.resync(3);
  old.resolve(); await oldRun;
  check("stale recovery cannot unlock the current generation", store.state.reconnect?.generation === 3 && viewport.getAttribute("aria-busy") === "true");
  latest.resolve(); await latestRun;
  check("latest generation unlocks after verification", !store.state.reconnect);
  // Permission-filtered snapshot must remove content that no longer resolves.
  const handout = game.journal.get("handout");
  handout.pages.push({ id: "second", name: "Second page", type: "text", toc: { anchor: { text: "Reading anchor", slug: "reading-anchor", level: 2 } }, text: { content: '<h2 id="reading-anchor">Reading anchor</h2>' + "<p>Second page content</p>".repeat(65) }, testUserPermission: () => true });
  commands.navigate("journals"); await commands.openJournal("handout", { pageId: "second" }); await tick();
  commands.selectJournalHeading("second", "reading-anchor"); await tick();
  viewport.scrollTop = 180;
  const journalTop = viewport.scrollTop;
  kernel.beginReconnect(4);
  setRecovery(async () => { handout.pages.get("second").text.content = '<h2 id="reading-anchor">Reading anchor</h2>' + "<p>Updated second page</p>".repeat(65); return { applied: true }; });
  await kernel.resync(4); await tick();
  check(`permitted journal refresh preserves page and reading position (page=${store.state.journalPageId}, heading=${store.state.journalHeading}, top=${viewport.scrollTop}, expected=${journalTop})`, store.state.journalPageId === "second" && store.state.journalHeading === "reading-anchor" && Math.abs(viewport.scrollTop - journalTop) < 2 && root.textContent.includes("Updated second page"));
  kernel.beginReconnect(5);
  setRecovery(async () => { game.journal.length = 0; return { applied: true }; });
  await kernel.resync(5); await tick();
  check("deleted or inaccessible journal is not retained after refresh", !store.state.journal && !root.querySelector(".mc-journal-reader"));
  commands.navigate("characters");
  kernel.beginReconnect(6);
  setRecovery(async () => { f.actor.testUserPermission = () => false; game.user.isGM = false; return { applied: true }; });
  await kernel.resync(6); await tick();
  check("revoked actor access removes the cached character", !store.state.snapshot.selectedActor && !root.textContent.includes("Mara returned"));
  f.actor.testUserPermission = () => true; game.user.isGM = true; kernel.refresh();
  kernel.beginReconnect(7);
  const reloads = getReloads();
  setRecovery(async () => { throw new Error("Controlled recovery failure"); });
  await kernel.resync(7);
  check("failed recovery remains guarded while reload is pending", store.state.reconnect?.phase === "reloading" && viewport.getAttribute("aria-busy") === "true");
  await new Promise(resolve => setTimeout(resolve, 470));
  check("failed recovery retains the existing reload fallback", getReloads() === reloads + 1);
  // Leave a representative syncing screen for the passing capture.
  setRecovery(async () => ({ applied: true }));
  await kernel.resync(7);
  commands.selectCharacterTab("inventory"); await tick();
  kernel.beginReconnect(8);
  setRecovery(() => new Promise(() => {}));
  void kernel.resync(8); await tick();
}
