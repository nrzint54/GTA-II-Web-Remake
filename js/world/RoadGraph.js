/**
 * RoadGraph
 *
 * GTA2-ish road graph extracted from a tile map.
 *
 * Why:
 * - Grid A* works, but it creates micro-zigzags and "floaty" paths.
 * - GTA2 traffic / police operate on lanes (nodes/edges).
 * - This builds a lightweight nodes/edges graph from road tiles (tile id = 2 by convention).
 *
 * Map conventions (Map.tileColor):
 * 0 = ground, 1 = solid, 2 = road, 3 = sidewalk
 */

const DIRS4 = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 }
];

function idx(x, y, w) { return y * w + x; }

export function worldToTile(map, wx, wy) {
  const ts = map.tileSize ?? 64;
  return { tx: Math.floor(wx / ts), ty: Math.floor(wy / ts) };
}

export function tileToWorldCenter(map, tx, ty) {
  const ts = map.tileSize ?? 64;
  return { x: (tx + 0.5) * ts, y: (ty + 0.5) * ts };
}

/**
 * Spiral search around a world position to find the nearest road tile.
 * Returns {tx,ty} or null.
 */
export function snapWorldToRoadTile(map, wx, wy, roadTile = 2, maxRadiusTiles = 12) {
  if (!map?.tileAt) return null;
  const { tx, ty } = worldToTile(map, wx, wy);
  const w = map.width, h = map.height;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < w && y < h;

  if (inBounds(tx, ty) && map.tileAt(tx, ty) === roadTile) return { tx, ty };

  for (let r = 1; r <= maxRadiusTiles; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (!inBounds(x, y)) continue;
        if (map.tileAt(x, y) === roadTile) return { tx: x, ty: y };
      }
    }
  }
  return null;
}

function isOpposite(a, b) {
  return (a.dx === -b.dx && a.dy === -b.dy);
}

/**
 * Build the road graph.
 *
 * Output:
 * {
 *   roadTile,
 *   nodes: [{id, tx, ty, x, y}],
 *   // Directed edges (one-way & lanes aware)
 *   dirEdges: [{id, from, to, tiles:[{tx,ty},...], cost, dirX, dirY, lanes, undirectedId}],
 *   // Undirected connectivity (used for choke points / bridges)
 *   undirEdges: [{id, u, v, cost, isBridge, bridgeScore, dirEdgeIds:number[]}],
 *   adj: Array<Array<{to, edge, cost, dirX, dirY, lanes, undirectedId}>>,
 *   nodeId: Int32Array (tileIndex -> node id or -1),
 *   tileToNode: Int32Array (tileIndex -> nearest node id for road tiles, else -1),
 *   tileToNodeDist: Uint16Array (steps to nearest node, 65535 if none)
 * }
 */
