/** Exercise UUID navigation with trusted touches and native light dismissal. */
export async function checkDescriptionTouches(send, checks) {
  const evaluate = async expression => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const settle = () => evaluate("new Promise(resolve => setTimeout(resolve, 100))");
  const tap = async selector => {
    const point = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      element.scrollIntoView({block: "nearest", behavior: "instant"});
      const r = element.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2};
    })()`);
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await settle();
  };
  const check = async (name, expression) => {
    if (!await evaluate(expression)) throw new Error(name);
    checks.push(name);
  };
  const link = '.description-touch > p a.content-link';
  const open = 'document.querySelector(".mc-reference-tooltip")?.matches(":popover-open")';
  await tap(link);
  await check("touch: UUID opens a preview", `${open} && document.querySelector('.mc-reference-body').textContent.includes('First rules')`);
  await tap('.mc-reference-tooltip [data-uuid="Item.second"]');
  await check("touch: nested UUID replaces preview", `${open} && document.querySelector('.mc-reference-body').textContent.includes('Second rules')`);
  await tap('.mc-reference-tooltip header button');
  await check("touch: Back restores previous preview", `${open} && document.querySelector('.mc-reference-body').textContent.includes('First rules')`);
  await tap(link);
  await check("touch: retap closes preview", `!(${open})`);
  await tap(link);
  await evaluate(`(() => {
    const button = document.createElement('button'); button.id = 'description-outside'; button.textContent = 'Outside';
    button.style.cssText = 'position:fixed;bottom:4px;left:4px;width:90px;height:44px';
    button.onclick = () => button.dataset.tapped = 'true'; document.querySelector('main').append(button);
  })()`);
  await tap('#description-outside');
  await check("touch: outside tap dismisses and activates control", `!(${open}) && document.querySelector('#description-outside').dataset.tapped === 'true'`);
  await evaluate("document.querySelector('#description-outside').remove()");
  await tap(link);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await settle();
  await check("touch: Escape dismisses preview", `!(${open})`);
  await tap(link); // Leave the preview visible for screenshot review.
}

/** Trusted touch input is required to exercise browser popover light dismissal. */
export async function checkTooltipTouches(send, checks) {
  const evaluate = async expression => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const settle = () => evaluate("new Promise(resolve => setTimeout(resolve, 60))");
  const check = async (label, expression) => {
    // Native toggle events can arrive after the input dispatch has completed.
    const passed = await evaluate(`(async () => {
      const deadline = performance.now() + 2000;
      do {
        if (${expression}) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      } while (performance.now() < deadline);
      return false;
    })()`);
    if (!passed) throw new Error(label);
    checks.push(label);
  };
  const tapPoint = async (x, y) => {
    // Give newly inserted targets and repositioned popovers a painted frame.
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
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
      // A tap during inertial scrolling can stop the scroll instead of dismissing.
      await evaluate(`(async () => {
        const element = ${tip};
        const deadline = performance.now() + 3000;
        let previous = element.scrollTop, stable = 0;
        while (stable < 3 && performance.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 50));
          const current = element.scrollTop;
          stable = current === previous ? stable + 1 : 0;
          previous = current;
        }
        if (stable < 3) throw new Error("Tooltip scrolling did not settle");
      })()`);
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

/** SWADE names explain a status; only its separate checkbox changes it. */
export async function checkSwadeConditionTouches(send, checks) {
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const settle = () => evaluate("new Promise(resolve => setTimeout(resolve, 100))");
  const check = async (label, expression) => {
    if (!await evaluate(expression)) throw new Error(label);
    checks.push(label);
  };
  const tap = async selector => {
    const point = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
      e.scrollIntoView({block:'nearest',behavior:'instant'}); const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await settle();
  };
  const shaken = '[data-profile-condition-reference="shaken"]', berserk = '[data-profile-condition-reference="berserk"]';
  const tip = 'document.querySelector(".mc-profile-condition-tooltip:popover-open")';
  await tap(shaken);
  await check("touch: condition name opens explanation without toggling", `${tip}?.textContent.includes('Spirit') && !game.user.character.statuses.has('shaken') && !document.querySelector('[data-profile-condition="shaken"]').checked`);
  await tap(shaken);
  await check("touch: retapping a condition name dismisses explanation", `!${tip}`);
  await tap(shaken); await tap(berserk);
  await check("touch: another condition name switches explanation", `${tip}?.textContent.includes('Toughness') && document.querySelectorAll('.mc-profile-condition-tooltip:popover-open').length===1 && !${tip}.querySelector('h3')`);
  await check("touch: explanation stays within viewport", `(() => {const r=${tip}.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;})()`);
  if (await evaluate(`${tip}.scrollHeight > ${tip}.clientHeight + 1`)) {
    const point = await evaluate(`(() => {const r=${tip}.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height*.8};})()`);
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    for (let step = 1; step <= 8; step++) await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x, y: point.y - step * 10 }] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await settle();
    await check("touch: long explanation scrolls while staying open", `${tip}?.scrollTop > 0`);
    await evaluate(`(async()=>{let last=-1,stable=0;for(let i=0;i<30&&stable<3;i++){await new Promise(r=>setTimeout(r,50));const value=${tip}.scrollTop;stable=value===last?stable+1:0;last=value;}})()`);
  }
  await evaluate(`(() => {const r=${tip}.getBoundingClientRect();const point=[{x:44,y:32},{x:innerWidth-44,y:32},{x:44,y:innerHeight-32},{x:innerWidth-44,y:innerHeight-32}].find(p=>p.x<r.left-12||p.x>r.right+12||p.y<r.top-24||p.y>r.bottom+24);if(!point)throw Error('No outside touch point');const b=document.createElement('button');b.id='swade-outside-touch';b.style.cssText='position:fixed;z-index:2147483647;width:64px;height:44px';b.style.left=(point.x-32)+'px';b.style.top=(point.y-22)+'px';b.textContent='Outside';b.onclick=()=>b.dataset.tapped='true';document.querySelector('main').append(b);})()`);
  await tap('#swade-outside-touch');
  await check("touch: outside tap dismisses and activates the outside control", `!${tip} && document.querySelector('#swade-outside-touch').dataset.tapped==='true'`);
  await evaluate("document.querySelector('#swade-outside-touch').remove()");
  await tap(shaken);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await settle();
  await check("touch: Escape dismisses the condition explanation", `!${tip}`);
  await tap('[data-profile-condition="shaken"]');
  await check("touch: checkbox still applies the native condition", `game.user.character.statuses.has('shaken') && document.querySelector('[data-profile-condition="shaken"]').checked`);
  await tap(shaken);
  await check("touch: reading an active condition preserves its checked state", `${tip} && game.user.character.statuses.has('shaken') && document.querySelector('[data-profile-condition="shaken"]').checked`);
}
