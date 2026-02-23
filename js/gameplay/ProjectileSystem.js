/**
 * ProjectileSystem (V1_2_0)
 *
 * Gère les projectiles physiques:
 * - Grenades: arc ballistique (gravité), explosent après fuseTime
 * - Roquettes: vol en ligne droite, explosent à l'impact ou sur entité
 *
 * Usage:
 *   projectileSystem.spawn({ type, x, y, dirX, dirY, speed, damage, fuseTime, radius, shooter })
 *   projectileSystem.update({ dt, map, entities, effects, hud, player, audio })
 *   projectileSystem.draw(ctx, camera)
 */

export class ProjectileSystem {
  constructor() {
    /** @type {Projectile[]} */
    this.projectiles = [];
  }

  /**
   * Spawne un nouveau projectile.
   * @param {object} p
   * @param {string} p.type "grenade" | "rocket"
   * @param {number} p.x Origine X
   * @param {number} p.y Origine Y
   * @param {number} p.dirX Direction normalisée X
   * @param {number} p.dirY Direction normalisée Y
   * @param {number} p.speed Vitesse initiale
   * @param {number} p.damage Dégâts d'explosion
   * @param {number} p.fuseTime Secondes avant explosion (grenade) ou 99 (rocket = impact)
   * @param {number} p.radius Rayon d'explosion en pixels
   * @param {any}    p.shooter Entité qui tire (immunisée à l'explosion)
   */
  spawn({ type, x, y, dirX, dirY, speed, damage, fuseTime, radius, shooter }) {
    this.projectiles.push({
      type,
      x, y,
      vx: dirX * speed,
      vy: dirY * speed,
      damage,
      fuseTime,
      radius,
      shooter,
      age: 0,
      exploded: false,
      // Gravité arc pour grenades (courbure vers le bas = axe Y positif = bas en 2D topdown)
      gravity: (type === "grenade") ? 60 : 0,
      trail: []    // historique de positions (traînée visuelle)
    });
  }

  /**
   * Update toutes les projectiles.
   */
  update({ dt, map, entities, effects, hud, player, audio }) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.exploded) { this.projectiles.splice(i, 1); continue; }

      p.age += dt;

      // Gravité (grenades seulement) — en 2D top-down, on simule une parabole
      // en réduisant la vitesse progressivement et en ajoutant la courbure sur y
      if (p.type === "grenade") {
        p.vy += p.gravity * dt;
      }

      // Mouvement
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;

      // Collision map (roquette) -> explode
      if (p.type === "rocket") {
        const ts = map?.tileSize ?? 64;
        const tx = Math.floor(nx / ts);
        const ty = Math.floor(ny / ts);
        if (map?.isSolidTile?.(map.tileAt(tx, ty))) {
          this._explode(p, p.x, p.y, entities, effects, hud, player);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      p.x = nx;
      p.y = ny;

      // Trail (garde les 8 dernières positions pour traînée)
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 8) p.trail.shift();

      // Collision entités (roquette) -> explode
      if (p.type === "rocket") {
        for (const e of entities) {
          if (!e || e === p.shooter) continue;
          if (e.dead || (e.health ?? 1) <= 0) continue;
          if (!["ped","copped","vehicle","copcar"].includes(e.kind)) continue;
          const hb = e.hitbox?.();
          if (!hb) continue;
          if (p.x >= hb.x && p.x <= hb.x + hb.w && p.y >= hb.y && p.y <= hb.y + hb.h) {
            this._explode(p, p.x, p.y, entities, effects, hud, player);
            this.projectiles.splice(i, 1);
            break;
          }
        }
        if (this.projectiles[i] !== p) continue;
      }

      // Fuse time (grenades) -> explode
      if (p.age >= p.fuseTime) {
        this._explode(p, p.x, p.y, entities, effects, hud, player);
        this.projectiles.splice(i, 1);
      }
    }
  }

  /**
   * Explosion: dégâts AoE + effets visuels.
   * @private
   */
  _explode(p, x, y, entities, effects, hud, player) {
    p.exploded = true;
    effects?.addExplosion?.(x, y, p.radius * 0.8); audio?.explosion?.(p.radius);

    const r2 = p.radius * p.radius;

    for (const e of entities) {
      if (!e) continue;
      if (e.dead) continue;

      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;

      // Dégâts décroissants avec la distance
      const ratio = 1 - Math.sqrt(d2) / p.radius;
      const dmg = (p.damage * ratio) | 0;

      if (!["ped","copped","vehicle","copcar","player"].includes(e.kind)) continue;

      e.health = Math.max(0, (e.health ?? 0) - dmg);

      // Knockback (impulsion)
      const invD = d2 > 1 ? 1 / Math.sqrt(d2) : 0;
      e.vx = (e.vx ?? 0) + dx * invD * 280;
      e.vy = (e.vy ?? 0) + dy * invD * 280;

      // Mort ped/cop
      if (e.health <= 0) {
        if ("dead" in e) e.dead = true;
        if (e.solid !== undefined) e.solid = false;
        if (e === player) {
          hud?.toast?.("💀 WASTED", 1.6);
          player.dead = true;
          player.deadTimer = 2.0;
        }
      }
    }

    // Wanted (si joueur tire et touche quelqu'un)
    if (player && p.shooter === player) {
      player.wanted = Math.min(5, (player.wanted ?? 0) + 2);
    }
  }

  /**
   * Rendu des projectiles (greybox).
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} camera Camera (worldToScreen)
   */
  draw(ctx, camera) {
    for (const p of this.projectiles) {
      // Trail (traînée de fumée)
      for (let i = 0; i < p.trail.length; i++) {
        const t = p.trail[i];
        const s = camera.worldToScreen(t.x, t.y);
        const alpha = (i / p.trail.length) * 0.5;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = (p.type === "rocket") ? "#FF6600" : "#AAAAAA";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Corps du projectile
      const s = camera.worldToScreen(p.x, p.y);
      if (p.type === "grenade") {
        ctx.fillStyle = "#333";
        ctx.strokeStyle = "#888";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (p.type === "rocket") {
        ctx.fillStyle = "#FF4400";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
