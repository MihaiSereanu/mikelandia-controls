// Uses Foundry's existing prelogin session, Socket.IO data, and /join endpoint.
export function foundryRoutes(pageUrl) {
  const page = new URL(pageUrl);
  if (!page.pathname.endsWith("/mobile/"))
    throw new Error("Open this page at the /mobile/ address.");
  const root = new URL("../", page);
  return Object.fromEntries(
    ["join", "game", "socket.io", "scripts/socket.io.min.js"].map((path) => [
      path,
      new URL(path, root).href,
    ]),
  );
}

export function safeRedirect(value, routes) {
  const destination = new URL(value || routes.game, routes.game);
  const game = new URL(routes.game);
  if (
    destination.origin !== game.origin ||
    destination.pathname !== game.pathname
  )
    throw new Error(
      "Unexpected login destination. Use the standard Foundry login.",
    );
  return destination.href;
}

export function backgroundUrl(value, routes) {
  if (!value || typeof value !== "string") return null;
  try {
    const url = new URL(value, new URL("./", routes.game));
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function loginError(text, status) {
  if (text.includes("JOIN.ErrorInvalidPassword"))
    return "That password was not accepted. Please try again.";
  if (text.includes("JOIN.ErrorUser"))
    return "This player cannot join right now. Choose another player or use the standard login.";
  if (status === 401 || status === 403)
    return "Foundry did not accept this login. Check your player and password, or use the standard login.";
  return "Foundry could not complete the login. Try again or use the standard login.";
}

export function createFoundryClient({
  routes,
  fetch: fetcher = globalThis.fetch,
  io = globalThis.io,
  timeoutMs = 12000,
}) {
  let socket;
  let connection;
  let disposed = false;
  const request = (url, options = {}) =>
    fetcher(url, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  async function connect() {
    // Visiting /join establishes the normal Foundry cookie and logs out any prior
    // world user in this browser, exactly like opening Foundry's own login page.
    const response = await request(routes.join);
    if (!response.ok)
      throw new Error("Foundry is unavailable. Please try again shortly.");
    if (disposed) throw new Error("Login page closed.");
    if (typeof io !== "function")
      throw new Error(
        "Could not load Foundry's login connection. Try again or use the standard login.",
      );
    socket = io({
      path: new URL(routes["socket.io"]).pathname,
      transports: ["websocket"],
      upgrade: false,
      reconnection: false,
      autoConnect: false,
      closeOnBeforeunload: true,
    });
    await new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer);
        socket.off("session", onSession);
        socket.off("connect_error", onError);
        if (error) reject(error);
        else resolve();
      };
      const onSession = (session) =>
        finish(
          session?.sessionId
            ? null
            : new Error("Foundry could not start a login session. Try again."),
        );
      const onError = () =>
        finish(
          new Error("Cannot connect to Foundry. Please try again shortly."),
        );
      const timer = setTimeout(onError, timeoutMs);
      socket.on("session", onSession);
      socket.on("connect_error", onError);
      socket.connect();
    });
  }
  return {
    async getJoinData() {
      if (disposed) throw new Error("Login page closed.");
      if (!socket?.connected) {
        if (!connection)
          connection = connect()
            .catch((error) => {
              socket?.disconnect();
              throw error;
            })
            .finally(() => {
              connection = null;
            });
        await connection;
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                "Foundry is taking too long to respond. Please try again.",
              ),
            ),
          timeoutMs,
        );
        socket.emit("getJoinData", (data) => {
          clearTimeout(timer);
          resolve(data ?? {});
        });
      });
    },
    async join(userId, password) {
      const response = await request(routes.join, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", userId, password }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(loginError(text, response.status));
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(
          "Foundry's login response changed. Use the standard login.",
        );
      }
      if (result.status !== "success")
        throw new Error(loginError(text, response.status));
      return safeRedirect(result.redirect, routes);
    },
    close() {
      disposed = true;
      socket?.disconnect();
    },
  };
}
