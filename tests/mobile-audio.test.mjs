import test from "node:test";
import assert from "node:assert/strict";
import { enableMobileAudio } from "../src/foundry/mobile-audio.mjs";
import { createTaskScope } from "../src/kernel/task-scope.mjs";

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
