import test from "node:test";
import assert from "node:assert/strict";
import { installWfrpOpposedMomentum, MOMENTUM_QUERY } from "../src/foundry/compatibility/wfrp-opposed-momentum.mjs";

const FIELD = "system.status.momentum";

function fixture({ winner = "attacker", gmActive = true, linked = false, edition = true, npcDefends = false, failResult = false } = {}) {
  const cleanups = [], errors = [], nativeWrites = [], requests = [], messages = new Map();
  const player = { id: "tester", active: true, isGM: false };
  const gm = { id: "gm", active: gmActive, isGM: true };
  class Actor {
    constructor(uuid, owner) { this.uuid = uuid; this.owner = owner; this.inCombat = true; this.momentum = true; }
    get isOwner() { return game.user.isGM || this.owner === game.user.id; }
    testUserPermission(user, permission) { assert.equal(permission, "OWNER"); return user.isGM || user.id === this.owner; }
    async update(data, options) {
      if (!this.isOwner) throw new Error("permission denied");
      nativeWrites.push({ actor: this.uuid, data, options });
      if (FIELD in data) this.momentum = data[FIELD];
      return this;
    }
  }
  const npc = new Actor(linked ? "Actor.npc" : "Scene.scene.Token.npc.Actor.npc", "gm");
  const pc = new Actor("Actor.pc", "tester");
  const attackerTest = { e5: true, actor: npcDefends ? pc : npc, item: { id: "weapon", system: { isMelee: true } } };
  const defenderTest = { e5: true, actor: npcDefends ? npc : pc, item: { id: "weapon", system: { isMelee: true } } };
  class Handler {
    constructor(id = "handler") {
      this.message = { id };
      this.data = { attackerMessageId: `${id}-attack`, defenderMessageId: `${id}-defend` };
      this.attacker = attackerTest.actor; this.defender = defenderTest.actor;
      messages.set(id, { type: "handler", system: { opposedHandler: this } });
    }
    async computeOpposeResult() {
      const won = winner === "attacker";
      // Native code fires these without awaiting. Observe rejections in the
      // fixture so the test also detects any leaked unauthorized write.
      const writes = [attackerTest.actor.update({ [FIELD]: won }), defenderTest.actor.update({ [FIELD]: !won })];
      const outcomes = await Promise.allSettled(writes);
      for (const outcome of outcomes) if (outcome.status === "rejected") errors.push(outcome.reason);
      if (failResult) throw new Error("native result failure");
      const resultTests = [attackerTest, defenderTest].map((test, index) => {
        const messageId = index === 0 ? this.data.attackerMessageId : this.data.defenderMessageId;
        const original = { ...test, context: { messageId, opposedMessageIds: [this.message.id] } };
        messages.set(messageId, { type: "test5e", author: test.actor.owner === "gm" ? gm : player, system: { test: original } });
        return original;
      });
      this.data.resultMessageId = `${this.message.id}-result`;
      messages.set(this.data.resultMessageId, { type: "opposed", system: {
        handlerId: this.message.id,
        opposedTest: { attackerTest: resultTests[0], defenderTest: resultTests[1], result: { winner } }
      } });
      return "native result";
    }
  }
  const config = { queries: {} };
  const game = { system: { id: "wfrp4e" }, user: player, messages, users: { activeGM: gm },
    settings: { get: () => ({ use5e: edition }) },
    wfrp4e: { opposedHandler: Handler, documents: { ActorWFRP4e: Actor } } };
  gm.query = async (name, request) => {
    requests.push(request);
    assert.ok(messages.has(request.resultId), "result must be persisted before querying GM");
    game.user = gm;
    try { return await config.queries[name](request, { user: player }); }
    finally { game.user = player; }
  };
  const originalCompute = Handler.prototype.computeOpposeResult, originalUpdate = Actor.prototype.update;
  const install = () => installWfrpOpposedMomentum({ own: fn => cleanups.push(fn) }, { game, config, report: error => errors.push(error) });
  install();
  const handler = new Handler();
  const request = (overrides = {}) => ({ actorUuid: npc.uuid, handlerId: handler.message.id,
    resultId: handler.data.resultMessageId, value: winner === (npcDefends ? "defender" : "attacker"), ...overrides });
  const query = async (payload, user = player) => {
    game.user = gm;
    try { return await config.queries[MOMENTUM_QUERY](payload, { user }); }
    finally { game.user = player; }
  };
  return { game, config, handler, npc, pc, gm, player, errors, nativeWrites, requests, install, request, query,
    attackerTest, defenderTest, originalCompute, originalUpdate, Actor, Handler,
    dispose: () => cleanups.forEach(fn => fn()) };
}

