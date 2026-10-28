import { localizeFoundry } from "./localization.mjs";

const LEVEL_RANK = Object.freeze({ off: -1, error: 0, warn: 1, info: 2, debug: 3 });
const MAX_ENTRIES = 200;

/**
 * A bounded, serializable mobile diagnostic trail. It intentionally records
 * Mikelandia Controls's important lifecycle failures and uncaught browser failures without
 * patching the browser console or collecting data remotely.
 */
export function createMobileDiagnostics({
  readLevel = () => "warn",
  getWindow = () => globalThis.window,
  now = () => new Date()
} = {}) {
  const entries = [];

  const record = (level, message, error) => {
    const normalizedLevel = normalizeLevel(level);
    if (!shouldRecord(normalizedLevel, readLevel())) return null;
    const entry = Object.freeze({
      at: safeTimestamp(now),
      level: normalizedLevel,
      message: String(message ?? localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobileDiagnostics.MCMobileEvent", "Mikelandia Controls event")).slice(0, 500),
      ...(error ? { error: errorText(error).slice(0, 1600) } : {})
    });
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    if (["error", "warn"].includes(normalizedLevel)) console[normalizedLevel](`Mikelandia Controls | ${entry.message}`, ...(error ? [error] : []));
    return entry;
  };

  return Object.freeze({
    record,
    snapshot: () => Object.freeze(entries.slice()),
    watch(scope) {
      const browser = getWindow();
      if (!browser?.addEventListener) return;
      scope.listen(browser, "error", (event) => {
        record("error", event?.message || "Uncaught browser error", event?.error);
      });
      scope.listen(browser, "unhandledrejection", (event) => {
        record("error", "Unhandled promise rejection", event?.reason);
      });
    },

  });
}

function normalizeLevel(level) {
  const value = String(level ?? "warn").toLowerCase();
  return Object.hasOwn(LEVEL_RANK, value) ? value : "warn";
}

function shouldRecord(level, configuredLevel) {
  const configured = normalizeLevel(configuredLevel);
  return configured !== "off" && LEVEL_RANK[level] <= LEVEL_RANK[configured];
}

function safeTimestamp(now) {
  try {
    return now()?.toISOString?.() ?? new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function errorText(error) {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error ?? "Unknown error");
  }
}
