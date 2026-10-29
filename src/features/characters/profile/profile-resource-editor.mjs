import { node, icon, vectorIcon } from "../../../ui/primitives/dom.mjs";
import { localizedText } from "../../../ui/primitives/localized-text.mjs";
import { ACTOR_COMMANDS } from "../../../kernel/state/command-names.mjs";

// Page-session UI preferences only; actor values and permissions remain authoritative.
const unlockedCounters = new Set();

/** Capability data supplies input constraints; the adapter validates every save. */
export function renderProfileResourceEditor(row, actor, commands, scope) {
  if (row.edit.kind === "boolean" && row.editControl === "checkbox") {
    const input = node("input", { attrs: { type: "checkbox", "aria-label": row.label,
      "data-profile-resource-input": row.edit.id }, on: { change: async () => {
      if (scope.disposed || input.disabled) return;
      input.disabled = true;
      input.setAttribute("aria-busy", "true");
      try {
        await commands.execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, { actorSourceUuid: actor.sourceUuid,
          resourceId: row.edit.id, resourceRevision: row.edit.revision, expectedValue: row.value, value: input.checked });
      } catch (error) {
        if (!scope.disposed) commands.reportCharacterMutationError?.(error);
      } finally {
        // Successful writes refresh the profile; a retained control still has its original value.
        if (!scope.disposed) { input.checked = row.value; input.disabled = false; input.setAttribute("aria-busy", "false"); }
      }
    } } }, scope);
    input.checked = row.value;
    return node("div", { className: "mc-profile-resource-editor mc-profile-boolean", dataset: { profileResource: row.edit.id },
      children: [node("label", { className: "mc-profile-boolean-target", children: [input] })] });
  }
  const text = (key, fallback) => localizedText(commands.localize, `MIKELANDIA_CONTROLS.Panels.${key}`, fallback);
  const quantity = row.edit.id.startsWith("quantity:");
  const coin = row.edit.id.startsWith("coin-");
  const counter = row.editControl === "counter";
  const booleanCounter = counter && row.edit.kind === "boolean";
  const numeric = row.edit.kind === "integer" || booleanCounter;
  const value = booleanCounter ? Number(row.value) : row.value;
  const min = booleanCounter ? 0 : row.edit.min;
  const max = booleanCounter ? 1 : row.edit.max ?? Number.MAX_SAFE_INTEGER;
  const key = JSON.stringify([actor.sourceUuid, row.edit.id]);
  let unlocked = counter && unlockedCounters.has(key);
  const stepped = quantity || coin || counter;
  const body = node("div");
  const open = node("button", { className: "mc-profile-resource-open", children: stepped ? [counter && row.max !== undefined ? `${value} / ${row.max}` : String(value)] : [icon("fa-pen")],
    attrs: { type: "button", "aria-label": `${quantity ? text("EditQuantity", "Edit quantity") : text("Edit", "Edit")}: ${row.label}`, "data-profile-edit": row.edit.id },
    on: { click: () => {
      if (scope.disposed || open.disabled) return;
      open.hidden = true;
      open.parentElement.classList.add("is-editing");
      const input = node("input", { attrs: { type: numeric ? "text" : "checkbox",
        "aria-label": row.label, "data-profile-resource-input": row.edit.id,
        ...(numeric ? { min, max: booleanCounter ? 1 : row.edit.max, pattern: "[0-9]*", required: true, inputmode: "numeric", value } : {}) } });
      let validate = () => {};
      if (!numeric) input.checked = row.value;
      else {
        validate = () => {
          const value = Number(input.value);
          const valid = /^\d+$/u.test(input.value) && Number.isSafeInteger(value)
            && value >= min && value <= max;
          input.setCustomValidity(valid ? "" : text("InvalidResourceValue", "Enter a valid value within this resource's limits."));
        };
        scope.listen(input, "input", validate);
        validate();
      }
      const close = () => { open.parentElement.classList.remove("is-editing"); body.replaceChildren(); open.hidden = false; open.focus(); };
      const save = node("button", { text: text("Save", "Save"), attrs: { type: "submit", "data-profile-resource-save": true } });
      const cancel = node("button", { text: text("Cancel", "Cancel"), attrs: { type: "button", "data-profile-resource-cancel": true }, on: { click: close } }, scope);
      const form = node("form", { className: "mc-profile-resource-form", children: [input,
        node("div", { className: "mc-profile-resource-buttons", children: [save, cancel] })], on: { submit: async event => {
        event.preventDefault();
        if (scope.disposed || save.disabled) return;
        validate();
        if (!form.reportValidity()) return;
        save.disabled = cancel.disabled = input.disabled = true;
        const lock = open.closest(".mc-profile-row")?.querySelector("[data-profile-counter-lock]");
        if (lock) lock.disabled = true;
        form.setAttribute("aria-busy", "true");
        try {
          await commands.execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, { actorSourceUuid: actor.sourceUuid,
            resourceId: row.edit.id, resourceRevision: row.edit.revision, expectedValue: row.value,
            value: booleanCounter ? Boolean(Number(input.value)) : row.edit.kind === "boolean" ? input.checked : Number(input.value) });
          if (!scope.disposed) close();
        } catch (error) {
          if (!scope.disposed) commands.reportCharacterMutationError?.(error);
        } finally {
          if (!scope.disposed) { save.disabled = cancel.disabled = input.disabled = false; if (lock) lock.disabled = false; form.setAttribute("aria-busy", "false"); }
        }
      } } }, scope);
      body.replaceChildren(form);
      input.focus();
      if (numeric) input.select();
    } } }, scope);
  const adjust = delta => node("button", { text: delta < 0 ? "\u2212" : "+", attrs: {
    type: "button", "aria-label": `${delta < 0 ? text("Decrease", "Decrease") : text("Increase", "Increase")}: ${row.label}`,
    disabled: (counter && !unlocked) || (delta < 0 ? value <= min : value >= max),
    [counter ? "data-profile-counter-delta" : "data-profile-quantity-delta"]: delta
  }, on: { click: async event => {
    const button = event.currentTarget, editor = button.closest(".mc-profile-resource-editor");
    const lock = button.closest(".mc-profile-row")?.querySelector("[data-profile-counter-lock]");
    const controls = [...new Set([...editor.querySelectorAll("button"), ...(lock ? [lock] : [])])];
    if (button.disabled || scope.disposed) return;
    const previous = new Map([...controls].map(control => [control, control.disabled]));
    for (const control of controls) control.disabled = true;
    try { await commands.execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, { actorSourceUuid: actor.sourceUuid,
      resourceId: row.edit.id, resourceRevision: row.edit.revision, expectedValue: row.value,
      value: booleanCounter ? Boolean(value + delta) : value + delta }); }
    catch (error) { if (!scope.disposed) commands.reportCharacterMutationError?.(error); }
    finally { if (!scope.disposed) for (const [control, disabled] of previous) control.disabled = disabled; }
  } } }, scope);
  if (counter) {
    const minus = adjust(-1), plus = adjust(1);
    const lock = node("button", { className: "mc-profile-counter-lock", attrs: { type: "button", "data-profile-counter-lock": row.edit.id },
      on: { click: () => {
        if (scope.disposed || lock.disabled) return;
        unlocked = !unlocked;
        if (unlocked) unlockedCounters.add(key); else unlockedCounters.delete(key);
        body.replaceChildren();
        root.classList.remove("is-editing");
        open.hidden = false;
        refreshLock();
      } } }, scope);
    const root = node("div", { className: "mc-profile-resource-editor mc-profile-counter", dataset: { profileResource: row.edit.id },
      children: [lock, minus, open, plus, body] });
    const refreshLock = () => {
      lock.replaceChildren(vectorIcon("0 0 24 24", [
        { tag: "path", attrs: { d: unlocked ? "M12 10V6a4 4 0 0 1 8 0v2" : "M8 10V7a4 4 0 0 1 8 0v3", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" } },
        { tag: "rect", attrs: { x: 5, y: 10, width: 14, height: 11, rx: 2, fill: "none", stroke: "currentColor", "stroke-width": 2 } },
        { tag: "circle", attrs: { cx: 12, cy: 15, r: 1.5, fill: "currentColor" } }
      ]));
      const label = `${unlocked ? text("LockCounter", "Lock counter") : text("UnlockCounter", "Unlock counter")}: ${row.label}`;
      lock.setAttribute("aria-label", label);
      lock.setAttribute("title", label);
      lock.setAttribute("aria-pressed", String(!unlocked));
      open.disabled = !unlocked;
      minus.disabled = !unlocked || value <= min;
      plus.disabled = !unlocked || value >= max;
    };
    refreshLock();
    return root;
  }
  return node("div", { className: `mc-profile-resource-editor${quantity ? " mc-profile-quantity" : coin ? " mc-profile-coin" : ""}`, dataset: { profileResource: row.edit.id },
    children: coin ? [open, node("div", { className: "mc-profile-coin-controls", children: [adjust(-1), adjust(1)] }), body]
      : quantity ? [adjust(-1), open, adjust(1), body] : [open, body] });
}
