import { Entity } from "./Entity.js";
import { moveWithTileCollisions } from "../physics/Physics.js";
import { getVehicleDef } from "./VehicleDefs.js";
import { entityBroadphaseAABB } from "../physics/OBB.js";
import { ensureRoadGraph, snapWorldToNearestRoadNode } from "../police/RoadGraphNav.js";
import { tileToWorldCenter } from "../world/RoadGraph.js";

/**
 * Véhicule standard contrôlable par le joueur (ou laissé "libre").
 *
 * Data-driven:
 * - Les stats (maxSpeed, accel, friction, turnSpeed, invMass, health, taille…) viennent de VehicleDefs.js
 * - Le "model" est l'ID/enumeration GTA2 (ex: RTYPE, TAXI, BOXTRUCK…)
 *
 * IMPORTANT:
 * - Le joueur, quand il est conducteur, est géré via Player.inVehicle.
 * - En cas d'explosion avec joueur dedans: Vehicle met player.health=0 et laisse Player gérer WASTED/respawn.
 */
export class Vehicle extends Entity {
  /**
   * @param {object} p
   * @param {number} p.x
   * @param {number} p.y
   * @param {string} [p.model] id véhicule (ex: "ALFA", "RTYPE", "TAXI")
   * @param {string|null} [p.paintId] livery/couleur (palette-swap) pour trafic civil
   */
  constructor({ x, y, model = "ALFA", paintId = null }) {
    const def = getVehicleDef(model);
    super({ x, y, w: def.w, h: def.h });

    this.kind = "vehicle";
    this.model = def.id;
    this.name = def.name;

    // Rendu simple (Renderer2D lit e.color si présent)
    this.color = def.color;

    // Palette-swap (trafic civil): null => pas de recolor (véhicules à livrée fixe)
    this.paintId = paintId;

    /** @type {import("./Player.js").Player|null} conducteur actuel */
    this.driver = null;

    // Conduite (arcade)
    this.accel = def.accel;
    this.brake = def.brake;
    this.maxSpeed = def.maxSpeed;
    this.reverseMaxSpeed = def.reverseMaxSpeed;
    this.friction = def.friction;
    this.turnSpeed = def.turnSpeed;

    // PV + FX
    this.health = def.health;
    this.healthMax = def.health;
    this.dead = false; // carcasse (ne bouge presque plus, plus de conduite)
    this.smoke = 0;    // indicateur visuel (peut servir au renderer)

    // Dégâts mur (impact sur tile collision)
    this._impactCd = 0;          // cooldown pour éviter “mitraillette” de dégâts
    this._impactMinSpeed = 120;  // vitesse min pour faire des dégâts
    this._impactScale = 0.10;    // scale de dégâts par vitesse

    // Collisions entité↔entité
    this.invMass = def.invMass; // plus petit => plus lourd
    this.solid = true;

    // Hitbox orientée (GTA2-like) pour collisions entité↔entité.
    // IMPORTANT: l'offset doit matcher VehicleSpriteBank.singleAngleOffset.
    this.collisionShape = "obb";
    this.collisionAngleOffset = Math.PI / 2;
    // La hitbox GTA2 est généralement un peu plus petite que le sprite (padding visuel dans les PNG).
    // Tuning global (peut être raffiné par modèle plus tard).
    this.collisionScaleX = 0.86;
    this.collisionScaleY = 0.92;

    // ------------------------------------------------------------------
    // Trafic (IA civile)
    // ------------------------------------------------------------------
    // Désactivé par défaut: createWorld active ça uniquement pour les véhicules "trafic".
    this.aiTraffic = false;
    this.trafficSpeedMul = 0.78 + Math.random() * 0.18; // un peu de variété
    this._laneBias = (Math.random() * 9999) | 0;
    this._traffic = { waypoints: null, idx: 0, repath: 0, goalX: null, goalY: null, ok: false, pickT: 0 };
  }

