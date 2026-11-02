import { createShadowdarkFixture } from "/tests/helpers/shadowdark.mjs";
import { createFoundrySessionGateway } from "/src/foundry/session/session-gateway.mjs";
import { createFoundryCommandGateway } from "/src/foundry/commands/command-gateway.mjs";
import { createFoundryBiographyGateway } from "/src/foundry/actors/biography-gateway.mjs";
import { renderCharacters } from "/src/features/characters/presenter.mjs";
import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";

const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const scope = createTaskScope("shadowdark-group-browser");
try {
  const params = new URLSearchParams(location.search);
  const main = document.querySelector("main");
  main.dataset.formFactor = params.get("layout") ?? "phone";
  if (params.has("large")) main.style.setProperty("font-size", "24px", "important");
  if (params.has("native-assets")) {
    const response = await fetch("/native-fixture/foundry2.css");
    check("native stylesheet available", response.ok);
    const rule = (await response.text()).match(/a\.button,\s*button\s*\{[^}]+\}/u)?.[0];
    check("native button sizing available", !!rule);
    const style = document.createElement("style");
    style.textContent = `@layer modules { ${rule} }`;
    document.head.prepend(style);
    const font = new FontFace("Native fixture icons", 'url("/native-fixture/fa-solid-900.woff2")', { weight: "900" });
    document.fonts.add(await font.load());
    const icons = document.createElement("style");
    icons.textContent = '[data-profile-add-item] i { font-family: "Native fixture icons"; font-weight: 900; font-style: normal; } [data-profile-add-item] .fa-plus::before { content: "\\f067"; }';
    document.head.append(icons);
  }
  const f = createShadowdarkFixture();
  f.actor.name = " Group ";
  f.actor.system.notes = "<p>Party supplies</p>";
  f.actor.system.slots = 10;
  f.actor.system.getSlotUsage = () => ({ total: 4, coins: 0 });
  f.actor.items.get("sword").system.description = "<p>Shared spare sword</p>";
  const stash = { id: "stash", name: "Stored rations", type: "Basic", parent: f.actor, uuid: `${f.actor.uuid}.Item.stash`,
    system: { isPhysical: true, isIdentified: true, stashed: true, quantity: 2, description: "<p>Supplies at the inn</p>" } };
  f.actor.items.push(stash);
  globalThis.game = f.game;
  globalThis.Hooks = f.hooks;
  const gateway = createFoundryCommandGateway();
  const biography = createFoundryBiographyGateway({ getTextEditor: () => ({ enrichHTML: async value => value }) });
  const session = createFoundrySessionGateway({ capabilitiesForActor: gateway.capabilitiesForActor });
  let snapshot = session.read(), characterTab = "abilities", screen;
  const notices = [];
  const commands = {
    localize: (_key, fallback) => fallback,
    readCharacterBiography: source => biography.read({ actorSourceUuid: source }),
    execute: (name, payload) => gateway.execute(name, payload),
    reportCharacterMutationError: error => notices.push(error.message),
    selectCharacterTab: tab => { characterTab = tab; render(); },
    openNativeActorEditor: async () => {}
  };
  function render() {
    const config = { state: { snapshot, characterTab }, commands, scope };
    screen = screen ? screen.__mcUpdateCharacter(config) : renderCharacters(config);
    if (main.firstElementChild !== screen) main.replaceChildren(screen);
  }
  render();
  session.watch(scope, next => { snapshot = next; render(); }, error => { throw error; });
  await tick();
  const tabs = () => [...main.querySelectorAll('[role="tab"]')].map(tab => tab.textContent).join(",");
  check("Group has only Inventory and Notes", tabs() === "Inventory,Notes");
  check("Inventory opens even after a stale Main tab selection", !!main.querySelector('[data-profile-tab="inventory"][aria-selected="true"]'));
  check("Equipped Gear and equip checkboxes are absent", !main.querySelector('[data-profile-section="equipped-gear"]') && !main.querySelector('input[type="checkbox"]'));
  check("equipped and unequipped items share Gear with quantities", ["sword", "torch"].every(id => main.querySelector(`[data-profile-section="gear"] [data-profile-edit="quantity:${id}"]`)));
  check("Slots, Coins and Stashed Gear remain", main.textContent.includes("4 / 10") && !!main.querySelector('[data-profile-section="coins"]') && !!main.querySelector('[data-profile-section="stashed"]'));
  check("item descriptions remain available", main.textContent.includes("Shared spare sword") && main.textContent.includes("Supplies at the inn"));
  main.querySelector('[data-profile-add-item]').click();
  check("basic and catalog creation choices remain", !!main.querySelector('[data-profile-item-mode="custom"]') && !!main.querySelector('[data-profile-item-mode="catalog"]'));
  main.querySelector('[data-profile-item-mode="custom"]').click();
  const custom = main.querySelector("form.mc-profile-custom-item");
  custom.querySelector('input[type="text"]').value = "Party rations";
  custom.querySelector('[data-profile-custom-weight="perQuantity"]').value = "3";
  custom.requestSubmit();
  await tick();
  const created = f.actor.items.find(item => item.name === "Party rations");
  check("basic item creation saves native Basic item and slot settings", created?.type === "Basic" && created.system.quantity === 1 && created.system.slots.per_slot === 3);
  check("new Basic item immediately appears in Gear", !!main.querySelector(`[data-profile-field="${created.id}"]`));
  main.querySelector('[data-profile-edit="quantity:sword"]').click();
  await tick();
  const quantity = main.querySelector('[data-profile-resource-input="quantity:sword"]');
  quantity.value = "3";
  quantity.dispatchEvent(new Event("input", { bubbles: true }));
  quantity.closest("form").querySelector('[data-profile-resource-save]').click();
  await tick();
  check("equipped quantity saves without equipment changes", f.actor.items.get("sword").system.quantity === 3 && f.actor.items.get("sword").system.equipped === true);
  main.querySelector('[data-profile-tab="notes"]').click();
  await tick();
  check("Notes displays native text", main.textContent.includes("Party supplies"));
  main.querySelector(".mc-biography-edit").click();
  await tick();
  main.querySelector("textarea").value = "<p>Shared treasure ledger</p>";
  main.querySelector("form.mc-biography-editor").requestSubmit();
  await tick();
  check("Notes saves to native field and refreshes", f.actor.system.notes === "<p>Shared treasure ledger</p>" && main.textContent.includes("Shared treasure ledger"));
  main.querySelector('[data-profile-tab="inventory"]').click();
  await tick();
  f.actor.name = "Mara";
  Hooks.emit("updateActor", f.actor, { name: "Mara" });
  await tick();
  check("rename restores ordinary PC tabs", tabs() === "Main,Spells,Inventory,Notes");
  check("ordinary PC equipment controls return", !!main.querySelector('[data-profile-resource-input="equipped:sword"]'));
  f.actor.name = "GROUP";
  Hooks.emit("updateActor", f.actor, { name: "GROUP" });
  await tick();
  check("renaming back restores tracker", tabs() === "Inventory,Notes");
  check("no mutation errors", notices.length === 0);
  check("Group inventory fits viewport", document.documentElement.scrollWidth <= innerWidth + 1);
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  scope.dispose();
  document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
