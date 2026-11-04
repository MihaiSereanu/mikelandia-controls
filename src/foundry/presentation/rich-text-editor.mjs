import { bindChatEditorInteraction } from "../chat/native-chat-gateway.mjs";
import { localizeFoundry } from "../settings/localization.mjs";

/** A local native editor: writes stay behind the caller's Save/conflict checks. */
export async function mountRichTextEditor(host, value, { scope, label, save }) {
  const TextEditor = globalThis.foundry?.applications?.ux?.TextEditor ?? globalThis.TextEditor;
  const implementation = TextEditor?.implementation ?? TextEditor;
  const pm = globalThis.foundry?.prosemirror ?? globalThis.ProseMirror;
  if (typeof implementation?.create !== "function" || !pm?.dom?.serializeString) {
    throw new Error(localizeFoundry("MIKELANDIA_CONTROLS.Character.Presenter.RichEditorUnavailable", "Foundry's rich-text editor is unavailable. Reload Foundry and try again."));
  }
  const target = host.ownerDocument.createElement("div");
  target.className = "editor-content";
  target.setAttribute("aria-label", label);
  host.append(target);
  let disabled = false;
  const submit = () => { if (!disabled && !scope.disposed) save(); };
  const nativePlugins = pm.plugins ?? pm;
  const plugins = {
    menu: nativePlugins.ProseMirrorMenu.build(pm.defaultSchema, { onSave: submit, destroyOnSave: false }),
    keyMaps: nativePlugins.ProseMirrorKeyMaps.build(pm.defaultSchema, { onSave: submit })
  };
  const editor = await implementation.create({ engine: "prosemirror", target, plugins,
    collaborate: false, props: { editable: () => !disabled } }, editorHTML(value, host.ownerDocument));
  if (scope.disposed) { editor.destroy(); return null; }
  scope.own(() => editor.destroy());
  bindChatEditorInteraction({ input: host, document: host.ownerDocument, scope });
  editor.view.dom.setAttribute("aria-label", label);
  editor.view.dom.setAttribute("role", "textbox");
  editor.view.dom.setAttribute("aria-multiline", "true");
  // Put both the caret and overflowing text at the end once, on opening.
  const selection = pm.TextSelection.atEnd(editor.view.state.doc);
  editor.view.dispatch(editor.view.state.tr.setSelection(selection));
  editor.view.focus();
  editor.view.dom.scrollTop = editor.view.dom.scrollHeight;
  return {
    read() {
      const source = host.querySelector(":scope > .source-editor");
      if (source) return source.value;
      // Opening and saving must not normalize markup or discard unsupported content.
      if (!editor.isDirty()) return String(value ?? "");
      return pm.dom.serializeString(editor.view.state.doc.content);
    },
    setDisabled(next) {
      disabled = next;
      editor.view.setProps({ editable: () => !disabled });
      host.setAttribute("aria-disabled", String(disabled));
      for (const control of host.querySelectorAll("button, .source-editor")) control.disabled = disabled;
    }
  };
}

/** Preserve typed line breaks when native HTML parsing normalizes whitespace. */
function editorHTML(value, document) {
  const template = document.createElement("template");
  template.innerHTML = String(value ?? "");
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) {
    const text = walker.currentNode;
    if (/\S/u.test(text.textContent) && /[\r\n]/u.test(text.textContent)
      && !text.parentElement?.closest("pre, code")) texts.push(text);
  }
  for (const text of texts) {
    const lines = text.textContent.replace(/\r\n?/gu, "\n").split("\n");
    text.replaceWith(...lines.flatMap((line, index) => index ? [document.createElement("br"), document.createTextNode(line)] : [document.createTextNode(line)]));
  }
  return template.innerHTML;
}
