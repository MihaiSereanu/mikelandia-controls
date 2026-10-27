import { createServer } from "node:http";
import { readFile, writeFile, mkdir, mkdtemp, rm, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve, relative, isAbsolute, join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cases = [
  ["mobile-login-narrow", 320, 844, "mobile-login", ""],
  ["mobile-login-android", 393, 851, "mobile-login", ""],
  ["mobile-login-keyboard", 393, 430, "mobile-login", ""],
  ["mobile-login-tablet", 1024, 768, "mobile-login", ""],
  ["mobile-login-large-text", 390, 844, "mobile-login", "large=true"],
  ["ui-isolation-phone", 390, 844, "ui-isolation", "layout=phone"],
  ["ui-isolation-tablet", 1024, 768, "ui-isolation", "layout=tablet"],
  ["ui-isolation-common-display-phone", 390, 844, "ui-isolation", "layout=phone&common-display=true"],
  ["ui-isolation-common-display-tablet", 1024, 768, "ui-isolation", "layout=tablet&common-display=true"],
  ["in-person-phone", 390, 844, "in-person", "layout=phone"],
  ["in-person-tablet", 1024, 768, "in-person", "layout=tablet"],
  ["in-person-dnd-phone", 390, 844, "in-person", "layout=phone&system=dnd5e"],
  ["in-person-dnd-tablet", 1024, 768, "in-person", "layout=tablet&system=dnd5e"],
  ["fallback-phone-v1", 390, 844, "fallback", "layout=phone&application=v1"],
  ["fallback-phone-v2", 390, 844, "fallback", "layout=phone&application=v2"],
  ["fallback-android-v1", 393, 851, "fallback", "layout=phone&application=v1&host=clipped"],
  ["fallback-android-v2", 393, 851, "fallback", "layout=phone&application=v2&host=clipped"],
  ["fallback-common-display-v1", 393, 851, "fallback", "layout=phone&application=v1&common-display=true"],
  ["fallback-common-display-v2", 393, 851, "fallback", "layout=phone&application=v2&common-display=true"],
  ["fallback-tablet-v1", 1024, 768, "fallback", "layout=tablet&application=v1"],
  ["fallback-tablet-v2", 1024, 768, "fallback", "layout=tablet&application=v2"],
  ["warhammer-4e-phone", 390, 844, "warhammer", "layout=phone&edition=4e"],
  ["warhammer-5e-phone", 390, 844, "warhammer", "layout=phone&edition=5e"],
  ["warhammer-4e-tablet", 1024, 768, "warhammer", "layout=tablet&edition=4e"],
  ["warhammer-5e-tablet", 1024, 768, "warhammer", "layout=tablet&edition=5e"],
  ["shadowdark-narrow", 320, 844, "shadowdark", "layout=phone&pulp=false"],
  ["shadowdark-small-tablet", 768, 1024, "shadowdark", "layout=tablet&pulp=false"],
  ["shadowdark-large-text", 390, 844, "shadowdark", "layout=phone&pulp=false&large=true"],
  ["shadowdark-phone", 390, 844, "shadowdark", "layout=phone&pulp=false"],
  ["shadowdark-pulp-phone", 390, 844, "shadowdark", "layout=phone&pulp=true"],
  ["shadowdark-tablet", 1024, 768, "shadowdark", "layout=tablet&pulp=false"],
  ["shadowdark-pulp-tablet", 1024, 768, "shadowdark", "layout=tablet&pulp=true"],
  ["presentation-phone", 390, 844, "presentation", "layout=phone"],
  ["presentation-tablet", 1024, 768, "presentation", "layout=tablet"],
  ["profile-layout-narrow", 320, 844, "profile-layout", "layout=phone"],
  ["profile-layout-phone", 390, 844, "profile-layout", "layout=phone"],
  ["profile-layout-small-tablet", 768, 1024, "profile-layout", "layout=tablet"],
  ["profile-layout-tablet", 1024, 768, "profile-layout", "layout=tablet"],
  ["profile-layout-large-text", 390, 844, "profile-layout", "layout=phone&large=true"]
];

const args = process.argv.slice(2);
let filter;
let list = false;
let screenshots = false;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--filter") {
    const pattern = args[++index];
    if (!pattern || pattern.startsWith("--")) throw new Error("--filter requires a case-name regular expression.");
    filter = new RegExp(pattern, "i");
  } else if (arg === "--list") list = true;
  else if (arg === "--screenshots") screenshots = true;
  else if (arg === "--help") {
    console.log("Usage: node scripts/check_browser.mjs [--filter <regex>] [--list] [--screenshots]\nDefault: all cases; screenshots saved on failure. --screenshots also saves passing cases.");
    process.exit(0);
  } else throw new Error(`Unknown argument: ${arg}`);
}
const selectedCases = cases.filter(([name]) => !filter || filter.test(name));
if (!selectedCases.length) throw new Error("No browser cases match --filter. Use --list to see available cases.");
if (list) {
  console.log(selectedCases.map(([name]) => name).join("\n"));
  process.exit(0);
}
const startedAt = performance.now();
let checksPassed = 0;
const candidates = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
let browser;
for (const path of candidates) { try { await access(path); browser = path; break; } catch {} }
if (!browser) throw new Error("Set CHROME_PATH to a Chromium browser executable to run these checks.");
const contentTypes = { ".html": "text/html", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png" };
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, `.${decodeURIComponent(new URL(request.url, "http://localhost").pathname)}`);
    const rel = relative(root, path);
    if (rel.startsWith("..") || isAbsolute(rel)) { response.writeHead(403).end(); return; }
    const content = await readFile(path);
    response.writeHead(200, { "Content-Type": contentTypes[extname(path)] ?? "application/octet-stream" });
    response.end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
