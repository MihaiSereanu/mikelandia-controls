/**
 * Plain, informational session status. Remote performance metrics are absent
 * because Foundry v13 does not expose them; no telemetry is added to obtain them.
 */
export function createFoundrySessionStatusGateway({
  getGame = () => globalThis.game
} = {}) {

  const snapshot = () => {
    const game = getGame();
    const currentId = String(game?.user?.id ?? game?.userId ?? "");
    const users = [...(game?.users ?? [])]
      .filter((user) => user?.active)
      .map((user) => Object.freeze({
        id: String(user.id ?? ""),
        name: String(user.name ?? "Player"),
        color: userColor(user),
        isSelf: String(user.id ?? "") === currentId,
        isGM: Boolean(user.isGM)
      }))
      .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || Number(b.isGM) - Number(a.isGM) || a.name.localeCompare(b.name));
    return Object.freeze({ users: Object.freeze(users) });
  };

  return Object.freeze({
    snapshot,
    watch(scope, onUpdate) {
      let last = "";
      const publish = () => {
        const next = snapshot();
        const signature = JSON.stringify(next);
        if (signature === last) return;
        last = signature;
        onUpdate(next);
      };
      publish();
      scope.hook?.("userConnected", publish);
      scope.hook?.("updateUser", publish);
      scope.hook?.("deleteUser", publish);
      return snapshot();
    }
  });
}

function userColor(user) {
  const value = user?.color?.css ?? user?.color;
  return /^#[0-9a-f]{3,8}$/iu.test(String(value ?? "")) ? String(value) : "#888888";
}
