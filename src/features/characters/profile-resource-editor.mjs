import { node } from "../../ui/dom.mjs";
import { localizedText } from "../../ui/localized-text.mjs";
import { ACTOR_COMMANDS } from "../../kernel/command-names.mjs";

/** Capability data supplies input constraints; the adapter validates every save. */
export function renderProfileResourceEditor(row, actor, commands, scope) {
  const text = (key, fallback) => localizedText(commands.localize, `VEMOBILE.Panels.${key}`, fallback);
  const status = node("p", { className: "ve-profile-action-status", attrs: { role: "status", "aria-live": "polite" } });
  const body = node("div");
  const open = node("button", { className: "ve-profile-resource-open", text: text("Edit", "Edit"),
    attrs: { type: "button", "aria-label": `${text("Edit", "Edit")}: ${row.label}`, "data-profile-edit": row.edit.id },
    on: { click: () => {
      if (scope.disposed || open.disabled) return;
      open.hidden = true;
      status.textContent = "";
      const input = node("input", { attrs: { type: row.edit.kind === "boolean" ? "checkbox" : "number",
        "aria-label": row.label, "data-profile-resource-input": row.edit.id,
        ...(row.edit.kind === "integer" ? { min: row.edit.min, max: row.edit.max, step: 1, required: true, inputmode: "numeric", value: row.value } : {}) } });
      if (row.edit.kind === "boolean") input.checked = row.value;
      const close = () => { body.replaceChildren(); open.hidden = false; open.focus(); };
      const save = node("button", { text: text("Save", "Save"), attrs: { type: "submit", "data-profile-resource-save": true } });
      const cancel = node("button", { text: text("Cancel", "Cancel"), attrs: { type: "button", "data-profile-resource-cancel": true }, on: { click: close } }, scope);
      const form = node("form", { className: "ve-profile-resource-form", children: [input,
        node("div", { className: "ve-profile-resource-buttons", children: [save, cancel] })], on: { submit: async event => {
        event.preventDefault();
        if (scope.disposed || save.disabled || !form.reportValidity()) return;
        save.disabled = cancel.disabled = input.disabled = true;
        form.setAttribute("aria-busy", "true");
        status.textContent = "";
        try {
          const outcome = await commands.execute(ACTOR_COMMANDS.EDIT_PROFILE_RESOURCE, { actorSourceUuid: actor.sourceUuid,
            resourceId: row.edit.id, resourceRevision: row.edit.revision, expectedValue: row.value,
            value: row.edit.kind === "boolean" ? input.checked : input.valueAsNumber });
          if (!scope.disposed) {
            close();
            status.textContent = outcome?.cancelled ? text("Cancelled", "Action cancelled.")
              : outcome?.submitted ? text("UpdateRequested", "Update requested.") : text("Saved", "Saved.");
          }
        } catch (error) {
          if (!scope.disposed) status.textContent = error?.message ?? text("ResourceFailed", "The resource could not be saved.");
        } finally {
          if (!scope.disposed) { save.disabled = cancel.disabled = input.disabled = false; form.setAttribute("aria-busy", "false"); }
        }
      } } }, scope);
      body.replaceChildren(form);
      input.focus();
    } } }, scope);
  return node("div", { className: "ve-profile-resource-editor", dataset: { profileResource: row.edit.id }, children: [open, body, status] });
}
