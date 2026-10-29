/** Static, audited copy keys. Context is a narrow presentation record, never diagnostics. */
export function controlsGuideSections({ presentation = "desktop", systemId = "dnd5e", actorType = "character",
  characterPresentation = "legacy", profileTabs, notesAvailable = true, edition } = {}) {
  const dnd = systemId === "dnd5e" && characterPresentation === "legacy";
  const profile = characterPresentation === "profile";
  const warhammer = systemId === "wfrp4e" && profile;
  const shadowdark = systemId === "shadowdark" && profile;
  const mappedTabs = warhammer ? [
    ["main", "WarhammerMain"], ["combat", edition === "5e" ? "WarhammerCombat5e" : edition === "4e" ? "WarhammerCombat4e" : "WarhammerCombat"],
    ["skills", "WarhammerSkills"], ["trappings", "WarhammerTrappings"], ["talents", "WarhammerTalents"],
    ["magic", "WarhammerMagic"], ["effects", "WarhammerEffects"]
  ] : shadowdark ? [
    ["abilities", "ShadowdarkAbilities"], ["spells", "ShadowdarkSpells"],
    ["inventory", "ShadowdarkInventory"], ["talents", "ShadowdarkTalents"]
  ] : [];
  const characterEntries = dnd
    ? actorType === "group" ? ["GroupMembers", "GroupSupplies", "GroupAbout"]
      : actorType === "vehicle" ? ["VehicleStatus", "VehicleActions", "VehicleCargo", "VehicleDetails"]
        : ["DndFavourites", "DndOverview", "DndInventory", "DndSpells", "DndFeatures", "DndBiography"]
    : mappedTabs.length ? [
      ...mappedTabs.filter(([id]) => !profileTabs || profileTabs.includes(id)).map(([, key]) => key),
      ...(notesAvailable ? [warhammer ? "WarhammerNotes" : "Notes"] : [])
    ] : ["NativeSheet"];
  const sections = [
    { id: "tabs", entries: ["CharacterTab", "ChatTab", "JournalsTab", "InitiativeTab", "SettingsTab"] },
    { id: "character", entries: characterEntries },
    { id: "controls", entries: ["Portrait", dnd ? "Chooser" : "NativeChooser",
      ...(dnd ? ["Rows", ...(actorType === "group" ? ["Members"] : [])] : []),
      ...(warhammer || shadowdark ? ["Counters", "Descriptions", "NativeSheet"] : []),
      ...(warhammer ? ["ItemNotes"] : []),
      ...(warhammer && edition === "5e" ? ["ConditionReferences"] : []),
      "Back", ...(presentation === "desktop" ? ["DesktopReview"] : [presentation === "phone" ? "Phone" : "Tablet"])] }
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
