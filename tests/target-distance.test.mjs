import test from "node:test";
import assert from "node:assert/strict";
import { targetDistance } from "../src/foundry/target-distance.mjs";

test("gridded distance minimizes footprint pairs, strips elevation and bypasses v14 collisions", () => {
  for (const generation of [13, 14]) {
    const make = (id, offsets) => ({ id, getOccupiedGridSpaceOffsets(options) {
      assert.deepEqual(options, generation === 14 ? { level: null, elevation: 0, depth: 1 } : {}); return offsets;
    } });
    const scene = { grid: { measurePath: ([a, b]) => {
      assert.equal(a.k, undefined); assert.equal(b.k, undefined);
      return { distance: Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j)) * 5 };
    } } };
    const a = make("a", [{ i: 0, j: 0, k: 12 }, { i: 0, j: 1, k: 12 }]);
    assert.equal(targetDistance(scene, a, make("b", [{ i: 0, j: 2, k: -12 }]), generation), 5);
    assert.equal(targetDistance(scene, a, make("b", [{ i: 0, j: 1 }]), generation), 0);
  }
});

test("measurement delegates square diagonal and hex distances to native scene grid", () => {
  for (const distance of [5, 7.5, 10, 30]) {
    const grid = { measurePath: () => ({ distance }) };
    const token = id => ({ id, getOccupiedGridSpaceOffsets: () => [{ i: 1, j: 2 }] });
    assert.equal(targetDistance({ grid }, token("a"), token("b"), 13), distance);
  }
});

test("gridless uses nearest rectangular edges and scene measurement scale", () => {
  const scene = { grid: { isGridless: true, measurePath: ([a, b]) => ({ distance: Math.hypot(b.x - a.x, b.y - a.y) / 20 }) } };
  const a = { id: "a", x: 0, y: 0, getSize: () => ({ width: 200, height: 100 }) };
  assert.equal(targetDistance(scene, a, { ...a, id: "b", x: 300 }), 5);
  assert.equal(targetDistance(scene, a, { ...a, id: "b", x: 200 }), 0);
  assert.equal(targetDistance(scene, a, { ...a, id: "b", x: 150 }), 0);
});

test("unavailable or invalid native measurement yields null", () => {
  assert.equal(targetDistance({}, { id: "a" }, { id: "b" }), null);
  assert.equal(targetDistance({ grid: {} }, { id: "a" }, { id: "b" }), null);
});
