import { buildRoadGraph, snapWorldToRoadTile, tileToWorldCenter } from "../world/RoadGraph.js";

/**
 * RoadGraphNav
 *
 * Helpers to drive cars "on rails" using a road graph (nodes/edges).
 *
 * The graph is stored on map.roadGraph.
 * If missing, we lazy-build it.
 */

const DIRS4 = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 }
];

function idx(x, y, w) { return y * w + x; }

export function ensureRoadGraph(map) {
  if (!map) return null;
  if (!map.roadGraph) {
    map.roadGraph = buildRoadGraph(map, { roadTile: 2 });
  }
  return map.roadGraph;
}

/**
 * Returns nearest road node id for a world position, or null.
 */
export function snapWorldToNearestRoadNode(map, wx, wy, maxRadiusTiles = 14) {
  const g = ensureRoadGraph(map);
  if (!g) return null;
  const rt = snapWorldToRoadTile(map, wx, wy, g.roadTile, maxRadiusTiles);
  if (!rt) return null;
  const k = idx(rt.tx, rt.ty, map.width);
  const nid = g.tileToNode?.[k] ?? -1;
  return (nid === -1) ? null : nid;
}

/**
 * A* on the node graph.
 * Returns array of node ids [start..goal] or null.
 */
export function findNodePathAStar(graph, startId, goalId, maxIters = 8000) {
  if (!graph || startId == null || goalId == null) return null;
  if (startId === goalId) return [startId];

  const N = graph.nodes.length;
  if (startId < 0 || startId >= N || goalId < 0 || goalId >= N) return null;

  const gScore = new Float32Array(N);
  const fScore = new Float32Array(N);
  const cameFrom = new Int32Array(N);
  const inOpen = new Uint8Array(N);
  const closed = new Uint8Array(N);

  gScore.fill(Infinity);
  fScore.fill(Infinity);
  cameFrom.fill(-1);

  const h = (a, b) => {
    const na = graph.nodes[a];
    const nb = graph.nodes[b];
    const dx = (nb.tx - na.tx);
    const dy = (nb.ty - na.ty);
    return Math.hypot(dx, dy);
  };

  gScore[startId] = 0;
  fScore[startId] = h(startId, goalId);

  const heap = new MinHeap((a, b) => a.f - b.f);
  heap.push({ id: startId, f: fScore[startId] });
  inOpen[startId] = 1;

  let iters = 0;
  while (!heap.isEmpty() && iters++ < maxIters) {
    const cur = heap.pop();
    const curId = cur.id;
    if (closed[curId]) continue;

    if (curId === goalId) {
      // reconstruct
      const out = [curId];
      let p = cameFrom[curId];
      while (p !== -1) {
        out.push(p);
        if (p === startId) break;
        p = cameFrom[p];
      }
      out.reverse();
      return out;
    }

    inOpen[curId] = 0;
    closed[curId] = 1;

    const neigh = graph.adj[curId] ?? [];
    for (const e of neigh) {
      const nb = e.to;
      if (closed[nb]) continue;

      const tentativeG = gScore[curId] + (e.cost ?? 1);
      if (tentativeG < gScore[nb]) {
        cameFrom[nb] = curId;
        gScore[nb] = tentativeG;
        const nf = tentativeG + h(nb, goalId);
        fScore[nb] = nf;
        heap.push({ id: nb, f: nf });
        inOpen[nb] = 1;
      }
    }
  }

  return null;
}

/**
 * Convert a node path into dense tile-centers waypoints following edges.
 */
