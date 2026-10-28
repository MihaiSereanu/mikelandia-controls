import { mountLogin } from "/mobile-login/login.mjs";
import { createFoundryClient, foundryRoutes } from "/mobile-login/foundry-client.mjs";
import { mountInstall, installPlatform } from "/mobile-login/pwa.mjs";

const checks = [], check = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const frame = document.querySelector("iframe");
try {
  const html = await (await fetch("/mobile-login/index.html")).text();
  const loaded = new Promise(resolve => frame.addEventListener("load", resolve, { once: true }));
  frame.srcdoc = html.replace('<head>', '<head><base href="/mobile-login/">').replace(/<script type="module" src="\.\/main.mjs"><\/script>/, "");
  await loaded;
  const doc = frame.contentDocument;
  if (new URLSearchParams(location.search).has("large")) doc.documentElement.style.fontSize = "150%";
  const el = id => doc.getElementById(id);
  check("install help starts collapsed and replaces normal footer link", !el("app-install").open && !doc.querySelector("footer #standard-login") && el("standard-login").hidden);
  const platform = installPlatform(frame.contentWindow.navigator);
  check("only detected platform instructions are shown", [...doc.querySelectorAll("[data-install-platform]")].every(node => node.hidden === (node.dataset.installPlatform !== platform)));
  el("app-install").querySelector("summary").click(); await tick();
  check("install help expands on click without horizontal overflow", el("app-install").open && doc.documentElement.scrollWidth <= innerWidth);
  el("app-install").querySelector("summary").click();
  const manifestUrl = new URL(doc.querySelector('link[rel="manifest"]').href);
  const manifest = await (await fetch(manifestUrl)).json();
  check("installed app uses standalone display", manifest.display === "standalone");
  check("adaptive icon has its own opaque asset", manifest.icons.some(icon => icon.purpose === "maskable" && icon.src.includes("mc-maskable")));
  for (const icon of [...manifest.icons, { src: doc.querySelector('link[rel="apple-touch-icon"]').href, opaque: true }]) {
    const image = new Image(); image.src = new URL(icon.src, manifestUrl); await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    check("icon background matches platform purpose " + icon.src, icon.purpose === "any" ? pixel[3] === 0 : pixel[3] === 255 && pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0);
  }
  for (const base of ["https://example.test/mobile/", "https://example.test/foundry/mobile/"]) {
    const url = new URL("manifest.webmanifest", base);
    const scope = new URL(manifest.scope, url);
    const nativeRoutes = foundryRoutes(base);
    check("login and native game stay inside installed scope " + base,
      new URL(manifest.start_url, url).href === base && new URL(nativeRoutes.game).pathname.startsWith(scope.pathname));
  }
  const installEvent = new frame.contentWindow.Event("beforeinstallprompt", { cancelable: true });
  let prompts = 0;
  installEvent.prompt = async () => { prompts++; };
  installEvent.userChoice = Promise.resolve({ outcome: "dismissed" });
  frame.contentWindow.dispatchEvent(installEvent);
  check("browser install offer reveals install button", installEvent.defaultPrevented && !el("install-app").hidden);
  el("install-app").click(); el("install-app").click(); await tick();
  check("install prompt is consumed once and dismissal retains instructions", prompts === 1 && el("install-app").hidden && !el("app-install").hidden);
  frame.contentWindow.dispatchEvent(new frame.contentWindow.Event("appinstalled"));
  check("installed app hides install instructions", el("app-install").hidden);
  // Exercise the iOS standalone flag independently of the Chromium install event.
  mountInstall({ window: frame.contentWindow, document: doc, navigator: { userAgent: "iPhone", standalone: true } });
  check("iOS installed app hides install instructions", el("app-install").hidden);
  const routes = foundryRoutes(`${location.origin}/mobile/`);
  let data = { world: { id: "fixture", title: "Gods of the Forbidden North" },
    users: [{ _id: "one", name: "Player One" }, { _id: "two", name: "Player Two" }, { _id: "busy", name: "Connected Player" }], activeUsers: ["busy"] };
  const saved = new Map([["mikelandia.login.fixture", "one"]]);
  let submitted, navigated, failLogin = false, failData = false, closeCount = 0;
  const listeners = new Map();
  const socket = {
    connected: false,
    on: (event, handler) => listeners.set(event, handler), off: event => listeners.delete(event),
    connect() { this.connected = true; queueMicrotask(() => listeners.get("session")?.({ sessionId: "fixture-session" })); },
    disconnect() { this.connected = false; closeCount++; },
    emit(_event, handler) { handler(data); }
  };
  const native = createFoundryClient({ routes, io: () => socket, fetch: async (_url, options) => {
    if (options.method === "POST") {
      submitted = JSON.parse(options.body);
      // Check field immediately after submit, before the server responds.
      check("password cleared before server response", el("password").value === "");
      if (failLogin) return { ok: false, status: 401, text: async () => "JOIN.ErrorInvalidPassword" };
      return { ok: true, text: async () => JSON.stringify({ status: "success", redirect: routes.game }) };
    }
    return { ok: true };
  } });
  const client = { getJoinData: () => { if (failData) throw new Error("Offline fixture"); return native.getJoinData(); }, join: (...args) => native.join(...args), close: () => native.close() };
  const app = mountLogin({ document: doc, routes, client, storage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) }, navigate: url => { navigated = url; }, refreshMs: 60000 });
  await app.ready; await tick();
  check("native current world is displayed", el("world-title").textContent === data.world.title);
  check("last player restored for this world", el("player").value === "one");
  check("connected player cannot be selected", [...el("player").options].find(option => option.value === "busy").disabled);
  check("error fallback uses same origin and stays hidden during normal login", el("standard-login").href === routes.join && el("standard-login").hidden);
  check("login controls have touch targets", ["player", "password", "join"].every(id => el(id).getBoundingClientRect().height >= 44));
  check("no horizontal page overflow", doc.documentElement.scrollWidth <= innerWidth);
  check("accessible labels target both fields", ["player", "password"].every(id => doc.querySelector(`label[for="${id}"]`)));
  el("player").value = "two"; el("player").dispatchEvent(new Event("change"));
  check("only selected player ID remembered", saved.get("mikelandia.login.fixture") === "two");
  failLogin = true; el("password").value = "fixture-secret";
  el("login-form").dispatchEvent(new Event("submit", { cancelable: true }));
  el("login-form").dispatchEvent(new Event("submit", { cancelable: true }));
  await tick();
  check("native authentication receives expected fields", submitted.userId === "two" && submitted.password === "fixture-secret" && submitted.action === "join");
  check("wrong password shows a readable error", el("error").textContent.includes("password was not accepted") && !el("error").hidden);
  check("login errors expose the native fallback", !el("standard-login").hidden);
  check("rejected password permits retry", !el("join").disabled && !el("password").disabled && !navigated);
  check("password never written to storage", [...saved.values()].every(value => value !== "fixture-secret"));
  data = {};
  await app.refresh();
  check("no world disables the login form", el("login-form").hidden && el("world-title").textContent === "No world running");
  failData = true; await app.refresh();
  check("unavailable Foundry offers retry and fallback", !el("retry").hidden && !el("error").hidden && el("login-form").hidden);
  failData = false;
  data = { world: { id: "second-world", title: "A Different World" }, users: [{ _id: "new", name: "New Player" }], activeUsers: [] };
  await app.refresh();
  check("changing worlds clears prior selection", el("player").value === "" && el("password").value === "");
  check("retry recovers the form", !el("login-form").hidden && el("retry").hidden);
  el("player").value = "new"; el("player").dispatchEvent(new Event("change"));
  failLogin = false;
  el("login-form").dispatchEvent(new Event("submit", { cancelable: true })); await tick();
  check("successful native join navigates to game", navigated === routes.game);
  check("success closes the prelogin socket", closeCount === 1);
  app.dispose();
  // Leave the actual page mounted with fixture data for a review screenshot.
  const preview = mountLogin({ document: doc, routes, client: { getJoinData: async () => ({ world: { id: "preview", title: "Gods of the Forbidden North" }, users: [{ _id: "preview", name: "Choose your player" }], activeUsers: [] }), close() {} }, storage: null, navigate() {}, refreshMs: 60000 });
  await preview.ready;
  el("player").disabled = el("password").disabled = false;
  el("join").textContent = "Join game →";
  await doc.fonts.ready; await tick();
  document.getElementById("results").textContent = JSON.stringify({ status: "passed", checks, width: innerWidth, height: innerHeight });
} catch (error) {
  document.getElementById("results").textContent = JSON.stringify({ status: "failed", error: error.stack, checks, width: innerWidth, height: innerHeight });
}
