// Installation stays independent of Foundry availability and authentication.
export function installPlatform(navigator) {
  const agent = navigator.userAgent ?? "";
  if (/iPad|iPhone|iPod/i.test(agent) ||
      (/Mac/i.test(navigator.platform ?? "") && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(agent)) return "android";
  return "other";
}

export function mountInstall({ window, document, navigator }) {
  const panel = document.getElementById("app-install");
  const button = document.getElementById("install-app");
  const display = window.matchMedia("(display-mode: standalone)");
  const platform = installPlatform(navigator);
  for (const instructions of panel.querySelectorAll("[data-install-platform]")) {
    instructions.hidden = instructions.dataset.installPlatform !== platform;
  }
  let pending;
  let installed = false;
  const update = () => {
    panel.hidden = installed || display.matches || navigator.standalone === true;
    button.hidden = panel.hidden || !pending;
  };
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pending = event;
    update();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    pending = undefined;
    update();
  });
  display.addEventListener("change", update);
  button.addEventListener("click", async () => {
    const prompt = pending;
    if (!prompt) return;
    pending = undefined;
    button.disabled = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // The browser-menu instructions remain available if the prompt fails.
    } finally {
      button.disabled = false;
      update();
    }
  });
  update();
}

if (typeof window !== "undefined" && document.getElementById("app-install")) mountInstall({ window, document, navigator });
