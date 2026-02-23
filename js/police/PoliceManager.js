import { CopCar } from "../entities/CopCar.js";
import { CopPed } from "../entities/CopPed.js";
import { snapToNearestPassableTile, tileToWorldCenter } from "./PoliceNav.js";
import { pickRoadPointAhead, predictPlayerNodeRoute, pickSmartInterceptNode, pickChokepointRoadblock } from "./RoadGraphNav.js";

/**
 * PoliceManager (V8_b)
 *
 * Objectif:
 * - Convertir player.wanted (0..5) en pression policière.
 * - Spawner des CopCar (poursuite) et des CopPed (à pied).
 * - "GTA++": interception + barrages:
 *   - Interception: copcar spawn devant la trajectoire
 *   - Barrage: 2 copcars en travers + 2 cops qui sortent
 *
 * Contrat:
 * - update({dt,map,entities,player,hud,camera,viewport})
 *
 * Note: on ne détruit pas les entités ici. On pousse juste dans entities[].
 */
export class PoliceManager {
  constructor() {
    /** timers */
    this._spawnT = 0;
    this._interceptT = 0;
    this._roadblockT = 0;

    /** anti-spam */
    this._maxCopCars = 6;
    this._maxCopPeds = 10;

    /** roadblock state */
    this._roadblockActive = false;
    this._roadblockCooldown = 0;

    /** perception (line-of-sight) */
    this._lastSeen = null;        // {x,y}
    this._lastSeenAge = 999;      // seconds since last seen
    this._seenThisFrame = false;

    /** wanted decay (escape) */
    this._wantedDecayGrace = 5.0; // seconds unseen before decay


    /** wanted decay step timer */
    this._decayT = 0;
  }