  /**
   * Broadphase AABB:
   * - SpatialHash indexe des AABB.
   * - Pour une hitbox orientée, on renvoie l'AABB englobant l'OBB.
   */
  hitbox() {
    if (this.collisionShape === "obb") return entityBroadphaseAABB(this);
    return super.hitbox();
  }

  /**
   * @param {object} ctx
   * @param {number} ctx.dt
   * @param {object} ctx.input
   * @param {object} ctx.map
   * @param {object} ctx.effects
   * @param {Array<Entity>} ctx.entities
   * @param {object} ctx.player
   */
  update({ dt, input, map, effects, entities, player }) {
    // Carcasse: plus de logique, juste une inertie résiduelle
    if (this.dead) {
      this.vx *= 0.9;
      this.vy *= 0.9;
      return;
    }

    // --- FX fumée / explosion ---
    const hp = this.health ?? this.healthMax ?? 120;

    // Fumée progressive quand HP bas
    if (hp <= (this.healthMax ?? 120) * 0.42 && effects?.addSmoke) {
      const t = Math.max(0, (this.healthMax ?? 120) * 0.42 - hp) / Math.max(1, (this.healthMax ?? 120) * 0.42);
      this.smoke = Math.min(1, t);
      if (Math.random() < (0.10 + this.smoke * 0.12)) effects.addSmoke(this.x, this.y, 14 + this.smoke * 14);
    } else {
      this.smoke = 0;
    }

    // Explosion si HP <= 0
    if (hp <= 0) {
      this.explode({ effects, player });
      return;
    }

    // --- Sans conducteur: trafic IA (si activé) ou simple inertie ---
    if (!this.driver) {
      if (this.aiTraffic) {
        this._updateTraffic({ dt, map, effects });
        return;
      }

      const fr = Math.max(0, 1 - this.friction * dt);
      this.vx *= fr;
      this.vy *= fr;

      moveWithTileCollisions(this, map, this.vx * dt, this.vy * dt);
      return;
    }

    // ------------------------------------------------------------------
    // --- Conduite (driver présent) ---
    // ------------------------------------------------------------------
    const steer = input.axisX();     // -1..1
    // IMPORTANT (cohérence avec Player/Input):
    // Input.axisY() renvoie -1 quand on appuie sur "haut" (Z / ArrowUp).
    // Pour un véhicule, "haut" = accélérer vers l'avant => on inverse le signe.
    const throttle = -input.axisY(); // -1..1

    if (steer !== 0) this.angle += steer * this.turnSpeed * dt;

    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);

    // Accélération/ frein (quand on recule, on ne veut pas accélérer au même niveau)
    const isReverse = throttle < 0;
    const a = isReverse ? this.brake : this.accel;

    this.vx += fx * throttle * a * dt;
    this.vy += fy * throttle * a * dt;

    // Clamp vitesse (différencie avant/arrière)
    const speed = this.vx * fx + this.vy * fy; // projection sur l'axe du véhicule
    if (speed > this.maxSpeed) {
      this.vx = fx * this.maxSpeed;
      this.vy = fy * this.maxSpeed;
    } else if (speed < -this.reverseMaxSpeed) {
      this.vx = fx * -this.reverseMaxSpeed;
      this.vy = fy * -this.reverseMaxSpeed;
    }

    // Friction globale (drift simplifié)
    const fr = Math.max(0, 1 - this.friction * dt);
    this.vx *= fr;
    this.vy *= fr;

    // ------------------------------------------------------------------
    // --- Dégâts mur (tile collision qui bloque) ---
    // ------------------------------------------------------------------
    this._impactCd = Math.max(0, (this._impactCd ?? 0) - dt);

    const reqDx = this.vx * dt;
    const reqDy = this.vy * dt;

    // On mesure ce qui a été réellement effectué par la collision tiles
    const bx = this.x, by = this.y;
    moveWithTileCollisions(this, map, reqDx, reqDy);
    const ax = this.x - bx, ay = this.y - by;

