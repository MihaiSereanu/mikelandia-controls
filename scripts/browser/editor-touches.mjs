/** Trusted touch checks against the installed native editor and its dropdown. */
export async function checkEditorTouches(send, checks) {
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const tap = async selector => {
    const point = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null; const r = element.getBoundingClientRect(); return { x: r.x + Math.min(r.width / 2, 80), y: r.y + Math.min(r.height / 2, 22) }; })()`);
    if (!point) throw new Error(`Missing editor touch control: ${selector}`);
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await new Promise(resolve => setTimeout(resolve, 100));
  };
  await send("Input.insertText", { text: " Added after opening" });
  await new Promise(resolve => setTimeout(resolve, 100));
  const typing = await evaluate("(() => { const text = document.querySelector('.mc-rich-text-editor .editor-content'); const caret = getSelection().getRangeAt(0).getBoundingClientRect(); const box = text.getBoundingClientRect(); return { appended: text.textContent.endsWith(' Added after opening'), caret: caret.toJSON(), box: box.toJSON() }; })()");
  if (!typing.appended || typing.caret.bottom > typing.box.bottom + 1 || typing.caret.top < typing.box.top - 1) throw new Error("Native typing did not keep the caret visible: " + JSON.stringify(typing));
  checks.push("native typing at the end keeps the caret and appended text visible");
  await evaluate(`import('/tests/browser/rich-editor-fixture.mjs').then(({editorInput}) => { const input = editorInput(document.querySelector('main')); input.setSelectionRange(7, 12); input.focus(); })`);
  await tap(".mc-rich-text-editor .pm-dropdown.format");
  if (!await evaluate("document.querySelector('#prosemirror-dropdown')?.matches(':popover-open')")) throw new Error("Trusted touch did not open native formatting");
  checks.push("trusted touch opens the native formatting dropdown above mobile isolation");
  await tap('#prosemirror-dropdown [data-action="inline"]');
  if (!await evaluate("document.querySelector('#prosemirror-dropdown [data-action=inline]')?.classList.contains('mc-chat-menu-expanded')")) throw new Error("Trusted touch did not expand native inline formatting");
  await tap('#prosemirror-dropdown [data-action="bold"]');
  if (!await evaluate("[...document.querySelectorAll('.mc-rich-text-editor .editor-content strong')].some(element => element.textContent === 'entry')")) throw new Error("Trusted touch did not apply Bold");
  checks.push("trusted touch selects Bold from the native submenu and formats the selected text");
  await tap(".mc-rich-text-editor .pm-dropdown.format");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  if (!await evaluate("!!document.querySelector('.mc-biography-editor') && !document.getElementById('prosemirror-dropdown')")) throw new Error("Escape lost the editor draft while dismissing formatting");
  checks.push("Escape dismisses formatting while retaining the editor draft");
}
