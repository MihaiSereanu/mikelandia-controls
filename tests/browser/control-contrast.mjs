import { renderNativeCharacter } from "/src/features/characters/sheets/native-sheet.mjs";
import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";
import { resolveCharacterThemeProfile } from "/src/features/characters/appearance/character-theme.mjs";

const checks = [];
const check = (name, condition) => { if (!condition) throw new Error(name); checks.push(name); };
const scope = createTaskScope("native-control-contrast"), root = document.querySelector("main");
const palettes = ["neutral", "red", "bestiary", "wizard", "sorcerer", "cleric", "paladin", "druid", "ranger", "bard", "fighter", "rogue", "barbarian", "monk", "warlock", "artificer", "psion"];
const profiles = [...palettes.map(theme => [theme]), ["wizard", "cleric", "druid"], ["sorcerer", "barbarian", "paladin"], ["rogue", "warlock", "psion"]];
const canvas = document.createElement("canvas"), context = canvas.getContext("2d", { willReadFrequently: true });
canvas.width = canvas.height = 1;
const rgb = color => {
  context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
  return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => value / 255);
};
const opaque = color => {
  context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
  return context.getImageData(0, 0, 1, 1).data[3] === 255;
};
const luminance = color => rgb(color).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const resolveColor = value => { const probe = document.createElement("span"); probe.style.color = value; root.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; };
const calls = [];
const commands = { localize: (_key, fallback) => fallback, readLocale: () => "en", execute: async (...args) => calls.push(args), openNativeActorEditor: async payload => calls.push(payload) };
const row = { id: "momentum", label: "Momentum", value: false, format: "boolean", editControl: "checkbox", edit: { id: "momentum", revision: "test", kind: "boolean" } };
const actor = { id: "hero", sourceUuid: "Actor.hero", name: "Hero", typeLabel: "Character", nativeSheetAvailable: true, presentation: "profile",
  panels: [{ id: "combat", label: "Combat", sections: [{ id: "momentum", label: "Momentum", kind: "values", rows: [row] }] }] };
try {
  check("native Foundry stylesheet available", (await fetch("/native-fixture/foundry2.css")).ok);
  const screen = renderNativeCharacter({ state: { characterTab: "combat", snapshot: { selectedActor: actor } }, commands, scope,
    createChooser: () => ({ element: document.createElement("div"), mount() {}, unmount() {} }) });
  root.append(screen);
  const input = root.querySelector('input[type="checkbox"]'), button = root.querySelector(".mc-native-sheet-open");
  await Promise.all([document.fonts.load('900 20px "Font Awesome 7 Pro"', "\uf0c8"), document.fonts.load('900 20px "Font Awesome 7 Duotone"', "\uf14a")]);
  check("installed solid and duotone fonts loaded", document.fonts.check('900 20px "Font Awesome 7 Pro"', "\uf0c8") && document.fonts.check('900 20px "Font Awesome 7 Duotone"', "\uf14a"));
  for (const nativeTheme of ["dark", "light"]) for (const theme of ["dark", "light"]) for (const protectedStyle of [false, true]) for (const themes of profiles) {
    document.body.classList.toggle("theme-dark", nativeTheme === "dark"); document.body.classList.toggle("theme-light", nativeTheme === "light");
    root.dataset.theme = theme; root.toggleAttribute("data-mc-style-authority", protectedStyle);
    const profile = resolveCharacterThemeProfile(themes);
    root.dataset.characterTheme = profile.theme; root.dataset.characterThemeBlend = profile.multiclass ? "multiclass" : "single";
    screen.dataset.characterTheme = profile.theme;
    for (const [index, suffix] of ["primary", "secondary", "tertiary"].entries()) {
      root.style.setProperty(`--mc-class-accent-${suffix}`, profile.accents[index].bright);
      root.style.setProperty(`--mc-class-deep-${suffix}`, profile.accents[index].deep);
    }
    const label = `${theme}/${nativeTheme}/${protectedStyle}/${themes.join("+")}`;
    const card = getComputedStyle(input.closest(".mc-profile-section")).backgroundColor;
    const rowBackground = getComputedStyle(input.closest(".mc-profile-row")).backgroundColor;
    input.checked = false;
    const off = getComputedStyle(input, "::before"), inputStyle = getComputedStyle(input);
    check(`native unchecked glyph retained ${label}`, inputStyle.appearance === "none" && off.content !== "none" && off.fontFamily.includes("Font Awesome")
      && off.opacity === "1" && inputStyle.opacity === "1" && opaque(off.color) && opaque(rowBackground));
    check(`unchecked silhouette contrast ${label}`, contrast(off.color, rowBackground) >= 3 && contrast(off.color, card) >= 3);
    check(`checkbox dimensions and target ${label}`, input.getBoundingClientRect().width === 20 && input.getBoundingClientRect().height === 20
      && parseFloat(off.fontSize) === 20 && input.closest("label").getBoundingClientRect().width >= 44 && input.closest("label").getBoundingClientRect().height >= 44);
    input.checked = true;
    const mark = getComputedStyle(input, "::before"), fill = getComputedStyle(input, "::after");
    check(`checked silhouette and mark contrast ${label}`, contrast(fill.color, rowBackground) >= 3 && contrast(fill.color, card) >= 3 && contrast(mark.color, fill.color) >= 3
      && mark.fontFamily.includes("Duotone") && fill.content !== "none" && mark.opacity === "1" && fill.opacity === "1" && opaque(mark.color) && opaque(fill.color));
    const buttonStyle = getComputedStyle(button);
    check(`button text contrast ${label}`, contrast(buttonStyle.color, buttonStyle.backgroundColor) >= 4.5);
    if (theme === "light") check(`button boundary contrast ${label}`, contrast(buttonStyle.borderTopColor, resolveColor("var(--mc-bg)")) >= 3
      && contrast(buttonStyle.borderTopColor, resolveColor("var(--mc-surface)")) >= 3);
  }
  input.checked = false; input.click(); await Promise.resolve(); await Promise.resolve();
  check("Momentum retains real checkbox change command", calls[0]?.[1]?.resourceId === "momentum" && calls[0][1].value === true && calls[0][1].expectedValue === false);
  button.click(); await Promise.resolve();
  check("native sheet button retains its exact source command", calls.at(-1)?.actorSourceUuid === actor.sourceUuid);
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) { document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack }); }
finally { scope.dispose(); }