    const reqLen = Math.hypot(reqDx, reqDy);
    const actLen = Math.hypot(ax, ay);
    const blocked = Math.max(0, reqLen - actLen); // portion "bloquée" par un mur

    const sp = Math.hypot(this.vx, this.vy);

    // Si on a été bloqué de manière significative à vitesse suffisante: dégâts
    if (
      this._impactCd === 0 &&
      reqLen > 0.001 &&
      blocked > 0.5 &&
      sp > this._impactMinSpeed
    ) {
      const frac = Math.min(1, blocked / reqLen); // 0..1
      const dmg = Math.floor(sp * this._impactScale * (0.35 + 0.65 * frac));
      if (dmg > 0) {
        this.health = Math.max(0, (this.health ?? this.healthMax ?? 120) - dmg);
        this._impactCd = 0.12;

        effects?.addSparks?.(this.x, this.y, 6 + Math.floor(frac * 6), 240 + sp * 0.2);
      }
    }
  }

  /**
   * Passe le véhicule en carcasse (dead) + déclenche FX.
   * @param {object} p
   * @param {object} p.effects
   * @param {object} p.player
   */
  explode({ effects, player }) {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;

    // FX visuels
    effects?.addExplosion?.(this.x, this.y, 46);

    // Si le joueur est dedans: il "meurt dedans" (pas d'éjection côté logique)
    if (player?.inVehicle === this) {
      player.health = 0; // Player gère WASTED + respawn
    }

    // Désaccouple conducteur
    this.driver = null;

    // État carcasse
    this.color = "#444";
    this.solid = true;
    this.vx = 0;
    this.vy = 0;
  }

  serialize() {
    return {
      ...super.serialize(),
      model: this.model,
      name: this.name,
      color: this.color,
      driver: !!this.driver,
      health: this.health,
      healthMax: this.healthMax,
      dead: this.dead
    };
  }

  // --------------------------------------------------------------------
  // --- Trafic civil (IA très simple): suit le road graph en boucle ---
  // --------------------------------------------------------------------
  _updateTraffic({ dt, map, effects }) {
    const g = ensureRoadGraph(map);
    if (!g?.nodes?.length || !g?.dirEdges?.length) {
      // Pas de graphe => on retombe sur la "glisse".
      const fr = Math.max(0, 1 - this.friction * dt);
      this.vx *= fr;
      this.vy *= fr;
      moveWithTileCollisions(this, map, this.vx * dt, this.vy * dt);
      return;
    }

    // ------------------------------------------------------------------
    // IMPORTANT PERF:
    // Ancienne version = A* sur le graphe pour CHAQUE voiture de trafic.
    // Sur une carte réaliste (Grenoble) le graphe peut avoir plusieurs milliers
    // de nodes => gros spikes (warning requestAnimationFrame > 50ms).
    //
    // Ici, le trafic fait "GTA2-like": il suit un *segment* (dirEdge) puis,
    // arrivé au node suivant, il choisit une sortie plausible.
    // => O(1) par frame, pas de A*.
    // ------------------------------------------------------------------

    const nav = (this._traffic ??= {
      edgeId: null,
      waypoints: null,
      idx: 0,
      prevNode: null,
      laneBias: (Number.isFinite(this._laneBias) ? (this._laneBias | 0) : ((Math.random() * 4) | 0)),
      stuckT: 0,
      lastX: this.x,
      lastY: this.y
    });

    // Détection "bloqué": si la voiture ne bouge presque pas pendant ~2s,
    // on re-choisit un edge (évite qu'un car bloqué déclenche des oscillations).
    const moved = Math.hypot((this.x - (nav.lastX ?? this.x)), (this.y - (nav.lastY ?? this.y)));
    nav.lastX = this.x;
    nav.lastY = this.y;
    if (moved < 0.35) nav.stuckT = (nav.stuckT ?? 0) + dt;
    else nav.stuckT = 0;

    // Avance l'index waypoint si on est assez proche.
    const wp0 = nav.waypoints?.[nav.idx];
    if (wp0) {
      const d0 = Math.hypot(wp0.x - this.x, wp0.y - this.y);
      if (d0 < 18) nav.idx++;
    }

    // Choix / re-choix d'un edge si:
    // - pas d'edge
    // - fin des waypoints
    // - on est bloqué
    if (!nav.waypoints || nav.idx >= nav.waypoints.length || (nav.stuckT ?? 0) > 1.9) {
      nav.stuckT = 0;

      let startNode = null;
      let prevNode = nav.prevNode;

      const curEdge = Number.isFinite(nav.edgeId) ? g.dirEdges?.[nav.edgeId] : null;
      if (curEdge && nav.waypoints && nav.idx >= nav.waypoints.length) {
        // Normal: on arrive au bout de l'edge courant => on repart du node "to".
        startNode = curEdge.to;
        prevNode = curEdge.from;
      } else {
        // Départ arbitraire: on snap le véhicule sur le node route le plus proche.
        startNode = snapWorldToNearestRoadNode(map, this.x, this.y, 14);
      }

      if (startNode == null) {
        // Pas sur route => on freine et laisse les collisions faire le reste.
        const fr = Math.max(0, 1 - this.friction * dt);
        this.vx *= fr;
        this.vy *= fr;
        moveWithTileCollisions(this, map, this.vx * dt, this.vy * dt);
        return;
      }

      // Direction "préférée": on essaie d'aller dans la direction actuelle.
      let fx = Math.cos(this.angle);
      let fy = Math.sin(this.angle);
      if (curEdge && (curEdge.dirX || curEdge.dirY)) {
        fx = curEdge.dirX;
        fy = curEdge.dirY;
      }

      const pick = pickOutgoingEdge(g, startNode, prevNode, fx, fy);
      if (!pick) {
        // dead-end: petit frein.
        const fr = Math.max(0, 1 - this.friction * dt);
        this.vx *= fr;
        this.vy *= fr;
        moveWithTileCollisions(this, map, this.vx * dt, this.vy * dt);
        return;
      }

      nav.prevNode = startNode;
      nav.edgeId = pick.edge;
      nav.waypoints = buildEdgeWaypoints(map, g, nav.edgeId, nav.laneBias);
      nav.idx = 0;

      // Si le premier point est déjà atteint, on saute.
      const w = nav.waypoints?.[0];
      if (w && Math.hypot(w.x - this.x, w.y - this.y) < 18) nav.idx = 1;
    }

    const tgt = nav.waypoints?.[nav.idx] ?? null;
    if (!tgt) {
      // Rien à suivre -> freinage doux.
      const fr = Math.max(0, 1 - this.friction * dt);
      this.vx *= fr;
      this.vy *= fr;
      moveWithTileCollisions(this, map, this.vx * dt, this.vy * dt);
      return;
    }

    // Contrôles (steer/throttle) pour viser tgt.
    const dx = tgt.x - this.x;
    const dy = tgt.y - this.y;
    const desired = Math.atan2(dy, dx);
    const diff = wrapAngle(desired - this.angle);
    const steer = clamp(diff * 1.4, -1, 1);

    const dist = Math.hypot(dx, dy);
    const turnPenalty = Math.min(1, Math.abs(diff) / 1.8);
    let throttle = 1.0;
    if (dist < 50) throttle = 0.55;
    if (turnPenalty > 0.35) throttle *= (1.0 - 0.55 * turnPenalty);

    // Applique la conduite (équivalent "driver", sans Input).
    if (steer !== 0) this.angle += steer * this.turnSpeed * dt;

    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const a = throttle < 0 ? this.brake : this.accel;
    this.vx += fx * throttle * a * dt;
    this.vy += fy * throttle * a * dt;

    // Clamp vitesse (trafic un peu plus lent)
    const maxFwd = this.maxSpeed * (this.trafficSpeedMul ?? 0.85);
    const maxRev = this.reverseMaxSpeed * 0.7;
    const speed = this.vx * fx + this.vy * fy;
    if (speed > maxFwd) {
      this.vx = fx * maxFwd;
      this.vy = fy * maxFwd;
    } else if (speed < -maxRev) {
      this.vx = fx * -maxRev;
      this.vy = fy * -maxRev;
    }

    // Friction
    const fr = Math.max(0, 1 - this.friction * dt);
    this.vx *= fr;
    this.vy *= fr;

    // Dégâts mur (copié de la conduite joueur)
    this._impactCd = Math.max(0, (this._impactCd ?? 0) - dt);
    const reqDx = this.vx * dt;
    const reqDy = this.vy * dt;
    const bx = this.x, by = this.y;
    moveWithTileCollisions(this, map, reqDx, reqDy);
    const ax = this.x - bx, ay = this.y - by;

    const reqLen = Math.hypot(reqDx, reqDy);
    const actLen = Math.hypot(ax, ay);
    const blocked = Math.max(0, reqLen - actLen);
    const sp = Math.hypot(this.vx, this.vy);

    if (this._impactCd === 0 && reqLen > 0.001 && blocked > 0.5 && sp > this._impactMinSpeed) {
      const frac = Math.min(1, blocked / reqLen);
      const dmg = Math.floor(sp * this._impactScale * (0.30 + 0.70 * frac));
      if (dmg > 0) {
        this.health = Math.max(0, (this.health ?? this.healthMax ?? 120) - dmg);
        this._impactCd = 0.14;
        effects?.addSparks?.(this.x, this.y, 6 + Math.floor(frac * 6), 240 + sp * 0.2);
      }
    }
  }
}

