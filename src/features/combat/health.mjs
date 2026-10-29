import { localizedText, localizedNumber } from "../../ui/primitives/localized-text.mjs";

export function combatHealthText(health, commands) {
  if (!health) return "";
  if (health.status) return localizedText(commands.localize, `MIKELANDIA_CONTROLS.Targets.${health.status}`, health.status);
  const locale = commands.readLocale?.() ?? "en";
  return `${localizedText(commands.localize, health.labelKey, health.label)} ${localizedNumber(health.value, locale)} / ${localizedNumber(health.max, locale)}`;
}