export function buildRoadGraph(map, opts = {}) {
  const roadTile = Number.isFinite(opts.roadTile) ? opts.roadTile : 2;
  const w = map.width, h = map.height;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const isRoad = (x, y) => inBounds(x, y) && map.tileAt(x, y) === roadTile;

  // Optional per-tile metadata (Map.oneWayAt / Map.laneCountAt)
  const oneWayAt = (x, y) => (typeof map.oneWayAt === "function" ? map.oneWayAt(x, y) : 0);
  const laneCountAt = (x, y) => (typeof map.laneCountAt === "function" ? map.laneCountAt(x, y) : 1);

  /**
   * Encodage one-way:
   * 0=2-sens, 1=E,2=W,3=S,4=N
   */
  const tileAllowsDir = (tx, ty, dx, dy) => {
    const ow = oneWayAt(tx, ty) | 0;
    if (!ow) return true;
    if (ow === 1) return dx === 1 && dy === 0;
    if (ow === 2) return dx === -1 && dy === 0;
    if (ow === 3) return dx === 0 && dy === 1;
    if (ow === 4) return dx === 0 && dy === -1;
    return true;
  };

  const segmentLaneCount = (tiles) => {
    // lanes par sens: on prend le max pour que l'edge garde la capacité la plus large.
    let m = 1;
    for (const t of tiles) {
      const lc = laneCountAt(t.tx, t.ty) | 0;
      if (lc > m) m = lc;
    }
    return Math.max(1, Math.min(4, m));
  };

  const nodeId = new Int32Array(w * h);
  nodeId.fill(-1);

  /** @type {{id:number,tx:number,ty:number,x:number,y:number}[]} */
  const nodes = [];

  // Pass 1: mark node tiles (intersections, dead-ends, turns)
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      if (!isRoad(tx, ty)) continue;

      const nbs = [];
      for (const d of DIRS4) {
        if (isRoad(tx + d.dx, ty + d.dy)) nbs.push(d);
      }

      const degree = nbs.length;
      let isNode = false;
      if (degree !== 2) {
        isNode = true; // intersections / ends
      } else {
        // degree==2 but a turn => node
        if (!isOpposite(nbs[0], nbs[1])) isNode = true;
      }

      if (isNode) {
        const id = nodes.length;
        nodeId[idx(tx, ty, w)] = id;
        const c = tileToWorldCenter(map, tx, ty);
        nodes.push({ id, tx, ty, x: c.x, y: c.y });
      }
    }
  }

  /** @type {{id:number,from:number,to:number,tiles:{tx:number,ty:number}[],cost:number,dirX:number,dirY:number,lanes:number,undirectedId:number}[]} */
  const dirEdges = [];
  /** @type {{id:number,u:number,v:number,cost:number,isBridge:boolean,bridgeScore:number,dirEdgeIds:number[]}[]} */
  const undirEdges = [];
  /** @type {Array<Array<{to:number,edge:number,cost:number,dirX:number,dirY:number,lanes:number,undirectedId:number}>>} */
  const adj = Array.from({ length: nodes.length }, () => []);

  const dirEdgeSet = new Set(); // key "from|to"
  const undirMap = new Map();   // key "min|max" -> undirected id

  // Pass 2: connect nodes by walking straight segments (directed edges).
  for (const n of nodes) {
    for (const d of DIRS4) {
      const sx = n.tx + d.dx;
      const sy = n.ty + d.dy;
      if (!isRoad(sx, sy)) continue;

      // Walk until next node (or dead end)
      let x = sx;
      let y = sy;
      const tiles = [{ tx: n.tx, ty: n.ty }];

      while (isRoad(x, y)) {
        tiles.push({ tx: x, ty: y });
        const nid = nodeId[idx(x, y, w)];
        if (nid !== -1 && nid !== n.id) {
          const from = n.id;
          const to = nid;

          // One-way gating: every tile on the segment must allow travel in this direction.
          let ok = true;
          // Skip first tile (node tile), it can be treated as intersection.
          for (let i = 1; i < tiles.length; i++) {
            const t = tiles[i];
            if (!tileAllowsDir(t.tx, t.ty, d.dx, d.dy)) { ok = false; break; }
          }

          if (ok) {
            const keyDir = `${from}|${to}`;
            if (!dirEdgeSet.has(keyDir)) {
              dirEdgeSet.add(keyDir);

              const cost = Math.max(1, tiles.length - 1);
              const lanes = segmentLaneCount(tiles);

              const lo = Math.min(from, to);
              const hi = Math.max(from, to);
              const keyUnd = `${lo}|${hi}`;
              let undirectedId = undirMap.get(keyUnd);
              if (undirectedId == null) {
                undirectedId = undirEdges.length;
                undirMap.set(keyUnd, undirectedId);
                undirEdges.push({ id: undirectedId, u: lo, v: hi, cost, isBridge: false, bridgeScore: 0, dirEdgeIds: [] });
              }

              const eId = dirEdges.length;
              dirEdges.push({ id: eId, from, to, tiles, cost, dirX: d.dx, dirY: d.dy, lanes, undirectedId });

              undirEdges[undirectedId].dirEdgeIds.push(eId);
              // Undirected cost = min cost encountered
              undirEdges[undirectedId].cost = Math.min(undirEdges[undirectedId].cost, cost);

              adj[from].push({ to, edge: eId, cost, dirX: d.dx, dirY: d.dy, lanes, undirectedId });
            }
          }
          break;
        }

        x += d.dx;
        y += d.dy;
      }
    }
  }

  // Pass 2b: compute bridge edges (choke points) on the undirected graph.
  // "Bridge" = edge whose removal disconnects the graph.
  // NOTE: the recursive Tarjan implementation can overflow the call stack on large road graphs.
  // For big maps we simply skip bridge detection (isBridge stays false).
  const BRIDGE_SAFE_N = 1600;
  if (nodes.length <= BRIDGE_SAFE_N) {
    // Precompute undirected adjacency once (faster + less GC)
    const undAdj = Array.from({ length: nodes.length }, () => []);
    for (const e of undirEdges) {
      undAdj[e.u].push({ v: e.v, eId: e.id });
      undAdj[e.v].push({ v: e.u, eId: e.id });
    }
    computeBridges(nodes.length, undirEdges, (u) => undAdj[u]);
  }

  // Simple score to pick "best" choke points: longer bridges are usually more "strategic".
  for (const e of undirEdges) {
    e.bridgeScore = e.isBridge ? (e.cost * 1.0) : 0;
  }

  // Pass 3: multi-source BFS to map each road tile to its nearest node.
  const tileToNode = new Int32Array(w * h);
  tileToNode.fill(-1);
  const tileToNodeDist = new Uint16Array(w * h);
  tileToNodeDist.fill(65535);

  const q = [];
  let qh = 0;
  for (const n of nodes) {
    const k = idx(n.tx, n.ty, w);
    tileToNode[k] = n.id;
    tileToNodeDist[k] = 0;
    q.push({ tx: n.tx, ty: n.ty, id: n.id });
  }

  while (qh < q.length) {
    const cur = q[qh++];
    const cd = tileToNodeDist[idx(cur.tx, cur.ty, w)];
    for (const d of DIRS4) {
      const nx = cur.tx + d.dx;
      const ny = cur.ty + d.dy;
      if (!isRoad(nx, ny)) continue;
      const k = idx(nx, ny, w);
      if (tileToNodeDist[k] <= cd + 1) continue;
      tileToNodeDist[k] = cd + 1;
      tileToNode[k] = cur.id;
      q.push({ tx: nx, ty: ny, id: cur.id });
    }
  }

  return { roadTile, nodes, dirEdges, undirEdges, adj, nodeId, tileToNode, tileToNodeDist };
}

/**
 * Tarjan bridge-finding on an undirected graph.
 * Mutates undirEdges[*].isBridge.
 *
 * @param {number} N number of nodes
 * @param {{id:number,u:number,v:number,isBridge:boolean}[]} undirEdges
 * @param {(u:number)=>{v:number,eId:number}[]} neighbors
 */
function computeBridges(N, undirEdges, neighbors) {
  const disc = new Int32Array(N);
  const low = new Int32Array(N);
  const parent = new Int32Array(N);
  disc.fill(-1);
  low.fill(-1);
  parent.fill(-1);
  let time = 0;

  const dfs = (u) => {
    disc[u] = low[u] = time++;
    for (const { v, eId } of neighbors(u)) {
      if (disc[v] === -1) {
        parent[v] = u;
        dfs(v);
        low[u] = Math.min(low[u], low[v]);
        // Bridge condition
        if (low[v] > disc[u]) {
          const e = undirEdges[eId];
          if (e) e.isBridge = true;
        }
      } else if (v !== parent[u]) {
        low[u] = Math.min(low[u], disc[v]);
      }
    }
  };

  for (let i = 0; i < N; i++) {
    if (disc[i] === -1) dfs(i);
  }
}
