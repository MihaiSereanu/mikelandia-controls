/** Small native-API double for portable integration checks; --native-assets uses Foundry itself. */
export function createEditorDouble(record) {
  const css = document.createElement("style");
  css.textContent = ".mc-rich-text-editor { display:flex; flex-direction:column; } .mc-rich-text-editor .editor-container {flex:1;display:flex;overflow:hidden} .mc-rich-text-editor .editor-content {flex:1;overflow:auto} .mc-rich-text-editor .menu-container {flex:0 0 56px}";
  document.head.append(css);
  const parseString = html => {
    const template = document.createElement("template"); template.innerHTML = html;
    return { content: { html, size: template.content.textContent.length + 2 } };
  };
  const pm = { defaultSchema: {}, dom: { parseString, serializeString: content => content.html },
    TextSelection: { atEnd: doc => ({ from: doc.content.size - 1, to: doc.content.size - 1 }), create: (_doc, from, to) => ({ from, to }) },
    ProseMirrorMenu: { build: (_schema, options) => options }, ProseMirrorKeyMaps: { build: () => ({}) } };
  const implementation = {
    enrichHTML: async value => value,
    async create({ target, plugins, props }, html) {
      let dirty = false;
      const menu = document.createElement("menu");
      const save = document.createElement("button"); save.type = "button"; save.textContent = "Save";
      save.onclick = plugins.menu.onSave; menu.append(save);
      const menuHost = document.createElement("div"); menuHost.className = "menu-container";
      menuHost.append(menu); target.before(menuHost);
      const editorHost = document.createElement("div"); editorHost.className = "editor-container";
      target.replaceWith(editorHost); editorHost.append(target);
      target.innerHTML = html; target.contentEditable = "true";
      const view = {
        dom: target, state: null,
        dispatch(transaction) {
          if (transaction.doc) { target.innerHTML = transaction.doc.content.html; dirty = true; }
          this.state = state(transaction.doc ?? this.state.doc, transaction.selection ?? this.state.selection);
        },
        setProps(next) { props = next; target.contentEditable = String(props.editable()); },
        focus() { target.focus(); }
      };
      const state = (doc, selection = { from: 1, to: 1 }) => ({ doc, selection, tr: {
        setSelection(next) { this.selection = next; return this; },
        replaceWith(_from, _to, content) { this.doc = { content }; return this; }
      } });
      view.state = state(parseString(html));
      const input = () => { dirty = true; view.state = state(parseString(target.innerHTML)); };
      target.addEventListener("input", input);
      const editor = { view, isDirty: () => dirty, destroy() { target.removeEventListener("input", input); menu.remove(); } };
      record(target, editor);
      return editor;
    }
  };
  return { pm, implementation };
}
