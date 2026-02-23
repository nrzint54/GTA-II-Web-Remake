import { Entity } from "./Entity.js";
import { moveWithTileCollisions } from "../physics/Physics.js";
import { entityBroadphaseAABB } from "../physics/OBB.js";
import { worldToTile, snapToNearestPassableTile, findPathAStar, pathToWaypoints } from "../police/PoliceNav.js";
import { findGraphWaypoints, snapWorldToNearestRoadNode } from "../police/RoadGraphNav.js";
import { getVehicleDef } from "./VehicleDefs.js";

/**
 * CopCar (V8_b)
 *
 * Deux modes:
 * 1) IA police (par défaut) : poursuit le joueur et tente de le ram.
 * 2) Conduite joueur : si this.driver est défini (vol GTA style),
 *    alors la voiture obéit aux inputs et l'IA est désactivée.
 *
 * FX:
 * - gyrophare (sirenOn) + sirenT
 * - fumée si low HP
 * - explosion si HP <= 0
 * - dégâts sur impact mur (similaire Vehicle.js)
 */
export class CopCar extends Entity {
  constructor({ x, y, model = "COPCAR" }) {
    const def = getVehicleDef(model);
    super({ x, y, w: def.w, h: def.h });
    this.kind = "copcar";
    this.model = def.id;
    this.name = def.name;
    this.color = def.color;

    // "volable": Player mettra driver dynamiquement
    this.driver = null;

    // sirène
    this.sirenOn = true;
    this.sirenT = 0;

    // physique (data-driven)
    this.accel = def.accel;
    this.brake = def.brake;
    this.maxSpeed = def.maxSpeed;
    this.reverseMaxSpeed = def.reverseMaxSpeed;
    this.friction = def.friction;
    this.turnSpeed = def.turnSpeed;
// PV + FX
    this.health = def.health;
    this.healthMax = def.health;
this.dead = false;
    this.smoke = 0;

    // impact mur
    this._impactCd = 0;
    this._impactMinSpeed = 120;
    this._impactScale = 0.10;
    this.invMass = def.invMass;
    this.solid = true;

    // Hitbox orientée (GTA2-like) pour collisions entité↔entité.
    // IMPORTANT: l'offset doit matcher VehicleSpriteBank.singleAngleOffset.
    this.collisionShape = "obb";
    this.collisionAngleOffset = Math.PI / 2;
    this.collisionScaleX = 0.86;
    this.collisionScaleY = 0.92;

    this._ramCooldown = 0;

    // wall avoid tuning (IA)
    this._avoidStrength = 2400;
    this._feelAhead = 92;
    this._feelSide = 64;
  

    // --- Police AI (pilotage par PoliceManager) ---
    // Cible world (optionnelle). Si null -> CopCar vise player.
    this.aiTargetX = null;
    this.aiTargetY = null;
    // "hot" = poursuite (player vu récemment), "search" = recherche autour du last-known.
    this.aiMode = "hot";
    this.aiWanted = 0;

    // Nav (A*) grid fallback
    this._nav = { waypoints: null, idx: 0, repath: 0, goalTx: null, goalTy: null, ok: false };

    // Nav (road graph) : "on rails" when map.roadGraph exists
    this._gNav = { waypoints: null, idx: 0, repath: 0, goalNode: null, ok: false };

    // Lane bias (keeps cops from perfectly stacking on the center line)
    this._laneBias = (Math.random() * 9999) | 0;
	
	// Patrol state (when wanted=0)
	this._patrol = { x: null, y: null, pickT: 0 };

  }

  /**
   * Broadphase AABB pour SpatialHash (AABB englobant l'OBB).
   */
  hitbox() {
    if (this.collisionShape === "obb") return entityBroadphaseAABB(this);
    return super.hitbox();
  }