  update({ dt, map, entities, player, hud, camera, viewport }) {
    if (!entities || !player) return;

    // Wanted est traité comme un entier (0..5) style GTA2.
    let wantedLevel = Math.max(0, Math.min(5, Math.floor(player.wanted ?? 0)));
    if ((player.wanted ?? 0) !== wantedLevel) player.wanted = wantedLevel;
    const wanted = wantedLevel;

    // Comptage (même si wanted=0, pour pouvoir désengager proprement)
    const copCars = entities.filter(e => e && e.kind === "copcar" && !e.dead);
    const copPeds = entities.filter(e => e && e.kind === "copped" && !e.dead);

    // cooldowns
    this._spawnT = Math.max(0, this._spawnT - dt);
    this._interceptT = Math.max(0, this._interceptT - dt);
    this._roadblockT = Math.max(0, this._roadblockT - dt);
    this._roadblockCooldown = Math.max(0, this._roadblockCooldown - dt);

    // Rien si wanted=0: on désengage les unités existantes (sinon elles peuvent continuer à agresser).
    if (wantedLevel <= 0) {
	  // Stand down: on coupe la poursuite, mais on ne "freeze" pas -> patrouille.
	  this._roadblockActive = false;
	  this._lastSeen = null;
	  this._lastSeenAge = 999;
	  this._seenThisFrame = false;
	  this._decayT = 0;

	  // CopCars -> patrouille
	  for (const c of copCars) {
		c.aiWanted = 0;
		c.aiMode = "patrol";
		c.aiTargetX = null;
		c.aiTargetY = null;
		c.sirenOn = false;

		// Un barrage ne doit pas rester bloqué sur la route
		if (c._isRoadblock) c._isRoadblock = false;

		// Force un repath propre
		if (c._nav) { c._nav.waypoints = null; c._nav.idx = 0; c._nav.repath = 0; }
		if (c._gNav) { c._gNav.waypoints = null; c._gNav.idx = 0; c._gNav.repath = 0; }
	  }

	  // CopPeds -> patrouille
	  for (const p of copPeds) {
		p.aiWanted = 0;
		p.aiMode = "patrol";
	  }

	  return;
	}



    // --- perception: le joueur est-il "vu" par au moins une unité ? ---
    // (Vue simplifiée: distance + line-of-sight par raycast tile)
    const seenByCar = copCars.some(c => canUnitSeePlayer(map, c, player, 520));
    const seenByPed = copPeds.some(c => canUnitSeePlayer(map, c, player, 420));
    const seen = !!(seenByCar || seenByPed);

    this._seenThisFrame = seen;
    if (seen) {
      this._lastSeen = { x: player.x ?? 0, y: player.y ?? 0 };
      this._lastSeenAge = 0;
    } else {
      this._lastSeenAge = Math.min(999, (this._lastSeenAge ?? 999) + dt);
    }
    // Escape: si le joueur n'est plus vu pendant un moment, le wanted redescend (GTA2: par paliers).
    if (seen) {
      this._decayT = 0;
    } else if ((this._lastSeenAge ?? 0) > this._wantedDecayGrace) {
      this._decayT = (this._decayT ?? 0) + dt;
      const interval = 3.0;
      if (this._decayT >= interval) {
        player.wanted = Math.max(0, wantedLevel - 1);
        wantedLevel = player.wanted;
        this._decayT = 0;
      }
    }

    // Si le wanted vient de tomber à 0, on désengage immédiatement.
    if (wantedLevel <= 0) {
      this._roadblockActive = false;
      for (const c of copCars) {
        c.aiWanted = 0;
        c.aiMode = "idle";
        c.aiTargetX = null;
        c.aiTargetY = null;
        if (!c.driver) c.sirenOn = false;
      }
      return;
    }

    const chaseTarget = (seen || !this._lastSeen) ? { x: player.x ?? 0, y: player.y ?? 0 } : this._lastSeen;
    const chaseMode = seen ? "hot" : "search";

    // --- Smart interception (GTA2-ish): some units try to cut the player off on the road graph ---
    // We predict a plausible route for the player and pick an intercept node where ETA(cop) ~= ETA(player).
    const pv = player.inVehicle;
    const pvx = (pv?.vx ?? player.vx ?? 0);
    const pvy = (pv?.vy ?? player.vy ?? 0);
    const pSpeed = Math.hypot(pvx, pvy);

    const dirLen = Math.hypot(pvx, pvy);
    const dirX = dirLen > 30 ? pvx / dirLen : Math.cos(player.angle ?? 0);
    const dirY = dirLen > 30 ? pvy / dirLen : Math.sin(player.angle ?? 0);

    const canUseGraph = !!(map?.roadGraph?.nodes?.length);
    const predictedRoute = (canUseGraph && chaseMode === "hot")
      ? predictPlayerNodeRoute(map, player.x ?? 0, player.y ?? 0, dirX, dirY, 10)
      : null;

    // Injecte la cible dans les CopCars (base chase), puis on override certaines unités en intercept.
    let idxCar = 0;
    for (const c of copCars) {
      c.aiWanted = wantedLevel;
      if (!c.driver) c.sirenOn = (wantedLevel >= 2) || (chaseMode === "hot");

      // Defaults
      c.aiMode = chaseMode;
      c.aiTargetX = chaseTarget.x;
      c.aiTargetY = chaseTarget.y;

      // Intercept: skip first unit ("lead"), and don't intercept when searching.
      if (
        wantedLevel >= 2 &&
        predictedRoute &&
        idxCar > 0 &&
        !c._isRoadblock &&
        !c.driver &&
        !c.dead
      ) {
        const dx = (player.x ?? 0) - (c.x ?? 0);
        const dy = (player.y ?? 0) - (c.y ?? 0);
        const d = Math.hypot(dx, dy);

        // Intercept only if the cop isn't already very close (otherwise it just "sticks")
        if (d > 260) {
          const copSpeed = Math.max(180, c.maxSpeed ?? 240);
          const nodeId = pickSmartInterceptNode(map, c.x ?? 0, c.y ?? 0, predictedRoute, Math.max(80, pSpeed), copSpeed);
          const n = (nodeId != null) ? map.roadGraph.nodes?.[nodeId] : null;
          if (n) {
            c.aiMode = "intercept";
            c.aiTargetX = n.x;
            c.aiTargetY = n.y;
            c._interceptNode = nodeId;
          }
        }
      }

      idxCar++;
    }


    // Arrestation "buste" simplifiée:
    // - si le joueur est à pied
    // - et qu'un CopCar (sans driver) est très proche + lent
    if (!player.inVehicle && wantedLevel >= 1) {
      for (const c of copCars) {
        if (c.driver || c.dead) continue;
        const dx = (player.x ?? 0) - (c.x ?? 0);
        const dy = (player.y ?? 0) - (c.y ?? 0);
        const d = Math.hypot(dx, dy);
        const sp = Math.hypot(c.vx ?? 0, c.vy ?? 0);
        if (d < 26 && sp < 55) {
          player.busted?.();
          break;
        }
      }
    }


    // 1) Spawn "pression" (copcars de base)
    const desiredCars = Math.min(this._maxCopCars, Math.max(1, wantedLevel)); // 1..6
    if (copCars.length < desiredCars && this._spawnT === 0) {
      this._spawnT = 1.0; // cadence
      const pos = pickSpawnNearPlayer({ map, player, camera, viewport, minDist: 260, maxDist: 520 });
      if (pos) entities.push(new CopCar(pos));
    }

    // 2) Interception (spawn devant la trajectoire)
    if (wantedLevel >= 2 && this._interceptT === 0) {
      this._interceptT = 3.0 - wanted * 0.3; // plus wanted => plus fréquent
      const pos = pickInterceptPoint({ map, player, camera, viewport });
      if (pos && copCars.length < this._maxCopCars) {
        const c = new CopCar(pos);
        // petit "boost" pour arriver vite
        c.vx = (c.vx ?? 0) + (pos.vx ?? 0);
        c.vy = (c.vy ?? 0) + (pos.vy ?? 0);
        entities.push(c);
      }
    }

    // 3) Barrage GTA++ (copcars en travers + cops qui sortent)
    if (wantedLevel >= 3 && !this._roadblockActive && this._roadblockCooldown === 0 && this._roadblockT === 0) {
      this._roadblockT = 5.0;
      const ok = this._spawnRoadblock({ map, entities, player, camera, viewport });
      if (ok) {
        this._roadblockActive = true;
        this._roadblockCooldown = 10.0; // pas de barrage en boucle
        hud?.toast?.("🚧 Roadblock!", 0.9);
      }
    }

    // 4) Faire sortir des cops des voitures proches (style GTA)
    //    -> Si copcar assez proche, un flic sort et poursuit à pied.
    for (const c of copCars) {
      if (!c || c.dead) continue;
      if (c._crewExited) continue;

      const dx = player.x - c.x;
      const dy = player.y - c.y;
      const d2 = dx * dx + dy * dy;

      // si on a "verrouillé" le joueur (proche), on sort
      if (d2 < 220 * 220) {
        // Ne pas sortir si le joueur roule à fond (sinon c'est ridicule)
        const pv = player.inVehicle;
        const pSpeed = pv ? Math.hypot(pv.vx ?? 0, pv.vy ?? 0) : Math.hypot(player.vx ?? 0, player.vy ?? 0);
        if (pSpeed < 200 || wantedLevel >= 4) {
          const out = spawnCopFromCar(c, entities);
          if (out) c._crewExited = true;
        }
      }
    }

    // si tous les cops du barrage sont morts/explosés -> on libère l'état
    if (this._roadblockActive) {
      const aliveBlockers = entities.filter(e => e && e._isRoadblock && !e.dead && !e.exploded);
      if (aliveBlockers.length === 0) this._roadblockActive = false;
    }
  }

