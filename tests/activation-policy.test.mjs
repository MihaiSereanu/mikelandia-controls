import test from "node:test";
import assert from "node:assert/strict";
import { classifyRuntimeMode, createActivationPolicyResolver } from "../src/foundry/session/activation-policy.mjs";

const browser = { innerWidth: 390, innerHeight: 844, screen: { width: 390, height: 844 }, matchMedia: () => ({ matches: true }) };
for (const [name, navigator, mode] of [
  ["Windows touchscreen laptop", { platform: "Win32", userAgent: "Windows NT 10.0", maxTouchPoints: 10 }, "desktop"],
  ["Linux laptop", { platform: "Linux x86_64", maxTouchPoints: 10 }, "desktop"],
  ["Mac laptop with client hints", { platform: "MacIntel", userAgent: "Macintosh", maxTouchPoints: 5, userAgentData: { platform: "macOS", mobile: false } }, "desktop"],
  ["unknown touchscreen in small window", { maxTouchPoints: 10 }, "desktop"],
  ["Android Chrome phone", { platform: "Linux armv8l", userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36", maxTouchPoints: 5 }, "phone"],
  ["Android tablet", { userAgentData: { platform: "Android", mobile: false }, maxTouchPoints: 5 }, "tablet"],
  ["iPhone", { userAgent: "iPhone", maxTouchPoints: 5 }, "phone"],
  ["iPad desktop website", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 }, "tablet"]
]) test(`Auto device detection: ${name}`, () => assert.equal(classifyRuntimeMode({ window: browser, navigator }), mode));

test("desktop Auto stays inactive while explicit phone mode remains available", () => {
  const resolver = createActivationPolicyResolver({ getWindow: () => browser, getNavigator: () => ({ platform: "Win32", maxTouchPoints: 10 }) });
  assert.equal(resolver.resolve({ mode: "auto" }).active, false);
  assert.equal(resolver.resolve({ mode: "phone" }).active, true);
});
