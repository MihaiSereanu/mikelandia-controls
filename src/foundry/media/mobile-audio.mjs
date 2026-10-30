/** Stop local audio work while the mobile companion owns this client. */
export function enableMobileAudio(scope, { getGame = () => globalThis.game, document = globalThis.document,
  getUi = () => globalThis.ui, MutationObserverType = globalThis.MutationObserver,
  MediaType = globalThis.HTMLMediaElement, SoundType = globalThis.foundry?.audio?.Sound,
  NodeType = globalThis.Node, host = globalThis } = {}) {
  const active = scope.child("disabled-audio");
  const guarded = new WeakMap(), stoppedPlayers = new WeakSet(), suspended = new WeakSet();
  const settle = action => {
    try { Promise.resolve(action()).catch(() => {}); } catch { /* Already detached or closed. */ }
  };
  const guard = (object, key, install) => {
    if (!object) return;
    const keys = guarded.get(object) ?? new Set();
    if (keys.has(key)) return;
    const original = Object.getOwnPropertyDescriptor(object, key);
    if (original?.configurable === false) return;
    let prototype = object, descriptor;
    while (prototype && !descriptor) { descriptor = Object.getOwnPropertyDescriptor(prototype, key); prototype = Object.getPrototypeOf(prototype); }
    const initial = descriptor?.get ? descriptor.get.call(object) : object[key];
    const replacement = install(initial, descriptor);
    Object.defineProperty(object, key, { configurable: true, enumerable: original?.enumerable ?? true, ...replacement });
    keys.add(key); guarded.set(object, keys);
    active.own(() => {
      const installed = Object.getOwnPropertyDescriptor(object, key);
      if (installed?.get !== replacement.get || installed?.value !== replacement.value) return;
      const current = object[key];
      if (original) Object.defineProperty(object, key, "value" in original ? { ...original, value: replacement.get ? current : original.value } : original);
      else { delete object[key]; if (replacement.get && !descriptor?.get && current !== initial) object[key] = current; }
    });
  };
  const blockMethod = (object, key, replacement) => {
    if (typeof object?.[key] === "function") guard(object, key, () => ({ writable: true, value: replacement }));
  };
  // The widget inserts its API script at ready. Stop it before insertion:
  // hiding its UI or stopping a constructed player still loads the iframe.
  const insertBefore = NodeType?.prototype?.insertBefore;
  if (typeof insertBefore === "function") guard(NodeType.prototype, "insertBefore", () => ({
    writable: true,
    value: function (node, reference) {
      if (node?.tagName === "SCRIPT") {
        try {
          const url = new URL(node.src);
          if (["www.youtube.com", "youtube.com"].includes(url.hostname) && url.pathname === "/iframe_api") return node;
        } catch { /* Unrelated or relative script URL. */ }
      }
      return insertBefore.call(this, node, reference);
    }
  }));
  // Also cover an API already present on this page. Keep later callback
  // assignments inert until teardown, without touching other clients.
  const callbackKey = "onYouTubeIframeAPIReady";
  const callbackDescriptor = Object.getOwnPropertyDescriptor(host, callbackKey);
  if (callbackDescriptor?.configurable !== false) {
    let callback = host[callbackKey];
    const blockedCallback = () => {};
    const get = () => blockedCallback;
    Object.defineProperty(host, callbackKey, { configurable: true, get, set: next => { callback = next; } });
    active.own(() => {
      if (Object.getOwnPropertyDescriptor(host, callbackKey)?.get !== get) return;
      if (callbackDescriptor) Object.defineProperty(host, callbackKey,
        "value" in callbackDescriptor ? { ...callbackDescriptor, value: callback } : callbackDescriptor);
      else { delete host[callbackKey]; if (callback !== undefined) host[callbackKey] = callback; }
    });
  }
  const stopSound = sound => {
    if (typeof sound?.stop === "function") settle(() => sound.stop({ fade: 0, delay: 0 }));
  };
  // Protected boundaries catch loads waiting on first gesture and delayed
  // playback which entered native methods before mobile ownership began.
  for (const key of ["load", "play", "playAtPosition"]) blockMethod(SoundType?.prototype, key, async function () { return this; });
  blockMethod(SoundType?.prototype, "_load", async function () {});
  blockMethod(SoundType?.prototype, "_play", function () {});

  const stopContext = context => {
    if (!context || suspended.has(context)) return;
    suspended.add(context);
    blockMethod(context, "resume", async function () {});
    if (typeof context.suspend === "function") settle(() => context.suspend());
  };
  const watchAudio = audio => {
    if (!audio) return;
    for (const key of ["music", "environment", "interface"]) guard(audio, key, initial => {
      let context = initial; stopContext(context);
      return { get: () => context, set: next => { context = next; stopContext(next); } };
    });
    const sounds = new Set(audio.playing?.values?.() ?? []);
    for (const ref of audio.sounds?.values?.() ?? []) {
      const sound = ref?.deref?.() ?? ref;
      if (sound) sounds.add(sound);
    }
    for (const playlist of getGame()?.playlists ?? []) for (const entry of playlist.sounds ?? []) if (entry.sound) sounds.add(entry.sound);
    for (const sound of sounds) stopSound(sound);
  };
  const game = getGame();
  // Native Game#audio is non-configurable and available before init. The
  // fallback accessor also supports deferred construction in test/host shells.
  if (game && Object.getOwnPropertyDescriptor(game, "audio")?.configurable === false) watchAudio(game.audio);
  else if (game) guard(game, "audio", initial => {
    let audio = initial; watchAudio(audio);
    return { get: () => audio, set: next => { audio = next; watchAudio(next); } };
  });

  const stopMedia = element => { if (typeof element?.pause === "function") settle(() => element.pause()); };
  // Includes detached new Audio() instances; callers receive Promise<void>.
  blockMethod(MediaType?.prototype, "play", async function () { stopMedia(this); });
  for (const element of document?.querySelectorAll?.("audio, video") ?? []) stopMedia(element);
  active.listen(document, "play", event => stopMedia(event.target), true);
  const observer = document?.body && MutationObserverType ? new MutationObserverType(records => {
    if (active.disposed) return;
    for (const record of records ?? []) for (const node of record.addedNodes ?? []) {
      if (node.matches?.("audio, video")) stopMedia(node);
      for (const element of node.querySelectorAll?.("audio, video") ?? []) stopMedia(element);
    }
  }) : null;
  observer?.observe(document.body, { childList: true, subtree: true });
  active.own(() => observer?.disconnect());

  const watchPlayer = player => {
    if (!player) return;
    // Volume callbacks cause shared setting writes and playlist rerenders.
    for (const key of ["playVideo", "loadVideoById", "loadVideoByUrl", "unMute", "setVolume"]) blockMethod(player, key, function () {});
    if (!stoppedPlayers.has(player) && (typeof player.stopVideo === "function" || typeof player.pauseVideo === "function")) {
      stoppedPlayers.add(player);
      settle(() => typeof player.stopVideo === "function" ? player.stopVideo() : player.pauseVideo());
    }
  };
  const watchVideoApplication = app => {
    if (!app) return;
    blockMethod(app, "loadVideo", async function () {});
    // Local stop events must not update the widget's shared playback setting.
    for (const key of ["setSyncSetting", "setSyncSettingDebounced"]) blockMethod(app, key, function () {});
    blockMethod(app, "setVolume", function () { watchPlayer(this.YTPlayer); });
    guard(app, "YTPlayer", initial => {
      let player = initial; watchPlayer(player);
      return { get: () => player, set: next => { player = next; watchPlayer(next); } };
    });
  };
  const ui = getUi();
  if (ui) {
    const key = "sidebarVideoPlayer", original = Object.getOwnPropertyDescriptor(ui, key);
    if (original?.configurable !== false) {
      // Shared widget settings still arrive over the socket. Its native
      // onChange callbacks expect this interface even without a widget.
      const dormant = { loadVideo: async () => {}, renderPlaylists() {}, syncTime() {} };
      let app = ui[key]; watchVideoApplication(app);
      const get = () => app ?? dormant;
      Object.defineProperty(ui, key, { configurable: true, get,
        set: next => { app = next; watchVideoApplication(next); } });
      active.own(() => {
        if (Object.getOwnPropertyDescriptor(ui, key)?.get !== get) return;
        if (original) Object.defineProperty(ui, key, "value" in original ? { ...original, value: app } : original);
        else { delete ui[key]; if (app !== undefined) ui[key] = app; }
      });
    }
  }
  // Remove guards only; never replay missed sounds or resume stopped media.
  return Object.freeze({ dispose: () => active.dispose() });
}
