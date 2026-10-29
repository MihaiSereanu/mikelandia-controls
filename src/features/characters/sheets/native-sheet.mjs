import { node, icon, append } from "../../../ui/primitives/dom.mjs";
import { localizedText } from "../../../ui/primitives/localized-text.mjs";
import { renderProfilePanels } from "../profile/profile-panels.mjs";
import { renderImageViewer } from "../../../ui/media/image-viewer.mjs";

/** Shared character shell for mapped panels and native-sheet access. */
export function renderNativeCharacter({ state, commands, scope, createChooser, renderNotes, retained = null }) {
  const owner = scope;
  const shell = retained ?? { element: node("section", {
    className: "mc-character-screen mc-character-unselected mc-native-character-screen"
  }) };
  shell.scope?.dispose();
  scope = shell.scope = owner.child("native-character-pane");
  const actor = state.snapshot.selectedActor;
  const editorContext = state.characterTab === "notes" && actor.notesAvailable ? actor.sourceUuid : "";
  if (shell.editorContext !== editorContext || !shell.editorScope) {
    shell.editorScope?.dispose();
    shell.editorScope = owner.child("native-character-editor");
    shell.editorContext = editorContext;
    shell.overlayHost = node("div", { className: "mc-character-overlay-host" });
    const host = shell.overlayHost;
    shell.editorScope.own(() => host.replaceChildren());
  }
  shell.element.__mcCharacterOverlayHost = shell.overlayHost;
  const text = (key, fallback) => localizedText(commands.localize, `MIKELANDIA_CONTROLS.NativeSheet.${key}`, fallback);
  const button = node("button", {
    className: "mc-native-sheet-open", text: text("Open", "Open Character Sheet"),
    attrs: { type: "button", disabled: !actor.nativeSheetAvailable },
    on: { click: async () => {
      if (button.disabled || scope.disposed) return;
      button.disabled = true;
      try {
        await commands.openNativeActorEditor({ actorSourceUuid: actor.sourceUuid });
      } catch (error) {
        if (!scope.disposed) commands.reportCharacterMutationError?.(error);
      } finally { if (!scope.disposed) button.disabled = !actor.nativeSheetAvailable; }
    } }
  }, scope);
  let open = false;
  const setOpen = next => {
    open = Boolean(next);
    trigger.setAttribute("aria-expanded", String(open));
    chooser.element.toggleAttribute("hidden", !open);
    if (open) chooser.mount(); else chooser.unmount();
  };
  const chooser = createChooser({ actors: state.snapshot.actors ?? [], selectedActor: actor,
    commands, onClose: () => setOpen(false), scope });
  const trigger = node("button", { className: "mc-character-select-trigger",
    attrs: { type: "button", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": text("SelectCharacter", "Select character") },
    on: { click: () => setOpen(!open) }, children: [icon("fa-chevron-down")] }, scope);
  const status = node("p", { className: "mc-character-status", attrs: { role: "status", "aria-live": "polite" } });
  scope.listen(document, "pointerdown", event => {
    if (open && !chooser.element.contains(event.target) && !trigger.contains(event.target)) setOpen(false);
  }, { passive: true });
  scope.listen(document, "keydown", event => { if (open && event.key === "Escape") setOpen(false); });
  const children = [
    node("header", { className: "mc-native-sheet-identity", children: [
      actor.img ? node("button", { className: "mc-native-portrait-button", attrs: { type: "button", "aria-label": text("ViewPortrait", "View portrait") },
        on: { click: () => commands.openCharacterPortrait({ src: actor.img, name: actor.name }) },
        children: [node("img", { attrs: { src: actor.img, alt: actor.name } })] }, scope) : null,
      node("div", { children: [node("h2", { text: actor.name }), node("p", { text: actor.typeLabel })] }), trigger
    ] }),
    button,
    node("p", { text: actor.presentation === "profile"
      ? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Panels.NativeHint", "Open the sheet to make other changes.")
      : text("Hint", "Use the character sheet for inventory and game actions.") }),
    ...renderProfilePanels(actor, state, commands, scope, renderNotes ? () => renderNotes(actor, commands, status, scope, shell.editorScope) : null),
    status, chooser.element,
    state.portraitImage ? renderImageViewer(state.portraitImage, commands.closeCharacterPortrait, scope, { localize: commands.localize }) : null
  ];
  // The editor host stays connected during same-actor refreshes so native
  // updates cannot interrupt typing, selection, or an IME composition.
  for (const child of Array.from(shell.element.childNodes)) if (child !== shell.overlayHost) child.remove();
  if (shell.overlayHost.parentNode !== shell.element) shell.element.append(shell.overlayHost);
  const content = document.createDocumentFragment();
  append(content, children);
  shell.element.insertBefore(content, shell.overlayHost);
  shell.element.__mcUpdateCharacter = next => renderNativeCharacter({ ...next, scope: owner, createChooser, renderNotes, retained: shell });
  return shell.element;
}
