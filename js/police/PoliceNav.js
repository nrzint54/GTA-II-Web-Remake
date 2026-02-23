/**
 * PoliceNav
 * 
 * Grid-based pathfinding helpers for Police AI.
 * We build a cheap cost grid from Map tiles and run A*.
 *
 * Goals:
 * - cops in vehicles "prefer" roads (tile 2) but can use other walkable tiles if needed
 * - fast enough for small prototype maps; recompute paths at low frequency
 *
 * Map conventions (Map.tileColor):
 * 0 = ground, 1 = solid, 2 = road, 3 = sidewalk
 */

function key(x, y, w) { return y * w + x; }

export function worldToTile(map, wx, wy) {
  const ts = map.tileSize ?? 64;
  return { tx: Math.floor(wx / ts), ty: Math.floor(wy / ts) };
}

export function tileToWorldCenter(map, tx, ty) {
  const ts = map.tileSize ?? 64;
  return { x: (tx + 0.5) * ts, y: (ty + 0.5) * ts };
}

/**
 * Returns a "cost" (lower is better) for an agent.
 * If return is Infinity => not passable.
 */
export function tileCost(map, tx, ty, mode = "car") {
  const t = map.tileAt(tx, ty);

  // Solid = never
  if (map.isSolidTile?.(t)) return Infinity;

  // Default weights (tweakable)
  if (mode === "car") {
    // Prefer roads strongly, allow other open tiles as fallback.
    if (t === 2) return 1.0;        // road
    if (t === 3) return 2.6;        // sidewalk (avoid a bit)
    if (t === 0) return 1.8;        // ground
    return 2.0;
  }

  // Ped mode: sidewalks slightly preferred, but can traverse road/ground.
  if (t === 3) return 1.0;
  if (t === 2) return 1.3;
  if (t === 0) return 1.2;
  return 1.4;
}

/**
 * Find nearest passable tile around a world position.
 * Spiral search in tile space.
 */
export function snapToNearestPassableTile(map, wx, wy, mode = "car", maxRadiusTiles = 10) {
  const { tx, ty } = worldToTile(map, wx, wy);

  const w = map.width, h = map.height;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < w && y < h;

  if (inBounds(tx, ty) && tileCost(map, tx, ty, mode) < Infinity) return { tx, ty };

  for (let r = 1; r <= maxRadiusTiles; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        // edge only (faster)
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (!inBounds(x, y)) continue;
        if (tileCost(map, x, y, mode) < Infinity) return { tx: x, ty: y };
      }
    }
  }
  return null;
}

/**
 * A* path in tile space (4-neighbor).
 * Returns list of tiles [{tx,ty}, ...] including start and goal.
 */
export function findPathAStar(map, start, goal, mode = "car", maxNodes = 5000) {
  const w = map.width, h = map.height;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < w && y < h;

  if (!inBounds(start.tx, start.ty) || !inBounds(goal.tx, goal.ty)) return null;

  const sCost = tileCost(map, start.tx, start.ty, mode);
  const gCost = tileCost(map, goal.tx, goal.ty, mode);
  if (sCost === Infinity || gCost === Infinity) return null;

  const open = new Map(); // key -> node
  const closed = new Set(); // key

  const hManhattan = (a, b) => Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);

  const startK = key(start.tx, start.ty, w);
  open.set(startK, {
    tx: start.tx,
    ty: start.ty,
    g: 0,
    f: hManhattan(start, goal),
    parent: null
  });

  const neighbors = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
  ];

  let iter = 0;

  while (open.size > 0 && iter++ < maxNodes) {
    // pick node with lowest f
    let bestK = null;
    let bestN = null;
    for (const [k, n] of open) {
      if (!bestN || n.f < bestN.f) { bestN = n; bestK = k; }
    }

    open.delete(bestK);
    const ck = bestK;
    closed.add(ck);

    if (bestN.tx === goal.tx && bestN.ty === goal.ty) {
      // reconstruct
      const out = [];
      let n = bestN;
      while (n) { out.push({ tx: n.tx, ty: n.ty }); n = n.parent; }
      out.reverse();
      return out;
    }

    for (const nb of neighbors) {
      const nx = bestN.tx + nb.dx;
      const ny = bestN.ty + nb.dy;
      if (!inBounds(nx, ny)) continue;

      const c = tileCost(map, nx, ny, mode);
      if (c === Infinity) continue;

      const nk = key(nx, ny, w);
      if (closed.has(nk)) continue;

      const ng = bestN.g + c;
      const existing = open.get(nk);
      if (!existing || ng < existing.g) {
        const nn = {
          tx: nx,
          ty: ny,
          g: ng,
          f: ng + hManhattan({ tx: nx, ty: ny }, goal),
          parent: bestN
        };
        open.set(nk, nn);
      }
    }
  }

  return null;
}

/**
 * Convert tile path to world waypoints (centers).
 * Optionally drop the first point (start tile) so we aim for the next tile.
 */
export function pathToWaypoints(map, tilePath, dropFirst = true) {
  if (!tilePath || tilePath.length === 0) return null;
  const pts = [];
  for (let i = 0; i < tilePath.length; i++) {
    if (dropFirst && i === 0) continue;
    const { x, y } = tileToWorldCenter(map, tilePath[i].tx, tilePath[i].ty);
    pts.push({ x, y });
  }
  return pts;
}
