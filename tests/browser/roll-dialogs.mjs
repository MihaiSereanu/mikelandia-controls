import { createMobileApplicationAdmissions } from "/src/foundry/presentation/mobile-presentation.mjs";

// Representative native template structure; actions below are fixture handlers,
// not proof of native calculations, chat, effects or ammunition consumption.
const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const style = element => getComputedStyle(element);
const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
const luminance = value => rgb(value).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const palette = (element) => [style(element).backgroundColor, style(element).color, style(element).fontFamily, style(element).borderRadius].join("|");
const field = (label, name, value = "0") => `<div class="form-group"><label>${label}</label><div class="form-fields"><input type="number" name="${name}" value="${value}"></div></div>`;
const shadowdark = `<div data-application-part="content"><h2>Longbow Attack</h2><hr>
  <div class="roll-input flexrow"><label>Attack</label><input name="mainFormula" value="1d20 + 3"><p class="tooltips">Dexterity +2, Weapon Mastery +1</p></div>
  <div class="advantage-buttons">${["Disadvantage", "Normal", "Advantage"].map((label, i) => `<input type="radio" name="advantage" value="${i}" id="adv-${i}" ${i === 1 ? "checked" : ""}><label for="adv-${i}">${label}</label>`).join("")}</div><hr>
  <div class="roll-input flexrow"><label>Damage</label><input name="damageFormula" value="1d8 + 1"><p class="tooltips">Longbow, Weapon Mastery +1</p></div>
  <div class="roll-input flexrow"><label>Ammunition</label><select name="ammunitionId"><option value="arrows">Arrows (20/20)</option></select></div>
  <div class="situational-options"><label style="font-size:1.25em">Situational bonuses</label><div class="situational-option"><p class="tooltips"><b>Bless.</b> A blessing adds a bonus to this attack.</p><input type="checkbox" name="selected" value="bless"></div></div>
  </div><footer class="roll-footer"><select name="rollMode"><option value="publicroll">Public Roll</option><option value="gmroll">Private GM Roll</option></select><button type="submit" class="default">Roll</button></footer>`;
const warhammer = edition => `<div class="dialog-base"><div class="dialog-fields"><div data-application-part="default">
  ${field(edition === "4e" ? "Advantage" : "Modifier", edition === "4e" ? "advantage" : "modifier")}
  ${edition === "4e" ? field("Modifier", "modifier") + field("SL Bonus", "slBonus") + field("Success Bonus", "successBonus") : field("SL", "SL")}
  </div><div data-application-part="specific"><div class="form-group stacked"><label>Difficulty</label><div class="form-fields"><select name="difficulty"><option value="challenging">Challenging (+0)</option></select></div></div>
  ${edition === "5e" ? `<div class="flexrow gap">${field("Damage", "damage", "6")}<div class="form-group"><label>Charging <input type="checkbox" name="charging"></label></div></div>` : '<div class="form-group"><label>Charging</label><div class="form-fields"><input type="checkbox" name="charging"></div></div>'}</div></div>
  <div class="dialog-modifiers" data-application-part="modifiers"><label>Modifiers</label><ul class="modifier-list">
  <li class="modifier active" data-action="clickModifier" data-key="aim" data-tooltip="Aim bonus">&#8226; <a>Aim</a></li>
  <li class="modifier" data-action="clickModifier" data-index="0" data-tooltip="Native effect script">&#8226; <a>Blessing of Ulric</a></li>
  <li class="modifier hidden" data-action="clickModifier" data-index="1">Hidden native effect</li></ul></div></div>
  ${edition === "5e" ? `<div class="state-fields">${["Advantage", "Normal", "Disadvantage"].map((label, i) => `<div><div class="state-field ${i === 1 ? "active" : ""}" data-action="clickState" data-type="${label.toLowerCase()}">${i !== 1 ? '<div class="state-value">0</div>' : ""}<label>${label}</label></div></div>`).join("")}</div>` : ""}
  <div class="form-group"><label>Roll Mode</label><div class="form-fields"><select name="rollMode"><option>Public Roll</option></select></div></div>
  <footer class="form-footer" data-application-part="footer"><button type="submit">Roll</button></footer>`;

