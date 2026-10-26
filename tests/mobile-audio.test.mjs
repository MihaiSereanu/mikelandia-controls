import test from "node:test";
import assert from "node:assert/strict";
import { enableMobileAudio } from "../src/foundry/mobile-audio.mjs";
import { createTaskScope } from "../src/kernel/task-scope.mjs";

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
