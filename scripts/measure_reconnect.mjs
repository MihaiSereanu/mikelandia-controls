import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { resolve, posix } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { recoveryFixture } from "../tests/helpers/reconnect.mjs";
import { createFoundryAuthoritativeSessionGateway } from "../src/foundry/session/authoritative-session-gateway.mjs";

// Compare the approved checkout change to HEAD, under identical fixture conditions.
// Synthetic durations establish neither network latency nor physical-device speed.
const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = name => execFileSync("git", ["show", `HEAD:${name}`], { cwd: root, encoding: "utf8", windowsHide: true });
const gatewayPath = "src/foundry/session/authoritative-session-gateway.mjs";
const source = baseline(gatewayPath).replace(/from "(\.\.?\/[^\"]+)"/g,
  (_match, specifier) => `from "${new URL(specifier, pathToFileURL(resolve(root, gatewayPath))).href}"`);
const { createFoundryAuthoritativeSessionGateway: before } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const world = {};
for (const [label, factory] of [["before", before], ["after", createFoundryAuthoritativeSessionGateway]]) {
  const trials = [];
  for (let i = 0; i < 12; i++) {
    const f = recoveryFixture({ count: 250, gatewayFactory: factory });
    const result = await f.gateway.resync();
    if (i >= 3) trials.push({ ...result.timings, chatRenders: f.stats.chat, prepared: f.stats.prepared });
  }
  world[label] = { collectionsMs: median(trials.map(t => t.collections)), reconciliationMs: median(trials.map(t => t["foundry-session"])),
    totalMs: median(trials.map(t => t.total)), chatRendersPerRun: trials[0].chatRenders, preparedPerRun: trials[0].prepared };
}
const baselineKernel = resolve(root, "dist/reconnect-baseline-kernel.mjs");
await mkdir(resolve(root, "dist"), { recursive: true });
await writeFile(baselineKernel, baseline("src/kernel/app-kernel.mjs").replace(/from "(\.\.?\/[^\"]+)"/g,
  (_match, specifier) => `from "${posix.resolve("/src/kernel", specifier)}"`));
try {
  execFileSync(process.execPath, ["scripts/check_browser.mjs", "--filter", "^reconnect-timing-"],
    { cwd: root, env: { ...process.env, MC_RECONNECT_TIMING: "1" }, stdio: "inherit", windowsHide: true });
  const browser = {};
  for (const label of ["before", "after"]) browser[label] = JSON.parse(await readFile(resolve(root, `dist/reconnect-timing-${label}-timings.json`), "utf8"));
  const report = { scope: "Synthetic unchanged-world fixtures. Browser runs use the same 25ms simulated data fetch and current frame; HEAD versus checkout kernel isolates interface waits. Not phone or hosted-world timing.", world, browser };
  await writeFile(resolve(root, "dist/reconnect-timing-comparison.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await unlink(baselineKernel); }
