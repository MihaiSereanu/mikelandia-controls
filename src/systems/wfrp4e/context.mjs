/** An unavailable edition is never inferred from the actor's field shape. */
export function readWarhammerContext(game) {
  try {
    const edition = game?.settings?.get?.("wfrp4e", "editionSettings");
    if (typeof edition?.use5e !== "boolean") return null;
    return Object.freeze({ use5e: edition.use5e, revision: edition.use5e ? "5e" : "4e",
      groupAdvantage: !edition.use5e && game.settings.get("wfrp4e", "useGroupAdvantage") === true });
  } catch { return null; }
}