export function nodePathToWaypoints(map, graph, nodePath, dropFirst = true, opts = {}) {
  if (!map || !graph || !nodePath || nodePath.length < 2) return null;

  const out = [];
  const laneWidth = Number.isFinite(opts.laneWidth)
    ? opts.laneWidth
    : Math.max(4, (map.tileSize ?? 64) * 0.18);
  const laneBias = Number.isFinite(opts.laneBias) ? (opts.laneBias | 0) : 0;

  for (let i = 0; i < nodePath.length - 1; i++) {
    const a = nodePath[i];
    const b = nodePath[i + 1];
    const ad = (graph.adj[a] ?? []).find(x => x.to === b);
    if (!ad) continue;
    const edge = graph.dirEdges?.[ad.edge];
    if (!edge) continue;

    const tiles = edge.tiles;
    const dirX = edge.dirX ?? ad.dirX ?? 0;
    const dirY = edge.dirY ?? ad.dirY ?? 0;
    const lanes = Math.max(1, Math.min(4, edge.lanes ?? ad.lanes ?? 1));

    // Lane offset: keep cops on parallel tracks instead of centerline.
    // Convention: laneIndex 0 = "rightmost" (relative to movement direction).
    const laneIndex = ((laneBias % lanes) + lanes) % lanes;
    const centered = laneIndex - (lanes - 1) / 2;
    const off = centered * laneWidth;
    const perpX = -dirY;
    const perpY = dirX;

    for (let t = 0; t < tiles.length; t++) {
      // Avoid duplicates at segment seams.
      if (dropFirst && i === 0 && t === 0) continue;
      if (i > 0 && t === 0) continue;

      // Optional decimation on long straights (keeps control stable).
      const isEnd = (t === tiles.length - 1);
      if (!isEnd && t > 0 && (t % 2) === 1) continue;

      const p = tiles[t];
      const c = tileToWorldCenter(map, p.tx, p.ty);
      out.push({ x: c.x + perpX * off, y: c.y + perpY * off });
    }
  }

  return out.length ? out : null;
}

/**
 * High-level helper: world -> world waypoints on the road graph.
 * Returns null if graph routing can't be used.
 */
export function findGraphWaypoints(map, startX, startY, goalX, goalY, opts = {}) {
  const g = ensureRoadGraph(map);
  if (!g) return null;

  const startNode = snapWorldToNearestRoadNode(map, startX, startY, 14);
  const goalNode = snapWorldToNearestRoadNode(map, goalX, goalY, 14);
  if (startNode == null || goalNode == null) return null;

  // If both snap to same node, just aim the goal directly (no rail path needed).
  if (startNode === goalNode) return null;

  const nodePath = findNodePathAStar(g, startNode, goalNode, 8000);
  if (!nodePath) return null;
  return nodePathToWaypoints(map, g, nodePath, true, opts);
}

/**
 * Predict a plausible future node route for the player by "following the road".
 * We walk the directed node graph choosing the outgoing edge that best matches
 * the current movement direction.
 */
export function predictPlayerNodeRoute(map, wx, wy, dirX, dirY, horizonNodes = 10) {
  const g = ensureRoadGraph(map);
  if (!g) return null;

  const start = snapWorldToNearestRoadNode(map, wx, wy, 14);
  if (start == null) return null;

  // Cardinalize initial direction.
  let fx = 0, fy = 0;
  if (Math.abs(dirX) >= Math.abs(dirY)) fx = dirX >= 0 ? 1 : -1;
  else fy = dirY >= 0 ? 1 : -1;
  if (fx === 0 && fy === 0) fx = 1;

  const route = [start];
  let cur = start;
  let prev = null;

  for (let i = 0; i < horizonNodes - 1; i++) {
    const neigh = g.adj[cur] ?? [];
    if (!neigh.length) break;

    let best = null;
    let bestScore = -999;

    for (const e of neigh) {
      if (prev != null && e.to === prev) continue; // avoid immediate U-turn if possible
      const dot = (e.dirX ?? 0) * fx + (e.dirY ?? 0) * fy;
      // prefer continuing forward; slight bias towards longer straights
      const score = dot * 10 + Math.min(6, (e.cost ?? 1) * 0.2);
      if (score > bestScore) { bestScore = score; best = e; }
    }

    // dead end or only back edge
    if (!best) best = neigh[0];
    if (!best) break;

    prev = cur;
    cur = best.to;
    route.push(cur);

    // Update forward dir to keep route stable
    fx = best.dirX ?? fx;
    fy = best.dirY ?? fy;
  }

  return route;
}

