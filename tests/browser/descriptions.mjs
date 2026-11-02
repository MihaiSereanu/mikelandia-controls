import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";
import { createFoundryDescriptionGateway } from "/src/foundry/actors/description-gateway.mjs";
import { renderEnrichedDescription } from "/src/ui/primitives/enriched-description.mjs";
import { renderProfilePanels } from "/src/features/characters/profile/profile-panels.mjs";

const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 40));
const scope = createTaskScope("description-browser"), main = document.querySelector("main");
try {
  if (new URLSearchParams(location.search).has("native-assets")) {
    const font = new FontFace("Native description icons", 'url("/native-fixture/fa-solid-900.woff2")', { weight: "900" });
    document.fonts.add(await font.load());
    const style = document.createElement("style");
    style.textContent = '.mc-description-content i { font-family: "Native description icons"; font-weight: 900; font-style: normal; } .mc-description-content .fa-dice-d20::before { content: "\\f6cf"; } .mc-description-content .fa-book::before { content: "\\f02d"; }';
    document.head.append(style);
    check("installed Foundry icon font loads", document.fonts.check('900 16px "Native description icons"'));
  }
  const actor = { uuid: "Actor.pc", documentName: "Actor", testUserPermission: () => true };
  const source = '<p><strong>Rules</strong> [[/r 1d6]] @UUID[Item.first]{First}</p><section class="secret">Hidden [[/r 999d6]]</section>';
  const item = { uuid: "Actor.pc.Item.test", parent: actor, system: { description: { value: source } }, getRollData: () => ({ bonus: 4 }) };
  let allowed = true, release;
  const docs = new Map([[item.uuid, item],
    ["Item.first", { uuid: "Item.first", name: "First", visible: true, system: { description:
      '<p>First rules @UUID[Item.second]{Second}</p><p>[[/gmroll 1d8]]</p><p>@UUID[Item.denied]{Denied}</p>' } }],
    ["Item.second", { uuid: "Item.second", name: "Second", visible: true, system: { description:
      '<p>Second rules</p><table><tr><td>' + "Long cell ".repeat(80) + '</td></tr></table>' } }],
    ["Item.denied", { uuid: "Item.denied", testUserPermission: () => allowed && false, system: { description: "Never reveal this" } }],
    ["Item.slow", { uuid: "Item.slow", visible: true, system: { description: "Delayed rules" } }]
  ]);
  const messages = [], enrichments = [];
  const gateway = createFoundryDescriptionGateway({ getGame: () => game,
    resolve: async uuid => { if (uuid === "Item.slow") await new Promise(resolve => { release = resolve; }); return docs.get(uuid); },
    getEditor: () => ({ enrichHTML: async (html, options) => {
      enrichments.push({ html, options });
      return html.replace(/\[\[\/(r|gmroll) ([^\]]+)\]\]/gu, (_match, mode, formula) =>
        `<a class="inline-roll ${mode}" data-formula="${formula}" data-mode="${mode === "gmroll" ? "gm" : "roll"}"><i class="fa-solid fa-dice-d20"></i>${formula}</a>`)
        .replace(/@UUID\[([^\]]+)\]\{([^}]+)\}/gu, (_match, uuid, label) =>
          `<a class="content-link" data-uuid="${uuid}" data-link><i class="fa-solid fa-book"></i>${label}</a>`);
    } }),
    getRoll: () => ({ create: (formula, data) => ({ toMessage: async (message, options) => { messages.push({ formula, data, message, options }); } }) }),
    getChat: () => ({ getSpeaker: input => input })
  });
  const game = { user: { id: "tester" } };
  const rendered = renderEnrichedDescription(source, "", { gateway, uuid: item.uuid, scope });
  main.append(rendered.content);
  await rendered.ready;
  check("Foundry notation becomes native links with icons and keyboard access", rendered.content.querySelector("a.inline-roll i.fa-dice-d20")
    && rendered.content.querySelector("a.content-link[data-uuid]").tabIndex === 0 && !rendered.content.textContent.includes("@UUID"));
  check("secret text is stripped before native enrichment", !enrichments[0].html.includes("Hidden") && !enrichments[0].html.includes("999d6"));
  check("native enrichment uses Item context", enrichments[0].options.relativeTo === item && enrichments[0].options.rollData.bonus === 4);
  const malicious = renderEnrichedDescription('<p onclick="alert(1)">Safe</p><a class="inline-roll" data-formula="999d6" href="javascript:alert(1)">Untrusted</a><img src="bad" onerror="alert(1)"><div class="secret">Secret</div>');
  check("source action attributes, unsafe URLs, events and secrets remain stripped", !malicious.content.querySelector('[onclick], [onerror], [data-formula], .inline-roll, .secret, a[href]')
    && !malicious.content.textContent.includes("Secret"));
  const unsafe = { uuid: "Item.unsafe", visible: true, system: { description:
    '<p onclick="bad()">Safe</p><a class="inline-roll" data-formula="999d6" href="javascript:bad()">Text</a><img onerror="bad()"><div class="secret">Private</div>' } };
  docs.set(unsafe.uuid, unsafe);
  await gateway.enrich({ uuid: unsafe.uuid });
  check("authoritative source is scrubbed before Foundry parses it", !/onclick|onerror|javascript:|data-formula|class=|Private/u.test(enrichments.at(-1).html));
  rendered.content.querySelector("a.inline-roll").click(); await tick();
  check("inline roll posts exactly once using Item data and Actor speaker", messages.length === 1 && messages[0].data.bonus === 4 && messages[0].message.speaker.actor === actor);
  const link = rendered.content.querySelector("a.content-link");
  link.click(); await tick();
  const tooltip = rendered.content.querySelector(".mc-reference-tooltip");
  check("UUID click opens a bounded tooltip with target description", tooltip.matches(":popover-open") && tooltip.textContent.includes("First rules"));
  tooltip.querySelector("a.inline-roll").click(); await tick();
  check("roll in preview uses the referenced document and preserves private mode", messages.length === 2 && messages[1].options.rollMode === "gmroll");
  tooltip.querySelector('[data-uuid="Item.second"]').click(); await tick();
  check("nested UUID stays in the same tooltip with Back", tooltip.matches(":popover-open") && tooltip.textContent.includes("Second rules")
    && !tooltip.querySelector("header button").hidden && rendered.content.querySelectorAll(".mc-reference-tooltip").length === 1);
  check("wide preview stays inside the viewport", tooltip.getBoundingClientRect().right <= innerWidth && tooltip.getBoundingClientRect().left >= 0 && document.documentElement.scrollWidth <= innerWidth);
  tooltip.querySelector("header button").click(); await tick();
  check("Back reloads the previous description", tooltip.textContent.includes("First rules") && tooltip.querySelector("header button").hidden);
  tooltip.querySelector('[data-uuid="Item.denied"]').click(); await tick();
  check("denied references show a message without content", tooltip.textContent.includes("do not have access") && !tooltip.textContent.includes("Never reveal"));
  tooltip.hidePopover(); await tick();
  link.click(); await tick(); link.click(); await tick();
  check("retapping source link closes the tooltip", !tooltip.matches(":popover-open"));
  link.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await tick();
  check("keyboard opens UUID descriptions", tooltip.matches(":popover-open"));
  tooltip.hidePopover(); await tick();

  const profile = { sourceUuid: actor.uuid, panels: [{ id: "main", label: "Main", sections: [{ id: "items", label: "Items", kind: "items", rows: [
    { id: "spell", label: "Spell", description: source, descriptionUuid: item.uuid, descriptionToggle: "name" },
    { id: "notes", label: "Notes", description: source, descriptionUuid: item.uuid, descriptionDisplay: "tooltip" }
  ] }] }] };
  const panel = document.createElement("section"); panel.className = "mc-native-character-screen";
  main.append(panel);
  panel.append(...renderProfilePanels(profile, { characterTab: "main" }, { descriptions: gateway }, scope));
  await tick();
  check("shared spell disclosures enrich in their source Item context", panel.querySelector(".mc-profile-spell-description a.inline-roll"));
  check("compact Notes use enriched plain text", !panel.querySelector(".mc-profile-note-trigger").textContent.includes("@UUID")
    && !panel.querySelector(".mc-profile-note-trigger").textContent.includes("[["));
  panel.querySelector(".mc-profile-note-trigger").click(); await tick();
  panel.querySelector(".mc-profile-note-tooltip a.content-link").click(); await tick();
  check("UUID preview inside a Notes popover keeps its parent open", panel.querySelector(".mc-profile-note-tooltip").matches(":popover-open")
    && panel.querySelector(".mc-reference-tooltip").matches(":popover-open"));
  panel.querySelector(".mc-reference-tooltip").hidePopover();
  panel.querySelector(".mc-profile-note-tooltip").hidePopover(); await tick();

  // Teardown must discard an in-flight reference load and remove its top-layer tooltip.
  link.dataset.uuid = "Item.slow"; link.click(); await tick();
  scope.dispose(); release(); await tick();
  check("teardown removes tooltips and discards pending results", !main.querySelector(".mc-reference-tooltip") && !main.textContent.includes("Delayed rules"));
  // A fresh usable trigger is left for the CDP trusted-touch checks.
  const touchScope = createTaskScope("description-touch");
  const touch = renderEnrichedDescription(source, "description-touch", { gateway, uuid: item.uuid, scope: touchScope });
  main.replaceChildren(touch.content); await touch.ready;
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
