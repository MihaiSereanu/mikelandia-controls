// Uses the installed native editor when --native-assets is requested.
const editors = new WeakMap();

export async function installRichEditorFixture() {
  if (!new URLSearchParams(location.search).has("native-assets")) {
    const { createEditorDouble } = await import("./rich-editor-double.mjs");
    const fixture = createEditorDouble((element, editor) => editors.set(element, editor));
    globalThis.foundry ??= {};
    foundry.prosemirror = fixture.pm;
    foundry.applications ??= {};
    foundry.applications.ux = { TextEditor: { implementation: fixture.implementation } };
    return fixture;
  }
  if (globalThis.__mcNativeEditorFixture) return globalThis.__mcNativeEditorFixture;
  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "/native-fixture/foundry2.css";
  document.head.prepend(css);
  await new Promise((resolve, reject) => { css.onload = resolve; css.onerror = reject; });
  const fonts = document.createElement("link");
  fonts.rel = "stylesheet"; fonts.href = "/native-fixture/fontawesome.css";
  document.head.prepend(fonts);
  const dictionary = await fetch("/native-fixture/en.json").then(response => response.json());
  globalThis._loc = key => key.split(".").reduce((entry, part) => entry?.[part], dictionary) ?? key;
  globalThis.CONFIG ??= { debug: { hooks: false }, TextEditor: { inserts: [] } };
  globalThis.foundry ??= {};
  foundry.utils ??= {};
  Object.assign(foundry.utils, {
    randomID: () => crypto.randomUUID().replaceAll("-", ""),
    deepClone: structuredClone, isPlainObject: value => value?.constructor === Object,
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    escapeHTML: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;")
  });
  foundry.applications ??= {};
  foundry.applications.detached = document.body;
  foundry.applications.settings = { menus: { FontConfig: { getAvailableFonts: () => ["Arial", "Georgia"] } } };
  Object.assign(foundry.utils, await import("/native-editor/common/utils/helpers.mjs"));
  await import("/native-editor/common/primitives/_module.mjs");
  const pm = await import("/native-editor/common/prosemirror/_module.mjs");
  const { default: NativeEditor } = await import("/native-editor/client/applications/ux/prosemirror-editor.mjs");
  foundry.prosemirror = globalThis.ProseMirror = pm;
  const implementation = {
    enrichHTML: async value => value,
    async create({ target, ...options }, content) {
      const editor = await NativeEditor.create(target, content, options);
      editors.set(editor.view.dom, editor);
      return editor;
    }
  };
  foundry.applications.ux = { TextEditor: { implementation } };
  pm.ProseMirrorMenu.activateListeners(document);
  globalThis.__mcNativeEditorFixture = { pm, implementation };
  return globalThis.__mcNativeEditorFixture;
}

const inputs = new WeakMap();
export function editorInput(root) {
  const element = root.querySelector(".mc-rich-text-editor .editor-content, textarea");
  if (!element || element.tagName === "TEXTAREA") return element;
  if (inputs.has(element)) return inputs.get(element);
  const editor = editors.get(element), pm = foundry.prosemirror;
  const input = {
    element,
    get value() {
      const content = element.cloneNode(true);
      for (const br of content.querySelectorAll("br")) br.replaceWith("\n");
      return content.textContent;
    },
    set value(text) {
      const paragraph = document.createElement("p");
      String(text).split("\n").forEach((line, index) => {
        if (index) paragraph.append(document.createElement("br"));
        paragraph.append(document.createTextNode(line));
      });
      this.html = paragraph.outerHTML;
    },
    get html() { return pm.dom.serializeString(editor.view.state.doc.content); },
    set html(html) {
      const doc = pm.dom.parseString(html);
      editor.view.dispatch(editor.view.state.tr.replaceWith(0, editor.view.state.doc.content.size, doc.content));
    },
    get disabled() { return element.getAttribute("contenteditable") === "false"; },
    focus() { editor.view.focus(); },
    setSelectionRange(from, to) {
      editor.view.dispatch(editor.view.state.tr.setSelection(pm.TextSelection.create(editor.view.state.doc, from + 1, to + 1)));
    },
    get selectionStart() { return editor.view.state.selection.from - 1; },
    get selectionEnd() { return editor.view.state.selection.to - 1; }
  };
  inputs.set(element, input);
  return input;
}

export function prepareEditorGame(game) {
  globalThis.Hooks.callAll ??= (...args) => globalThis.Hooks.emit(...args);
  game.i18n ??= { localize: key => key, format: key => key };
  game.i18n.format ??= key => key;
  game.keyboard ??= { isModifierActive: () => false };
  game.user.getFlag ??= () => undefined;
}
