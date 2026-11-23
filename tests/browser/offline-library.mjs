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
      preferences: { frame: { protectMcStyling: true }, character: { headerArtwork: "off", characterFavouritesEnabled: false } },
      journals: [{ id: "j", name: "Travel Notes", canEdit: false, pages: [{ id: "p", type: "text", name: "The road", sourceUuid: "JournalEntry.j.JournalEntryPage.p", html: "<p>Follow the river.</p>", canEdit: false }, { id: "pdf", name: "Map PDF", type: "pdf" }] }],
      party: null, media, references: [{ key: "direct", id: "Compendium.rules.Item.example", name: "Sword rules", html: '<p>Saved explanation.</p><a class="content-link" data-uuid="unsaved">Further link</a>' }], combat: null };
    const record = await storage.enable(meta); await storage.save(meta.id, record.token, data);
    profiles.push({ meta, data, record });
  }
  globalThis.game = undefined;
  const reader = mountOfflineLibrary({ storage }); await reader.refresh();
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
      root().querySelector('[data-profile-tab="references"]').click(); await tick();
      const link = [...root().querySelectorAll("a.content-link")].find(node => node.textContent.includes("Rules reference")); link.click(); await tick();
      check("direct saved rules use the existing reference popover", root().textContent.includes("Saved explanation."));
      [...root().querySelectorAll("a.content-link")].find(node => node.textContent.includes("Further link")).click(); await tick();
      check("deeper unsaved reference is explicit", root().textContent.includes("Unavailable offline"));
      check("inline dice links cannot roll", !root().querySelector("a.inline-roll"));
    }
    root().querySelector('[data-route="journals"]').click(); await tick();
    const journal = root().querySelector('[data-journal-id="j"]') ?? [...root().querySelectorAll("button")].find(node => node.textContent.includes("Travel Notes"));
    journal.click(); await tick();
    check(profile.meta.world.systemId + " reuses the Journal reader", root().textContent.includes("Follow the river."));
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
  let readerFailure = false;
  const fetchedPortraits = [], progress = [];
  const game = { user: meta.user, world: meta.world, system: { id: "wfrp4e", version: "10" } };
  const session = { read: () => ({ actors: allowed ? [{ sourceUuid: "Actor.hero", name }] : [],
    journals: [{ id: "illustrated", name: "Illustrated Journal", pages: [{ id: "text" }, { id: "image" }] }],
    party: { supplies: false, members: allowed ? [{ id: "friend", name: "Friend", img: "https://example.test/party.svg" },
      { id: "self", name, img: "https://example.test/avatar.svg" }, { id: "missing", name: "Missing portrait", img: "https://example.test/missing.svg" }] : [] } }),
    readOfflineActor: () => ({ ...data.actors[0].view, name, img: "https://example.test/avatar.svg", sourceUuid: "Actor.hero", notesAvailable: false,
      inventory: [{ id: "icon", img: "https://example.test/item.svg" }], description: '<img src="https://example.test/description.svg">' }),
    readOfflineJournalStamp: async () => "current",
    readJournal: async () => ({ id: "illustrated", name: "Illustrated Journal", pages: [
      { id: "text", name: "Text", type: "text", html: '<p>Journal text stays saved.</p><img src="https://example.test/journal.svg"><a class="content-link" data-uuid="Item.reference">Reference</a>' },
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
  check("portrait progress reaches the final attempt even when a portrait fails", progress.some(message => message.startsWith("Saving portraits 3 / 3")));
  const svg = await (await storage.get(meta.id)).data.media[0].blob.text();
  check("saved SVGs retain artwork while removing executable and external content", svg.includes("<path") && svg.includes("url(#paint)") && !/evil|script|foreignObject|xml:base/.test(svg));
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
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", checks, width: innerWidth, height: innerHeight });
} catch (error) { document.querySelector("#results").textContent = JSON.stringify({ status: "failed", error: error.stack, checks, width: innerWidth, height: innerHeight }); }
