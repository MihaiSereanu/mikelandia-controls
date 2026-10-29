import { createWfrpThemePolicy } from "/src/foundry/compatibility/wfrp-theme-policy.mjs";
import { createTaskScope } from "/src/kernel/lifecycle/task-scope.mjs";

const checks = [], check = (name, passed) => { if (!passed) throw new Error(name); checks.push(name); };
const sections = ["actor", "item", "journal", "sidebar", "apps"];
const hooks = new Map();
globalThis.Hooks = {
  on(name, callback) { hooks.set(name, callback); return callback; },
  off(name) { hooks.delete(name); }
};
const scope = createTaskScope("wfrp-theme-browser");
try {
  let mobile = true, writes = 0;
  const storageKey = "fixture:wfrp4e.theme";
  const original = Object.fromEntries(sections.map(section => [section, { enabled: true, font: "readable" }]));
  localStorage.setItem(storageKey, JSON.stringify(original));
  const game = { system: { id: "wfrp4e" }, settings: {
    settings: new Map([["wfrp4e.theme", { scope: "client" }]]),
    get: () => JSON.parse(localStorage.getItem(storageKey)),
    async set(_namespace, _key, value) {
      writes++;
      localStorage.setItem(storageKey, JSON.stringify(value));
      hooks.get("clientSettingChanged")?.("wfrp4e.theme", value);
    }
  } };
  const policy = createWfrpThemePolicy({ getGame: () => game, readMobile: () => mobile,
    getSidebar: () => document.querySelector("#sidebar"),
    getApplications: () => [{ element: document.querySelector(".journal-sheet") }]
  });
  policy.start(scope);
  await policy.reconcile();
  check("mobile saves each theme section off in browser storage", sections.every(section => !game.settings.get()[section].enabled));
  check("font choices survive", sections.every(section => game.settings.get()[section].font === "readable"));
  check("initial setting write happens once", writes === 1);
  const surfaces = [document.body, ...document.querySelectorAll("#sidebar, #chat-notifications, .journal-sheet")];
  check("existing native surfaces have no-theme and no classic-font", surfaces.every(node => node.classList.contains("no-theme") && !node.classList.contains("classic-font")));
  document.body.classList.remove("no-theme"); document.body.classList.add("classic-font");
  hooks.get("renderApplicationV2")();
  await policy.reconcile();
  check("theme configuration previews are removed", document.body.classList.contains("no-theme") && !document.body.classList.contains("classic-font"));
  await game.settings.set("wfrp4e", "theme", original);
  await policy.reconcile();
  check("saved re-enabling is corrected on mobile", sections.every(section => !game.settings.get()[section].enabled));
  mobile = false;
  await policy.reconcile();
  check("desktop retains the saved off preference", sections.every(section => !game.settings.get()[section].enabled));
  await game.settings.set("wfrp4e", "theme", original);
  await policy.reconcile();
  check("desktop can change its preference afterwards", sections.every(section => game.settings.get()[section].enabled));
  scope.dispose();
  check("page hooks are cleaned up", hooks.size === 0);
  localStorage.removeItem(storageKey);
  document.querySelector("#results").textContent = JSON.stringify({ status: "passed", checks, width: innerWidth, height: innerHeight });
} catch (error) {
  scope.dispose();
  document.querySelector("#results").textContent = JSON.stringify({ status: "failed", checks, error: error.stack });
}
