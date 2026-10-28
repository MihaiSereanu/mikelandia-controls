import { localizedText } from "../primitives/localized-text.mjs";
import { icon, node } from "../primitives/dom.mjs";

/** Render Mikelandia Controls's shared, incrementally updated native action-session surface. */
export function renderActionSessionModal(session, commands, scope) {
  if (!session) return null;
  const compact = session.compact === true;
  const messageHost = node("div", {
    className: "mc-action-session-messages",
    attrs: { role: "log", "aria-live": "polite", "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.ActionSessionModal.ActionMessages", "{label} action messages", { label: (session.label) }) },
    children: [node("p", { className: "mc-action-session-loading", text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.ActionSessionModal.LoadingAction", "Loading action…") })]
  });
  const close = () => commands.dismissActionSession();
  const closeButton = (label, className, contents) => node("button", {
    className,
    attrs: { type: "button", "aria-label": label },
    on: { click: close },
    children: contents
  }, scope);
  const modal = node("div", {
    className: `mc-action-session-layer${compact ? " is-compact" : ""}`,
    attrs: { role: "presentation" },
    ...(compact ? { dataset: { visible: "false" } } : {}),
    children: [node("section", {
      className: `mc-action-session${compact ? " is-compact" : ""}`,
      attrs: { role: "dialog", ...(compact ? {} : { "aria-modal": "true" }), "aria-labelledby": "mc-action-session-title" },
      children: [
        node("header", { children: [
          ...(compact ? [] : [session.img ? node("img", { attrs: { src: session.img, alt: "" } }) : icon("fa-wand-magic-sparkles")]),
          node("div", { children: [...(compact ? [] : [node("small", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.ActionSessionModal.CurrentAction", "Current action") })]), node("h2", { text: session.label, attrs: { id: "mc-action-session-title" } })] }),
          closeButton(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Action.Close", "Close action"), "mc-action-session-close", [icon("fa-xmark")])
        ] }),
        messageHost,
        ...(compact ? [] : [node("footer", { children: [closeButton(localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.ActionSessionModal.Done", "Done"), "mc-action-session-done", [node("span", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.ActionSessionModal.Done", "Done") }), icon("fa-check")])] })])
      ]
    })]
  });
  queueMicrotask(() => {
    if (scope.disposed) return;
    Promise.resolve(commands.mountActionSession(messageHost, session, scope, compact ? {
      onCompactVisibility: (visible) => { if (!scope.disposed) modal.dataset.visible = String(visible); }
    } : {})).then((result) => {
      if (scope.disposed || result?.ok !== false) return;
      messageHost.replaceChildren(node("p", { className: "mc-action-session-unavailable", text: result.reason ?? localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.ActionSessionGateway.ThatActionMessageIsUnavailable", "That action message is unavailable.") }));
    }).catch((error) => {
      if (scope.disposed) return;
      console.error("Mikelandia Controls | Could not mount action session", error);
      messageHost.replaceChildren(node("p", { className: "mc-action-session-unavailable", text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.ActionSessionModal.ThatActionMessageCouldNotBeDisplayed", "That action message could not be displayed.") }));
    });
  });
  return modal;
}
