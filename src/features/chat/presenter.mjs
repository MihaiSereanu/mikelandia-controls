import { localizedText } from "../../ui/localized-text.mjs";
import { icon, node } from "../../ui/dom.mjs";

export function renderChat({ commands, scope }) {
  const host = node("section", {
    className: "mc-native-chat-screen",
    attrs: { "aria-label": localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.GameChat", "Game chat") }
  });
  const result = commands.mountNativeChat(host, scope);
  if (!result.ok) {
    host.append(node("div", {
      className: "mc-empty",
      children: [icon("fa-comments"), node("h2", { text: localizedText(commands.localize, "MIKELANDIA_CONTROLS.Interface.Presenter.ChatIsUnavailable", "Chat is unavailable") }), node("p", { text: result.reason })]
    }));
  }
  return host;
}
