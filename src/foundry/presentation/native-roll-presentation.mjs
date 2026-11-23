import { localizeFoundry } from "../settings/localization.mjs";

const expandedOptions = new WeakMap();
const rollSelector = '#sd-roll-dialog, .warhammer.roll-dialog-v2, .swade.roll-dialog, .honor-intrigue.roll-dialog, .roll-configuration';

/** Adapt only admitted roll forms, retaining native elements and event handlers. */
export function decorateNativeRollDialog(element, application) {
  const restorers = [];
  if (!element?.matches?.(rollSelector)) return () => {};
  element.classList.add("mc-compact-roll");
  restorers.push(() => element.classList.remove("mc-compact-roll"));
  publicRolls(element, application, restorers);
  moreOptions(element, restorers);
  if (element.matches(".warhammer.roll-dialog-v2")) decorateWarhammer(element, restorers);
  return () => { for (const restore of restorers.reverse()) restore(); };
}

function publicRolls(element, application, restorers) {
  const selects = [...element.querySelectorAll('select[name="rollMode"], select[name="messageMode"]')];
  const forcePublic = () => {
    for (const select of selects) {
      const mode = [...select.options].find(option => option.value === "public" || option.value === "publicroll")?.value;
      if (mode) select.value = mode;
    }
    // These are per-dialog native configurations, never the user's core default.
    if (element.matches("#sd-roll-dialog") && application?.config) application.config.rollMode = "publicroll";
    if (element.matches(".warhammer.roll-dialog-v2")) {
      if (application?.fields) application.fields.rollMode = "publicroll";
      if (application?.userEntry) application.userEntry.rollMode = "publicroll";
    }
    if (element.matches(".roll-configuration") && application?.message) application.message.rollMode = selects[0]?.value || "public";
    if (element.matches(".honor-intrigue.roll-dialog") && application?.options?.context) application.options.context.rollMode = "publicroll";
  };
  for (const select of selects) {
    const container = select.closest(".form-group") ?? select;
    container.classList.add("mc-roll-visibility");
    restorers.push(() => container.classList.remove("mc-roll-visibility"));
  }
  for (const buttons of element.querySelectorAll(".roll-mode-buttons")) {
    buttons.classList.add("mc-roll-visibility");
    restorers.push(() => buttons.classList.remove("mc-roll-visibility"));
  }
  // Native change/submit handlers read these controls. Run before their handlers.
  forcePublic();
  for (const type of ["submit", "click", "change"]) {
    element.addEventListener(type, forcePublic, true);
    restorers.push(() => element.removeEventListener(type, forcePublic, true));
  }
}

function moreOptions(element, restorers) {
  let candidates = [];
  if (element.matches(".warhammer.roll-dialog-v2")) {
    candidates = [...element.querySelectorAll('.dialog-modifiers, select[name="hitLocation"]')]
      .map(node => node.matches("select") ? node.closest(".form-group") : node);
  } else if (element.matches("#sd-roll-dialog")) {
    candidates = [...element.querySelectorAll(".situational-options, .roll-input > .tooltips")];
  } else if (element.matches(".swade.roll-dialog")) {
    candidates = [...element.querySelectorAll("fieldset:has(ul.modifiers)")];
  } else if (element.matches(".roll-configuration")) {
    candidates = [...element.querySelectorAll('select[name="ability"], ul.dice')]
      .map(node => node.matches("select") ? node.closest(".form-group") : node);
  }
  candidates = candidates.filter(Boolean);
  if (!candidates.length) return;
  const document = element.ownerDocument;
  const details = document.createElement("details");
  details.className = "mc-roll-more";
  details.open = expandedOptions.get(element) === true;
  const summary = document.createElement("summary");
  details.append(summary);
  const update = () => {
    const active = details.querySelectorAll('.modifier.active:not(.hidden), input[type="checkbox"]:checked').length;
    summary.textContent = localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.MoreOptions", "More options")
      + (active ? ` · ${active} ${active === 1
        ? localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.ActiveModifier", "active modifier")
        : localizeFoundry("MIKELANDIA_CONTROLS.Interface.MobilePresentation.ActiveModifiers", "active modifiers")}` : "");
  };
  const content = element.querySelector(".window-content, .application-content") ?? element;
  const footer = [...content.children].find(node => node.matches("footer, .form-footer, .roll-footer, .dialog-buttons"));
  content.insertBefore(details, footer ?? null);
  for (const node of candidates) {
    const marker = document.createComment("native roll option");
    const slot = document.createElement("div");
    slot.className = "mc-roll-option";
    node.before(marker);
    details.append(slot);
    slot.append(node);
    // A native partial render can replace the moved node. Restore its current
    // replacement, and never resurrect a part whose original parent was removed.
    restorers.push(() => { if (element.contains(marker)) marker.replaceWith(...slot.childNodes); });
  }
  const remember = () => expandedOptions.set(element, details.open);
  details.addEventListener("toggle", remember);
  details.addEventListener("change", update);
  const Observer = document.defaultView.MutationObserver;
  const observer = new Observer(update);
  observer.observe(details, { subtree: true, attributes: true, attributeFilter: ["class", "checked"] });
  update();
  // Restore moved nodes before removing their temporary container.
  restorers.unshift(() => {
    expandedOptions.set(element, details.open);
    observer.disconnect();
    details.removeEventListener("toggle", remember);
    details.removeEventListener("change", update);
    details.remove();
  });
}

function decorateWarhammer(element, restorers) {
  for (const input of element.querySelectorAll('input[name="SL"]')) {
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
}
