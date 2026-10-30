import { readProfilePath } from "./profile-view.mjs";

/** Read native PC resources without deriving attack damage or changing documents. */
export function readDamageHealth(actor, type, path, noun = "damage", tempPath = "") {
  if (actor?.type !== type) return null;
  const value = readProfilePath(actor, path);
  const temp = tempPath ? readProfilePath(actor, tempPath) ?? 0 : 0;
  if (typeof value !== "number" || !Number.isFinite(value)
    || typeof temp !== "number" || !Number.isFinite(temp) || temp < 0) return null;
  return { value, temp, noun };
}