function pathCost(graph, nodePath) {
  if (!graph || !nodePath || nodePath.length < 2) return 0;
  let c = 0;
  for (let i = 0; i < nodePath.length - 1; i++) {
    const a = nodePath[i];
    const b = nodePath[i + 1];
    const ad = (graph.adj[a] ?? []).find(x => x.to === b);
    c += (ad?.cost ?? 1);
  }
  return c;
}

function estimateETASeconds(costTiles, speedWorld, map) {
  const ts = map.tileSize ?? 64;
  const dist = costTiles * ts;
  const sp = Math.max(60, speedWorld || 0);
  return dist / sp;
}

function dijkstraCosts(graph, startId, maxIters = 12000) {
  const N = graph.nodes.length;
  const dist = new Float32Array(N);
  dist.fill(Infinity);
  dist[startId] = 0;

  const heap = new MinHeap((a, b) => a.d - b.d);
  heap.push({ id: startId, d: 0 });

  let it = 0;
  while (!heap.isEmpty() && it++ < maxIters) {
    const cur = heap.pop();
    const u = cur.id;
    if (cur.d !== dist[u]) continue;
    const neigh = graph.adj[u] ?? [];
    for (const e of neigh) {
      const v = e.to;
      const nd = dist[u] + (e.cost ?? 1);
      if (nd < dist[v]) {
        dist[v] = nd;
        heap.push({ id: v, d: nd });
      }
    }
  }

  return dist;
}

/**
 * Pick an intercept node among a predicted player route by matching ETAs.
 * Score tries to make cops arrive "just before" the player.
 */
export function pickSmartInterceptNode(map, copWx, copWy, playerRoute, playerSpeedWorld, copSpeedWorld) {
  const g = ensureRoadGraph(map);
  if (!g || !playerRoute || playerRoute.length < 3) return null;

  const copNode = snapWorldToNearestRoadNode(map, copWx, copWy, 14);
  if (copNode == null) return null;

  const copCosts = dijkstraCosts(g, copNode);

  // Precompute cumulative cost along the player route
  const cum = [0];
  for (let i = 0; i < playerRoute.length - 1; i++) {
    const a = playerRoute[i];
    const b = playerRoute[i + 1];
    const ad = (g.adj[a] ?? []).find(x => x.to === b);
    cum[i + 1] = (cum[i] + (ad?.cost ?? 1));
  }

  let bestNode = null;
  let bestScore = Infinity;

  // Start a bit ahead to avoid picking current node.
  for (let i = 2; i < playerRoute.length; i++) {
    const nodeId = playerRoute[i];
    const playerETA = estimateETASeconds(cum[i], playerSpeedWorld, map);
    const copCost = copCosts[nodeId];
    if (!Number.isFinite(copCost)) continue;
    const copETA = estimateETASeconds(copCost, copSpeedWorld, map);

    // Penalize arriving too late more than too early.
    const diff = copETA - playerETA;
    const score = Math.abs(diff) + (diff > 0 ? diff * 2.2 : 0);

    // Prefer targets that are not too close.
    if (playerETA < 1.2) continue;

    if (score < bestScore) {
      bestScore = score;
      bestNode = nodeId;
    }
  }

  return bestNode;
}

/**
 * Pick a choke point (bridge edge) on the predicted player route, and returns a world
 * position + road direction for roadblock placement.
 */
