import { targetingFixture } from "../helpers/targeting.mjs";
import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";
import { renderCombat } from "/src/features/combat/presenter.mjs";

const checks = [];
const check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const f = targetingFixture(); globalThis.game = f.game; globalThis.Hooks = f.hooks;
const scope = createTaskScope(), root = document.createElement("main");
root.className = "mc-mobile-app"; document.body.append(root);
let view;
const commands = {
  readLocale: () => "en", localize: (_key, fallback) => fallback,
  toggleCombatTarget: request => f.gateway.toggle(request),
  selectCombatTargetSource: request => f.gateway.selectSource(request), setCombatTargetsExpanded: value => f.gateway.setExpanded(value)
};
const render = targeting => {
  if (root.firstElementChild?.__mcUpdateCombatTargets(targeting)) return;
  view?.dispose(); view = scope.child("view");
  root.replaceChildren(renderCombat({ state: { targeting, snapshot: { combat: {
    id: "combat", started: true, round: 1, combatants: [{ id: "pc", name: "Hero", initiative: 15 }]
  } } }, commands, scope: view }));
};
try {
  f.gateway.watch(scope, () => f.actor.uuid, render);
  f.game.combat.scene = null; f.hooks.emit("updateCombat", f.game.combat, { scene: null }); await tick();
  check("native unlinked encounter keeps selector in combatant scene", !!root.querySelector(".mc-targets"));
  check("target section starts collapsed", root.querySelector(".mc-targets-heading").getAttribute("aria-expanded") === "false" && !root.querySelector(".mc-target-row"));
  root.querySelector(".mc-targets-heading").click(); await tick();
  check("friendly and enemy groups", root.querySelectorAll(".mc-target-group").length === 2);
  check("hidden and outside tokens excluded", root.querySelectorAll(".mc-target-row").length === 3);
  check("self label inline with name and no distance", root.querySelector('[data-target-id="pc"] strong').textContent === "pc (You)" && !root.querySelector('[data-target-id="pc"] .mc-target-distance'));
  check("clear targets button removed", !root.querySelector(".mc-target-clear"));
  check("larger header caret and padding", root.querySelector(".mc-targets-caret").getBoundingClientRect().width >= 24 && parseFloat(getComputedStyle(root.querySelector(".mc-targets-heading")).paddingLeft) >= 18);
  check("distance uses numeric scene units", root.querySelector('[data-target-id="enemy"]').textContent.includes("15 ft"));
  root.querySelector('[data-target-id="enemy"]').click(); await tick();
  root.querySelector('[data-target-id="neutral"]').click(); await tick();
  check("multiple native targets", f.game.user.targets.size === 2);
  check("pressed selection accessible", root.querySelector('[data-target-id="enemy"]').getAttribute("aria-pressed") === "true");
  root.querySelector(".mc-targets-heading").click(); await tick();
  check("collapsed section has selected summary", !root.querySelector(".mc-target-row") && /enemy.*neutral/.test(root.querySelector(".mc-targets-heading").textContent));
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
  check("initiative remains present", root.querySelector(".mc-combat-name").textContent === "Hero");
  check("touch targets at least 44px", [...root.querySelectorAll(".mc-target-row")].every(button => button.getBoundingClientRect().height >= 44));
  check("no horizontal overflow", document.documentElement.scrollWidth <= innerWidth + 1);
  f.game.combat.started = false; f.hooks.emit("updateCombat", {}); await tick();
  check("selector hidden after combat ends", !root.querySelector(".mc-targets"));
  f.pc.actorId = f.actor.id; f.game.combat.started = true; f.gateway.refresh();
  f.gateway.toggle(f.request("enemy"));
  for (const protectedStyle of [false, true]) for (const theme of ["light", "dark"]) {
    root.toggleAttribute("data-mc-style-authority", protectedStyle); root.dataset.theme = theme;
    const style = getComputedStyle(root.querySelector(".mc-target-row"));
    const luminance = color => {
      const rgb = color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255)
        .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const a = luminance(style.color), b = luminance(style.backgroundColor);
    check(`readable target contrast ${theme} protected=${protectedStyle}`, (Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5);
  }
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