  _spawnRoadblock({ map, entities, player, camera, viewport }) {
    const base = pickRoadblockPoint({ map, player, camera, viewport });
    if (!base) return false;

    // direction principale = direction de déplacement joueur (ou angle joueur)
    const vx = (player.inVehicle?.vx ?? player.vx ?? 0);
    const vy = (player.inVehicle?.vy ?? player.vy ?? 0);
    const vlen = Math.hypot(vx, vy);
    const dirX = vlen > 1 ? (vx / vlen) : Math.cos(player.angle ?? 0);
    const dirY = vlen > 1 ? (vy / vlen) : Math.sin(player.angle ?? 0);

    // Direction of the road at the chosen point (preferred), else fallback to player dir.
    const rX = Number.isFinite(base.roadDirX) ? base.roadDirX : dirX;
    const rY = Number.isFinite(base.roadDirY) ? base.roadDirY : dirY;

    // normal = perpendiculaire: on met les voitures en travers de la route
    const nX = -rY;
    const nY = rX;

    const gap = 44; // écart entre les deux voitures
    let left = { x: base.x + nX * gap, y: base.y + nY * gap };
    let right = { x: base.x - nX * gap, y: base.y - nY * gap };

    // Snap blockers back onto passable tiles if offset pushes them off-road.
    const s1 = snapToNearestPassableTile(map, left.x, left.y, "car", 4);
    if (s1) left = tileToWorldCenter(map, s1.tx, s1.ty);
    const s2 = snapToNearestPassableTile(map, right.x, right.y, "car", 4);
    if (s2) right = tileToWorldCenter(map, s2.tx, s2.ty);

    const c1 = new CopCar(left);
    const c2 = new CopCar(right);

    // orientation en travers (90°)
    c1.angle = Math.atan2(nY, nX);
    c2.angle = Math.atan2(nY, nX);

    // marqueurs "roadblock"
    c1._isRoadblock = true;
    c2._isRoadblock = true;

    // on les fige (barrage)
    c1.accel = 0;
    c2.accel = 0;
    c1.vx = c1.vy = 0;
    c2.vx = c2.vy = 0;

    entities.push(c1, c2);

    // cops qui sortent immédiatement
    spawnCopFromCar(c1, entities, { offset: 24 });
    spawnCopFromCar(c2, entities, { offset: -24 });

    return true;
  }
}


