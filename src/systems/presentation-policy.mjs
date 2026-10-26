const legacyPreferences = new Set(["headerArtwork", "headerArtworkOpacity", "characterInventorySort", "characterSpellSort", "characterSpellFilter", "characterFeatureSort", "characterFavouritesSort", "characterEffectsSort", "characterFavouritesSource"]);

/** Presentation capabilities never authorize gameplay or rewrite stored choices. */
export function supportsPreference(key, features = {}) {
  if (legacyPreferences.has(key)) return features.legacyCharacterSheet === true;
  if (key === "quickbarSource") return features.quickbar === true;
  if (["showActionSummaries", "compactActionSummaries"].includes(key)) return features.actionSummaries === true;
  return true;
}
export function effectiveColorScheme(value, features = {}) {
  return value === "class" && features.legacyCharacterSheet !== true ? "neutral" : value;
}
export function characterPresentation(features = {}) {
  return features.legacyCharacterSheet ? "legacy" : features.profilePanels ? "profile" : "native";
}
