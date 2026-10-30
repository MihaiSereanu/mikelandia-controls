import { node } from "../primitives/dom.mjs";
import { localizedText, localizedNumber } from "../primitives/localized-text.mjs";

export const DAMAGE_FEEDBACK_MS = 2000;

export function createDamageFeedback({ root, scope, localize, locale = () => "en" }) {
  let effect = null, persistentMist = false;
  const clear = () => {
    effect?.dispose();
    effect = null;
    persistentMist = false;
    root.classList.remove("mc-damage-shaking");
  };
  scope.own(clear);
  return Object.freeze({
    clear,
    show({ amount, noun, down = false }) {
      if (scope.disposed || !Number.isFinite(amount) || amount <= 0) return;
      const persistent = down || persistentMist;
      clear();
      persistentMist = persistent;
      effect = scope.child("damage-feedback");
      const owner = effect;
      const noticeScope = owner.child("notification");
      let notice;
      const dismiss = () => {
        if (!persistent) { clear(); return; }
        noticeScope.dispose();
        notice?.remove();
        root.classList.remove("mc-damage-shaking");
      };
      const wound = amount === 1;
      const message = localizedText(localize, `MIKELANDIA_CONTROLS.Damage.${noun === "wounds" ? (wound ? "Wound" : "Wounds") : "Damage"}`,
        noun === "wounds" ? (wound ? "You took {amount} wound" : "You took {amount} wounds") : "You took {amount} damage", { amount: localizedNumber(amount, locale()) });
      notice = node("div", { className: "mc-damage-notice", children: [
          node("span", { attrs: { role: "status", "aria-live": "polite", "aria-atomic": "true" }, children: [
            node("span", { text: message }),
            down ? node("strong", { className: "mc-damage-down", text: localizedText(localize, "MIKELANDIA_CONTROLS.Damage.Down", "You’re down!") }) : null
          ] }),
          node("button", { className: "mc-damage-dismiss", text: "×", attrs: {
            type: "button", "aria-label": localizedText(localize, "MIKELANDIA_CONTROLS.Damage.Dismiss", "Dismiss damage notification")
          }, on: { click: event => { event.preventDefault(); event.stopPropagation(); dismiss(); } } }, noticeScope)
        ] });
      const layer = node("div", { className: `mc-damage-layer${persistent ? " is-down" : ""}`, children: [
        node("div", { className: "mc-damage-mist", attrs: { "aria-hidden": "true" } }), notice
      ] });
      root.append(layer);
      // Restart the impact when several hits arrive before the previous fade ends.
      void root.offsetWidth;
      root.classList.add("mc-damage-shaking");
      owner.own(() => layer.remove());
      owner.timeout(() => root.classList.remove("mc-damage-shaking"), 400);
      noticeScope.listen(root.ownerDocument, "keydown", event => { if (event.key === "Escape") dismiss(); });
      noticeScope.timeout(dismiss, DAMAGE_FEEDBACK_MS);
    }
  });
}
