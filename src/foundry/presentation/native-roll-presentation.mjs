import { localizeFoundry } from "../settings/localization.mjs";

/** Presentation-only labels: retain native elements, actions and localized names. */
export function decorateNativeRollDialog(element) {
  const restorers = [];
  if (!element?.matches?.(".warhammer.roll-dialog-v2")) return () => {};
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
