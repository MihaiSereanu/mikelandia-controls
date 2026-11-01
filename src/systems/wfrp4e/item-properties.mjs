import { localizeFoundry } from "../../foundry/settings/localization.mjs";

/** Read native prepared properties, including unavailable weapon qualities, without changing them. */
export function warhammerItemProperties(item) {
  const system = item.system;
  const config = globalThis.game?.wfrp4e?.config;
  const result = [];
  for (const [bucket, kind, status] of [
    ["qualities", "quality"],
    ["unusedQualities", "quality", "Unused"],
    ["inactiveQualities", "quality", "Inactive"],
    ["flaws", "flaw"],
  ]) {
    let entries;
    try {
      entries = Object.values(system?.properties?.[bucket] ?? {});
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry || typeof entry.display !== "string" || !entry.display.trim())
        continue;
      const source =
        kind === "quality" ? system?.qualities?.value : system?.flaws?.value;
      const custom = Array.isArray(source)
        ? source.find(
            (value) => value?.custom === true && value.key === entry.key,
          )
        : null;
      const reference =
        kind === "quality"
          ? config?.qualityDescriptions?.[entry.key]
          : config?.flawDescriptions?.[entry.key];
      const description =
        typeof custom?.description === "string"
          ? custom.description
          : typeof reference === "string"
            ? reference.replaceAll("(Rating)", String(entry.value ?? ""))
            : "";
      result.push({
        label: status
          ? `${entry.display} (${localizeFoundry(status, status)})`
          : entry.display,
        description,
        kind,
      });
    }
  }
  return result;
}
