import { createFoundryClient, foundryRoutes } from "./foundry-client.mjs";
import { mountLogin } from "./login.mjs";

try {
  const routes = foundryRoutes(location.href);
  document.getElementById("standard-login").href = routes.join;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = routes["scripts/socket.io.min.js"];
    const timer = setTimeout(
      () =>
        reject(
          new Error("Foundry is taking too long to respond. Please try again."),
        ),
      12000,
    );
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Cannot load Foundry. Please try again shortly."));
    };
    document.head.append(script);
  });
  let storage;
  try {
    storage = localStorage;
  } catch {
    /* Private browsing can disable storage. */
  }
  const app = mountLogin({
    document,
    routes,
    storage,
    client: createFoundryClient({ routes }),
    navigate: (url) => location.assign(url),
  });
  addEventListener("pagehide", () => app.dispose(), { once: true });
  addEventListener("pageshow", (event) => {
    if (event.persisted) location.reload();
  });
} catch (failure) {
  document.getElementById("status").textContent = "Foundry is unavailable";
  const error = document.getElementById("error");
  error.textContent = failure.message;
  error.hidden = false;
  document.getElementById("standard-login").hidden = false;
  const retry = document.getElementById("retry");
  retry.hidden = false;
  retry.addEventListener("click", () => location.reload());
}
