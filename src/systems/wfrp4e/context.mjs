/** An unavailable edition is never inferred from the actor's field shape. */
export function readWarhammerContext(game) {
  try {
    const edition = game?.settings?.get?.("wfrp4e", "editionSettings");
    const use5e = edition?.tests === undefined ? edition?.use5e === true : edition.tests === "5e";
    if (!use5e) return null;
    return Object.freeze({ use5e: true, revision: "5e" });
  } catch { return null; }
}