for (const winner of ["attacker", "defender"]) {
  test(`NPC defending: ${winner} wins`, async () => {
    const f = fixture({ winner, npcDefends: true });
    await f.handler.computeOpposeResult();
    assert.deepEqual(f.errors, []);
    assert.equal(f.npc.momentum, winner === "defender");
    assert.equal(f.pc.momentum, winner === "attacker");
    assert.equal(f.requests.length, 1);
  });
}

for (const linked of [false, true]) {
  for (const winner of ["attacker", "defender"]) {
    test(`${linked ? "linked" : "unlinked"} NPC Momentum ${winner === "attacker" ? "gain" : "clear"} is applied by GM`, async () => {
      const f = fixture({ winner, linked });
      assert.equal(await f.handler.computeOpposeResult(), "native result");
      assert.deepEqual(f.errors, []);
      assert.equal(f.npc.momentum, winner === "attacker");
      assert.equal(f.pc.momentum, winner === "defender");
      assert.equal(f.requests.length, 1);
      assert.equal(f.nativeWrites.length, 2);
    });
  }
}

test("no active GM preserves roll and player write, reports Momentum failure without forbidden update", async () => {
  const f = fixture({ gmActive: false });
  assert.equal(await f.handler.computeOpposeResult(), "native result");
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0].message, /active GM/);
  assert.equal(f.nativeWrites.length, 1);
  assert.equal(f.requests.length, 0);
});

test("GM and owned actor writes retain the original update and options", async () => {
  const f = fixture();
  f.game.user = f.gm;
  await f.handler.computeOpposeResult();
  assert.equal(f.requests.length, 0);
  await f.pc.update({ [FIELD]: true }, { example: true });
  assert.deepEqual(f.nativeWrites.at(-1).options, { example: true });
});

test("unrelated and multi-field unowned updates still fail permission checks", async () => {
  const f = fixture();
  await assert.rejects(f.npc.update({ "system.status.wounds.value": 2 }), /permission denied/);
  await assert.rejects(f.npc.update({ [FIELD]: true, other: true }), /permission denied/);
  await assert.rejects(f.npc.update({ [FIELD]: true }), /permission denied/);
  assert.equal(f.requests.length, 0);
});

test("4e retains native behavior and does not route Momentum updates", async () => {
  const f = fixture({ edition: false });
  await f.handler.computeOpposeResult();
  assert.equal(f.requests.length, 0);
  assert.match(f.errors[0].message, /permission denied/);
});

test("GM rejects unrelated users, arbitrary fields, wrong actors, wrong state and stale results", async () => {
  const f = fixture();
  await f.handler.computeOpposeResult();
  for (const payload of [f.request({ extra: true }), f.request({ actorUuid: "Actor.unrelated" }),
    f.request({ value: false }), f.request({ resultId: "old" }), f.request({ value: "true" })]) {
    await assert.rejects(f.query(payload));
  }
  await assert.rejects(f.query(f.request(), { id: "stranger", active: true }), /does not own/);
  f.game.user = f.player;
  await assert.rejects(f.config.queries[MOMENTUM_QUERY](f.request(), { user: f.player }), /unavailable/);
  assert.equal(f.nativeWrites.length, 2);
});

test("ranged winners and combatants outside combat cannot acquire Momentum through query", async () => {
  const f = fixture();
  await f.handler.computeOpposeResult();
  f.attackerTest.item.system.isMelee = false;
  await assert.rejects(f.query(f.request()), /does not match/);
  f.attackerTest.item.system.isMelee = true;
  f.npc.inCombat = false;
  await assert.rejects(f.query(f.request()), /does not match/);
});

