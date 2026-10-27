/** Client-only audio ownership; every guard is removed when mobile exits. */
export function enableMobileAudio(scope, { getGame = () => globalThis.game, document = globalThis.document,
  getUi = () => globalThis.ui, MutationObserverType = globalThis.MutationObserver,
  MediaType = globalThis.HTMLMediaElement, enabled = true } = {}) {
  let owner;
  const setEnabled = value => {
    owner?.dispose(); owner = null;
    if (!value || scope.disposed) return;
    const active = owner = scope.child("muted-audio");
    const audio = getGame()?.audio;
    const previousMute = audio?.globalMute;
    const media = new Map();
    const guarded = new WeakMap();
    const players = new WeakMap();
    const guard = (object, key, install) => {
      if (!object) return;
      const keys = guarded.get(object) ?? new Set();
      if (keys.has(key)) return;
      keys.add(key); guarded.set(object, keys);
      const original = Object.getOwnPropertyDescriptor(object, key);
      if (original?.configurable === false) return;
      let prototype = object, descriptor;
      while (prototype && !descriptor) { descriptor = Object.getOwnPropertyDescriptor(prototype, key); prototype = Object.getPrototypeOf(prototype); }
      const initial = descriptor?.get ? descriptor.get.call(object) : object[key];
      const replacement = install(initial, descriptor);
      Object.defineProperty(object, key, { configurable: true, enumerable: original?.enumerable ?? true, ...replacement });
      active.own(() => {
        const installed = Object.getOwnPropertyDescriptor(object, key);
        if (installed?.get !== replacement.get || installed?.value !== replacement.value) return;
        const current = object[key];
        if (original) Object.defineProperty(object, key, "value" in original ? { ...original, value: replacement.get ? current : original.value } : original);
        else { delete object[key]; if (replacement.get && !descriptor?.get && current !== initial) object[key] = current; }
      });
    };
    const muteElement = element => {
      if (!media.has(element)) media.set(element, element.muted);
      guard(element, "muted", (initial, descriptor) => {
        let value = initial;
        return { get: () => descriptor?.get ? descriptor.get.call(element) : value,
          set: () => { value = true; descriptor?.set?.call(element, true); } };
      });
      if (!element.muted) element.muted = true;
    };
    // Runs after guards are removed, including contexts born on first gesture.
    active.own(() => {
      if (audio && typeof previousMute === "boolean" && getGame()?.audio === audio) audio.globalMute = previousMute;
      for (const [element, muted] of media) element.muted = muted;
    });
    const watchPlayer = player => {
      if (!player) return;
      const state = players.get(player) ?? {};
      const capture = () => {
        if (state.muted === undefined) state.muted = player.isMuted?.();
        if (state.volume === undefined) state.volume = player.getVolume?.();
      };
      capture();
      if (!players.has(player)) {
        players.set(player, state);
        active.own(() => { if (state.volume !== undefined) player.setVolume?.(state.volume); if (state.muted === false) player.unMute?.(); });
      }
      const ensureMuted = () => {
        if (state.muteCommanded || typeof player.mute !== "function") return;
        // The iframe can report its old state until the command round trip
        // finishes. Remember the command before sending it so later volume
        // hooks do not issue more mute commands while that reply is pending.
        state.muteCommanded = true;
        if (player.isMuted?.() !== true) player.mute();
      };
      for (const key of ["playVideo", "unMute", "setVolume"]) if (typeof player[key] === "function") {
        guard(player, key, original => ({ writable: true, value: function (...args) {
          capture(); ensureMuted();
          return key === "unMute" ? undefined : original.apply(this, key === "setVolume" ? [0] : args);
        } }));
      }
      // YouTube Player Widget suppresses one volume event per setVolume call.
      // Repeating mute alongside it emits extra events which write Foundry's
      // playlist volume and call setVolume again without reaching an idle state.
      ensureMuted();
    };
    const watchVideoApplication = app => {
      if (!app) return;
      // YouTube may add the player API methods only at onReady. The module
      // calls its application's setVolume before playVideo at that point.
      if (typeof app.setVolume === "function") guard(app, "setVolume", original => ({
        writable: true, value: function (...args) { watchPlayer(this.YTPlayer); return original.apply(this, args); }
      }));
      guard(app, "YTPlayer", initial => {
        let player = initial; watchPlayer(player);
        return { get: () => player, set: value => { player = value; watchPlayer(value); } };
      });
    };
    const ui = getUi();
    if (ui) guard(ui, "sidebarVideoPlayer", initial => {
      let app = initial; watchVideoApplication(app);
      return { get: () => app, set: value => { app = value; watchVideoApplication(value); } };
    });
    if (audio && typeof previousMute === "boolean") {
      guard(audio, "globalMute", (initial, descriptor) => {
        let value = initial;
        return { get: () => descriptor?.get ? descriptor.get.call(audio) : value,
          set: () => { value = true; descriptor?.set?.call(audio, true); } };
      });
      const muteContext = context => {
        const gain = context?.gainNode?.gain;
        if (!gain) return;
        // Native sliders write master gain directly, bypassing globalMute.
        guard(gain, "setValueAtTime", original => ({ value: function (_value, time) { return original.call(this, 0, time); }, writable: true }));
        guard(gain, "value", (initial, descriptor) => {
          let value = initial;
          return { get: () => descriptor?.get ? descriptor.get.call(gain) : value,
            set: () => { value = 0; descriptor?.set?.call(gain, 0); } };
        });
        gain.value = 0;
        gain.setValueAtTime(0, context.currentTime);
      };
      for (const key of ["music", "environment", "interface"]) {
        guard(audio, key, initial => {
          let context = initial; muteContext(context);
          return { get: () => context, set: next => { context = next; muteContext(next); } };
        });
      }
      audio.globalMute = true;
    }
    // Detached new Audio() can play before MutationObserver notifications.
    if (MediaType?.prototype?.play) guard(MediaType.prototype, "play", original => ({
      writable: true, value: function (...args) { muteElement(this); return original.apply(this, args); }
    }));
    const muteMedia = () => {
      if (active.disposed) return;
      for (const element of document?.querySelectorAll?.("audio, video") ?? []) muteElement(element);
    };
    muteMedia();
    active.listen(document, "volumechange", muteMedia, true);
    active.listen(document, "play", muteMedia, true);
    const observer = document?.body && MutationObserverType ? new MutationObserverType(muteMedia) : null;
    observer?.observe(document.body, { childList: true, subtree: true });
    active.own(() => observer?.disconnect());
    if (audio?.unlock?.then) void audio.unlock.then(() => { if (!active.disposed) { audio.globalMute = true; muteMedia(); } }).catch(() => {});
  };
  setEnabled(enabled);
  return Object.freeze({ setEnabled });
}
