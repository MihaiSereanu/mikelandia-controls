/** Trusted input must reach the last option, not just expand a details element. */
export async function checkRollDialogScrolling(send, checks) {
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const settle = () => evaluate("new Promise(resolve => setTimeout(resolve, 100))");
  const assert = async (name, expression) => {
    const result = await evaluate(expression);
    if (result !== true) throw new Error(name + ": " + JSON.stringify(result));
    checks.push(name);
  };
  await evaluate(`(() => {
    const root = document.querySelector('.mc-compact-roll');
    const content = root.querySelector('.window-content');
    const details = root.querySelector('.mc-roll-more');
    if (details) details.open = true;
    // Native multi-part damage formulas and protection lists can be arbitrarily long.
    const list = root.querySelector('ul.formulas, .protection-options');
    if (list) for (let i = 0; i < 18; i++) list.append(list.firstElementChild.cloneNode(true));
    const candidates = details ?? list ?? content;
    const options = [...candidates.querySelectorAll('input, select, .modifier:not(.hidden), .tooltips, li')];
    const last = options.filter(node => node.getBoundingClientRect().height).at(-1);
    last.dataset.scrollLastOption = 'true';
    content.scrollTop = 0;
  })()`);
  await settle();
  const scroll = "document.querySelector('.mc-compact-roll .window-content')";
  const overflowing = await evaluate(`${scroll}.scrollHeight > ${scroll}.clientHeight + 1`);
  const point = await evaluate(`(() => {
    const r = ${scroll}.getBoundingClientRect();
    const footer = document.querySelector('.mc-compact-roll footer').getBoundingClientRect();
    return {x:r.left+r.width/2, y:r.top+Math.min(r.height, footer.top-r.top)*0.75};
  })()`);
  if (overflowing) {
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", ...point, deltaX: 0, deltaY: 180 });
    await settle();
    await assert("wheel scrolls expanded native roll content", `${scroll}.scrollTop > 5`);
    await evaluate(`${scroll}.scrollTop = 0`);
    await settle();
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...point, id: 1 }] });
    for (let step = 1; step <= 8; step++) {
      await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x, y: point.y - step * 12, id: 1 }] });
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await settle();
    await assert("touch swipe scrolls expanded native roll content", `${scroll}.scrollTop > 5`);
    for (let attempt = 0; attempt < 5; attempt++) {
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", ...point, deltaX: 0, deltaY: 10000 });
      await settle();
      if (await evaluate(`${scroll}.scrollTop >= ${scroll}.scrollHeight - ${scroll}.clientHeight - 1`)) break;
    }
  }
  await assert("last option is visible above Roll after scrolling", `(() => {
    const target = document.querySelector('[data-scroll-last-option]');
    const r = target.getBoundingClientRect(), pane = ${scroll}.getBoundingClientRect();
    const footer = document.querySelector('.mc-compact-roll footer').getBoundingClientRect();
    return r.top >= pane.top - 1 && r.bottom <= Math.min(pane.bottom, footer.top) + 1 || {target:r.toJSON(), pane:pane.toJSON(), footer:footer.toJSON(), scroll:${scroll}.scrollTop, total:${scroll}.scrollHeight};
  })()`);
  await assert("last option is not covered by another element", `(() => {
    const target = document.querySelector('[data-scroll-last-option]');
    const r = target.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
    return hit === target || target.contains(hit);
  })()`);
  await assert("Roll remains visible and usable with expanded options", `(() => {
    const button = document.querySelector('.mc-compact-roll [type=submit]');
    const r = button.getBoundingClientRect(), pane = ${scroll}.getBoundingClientRect();
    return r.top >= pane.top && r.bottom <= pane.bottom + 1 && !button.disabled;
  })()`);
}
