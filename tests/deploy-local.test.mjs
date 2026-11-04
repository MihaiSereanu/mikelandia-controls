import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/deploy-local.ps1", import.meta.url));
const windowsOnly = { skip: process.platform !== "win32" };

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "mc-deploy-test-"));
  t.after(() => {
    assert.equal(dirname(realpathSync(root)), realpathSync(tmpdir()));
    assert.ok(basename(root).startsWith("mc-deploy-test-"));
    rmSync(root, { recursive: true, force: true });
  });
  const source = join(root, "checkout");
  const destination = join(root, "installed", "mikelandia-controls");
  const target = join(root, "link-target");
  mkdirSync(join(source, "scripts"), { recursive: true });
  mkdirSync(join(source, "src", "dist"), { recursive: true });
  mkdirSync(target);
  copyFileSync(script, join(source, "scripts", "deploy-local.ps1"));
  writeFileSync(join(source, "module.json"), JSON.stringify({ id: "mikelandia-controls" }));
  writeFileSync(join(source, "deploy.local.json"), JSON.stringify({ destination }));
  writeFileSync(join(source, "src", "entry.mjs"), "export const ready = true;\n");
  writeFileSync(join(source, "src", "dist", "runtime.txt"), "keep nested runtime directory\n");
  writeFileSync(join(target, "sentinel.txt"), "link target stays intact\n");
  const deploy = (...args) => spawnSync("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    join(source, "scripts", "deploy-local.ps1"), ...args
  ], { encoding: "utf8", windowsHide: true });
  return { root, source, destination, target, deploy };
}

test("local deploy excludes root dist with junctions and retains nested runtime dist", windowsOnly, t => {
  const f = fixture(t);
  mkdirSync(join(f.source, "dist"));
  symlinkSync(f.target, join(f.source, "dist", "test-world"), "junction");
  const result = f.deploy();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(f.destination, "dist")), false);
  assert.equal(readFileSync(join(f.destination, "src", "entry.mjs"), "utf8"), "export const ready = true;\n");
  assert.equal(readFileSync(join(f.destination, "src", "dist", "runtime.txt"), "utf8"), "keep nested runtime directory\n");
  assert.equal(readFileSync(join(f.target, "sentinel.txt"), "utf8"), "link target stays intact\n");
});

test("local deploy rejects runtime junctions before replacing the installed destination", windowsOnly, t => {
  const f = fixture(t);
  mkdirSync(f.destination, { recursive: true });
  writeFileSync(join(f.destination, "sentinel.txt"), "previous installation\n");
  symlinkSync(f.target, join(f.source, "src", "linked"), "junction");
  const result = f.deploy();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source contains a link or junction/u);
  assert.deepEqual(readdirSync(f.destination), ["sentinel.txt"]);
  assert.equal(readFileSync(join(f.destination, "sentinel.txt"), "utf8"), "previous installation\n");
  assert.deepEqual(readdirSync(dirname(f.destination)), ["mikelandia-controls"]);
  assert.equal(readFileSync(join(f.target, "sentinel.txt"), "utf8"), "link target stays intact\n");
});

test("local deploy WhatIf leaves the destination and staging parent absent", windowsOnly, t => {
  const f = fixture(t);
  const result = f.deploy("-WhatIf");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(dirname(f.destination)), false);
});
