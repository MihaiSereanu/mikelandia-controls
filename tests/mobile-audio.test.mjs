import test from "node:test";
import assert from "node:assert/strict";
import { enableMobileAudio } from "../src/foundry/media/mobile-audio.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";

test("later native unmute and media volume changes cannot escape mobile mute", () => {
  const audio = { globalMute: false };
  const media = new EventTarget(); media.muted = false;
  const document = new EventTarget(); document.body = {}; document.querySelectorAll = () => [media];
  const scope = createTaskScope("audio-regression");
  enableMobileAudio(scope, { getGame: () => ({ audio }), document, MutationObserverType: null });
  try {
    audio.globalMute = false;
    assert.equal(audio.globalMute, true, "native volume UI must not unmute mobile audio");
    media.muted = false;
    document.dispatchEvent(new Event("volumechange"));
    assert.equal(media.muted, true, "later media changes must remain muted");
  } finally { scope.dispose(); }
});

test("mobile audio mutes this client, newly added media, and restores on exit", async () => {
  let unlock, observe, disconnected = false;
  const audio = { globalMute: false, unlock: new Promise(resolve => { unlock = resolve; }) };
  const video = { muted: false }, alreadyMuted = { muted: true }, elements = [video, alreadyMuted];
  const game = { audio }, document = { body: {}, querySelectorAll: () => elements };
  class Observer { constructor(callback) { observe = callback; } observe() {} disconnect() { disconnected = true; } }
  const scope = createTaskScope("audio");
  enableMobileAudio(scope, { getGame: () => game, document, MutationObserverType: Observer });
  assert.equal(audio.globalMute, true); assert.equal(video.muted, true);
  audio.globalMute = false; unlock(); await audio.unlock; await Promise.resolve();
  assert.equal(audio.globalMute, true, "mute contexts created by the first gesture");
  const added = { muted: false }; elements.push(added); observe(); assert.equal(added.muted, true);
  scope.dispose();
  assert.equal(audio.globalMute, false); assert.equal(video.muted, false); assert.equal(added.muted, false);
  assert.equal(alreadyMuted.muted, true); assert.equal(disconnected, true);
});

test("late audio unlock cannot mute after mobile exit or replace a user's prior mute", async () => {
  let unlock;
  const audio = { globalMute: true, unlock: new Promise(resolve => { unlock = resolve; }) };
  const scope = createTaskScope("audio");
  enableMobileAudio(scope, { getGame: () => ({ audio }), document: null }); scope.dispose();
  assert.equal(audio.globalMute, true);
  audio.globalMute = false; unlock(); await audio.unlock; await Promise.resolve();
  assert.equal(audio.globalMute, false);
});

