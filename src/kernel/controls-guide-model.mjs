/** Static, audited copy keys. Context is a narrow presentation record, never diagnostics. */
export function controlsGuideSections({ presentation = "desktop", collective = false, characterPresentation = "legacy" } = {}) {
  const legacy = characterPresentation === "legacy";
  const sections = [
    { id: "common", entries: ["Tap", legacy ? "Hold" : "NativeHold", "Back", "Availability"] },
    { id: "character", entries: legacy ? ["Portrait", "Chooser", "Rows", ...(collective ? ["Members"] : [])] : ["NativeChooser", "NativeSheet", ...(characterPresentation === "profile" ? ["ProfileActions", "ProfileResources"] : [])] },
    { id: "layout", entries: presentation === "desktop" ? ["DesktopReview", "Phone", "Tablet"] : [presentation === "phone" ? "Phone" : "Tablet"] }
  ];
  return Object.freeze(sections.map(section => Object.freeze({ ...section, entries: Object.freeze(section.entries) })));
}

export function controlsInvitationReady({ ready, state = {}, blocked = false, interacting = false } = {}) {
  return Boolean(ready && state.status === "ready" && ["phone", "tablet"].includes(state.formFactor)
    && !state.reconnect && !state.modeTransition
    && !state.actionSession && !state.hitPointEditor && !state.restEditor
    && !state.spellSlotEditor && !state.xpEditor && !state.portraitImage && !state.journalImage
    && !state.characterItemId && !blocked && !interacting);
}
