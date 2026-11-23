/** An unavailable edition is never inferred from the actor's field shape. */
export function readWarhammerContext(game) {
  try {
    const edition = game?.settings?.get?.("wfrp4e", "editionSettings");
    if (edition?.use5e !== true) return null;
    return Object.freeze({ use5e: true, revision: "5e" });
  } catch { return null; }
}
