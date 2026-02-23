import { Entity } from "./Entity.js";
import { moveWithTileCollisions } from "../physics/Physics.js";
import { fireHitscan } from "../gameplay/Weapons.js";
import { snapToNearestPassableTile, worldToTile, findPathAStar, pathToWaypoints } from "../police/PoliceNav.js";


/**
 * CopPed (V8_b)
 * - Flic à pied qui poursuit le joueur.
 * - Si wanted > 0 et qu'il atteint le joueur => "BUSTED".
 * - Tir hitscan à distance (léger) : vise le joueur (ou la voiture du joueur).
 */
export class CopPed extends Entity {
  constructor({ x, y }) {
    super({ x, y, w: 16, h: 16 });
    this.kind = "copped";
    this.color = "#1b1b1b";

    this.dead = false;
    this.health = 60;

    // mouvement
    this.accel = 1040;
    this.maxSpeed = 300;
    this.friction = 8;

    // tir
    this.shootCd = 0;
    this.shootRate = 2.2;      // tirs/sec
    this.shootRange = 240;
    this.damage = 7;

    // contact
    this._hitCd = 0;

    this.invMass = 1;
    this.solid = true;
	
	this.aiMode = "chase";
	this.aiWanted = 0;
	this._patrol = { waypoints: null, idx: 0, repath: 0, goalTx: null, goalTy: null };

  }

  update({ dt, map, player, effects }) {
    // ---- DEAD ----
    if ((this.health ?? 60) <= 0) {
      if (!this.dead) {
        this.dead = true;
        this.solid = false;
        this.vx = 0;
        this.vy = 0;
        this.color = "#555";
      }
      return;
    }

    this._hitCd = Math.max(0, (this._hitCd ?? 0) - dt);
    this.shootCd = Math.max(0, (this.shootCd ?? 0) - dt);

    const wantedLevel = Math.max(0, Math.floor(player?.wanted ?? 0));
	
	if (wantedLevel <= 0) {
		// Pas de wanted => pas d'agression.
		this.aiMode = "patrol";
		this.aiWanted = 0;
		this._updatePatrol({ dt, map });
		return;
	}

    const dx = (player.x ?? 0) - this.x;
    const dy = (player.y ?? 0) - this.y;
    const d = Math.hypot(dx, dy) || 1;

    const nx = dx / d;
    const ny = dy / d;

    // --- BUSTED au contact (si wanted) ---
    if (wantedLevel > 0 && d < 16 && this._hitCd === 0) {
      this._hitCd = 0.65;

      // si joueur en voiture : on le force à sortir puis busted
      player.busted?.();
      return;
    }

    // --- Tir hitscan (à distance) ---
    if (d < this.shootRange && this.shootCd === 0 && wantedLevel > 0) {
      this.shootCd = 1 / this.shootRate;

      // cible = joueur ou sa voiture (GTA: tu peux tirer la caisse)
      const tgt = player.inVehicle ?? player;

      const hit = fireHitscan({
        originX: this.x,
        originY: this.y,
        dirX: nx,
        dirY: ny,
        range: this.shootRange,
        shooter: this,
        entities: [tgt], // hitscan simplifié: seulement la cible
        filter: () => true
      });

      const endX = hit ? hit.hitX : (this.x + nx * 90);
      const endY = hit ? hit.hitY : (this.y + ny * 90);
      effects?.addShot?.(this.x, this.y, endX, endY);

      if (hit?.entity) {
        tgt.health = Math.max(0, (tgt.health ?? 100) - this.damage);
      }
    }

    // --- poursuite simple ---
    this.vx = (this.vx ?? 0) + nx * this.accel * dt;
    this.vy = (this.vy ?? 0) + ny * this.accel * dt;

    const sp = Math.hypot(this.vx, this.vy);
    if (sp > this.maxSpeed) {
      const s = this.maxSpeed / sp;
      this.vx *= s;
      this.vy *= s;
    }

    const fr = Math.max(0, 1 - this.friction * dt);
    this.vx *= fr;
    this.vy *= fr;

    if (Math.abs(this.vx) + Math.abs(this.vy) > 0.5) {
      this.angle = Math.atan2(this.vy, this.vx);
    }

    moveWithTileCollisions(this, map, this.vx * dt, this.vy * dt);
  }
  
  _updatePatrol({ dt, map }) {
  const nav = (this._patrol ??= { waypoints: null, idx: 0, repath: 0, goalTx: null, goalTy: null });
  nav.repath = Math.max(0, (nav.repath ?? 0) - dt);

  const needRepath =
    nav.repath === 0 ||
    !nav.waypoints ||
    nav.idx >= nav.waypoints.length;

  if (needRepath) {
    const ts = map?.tileSize ?? 64;
    const a = Math.random() * Math.PI * 2;
    const distTiles = 4 + Math.random() * 7;

    const wx = this.x + Math.cos(a) * distTiles * ts;
    const wy = this.y + Math.sin(a) * distTiles * ts;

    const goal = snapToNearestPassableTile(map, wx, wy, "ped", 10);
    const start = snapToNearestPassableTile(map, this.x, this.y, "ped", 8) ?? worldToTile(map, this.x, this.y);

    if (goal) {
      const tilePath = findPathAStar(map, start, goal, "ped", 3000);
      nav.waypoints = pathToWaypoints(map, tilePath, true);
      nav.idx = 0;
      nav.goalTx = goal.tx;
      nav.goalTy = goal.ty;
      nav.repath = 1.0 + Math.random() * 1.0;
    } else {
      nav.waypoints = null;
    }
  }

  // Marche vers le prochain waypoint
  const wp = nav.waypoints?.[nav.idx];
	  if (!wp) {
		// petit drift pour éviter de rester planté si pas de path
		const fr = Math.max(0, 1 - this.friction * dt);
		this.vx *= fr; this.vy *= fr;
		moveWithTileCollisions(this, map, this.vx * dt, this.vy * dt);
		return;
	  }

	  const dx = wp.x - this.x;
	  const dy = wp.y - this.y;
	  const d = Math.hypot(dx, dy) || 1;

	  if (d < 14 && nav.idx < nav.waypoints.length - 1) nav.idx++;

	  const nx = dx / d;
	  const ny = dy / d;

	  // vitesse de patrouille plus basse que la poursuite
	  const patrolMax = 95;
	  const patrolAccel = 260;

	  this.vx = (this.vx ?? 0) + nx * patrolAccel * dt;
	  this.vy = (this.vy ?? 0) + ny * patrolAccel * dt;

	  const sp = Math.hypot(this.vx, this.vy);
	  if (sp > patrolMax) {
		const s = patrolMax / sp;
		this.vx *= s; this.vy *= s;
	  }

	  const fr = Math.max(0, 1 - this.friction * dt);
	  this.vx *= fr; this.vy *= fr;

	  if (Math.abs(this.vx) + Math.abs(this.vy) > 0.5) {
		this.angle = Math.atan2(this.vy, this.vx);
	  }

	  moveWithTileCollisions(this, map, this.vx * dt, this.vy * dt);
	}


  serialize() {
    return { ...super.serialize(), health: this.health, dead: this.dead };
  }
}