  update({ dt, map, player, effects, input }) {
    // carcasse
    if (this.dead) {
      this.sirenOn = false; // ✅ bug gyro: jamais actif après explosion
      this.vx *= 0.9;
      this.vy *= 0.9;
      return;
    }

    // timer gyrophare
    if (this.sirenOn) this.sirenT += dt;

    // fumée / explosion
    const hp = this.health ?? 120;
    if (hp <= 50 && effects?.addSmoke) {
      // fumée plus dense quand HP bas
      this.smoke = Math.min(1, (50 - hp) / 50);
      if (Math.random() < (0.10 + this.smoke * 0.12)) {
        effects.addSmoke(this.x, this.y, 14 + this.smoke * 14);
      }
    } else {
      this.smoke = 0;
    }

    if (hp <= 0) {
      this.explode({ effects, player });
      return;
    }

    // ----- Conduite joueur (vol) -----
    if (this.driver) {
      const steer = input?.axisX?.() ?? 0;
      // IMPORTANT (cohérence avec Player/Input):
      // axisY() renvoie -1 quand on appuie sur "haut" => on inverse pour accélérer vers l'avant.
      const throttle = -(input?.axisY?.() ?? 0);

      if (steer !== 0) this.angle += steer * this.turnSpeed * dt;

      const fx = Math.cos(this.angle);
      const fy = Math.sin(this.angle);
      const isReverse = throttle < 0;
      const a = isReverse ? this.brake : this.accel;

      this.vx += fx * throttle * a * dt;
      this.vy += fy * throttle * a * dt;

      // Clamp vitesse (avant/arrière)
      const speed = this.vx * fx + this.vy * fy;
      if (speed > this.maxSpeed) {
        this.vx = fx * this.maxSpeed;
        this.vy = fy * this.maxSpeed;
      } else if (speed < -this.reverseMaxSpeed) {
        this.vx = fx * -this.reverseMaxSpeed;
        this.vy = fy * -this.reverseMaxSpeed;
      }
const wl = Math.max(0, Math.floor(this.aiWanted ?? 0));
		if (wl <= 0) {
		  this.sirenOn = false;

		  // Si on est en patrouille, on continue à rouler "normalement" (sans poursuite)
		  if ((this.aiMode ?? "idle") === "patrol") {
			this._updatePatrol({ dt, map, effects });
			return;
		  }

		  // Sinon: idle = freinage doux
		  const fr = Math.max(0, 1 - this.friction * dt);
		  this.vx *= fr;
		  this.vy *= fr;
		  this._moveWithImpactDamage({ dt, map, effects });
		  return;
		}

    }

    // ----- IA police -----
    // Si pas de wanted, la copcar se "désengage" (évite la poursuite infinie quand le wanted retombe à 0).
    const wl = Math.max(0, Math.floor(this.aiWanted ?? 0));
    if (wl <= 0) {
	  this.sirenOn = false;

	  // Patrouille: continue à rouler sans poursuite, au lieu de rester figée.
	  if ((this.aiMode ?? "idle") === "patrol") {
		this._updatePatrol({ dt, map, effects });
		return;
	  }

	  // Idle: freinage doux
	  const fr = Math.max(0, 1 - this.friction * dt);
	  this.vx *= fr;
	  this.vy *= fr;
	  this._moveWithImpactDamage({ dt, map, effects });
	  return;
	}


    this._ramCooldown = Math.max(0, this._ramCooldown - dt);

    // --- cible police (injectée par PoliceManager) ---
    const tgtX0 = Number.isFinite(this.aiTargetX) ? this.aiTargetX : (player.x ?? 0);
    const tgtY0 = Number.isFinite(this.aiTargetY) ? this.aiTargetY : (player.y ?? 0);

    // Prédiction en poursuite "hot" (surtout si joueur en véhicule)
    let tgtX = tgtX0;
    let tgtY = tgtY0;
    if ((this.aiMode ?? "hot") === "hot") {
      const lead = (player.inVehicle ? 0.55 : 0.25);
      const pvx = (player.inVehicle ? (player.inVehicle.vx ?? 0) : (player.vx ?? 0));
      const pvy = (player.inVehicle ? (player.inVehicle.vy ?? 0) : (player.vy ?? 0));
      tgtX += pvx * lead;
      tgtY += pvy * lead;
    }

    // Ajuste légère dynamique selon wanted (plus haut = plus agressif)
    const wanted = Math.max(0, Math.min(5, this.aiWanted ?? (player.wanted ?? 0)));
    const maxSp = 240 + wanted * 18;
    const accel = 520 + wanted * 24;
    this.maxSpeed = maxSp;
    this.accel = accel;

    // --- Navigation : road graph (preferred) -> grid A* fallback ---
    let aimX = tgtX;
    let aimY = tgtY;

    if (map?.roadGraph?.nodes?.length) {
      const wp = this._navWaypointGraph({ dt, map, targetX: tgtX, targetY: tgtY });
      if (wp) { aimX = wp.x; aimY = wp.y; }
      else {
        const wp2 = this._navWaypoint({ dt, map, targetX: tgtX, targetY: tgtY });
        if (wp2) { aimX = wp2.x; aimY = wp2.y; }
      }
    } else if (map?.tileAt && map?.width && map?.height) {
      const wp = this._navWaypoint({ dt, map, targetX: tgtX, targetY: tgtY });
      if (wp) { aimX = wp.x; aimY = wp.y; }
    }

    const toAx = aimX - this.x;
    const toAy = aimY - this.y;
    const distA = Math.hypot(toAx, toAy) || 1;

    const targetAng = Math.atan2(toAy, toAx);

    const avoid = computeWallAvoid(this, map);
    const desiredAng = wrapAngle(targetAng + avoid.turn);
    this.angle = rotateTowards(this.angle, desiredAng, this.turnSpeed * dt);

    let throttle = distA > 60 ? 1 : 0.25;
    throttle *= avoid.throttle;

    // accélère vers l’avant
    this.vx += Math.cos(this.angle) * this.accel * throttle * dt;
    this.vy += Math.sin(this.angle) * this.accel * throttle * dt;

    // poussée d’évitement
    this.vx += avoid.fx * dt;
    this.vy += avoid.fy * dt;

    // clamp speed
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > this.maxSpeed) {
      const s = this.maxSpeed / sp;
      this.vx *= s;
      this.vy *= s;
    }