/** Construit des waypoints (world) le long d'un dirEdge, avec offset de "voie". */
function buildEdgeWaypoints(map, graph, edgeId, laneBias = 0) {
  const edge = graph?.dirEdges?.[edgeId];
  const tiles = edge?.tiles;
  if (!edge || !tiles || !tiles.length) return null;

  const laneWidth = Math.max(4, (map.tileSize ?? 64) * 0.18);
  const lanes = Math.max(1, Math.min(4, edge.lanes ?? 1));

  const laneIndex = ((laneBias % lanes) + lanes) % lanes;
  const centered = laneIndex - (lanes - 1) / 2;
  const off = centered * laneWidth;

  const dirX = edge.dirX ?? 0;
  const dirY = edge.dirY ?? 0;
  const perpX = -dirY;
  const perpY = dirX;

  const out = [];
  for (let i = 0; i < tiles.length; i++) {
    const isEnd = (i === tiles.length - 1);
    // Décimation légère sur les longues lignes droites (stabilité + perf).
    if (!isEnd && i > 0 && (i % 2) === 1) continue;
    const t = tiles[i];
    const c = tileToWorldCenter(map, t.tx, t.ty);
    out.push({ x: c.x + perpX * off, y: c.y + perpY * off });
  }
  return out.length ? out : null;
}

/** Choisit une sortie au node, en évitant les U-turns et en préférant la direction actuelle. */
function pickOutgoingEdge(graph, nodeId, prevNode, fx, fy) {
  const neigh = graph?.adj?.[nodeId] ?? [];
  if (!neigh.length) return null;

  let best = null;
  let bestScore = -1e9;

  for (const e of neigh) {
    if (prevNode != null && e.to === prevNode) continue;
    const dot = (e.dirX ?? 0) * (fx ?? 0) + (e.dirY ?? 0) * (fy ?? 0);
    const score = dot * 10 + Math.min(6, (e.cost ?? 1) * 0.15) + Math.random();
    if (score > bestScore) { bestScore = score; best = e; }
  }

  // Si tout est interdit (cul-de-sac), on prend quand même une sortie.
  if (!best) best = neigh[(Math.random() * neigh.length) | 0];
  return best;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function wrapAngle(a) {
  // normalise en [-PI, PI]
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
