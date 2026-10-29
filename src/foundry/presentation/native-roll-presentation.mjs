import { localizeFoundry } from "../settings/localization.mjs";

/** Presentation-only labels: retain native elements, actions and localized names. */
export function decorateNativeRollDialog(element) {
  const restorers = [];
  if (!element?.matches?.(".warhammer.roll-dialog-v2")) return () => {};
  for (const input of element.querySelectorAll('input[name="SL"], input[name="slBonus"]')) {
    if (input.closest(".mc-roll-counter")) continue;
    const wrapper = input.ownerDocument.createElement("div");
    wrapper.className = "mc-roll-counter";
    input.before(wrapper);
    const buttons = [-1, 1].map(delta => {
      const button = input.ownerDocument.createElement("button");
      button.type = "button";
      button.textContent = delta < 0 ? "−" : "+";
      button.setAttribute("aria-label", localizeFoundry(delta < 0
        ? "MIKELANDIA_CONTROLS.Panels.DecreaseSL" : "MIKELANDIA_CONTROLS.Panels.IncreaseSL",
      delta < 0 ? "Decrease SL" : "Increase SL"));
      const change = () => {
        if (input.disabled || input.readOnly) return;
        const value = Number(input.value || 0);
        if (!Number.isSafeInteger(value) || !Number.isSafeInteger(value + delta)) return;
        input.value = String(value + delta);
        input.dispatchEvent(new input.ownerDocument.defaultView.Event("change", { bubbles: true }));
      };
      button.disabled = input.disabled || input.readOnly;
      button.addEventListener("click", change);
      restorers.push(() => button.removeEventListener("click", change));
      return button;
    });
    wrapper.append(buttons[0], input, buttons[1]);
    restorers.push(() => {
      if (input.parentNode === wrapper) wrapper.replaceWith(input);
      else wrapper.remove();
    });
  }
  for (const control of element.querySelectorAll(".state-field[data-type]")) {
    const type = control.dataset.type;
    if (!["advantage", "disadvantage"].includes(type)) continue;
    const label = control.querySelector("label");
    if (!label || label.querySelector(".mc-roll-state-full")) continue;
    const full = label.ownerDocument.createElement("span");
    full.className = "mc-roll-state-full";
    full.append(...label.childNodes);
    const short = label.ownerDocument.createElement("span");
    short.className = "mc-roll-state-short";
    short.setAttribute("aria-hidden", "true");
    short.textContent = type === "advantage"
      ? localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.AdvantageShort", "ADV")
      : localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.DisadvantageShort", "DISADV");
    label.append(full, short);
    restorers.push(() => {
      // Do not overwrite a later native partial render.
      if (full.parentNode === label) full.replaceWith(...full.childNodes);
      short.remove();
    });
  }
  return () => { for (const restore of restorers) restore(); };
}
