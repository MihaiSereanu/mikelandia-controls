import { createNativeSystemFixture } from "/tests/helpers/native-systems.mjs";
import { createFoundrySessionGateway } from "/src/foundry/session/session-gateway.mjs";
import { createFoundryCommandGateway } from "/src/foundry/commands/command-gateway.mjs";
import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";
import { renderCharacters } from "/src/features/characters/presenter.mjs";
import { createFoundryBiographyGateway } from "/src/foundry/actors/biography-gateway.mjs";

const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 50));
const scope = createTaskScope("native-system-browser");
try {
  const params = new URLSearchParams(location.search), system = params.get("system") ?? "swade";
  const f = createNativeSystemFixture(system), root = document.querySelector("main");
  if (params.has("wealth")) f.settings.set("wealthType", "wealthDie");
  root.dataset.formFactor = params.get("layout") ?? "phone";
  if (params.has("large")) root.style.setProperty("font-size", "24px", "important");
  if (params.has("unprotected")) root.removeAttribute("data-mc-style-authority");
  globalThis.game = f.game; globalThis.Hooks = f.hooks;
  const bio = '<p>A <strong>seasoned</strong> captain.</p><div class="secret">Hidden background</div>';
  if (system === "swade") f.actor.system.details.biography.value = bio; else {
    f.actor.system.background = { description: "A weathered navigator.", backstory: bio, origin: "Port Royal", friendsAndContacts: "Harbor pilots", rivalsAndEnemies: "The admiral" };
    f.actor.system.motivation = "Find the missing expedition";
    f.actor.sheet = { options: { actions: { toggleActiveStyle: (_event, target) => {
      const item = f.actor.items.get(target.closest(".item").dataset.itemId);
      return item.update({ "system.active": !item.system.active });
    } } } };
    f.actor.items.get("lunge").name = "A precise greatsword strike while crossing a crowded, unstable deck";
  }
  if (system === "swade") f.actor.items.get("sword").system.actions.additional.flourish.name = "Perform a precise strike while moving across an unstable, crowded deck";
  const conditionId = system === "swade" ? "shaken" : "at-a-loss";
  globalThis.CONFIG = { statusEffects: [{ id: conditionId, name: system === "swade" ? "Shaken" : "At a Loss" }, { id: "dead", name: "Dead" },
    ...(system === "swade" ? [{ id: "berserk", name: "Berserk" }] : [])] };
  f.actor.img = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#39413d"/><circle cx="40" cy="28" r="17" fill="#b3bdb6"/></svg>');
  const gateway = createFoundryCommandGateway(), session = createFoundrySessionGateway({ capabilitiesForActor: gateway.capabilitiesForActor });
  const biography = createFoundryBiographyGateway({ getTextEditor: () => ({ enrichHTML: async value => value }) });
  let state, screen, watchError;
  const notices = [];
  const commands = { localize: (_key, fallback) => fallback,
    readCharacterBiography: source => biography.read({ actorSourceUuid: source }),
    reportCharacterMutationError: error => notices.push(error.message),
    execute: (name, payload) => gateway.execute(name, payload, { isCurrent: () => !scope.disposed && state.snapshot.selectedActorSourceUuid === payload.actorSourceUuid }),
    selectCharacterTab: tab => { state = { ...state, characterTab: tab }; screen.__mcUpdateCharacter({ state, commands }); },
    selectActor: source => { state = { ...state, snapshot: session.selectCharacterSource(source) }; screen.__mcUpdateCharacter({ state, commands }); },
    openNativeActorEditor: async () => {} };
  state = { characterTab: "main", snapshot: session.watch(scope, snapshot => { state = { ...state, snapshot }; screen?.__mcUpdateCharacter({ state, commands }); }, error => { watchError = error; }) };
  screen = renderCharacters({ state, commands, scope }); root.append(screen); await tick();
  const tab = async id => { const button = screen.querySelector(`[data-profile-tab="${id}"]`); check(`${id} tab exists`, button); button.click(); await tick(); };
  const action = async id => { const button = screen.querySelector(`[data-profile-action="${id}"]`); check(`${id} available`, button); button.click(); await tick(); };
  check("PC profile selected", state.snapshot.selectedActor.presentation === "profile");
  if (system === "swade") {
    check("Conviction Active card removed", !screen.querySelector('[data-profile-section="conviction-active"]'));
    check("Conviction card offers Spend", screen.querySelector('[data-profile-section="conviction"] [data-profile-action="conviction"]').getAttribute("aria-label") === "Spend Conviction");
    await action("conviction");
    check("Spend uses native Conviction and shows End", f.actor.system.details.conviction.value === 0 && f.actor.system.details.conviction.active
      && screen.querySelector('[data-profile-action="conviction"]').getAttribute("aria-label") === "End Conviction");
    await action("conviction");
    check("End does not refund or spend another Conviction", f.actor.system.details.conviction.value === 0 && !f.actor.system.details.conviction.active);
    await f.actor.update({ "system.details.conviction.value": 1 }); await tick();
    const card = screen.querySelector('[data-profile-section="conviction"]').getBoundingClientRect();
    const neighbor = screen.querySelector('[data-profile-section="bennies"]').getBoundingClientRect();
    const spend = screen.querySelector('[data-profile-action="conviction"]').getBoundingClientRect();
    const lock = screen.querySelector('[data-profile-counter-lock="conviction"]').getBoundingClientRect();
    check("Conviction card matches the other counter dimensions", Math.abs(card.width - neighbor.width) <= 1 && Math.abs(card.height - neighbor.height) <= 1);
    check("Spend sits beside the padlock with separate touch targets", Math.abs(spend.top - lock.top) <= 1 && spend.right <= lock.left + 1 && spend.width >= 44 && lock.width >= 44);
  }
  await action(system === "swade" ? "attribute:agility" : "characteristic:qualities.might");
  check("native roll produces chat", f.game.messages.length === 1);
  if (system === "swade") { await action("skill:fighting"); check("skill roll remains available beside its description", f.game.messages.length === 2); }
  const resourceId = system === "swade" ? "wounds" : "lifeblood";
  screen.querySelector(`[data-profile-counter-lock="${resourceId}"]`).click();
  screen.querySelector(`[data-profile-resource="${resourceId}"] [data-profile-counter-delta="1"]`).click(); await tick();
  check("resource update refreshes selected PC", state.snapshot.selectedActor.panels[0].sections[0].rows.some(row => row.id === resourceId && row.value === (system === "swade" ? 1 : 11)));
  if (system === "honor-and-intrigue") {
    screen.querySelector('[data-profile-edit="lifeblood"]').click();
    const input = screen.querySelector('[data-profile-resource-input="lifeblood"]');
    input.value = "-2"; input.dispatchEvent(new Event("input", { bubbles: true }));
    input.closest("form").requestSubmit(); await tick();
    check("native negative Lifeblood can be entered", f.actor.system.lifeblood.value === -2);
  }
  if (system === "honor-and-intrigue") {
    const ap = screen.querySelector('[data-profile-section="advancement"]').getBoundingClientRect();
    const qualities = screen.querySelector('[data-profile-section="qualities"]').getBoundingClientRect();
    check("Advancement Points fills the bottom resource row", Math.abs(ap.width - qualities.width) <= 1 && Math.abs(ap.left - qualities.left) <= 1);
  }
  await tab("combat");
  if (system === "swade") {
    const section = screen.querySelector('[data-profile-section="item-actions"]'), card = section.getBoundingClientRect();
    let previousBottom = -Infinity;
    for (const row of section.querySelectorAll(".mc-profile-row")) {
      const rect = row.getBoundingClientRect(), button = row.querySelector("button");
      check("Combat actions occupy separate full-width rows", rect.top >= previousBottom - 1 && rect.width >= card.width - 40);
      check("Combat action text fits its button", button.scrollWidth <= button.clientWidth + 1 && button.getBoundingClientRect().right <= innerWidth + 1);
      check("Combat action labels are not repeated", !row.querySelector("dd"));
      previousBottom = rect.bottom;
    }
  }
  if (system === "honor-and-intrigue") {
    check("Loading status text is absent", !/\b(?:Loaded|Unloaded)\b/u.test(screen.textContent));
    check("Weapon maneuvers use full-width action rows", screen.querySelector('[data-profile-section="weapon-maneuvers"]').classList.contains("mc-profile-section-actions"));
    const style = screen.querySelector('[data-profile-section="styles"] input[type="checkbox"]');
    check("Dueling styles have checkboxes and no bulbs or Active text", style && !screen.querySelector(".fa-lightbulb") && !/\b(?:Active|Inactive)\b/u.test(screen.textContent));
    style.checked = true; style.dispatchEvent(new Event("change", { bubbles: true })); await tick();
    check("Style checkbox uses native activation and refreshes", f.actor.items.get("style").system.active && screen.querySelector('[data-profile-section="styles"] input').checked);
    const reference = screen.querySelector('[data-profile-section="styles"] [popovertarget]');
    reference.click(); await tick();
    check("Style descriptions remain accessible", document.getElementById(reference.getAttribute("popovertarget")).textContent.includes("heirloom"));
    reference.click(); await tick();
  }
  const beforeDamage = f.game.messages.length;
  await action(system === "swade" ? "item:sword:damage" : "damage:sword");
  check("native damage call completed", f.game.messages.length === beforeDamage + 1);
  if (system === "honor-and-intrigue") { await action("weapon-maneuver:sword:0"); check("weapon maneuver retains weapon context", f.calls.at(-1)[2].system.relatedItemUuid === f.actor.items.get("sword").uuid); }
  else { await tab("powers"); await action("power:bolt"); check("power roll uses native helper", f.calls.at(-1)[0] === "item" && f.calls.at(-1)[2] === "formula"); }
  await tab("inventory");
  if (params.has("wealth")) {
    const wealth = screen.querySelector('[data-profile-section="wealth"]'), gear = screen.querySelector('[data-profile-section="gear"]');
    const bounds = wealth.getBoundingClientRect(), gearBounds = gear.getBoundingClientRect();
    check("Wealth occupies the full inventory row", Math.abs(bounds.left - gearBounds.left) <= 1 && Math.abs(bounds.width - gearBounds.width) <= 1);
    check("Wealth content uses the full row", wealth.querySelector(".mc-profile-row").getBoundingClientRect().width >= bounds.width - 40);
    check("Wealth label appears once", (wealth.textContent.match(/Wealth/gu) ?? []).length === 1);
    await action("wealth"); check("full-width Wealth retains native roll", f.calls.at(-1)[0] === "wealth");
  }
  const select = screen.querySelector('[data-profile-resource-input="equipped:sword"]');
  check("equipment uses named native choices", select?.tagName === "SELECT" && select.options.length === (system === "swade" ? 6 : 3));
  select.value = system === "swade" ? "1" : "2"; select.dispatchEvent(new Event("change", { bubbles: true })); await tick();
  check("equipment readback refreshes", screen.querySelector('[data-profile-resource-input="equipped:sword"]').value === select.value);
  check("equipment touch target", screen.querySelector('select').getBoundingClientRect().height >= 44);
  const detail = screen.querySelector('details'); if (detail) { detail.open = true; await tick(); }
  check("item descriptions retain formatting", Boolean(screen.querySelector("strong")));
  await tab("effects");
  const toggleStatus = async () => {
    const input = screen.querySelector(`[data-profile-condition="${conditionId}"]`);
    input.checked = !input.checked; input.dispatchEvent(new Event("change", { bubbles: true })); await tick();
  };
  {
    check("Conditions show checkboxes without Active/Inactive or lightbulbs", Boolean(screen.querySelector(`[data-profile-condition="${conditionId}"]`))
      && !screen.querySelector('[data-profile-section="conditions"]').textContent.match(/\b(?:Active|Inactive)\b/u)
      && !screen.querySelector('[data-profile-section="conditions"] .fa-lightbulb'));
    const reference = screen.querySelector(`[data-profile-condition-reference="${conditionId}"]`);
    reference.click(); await tick();
    const tip = document.getElementById(reference.getAttribute("popovertarget"));
    check("condition name opens a heading-free explanation without changing state", tip.matches(":popover-open") && tip.textContent.includes(system === "swade" ? "Spirit" : "Defense") && !tip.querySelector("h3") && !f.actor.statuses.has(conditionId));
    reference.click(); await tick(); check("retapping condition name closes explanation", !tip.matches(":popover-open"));
    const toggleMethod = system === "swade" ? "toggleActiveEffect" : "toggleStatusEffect";
    const nativeToggle = f.actor[toggleMethod];
    f.actor[toggleMethod] = async () => { throw new Error("Condition write rejected"); };
    const input = screen.querySelector(`[data-profile-condition="${conditionId}"]`);
    await toggleStatus();
    check("failed checkbox write restores unchecked state and usability", !input.checked && !input.disabled && notices.pop() === "Condition write rejected");
    f.actor[toggleMethod] = nativeToggle;
  }
  await toggleStatus();
  check("native condition applied", f.actor.statuses.has(conditionId));
  await toggleStatus(); check("native condition removed", !f.actor.statuses.has(conditionId));
  if (system === "swade") {
    await tab("abilities");
    check("Basic Actions contains only action items", screen.querySelector('[data-profile-section="basic-actions"]').textContent.includes("Defend")
      && !screen.querySelector('[data-profile-section="basic-actions"]').textContent.includes("Special"));
    check("actual abilities and ancestry keep separate sections", screen.querySelector('[data-profile-section="abilities"]')?.textContent.includes("Special")
      && screen.querySelector('[data-profile-section="ancestry"]')?.textContent.includes("Ancestry") && !screen.textContent.includes("Abilities & Ancestry") && !screen.textContent.includes("Archetype"));
  }
  await tab("notes");
  check("Bio renders background formatting", Boolean(screen.querySelector('[data-profile-section] strong')));
  if (system === "honor-and-intrigue") {
    check("Motivation is first and all Background fields appear", screen.querySelector('[data-profile-section]').dataset.profileSection === "motivation"
      && screen.querySelector(".mc-profile-content").firstElementChild.dataset.profileSection === "motivation"
      && ["Find the missing expedition", "A weathered navigator.", "Port Royal", "Harbor pilots", "The admiral"].every(text => screen.textContent.includes(text)));
    check("Bio labels have no unresolved native keys", !screen.textContent.includes("HONOR_INTRIGUE."));
  }
  check("Bio removes secret background content", !screen.textContent.includes("Hidden background"));
  check("native Notes load through biography gateway", screen.textContent.includes("Private captain's notes"));
  await tab("main");
  const before = screen.querySelector('[data-profile-tab="main"]').id;
  f.hooks.emit("updateActor", f.actor, {}); await tick();
  check("refresh retains current tab", screen.querySelector('[data-profile-tab="main"]').getAttribute("aria-selected") === "true" && screen.querySelector('[data-profile-tab="main"]').id === before);
  for (const tabId of state.snapshot.selectedActor.panels.map(tab => tab.id)) {
    await tab(tabId);
    check(`${tabId} fits viewport`, screen.getBoundingClientRect().right <= innerWidth + 1);
    for (const control of screen.querySelectorAll("select, [data-profile-counter-lock]")) {
      const rect = control.getBoundingClientRect();
      check(`${tabId} control within viewport`, rect.left >= -1 && rect.right <= innerWidth + 1);
    }
    if (system === "honor-and-intrigue") for (const row of screen.querySelectorAll(".mc-profile-section-rows .mc-profile-row")) {
      check(`${tabId} list row has no horizontal scrolling`, row.scrollWidth <= row.clientWidth + 1);
      for (const control of row.querySelectorAll("button, input, summary")) {
        const bounds = control.getBoundingClientRect();
        check(`${tabId} list control stays inside its row`, bounds.right <= row.getBoundingClientRect().right + 1);
      }
    }
    for (const counter of screen.querySelectorAll(".mc-profile-counter")) {
      const rect = counter.getBoundingClientRect(), card = counter.closest(".mc-profile-section").getBoundingClientRect();
      check(`${tabId} counter stays inside its card`, rect.left >= card.left - 1 && rect.right <= card.right + 1 && rect.top >= card.top - 1 && rect.bottom <= card.bottom + 1);
    }
  }
  check("no mutation errors", notices.length === 0);
  check("no session errors", !watchError);
  await tab(params.get("preview") ?? "inventory");
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  scope.dispose(); document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
