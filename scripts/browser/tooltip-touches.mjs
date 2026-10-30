/** Trusted touch input is required to exercise browser popover light dismissal. */
export async function checkTooltipTouches(send, checks) {
  const evaluate = async expression => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const settle = () => evaluate("new Promise(resolve => setTimeout(resolve, 60))");
  const check = async (label, expression) => {
    if (!await evaluate(expression)) throw new Error(label);
    checks.push(label);
  };
  const tapPoint = async (x, y) => {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await settle();
  };
  const tap = async selector => {
    const point = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      element.scrollIntoView({block: "center", behavior: "instant"});
      const r = element.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2};
    })()`);
    await tapPoint(point.x, point.y);
  };
  const condition = '[data-condition-id="bleeding"] .mc-profile-condition-name';
  const notes = '.mc-profile-note-trigger';
  for (const [label, trigger, tooltip] of [
    ["condition", condition, '[data-condition-id="bleeding"] .mc-profile-note-tooltip'],
    ["Notes", notes, '.mc-profile-note .mc-profile-note-tooltip']
  ]) {
    const tip = `document.querySelector(${JSON.stringify(tooltip)})`;
    const button = `document.querySelector(${JSON.stringify(trigger)})`;
    await tap(trigger);
    await check(`${label}: touch opens tooltip`, `${tip}.matches(":popover-open") && ${button}.getAttribute("aria-expanded") === "true"`);
    const inside = await evaluate(`(() => { const r = ${tip}.getBoundingClientRect(); return {x:r.left + r.width / 2,y:r.top + r.height / 2}; })()`);
    await tapPoint(inside.x, inside.y);
    await check(`${label}: inside tap keeps tooltip open`, `${tip}.matches(":popover-open")`);
    if (await evaluate(`${tip}.scrollHeight > ${tip}.clientHeight`)) {
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...inside }] });
      for (let step = 1; step <= 5; step++) {
        await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: inside.x, y: inside.y - step * 10 }] });
      }
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await settle();
      await check(`${label}: scrolling inside keeps tooltip open`, `${tip}.matches(":popover-open") && ${tip}.scrollTop > 0`);
    }
    const outside = await evaluate(`(() => {
      const r = ${tip}.getBoundingClientRect();
      return [{x:24,y:24},{x:innerWidth-24,y:24},{x:24,y:innerHeight-24},{x:innerWidth-24,y:innerHeight-24}]
        .find(p => p.x < r.left - 16 || p.x > r.right + 16 || p.y < r.top - 16 || p.y > r.bottom + 16);
    })()`);
    // Use an inert target to distinguish dismissal from a route change/rerender.
    await evaluate(`(() => {
      const target = document.createElement("div"); target.id = "tooltip-outside-touch";
      target.style.cssText = "position:fixed;width:32px;height:32px;z-index:2147483647;background:white";
      target.style.left = "${outside.x - 16}px"; target.style.top = "${outside.y - 16}px";
      document.querySelector("main").append(target);
    })()`);
    await tapPoint(outside.x, outside.y);
    await check(`${label}: outside blank tap dismisses tooltip`, `!${tip}.matches(":popover-open") && ${button}.getAttribute("aria-expanded") === "false"`);
    await tap(trigger);
    await evaluate(`(() => {
      const blank = document.querySelector("#tooltip-outside-touch");
      const target = document.createElement("button"); target.type = "button";
      target.id = blank.id; target.style.cssText = blank.style.cssText;
      target.setAttribute("aria-label", "Outside test control"); target.dataset.taps = "0";
      target.addEventListener("click", event => { event.stopPropagation(); target.dataset.taps = String(Number(target.dataset.taps) + 1); });
      blank.replaceWith(target);
    })()`);
    await tapPoint(outside.x, outside.y);
    await check(`${label}: outside control dismisses and receives same tap`, `!${tip}.matches(":popover-open") && document.querySelector("#tooltip-outside-touch").dataset.taps === "1"`);
    await evaluate('document.querySelector("#tooltip-outside-touch").remove()');
    await tap(trigger);
    await tap(trigger);
    await check(`${label}: tapping trigger again closes tooltip`, `!${tip}.matches(":popover-open") && ${button}.getAttribute("aria-expanded") === "false"`);
  }
  await tap(notes);
  await tap(condition);
  await check("touching another tooltip trigger switches tooltip", `document.querySelector('[data-condition-id="bleeding"] .mc-profile-note-tooltip').matches(":popover-open") && !document.querySelector('.mc-profile-note .mc-profile-note-tooltip').matches(":popover-open")`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await settle();
  await check("Escape dismisses tooltip after touch", '!document.querySelector(".mc-profile-note-tooltip:popover-open")');
  const picker = ".mc-profile-condition-picker";
  const menu = 'document.querySelector(".mc-profile-condition-menu")';
  await tap(picker);
  await check("condition picker: touch opens themed menu", `${menu}.matches(":popover-open")`);
  await evaluate(`(() => {
    const outside = document.createElement("button"); outside.id = "picker-outside-touch";
    outside.textContent = "Outside"; outside.style.cssText = "position:fixed;left:16px;top:8px;width:60px;height:32px;z-index:2147483647";
    outside.onclick = () => outside.dataset.tapped = "true"; document.querySelector("main").append(outside);
  })()`);
  await tap("#picker-outside-touch");
  await check("condition picker: outside touch dismisses and activates control", `!${menu}.matches(":popover-open") && document.querySelector("#picker-outside-touch").dataset.tapped === "true"`);
  await evaluate('document.querySelector("#picker-outside-touch").remove()');
  await tap(picker);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await settle();
  await check("condition picker: Escape dismisses", `!${menu}.matches(":popover-open")`);
  await tap(picker); await tap(picker);
  await check("condition picker: second touch closes without reopening", `!${menu}.matches(":popover-open")`);
}
