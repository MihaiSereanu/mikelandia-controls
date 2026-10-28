import { collection, createActor, createGame, createHooks } from "./foundry.mjs";
import { createFoundryTargetingGateway } from "../../src/foundry/targeting-gateway.mjs";

export function targetingFixture(gatewayOptions = {}) {
  const actor = createActor(), game = createGame([actor]), hooks = createHooks();
  game.release = { generation: 14 };
  const scene = { id: "scene", grid: { units: "ft", distance: 5, size: 100, isGridless: false,
    measurePath: ([a, b]) => ({ distance: Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j)) * 5 }) } };
  const makeToken = (id, x, disposition = -1, extra = {}) => ({ id, name: id, x, y: 0, width: 1, height: 1,
    parent: scene, actorId: id === "pc" ? actor.id : id, disposition, texture: {}, hidden: false,
    getOccupiedGridSpaceOffsets() { return [{ i: 0, j: this.x / 100 }]; }, getSize: () => ({ width: 100, height: 100 }), ...extra });
  const pc = makeToken("pc", 0, 1), enemy = makeToken("enemy", 300), neutral = makeToken("neutral", 500, 0);
  scene.tokens = collection([pc, enemy, neutral, makeToken("hidden", 600, -1, { hidden: true }), makeToken("outside", 700)]);
  const placeables = scene.tokens.map(document => ({ id: document.id, document,
    setTarget(selected, options) {
      if (options.releaseOthers !== false) throw new Error("Must preserve other targets");
      if (selected) game.user.targets.add(this); else game.user.targets.delete(this);
      hooks.emit("targetToken", game.user, this, selected);
    } }));
  const canvas = { ready: true, scene, tokens: collection(placeables) };
  game.combat = { id: "combat", scene, started: true,
    turns: scene.tokens.filter(token => token.id !== "outside").map(token => ({ id: `c-${token.id}`, tokenId: token.id, sceneId: scene.id, visible: true })) };
  const gateway = createFoundryTargetingGateway({ getGame: () => game, getCanvas: () => canvas,
    resolveActor: uuid => uuid === actor.uuid ? actor : null, ...gatewayOptions });
  gateway.refresh(actor.uuid);
  const request = tokenId => { const state = gateway.snapshot(); return { context: state.context, sourceId: state.sourceId, tokenId }; };
  return { actor, game, hooks, scene, pc, enemy, neutral, canvas, gateway, request, makeToken };
}
