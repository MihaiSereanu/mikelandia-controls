/** Planar, obstacle-free measurement using the scene's native grid rules. */
export function targetDistance(scene, source, target, generation = globalThis.game?.release?.generation) {
  try {
    const grid = scene.grid;
    if (!grid || !source || !target) return null;
    if (source.id === target.id) return 0;
    let pointsA, pointsB;
    if (grid.isGridless || Number(scene.grid.type) === 0) {
      const bounds = token => {
        const size = token.getSize();
        return { x: token.x, y: token.y, right: token.x + size.width, bottom: token.y + size.height };
      };
      const a = bounds(source), b = bounds(target);
      const nearest = (minA, maxA, minB, maxB) => maxA < minB ? [maxA, minB]
        : maxB < minA ? [minA, maxB] : [Math.max(minA, minB), Math.max(minA, minB)];
      const [ax, bx] = nearest(a.x, a.right, b.x, b.right);
      const [ay, by] = nearest(a.y, a.bottom, b.y, b.bottom);
      pointsA = [{ x: ax, y: ay }]; pointsB = [{ x: bx, y: by }];
    } else {
      // v14 adds level-based collision filtering. No level means no wall/surface test.
      // Strip k so grid measurement is strictly planar in both supported generations.
      const spaces = token => [...new Map(token.getOccupiedGridSpaceOffsets(
        Number(generation) >= 14 ? { level: null, elevation: 0, depth: 1 } : {}
      ).map(({ i, j }) => [`${i},${j}`, { i, j }])).values()];
      pointsA = spaces(source); pointsB = spaces(target);
    }
    let minimum = Infinity;
    for (const a of pointsA) for (const b of pointsB) {
      const distance = grid.measurePath([a, b]).distance;
      if (Number.isFinite(distance) && distance >= 0) minimum = Math.min(minimum, distance);
      if (minimum === 0) return 0;
    }
    return Number.isFinite(minimum) ? minimum : null;
  } catch { return null; }
}
