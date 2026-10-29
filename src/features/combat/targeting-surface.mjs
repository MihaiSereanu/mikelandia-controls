export function characterHasTargets(actor, tab) {
  if (actor?.profileId === "wfrp4e-character") return tab === "combat";
  if (actor?.profileId === "shadowdark-player") return tab === "abilities";
  return Boolean(actor && !["native", "profile"].includes(actor.presentation) && tab === "overview");
}

export function targetsVisible(state) {
  if (state.route === "combat") return true;
  if (state.route !== "characters") return false;
  const actor = state.snapshot?.selectedActor ?? state.snapshot?.actors?.find(actor => actor.id === state.selectedActorId);
  const active = actor?.panels ? actor.panels.find(tab => tab.id === state.characterTab)?.id ?? actor.panels[0]?.id : state.characterTab;
  return characterHasTargets(actor, active);
}
