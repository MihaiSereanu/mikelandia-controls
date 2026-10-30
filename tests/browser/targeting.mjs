import { targetingFixture } from "../helpers/targeting.mjs";
import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";
import { renderCombat } from "/src/features/combat/presenter.mjs";
import { createFoundryCombatGateway } from "/src/foundry/combat/combat-gateway.mjs";

const checks = [];
const check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const f = targetingFixture(); globalThis.game = f.game; globalThis.Hooks = f.hooks;
f.pc.actor = f.actor;
f.enemy.actor = { system: { attributes: { hp: { value: 10, max: 20 } } } };
for (const combatant of f.game.combat.turns) {
  combatant.token = f.scene.tokens.get(combatant.tokenId);
  combatant.visible = !combatant.token.hidden;
  combatant.initiative = 15;
}
f.game.combat.turns[0].name = "Hero";
const combatGateway = createFoundryCombatGateway({ getGame: () => f.game });
const scope = createTaskScope(), root = document.createElement("main");
root.className = "mc-mobile-app"; document.body.append(root);
const params = new URLSearchParams(location.search);
if (params.has("large")) root.style.setProperty("font-size", "24px", "important");
let view;
const commands = {
  readLocale: () => "en", localize: (_key, fallback) => fallback,
  toggleCombatTarget: request => f.gateway.toggle(request),
  selectCombatTargetSource: request => f.gateway.selectSource(request), setCombatTargetsExpanded: value => f.gateway.setExpanded(value)
};
const render = targeting => {
  const combat = combatGateway.snapshot();
  if (root.firstElementChild?.__mcUpdateCombatState(combat, targeting)) return;
  view?.dispose(); view = scope.child("view");
  root.replaceChildren(renderCombat({ state: { targeting, snapshot: { combat } }, commands, scope: view }));
};
try {
  if (params.has("native-assets")) {
    const response = await fetch("/native-fixture/foundry2.css");
    check("native Foundry button stylesheet is available", response.ok);
    const rule = (await response.text()).match(/a\.button,\s*button\s*\{[^}]+\}/u)?.[0];
    check("native Foundry button defaults found", Boolean(rule));
    const style = document.createElement("style");
    style.textContent = `@layer modules { :root { --button-size: 32px; } ${rule} }`;
    document.head.prepend(style);
  }
  const summaryHasBottomSpace = () => {
    const heading = root.querySelector(".mc-targets-heading"), summary = heading.querySelector(".mc-targets-summary");
    return heading.getBoundingClientRect().bottom - summary.getBoundingClientRect().bottom >= 18;
  };
  f.gateway.watch(scope, () => f.actor.uuid, render);
  f.game.combat.scene = null; f.hooks.emit("updateCombat", f.game.combat, { scene: null }); await tick();
  check("native unlinked encounter keeps selector in combatant scene", !!root.querySelector(".mc-targets"));
  check("target section starts collapsed", root.querySelector(".mc-targets-heading").getAttribute("aria-expanded") === "false" && !root.querySelector(".mc-target-row"));
  check("empty target summary clears bottom border", summaryHasBottomSpace());
  root.querySelector(".mc-targets-heading").click(); await tick();
  check("friendly and enemy groups", root.querySelectorAll(".mc-target-group").length === 2);
  check("hidden and outside tokens excluded", root.querySelectorAll(".mc-target-row").length === 3);
  check("self label inline with name and no distance", root.querySelector('[data-target-id="pc"] strong').textContent === "pc (You)" && !root.querySelector('[data-target-id="pc"] .mc-target-distance'));
  check("clear targets button removed", !root.querySelector(".mc-target-clear"));
  check("larger header caret and padding", root.querySelector(".mc-targets-caret").getBoundingClientRect().width >= 24 && parseFloat(getComputedStyle(root.querySelector(".mc-targets-heading")).paddingLeft) >= 18);
  check("distance uses numeric scene units", root.querySelector('[data-target-id="enemy"]').textContent.includes("15 ft"));
  check("friendly exact HP and enemy qualitative health", root.querySelector('[data-target-id="pc"] .mc-target-health').textContent === "HP 7 / 12"
    && root.querySelector('[data-target-id="enemy"] .mc-target-health').textContent === "Bloodied");
  check("Initiative shares friendly and enemy health", root.querySelector('[data-combatant-id="c-pc"] .mc-combat-health').textContent === "HP 7 / 12"
    && root.querySelector('[data-combatant-id="c-enemy"] .mc-combat-health').textContent === "Bloodied");
  const sameLine = (name, health) => {
    const a = name.getBoundingClientRect(), b = health.getBoundingClientRect();
    return b.left >= a.right && b.top < a.bottom;
  };
  if (!params.has("large")) check("short names and health share a line in both lists", sameLine(root.querySelector('[data-target-id="pc"] strong'), root.querySelector('[data-target-id="pc"] .mc-target-health'))
    && sameLine(root.querySelector('[data-combatant-id="c-pc"] strong'), root.querySelector('[data-combatant-id="c-pc"] .mc-combat-health')));
  if (params.has("large")) check("large target text is rendered", parseFloat(getComputedStyle(root.querySelector('.mc-target-row')).fontSize) >= 24);
  check("unknown health omitted", getComputedStyle(root.querySelector('[data-target-id="neutral"] .mc-target-health')).display === "none");
  const healthRow = root.querySelector('[data-target-id="enemy"]'); healthRow.focus();
  f.enemy.actor.system.attributes.hp.value = 2; f.hooks.emit("updateActor", f.enemy.actor, {}); await tick();
  check("health refresh preserves row and focus", root.querySelector('[data-target-id="enemy"]') === healthRow
    && document.activeElement === healthRow && healthRow.querySelector(".mc-target-health").textContent === "Critical");
  check("Initiative health refreshes with target health", root.querySelector('[data-combatant-id="c-enemy"] .mc-combat-health').textContent === "Critical");
  root.firstElementChild.__mcUpdateCombatTargets(f.gateway.snapshot());
  check("target-only updates preserve the latest Initiative health", root.querySelector('[data-combatant-id="c-enemy"] .mc-combat-health').textContent === "Critical");
  f.actor.system.attributes.hp.value = 4; f.hooks.emit("updateActor", f.actor, {}); await tick();
  check("friendly HP refreshes in place", root.querySelector('[data-target-id="pc"] .mc-target-health').textContent === "HP 4 / 12"
    && root.querySelector('[data-target-id="enemy"]') === healthRow);
  root.querySelector('[data-target-id="enemy"]').click(); await tick();
  root.querySelector('[data-target-id="neutral"]').click(); await tick();
  check("multiple native targets", f.game.user.targets.size === 2);
  check("pressed selection accessible", root.querySelector('[data-target-id="enemy"]').getAttribute("aria-pressed") === "true");
  root.querySelector(".mc-targets-heading").click(); await tick();
  check("collapsed section has selected summary", !root.querySelector(".mc-target-row") && /enemy.*neutral/.test(root.querySelector(".mc-targets-heading").textContent));
  check("selected target summary clears bottom border", summaryHasBottomSpace());
  f.enemy.hidden = true; f.hooks.emit("updateToken", f.enemy, { hidden: true }); await tick();
  check("hidden target removed while collapsed", !f.game.user.targets.has(f.canvas.tokens.get("enemy")));
  root.querySelector(".mc-targets-heading").click(); await tick();
  f.canvas.tokens.get("outside").setTarget(true, { releaseOthers: false }); await tick();
  root.querySelector('[data-target-id="neutral"]').click(); await tick();
  check("individual deselection preserves outside targets", f.game.user.targets.size === 1 && f.game.user.targets.has(f.canvas.tokens.get("outside")));
  f.enemy.hidden = false; f.enemy.x = 400; f.hooks.emit("updateToken", f.enemy, {}); await tick();
  check("movement updates distance", root.querySelector('[data-target-id="enemy"]').textContent.includes("20 ft"));
  const combatScreen = root.firstElementChild, enemyRow = root.querySelector('[data-target-id="enemy"]');
  enemyRow.focus(); f.enemy.x = 500;
  f.hooks.emit("refreshToken", f.canvas.tokens.get("enemy"), { refreshPosition: true }); await tick();
  check("animation refresh updates distance in place", enemyRow.querySelector(".mc-target-distance").textContent === "25 ft" && root.firstElementChild === combatScreen && root.querySelector('[data-target-id="enemy"]') === enemyRow && document.activeElement === enemyRow);
  f.pc.x = 100; f.hooks.emit("refreshToken", f.canvas.tokens.get("pc"), { refreshPosition: true }); await tick();
  check("source movement updates other distances in place", enemyRow.querySelector(".mc-target-distance").textContent === "20 ft" && root.querySelector('[data-target-id="enemy"]') === enemyRow);
  f.scene.tokens.push(f.makeToken("second", 100, 1, { actorId: f.actor.id })); f.hooks.emit("createToken", {}); await tick();
  check("ambiguous source requires choice", !!root.querySelector(".mc-target-source") && root.querySelector(".mc-target-row").disabled);
  const select = root.querySelector(".mc-target-source select"); select.value = "second"; select.dispatchEvent(new Event("change")); await tick();
  check("source selection enables targets", !root.querySelector(".mc-target-row").disabled);
  f.scene.tokens.splice(f.scene.tokens.findIndex(token => token.id === "second"), 1);
  f.pc.actorId = "missing"; f.hooks.emit("updateToken", f.pc, {}); await tick();
  check("missing PC disables targeting", [...root.querySelectorAll(".mc-target-row")].every(button => button.disabled));
  check("missing PC explains requirement", root.querySelector(".mc-target-status").textContent.includes("selected character"));
  check("initiative remains present", root.querySelector(".mc-combat-name strong").textContent === "Hero" && root.querySelector(".mc-combat-initiative").textContent === "15");
  check("touch targets at least 44px", [...root.querySelectorAll(".mc-target-row")].every(button => button.getBoundingClientRect().height >= 44));
  check("no horizontal overflow", document.documentElement.scrollWidth <= innerWidth + 1);
  f.pc.actorId = f.actor.id;
  const pcName = f.game.combat.turns[0].name;
  f.pc.name = "A character with an exceptionally long name"; f.game.combat.turns[0].name = f.pc.name;
  f.hooks.emit("updateToken", f.pc, { name: f.pc.name }); await tick();
  check("long names wrap beside readable health without overflow", document.documentElement.scrollWidth <= innerWidth + 1
    && [...root.querySelectorAll('.mc-target-health:not([hidden]), .mc-combat-health:not([hidden])')].every(element => element.getBoundingClientRect().right <= innerWidth + 1));
  check("self label and distance remain available after wrapping", root.querySelector('[data-target-id="pc"] .mc-target-you').textContent.includes("You")
    && root.querySelector('[data-target-id="enemy"] .mc-target-distance').textContent.includes("ft"));
  f.game.system.id = "wfrp4e";
  f.actor.system.status = { wounds: f.actor.system.attributes.hp };
  f.enemy.actor.system.status = { wounds: f.enemy.actor.system.attributes.hp };
  f.pc.texture.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"/>';
  f.hooks.emit("updateToken", f.pc, {}); await tick();
  check("Wounds with portrait fit both lists at narrow and enlarged sizes", root.querySelector('[data-target-id="pc"] .mc-target-health').textContent.includes("Wounds")
    && document.documentElement.scrollWidth <= innerWidth + 1
    && [...root.querySelectorAll('.mc-target-health:not([hidden]), .mc-combat-health:not([hidden])')].every(element => element.getBoundingClientRect().right <= innerWidth + 1));
  f.game.system.id = "dnd5e"; delete f.pc.texture.src;
  f.pc.name = "pc"; f.game.combat.turns[0].name = pcName; f.hooks.emit("updateToken", f.pc, {}); await tick();
  f.game.combat.started = false; f.hooks.emit("updateCombat", {}); await tick();
  check("selector hidden after combat ends", !root.querySelector(".mc-targets"));
  f.pc.actorId = f.actor.id; f.game.combat.started = true; f.gateway.refresh();
  f.gateway.toggle(f.request("enemy"));
  f.game.combat.combatant = f.game.combat.turns.find(combatant => combatant.tokenId === "enemy");
  f.hooks.emit("updateCombat", f.game.combat, {}); await tick(); render(f.gateway.snapshot());
  check("Initiative enemy classification includes neutral without health", root.querySelector('[data-combatant-id="c-enemy"]').classList.contains("is-enemy")
    && root.querySelector('[data-combatant-id="c-neutral"]').classList.contains("is-enemy")
    && !root.querySelector('[data-combatant-id="c-pc"]').classList.contains("is-enemy"));
  const colorProbe = document.createElement("span"); colorProbe.style.position = "absolute"; root.append(colorProbe);
  for (const protectedStyle of [false, true]) for (const theme of ["light", "dark"]) {
    root.toggleAttribute("data-mc-style-authority", protectedStyle); root.dataset.theme = theme;
    colorProbe.style.borderColor = "color-mix(in srgb, #c64f4f 55%, var(--mc-border))";
    colorProbe.style.backgroundColor = "color-mix(in srgb, var(--mc-gold) 8%, var(--mc-surface))";
    const enemyStyle = getComputedStyle(root.querySelector('[data-combatant-id="c-enemy"]'));
    const neutralStyle = getComputedStyle(root.querySelector('[data-combatant-id="c-neutral"]'));
    const probeStyle = getComputedStyle(colorProbe);
    check(`subtle enemy border ${theme} protected=${protectedStyle}`, enemyStyle.borderTopWidth === "1px"
      && enemyStyle.borderTopColor === probeStyle.borderTopColor && neutralStyle.borderTopColor === probeStyle.borderTopColor
      && enemyStyle.borderTopColor !== getComputedStyle(root.querySelector('[data-combatant-id="c-pc"]')).borderTopColor);
    check(`current enemy keeps gold turn indicator ${theme} protected=${protectedStyle}`, enemyStyle.boxShadow.includes("inset")
      && enemyStyle.backgroundColor === probeStyle.backgroundColor);
    const style = getComputedStyle(root.querySelector(".mc-target-row"));
    const luminance = color => {
      const rgb = color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255)
        .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const a = luminance(style.color), b = luminance(style.backgroundColor);
    check(`readable target contrast ${theme} protected=${protectedStyle}`, (Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5);
  }
  colorProbe.remove();
  f.game.combat.combatant.isDefeated = true; f.hooks.emit("updateCombatant", f.game.combat.combatant, {}); await tick();
  const defeatedEnemy = root.querySelector('[data-combatant-id="c-enemy"]');
  check("defeated enemy keeps native faded treatment and border", defeatedEnemy.classList.contains("is-enemy")
    && parseFloat(getComputedStyle(defeatedEnemy).opacity) === .55 && getComputedStyle(defeatedEnemy).filter.includes("grayscale"));
  root.removeAttribute("data-mc-style-authority"); root.dataset.theme = "dark";
  for (const combatant of f.game.combat.turns) combatant.sceneId = "elsewhere";
  f.hooks.emit("updateCombatant", {}); await tick();
  check("unlinked encounter hides outside its combatant scenes", !root.querySelector(".mc-targets"));
  for (const combatant of f.game.combat.turns) combatant.sceneId = f.scene.id;
  f.hooks.emit("updateCombatant", {}); await tick();
  f.gateway.setExpanded(false);
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) { document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack }); }
finally { scope.dispose(); }