    // friction
    const fr = Math.max(0, 1 - this.friction * dt);
    this.vx *= fr;
    this.vy *= fr;

    this._moveWithImpactDamage({ dt, map, effects });

    // --- ram si proche ---
    const d2 = ((player.x ?? 0) - this.x) ** 2 + ((player.y ?? 0) - this.y) ** 2;
    if (d2 < 28 * 28 && this._ramCooldown === 0) {
      this._ramCooldown = 0.6;

      const toPx = (player.x ?? 0) - this.x;
      const toPy = (player.y ?? 0) - this.y;
      const dist = Math.hypot(toPx, toPy) || 1;
      const nx = toPx / dist;
      const ny = toPy / dist;

      const target = player.inVehicle ?? player;

      if (target === player) {
        player.health = Math.max(0, (player.health ?? 100) - 8);
        player.vx = (player.vx ?? 0) + nx * 220;
        player.vy = (player.vy ?? 0) + ny * 220;
      } else {
        target.health = Math.max(0, (target.health ?? 100) - 12);
        target.vx = (target.vx ?? 0) + nx * 180;
        target.vy = (target.vy ?? 0) + ny * 180;
      }

      // NOTE: Être percuté par la police n'augmente pas le wanted (le crime vient du joueur).
	}
  }

  _moveWithImpactDamage({ dt, map, effects }) {
    // dégâts mur (si tile collision bloque)
    this._impactCd = Math.max(0, (this._impactCd ?? 0) - dt);

    const reqDx = (this.vx ?? 0) * dt;
    const reqDy = (this.vy ?? 0) * dt;

    const bx = this.x, by = this.y;
    moveWithTileCollisions(this, map, reqDx, reqDy);
    const ax = this.x - bx, ay = this.y - by;

    const reqLen = Math.hypot(reqDx, reqDy);
    const actLen = Math.hypot(ax, ay);
    const blocked = Math.max(0, reqLen - actLen);

    const sp = Math.hypot(this.vx ?? 0, this.vy ?? 0);

    if (this._impactCd === 0 && reqLen > 0.001 && blocked > 0.5 && sp > this._impactMinSpeed) {
      const frac = Math.min(1, blocked / reqLen);
      const dmg = Math.floor(sp * this._impactScale * (0.35 + 0.65 * frac));
      if (dmg > 0) {
        this.health = Math.max(0, (this.health ?? 120) - dmg);
        this._impactCd = 0.12;

        // FX impact (étincelles)
        effects?.addSparks?.(this.x, this.y, 6 + Math.floor(frac * 6), 240 + sp * 0.2);
      }
    }
  }

  explode({ effects, player }) {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this.sirenOn = false;

    effects?.addExplosion?.(this.x, this.y, 46);

    // si le joueur est dedans => mort dedans (pas d'éjection)
    if (player?.inVehicle === this) {
      player.health = 0; // Player gère WASTED
    }

    this.driver = null;
    this.color = "#444";
    this.solid = true;
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * Retourne un waypoint world (center de tile) à suivre pour rejoindre target.
   * Recalcule un chemin A* toutes les ~0.6s (ou si la tile-goal change).
   *
   * @returns {{x:number,y:number}|null}
   */
  _navWaypoint({ dt, map, targetX, targetY }) {
    // Si la cible est déjà très proche, vise-la directement (évite des zigzags).
    const directD = Math.hypot((targetX ?? 0) - this.x, (targetY ?? 0) - this.y);
    if (directD < 180) return null;

    const nav = (this._nav ??= { waypoints: null, idx: 0, repath: 0, goalTx: null, goalTy: null, ok: false });
    nav.repath = Math.max(0, (nav.repath ?? 0) - dt);

    const goal = snapToNearestPassableTile(map, targetX, targetY, "car", 12);
    if (!goal) {
      nav.ok = false;
      nav.waypoints = null;
      return null;
    }

    const needRepath =
      nav.repath === 0 ||
      nav.goalTx !== goal.tx ||
      nav.goalTy !== goal.ty ||
      !nav.waypoints ||
      nav.idx >= nav.waypoints.length;

    if (needRepath) {
      // Start = tile la plus proche praticable (évite spawn dans mur)
      const start =
        snapToNearestPassableTile(map, this.x, this.y, "car", 8) ??
        worldToTile(map, this.x, this.y);

      const tilePath = findPathAStar(map, start, goal, "car", 4500);
      const wps = pathToWaypoints(map, tilePath, true);

      nav.waypoints = wps;
      nav.idx = 0;
      nav.goalTx = goal.tx;
      nav.goalTy = goal.ty;
      nav.repath = 0.55 + Math.random() * 0.25;
      nav.ok = !!(wps && wps.length);
    }

    if (!nav.ok || !nav.waypoints) return null;

    // Avance dans le chemin si on est proche du waypoint
    const wp = nav.waypoints[nav.idx];
    if (wp) {
      const d = Math.hypot(wp.x - this.x, wp.y - this.y);
      if (d < 14 && nav.idx < nav.waypoints.length - 1) nav.idx++;
    }

    return nav.waypoints[nav.idx] ?? null;
  }

  /**
   * Road graph nav (preferred): builds waypoints along road edges.
   * Returns a world waypoint to aim at, or null.
   */
  _navWaypointGraph({ dt, map, targetX, targetY }) {
    const directD = Math.hypot((targetX ?? 0) - this.x, (targetY ?? 0) - this.y);
    // In intercept mode, we keep using rails even when close, to avoid last-second zigzags.
    if ((this.aiMode ?? "hot") !== "intercept" && directD < 200) return null;

    const nav = (this._gNav ??= { waypoints: null, idx: 0, repath: 0, goalNode: null, ok: false });
    nav.repath = Math.max(0, (nav.repath ?? 0) - dt);

    const goalNode = snapWorldToNearestRoadNode(map, targetX, targetY, 14);
    if (goalNode == null) {
      nav.ok = false;
      nav.waypoints = null;
      return null;
    }

    const needRepath =
      nav.repath === 0 ||
      nav.goalNode !== goalNode ||
      !nav.waypoints ||
      nav.idx >= nav.waypoints.length;

    if (needRepath) {
      const wps = findGraphWaypoints(map, this.x, this.y, targetX, targetY, { laneBias: this._laneBias });
      nav.waypoints = wps;
      nav.idx = 0;
      nav.goalNode = goalNode;
      nav.repath = 0.65 + Math.random() * 0.25;
      nav.ok = !!(wps && wps.length);
    }

    if (!nav.ok || !nav.waypoints) return null;

    const wp = nav.waypoints[nav.idx];
    if (wp) {
      const d = Math.hypot(wp.x - this.x, wp.y - this.y);
      if (d < 18 && nav.idx < nav.waypoints.length - 1) nav.idx++;
    }

    return nav.waypoints[nav.idx] ?? null;
  }
  
  _updatePatrol({ dt, map, effects }) {
  // Tuning patrouille (plus calme que la poursuite)
  const patrolMax = 170;
  const patrolAccel = 340;

  // (re)choix d'une destination de patrouille
  this._patrol.pickT = Math.max(0, (this._patrol.pickT ?? 0) - dt);

  const pickNew =
    !Number.isFinite(this._patrol.x) ||
    !Number.isFinite(this._patrol.y) ||
    this._patrol.pickT === 0 ||
    Math.hypot((this._patrol.x ?? 0) - this.x, (this._patrol.y ?? 0) - this.y) < 40;

  if (pickNew) {
    // Prefer road graph nodes if available (meilleur “GTA2 feel”)
    const g = map?.roadGraph;
    if (g?.nodes?.length) {
      let best = null;
      let bestD = -1;
      // on prend une node "loin" pour éviter les micro-tours
      for (let i = 0; i < 10; i++) {
        const n = g.nodes[(Math.random() * g.nodes.length) | 0];
        const d = Math.hypot((n.x ?? 0) - this.x, (n.y ?? 0) - this.y);
        if (d > bestD) { bestD = d; best = n; }
      }
      if (best) {
        this._patrol.x = best.x;
        this._patrol.y = best.y;
      }
    }

    // fallback: cible random autour si pas de graphe
    if (!Number.isFinite(this._patrol.x) || !Number.isFinite(this._patrol.y)) {
      const ts = map?.tileSize ?? 64;
      const a = Math.random() * Math.PI * 2;
      const distTiles = 6 + Math.random() * 10;
      this._patrol.x = this.x + Math.cos(a) * distTiles * ts;
      this._patrol.y = this.y + Math.sin(a) * distTiles * ts;
    }

    this._patrol.pickT = 2.2 + Math.random() * 2.2;
    // Reset nav so it recomputes
    if (this._nav) { this._nav.waypoints = null; this._nav.idx = 0; this._nav.repath = 0; }
    if (this._gNav) { this._gNav.waypoints = null; this._gNav.idx = 0; this._gNav.repath = 0; }
  }

  const tgtX = this._patrol.x;
  const tgtY = this._patrol.y;

  // Navigation: graphe route -> fallback A*
  let aimX = tgtX, aimY = tgtY;

  if (map?.roadGraph?.nodes?.length) {
    const wp = this._navWaypointGraph({ dt, map, targetX: tgtX, targetY: tgtY });
    if (wp) { aimX = wp.x; aimY = wp.y; }
  } else if (map?.tileAt && map?.width && map?.height) {
    const wp2 = this._navWaypoint({ dt, map, targetX: tgtX, targetY: tgtY });
    if (wp2) { aimX = wp2.x; aimY = wp2.y; }
  }

  // Pilotage (copié du mode poursuite mais plus doux)
  this.maxSpeed = patrolMax;
  this.accel = patrolAccel;

  const toAx = aimX - this.x;
  const toAy = aimY - this.y;
  const distA = Math.hypot(toAx, toAy) || 1;

  const targetAng = Math.atan2(toAy, toAx);

  // évitement murs (si tu as computeWallAvoid dans le fichier)
	  const avoid = computeWallAvoid(this, map);
	  const desiredAng = wrapAngle(targetAng + avoid.turn);
	  this.angle = rotateTowards(this.angle, desiredAng, this.turnSpeed * dt);

	  let throttle = distA > 80 ? 0.75 : 0.2;
	  throttle *= avoid.throttle;

	  this.vx += Math.cos(this.angle) * this.accel * throttle * dt;
	  this.vy += Math.sin(this.angle) * this.accel * throttle * dt;

	  this.vx += avoid.fx * dt;
	  this.vy += avoid.fy * dt;

	  // clamp + friction
	  const sp = Math.hypot(this.vx, this.vy);
	  if (sp > this.maxSpeed) {
		const s = this.maxSpeed / sp;
		this.vx *= s;
		this.vy *= s;
	  }

	  const fr = Math.max(0, 1 - this.friction * dt);
	  this.vx *= fr;
	  this.vy *= fr;

	  this._moveWithImpactDamage({ dt, map, effects });
	}



  serialize() {
    return {
      ...super.serialize(),
      model: this.model,
      name: this.name,
      color: this.color,
      driver: !!this.driver,
      sirenOn: !!this.sirenOn,
      health: this.health,
      dead: this.dead
    };
  }
}