export function pickChokepointRoadblock(map, wx, wy, dirX, dirY, minAheadTiles = 18, maxAheadTiles = 72) {
  const g = ensureRoadGraph(map);
  if (!g?.undirEdges?.length) return null;

  const route = predictPlayerNodeRoute(map, wx, wy, dirX, dirY, 12);
  if (!route || route.length < 3) return null;

  let cum = 0;
  /** @type {{score:number, dirEdgeId:number} | null} */
  let best = null;

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const ad = (g.adj[a] ?? []).find(x => x.to === b);
    if (!ad) continue;
    const cost = ad.cost ?? 1;
    cum += cost;
    if (cum < minAheadTiles) continue;
    if (cum > maxAheadTiles) break;

    const und = g.undirEdges?.[ad.undirectedId];
    if (!und || !und.isBridge) continue;

    const score = und.bridgeScore ?? und.cost ?? cost;
    if (!best || score > best.score) best = { score, dirEdgeId: ad.edge };
  }

  if (!best) return null;

  const de = g.dirEdges?.[best.dirEdgeId];
  if (!de?.tiles?.length) return null;

  const mid = de.tiles[Math.floor(de.tiles.length / 2)];
  const c = tileToWorldCenter(map, mid.tx, mid.ty);
  return {
    x: c.x,
    y: c.y,
    roadDirX: de.dirX ?? 1,
    roadDirY: de.dirY ?? 0,
    nodeId: de.to ?? null
  };
}

/**
 * Pick a point ahead of an agent, constrained to road tiles, and returns also
 * the local road direction (cardinal) for roadblock orientation.
 */
export function pickRoadPointAhead(map, wx, wy, dirX, dirY, aheadTiles = 16, jitterTiles = 6) {
  const g = ensureRoadGraph(map);
  if (!g) return null;

  const start = snapWorldToRoadTile(map, wx, wy, g.roadTile, 18);
  if (!start) return null;

  // Cardinalize direction.
  let sx = 0, sy = 0;
  if (Math.abs(dirX) >= Math.abs(dirY)) sx = dirX >= 0 ? 1 : -1;
  else sy = dirY >= 0 ? 1 : -1;
  if (sx === 0 && sy === 0) sx = 1;

  const steps = Math.max(2, Math.floor(aheadTiles + (Math.random() * 2 - 1) * jitterTiles));
  let tx = start.tx;
  let ty = start.ty;
  let last = { tx, ty };

  for (let i = 0; i < steps; i++) {
    const nx = tx + sx;
    const ny = ty + sy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) break;
    if (map.tileAt(nx, ny) !== g.roadTile) break;
    tx = nx; ty = ny;
    last = { tx, ty };
  }

  // Determine a stable local road direction at that tile.
  let rdX = sx, rdY = sy;
  if (map.tileAt(last.tx + rdX, last.ty + rdY) !== g.roadTile) {
    const opts = DIRS4.filter(d => map.tileAt(last.tx + d.dx, last.ty + d.dy) === g.roadTile);
    if (opts.length) {
      let best = opts[0];
      let bestDot = -999;
      for (const d of opts) {
        const dot = d.dx * sx + d.dy * sy;
        if (dot > bestDot) { bestDot = dot; best = d; }
      }
      rdX = best.dx; rdY = best.dy;
    } else {
      rdX = 1; rdY = 0;
    }
  }

  const c = tileToWorldCenter(map, last.tx, last.ty);
  const nodeId = g.tileToNode?.[idx(last.tx, last.ty, map.width)] ?? -1;

  return {
    x: c.x,
    y: c.y,
    roadDirX: rdX,
    roadDirY: rdY,
    tx: last.tx,
    ty: last.ty,
    nodeId: nodeId === -1 ? null : nodeId
  };
}

/** Tiny binary heap for A* */
class MinHeap {
  constructor(cmp) {
    this._a = [];
    this._cmp = cmp;
  }
  isEmpty() { return this._a.length === 0; }
  push(v) {
    const a = this._a;
    a.push(v);
    this._up(a.length - 1);
  }
  pop() {
    const a = this._a;
    if (a.length === 1) return a.pop();
    const top = a[0];
    a[0] = a.pop();
    this._down(0);
    return top;
  }
  _up(i) {
    const a = this._a;
    const cmp = this._cmp;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cmp(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  _down(i) {
    const a = this._a;
    const cmp = this._cmp;
    const n = a.length;
    while (true) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < n && cmp(a[l], a[m]) < 0) m = l;
      if (r < n && cmp(a[r], a[m]) < 0) m = r;
      if (m === i) break;
      [a[i], a[m]] = [a[m], a[i]];
      i = m;
    }
  }
}