try {
  const params = new URLSearchParams(location.search), system = params.get("system"), theme = params.get("theme"), layout = params.get("layout");
  const main = document.querySelector("main");
  if (params.has("native-assets")) {
    const font = new FontFace("Font Awesome 7 Pro", 'url("/native-fixture/fa-solid-900.woff2")', { weight: "900" });
    document.fonts.add(await font.load());
    check("installed Foundry icon font loads", font.status === "loaded");
  }
  main.dataset.theme = theme; main.dataset.formFactor = layout;
  document.body.classList.add(theme === "dark" ? "theme-light" : "theme-dark");
  if (params.has("large")) document.documentElement.style.fontSize = "24px";
  const isSD = system === "shadowdark";
  const root = document.createElement("form");
  root.className = isSD ? "application themed" : "application themed warhammer roll-dialog-v2";
  if (isSD) root.id = "sd-roll-dialog";
  root.innerHTML = `<header class="window-header"><h1 class="window-title">${isSD ? "Longbow" : "Melee (Basic)"}</h1><button type="button" class="header-control fa-solid fa-ellipsis-vertical icon" data-action="toggleControls" aria-label="Controls"></button><button type="button" class="header-control fa-solid fa-xmark icon" data-action="close" aria-label="Close"></button></header><section class="window-content standard-form">${isSD ? shadowdark : warhammer(system)}</section>`;
  document.body.append(root);
  // Capture native appearance before admission, and unrelated applications.
  const nativePalette = palette(root);
  const sentinel = document.createElement("div"); sentinel.className = "application dnd5e2 roll-configuration sentinel";
  sentinel.innerHTML = '<input value="D&D 5E"><button>Roll</button>';
  document.body.append(sentinel);
  const dndPalette = palette(sentinel), dndInput = palette(sentinel.querySelector("input"));
  const admissions = createMobileApplicationAdmissions(document.body);
  const application = { close() { admissions.release(application); root.remove(); } };
  // Warhammer's native root is a nonmodal ApplicationV2 form.
  admissions.admit(application, root, isSD, null, application);
  await frame();
  const themedPalette = palette(root);
  check("admitted native form receives the shell palette", style(root).backgroundColor === (theme === "light" ? "rgb(255, 253, 249)" : "rgb(33, 29, 29)"));
  check("dialog follows the shell despite an independent native theme", style(root).colorScheme === theme);
  check("native fonts are replaced", style(root).fontFamily.includes("system-ui"));
  const headerControls = [...root.querySelectorAll(".header-control")];
  check("header buttons preserve the icon font", headerControls.every(button => style(button).fontFamily.includes("Font Awesome")));
  check("header controls have no boxes", headerControls.every(button => style(button).borderWidth === "0px" && style(button).backgroundColor === "rgba(0, 0, 0, 0)"));
  check("header controls retain touch targets", headerControls.every(button => button.getBoundingClientRect().width >= 44 && button.getBoundingClientRect().height >= 44));
  check("dialog text has AA contrast", contrast(style(root).color, style(root).backgroundColor) >= 4.5);
  const input = root.querySelector('input:not([type="radio"]):not([type="checkbox"])');
  check("native input shadows and square borders are replaced", style(input).boxShadow === "none" && style(input).borderRadius === "10px");
  check("inputs retain readable contrast", contrast(style(input).color, style(input).backgroundColor) >= 4.5);
  check("numeric and formula inputs retain touch height", input.getBoundingClientRect().height >= 44);
  check("dialog is contained horizontally", root.getBoundingClientRect().left >= 0 && root.getBoundingClientRect().right <= innerWidth + 1 && root.scrollWidth <= root.clientWidth + 1);
  check("content remains vertically scrollable", /auto|scroll/.test(style(root.querySelector(".window-content")).overflowY));
  check("labels have readable contrast", [...root.querySelectorAll(".form-group > label, .roll-input > label")].every(label => contrast(style(label).color, style(root).backgroundColor) >= 4.5));
  check("all selects have touch height", [...root.querySelectorAll("select")].every(select => select.getBoundingClientRect().height >= 44));
  input.focus();
  check("keyboard focus is visible", style(input).outlineStyle === "solid" && style(input).outlineWidth === "2px");
  input.value = "7"; input.dispatchEvent(new Event("change", { bubbles: true }));
  const checkbox = root.querySelector('input[type="checkbox"]'); checkbox.click();
  check("checkbox remains interactive", checkbox.checked);
  if (isSD) {
    root.querySelector('label[for="adv-2"]').click();
    await new Promise(resolve => setTimeout(resolve, 180)); // Native radio background transition.
    const selected = root.querySelector('input[value="2"]');
    check("native radio and label association survives", selected.checked);
    check("selected advantage receives accent and contrast", style(selected.nextElementSibling).backgroundColor === "rgb(166, 15, 47)" && contrast(style(selected.nextElementSibling).color, style(selected.nextElementSibling).backgroundColor) >= 4.5);
    check("all advantage choices have touch height", [...root.querySelectorAll(".advantage-buttons label")].every(label => label.getBoundingClientRect().height >= 44));
    check("situational description remains legible", contrast(style(root.querySelector(".tooltips")).color, style(root).backgroundColor) >= 4.5);
  } else {
    const sl = root.querySelector(system === "4e" ? '[name="slBonus"]' : '[name="SL"]');
    const counter = sl.closest(".mc-roll-counter");
    let changes = 0;
    sl.addEventListener("change", () => changes++);
    counter.querySelector("button").click();
    check("SL decrement crosses zero and dispatches native change", sl.value === "-1" && changes === 1);
    counter.querySelector("button:last-child").click();
    check("SL increment dispatches native change", sl.value === "0" && changes === 2);
    check("SL buttons retain touch targets", [...counter.querySelectorAll("button")].every(button => button.getBoundingClientRect().width >= 44));
    const nativeFields = counter.parentElement;
    nativeFields.replaceChildren(sl.cloneNode(true));
    admissions.admit(application, root, false, null, application);
    const rerenderedSL = nativeFields.querySelector("input");
    let rerenderChanges = 0;
    rerenderedSL.addEventListener("change", () => rerenderChanges++);
    nativeFields.querySelector("button").click();
    check("native partial rerender receives one working SL stepper", nativeFields.querySelectorAll(".mc-roll-counter").length === 1
      && rerenderedSL.value === "-1" && rerenderChanges === 1 && rerenderedSL !== sl);
    const charging = root.querySelector('input[name="charging"]');
    const chargingLabel = charging.closest(".form-group").querySelector("label");
    const labelText = document.createRange(); labelText.selectNode(chargingLabel.firstChild);
    const textRect = labelText.getBoundingClientRect(), checkboxRect = charging.getBoundingClientRect();
    check("Charging checkbox and label share one centered row", Math.abs((textRect.top + textRect.bottom) / 2 - (checkboxRect.top + checkboxRect.bottom) / 2) <= 2 && checkboxRect.left >= textRect.right);
    check("Charging retains a touch-sized row", charging.closest(".form-group").getBoundingClientRect().height >= 44);
    const modifiers = root.querySelector(".modifier-list");
    check("parchment and inset shadow are replaced", style(modifiers).backgroundImage === "none" && style(modifiers).boxShadow === "none");
    check("hidden native effects stay hidden", style(root.querySelector(".modifier.hidden")).display === "none");
    check("modifier rows have touch height", root.querySelector(".modifier.active").getBoundingClientRect().height >= 44);
    check("modifier scripts retain their action and tooltip metadata", root.querySelector('[data-index="0"]').dataset.tooltip === "Native effect script");
    check("fields are not clipped by native overflow rules", style(root.querySelector(".dialog-fields")).overflow === "visible");
    if (system === "5e") {
      const damage = root.querySelector('input[name="damage"]').getBoundingClientRect();
      check("Charging aligns vertically with Damage input", Math.abs((damage.top + damage.bottom) / 2 - (checkboxRect.top + checkboxRect.bottom) / 2) <= 2);
      const state = root.querySelector(".state-field.active");
      check("5e state controls retain contrast", contrast(style(state).color, style(state).backgroundColor) >= 4.5);
      check("5e states have touch height", [...root.querySelectorAll(".state-field")].every(item => item.getBoundingClientRect().height >= 44));
      check("5e states stay inside the dialog", [...root.querySelectorAll(".state-field")].every(item => item.getBoundingClientRect().right <= root.getBoundingClientRect().right));
      const states = [...root.querySelectorAll(".state-field")].map(item => item.getBoundingClientRect());
      const rollMode = root.querySelector('select[name="rollMode"]').getBoundingClientRect();
      check("state button outer edges align with Roll Mode", Math.abs(states[0].left - rollMode.left) <= 1 && Math.abs(states[2].right - rollMode.right) <= 1);
      check("state buttons have equal widths", states.every(rect => Math.abs(rect.width - states[0].width) <= 1));
      check("state controls always share one row", states.every(rect => Math.abs(rect.top - states[0].top) <= 1));
      check("state labels fit without splitting words", [...root.querySelectorAll(".state-field")].every(item => item.scrollWidth <= item.clientWidth + 1 && style(item.querySelector("label")).whiteSpace === "nowrap"));
      check("compact text preserves the full accessible native labels", [...root.querySelectorAll(".mc-roll-state-short")].every(item => item.getAttribute("aria-hidden") === "true") && root.querySelector('[data-type="advantage"] .mc-roll-state-full')?.textContent === "Advantage");
      const nativeControl = root.querySelector('[data-type="advantage"]');
      admissions.admit(application, root, isSD, null, application);
      check("repeated admission retains native controls without duplicating labels", root.querySelector('[data-type="advantage"]') === nativeControl && nativeControl.querySelectorAll(".mc-roll-state-full").length === 1 && nativeControl.querySelectorAll(".mc-roll-state-short").length === 1);
    }
  }
  const submit = root.querySelector('[type="submit"]');
  check("Roll button uses accessible accent", style(submit).backgroundColor === "rgb(166, 15, 47)" && contrast(style(submit).color, style(submit).backgroundColor) >= 4.5);
  check("Roll button has touch height", submit.getBoundingClientRect().height >= 44);
  const content = root.querySelector(".window-content");
  content.scrollTop = content.scrollHeight;
  check("scrolling reaches the complete Roll button", submit.getBoundingClientRect().bottom <= root.getBoundingClientRect().bottom + 1 && submit.getBoundingClientRect().top >= root.querySelector(".window-header").getBoundingClientRect().bottom);
  submit.disabled = true; check("disabled submit stays disabled and visibly distinct", submit.disabled && style(submit).opacity === "0.5"); submit.disabled = false;
  let submitted;
  root.addEventListener("submit", event => { event.preventDefault(); submitted = new FormData(root); });
  submit.click();
  check("native form values still reach submission", submitted?.get(input.name) === "7");
  const originalInput = input;
  // A native partial rerender retains the root and admission; new controls theme automatically.
  const replacement = input.cloneNode(true); input.replaceWith(replacement);
  check("new controls after native partial rerender stay themed", style(replacement).borderRadius === "10px" && originalInput !== replacement);
  main.dataset.theme = theme === "light" ? "dark" : "light";
  check("open dialog tracks theme changes without rerender", palette(root) !== themedPalette);
  main.dataset.theme = theme;
  check("D&D appearance remains unchanged", palette(sentinel) === dndPalette && palette(sentinel.querySelector("input")) === dndInput);
  admissions.release(application);
  check("release restores native appearance", palette(root) === nativePalette);
  check("release removes presentation labels", !root.querySelector(".mc-roll-state-full, .mc-roll-state-short"));
  check("release restores unwrapped native SL field", !root.querySelector(".mc-roll-counter"));
  admissions.admit(application, root, isSD, null, application);
  document.body.classList.remove("mc-mobile-running");
  check("desktop never receives the mobile palette", palette(root) === nativePalette);
  document.body.classList.add("mc-mobile-running");
  root.querySelector('[data-action="close"]').onclick = () => application.close();
  root.querySelector('[data-action="close"]').click();
  check("native close still releases window and admission", !root.isConnected && admissions.size === 0 && !document.body.classList.contains("mc-mobile-dialog-open"));
  document.body.append(root); admissions.admit(application, root, isSD, null, application);
  // Retain a clean preview of the representative native form.
  document.activeElement?.blur(); content.scrollTop = 0;
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
