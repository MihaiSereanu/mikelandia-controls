import { createOfflineStorage, libraryIdentity } from "/src/offline/storage.mjs";
import { actorDocument, offlineHtml } from "/src/offline/content.mjs";
import { mountOfflineLibrary } from "/src/offline/reader.mjs";
import { createOfflineController } from "/src/offline/controller.mjs";
import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";
import { createActor, createGame, createHooks } from "/tests/helpers/foundry.mjs";
import { createWarhammerActor, createWarhammerGame } from "/tests/helpers/warhammer.mjs";
import { createNativeSystemFixture } from "/tests/helpers/native-systems.mjs";
import { createShadowdarkFixture } from "/tests/helpers/shadowdark.mjs";
import { resolveSystemIntegration } from "/src/systems/registry.mjs";
import { createFoundryCommandGateway } from "/src/foundry/commands/command-gateway.mjs";
import { mountCachedApp } from "/src/offline/cached-app.mjs";
const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const wait = async fn => { const end = Date.now() + 4000; while (!await fn()) { if (Date.now() > end) throw new Error("Timed out waiting for offline save"); await tick(); } };
const root = () => document.querySelector(".mc-mobile-app");
try {
  const params = new URLSearchParams(location.search);
  if (params.has("large")) document.documentElement.style.fontSize = "137.5%";
  if (params.has("standalone")) document.documentElement.style.setProperty("--mc-safe-top", "24px");
  const storage = createOfflineStorage();
  for (const entry of await storage.list()) await storage.forget(entry.id);
  const profiles = [];
  for (const system of ["wfrp4e", "shadowdark", "swade", "honor-and-intrigue", "dnd5e"]) {
    const fixture = system === "shadowdark" ? createShadowdarkFixture() : ["swade", "honor-and-intrigue"].includes(system) ? createNativeSystemFixture(system) : null;
    const actor = fixture?.actor ?? (system === "wfrp4e" ? createWarhammerActor() : createActor());
    const game = fixture?.game ?? (system === "wfrp4e" ? createWarhammerGame([actor]) : createGame([actor]));
    if (system === "wfrp4e") { actor.system.details ??= {}; actor.system.details.biography = { value: "Saved notes" }; }
    globalThis.game = game; globalThis.CONFIG = { statusEffects: {} };
    const integration = resolveSystemIntegration(system);
    const commandGateway = createFoundryCommandGateway();
    const view = integration.createActorViewRecord(actor, game.user, actor => commandGateway.capabilitiesForActor(actor));
    const saved = await actorDocument({ ...view, img: "", sourceUuid: actor.uuid }, { html: source => offlineHtml(source), enrich: async (_uuid, source) => source });
    saved.notesHtml = "<p>Saved player notes.</p>";
    const media = [];
    if (system === "wfrp4e") {
      const url = new URL("/mobile-login/icons/mc-192.png", location.origin).href;
      saved.img = saved.view.img = url; media.push({ url, blob: await (await fetch(url)).blob() });
    }
    if (system === "wfrp4e") saved.view.panels.push({ id: "references", label: "References", sections: [{ id: "reference", label: "Rules", kind: "items", rows: [{ id: "rule", label: "Sword", descriptionUuid: "Actor.hero.Item.sword", description: offlineHtml('<p>Public rules. <a class="content-link" data-uuid="Compendium.rules.Item.example">Rules reference</a><a class="inline-roll" data-formula="1d100">Roll</a></p>') }] }] });
    const meta = libraryIdentity(location.origin + "/", { id: system, title: system === "wfrp4e" ? "The Enemy Within" : system, systemId: system }, { id: "player", name: "Matei" });
    const data = { startedAt: 1, savedAt: new Date().toISOString(), actors: [saved], world: meta.world, user: meta.user,
      preferences: { frame: { protectMcStyling: !params.has("unprotected") }, character: { headerArtwork: "off", characterFavouritesEnabled: false } },
      journals: [{ id: "j", name: "Travel Notes", canEdit: true, pages: [{ id: "p", type: "text", name: "The road", sourceUuid: "JournalEntry.j.JournalEntryPage.p", html: "<p>Follow the river.</p>", canEdit: true }, { id: "pdf", name: "Map PDF", type: "pdf" }] }],
      party: null, media, references: [{ key: "direct", id: "Compendium.rules.Item.example", name: "Sword rules", html: '<p>Saved explanation.</p><a class="content-link" data-uuid="unsaved">Further link</a>' }], combat: null };
    if (system === "wfrp4e") {
      const second = JSON.parse(JSON.stringify(saved).replaceAll("Actor.hero", "Actor.second"));
      second.id = second.view.sourceUuid = "Actor.second"; second.view.id = "second";
      second.name = second.view.name = "Lanzo Bergmann"; data.actors.push(second);
      data.incomplete = true; data.warnings = ["Some content unavailable"];
    }
    const record = await storage.enable(meta); await storage.save(meta.id, record.token, data);
    profiles.push({ meta, data, record });
  }
  globalThis.game = undefined;
  const reader = mountOfflineLibrary({ storage }); await reader.refresh();
  document.querySelector("#saved-characters").click();
  const gameCards = [...document.querySelectorAll("#offline-library > section")];
  const warhammer = gameCards.find(card => card.textContent.includes("The Enemy Within"));
  check("one game card lists both available PCs and the player", gameCards.length === profiles.length && warhammer.textContent.includes("Elsa Becker") && warhammer.textContent.includes("Lanzo Bergmann") && warhammer.textContent.includes("Matei"));
  check("game card shows WFRP 5e with Open and Forget and no corrupt separator", warhammer.textContent.includes("WFRP 5e") && !warhammer.textContent.includes("wfrp4e ?") && [...warhammer.querySelectorAll("button")].map(button => button.textContent).join(",") === "Open,Forget");
  const checkToolbar = label => {
    const bar = root().querySelector(".mc-offline-status"), bounds = bar.getBoundingClientRect(), viewport = root().querySelector(".mc-viewport").getBoundingClientRect();
    check(label + " reserves the measured banner height above content", viewport.top >= bounds.bottom - 1 && bounds.height >= 44);
    check(label + " banner text stays contained without the incomplete-content warning", !bar.textContent.includes("Some content unavailable") && [...bar.querySelectorAll("button,strong,time")].every(node => { const rect = node.getBoundingClientRect(); return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1 && rect.right <= bounds.right + 1; }));
  };
  const open = async profile => {
    document.querySelector("#saved-characters").click();
    const section = [...document.querySelectorAll("#offline-library > section")].find(node => node.textContent.includes(profile.meta.world.title));
    section.querySelector("button").click(); await tick();
    await document.fonts.ready; await tick();
    check(profile.meta.world.systemId + " uses the existing app frame without Foundry", Boolean(root()) && !root().textContent.includes("This screen could not open"));
  };
  for (const profile of profiles) {
    await open(profile);
    const expected = profile.data.actors[0].view.panels;
    check(profile.meta.world.systemId + " retains original character tabs", expected ? [...root().querySelectorAll("[data-profile-tab]")].length === expected.length + Number(profile.data.actors[0].view.notesAvailable) : root().querySelectorAll("[data-character-tab]").length >= 5);
    check(profile.meta.world.systemId + " disables Chat", root().querySelector('[data-route="chat"]').disabled);
    checkToolbar(profile.meta.world.systemId + " Character");
    const name = root().querySelector(".mc-native-sheet-identity h2"), chooser = root().querySelector(".mc-native-sheet-identity .mc-character-select-trigger");
    if (name && chooser) check(profile.meta.world.systemId + " long names do not overlap the chooser", name.getBoundingClientRect().right <= chooser.getBoundingClientRect().left + 1);
    let controlsReadOnly = true;
    for (const tab of [...root().querySelectorAll('[role="tab"]')]) {
      tab.click(); await tick();
      controlsReadOnly &&= [...root().querySelectorAll('[data-profile-action],[data-profile-edit],.mc-sheet-item-use,.mc-sheet-card-action,.mc-death-save-roll,.mc-spell-slot-trigger')].every(node => node.disabled || node.hidden);
    }
    check(profile.meta.world.systemId + " keeps mutation controls disabled across every tab", controlsReadOnly);
    check(profile.meta.world.systemId + " tab navigation stays readable", !root().textContent.includes("This screen could not open") && !root().textContent.includes("Saved copies are read-only"));
    if (profile.meta.world.systemId === "wfrp4e") {
      root().querySelector(".mc-character-select-trigger").click(); await tick();
      root().querySelector('[data-actor-source="Actor.second"]').click(); await tick();
      check("existing chooser opens the second PC from the same saved game", root().querySelector(".mc-native-sheet-identity h2").textContent === "Lanzo Bergmann");
      root().querySelector(".mc-character-select-trigger").click(); await tick();
      root().querySelector('[data-actor-source="Actor.hero"]').click(); await tick();
      root().querySelector('[data-profile-tab="references"]').click(); await tick();
      const link = [...root().querySelectorAll("a.content-link")].find(node => node.textContent.includes("Rules reference")); link.click(); await tick();
      check("direct saved rules use the existing reference popover", root().textContent.includes("Saved explanation."));
      [...root().querySelectorAll("a.content-link")].find(node => node.textContent.includes("Further link")).click(); await tick();
      check("deeper unsaved reference is explicit", root().textContent.includes("Unavailable offline"));
      check("inline dice links cannot roll", !root().querySelector("a.inline-roll"));
    }
    root().querySelector('[data-route="settings"]').click(); await tick();
    checkToolbar(profile.meta.world.systemId + " Settings");
    const icons = [...root().querySelectorAll(".mc-settings-primary-heading > i")];
    check(profile.meta.world.systemId + " Settings icons stay centered with native Font Awesome", icons.length >= 3 && icons.every(icon => { const style = getComputedStyle(icon); return ["flex", "inline-flex"].includes(style.display) && style.alignItems === "center" && style.justifyContent === "center"; }));
    if (innerWidth >= 720) { root().querySelector(".mc-tablet-nav-side-toggle").click(); await tick(); checkToolbar(profile.meta.world.systemId + " left tablet navigation"); }
    root().querySelector('[data-route="journals"]').click(); await tick();
    const journal = root().querySelector('[data-journal-id="j"]') ?? [...root().querySelectorAll("button")].find(node => node.textContent.includes("Travel Notes"));
    journal.click(); await tick();
    check(profile.meta.world.systemId + " reuses the Journal reader", root().textContent.includes("Follow the river."));
    check(profile.meta.world.systemId + " omits Journal Edit even with cached owner permissions", !root().querySelector(".mc-journal-native-edit"));
    check(profile.meta.world.systemId + " has no active mutation controls", [...root().querySelectorAll('[data-profile-action],[data-profile-edit],.mc-biography-edit,.mc-journal-native-edit')].every(node => node.disabled || node.hidden));
    root().querySelector(".mc-offline-status button").click();
  }
  const { meta, data, record } = profiles[0];
  const isolated = mountCachedApp({ ...meta, data });
  let rejected = false;
  try { await isolated.commands.execute("ROLL_ABILITY", {}); } catch { rejected = true; }
  check("cached command provider rejects rolls independently of UI controls", rejected);
  isolated.commands.navigate("chat"); check("cached provider cannot navigate to Chat", isolated.store.state.route === "characters"); isolated.dispose();
  await storage.forget(meta.id);
  check("late save cannot resurrect forgotten content", !await storage.save(meta.id, record.token, data));
  check("forgetting a game preserves other systems", Boolean(await storage.get(profiles[1].meta.id)));
  globalThis.Hooks = createHooks();
  let name = "Elsa Becker", allowed = true;
  let readerFailure = false, journalName = "Illustrated Journal", pageName = "Text", journalsAllowed = true;
  const fetchedPortraits = [], progress = [];
  const game = { user: meta.user, world: meta.world, system: { id: "wfrp4e", version: "10" } };
  const session = { read: () => ({ actors: allowed ? [{ sourceUuid: "Actor.hero", name }] : [],
    journals: journalsAllowed ? [{ id: "illustrated", name: journalName, pages: [{ id: "text" }, { id: "image" }] }] : [],
    party: { supplies: false, members: allowed ? [{ id: "friend", name: "Friend", img: "https://example.test/party.svg" },
      { id: "self", name, img: "https://example.test/avatar.svg" }, { id: "missing", name: "Missing portrait", img: "https://example.test/missing.svg" }] : [] } }),
    readOfflineActor: () => ({ ...data.actors[0].view, name, img: "https://example.test/avatar.svg", sourceUuid: "Actor.hero", notesAvailable: false,
      inventory: [{ id: "icon", img: "https://example.test/item.svg" }], description: '<img src="https://example.test/description.svg">' }),
    readOfflineJournalStamp: async () => `${journalName}:${pageName}`,
    readJournal: async () => ({ id: "illustrated", name: journalName, pages: [
      { id: "text", name: pageName, type: "text", html: '<p>Journal text stays saved.</p><img src="https://example.test/journal.svg"><section class="secret"><img src="https://example.test/secret.svg"></section><a class="content-link" data-uuid="Item.reference">Reference</a>' },
      { id: "image", name: "Illustration", type: "image", src: "https://example.test/page.svg" }] }) };
  const scope = createTaskScope("offline-test");
  const controller = createOfflineController({ session, storage, base: location.origin + "/", getGame: () => game, isConnected: () => true,
    prepareReader: async () => { if (readerFailure) throw new Error("Offline page needs updating: /mobile/sw.js returned HTTP 404."); },
    descriptions: { enrich: async ({ uuid, content }) => ({ uuid, html: content ?? "" }),
      preview: async ({ uuid }) => ({ uuid, name: "Rules", html: '<img src="https://example.test/reference.svg">' }) },
    fetch: async url => {
      fetchedPortraits.push(url); if (url.endsWith("/missing.svg")) throw new Error("Missing portrait");
      return new Response('<svg xmlns="http://www.w3.org/2000/svg" onload="evil()" xml:base="https://evil.test/"><script>evil()</script><foreignObject>bad</foreignObject><image href="https://evil.test/a"/><defs><linearGradient id="paint"/></defs><path d="M0 0h10v10z" fill="url(#paint)"/></svg>', { headers: { "content-type": "image/svg+xml" } });
    } });
  controller.watch(scope, state => progress.push(state.message));
  controller.start(scope); await controller.setEnabled(true);
  await wait(async () => (await storage.get(meta.id))?.data?.actors?.[0]?.name === name);
  check("opt-in automatically saves full unopened character models", Boolean((await storage.get(meta.id)).data.actors[0].view.panels));
  check("only PC and Party portrait URLs are downloaded, once each", fetchedPortraits.length === 3 && ["avatar.svg", "party.svg", "missing.svg"].every(name => fetchedPortraits.includes(`https://example.test/${name}`)));
  const portraitSave = (await storage.get(meta.id)).data;
  check("only successful portraits are persisted while Journal text is retained", portraitSave.media.length === 2 && portraitSave.journals[0].pages[0].html.includes("Journal text stays saved."));
  check("portrait progress reaches the final attempt even when a portrait fails", progress.some(message => message.startsWith("Saving images 3 / 3")));
  const svg = await (await storage.get(meta.id)).data.media[0].blob.text();
  check("saved SVGs retain artwork while removing executable and external content", svg.includes("<path") && svg.includes("url(#paint)") && !/evil|script|foreignObject|xml:base/.test(svg));
  pageName = "Letters HANDOUTS"; Hooks.emit("updateJournalEntryPage");
  await wait(async () => (await storage.get(meta.id)).data.media.some(entry => entry.url.endsWith("/journal.svg")));
  check("a matching page saves embedded images without downloading sibling image pages", !(await storage.get(meta.id)).data.media.some(entry => entry.url.endsWith("/page.svg")));
  journalName = "Campaign Handouts"; pageName = "Text"; Hooks.emit("updateJournalEntry");
  await wait(async () => (await storage.get(meta.id)).data.media.some(entry => entry.url.endsWith("/page.svg")));
  const handoutData = (await storage.get(meta.id)).data;
  check("a matching Journal saves both image pages and embedded text images", ["journal.svg", "page.svg"].every(name => handoutData.media.some(entry => entry.url.endsWith("/" + name))));
  check("handout saving excludes secrets, item images and linked-document images", !fetchedPortraits.some(url => /\/(?:secret|item|description|reference)\.svg$/.test(url)));
  const handoutApp = mountCachedApp(await storage.get(meta.id)); handoutApp.commands.navigate("journals");
  await wait(() => root().querySelector('.mc-journal-entry'));
  root().querySelector('.mc-journal-entry').click();
  await wait(() => root().querySelector('.mc-journal-page img[src^="blob:"]'));
  check("saved handout embedded images render from local blobs", Boolean(root().querySelector('.mc-journal-page img[src^="blob:"]'))); handoutApp.dispose();
  const imagePageApp = mountCachedApp(await storage.get(meta.id)); imagePageApp.commands.navigate("journals"); await imagePageApp.commands.openJournal("illustrated", { pageId: "image" }); await tick();
  check("saved image pages render from local blobs", Boolean(root().querySelector('.mc-journal-page img[src^="blob:"]'))); imagePageApp.dispose();
  journalName = "Illustrated Journal"; Hooks.emit("updateJournalEntry");
  await wait(async () => !(await storage.get(meta.id)).data.media.some(entry => entry.url.endsWith("/journal.svg")));
  check("renaming out of Handouts removes images while retaining Journal text", (await storage.get(meta.id)).data.journals[0].pages[0].html.includes("Journal text stays saved."));
  journalName = "Handouts"; Hooks.emit("updateJournalEntry");
  await wait(async () => (await storage.get(meta.id)).data.media.some(entry => entry.url.endsWith("/page.svg")));
  journalsAllowed = false; Hooks.emit("updateUser");
  await wait(async () => (await storage.get(meta.id)).data.journals.length === 0);
  check("revoking a handout Journal removes its images", !(await storage.get(meta.id)).data.media.some(entry => /\/(?:journal|page)\.svg$/.test(entry.url)));
  readerFailure = true; name = "Elsa Updated"; Hooks.emit("updateActor");
  await wait(async () => (await storage.get(meta.id)).data.actors[0]?.name === name);
  check("updates save automatically", true);
  check("reader installation failure reports the missing static worker instead of prescribing relogin", controller.snapshot().message.includes("/mobile/sw.js returned HTTP 404") && !controller.snapshot().message.includes("Rejoin"));
  readerFailure = false;
  allowed = false; Hooks.emit("updateUser"); await wait(async () => (await storage.get(meta.id)).data.actors.length === 0);
  check("revoked characters are removed", true);
  check("revoked PC and Party portraits are removed", (await storage.get(meta.id)).data.media.length === 0);
  await controller.setEnabled(false); check("opting out deletes copies", !await storage.get(meta.id)); scope.dispose();
  const preview = await storage.enable(meta); await storage.save(meta.id, preview.token, data); await reader.refresh(); await open(profiles.find(profile => profile.meta.world.systemId === params.get("system")) ?? profiles[0]);
  check("same phone/tablet sheet stays within viewport", root().scrollWidth <= innerWidth && document.documentElement.scrollWidth <= innerWidth);
  if (params.has("index")) root().querySelector(".mc-offline-status button").click();
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", checks, width: innerWidth, height: innerHeight });
} catch (error) { document.querySelector("#results").textContent = JSON.stringify({ status: "failed", error: error.stack, checks, width: innerWidth, height: innerHeight }); }
