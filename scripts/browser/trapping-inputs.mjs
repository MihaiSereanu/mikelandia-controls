/** Trusted taps and typed text verify replacement rather than appending to defaults. */
export async function checkTrappingInputs(send, checks) {
  const evaluate = async expression => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  for (const id of ["quantity", "encumbrance", "gc", "ss", "bp"]) {
    const selector = `[data-profile-trapping-field="${id}"]`;
    const element = `document.querySelector(${JSON.stringify(selector)})`;
    for (const value of ["7", "9"]) {
      const point = await evaluate(`(() => {
        const e = ${element}; e.scrollIntoView({block: "center", behavior: "instant"});
        const r = e.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2};
      })()`);
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await evaluate("new Promise(resolve => setTimeout(resolve, 80))");
      await send("Input.insertText", { text: value });
      if (!await evaluate(`${element}.value === ${JSON.stringify(value)}`)) throw new Error(`${id}: typing after a tap did not replace the entire value`);
    }
    checks.push(`Trapping ${id}: trusted tap and retap select the whole value for replacement`);
    await evaluate(`${element}.value = ${JSON.stringify(id === "quantity" ? "1" : "0")}; ${element}.dispatchEvent(new Event("input", {bubbles:true}));`);
  }
  await evaluate(`document.querySelector('.mc-profile-custom-item').closest('section').scrollIntoView({block: 'start'}); document.querySelector('.mc-profile-custom-item input').focus({preventScroll:true});`);
}
