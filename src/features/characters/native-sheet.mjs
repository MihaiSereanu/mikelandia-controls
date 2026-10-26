import { node } from "../../ui/dom.mjs";
import { localizedText } from "../../ui/localized-text.mjs";
import { renderProfilePanels } from "./profile-panels.mjs";

/** Shared character shell for mapped panels and native-sheet access. */
export function renderNativeCharacter({ state, commands, scope, createChooser, retained = null }) {
  const owner = scope;
  const shell = retained ?? { element: node("section", {
    className: "ve-character-screen ve-character-unselected ve-native-character-screen"
  }) };
  shell.scope?.dispose();
  scope = shell.scope = owner.child("native-character-pane");
  const actor = state.snapshot.selectedActor;
  const text = (key, fallback) => localizedText(commands.localize, `VEMOBILE.NativeSheet.${key}`, fallback);
  const status = node("p", { attrs: { role: "status", "aria-live": "polite" } });
  const button = node("button", {
    className: "ve-native-sheet-open", text: text("Open", "Open Character Sheet"),
    attrs: { type: "button", disabled: !actor.nativeSheetAvailable },
    on: { click: async () => {
      if (button.disabled || scope.disposed) return;
      button.disabled = true;
      status.textContent = text("Opening", "Opening character sheet…");
      try {
        await commands.openNativeActorEditor({ actorSourceUuid: actor.sourceUuid });
        if (!scope.disposed) status.textContent = "";
      } catch (error) {
        if (!scope.disposed) status.textContent = error?.message ?? text("Failed", "The character sheet could not be opened.");
      } finally { if (!scope.disposed) button.disabled = !actor.nativeSheetAvailable; }
    } }
  }, scope);
  const chooser = createChooser({ actors: state.snapshot.actors ?? [], selectedActor: actor,
    commands, onClose: () => {}, scope, embedded: true });
  chooser.mount();
  shell.element.replaceChildren(
    node("header", { className: "ve-native-sheet-identity", children: [
      actor.img ? node("img", { attrs: { src: actor.img, alt: "" } }) : null,
      node("div", { children: [node("h2", { text: actor.name }), node("p", { text: actor.typeLabel })] })
    ] }),
    button,
    status,
    node("p", { text: actor.presentation === "profile"
      ? localizedText(commands.localize, "VEMOBILE.Panels.NativeHint", "Use the character sheet for edits and additional game actions.")
      : text("Hint", "Use the character sheet for inventory and game actions.") }),
    ...renderProfilePanels(actor, state, commands, scope),
    chooser.element
  );
  shell.element.__veUpdateCharacter = next => renderNativeCharacter({ ...next, scope: owner, createChooser, retained: shell });
  return shell.element;
}
