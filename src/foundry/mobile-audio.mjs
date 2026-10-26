/** Mute this browser session while mobile presentation owns it. */
export function enableMobileAudio(scope, { getGame = () => globalThis.game, document = globalThis.document,
  MutationObserverType = globalThis.MutationObserver } = {}) {
  const audio = getGame()?.audio;
  const previousMute = audio?.globalMute;
  const media = new Map();
  const muteNative = () => {
    if (!scope.disposed && audio && getGame()?.audio === audio && typeof previousMute === "boolean") audio.globalMute = true;
  };
  const muteMedia = () => {
    if (scope.disposed) return;
    for (const element of document?.querySelectorAll?.("audio, video") ?? []) {
      if (!media.has(element)) { media.set(element, element.muted); element.muted = true; }
    }
  };
  muteNative();
  // Foundry creates its three audio contexts on the first gesture. Apply again
  // after creation, since context initialization reads the original volumes.
  if (audio?.unlock?.then) void audio.unlock.then(muteNative).catch(() => {});
  muteMedia();
  const observer = document?.body && MutationObserverType ? new MutationObserverType(muteMedia) : null;
  observer?.observe(document.body, { childList: true, subtree: true });
  scope.own(() => {
    observer?.disconnect();
    if (audio && getGame()?.audio === audio && typeof previousMute === "boolean" && audio.globalMute === true) audio.globalMute = previousMute;
    for (const [element, muted] of media) if (element.muted === true) element.muted = muted;
    media.clear();
  });
}
