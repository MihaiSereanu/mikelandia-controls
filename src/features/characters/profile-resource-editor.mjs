import { node, icon } from "../../ui/dom.mjs";
import { localizedText } from "../../ui/localized-text.mjs";
import { ACTOR_COMMANDS } from "../../kernel/command-names.mjs";

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
    return node("div", { className: "ve-profile-resource-editor ve-profile-boolean", dataset: { profileResource: row.edit.id },
      children: [node("label", { className: "ve-profile-boolean-target", children: [input] })] });
  }
  const text = (key, fallback) => localizedText(commands.localize, `VEMOBILE.Panels.${key}`, fallback);
  const quantity = row.edit.id.startsWith("quantity:");
  const coin = row.edit.id.startsWith("coin-");
  const stepped = quantity || coin;
  const body = node("div");
  const open = node("button", { className: "ve-profile-resource-open", children: stepped ? [String(row.value)] : [icon("fa-pen")],
    attrs: { type: "button", "aria-label": `${quantity ? text("EditQuantity", "Edit quantity") : text("Edit", "Edit")}: ${row.label}`, "data-profile-edit": row.edit.id },
    on: { click: () => {
      if (scope.disposed || open.disabled) return;
      open.hidden = true;
      open.parentElement.classList.add("is-editing");
      const input = node("input", { attrs: { type: row.edit.kind === "boolean" ? "checkbox" : "text",
        "aria-label": row.label, "data-profile-resource-input": row.edit.id,
        ...(row.edit.kind === "integer" ? { min: row.edit.min, max: row.edit.max, pattern: "[0-9]*", required: true, inputmode: "numeric", value: row.value } : {}) } });
      let validate = () => {};
      if (row.edit.kind === "boolean") input.checked = row.value;
      else {
        validate = () => {
          const value = Number(input.value);
          const valid = /^\d+$/u.test(input.value) && Number.isSafeInteger(value)
            && value >= row.edit.min && (row.edit.max === undefined || value <= row.edit.max);
          input.setCustomValidity(valid ? "" : text("InvalidResourceValue", "Enter a valid value within this resource's limits."));
        };
        scope.listen(input, "input", validate);
        validate();
      }
      const close = () => { open.parentElement.classList.remove("is-editing"); body.replaceChildren(); open.hidden = false; open.focus(); };
      const save = node("button", { text: text("Save", "Save"), attrs: { type: "submit", "data-profile-resource-save": true } });
      const cancel = node("button", { text: text("Cancel", "Cancel"), attrs: { type: "button", "data-profile-resource-cancel": true }, on: { click: close } }, scope);
      const form = node("form", { className: "ve-profile-resource-form", children: [input,
        node("div", { className: "ve-profile-resource-buttons", children: [save, cancel] })], on: { submit: async event => {
        event.preventDefault();
        if (scope.disposed || save.disabled) return;
        validate();
        if (!form.reportValidity()) return;
        save.disabled = cancel.disabled = input.disabled = true;
        form.setAttribute("aria-busy", "true");
        try {
          await commands.execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, { actorSourceUuid: actor.sourceUuid,
            resourceId: row.edit.id, resourceRevision: row.edit.revision, expectedValue: row.value,
            value: row.edit.kind === "boolean" ? input.checked : Number(input.value) });
          if (!scope.disposed) close();
        } catch (error) {
          if (!scope.disposed) commands.reportCharacterMutationError?.(error);
        } finally {
          if (!scope.disposed) { save.disabled = cancel.disabled = input.disabled = false; form.setAttribute("aria-busy", "false"); }
        }
      } } }, scope);
      body.replaceChildren(form);
      input.focus();
      if (row.edit.kind === "integer") input.select();
    } } }, scope);
  const adjust = delta => node("button", { text: delta < 0 ? "\u2212" : "+", attrs: {
    type: "button", "aria-label": `${delta < 0 ? text("Decrease", "Decrease") : text("Increase", "Increase")}: ${row.label}`,
    disabled: delta < 0 ? row.value <= row.edit.min : row.value >= row.edit.max, "data-profile-quantity-delta": delta
  }, on: { click: async event => {
    const button = event.currentTarget, controls = button.closest(".ve-profile-resource-editor").querySelectorAll("button");
    if (button.disabled || scope.disposed) return;
    const previous = new Map([...controls].map(control => [control, control.disabled]));
    for (const control of controls) control.disabled = true;
    try { await commands.execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, { actorSourceUuid: actor.sourceUuid,
      resourceId: row.edit.id, resourceRevision: row.edit.revision, expectedValue: row.value, value: row.value + delta }); }
    catch (error) { if (!scope.disposed) commands.reportCharacterMutationError?.(error); }
    finally { if (!scope.disposed) for (const [control, disabled] of previous) control.disabled = disabled; }
  } } }, scope);
  return node("div", { className: `ve-profile-resource-editor${quantity ? " ve-profile-quantity" : coin ? " ve-profile-coin" : ""}`, dataset: { profileResource: row.edit.id },
    children: coin ? [open, node("div", { className: "ve-profile-coin-controls", children: [adjust(-1), adjust(1)] }), body]
      : quantity ? [adjust(-1), open, adjust(1), body] : [open, body] });
}