/** --- Vision helpers (tile raycast) --- */
function canUnitSeePlayer(map, unit, player, maxDist = 480) {
  if (!unit || !player) return false;

  const ux = unit.x ?? 0;
  const uy = unit.y ?? 0;
  const px = player.x ?? 0;
  const py = player.y ?? 0;

  const dx = px - ux;
  const dy = py - uy;
  const d = Math.hypot(dx, dy);
  if (d > maxDist) return false;

  // sans map collision, on considère visible
  if (!map?.aabbHitsSolid) return true;

  return hasLineOfSight(map, ux, uy, px, py);
}

function hasLineOfSight(map, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return true;

  const ts = map?.tileSize ?? 64;
  const step = Math.max(12, (ts / 4) | 0); // world units (scale with tileSize)
  const steps = Math.ceil(len / step);

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x0 + dx * t;
    const y = y0 + dy * t;

    // petit AABB au point (évite les faux-positifs)
    if (map.aabbHitsSolid({ x: x - 2, y: y - 2, w: 4, h: 4 })) return false;
  }
  return true;
}


/** Spawn positions helpers */
function pickSpawnNearPlayer({ map, player, camera, viewport, minDist = 240, maxDist = 520 }) {
  const ts = map?.tileSize ?? 64;
  const scale = ts / 32;
  // Conserve les mêmes distances en "tuiles" qu'avant le passage en tileSize=64
  minDist *= scale;
  maxDist *= scale;
  // si pas de camera/viewport, fallback simple
  const px = player.x ?? 0;
  const py = player.y ?? 0;

  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = minDist + Math.random() * (maxDist - minDist);
    const x = px + Math.cos(a) * r;
    const y = py + Math.sin(a) * r;

    // évite murs
    if (map?.aabbHitsSolid?.({ x: x - ts / 2, y: y - ts / 2, w: ts, h: ts })) continue;

    // Snap sur une tile praticable (préférence routes)
    const snap = snapToNearestPassableTile(map, x, y, "car", 10);
    if (!snap) continue;
    const c = tileToWorldCenter(map, snap.tx, snap.ty);
    return { x: c.x, y: c.y };
  }
  return null;
}