test("forged handler/results cannot reuse an NPC roll from a different opposed test", async () => {
  const f = fixture();
  await f.handler.computeOpposeResult();
  const original = f.game.messages.get(f.handler.data.attackerMessageId).system.test;
  original.context.opposedMessageIds = ["different-handler"];
  await assert.rejects(f.query(f.request()), /authorized participant rolls/);
  assert.equal(f.nativeWrites.length, 2);
});

test("participant roll must have a matching speaker, native type and authorized author", async () => {
  const f = fixture();
  await f.handler.computeOpposeResult();
  const message = f.game.messages.get(f.handler.data.attackerMessageId);
  message.author = f.player;
  await assert.rejects(f.query(f.request()), /authorized participant rolls/);
  message.author = f.gm;
  message.type = "test";
  await assert.rejects(f.query(f.request()), /authorized participant rolls/);
  message.type = "test5e";
  const result = f.game.messages.get(f.handler.data.resultMessageId).system.opposedTest;
  result.attackerTest = { ...result.attackerTest, actor: new f.Actor("Actor.other-npc", "gm") };
  await assert.rejects(f.query(f.request({ actorUuid: "Actor.other-npc" })), /authorized participant rolls/);
});

test("unopposed dummy defender needs no roll message but must match the native target", async () => {
  const f = fixture();
  await f.handler.computeOpposeResult();
  delete f.handler.data.defenderMessageId;
  const result = f.game.messages.get(f.handler.data.resultMessageId).system.opposedTest;
  result.defenderTest.context.unopposed = true;
  assert.equal(await f.query(f.request()), true);
  f.handler.defender = new f.Actor("Actor.other", "tester");
  await assert.rejects(f.query(f.request()), /authorized participant rolls/);
});

test("native result failure clears interception and never dispatches an unvalidated write", async () => {
  const f = fixture({ failResult: true });
  await assert.rejects(f.handler.computeOpposeResult(), /native result failure/);
  assert.equal(f.requests.length, 0);
  await assert.rejects(f.npc.update({ [FIELD]: true }), /permission denied/);
});

test("query transport failure preserves the roll and reports failure without direct fallback", async () => {
  const f = fixture();
  f.gm.query = async () => { throw new Error("GM connection timed out"); };
  assert.equal(await f.handler.computeOpposeResult(), "native result");
  assert.match(f.errors[0].message, /timed out/);
  assert.equal(f.nativeWrites.length, 1);
});

test("repeat requests are idempotent and simultaneous opposed rolls keep their result identity", async () => {
  const f = fixture();
  const other = new f.Handler("other");
  await Promise.all([f.handler.computeOpposeResult(), other.computeOpposeResult()]);
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.requests.map(r => r.resultId), ["handler-result", "other-result"]);
  const count = f.nativeWrites.length;
  await f.query(f.request());
  assert.equal(f.nativeWrites.length, count);
});

test("disposal restores native methods and removes the query; duplicate install is inert", () => {
  const f = fixture();
  assert.equal(f.install(), false);
  f.dispose();
  assert.equal(f.Actor.prototype.update, f.originalUpdate);
  assert.equal(f.Handler.prototype.computeOpposeResult, f.originalCompute);
  assert.equal(f.config.queries[MOMENTUM_QUERY], undefined);
});

test("disposal preserves inherited Actor update behavior", () => {
  class Base { update() {} }
  class Actor extends Base {}
  class Handler { computeOpposeResult() {} }
  const game = { system: { id: "wfrp4e" }, wfrp4e: { opposedHandler: Handler, documents: { ActorWFRP4e: Actor } } };
  const cleanups = [];
  installWfrpOpposedMomentum({ own: fn => cleanups.push(fn) }, { game, config: { queries: {} } });
  assert.equal(Object.hasOwn(Actor.prototype, "update"), true);
  cleanups[0]();
  assert.equal(Object.hasOwn(Actor.prototype, "update"), false);
  assert.equal(Actor.prototype.update, Base.prototype.update);
});