test("first-gesture contexts and native volume writes are silent synchronously; opt-out restores", () => {
  const contexts = [];
  class NativeAudio {
    #muted = false;
    get globalMute() { return this.#muted; }
    set globalMute(value) { this.#muted = value; for (const context of contexts) context.gainNode.gain.setValueAtTime(value ? 0 : 0.7, 0); }
  }
  const audio = new NativeAudio(), scope = createTaskScope("startup");
  const controller = enableMobileAudio(scope, { getGame: () => ({ audio }), document: null });
  for (const key of ["music", "environment", "interface"]) {
    const gain = { value: 0.7, setValueAtTime(value) { this.value = value; } };
    const context = { gainNode: { gain }, currentTime: 0 }; contexts.push(context);
    audio[key] = context;
    assert.equal(gain.value, 0, "assignment mutes before pending playback");
    gain.setValueAtTime(0.9, 0); assert.equal(gain.value, 0);
    gain.value = 0.8; assert.equal(gain.value, 0, "direct AudioParam writes stay muted");
  }
  controller.setEnabled(false);
  assert.equal(audio.globalMute, false);
  assert.ok(contexts.every(context => context.gainNode.gain.value === 0.7));
  controller.setEnabled(true); assert.equal(audio.globalMute, true);
  scope.dispose(); assert.equal(audio.globalMute, false);
});

test("detached media and late YouTube players mute before playback and restore owned methods", () => {
  class Media { muted = false; play() { assert.equal(this.muted, true); } }
  const originalPlay = Media.prototype.play, ui = {}, scope = createTaskScope("media");
  enableMobileAudio(scope, { getGame: () => ({}), getUi: () => ui, document: null, MediaType: Media });
  const media = new Media(); media.play();
  ui.sidebarVideoPlayer = {};
  const player = { muted: false, volume: 80, isMuted() { return this.muted; }, getVolume() { return this.volume; },
    mute() { this.muted = true; }, unMute() { this.muted = false; }, setVolume(value) { this.volume = value; },
    playVideo() { assert.equal(this.muted, true); } };
  ui.sidebarVideoPlayer.YTPlayer = player;
  player.setVolume(90); player.unMute(); player.playVideo();
  assert.equal(player.volume, 0); assert.equal(player.muted, true);
  scope.dispose(); assert.equal(media.muted, false); assert.equal(player.muted, false);
  assert.equal(player.volume, 80); assert.equal(Media.prototype.play, originalPlay);
});

test("YouTube methods installed at onReady are guarded before native playback", () => {
  const ui = {}, scope = createTaskScope("late-player-api");
  enableMobileAudio(scope, { getGame: () => ({}), getUi: () => ui, document: null });
  ui.sidebarVideoPlayer = { setVolume() { this.YTPlayer.setVolume(90); } };
  const player = {};
  ui.sidebarVideoPlayer.YTPlayer = player;
  Object.assign(player, { muted: false, volume: 80, isMuted() { return this.muted; }, getVolume() { return this.volume; },
    mute() { this.muted = true; }, unMute() { this.muted = false; }, setVolume(value) { this.volume = value; },
    playVideo() { assert.equal(this.muted, true); } });
  ui.sidebarVideoPlayer.setVolume(); player.playVideo(); player.unMute();
  assert.equal(player.muted, true); assert.equal(player.volume, 0);
  scope.dispose(); assert.equal(player.muted, false); assert.equal(player.volume, 80);
});

test("YouTube mute and playlist-volume callbacks settle instead of feeding repeated playlist renders", () => {
  const events = [], scope = createTaskScope("youtube-volume-feedback");
  let muteCommands = 0, settingsWrites = 0, playlistRenders = 0;
  const player = {
    muted: false, volume: 80,
    isMuted() { return this.muted; }, getVolume() { return this.volume; },
    // The iframe posts a separate asynchronous volume event for each API
    // command, including repeated commands whose numeric volume is unchanged.
    mute() { muteCommands++; events.push(() => { this.muted = true; onVolumeChange(); }); },
    unMute() { events.push(() => { this.muted = false; onVolumeChange(); }); },
    setVolume(volume) { events.push(() => { this.volume = volume; onVolumeChange(); }); },
    playVideo() {}
  };
  const app = { YTPlayer: player,
    setVolume() { this._volumeSetProgrammatically = true; this.YTPlayer.setVolume(80); } };
  // Mirror YouTube Player Widget's single-event suppression and Foundry's
  // volume setting -> playlist render + globalPlaylistVolumeChanged hook.
  const game = { settings: { set() { settingsWrites++; playlistRenders++; app.setVolume(); } } };
  function onVolumeChange() {
    if (app._volumeSetProgrammatically) { app._volumeSetProgrammatically = false; return; }
    game.settings.set("core", "globalPlaylistVolume", player.getVolume() / 100);
  }
  const flush = () => {
    let delivered = 0;
    while (events.length && delivered++ < 30) events.shift()();
    assert.equal(events.length, 0, "volume feedback must reach idle within a bounded number of events");
    return delivered;
  };
  class NativeAudio {
    #muted = false;
    get globalMute() { return this.#muted; }
    set globalMute(value) { this.#muted = value; app.setVolume(); }
  }
  game.audio = new NativeAudio();
  try {
    enableMobileAudio(scope, { getGame: () => game, getUi: () => ({ sidebarVideoPlayer: app }), document: null });
    // Repeated calls before the iframe acknowledges mute must remain bounded.
    app.setVolume(); player.playVideo(); player.unMute();
    assert.ok(flush() <= 8);
    assert.equal(muteCommands, 1);
    assert.equal(player.muted, true); assert.equal(player.volume, 0);
    assert.ok(settingsWrites <= 2); assert.equal(playlistRenders, settingsWrites);
    const previousWrites = settingsWrites;
    game.audio.globalMute = true;
    assert.equal(flush(), 1, "later native mute hooks issue only their one expected volume event");
    assert.equal(settingsWrites, previousWrites);
    assert.equal(muteCommands, 1);
  } finally { scope.dispose(); }
});

test("an already-muted YouTube player needs no extra mute commands", () => {
  let muteCommands = 0;
  const player = { isMuted: () => true, getVolume: () => 0, mute() { muteCommands++; },
    setVolume() {}, unMute() {}, playVideo() {} };
  const app = { YTPlayer: player, setVolume() { player.setVolume(80); } };
  const scope = createTaskScope("youtube-already-muted");
  try {
    enableMobileAudio(scope, { getGame: () => ({}), getUi: () => ({ sidebarVideoPlayer: app }), document: null });
    app.setVolume(); player.unMute(); player.playVideo();
    assert.equal(muteCommands, 0);
  } finally { scope.dispose(); }
});
