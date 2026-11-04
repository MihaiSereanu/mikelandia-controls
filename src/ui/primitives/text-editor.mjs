import { node, icon } from "./dom.mjs";
import { localizedText } from "./localized-text.mjs";
import { mountRichTextEditor } from "../../foundry/presentation/rich-text-editor.mjs";

/** Shared source editor for native Notes and Journal text. */
export function openTextEditor(anchor, config, commands, pageStatus, scope) {
  const screen = anchor.closest(".mc-character-screen, .mc-journal-reader");
  const host = screen?.__mcCharacterOverlayHost ?? screen ?? anchor.ownerDocument?.body;
  if (!host) return;
  host.querySelector?.(".mc-biography-editor-layer")?.dispatchEvent(new Event("mc-close"));
  const editorScope = scope.child(`biography-editor:${config.section}`);
  const editorStatus = node("p", { className: "mc-biography-editor-status", attrs: { role: "status", "aria-live": "polite" } });
  let pending = false;
  let layer;
  let close = () => {};
  let richEditor;
  const useRichEditor = config.richText && !config.markdown;
  const controls = [];
  const fields = config.section === "characteristics"
    ? (config.fields ?? []).map((entry) => {
      const input = node("input", { attrs: { type: "text", maxlength: "200", autocomplete: "off", "data-biography-field": entry.key, value: config.values?.[entry.key] ?? "" } }, editorScope);
      controls.push(input);
      return node("label", { children: [node("span", { text: entry.label }), input] });
    })
    : [];
  const composer = config.section === "characteristics" ? null : useRichEditor
    ? node("div", { className: "mc-rich-text-editor editor prosemirror themed theme-dark" }) : node("textarea", {
    attrs: {
      maxlength: config.richText ? "100000" : "20000",
      rows: config.richText ? "12" : "8",
      spellcheck: "true",
      "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Text", "{label} text", { label: (config.label) })
    }
  }, editorScope);
  if (composer && !useRichEditor) {
    composer.value = String(config.value ?? "");
    controls.push(composer);
  }
  const cancel = node("button", {
    className: "mc-modal-button is-secondary",
    attrs: { type: "button" },
    on: { click: () => { if (!pending) close(); } },
    children: [icon("fa-xmark"), node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Action.Cancel", "Cancel") })]
  }, editorScope);
  const save = node("button", {
    className: "mc-modal-button is-primary",
    attrs: { type: "submit" },
    children: [icon("fa-check"), node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Save", "Save") })]
  });
  controls.push(cancel, save);
  const form = node("form", {
    className: `mc-biography-editor${config.richText ? " is-text-editor" : ""}`,
    attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "mc-biography-editor-title" },
    on: { submit: async (event) => {
      event.preventDefault();
      if (pending || (useRichEditor && !richEditor) || !form.reportValidity()) return;
      const value = useRichEditor ? richEditor.read() : composer?.value;
      if (value?.length > (config.richText ? 100000 : 20000)) {
        editorStatus.classList.add("is-error");
        editorStatus.textContent = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.TextTooLong", "Text is too long to save.");
        return;
      }
      pending = true;
      form.classList.add("is-pending");
      form.setAttribute("aria-busy", "true");
      for (const control of controls) control.disabled = true;
      richEditor?.setDisabled(true);
      editorStatus.classList.remove("is-error");
      editorStatus.textContent = localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Saving", "Saving…");
      try {
        await config.save(value, Object.fromEntries(fields.map(label => {
          const input = label.querySelector("input");
          return [input.dataset.biographyField, input.value];
        })));
        if (editorScope.disposed) return;
        pageStatus.classList.remove("is-error");
        pageStatus.classList.add("is-success");
        pageStatus.textContent = "";
        close();
      } catch (error) {
        if (editorScope.disposed) return;
        pending = false;
        form.classList.remove("is-pending");
        form.removeAttribute("aria-busy");
        for (const control of controls) control.disabled = false;
        richEditor?.setDisabled(false);
        editorStatus.classList.add("is-error");
        editorStatus.textContent = error?.message ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CouldNotBeSaved", "{label} could not be saved.", { label: (config.label) });
      }
    } },
    children: [
      node("header", { children: [
        node("span", { className: "mc-hp-editor-heading-icon", children: [icon(config.iconName)] }),
        node("div", { children: [node("small", { text: config.subjectName }), node("h2", { attrs: { id: "mc-biography-editor-title" }, text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.Edit", "Edit {label}", { label: (config.label) }) })] }),
        node("button", { className: "mc-hp-editor-close", attrs: { type: "button", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Character.Presenter.CloseEditor", "Close {label} editor", { label: (config.label) }) }, on: { click: () => { if (!pending) close(); } }, children: [icon("fa-xmark")] }, editorScope)
      ] }),
      config.section === "characteristics"
        ? node("div", { className: "mc-biography-editor-fields", children: fields })
        : node(useRichEditor ? "div" : "label", { className: "mc-biography-editor-composer", children: [
          useRichEditor ? null : node("span", { text: config.sourceLabel ?? config.label }), composer
        ].filter(Boolean) }),
      editorStatus,
      node("div", { className: "mc-modal-actions", children: [cancel, save] })
    ]
  }, editorScope);
  layer = node("div", { className: `mc-biography-editor-layer${host === screen ? "" : " is-pane-scoped"}`, attrs: { role: "presentation" }, children: [form] });
  close = () => {
    if (editorScope.disposed) return;
    layer.remove();
    editorScope.dispose();
    config.onClose?.();
  };
  editorScope.listen(layer, "mc-close", close);
  editorScope.listen(layer, "pointerdown", (event) => { if (event.target === layer && !pending) close(); });
  editorScope.listen(anchor.ownerDocument ?? document, "keydown", (event) => {
    if (event.key !== "Escape" || pending || event.defaultPrevented) return;
    // Formatting prompts own their dismissal; retain the underlying draft.
    if (!layer.contains(event.target) && event.target?.closest?.(".application, dialog")) return;
    const menu = useRichEditor && host.ownerDocument.querySelector("#prosemirror-dropdown.mc-chat-editor-menu");
    if (menu) {
      menu.remove();
      composer.querySelector(".editor-content")?.focus({ preventScroll: true });
      event.preventDefault();
      return;
    }
    close();
  });
  editorScope.own(() => layer.remove());
  host.append(layer);
  if (useRichEditor) {
    save.disabled = true;
    void mountRichTextEditor(composer, config.value, { scope: editorScope, label: config.label, save: () => form.requestSubmit() })
      .then(editor => { if (!editorScope.disposed) { richEditor = editor; save.disabled = false; } })
      .catch(error => {
        if (editorScope.disposed) return;
        editorStatus.classList.add("is-error");
        editorStatus.textContent = error.message;
      });
  } else queueMicrotask(() => {
    const input = fields[0]?.querySelector("input") ?? composer;
    input?.focus?.({ preventScroll: true });
    if (composer && config.richText) {
      composer.setSelectionRange(composer.value.length, composer.value.length);
      composer.scrollTop = composer.scrollHeight;
    }
  });
}
