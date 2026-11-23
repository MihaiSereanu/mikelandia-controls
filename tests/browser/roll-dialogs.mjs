import { createMobileApplicationAdmissions } from "/src/foundry/presentation/mobile-presentation.mjs";

// Representative native controls/state. This verifies presentation and submission,
// not native calculations, message visibility in a world, or item consumption.
const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const field = (label, name, value = "0") => `<div class="form-group"><label>${label}</label><div class="form-fields"><input type="number" name="${name}" value="${value}"></div></div>`;
const select = (label, name, options = '<option value="normal">Normal</option>') => `<div class="form-group"><label>${label}</label><div class="form-fields"><select name="${name}">${options}</select></div></div>`;
const mode = modern => select("Roll Mode", modern === "swade" ? "messageMode" : "rollMode", modern ? '<option value="gm" selected>Private GM</option><option value="public">Public</option>' : '<option value="gmroll" selected>Private GM</option><option value="publicroll">Public</option>');
const footer = '<footer class="form-footer"><button type="submit">Roll</button></footer>';
const states = `<div class="state-fields">${["advantage", "normal", "disadvantage"].map(type => `<div><div class="state-field ${type === "normal" ? "active" : ""}" data-action="clickState" data-type="${type}"><label>${type[0].toUpperCase() + type.slice(1)}</label></div></div>`).join("")}</div>`;
const modifier = i => `<li class="modifier ${i === 0 ? "active" : ""}" data-action="clickModifier" data-index="${i}" data-tooltip="Native effect script"><a>Modifier ${i + 1}</a></li>`;
const shadowdark = `<div><h2>Longbow Attack</h2><hr><div class="roll-input"><label>Attack</label><input name="mainFormula" value="1d20+3"><p class="tooltips">Dexterity +2, Weapon Mastery +1</p></div><div class="advantage-buttons">${["Disadvantage", "Normal", "Advantage"].map((label, i) => `<input type="radio" name="advantage" value="${i}" id="adv-${i}" ${i === 1 ? "checked" : ""}><label for="adv-${i}">${label}</label>`).join("")}</div><hr><div class="roll-input"><label>Damage</label><input name="damageFormula" value="1d8+1"><p class="tooltips">Longbow, Weapon Mastery +1</p></div><div class="roll-input"><label>Ammunition</label><select name="ammunitionId"><option>Arrows (20/20)</option></select></div><div class="situational-options"><label>Situational bonuses</label>${Array.from({ length: 8 }, (_, i) => `<div class="situational-option"><p class="tooltips"><b>Blessing ${i + 1}.</b> A native situational bonus.</p><input type="checkbox" name="selected" value="bless${i}" ${i === 0 ? "checked" : ""}></div>`).join("")}</div></div>${mode(false)}${footer}`;
const warhammer = `<div class="dialog-base"><div class="dialog-fields"><div data-application-part="default">${field("Target", "target", "45")}${field("SL", "SL")}${select("Difficulty", "difficulty")}</div><div data-application-part="specific">${states}<div class="flexrow gap">${field("Damage", "damage", "6")}<div class="form-group"><label>Charging <input type="checkbox" name="charging"></label></div></div>${select("Hit Location", "hitLocation")}${mode(false)}</div></div><div class="dialog-modifiers" data-application-part="modifiers"><label>Modifiers</label><ul class="modifier-list">${Array.from({ length: 10 }, (_, i) => modifier(i)).join("")}<li class="modifier hidden" data-index="hidden">Hidden effect</li></ul></div></div>${footer}`;
const swade = damage => `<section>${damage ? "" : '<fieldset class="flexrow"><legend>Multi-Action Penalty</legend><input type="radio" name="map" value="0" id="map0" checked><label for="map0">None</label><input type="radio" name="map" value="-2" id="map2"><label for="map2">&#8722;2</label><input type="radio" name="map" value="-4" id="map4"><label for="map4">&#8722;4</label></fieldset>'}<fieldset><legend>Modifiers</legend><header class="modifier-entry header">Name / Value / Active</header><ul class="modifiers">${Array.from({ length: 10 }, (_, i) => `<li class="modifier-entry">Native modifier ${i + 1}<input type="checkbox" name="modifiers.${i}.active" ${i === 0 ? "checked" : ""}></li>`).join("")}</ul><div class="modifier-entry footer"><input class="new-modifier-label" placeholder="Name"><input class="new-modifier-value" placeholder="+2"><button type="button" data-action="addModifier">Add</button></div><div class="presets"><button type="button" class="toggle-list" data-action="toggleList">Choose presets</button><div class="dropdown collapsed"><input type="search" class="searchBox"><ol class="selections unmarked-list">${Array.from({length:20},(_,i)=>`<li class="modifier"><button type="button" class="add-preset" data-action="addPreset" data-mod-id="preset${i}">Preset ${i+1}</button></li>`).join("")}</ol></div></div></fieldset><fieldset class="formula"><legend>Formula</legend><textarea readonly>1d8x + 1d6x + 2</textarea>${damage ? '<div class="form-group"><label>No Acing</label><input type="checkbox" name="noAcing"></div>' : ""}</fieldset>${mode("swade")}</section>${footer}`;
const hiSelect = (label, name) => `<div class="modifiers-table-item"><span>${label}</span><select name="${name}" data-dtype="String"><option>Normal</option></select></div>`;
const hiStepper = (label, id) => `<div class="modifiers-table-item"><span>${label}</span><div class="honor-intrigue input-stepper"><button type="button" data-action="decrement" data-field="${id}">&#8722;</button><input id="${id}" type="number" value="0"><button type="button" data-action="increment" data-field="${id}">+</button></div></div>`;
const hi = variant => `<div class="roll-dialog-content">${variant === "protection" ? '<div class="protection-options"><div class="protection-option-item toggled"><p>Leather Armour</p><p>1</p><label><input type="checkbox" name="protection" checked>Use</label></div></div>' : `<div class="modifiers-table"><div class="modifiers-table-items">${variant === "damage" ? '<div class="modifiers-table-item"><label>Damage Formula</label><div class="modifiers-table-item-group"><input type="number" name="numDice" value="2"><select name="dieSize"><option>d6</option></select><input name="flatModifier" value="+2"></div></div><div class="modifiers-table-item"><label>Might</label><div class="modifiers-table-item-group"><input type="number" name="mightValue" value="2"><button type="button" data-action="toggleHalfMight">&frac12;</button></div></div>' : hiSelect("Difficulty", "difficulty") + hiSelect("Combat Ability", "combatAbility") + hiSelect("Career Bonus", "career") + hiStepper("Bonus Dice", "bonuses") + hiStepper("Penalty Dice", "penalties") + hiStepper("Flat Modifier", "flat")}</div></div>`}</div><footer class="form-footer"><button type="submit">Roll</button><div class="roll-mode-buttons"><button type="button" data-roll-mode="gmroll">GM</button><button type="button" data-roll-mode="publicroll">Public</button></div></footer>`;
const dnd = damage => `<fieldset>${select("Ability", "ability")}${damage ? "" : select("Attack Mode", "attackMode") + select("Ammunition", "ammunition") + select("Weapon Mastery", "mastery")}${mode(true)}</fieldset><div class="rolls"><ul class="dice"><li>Extra dice illustrations</li></ul><ul class="formulas"><li><div class="formula-line">${damage ? "2d8+3" : "1d20+5"}</div><div class="form-group"><input name="roll.0.situational" placeholder="Situational bonus"></div></li></ul></div><footer class="form-footer">${(damage ? ["Normal", "Critical"] : ["Advantage", "Normal", "Disadvantage"]).map(label => `<button type="submit">${label}</button>`).join("")}</footer>`;
try {
  const params = new URLSearchParams(location.search), system = params.get("system"), theme = params.get("theme"), layout = params.get("layout");
  const main = document.querySelector("main"); main.dataset.theme = theme; main.dataset.formFactor = layout;
  document.body.dataset.mcMobileFormFactor = layout;
  if (params.has("large")) document.documentElement.style.fontSize = "22px";
  if (params.has("keyboard")) document.body.style.setProperty("--mc-mobile-viewport-height", "380px");
  if (params.has("native-assets")) {
    const font = new FontFace("Font Awesome 7 Pro", 'url("/native-fixture/fa-solid-900.woff2")', { weight: "900" });
    document.fonts.add(await font.load()); check("native icon font loads", font.status === "loaded");
  }
  const isSD = system === "shadowdark", isWH = system === "5e", isSW = system.startsWith("swade"), isHI = system.startsWith("hi"), isDND = system.startsWith("dnd5e");
  const root = document.createElement(isDND ? "dialog" : "form");
  root.className = "application themed " + (isWH ? "warhammer roll-dialog-v2" : isSW ? "swade roll-dialog" : isHI ? "honor-intrigue roll-dialog" : isDND ? "dnd5e2 roll-configuration" : "");
  if (isSD) root.id = "sd-roll-dialog";
  root.innerHTML = `<header class="window-header"><h1 class="window-title">${isWH ? "Melee (Basic)" : system}</h1><button type="button" class="header-control fa-solid fa-xmark icon" data-action="close" aria-label="Close"></button></header><${isDND ? "form" : "section"} class="window-content standard-form">${isSD ? shadowdark : isWH ? warhammer : isSW ? swade(system.endsWith("damage")) : isHI ? hi(system.split("-")[1]) : dnd(system.endsWith("damage"))}</${isDND ? "form" : "section"}><div class="window-resize-handle"></div>`;
  // Native WFRP part order places modifiers before the specific Hit Location field.
  if (isWH) root.querySelector('[data-application-part="specific"]').before(root.querySelector('.dialog-modifiers'));
  document.body.append(root);
  const sentinel = document.createElement("form");
  sentinel.className = "application roll-configuration sentinel";
  sentinel.innerHTML = mode(true);
  document.body.append(sentinel);
  const application = { config: { rollMode: "gmroll" }, fields: { rollMode: "gmroll" }, userEntry: { rollMode: "gmroll" }, message: { rollMode: "gm" }, options: { context: { rollMode: "gmroll" } }, close() { admissions.release(application); root.remove(); } };
  Object.freeze(application.options);
  const admissions = createMobileApplicationAdmissions(document.body);
  const content = root.querySelector(".window-content");
  // Retained native inline clipping must yield to the mobile scroll container.
  if (params.has("scroll")) content.style.overflow = "hidden";
  if (isSW) {
    root.querySelector('.toggle-list').onclick = () => root.querySelector('.dropdown').classList.toggle('collapsed');
    for (const button of root.querySelectorAll('.add-preset')) button.onclick = () => root.dataset.selectedPreset = button.dataset.modId;
  }
  const originalNodes = [...root.querySelectorAll("input, select, textarea, button")];
  let submitted;
  root.addEventListener("submit", event => { event.preventDefault(); submitted = new FormData(isDND ? content : root); });
  admissions.admit(application, root, isSD, null, application);
  await frame();
  const bounds = root.getBoundingClientRect();
  const closeIcon = root.querySelector(".header-control");
  check("header retains native icon font " + getComputedStyle(closeIcon).fontFamily, getComputedStyle(closeIcon).fontFamily.includes("Font Awesome"));
  check("dialog fits horizontal viewport", bounds.left >= 0 && bounds.right <= innerWidth + 1 && root.scrollWidth <= root.clientWidth + 1);
  check("dialog fits visible viewport", bounds.top >= 0 && bounds.bottom <= (params.has("keyboard") ? 380 : innerHeight) + 1);
  check("unadmitted windows retain their private defaults", sentinel.querySelector("select").value === "gm" && !sentinel.querySelector(".mc-roll-visibility") && !sentinel.classList.contains("mc-compact-roll"));
  check("native controls survive admission", originalNodes.every(node => root.contains(node)));
  check("visibility controls are hidden", [...root.querySelectorAll(".mc-roll-visibility")].every(node => getComputedStyle(node).display === "none"));
  for (const control of root.querySelectorAll('select[name="rollMode"], select[name="messageMode"]')) check("native visibility value is public", ["public", "publicroll"].includes(control.value));
  const submit = root.querySelector('[type="submit"]');
  if (!params.has("keyboard")) {
    check("collapsed primary controls fit without scrolling", content.scrollHeight <= content.clientHeight + 1);
    check("Roll is visible without scrolling", submit.getBoundingClientRect().bottom <= bounds.bottom + 1 && submit.getBoundingClientRect().top >= root.querySelector(".window-header").getBoundingClientRect().bottom);
  }
  if (isHI && system === "hi") {
    check("H+I fields use available width", root.querySelector(".modifiers-table-item").getBoundingClientRect().width >= content.clientWidth - 26);
  }
  if (isHI) {
    const rows = [...root.querySelectorAll('.modifiers-table-item')].map(node => node.getBoundingClientRect());
    if (rows.length > 1) check("H+I primary rows have compact separation", rows.slice(1).every((row, i) => row.top - rows[i].bottom >= 3.5));
  }
  const controls = [...root.querySelectorAll("input, select, textarea, button, summary")].filter(node => node.getBoundingClientRect().width && node.getBoundingClientRect().height);
  check("visible controls are contained horizontally", controls.every(node => node.getBoundingClientRect().left >= bounds.left && node.getBoundingClientRect().right <= bounds.right + 1));
  check("compact dialogs hide the ineffective native resize grip", getComputedStyle(root.querySelector(".window-resize-handle")).display === "none");
  check("Roll retains a touch target", submit.getBoundingClientRect().height >= 44);
  const details = root.querySelector(".mc-roll-more");
  if (isHI) check("H+I has no unnecessary More options", !details);
  else {
    check("More options starts collapsed", details && !details.open);
    if (!isDND) check("active modifiers have a visible summary", details.querySelector("summary").textContent.includes("1 active modifier"));
    details.querySelector("summary").click(); await frame();
    check("More options expands", details.open);
    check("secondary fields remain accessible", details.getBoundingClientRect().height > 44);
    const sections = [...details.querySelectorAll(':scope > .mc-roll-option')];
    check("expanded independent sections have breathing room", sections.slice(1).every((slot, i) => slot.firstElementChild.getBoundingClientRect().top - sections[i].getBoundingClientRect().bottom >= 11.5));
    if (isWH) {
      check("WFRP uses the requested Relevant Modifiers heading", details.querySelector('.dialog-modifiers > label').textContent === 'Relevant Modifiers');
      const list = details.querySelector('.modifier-list').getBoundingClientRect(), hit = details.querySelector('[name="hitLocation"]').closest('.form-group').getBoundingClientRect();
      check("Hit Location has padding below modifiers", hit.top - list.bottom >= 11.5);
    }
    if (isSD) {
      const cards = [...details.querySelectorAll('.situational-option')].map(node => node.getBoundingClientRect());
      check("Shadowdark situational cards have separate spacing", cards.slice(1).every((card, i) => card.top - cards[i].bottom >= 7.5));
    }
    if (isSW) {
      const list = details.querySelector('ul.modifiers').getBoundingClientRect(), editor = details.querySelector('.modifier-entry.footer').getBoundingClientRect(), presets = details.querySelector('.presets').getBoundingClientRect();
      check("SWADE custom modifiers and presets have section spacing", editor.top - list.bottom >= 11.5 && presets.top - editor.bottom >= 11.5);
    }

    const lastOption = [...details.querySelectorAll("input, select, .modifier:not(.hidden), .tooltips, li")].filter(node => node.getBoundingClientRect().height && !node.closest(".dropdown.collapsed")).at(-1);
    content.scrollTop = content.scrollHeight;
    await frame();
    const optionBounds = lastOption.getBoundingClientRect();
    check("expanded options scroll to their final field", optionBounds.top >= content.getBoundingClientRect().top && optionBounds.bottom <= submit.getBoundingClientRect().top + 1);
    content.scrollTop = 0;

    const checkbox = details.querySelector('input[type="checkbox"]');
    if (checkbox) { checkbox.click(); check("native modifier checkbox works", !checkbox.checked); }
    const effect = details.querySelector('.modifier[data-index="0"]');
    if (effect) {
      effect.onclick = () => effect.classList.toggle("active"); effect.click(); await frame();
      check("native modifier action and summary update", effect.dataset.tooltip === "Native effect script" && !details.querySelector("summary").textContent.includes("active modifier"));
      check("hidden native effects stay hidden", getComputedStyle(root.querySelector(".modifier.hidden")).display === "none");
    }
    let replacement;
    if (isWH) {
      const nativePart = details.querySelector(".dialog-modifiers");
      replacement = nativePart.cloneNode(true);
      replacement.dataset.nativeReplacement = "true";
      nativePart.replaceWith(replacement);
    }
    admissions.admit(application, root, isSD, null, application); await frame();
    if (isWH) check("native partial replacement survives redecorating", root.querySelector(".dialog-modifiers") === replacement);
    if (isWH) {
      const list = root.querySelector(".modifier-list"), empty = root.querySelector(".mc-roll-modifiers-empty");
      const rows = [...list.children], classes = rows.map(row => row.className);
      check("populated native modifiers have natural height and no inner scroller", getComputedStyle(list).overflowY === "visible" && list.clientHeight >= rows.filter(row => !row.classList.contains("hidden")).reduce((sum, row) => sum + row.getBoundingClientRect().height, 0));
      check("populated list hides empty message", getComputedStyle(empty).display === "none");
      rows.forEach(row => row.classList.add("hidden"));
      check("hidden-only modifiers show an explicit empty state", getComputedStyle(list).display === "none" && getComputedStyle(empty).display !== "none");
      list.replaceChildren();
      check("zero modifiers show an explicit empty state", getComputedStyle(list).display === "none" && empty.textContent === "No optional modifiers for this roll.");
      rows.forEach((row, i) => row.className = classes[i]); list.append(...rows);
      check("native part replacement retains one empty-state label", root.querySelectorAll(".mc-roll-modifiers-empty").length === 1);
    }

    check("native rerender retains expansion and one options group", root.querySelectorAll(".mc-roll-more").length === 1 && root.querySelector(".mc-roll-more").open);
    root.querySelector(".mc-roll-more").querySelector("summary").click(); await frame();
  }
  if (isWH) {
    const sl = root.querySelector('[name="SL"]'); let changes = 0; sl.addEventListener("change", () => changes++);
    sl.closest(".mc-roll-counter").querySelector("button").click();
    check("SL decrement crosses zero through native change", sl.value === "-1" && changes === 1);
    sl.closest(".mc-roll-counter").querySelector("button:last-child").click();
    check("SL increment retains native input", sl.value === "0" && changes === 2);
  }
  // Change away from public behind the hidden control to prove submission enforcement.
  for (const control of root.querySelectorAll('select[name="rollMode"], select[name="messageMode"]')) control.selectedIndex = 0;
  application.options.context.rollMode = "blindroll";
  submit.click();
  check("native submit fires", submitted instanceof FormData);
  const key = isSW ? "messageMode" : "rollMode";
  if (!isHI) check("submitted visibility is public", ["public", "publicroll"].includes(submitted.get(key)));
  check("H+I per-dialog context is public", !isHI || application.options.context.rollMode === "publicroll");
  check("D&D per-dialog message is public", !isDND || application.message.rollMode === "public");
  admissions.release(application);
  if (isWH) check("release restores the native modifier heading after a partial replacement", root.querySelector('.dialog-modifiers > label').textContent === 'Modifiers' && !root.querySelector('[data-mc-native-modifiers-label]'));
  check("release restores native nodes and containers", originalNodes.every(node => root.contains(node)) && !root.querySelector(".mc-roll-more, .mc-roll-counter, .mc-roll-state-short, .mc-roll-visibility, .mc-roll-modifiers-empty") && !root.classList.contains("mc-compact-roll"));
  check("release keeps native visibility control accessible", !isHI || getComputedStyle(root.querySelector(".roll-mode-buttons")).display !== "none");
  admissions.admit(application, root, isSD, null, application); await frame();
  root.querySelector('[data-action="close"]').onclick = () => application.close();
  root.querySelector('[data-action="close"]').click();
  check("native cancellation releases admission", !root.isConnected && admissions.size === 0);
  document.body.append(root); admissions.admit(application, root, isSD, null, application); await frame();
  document.activeElement?.blur(); content.scrollTop = 0; sentinel.remove();
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
