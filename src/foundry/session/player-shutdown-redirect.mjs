/** Keep players on the mobile portal after an orderly world shutdown. */
export function installPlayerShutdownRedirect(scope, {
  getGame = () => globalThis.game,
  getRoute = path => globalThis.foundry.utils.getRoute(path),
  navigate = url => { window.location.href = url; },
  notify = () => ui.notifications.info("GAME.WorldShuttingDown", { localize: true, permanent: true })
} = {}) {
  const session = getGame();
  if (!session?.user || session.user.isGM) return false;
  const socket = session.socket;
  if (!socket?.listeners || !socket?.on || !socket?.off) return false;
  const nativeShutdown = socket.listeners("shutdown").find(listener => {
    const source = Function.prototype.toString.call(listener);
    return source.includes("GAME.WorldShuttingDown") && /getRoute\(\s*["']\/["']\s*\)/u.test(source);
  });
  if (!nativeShutdown) {
    console.warn("Mikelandia Controls | Foundry shutdown handler was not recognized; shutdown navigation was left unchanged.");
    return false;
  }

  let shuttingDown = false;
  const shutdown = (...args) => {
    if (session.user.isGM) return nativeShutdown(...args);
    if (shuttingDown) return;
    shuttingDown = true;
    notify();
    scope.timeout(() => navigate(`${getRoute("mobile")}/`), 1000);
  };
  // Replace only core's listener so its root redirect cannot race the portal.
  socket.off("shutdown", nativeShutdown);
  socket.on("shutdown", shutdown);
  scope.own(() => {
    socket.off("shutdown", shutdown);
    if (!socket.listeners("shutdown").includes(nativeShutdown)) socket.on("shutdown", nativeShutdown);
  });
  return true;
}
