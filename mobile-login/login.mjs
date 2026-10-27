import { backgroundUrl } from "./foundry-client.mjs";

export function mountLogin({
  document,
  client,
  routes,
  storage,
  navigate,
  refreshMs = 20000,
}) {
  const element = (id) => document.getElementById(id);
  const form = element("login-form"),
    player = element("player"),
    password = element("password");
  const join = element("join"),
    retry = element("retry"),
    status = element("status"),
    error = element("error");
  let worldId,
    users = [],
    busy = false,
    loading = false,
    closed = false;
  const read = (key) => {
    try {
      return storage?.getItem(key);
    } catch {
      return null;
    }
  };
  const remember = () => {
    if (worldId && player.value) {
      try {
        storage?.setItem(`mikelandia.login.${worldId}`, player.value);
      } catch {}
    }
  };
  const showError = (message) => {
    error.textContent = message;
    error.hidden = !message;
  };
  const updateButton = () => {
    join.disabled =
      busy || !users.some((user) => user.id === player.value && !user.active);
  };
  element("standard-login").href = routes.join;

  async function refresh() {
    if (closed || loading || busy) return;
    loading = true;
    retry.disabled = true;
    try {
      const data = await client.getJoinData();
      if (closed || busy) return;
      const nextWorld = data.world?.id ?? data.world?._id;
      const changedWorld = nextWorld !== worldId;
      const selected = changedWorld ? "" : player.value;
      worldId = nextWorld;
      form.hidden = !worldId;
      retry.hidden = Boolean(worldId);
      showError("");
      const title = worldId
        ? data.world.title || "Join your game"
        : "No world running";
      element("world-title").textContent = title;
      document.title = `${title} · Mikelandia`;
      const background = backgroundUrl(data.world?.background, routes);
      if (background)
        document.body.style.setProperty(
          "--world-background",
          `url(${JSON.stringify(background)})`,
        );
      else document.body.style.removeProperty("--world-background");
      if (changedWorld) password.value = "";
      if (!worldId) {
        users = [];
        status.textContent =
          "Your host hasn't opened a world yet. This page will check again automatically.";
        updateButton();
        return;
      }
      const active = new Set(data.activeUsers ?? []);
      users = (data.users ?? []).map((user) => ({
        id: user._id ?? user.id,
        name: user.name ?? "Player",
        active: active.has(user._id ?? user.id),
      }));
      player.replaceChildren(
        new Option("Choose your player", ""),
        ...users.map((user) => {
          const option = new Option(
            `${user.name}${user.active ? " — already connected" : ""}`,
            user.id,
          );
          option.disabled = user.active;
          return option;
        }),
      );
      const preferred =
        selected || read(`mikelandia.login.${worldId}`) || data.userId;
      player.value = users.some((user) => user.id === preferred && !user.active)
        ? preferred
        : "";
      status.textContent = users.some((user) => !user.active)
        ? "Choose your player to join the table."
        : "All players are connected. Ask your host if you need another account.";
      updateButton();
    } catch (failure) {
      if (closed) return;
      form.hidden = true;
      retry.hidden = false;
      status.textContent = "Foundry is unavailable";
      showError(
        failure.name === "TimeoutError"
          ? "Foundry is taking too long to respond. Please try again."
          : failure.message || "Cannot connect to Foundry. Please try again.",
      );
    } finally {
      loading = false;
      retry.disabled = false;
    }
  }
  function onPlayer() {
    password.value = "";
    remember();
    showError("");
    updateButton();
  }
  async function onSubmit(event) {
    event.preventDefault();
    if (
      closed ||
      busy ||
      !users.some((user) => user.id === player.value && !user.active)
    )
      return;
    busy = true;
    const userId = player.value,
      secret = password.value;
    password.value = "";
    player.disabled = password.disabled = true;
    join.textContent = "Joining…";
    showError("");
    updateButton();
    remember();
    try {
      const destination = await client.join(userId, secret);
      if (!closed) {
        dispose();
        navigate(destination);
      }
    } catch (failure) {
      if (closed) return;
      showError(
        failure.name === "TimeoutError"
          ? "The login request timed out. Check the standard login before trying again."
          : failure.message || "Could not join. Please try again.",
      );
      busy = false;
      player.disabled = password.disabled = false;
      join.textContent = "Join game →";
      updateButton();
      password.focus();
    }
  }
  form.addEventListener("submit", onSubmit);
  player.addEventListener("change", onPlayer);
  retry.addEventListener("click", refresh);
  const timer = setInterval(refresh, refreshMs);
  function dispose() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    password.value = "";
    form.removeEventListener("submit", onSubmit);
    player.removeEventListener("change", onPlayer);
    retry.removeEventListener("click", refresh);
    client.close();
  }
  const ready = refresh();
  return { ready, refresh, dispose };
}
