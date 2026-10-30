import test from "node:test";
import assert from "node:assert/strict";
import { classifyRuntimeMode, createActivationPolicyResolver } from "../src/foundry/session/activation-policy.mjs";

const browser = { innerWidth: 390, innerHeight: 844, screen: { width: 390, height: 844 }, matchMedia: () => ({ matches: true }) };
for (const [name, navigator, mode] of [
  ["Windows touchscreen laptop", { platform: "Win32", userAgent: "Windows NT 10.0", maxTouchPoints: 10 }, "native"],
  ["Linux laptop", { platform: "Linux x86_64", maxTouchPoints: 10 }, "native"],
  ["Mac laptop with client hints", { platform: "MacIntel", userAgent: "Macintosh", maxTouchPoints: 5, userAgentData: { platform: "macOS", mobile: false } }, "native"],
  ["unknown touchscreen in small window", { maxTouchPoints: 10 }, "native"],
  ["Android Chrome phone", { platform: "Linux armv8l", userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36", maxTouchPoints: 5 }, "phone"],
  ["Android tablet", { userAgentData: { platform: "Android", mobile: false }, maxTouchPoints: 5 }, "tablet"],
  ["iPhone", { userAgent: "iPhone", maxTouchPoints: 5 }, "phone"],
  ["iPad desktop website", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 }, "tablet"]
]) test(`Auto device detection: ${name}`, () => assert.equal(classifyRuntimeMode({ window: browser, navigator }), mode));

test("desktop browsers stay native regardless of saved mobile preferences", () => {
  const resolver = createActivationPolicyResolver({ getWindow: () => browser, getNavigator: () => ({ platform: "Win32", maxTouchPoints: 10 }) });
  for (const mode of ["auto", "phone", "tablet", "native", "desktop", "off"]) {
    const policy = resolver.resolve({ mode });
    assert.equal(policy.active, false);
    assert.equal(policy.runtimeMode, "native");
  }
});

test("mobile devices retain layout selection and native opt-out including legacy aliases", () => {
  const resolver = createActivationPolicyResolver({ getWindow: () => browser, getNavigator: () => ({ userAgent: "iPhone" }) });
  for (const mode of ["auto", "phone", "tablet"]) {
    const policy = resolver.resolve({ mode });
    assert.equal(policy.active, true);
    assert.equal(policy.runtimeMode, mode === "auto" ? "phone" : mode);
  }
  for (const mode of ["native", "desktop", "off"]) {
    const policy = resolver.resolve({ mode });
    assert.equal(policy.active, false);
    assert.equal(policy.preference, "native");
    assert.equal(policy.runtimeMode, "native");
  }
});

test("device classification remains stable through orientation and visual viewport changes", () => {
  const window = { ...browser }, navigator = { userAgent: "iPhone" };
  const resolver = createActivationPolicyResolver({ getWindow: () => window, getNavigator: () => navigator });
  assert.equal(resolver.resolve({ mode: "tablet" }).runtimeMode, "tablet");
  window.innerWidth = 1000; window.innerHeight = 700;
  assert.equal(resolver.resolve({ mode: "auto" }).runtimeMode, "phone");
});
