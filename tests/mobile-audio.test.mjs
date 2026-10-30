import test from "node:test";
import assert from "node:assert/strict";
import { enableMobileAudio } from "../src/foundry/media/mobile-audio.mjs";
import { createTaskScope } from "../src/kernel/lifecycle/task-scope.mjs";

const install = (options = {}) => {
  const scope = createTaskScope("audio");
  const controller = enableMobileAudio(scope, { getGame: () => ({}), getUi: () => ({}), document: null, ...options });
  return { scope, controller };
};

test("native audio stops local instances, blocks loading and playback, and settles native return contracts", async () => {
  let loads = 0, plays = 0, stops = 0;
  class Sound {
    async load() { loads++; return this; }
    async play() { plays++; return this; }
    async playAtPosition() { plays++; return this; }
    async _load() { loads++; }
    _play() { plays++; }
    async stop(options) { assert.deepEqual(options, { fade: 0, delay: 0 }); stops++; return this; }
  }
  const originalLoad = Sound.prototype.load, sound = new Sound(), cached = new Sound(), playlistSound = new Sound();
  const playlist = { sounds: [{ sound: playlistSound }], update() { throw Error("must not write world documents"); } };
  const game = { audio: { playing: new Map([[1, sound]]), sounds: new Map([["cached", new WeakRef(cached)]]) }, playlists: [playlist] };
  const { scope } = install({ getGame: () => game, SoundType: Sound });
  assert.equal(stops, 3);
  const next = new Sound();
  assert.equal(await next.load(), next);
  assert.equal(await next.play(), next);
  assert.equal(await next.playAtPosition(), next);
  await next._load(); next._play();
  assert.equal(loads, 0); assert.equal(plays, 0);
  scope.dispose();
  assert.equal(Sound.prototype.load, originalLoad);
  assert.equal(plays, 0, "exit never resumes old audio");
  await next.load(); await next.play();
  assert.equal(loads, 1); assert.equal(plays, 1, "new desktop calls work again");
});

test("a native load already awaiting unlock cannot fetch, decode or autoplay after the gesture", async () => {
  let unlock, decoded = 0, played = 0;
  const unlocked = new Promise(resolve => { unlock = resolve; });
  class Sound {
    async load() { await unlocked; await this._load(); await this.play(); return this; }
    async _load() { decoded++; }
    async play() { this._play(); return this; }
    _play() { played++; }
  }
  const sound = new Sound(), pending = sound.load();
  const { scope } = install({ SoundType: Sound });
  unlock(); assert.equal(await pending, sound);
  assert.equal(decoded, 0); assert.equal(played, 0);
  scope.dispose(); assert.equal(played, 0);
});

test("an already queued native playback cannot start after its delay", async () => {
  let release, starts = 0;
  const delay = new Promise(resolve => { release = resolve; });
  class Sound { async play() { await delay; this._play(); return this; } _play() { starts++; } }
  const sound = new Sound(), pending = sound.play();
  const { scope } = install({ SoundType: Sound });
  release(); await pending;
  assert.equal(starts, 0);
  scope.dispose();
});

test("native first-gesture contexts suspend immediately and cannot resume until guards are removed", async () => {
  let suspends = 0, resumes = 0;
  const context = () => ({ state: "running", async suspend() { suspends++; this.state = "suspended"; }, async resume() { resumes++; this.state = "running"; } });
  const initial = context(), audio = { music: initial }, game = {};
  Object.defineProperty(game, "audio", { value: audio, writable: false });
  const { scope } = install({ getGame: () => game });
  const late = context(); audio.environment = late; audio.interface = late;
  await initial.resume(); await late.resume();
  assert.equal(suspends, 2); assert.equal(resumes, 0);
  assert.equal(late.state, "suspended");
  scope.dispose();
  assert.equal(audio.environment, late, "retain contexts constructed during ownership");
  assert.equal(resumes, 0);
  await late.resume(); assert.equal(resumes, 1);
});

test("deferred audio construction is guarded without startup races", async () => {
  const game = {}; let suspends = 0;
  const { scope } = install({ getGame: () => game });
  game.audio = { music: { suspend() { suspends++; }, async resume() { throw Error("blocked"); } } };
  assert.equal(suspends, 1);
  await game.audio.music.resume();
  scope.dispose(); assert.ok(game.audio.music);
});

test("existing and detached HTML media stop, play settles without starting, and exit never resumes", async () => {
  let starts = 0, pauses = 0, scans = 0, observe, disconnected = false;
  class Media { paused = false; async play() { starts++; this.paused = false; } pause() { pauses++; this.paused = true; } }
  const originalPlay = Media.prototype.play, existing = new Media(), added = new Media();
  const document = new EventTarget(); document.body = {};
  document.querySelectorAll = () => { scans++; return [existing]; };
  class Observer { constructor(callback) { observe = callback; } observe() {} disconnect() { disconnected = true; } }
  const { scope } = install({ document, MediaType: Media, MutationObserverType: Observer });
  assert.equal(existing.paused, true);
  const detached = new Media(); assert.equal(await detached.play(), undefined);
  assert.equal(detached.paused, true); assert.equal(starts, 0);
  observe([{ addedNodes: [{ matches: () => false, querySelectorAll: () => [added] }] }]);
  assert.equal(added.paused, true); assert.equal(scans, 1, "mutations inspect added branches only");
  const pausedBeforeExit = pauses; scope.dispose();
  assert.equal(pauses, pausedBeforeExit); assert.equal(starts, 0); assert.equal(disconnected, true);
  assert.equal(Media.prototype.play, originalPlay);
  await detached.play(); assert.equal(starts, 1);
});

