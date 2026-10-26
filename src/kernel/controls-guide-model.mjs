/** Static, audited copy keys. Context is a narrow presentation record, never diagnostics. */
export function controlsGuideSections({ presentation = "desktop", canvasAvailable = true, split = false, canPlaceActor = false, collective = false, actionBarSource = "character", characterPresentation = "legacy" } = {}) {
  const legacy = characterPresentation === "legacy";
  const splitLayout = legacy ? "TabletSplit" : "TabletSplitChooser";
  const sections = [
    { id: "common", entries: ["Tap", legacy ? "Hold" : "NativeHold", "Back", "Availability"] },
    ...(canvasAvailable ? [{ id: "scene", entries: ["Pan", "Select", "Target", "TokenHold", "TokenDrag", "Scenery", "Joystick"] }] : [{ id: "scene", entries: ["NoCanvas"] }]),
    { id: "character", entries: [...(legacy ? ["Portrait", "Chooser", "Rows", ...(collective ? ["Members"] : [])]
      : ["NativeChooser", "NativeSheet", ...(characterPresentation === "profile" ? ["ProfileActions", "ProfileResources"] : [])]), actionBarSource === "foundry" ? "Hotbar" : "Quickbar"] },
    { id: "placement", entries: ["Navigation", ...(canvasAvailable ? ["Preview", ...(canPlaceActor && !collective ? [legacy ? split ? "SplitDrop" : "ActorPlace" : "ChooserPlace"] : [])] : [])] },
    { id: "layout", entries: presentation === "desktop" ? ["DesktopReview", "Phone", splitLayout, "TabletFull"]
      : [presentation === "phone" ? "Phone" : split ? splitLayout : "TabletFull"] }
  ];
  return Object.freeze(sections.map(section => Object.freeze({ ...section, entries: Object.freeze(section.entries) })));
}

export function controlsInvitationReady({ ready, state = {}, blocked = false, interacting = false } = {}) {
  return Boolean(ready && state.status === "ready" && ["phone", "tablet"].includes(state.formFactor)
    && !state.reconnect && !state.modeTransition && !state.templatePlacement && !state.nativeTokenPlacement
    && !state.actorTokenPlacement && !state.actionSession && !state.hitPointEditor && !state.restEditor
    && !state.spellSlotEditor && !state.xpEditor && !state.portraitImage && !state.journalImage
    && !state.characterItemId && !state.sceneChooserOpen && !blocked && !interacting);
}