function computeWallAvoid(car, map) {
  if (!map?.aabbHitsSolid) return { turn: 0, fx: 0, fy: 0, throttle: 1 };

  const ang = Number.isFinite(car.angle) ? car.angle : 0;

  const fx = Math.cos(ang);
  const fy = Math.sin(ang);

  const leftAng = ang - 0.65;
  const rightAng = ang + 0.65;

  const lx = Math.cos(leftAng);
  const ly = Math.sin(leftAng);
  const rx = Math.cos(rightAng);
  const ry = Math.sin(rightAng);

  const hitF = feelHit(map, car.x + fx * car._feelAhead, car.y + fy * car._feelAhead);
  const hitL = feelHit(map, car.x + lx * car._feelSide, car.y + ly * car._feelSide);
  const hitR = feelHit(map, car.x + rx * car._feelSide, car.y + ry * car._feelSide);

  if (!hitF && !hitL && !hitR) return { turn: 0, fx: 0, fy: 0, throttle: 1 };

  let turn = 0;
  if (hitL) turn += 0.9;
  if (hitR) turn -= 0.9;
  if (hitF) {
    if (hitL && !hitR) turn -= 1.2;
    else if (hitR && !hitL) turn += 1.2;
    else turn += (Math.random() < 0.5 ? -1 : 1) * 1.0;
  }

  let pushX = 0, pushY = 0;
  const sideX = -fy;
  const sideY = fx;

  if (hitL) { pushX += sideX; pushY += sideY; }
  if (hitR) { pushX -= sideX; pushY -= sideY; }
  if (hitF) { pushX -= fx; pushY -= fy; }

  const mag = Math.hypot(pushX, pushY) || 1;
  pushX /= mag; pushY /= mag;

  const strength = car._avoidStrength * (hitF ? 1.2 : 1.0);
  const outFx = pushX * strength;
  const outFy = pushY * strength;

  const throttle = hitF ? 0.45 : 0.85;
  return { turn, fx: outFx, fy: outFy, throttle };
}

function feelHit(map, x, y) {
  const box = { x: x - 6, y: y - 6, w: 12, h: 12 };
  return !!map.aabbHitsSolid(box);
}

function rotateTowards(a, b, maxDelta) {
  a = wrapAngle(a);
  b = wrapAngle(b);
  let d = wrapAngle(b - a);
  if (d > maxDelta) d = maxDelta;
  if (d < -maxDelta) d = -maxDelta;
  return wrapAngle(a + d);
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