test("YouTube stop is local, idempotent, and blocks restart and playlist-volume feedback", () => {
  let starts = 0, stops = 0, writes = 0, volumeCommands = 0;
  const player = { playVideo() { starts++; }, loadVideoById() { starts++; }, loadVideoByUrl() { starts++; },
    stopVideo() { stops++; app.setSyncSetting(); }, setVolume() { volumeCommands++; app.setSyncSetting(); }, unMute() { volumeCommands++; } };
  const originalPlay = player.playVideo;
  const app = { YTPlayer: player, setVolume() { player.setVolume(80); }, setSyncSetting() { writes++; }, setSyncSettingDebounced() { writes++; } };
  const { scope } = install({ getUi: () => ({ sidebarVideoPlayer: app }) });
  for (let index = 0; index < 20; index++) { app.setVolume(); player.playVideo(); player.unMute(); player.loadVideoById("x"); player.loadVideoByUrl("x"); }
  app.setSyncSetting(); app.setSyncSettingDebounced();
  assert.equal(starts, 0); assert.equal(volumeCommands, 0); assert.equal(writes, 0); assert.equal(stops, 1);
  scope.dispose();
  assert.equal(player.playVideo, originalPlay); assert.equal(starts, 0, "no automatic restoration of playback");
  player.playVideo(); assert.equal(starts, 1);
});

test("YouTube APIs added at onReady are blocked by the widget's pre-play volume boundary", () => {
  let starts = 0, stops = 0;
  const ui = {}, { scope } = install({ getUi: () => ui });
  ui.sidebarVideoPlayer = { setVolume() { this.YTPlayer.setVolume(90); } };
  const player = {}; ui.sidebarVideoPlayer.YTPlayer = player;
  Object.assign(player, { playVideo() { starts++; }, stopVideo() { stops++; }, setVolume() { throw Error("must not command volume"); } });
  ui.sidebarVideoPlayer.setVolume(); player.playVideo();
  assert.equal(starts, 0); assert.equal(stops, 1);
  scope.dispose(); assert.equal(starts, 0);
});

test("YouTube bootstrap is blocked before script insertion and restored without starting the widget", async () => {
  let insertions = 0, callbacks = 0, loads = 0;
  class Node { insertBefore(node) { insertions++; return node; } }
  const originalInsert = Node.prototype.insertBefore, parent = new Node();
  const host = {}, ui = {};
  const { scope } = install({ host, NodeType: Node, getUi: () => ui });
  const callback = () => { callbacks++; };
  host.onYouTubeIframeAPIReady = callback;
  const script = { tagName: "SCRIPT", src: "https://www.youtube.com/iframe_api" };
  assert.equal(parent.insertBefore(script, null), script);
  host.onYouTubeIframeAPIReady();
  assert.equal(insertions, 0); assert.equal(callbacks, 0);
  parent.insertBefore({ tagName: "SCRIPT", src: "https://example.com/script.js" }, null);
  parent.insertBefore({ tagName: "DIV" }, null);
  assert.equal(insertions, 2, "unrelated DOM insertions retain native behavior");
  await ui.sidebarVideoPlayer.loadVideo();
  ui.sidebarVideoPlayer.renderPlaylists(); ui.sidebarVideoPlayer.syncTime();
  const app = { async loadVideo() { loads++; } };
  ui.sidebarVideoPlayer = app;
  await app.loadVideo("https://www.youtube.com/watch?v=test");
  assert.equal(loads, 0, "fallback prevents iframe construction on an existing widget");
  scope.dispose();
  assert.equal(Node.prototype.insertBefore, originalInsert);
  assert.equal(host.onYouTubeIframeAPIReady, callback);
  assert.equal(callbacks, 0, "teardown does not initialize the widget");
  assert.equal(ui.sidebarVideoPlayer, app);
  await app.loadVideo(); assert.equal(loads, 1);
});

test("dormant YouTube callback interface is removed on teardown", () => {
  const ui = {}, host = {};
  const { scope } = install({ getUi: () => ui, host });
  assert.equal(typeof ui.sidebarVideoPlayer.loadVideo, "function");
  scope.dispose();
  assert.equal(Object.hasOwn(ui, "sidebarVideoPlayer"), false);
  assert.equal(Object.hasOwn(host, "onYouTubeIframeAPIReady"), false);
});

test("cleanup preserves a newer method replacement and handles unavailable playback APIs", () => {
  class Media { async play() {} pause() { throw Error("detached media"); } }
  const { scope } = install({ MediaType: Media });
  const next = async function () {}; Media.prototype.play = next;
  scope.dispose(); assert.equal(Media.prototype.play, next);
});
