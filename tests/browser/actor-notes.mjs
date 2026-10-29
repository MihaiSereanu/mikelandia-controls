import { renderCharacters } from "/src/features/characters/presenter.mjs";
import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";
import { createFoundryBiographyGateway } from "/src/foundry/actors/biography-gateway.mjs";
import { createFoundryCommandGateway } from "/src/foundry/commands/command-gateway.mjs";
import { createFoundrySessionGateway } from "/src/foundry/session/session-gateway.mjs";
import { createActor, createHooks } from "/tests/helpers/foundry.mjs";
import { createWarhammerActor, createWarhammerGame } from "/tests/helpers/warhammer.mjs";
import { createShadowdarkFixture } from "/tests/helpers/shadowdark.mjs";

const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
try {
  for (const systemId of ["wfrp4e", "shadowdark"]) {
    const scope = createTaskScope(`notes-${systemId}`);
    const fixture = systemId === "shadowdark" ? createShadowdarkFixture() : null;
    const actor = fixture?.actor ?? createWarhammerActor();
    if (fixture) actor.system.notes = "<p>Existing notes</p>";
    else actor.system.details = { biography: { value: "<p>Existing notes</p>" }, gmnotes: { value: "GM secret" },
      "personal-ambitions": { "short-term": "Keep short", "long-term": "" }, "party-ambitions": { "short-term": "Keep party short", "long-term": "" } };
    const get = () => fixture ? actor.system.notes : actor.system.details.biography.value;
    const set = value => { if (fixture) actor.system.notes = value; else actor.system.details.biography.value = value; };
    let writes = 0, writeMode = "immediate", releaseWrite;
    const nativeWrites = [];
    actor.update = async changes => {
      if (writeMode === "deferred") await new Promise(resolve => { releaseWrite = resolve; });
      if (writeMode === "rejected") throw new Error("Native write rejected");
      writes++; nativeWrites.push(changes);
      for (const [path, value] of Object.entries(changes)) {
        const keys = path.split(".");
        keys.slice(0, -1).reduce((parent, key) => parent[key], actor)[keys.at(-1)] = value;
      }
      Hooks.emit("updateActor", actor, changes);
    };
    globalThis.game = fixture?.game ?? createWarhammerGame([actor]);
    let use5e = false;
    if (!fixture) {
      const getSetting = game.settings.get;
      game.settings.get = (namespace, key) => namespace === "wfrp4e" && key === "editionSettings" ? { use5e } : getSetting(namespace, key);
    }
    const read = createFoundryBiographyGateway({ getTextEditor: () => ({ enrichHTML: async value => value }) });
    const gateway = createFoundryCommandGateway();
    globalThis.Hooks = fixture?.hooks ?? createHooks();
    const secondActor = createActor({ id: "second", uuid: "Actor.second", name: "Second adventurer", type: "unsupported",
      folder: { id: "party", name: "Adventurers", sort: 0 } });
    game.actors.push(secondActor);
    game.user.character = actor;
    const session = createFoundrySessionGateway({ capabilitiesForActor: (actor, user) => gateway.capabilitiesForActor(actor, user) });
    let snapshot = session.read(), portraitImage = null;
    let screen;
    const main = document.querySelector("main");
    const commands = { localize: (_key, fallback) => fallback, readCharacterBiography: source => read.read({ actorSourceUuid: source }),
      execute: async (name, payload) => { const result = await gateway.execute(name, payload); return result; },
      selectCharacterTab: () => {}, openCharacterPortrait: image => { portraitImage = image; render(); },
      closeCharacterPortrait: () => { portraitImage = null; render(); },
      selectActor: source => { snapshot = session.selectCharacterSource(source); render(); } };
    const render = () => {
      const config = { state: { snapshot, characterTab: "notes", portraitImage }, commands, scope };
      screen = screen ? screen.__mcUpdateCharacter(config) : renderCharacters(config);
      if (main.firstElementChild !== screen) main.replaceChildren(screen);
    };
    render();
    session.watch(scope, next => { snapshot = next; render(); }, error => { throw error; });
    await tick();
    check(`${systemId} no literal null child`, ![...screen.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.includes("null")));
    check(`${systemId} bottom folder list is replaced by closed header dropdown`, !main.querySelector(".mc-character-menu-inline") && main.querySelector(".mc-character-menu").hidden);
    main.querySelector(".mc-character-select-trigger").click();
    check(`${systemId} dropdown opens with folder grouping`, !main.querySelector(".mc-character-menu").hidden && main.querySelector(".mc-character-menu-folder").textContent.includes("Adventurers"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    check(`${systemId} Escape dismisses dropdown`, main.querySelector(".mc-character-menu").hidden);
    main.querySelector(".mc-character-select-trigger").click();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    check(`${systemId} outside tap dismisses dropdown`, main.querySelector(".mc-character-menu").hidden);
    main.querySelector(".mc-native-portrait-button").click(); await tick();
    check(`${systemId} portrait opens full image viewer`, !!main.querySelector(".mc-image-viewer"));
    main.querySelector(".mc-image-viewer header button").click(); await tick();
    check(`${systemId} image viewer closes`, !main.querySelector(".mc-image-viewer"));
    check(`${systemId} Notes tab uses native text and excludes GM notes`, !!main.querySelector('[data-profile-tab="notes"][aria-selected="true"]') && main.textContent.includes("Existing notes") && !main.textContent.includes("GM secret"));
    main.querySelector(".mc-biography-edit").click(); await tick();
    check(`${systemId} shared editor opens and focuses text`, document.activeElement === main.querySelector("textarea"));
    main.querySelector("textarea").value = "Cancelled";
    main.querySelector(".mc-modal-button.is-secondary").click();
    check(`${systemId} Cancel preserves native notes`, writes === 0 && get().includes("Existing") && !main.querySelector("textarea"));
    main.querySelector(".mc-biography-edit").click();
    main.querySelector("textarea").value = "<p>Saved notes</p>";
    main.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
    check(`${systemId} Save updates exact native notes`, writes === 1 && get() === "<p>Saved notes</p>" && !main.querySelector("textarea"));
    check(`${systemId} Save refreshes displayed text through session hooks`, main.querySelector(".mc-character-biography-prose").textContent === "Saved notes");
    main.querySelector(".mc-biography-edit").click();
    check(`${systemId} reopening editor reads latest saved native text`, main.querySelector("textarea").value === "<p>Saved notes</p>");
    main.querySelector("textarea").value = "<p>Second save</p>";
    main.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
    check(`${systemId} second save works without refresh`, writes === 2 && !main.querySelector("textarea") && main.querySelector(".mc-character-biography-prose").textContent === "Second save");
    writeMode = "deferred";
    main.querySelector(".mc-biography-edit").click();
    const pendingInput = main.querySelector("textarea");
    pendingInput.value = "<p>Delayed save</p>";
    main.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
    actor.name += " Updated";
    Hooks.emit("updateActor", actor, { name: actor.name }); await tick();
    check(`${systemId} pending native write survives actor refresh and disables resubmit`, main.querySelector("textarea") === pendingInput && pendingInput.disabled && main.querySelector(".mc-biography-editor").getAttribute("aria-busy") === "true");
    releaseWrite(); await tick();
    check(`${systemId} delayed write settles once and unlocks editor`, writes === 3 && !main.querySelector("textarea") && main.querySelector(".mc-character-biography-prose").textContent === "Delayed save");
    writeMode = "rejected";
    main.querySelector(".mc-biography-edit").click();
    main.querySelector("textarea").value = "<p>Retried save</p>";
    main.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
    check(`${systemId} rejected write retains draft and restores controls`, writes === 3 && main.querySelector("textarea").value === "<p>Retried save</p>" && !main.querySelector("textarea").disabled && main.querySelector(".mc-biography-editor-status").textContent === "Native write rejected");
    writeMode = "immediate";
    main.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
    check(`${systemId} retry after rejected write succeeds and clears busy guard`, writes === 4 && !main.querySelector("textarea") && main.querySelector(".mc-character-biography-prose").textContent === "Retried save");
    main.querySelector(".mc-biography-edit").click();
    const draftInput = main.querySelector("textarea");
    draftInput.value = "My draft";
    await tick(); draftInput.focus(); draftInput.setSelectionRange(2, 5);
    set("Other player update");
    Hooks.emit("updateActor", actor, { [fixture ? "system.notes" : "system.details.biography.value"]: get() });
    await tick();
    check(`${systemId} external update preserves active draft`, main.querySelector("textarea")?.value === "My draft");
    check(`${systemId} external update keeps editor connected, focused and selected`, main.querySelector("textarea") === draftInput && document.activeElement === draftInput && draftInput.selectionStart === 2 && draftInput.selectionEnd === 5);
    main.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
    check(`${systemId} concurrent updates preserve draft and report conflict`, writes === 4 && main.querySelector("textarea").value === "My draft" && main.querySelector(".mc-biography-editor-status").textContent.includes("changed"));
    main.querySelector(".mc-modal-button.is-secondary").click();
    if (!fixture) {
      const field = id => main.querySelector(`[data-notes-field="${id}"]`);
      const paddedAmbitions = () => [...main.querySelectorAll("[data-notes-field] > p")].every(paragraph => {
        const range = document.createRange(); range.selectNodeContents(paragraph);
        const bounds = paragraph.getBoundingClientRect();
        const proseStyle = getComputedStyle(main.querySelector(".mc-character-biography-prose"));
        const horizontal = parseFloat(proseStyle.paddingLeft), vertical = parseFloat(proseStyle.paddingTop);
        return [...range.getClientRects()].every(rect => rect.left >= bounds.left + horizontal - 0.5
          && rect.right <= bounds.right - horizontal + 0.5 && rect.top >= bounds.top + vertical - 0.5)
          && paragraph.scrollWidth <= paragraph.clientWidth;
      });
      check("WFRP4e shows personal and party short/long ambitions", main.querySelectorAll("[data-notes-field]").length === 4 && field("personal-short").textContent.includes("Keep short") && field("party-short").textContent.includes("Keep party short"));
      check("4e short and long ambition text has Biography body insets", paddedAmbitions());
      use5e = true; Hooks.emit("updateSetting", { key: "wfrp4e.editionSettings" }, {}); await tick();
      check("WFRP5e shows two editable empty long-term ambition fields", main.querySelectorAll("[data-notes-field]").length === 2 && !field("personal-short") && field("personal-long").textContent.includes("Not recorded.") && !!field("party-long").querySelector("button"));
      check("5e empty ambition placeholders have Biography body insets", paddedAmbitions());
      const biographyBefore = get();
      field("personal-long").querySelector("button").click();
      main.querySelector("textarea").value = '<img src=x onerror="window.ambitionInjected=true">';
      main.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
      check("ambition save refreshes as plain text through native actor hook", !field("personal-long").querySelector("img") && !window.ambitionInjected && field("personal-long").textContent.includes("<img src=x") && get() === biographyBefore);
      field("personal-long").querySelector("button").click();
      check("ambition editor reopens with current saved text", main.querySelector("textarea").value.includes("<img src=x"));
      const longAmbition = "Rule the duchy\n" + "AnUnbrokenAmbitionThatMustWrapWithinTheCard".repeat(15);
      main.querySelector("textarea").value = longAmbition;
      main.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
      check("ambition saves twice without refresh and preserves hidden short terms", field("personal-long").textContent.includes("Rule the duchy") && actor.system.details["personal-ambitions"]["short-term"] === "Keep short" && Object.keys(nativeWrites.at(-1)).join() === "system.details.personal-ambitions.long-term");
      const longBody = field("personal-long").querySelector("p");
      const longRange = document.createRange(); longRange.selectNodeContents(longBody);
      check("5e long multiline ambition wraps within padded body", paddedAmbitions() && longRange.getClientRects().length > 2 && longBody.textContent === longAmbition);
      field("party-long").querySelector("button").click();
      main.querySelector("textarea").value = "Party draft";
      actor.system.details["party-ambitions"]["long-term"] = "External party goal";
      Hooks.emit("updateActor", actor, { "system.details.party-ambitions.long-term": "External party goal" }); await tick();
      main.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
      check("ambition stale save preserves draft and native external update", main.querySelector("textarea").value === "Party draft" && main.querySelector(".mc-biography-editor-status").textContent.includes("changed") && actor.system.details["party-ambitions"]["long-term"] === "External party goal");
      main.querySelector(".mc-modal-button.is-secondary").click();
      field("party-long").querySelector("button").click();
      main.querySelector("textarea").value = "Edition draft";
      use5e = false; Hooks.emit("updateSetting", { key: "wfrp4e.editionSettings" }, {}); await tick();
      check("4e grouped ambitions keep body insets after live edition switch", paddedAmbitions());
      main.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
      check("edition switch preserves ambition draft and rejects stale edition save", main.querySelector("textarea").value === "Edition draft" && main.querySelector(".mc-biography-editor-status").textContent.includes("edition changed"));
      main.querySelector(".mc-modal-button.is-secondary").click();
      field("party-long").querySelector("button").click();
      main.querySelector("textarea").value = "Find a safe home";
      writeMode = "rejected";
      main.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
      check("ambition rejected write preserves draft and allows retry", main.querySelector("textarea").value === "Find a safe home" && !main.querySelector("textarea").disabled && main.querySelector(".mc-biography-editor-status").textContent === "Native write rejected");
      writeMode = "immediate";
      main.querySelector("form.mc-biography-editor").requestSubmit(); await tick();
      check("ambition retry updates exact selected character field", !main.querySelector("textarea") && field("party-long").textContent.includes("Find a safe home") && Object.keys(nativeWrites.at(-1)).join() === "system.details.party-ambitions.long-term");
    }
    main.querySelector(".mc-character-select-trigger").click();
    main.querySelector(".mc-character-menu-folder summary").click();
    const nextActor = [...main.querySelectorAll(".mc-character-menu-actor")].find(button => button.textContent.includes(secondActor.name));
    nextActor.click(); await tick();
    check(`${systemId} dropdown switches actor and removes notes editor`, snapshot.selectedActor.sourceUuid === secondActor.uuid && main.querySelector("h2").textContent === secondActor.name && !main.querySelector("textarea"));
    scope.dispose(); main.replaceChildren();
    check(`${systemId} actor teardown removes editor`, !document.querySelector(".mc-biography-editor-layer"));
  }
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  document.querySelector("#results").textContent = JSON.stringify({ status: "failed", width: innerWidth, height: innerHeight, error: error.stack, checks });
}
