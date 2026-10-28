import { renderProfilePanels } from "/src/features/characters/profile/profile-panels.mjs";
import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";

const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const scope = createTaskScope("profile-layout");
const params = new URLSearchParams(location.search), main = document.querySelector("main");
main.dataset.formFactor = params.get("layout") ?? "phone";
if (params.has("large")) main.style.setProperty("font-size", "24px", "important");
const row = (id, label, value, extra = {}) => ({ id, label, value, ...extra });
const edit = { id: "luck", revision: "1", kind: "integer", min: 0, max: 999999 };
const actor = { sourceUuid: "Actor.layout", panels: [{ id: "overview", label: "Overview", sections: [
  { id: "hp", label: "HP", kind: "counters", rows: [row("hp", "HP", 9, { max: 12 })] },
  { id: "ac", label: "AC", kind: "values", rows: [row("ac", "AC", 14)] },
  { id: "luck", label: "Luck", kind: "values", rows: [row("luck", "Luck", 4, { edit })] },
  { id: "coins", label: "Coins", kind: "values", layout: "inline", rows: [row("gp", "GP", 0), row("sp", "SP", 0), row("cp", "CP", 0)] },
  { id: "stats", label: "Stats", kind: "values", rows: ["Str", "Dex", "Con", "Int", "Wis", "Cha"].map(label => row(label, label, "14 (+2)", { format: "display", action: { id: `stat:${label}`, revision: "1" } })) },
  { id: "items", label: "Skills and equipment", kind: "items", rows: [
    row("skill", "An unusually long translated skill specialization", 999, { action: { id: "skill:test", revision: "1" } }),
    row("weapon", "A long weapon name with additional properties", "+12", { format: "display", valueLabel: "Damage" }),
    row("spell", "A spell with a lengthy translated name", 3, { valueLabel: "Tier" }),
    row("gear", "AnUnbrokenVeryLongInventoryNameThatMustStillFitTheSheet", 999999)
  ] }
] }] };
const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const rect = selector => main.querySelector(selector).getBoundingClientRect();
const sameLine = (a, b) => Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
try {
  const screen = document.createElement("section");
  screen.className = "mc-character-screen mc-character-unselected mc-native-character-screen";
  main.append(screen);
  screen.append(...renderProfilePanels(actor, { characterTab: "overview" }, {
    localize: (_key, fallback) => fallback, execute: async () => ({ nativeHandled: true }), selectCharacterTab: () => {}
  }, scope));
  await document.fonts.ready; await tick();
  if (params.has("large")) check("enlarged text is actually rendered", parseFloat(getComputedStyle(main.querySelector('dt')).fontSize) >= 24);
  check("Luck label and value share a line", sameLine(rect('[data-profile-field="luck"] dt'), rect('[data-profile-field="luck"] dd')));
  const coins = ["gp", "sp", "cp"].map(id => rect(`[data-profile-field="${id}"]`));
  check("compact coin boxes fit one row even at narrow widths", coins.every(r => Math.abs(r.top - coins[0].top) < 1 && r.width < rect('[data-profile-section="coins"]').width / 2));
  check("resource label appears only inside box", !main.querySelector('[data-profile-section="luck"] h3'));
  check("pencil is beside the value", sameLine(rect('[data-profile-edit="luck"]'), rect('[data-profile-field="luck"] dd')));
  check("pencil keeps a touch target", rect('[data-profile-edit="luck"]').width >= 44 && rect('[data-profile-edit="luck"]').height >= 44);
  const editButton = main.querySelector('[data-profile-edit="luck"]'), editIcon = editButton.querySelector("i");
  check("pencil icon is small and has no button background", getComputedStyle(editButton).backgroundColor === "rgba(0, 0, 0, 0)"
    && parseFloat(getComputedStyle(editIcon).fontSize) < parseFloat(getComputedStyle(editButton).fontSize));
  const editRect = rect('[data-profile-edit="luck"]'), fieldRect = rect('[data-profile-field="luck"]');
  check("pencil is aligned to the field's top-right", editRect.right >= fieldRect.right - 2 && editRect.top <= fieldRect.top + 2);
  const hp = rect('[data-profile-section="hp"]'), ac = rect('[data-profile-section="ac"]'), luck = rect('[data-profile-section="luck"]');
  if (main.clientWidth >= 352) check("small resource sections share a row", sameLine(hp, ac));
  if (luck.top > hp.top + 2) check("last resource card fills spare row width", Math.abs(luck.width - rect('.mc-profile-summary').width) < 2);
  if (!params.has("large")) check("short Stats keep labels and values side by side", sameLine(rect('[data-profile-field="Str"] dt'), rect('[data-profile-field="Str"] dd')));
  if (innerWidth >= 768) check("long item rows share available width", sameLine(rect('[data-profile-field="skill"]'), rect('[data-profile-field="weapon"]')));
  const contained = () => [...main.querySelectorAll('.mc-profile-row, .mc-profile-row dt, .mc-profile-row dd, .mc-profile-resource-form input, .mc-profile-resource-form button')].every(element => {
    const r = element.getBoundingClientRect(); return r.left >= 15 && r.right <= innerWidth - 15 && element.scrollWidth <= element.clientWidth + 1;
  });
  check("long names and values stay inside sheet", contained());
  main.querySelector('[data-profile-edit="luck"]').click(); await tick();
  check("open editor fits alongside available controls", contained());
  check("editor preserves touch target height", [...main.querySelectorAll('.mc-profile-resource-form button, .mc-profile-resource-form input')].every(e => e.getBoundingClientRect().height >= 44));
  const input = main.querySelector('[data-profile-resource-input="luck"]');
  check("opening the editor selects the full current value", input.selectionStart === 0 && input.selectionEnd === input.value.length);
  main.querySelector('[data-profile-resource-cancel]').click(); await tick();
  main.querySelector('[data-profile-action="stat:Str"]').click(); await tick();
  check("native completion adds no status text to the sheet", !main.querySelector('[data-profile-field="Str"] [role="status"]') && !main.textContent.includes("Native workflow finished") && contained());
  check("profile never adds horizontal scrolling", document.documentElement.scrollWidth <= innerWidth);
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