await mkdir(join(root, "dist"), { recursive: true });
const temporaryRoot = resolve(tmpdir());
const profile = await mkdtemp(join(temporaryRoot, "ve-mobile-browser-"));
const child = spawn(browser, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-pipe", `--user-data-dir=${profile}`], { windowsHide: true, stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
const requests = new Map();
let sequence = 0;
let buffer = Buffer.alloc(0);
let stderr = "";
child.stderr.on("data", data => { stderr = (stderr + data.toString()).slice(-4000); });
const failPending = error => {
  for (const request of requests.values()) { clearTimeout(request.timer); request.reject(error); }
  requests.clear();
};
child.on("error", failPending);
child.on("exit", () => failPending(new Error(`Browser exited: ${stderr}`)));
child.stdio[4].on("data", data => {
  buffer = Buffer.concat([buffer, data]);
  let end;
  while ((end = buffer.indexOf(0)) >= 0) {
    const message = JSON.parse(buffer.subarray(0, end).toString());
    buffer = buffer.subarray(end + 1);
    const request = requests.get(message.id);
    if (!request) continue;
    requests.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { requests.delete(id); reject(new Error(`Browser timeout: ${method}`)); }, 45000);
  requests.set(id, { resolve, reject, timer });
  child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
});
try {
  const browserVersion = await send("Browser.getVersion");
  const chromiumVersion = browserVersion.product.split("/").at(-1);
  for (const [name, width, height, fixture, query] of selectedCases) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 720 }, sessionId);
    if (name.includes("android")) {
      await send("Emulation.setUserAgentOverride", { userAgent: `Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromiumVersion} Mobile Safari/537.36`, platform: "Linux armv8l" }, sessionId);
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
    }
    await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/tests/browser/${fixture}.html?${query}` }, sessionId);
    let report;
    for (let attempt = 0; attempt < 100; attempt++) {
      const { result } = await send("Runtime.evaluate", { expression: 'document.querySelector("#results")?.textContent', returnByValue: true }, sessionId);
      try { report = JSON.parse(result.value); } catch {}
      if (report?.status) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (report?.status !== "passed" || report.width !== width || report.height !== height) {
      const screenshot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(root, "dist", `${name}-failed.png`), Buffer.from(screenshot.data, "base64"));
      throw new Error(`${name}: ${JSON.stringify(report ?? "browser did not produce a test report")}`);
    }
    if (screenshots) {
      await send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))", awaitPromise: true }, sessionId);
      const screenshot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(root, "dist", `${name}.png`), Buffer.from(screenshot.data, "base64"));
    }
    checksPassed += report.checks.length;
    console.log(`${name}: ${report.checks.length} browser fixture checks passed at ${report.width}x${report.height}.`);
    await send("Target.closeTarget", { targetId });
  }
  console.log(`${selectedCases.length} scenario(s), ${checksPassed} checks passed in ${((performance.now() - startedAt) / 1000).toFixed(1)}s.`);
} finally {
  try { await send("Browser.close"); } catch { child.kill(); }
  if (child.exitCode === null) await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill(); resolve(); }, 3000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
  await new Promise(resolve => server.close(resolve));
  // Delete only the temporary browser profile created by this invocation.
  const rel = relative(temporaryRoot, resolve(profile));
  if (rel.startsWith("..") || isAbsolute(rel) || !basename(profile).startsWith("ve-mobile-browser-")) throw new Error("Unexpected temporary profile path");
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
