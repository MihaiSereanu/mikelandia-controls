/** Resolve the native assigned mount without off-scene token notifications. */
export function warhammerMount(actor) {
  try {
    const assignment = actor?.system?.status?.mount;
    if (!assignment?.id) return null;
    if (assignment.isToken && (!globalThis.canvas?.scene
      || globalThis.canvas.scene.id !== assignment.tokenData?.scene)) return null;
    const mount = actor.mount;
    // Native rider sheets show the assigned mount without separate Actor visibility.
    return mount && typeof mount.name === "string" ? mount : null;
  } catch { return null; }
}

export function mountRevision(actor, mount) {
  const assignment = actor.system.status.mount;
  return [assignment.id, assignment.isToken, assignment.tokenData?.scene, assignment.tokenData?.token, mount.uuid];
}