function pickInterceptPoint({ map, player, camera, viewport }) {
  const px = player.x ?? 0;
  const py = player.y ?? 0;

  const pv = player.inVehicle;
  const vx = (pv?.vx ?? player.vx ?? 0);
  const vy = (pv?.vy ?? player.vy ?? 0);

  const sp = Math.hypot(vx, vy);
  const dirX = sp > 30 ? vx / sp : Math.cos(player.angle ?? 0);
  const dirY = sp > 30 ? vy / sp : Math.sin(player.angle ?? 0);

  // Preferred: use road graph to pick a road tile ahead (more GTA2-like).
  if (map?.roadGraph?.nodes?.length) {
    const p = pickRoadPointAhead(map, px, py, dirX, dirY, 14, 6);
    if (p) return { x: p.x, y: p.y, vx: -dirX * 40, vy: -dirY * 40 };
  }

  // Fallback: old grid-based pick.
  const ts = map?.tileSize ?? 64;
  const scale = ts / 32;

  const ahead = (420 + Math.random() * 220) * scale;
  const side = ((Math.random() * 2 - 1) * 140) * scale;

  const x = px + dirX * ahead + (-dirY) * side;
  const y = py + dirY * ahead + (dirX) * side;

  if (map?.aabbHitsSolid?.({ x: x - ts * 0.28, y: y - ts * 0.28, w: ts * 0.56, h: ts * 0.56 })) return null;

  const snap = snapToNearestPassableTile(map, x, y, "car", 12);
  if (!snap) return null;
  const c = tileToWorldCenter(map, snap.tx, snap.ty);

  // petite vitesse initiale vers le joueur
  return { x: c.x, y: c.y, vx: -dirX * 40, vy: -dirY * 40 };
}

function pickRoadblockPoint({ map, player, camera, viewport }) {
  // roadblock "devant" le joueur (un peu plus loin qu'intercept)
  const px = player.x ?? 0;
  const py = player.y ?? 0;

  const pv = player.inVehicle;
  const vx = (pv?.vx ?? player.vx ?? 0);
  const vy = (pv?.vy ?? player.vy ?? 0);

  const sp = Math.hypot(vx, vy);
  const dirX = sp > 30 ? vx / sp : Math.cos(player.angle ?? 0);
  const dirY = sp > 30 ? vy / sp : Math.sin(player.angle ?? 0);

  // Preferred: use road graph to pick a road tile ahead and also provide a road direction.
  if (map?.roadGraph?.nodes?.length) {
    // 1) Try to place the roadblock on a strategic choke point (bridge edge on the graph)
    const ckp = pickChokepointRoadblock(map, px, py, dirX, dirY, 18, 72);
    if (ckp) return { x: ckp.x, y: ckp.y, roadDirX: ckp.roadDirX, roadDirY: ckp.roadDirY };

    // 2) Fallback: a simple point ahead on the road tiles
    const p = pickRoadPointAhead(map, px, py, dirX, dirY, 20, 8);
    if (p) return { x: p.x, y: p.y, roadDirX: p.roadDirX, roadDirY: p.roadDirY };
  }

  // Fallback: old grid-based pick.
  const ahead = 520 + Math.random() * 240;
  const x = px + dirX * ahead;
  const y = py + dirY * ahead;

  if (map?.aabbHitsSolid?.({ x: x - 24, y: y - 24, w: 48, h: 48 })) return null;

  const snap = snapToNearestPassableTile(map, x, y, "car", 14);
  if (!snap) return null;
  const c = tileToWorldCenter(map, snap.tx, snap.ty);
  return { x: c.x, y: c.y };
}

function spawnCopFromCar(car, entities, opts = {}) {
  if (!car || car.dead) return null;

  const off = opts.offset ?? 22;
  const a = Number.isFinite(car.angle) ? car.angle : 0;
  const px = car.x + Math.cos(a + Math.PI / 2) * off;
  const py = car.y + Math.sin(a + Math.PI / 2) * off;

  const cop = new CopPed({ x: px, y: py });
  cop._fromCarId = car.id ?? null;

  entities.push(cop);
  return cop;
}
