import { createHooks } from "/tests/helpers/foundry.mjs";
import { createTaskScope } from "/src/kernel/task-scope.mjs";
import { enableMobileApplications } from "/src/foundry/mobile-presentation.mjs";
import { ownMobileApplication, runMobileApplicationWorkflow } from "/src/foundry/mobile-ui-isolation.mjs";

const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => setTimeout(resolve, 40));
const scope = createTaskScope("strict-ui-fixture");
const displayed = element => {
  for (let node = element; node; node = node.parentElement) if (getComputedStyle(node).display === "none") return false;
  return getComputedStyle(element).visibility === "visible";
};
const application = ({ id = "native-child", parent, modal = false, framed = true } = {}) => {
  const element = document.createElement("section"); element.id = id; element.className = `application${modal ? " dialog" : ""}`;
  element.innerHTML = `${framed ? '<header class="window-header">Native window</header>' : ''}<div class="window-content"><button>Native action</button></div>`;
  const app = { parent, element, options: { modal }, close() { element.remove(); Hooks.emit("closeApplicationV2", app); } };
  return app;
};
const render = (app, host = document.body) => { host.append(app.element); Hooks.emit("renderApplicationV2", app, app.element); return app; };
try {
  const params = new URLSearchParams(location.search), root = document.querySelector("main");
  root.dataset.formFactor = params.get("layout") ?? "phone";
  if (params.has("common-display")) {
    document.body.classList.add("hide-ui");
    const style = document.createElement("style");
    style.textContent = '@layer modules { body.hide-ui > *:not(#interface):not(#ui-left):not(#dice-box-canvas):not(#notifications):not(.image-popout) {display:none!important} body.hide-ui #ui-left > *:not(#smalltime-app) {display:none!important} body.hide-ui .window-header {display:none!important} }';
    document.head.append(style);
  }
  globalThis.Hooks = createHooks();
  globalThis.game = { user: { isGM: false }, system: { id: "fixture" } };
  const apps = enableMobileApplications(scope, { getExistingApplications: () => [], isNativeDialog: app => app?.isNativeRoll === true });
  await tick();
  const desktopHost = document.querySelector("#interface"), originalQuery = desktopHost.querySelector;
  let desktopScans = 0;
  desktopHost.querySelector = function (...args) { desktopScans++; return originalQuery.apply(this, args); };
  for (let index = 0; index < 100; index++) {
    root.style.setProperty("--fixture-animation-progress", String(index));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  desktopHost.querySelector = originalQuery;
  check("100 approved animation mutations do not rescan desktop branches", desktopScans === 0);
  root.classList.remove("ve-mobile-app"); await tick();
  check("removing root ownership suppresses the formerly approved branch", !displayed(root));
  root.classList.add("ve-mobile-app"); await tick();
  check("restoring root ownership reveals the previously blocked branch", displayed(root));
  for (const protect of [true, false]) {
    root.toggleAttribute("data-ve-style-authority", protect); await tick();
    check(`calendar hidden with style protection ${protect}`, !displayed(document.querySelector("#smalltime-app button")));
    check(`world macro hidden with style protection ${protect}`, !displayed(document.querySelector("#custom-macro button")));
    check(`tab content remains visible with style protection ${protect}`, displayed(document.querySelector("#approved-button")));
  }
  const late = render(application({ id: "calendaria-hud", framed: false }));
  late.element.classList.add("fixture-widget"); await tick();
  check("late frameless application never receives admission", !late.element.classList.contains("ve-mobile-admitted-app") && !displayed(late.element));
  const automatic = render(application({ id: "automatic-window" })); await tick();
  check("unrelated framed application is hidden", !displayed(automatic.element));
  const automaticModal = render(application({ id: "automatic-modal", modal: true })); await tick();
  check("unrelated modal is not granted blanket admission", !displayed(automaticModal.element) && apps.admissions.size === 0);
  automaticModal.element.style.setProperty("display", "flex", "important");
  automaticModal.element.style.setProperty("visibility", "visible", "important");
  await tick();
  check("inline visibility cannot expose a blocked branch", !displayed(automaticModal.element));
  const navigation = document.querySelector("[data-route]");
  apps.lineage.begin({ type: "click", isTrusted: true, target: navigation, button: 0 });
  check("tab navigation creates no window-admission opportunity", !apps.lineage.state().active);
  const editor = ownMobileApplication(application({ id: "explicit-native-editor" }));
  await new Promise(resolve => setTimeout(resolve, 1100));
  render(editor); await tick();
  check("explicit asynchronous editor remains visible", displayed(editor.element) && apps.admissions.has(editor));
  check("approved native window headers survive Hide UI", displayed(editor.element.querySelector(".window-header")));
  const replaced = document.createElement("section"); replaced.className = "application"; replaced.innerHTML = editor.element.innerHTML;
  editor.element.replaceWith(replaced); editor.element = replaced; Hooks.emit("renderApplicationV2", editor, replaced); await tick();
  check("approved V2 rerenders retain exact application ownership", displayed(replaced) && apps.admissions.has(editor));
  const child = render(application({ id: "native-child-dialog", parent: editor, modal: true })); await tick();
  check("native child prompts remain visible", displayed(child.element) && apps.admissions.has(child));
  const other = render(application({ id: "unrelated-during-editor", modal: true })); await tick();
  check("an open editor does not admit unrelated module dialogs", !displayed(other.element));
  child.close(); editor.close(); await tick();
  check("closing native windows releases the modal backdrop", !document.body.classList.contains("ve-mobile-dialog-open"));
  const nested = ownMobileApplication(application({ id: "nested-native-editor" }));
  render(nested, document.querySelector("#ui-left")); await tick();
  check("approved windows inside desktop hosts remain visible", displayed(nested.element));
  check("allowing a host does not reveal sibling widgets", !displayed(document.querySelector("#smalltime-app button")));
  nested.close(); await tick();
  const roll = application({ id: "system-roll", modal: true }); roll.isNativeRoll = true; render(roll); await tick();
  check("recognized roll dialog stays available", displayed(roll.element));
  const menu = document.createElement("nav"); menu.id = "context-menu"; menu.textContent = "Native menu"; document.body.append(menu); await tick();
  check("context controls remain available for admitted native windows", displayed(menu));
  const dice = document.createElement("div"); dice.id = "dice-box-canvas"; dice.style.cssText = "position:fixed;inset:0;width:100px;height:100px"; dice.append(document.createElement("canvas")); document.body.append(dice); await tick();
  check("late Dice So Nice canvas stays visible", displayed(dice));
  check("Dice So Nice remains non-interactive", getComputedStyle(dice).pointerEvents === "none");
  check("temporary notifications remain visible", displayed(document.querySelector("#notifications")));
  check("temporary tooltip remains visible", displayed(document.querySelector("#tooltip")));
  const laterButton = document.createElement("button"); laterButton.textContent = "Injected widget"; document.querySelector("#ui-left").append(laterButton); await tick();
  check("new widgets in existing shell containers stay hidden", !displayed(laterButton));
  class CoreDialog { constructor() { Object.assign(this, application({ id: "core-confirmation", modal: true })); } }
  globalThis.foundry = { applications: { api: { DialogV2: CoreDialog } } };
  await runMobileApplicationWorkflow(async () => { await tick(); const confirm = render(new CoreDialog()); await tick(); check("delayed core confirmation follows explicit module workflow", displayed(confirm.element)); confirm.close(); });
  roll.close(); await tick(); scope.dispose(); document.body.classList.remove("ve-mobile-running", "hide-ui");
  check("desktop restoration removes every isolation marker", !document.querySelector("[data-ve-mobile-ui-state]"));
  check("temporary host display changes restore the original inline value", document.querySelector("#ui-left").style.getPropertyValue("display") === "");
  check("latest widget inline display preference survives suppression", automaticModal.element.style.getPropertyValue("display") === "flex");
  check("desktop restoration restores the calendar", displayed(document.querySelector("#smalltime-app button")));
  const desktopWidget = render(application({ id: "desktop-widget" })); await tick();
  check("no isolation remains after mobile teardown", !desktopWidget.element.hasAttribute("data-ve-mobile-ui-state"));
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", width: innerWidth, height: innerHeight, checks });
} catch (error) {
  scope.dispose(); document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
