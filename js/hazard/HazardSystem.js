/**
 * HazardSystem (V1_2_0)
 *
 * Gère les dangers au sol posés par le joueur ou l'IA:
 *
 * - OilSlick (tache d'huile): glisse les véhicules, dure 30s
 * - Mine (bombe): explose au contact d'un véhicule, dégâts AoE
 *
 * Inspiré de GTA2 (garages Hell Oil + Gold Mines).
 *
 * Usage:
 *   hazardSystem.dropOil(x, y)       -- joueur avec Hell Oil
 *   hazardSystem.dropMine(x, y)      -- joueur avec Gold Mines
 *   hazardSystem.update({ dt, entities, effects, player })
 *   hazardSystem.draw(ctx, camera)
 */

export class HazardSystem {
  constructor() {
    /** @type {Hazard[]} */
    this.hazards = [];
  }

  /**
   * Pose une tache d'huile.
   * @param {number} x
   * @param {number} y
   * @param {any} [owner] Entité propriétaire (évite d'affecter le déposant immédiatement)
   */
  dropOil(x, y, owner = null) {
    this.hazards.push({
      type: "oil",
      x, y,
      radius: 30,
      life: 30,         // secondes
      owner,
      triggered: false,
      _t: 0
    });
  }

  /**
   * Pose une mine.
   * @param {number} x
   * @param {number} y
   * @param {any} [owner]
   */
  dropMine(x, y, owner = null) {
    this.hazards.push({
      type: "mine",
      x, y,
      radius: 20,
      damage: 80,
      explosionRadius: 90,
      life: 120,        // mines durent plus longtemps
      owner,
      triggered: false,
      armTimer: 1.0,    // délai d'armement (pour ne pas exploser sous le déposant)
      _t: 0
    });
  }

  /**
   * Update toutes les hazards.
   */
  update({ dt, entities, effects, player }) {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.life -= dt;
      h._t += dt;

      // Expiration naturelle
      if (h.life <= 0) {
        this.hazards.splice(i, 1);
        continue;
      }

      if (h.type === "mine" && h.armTimer > 0) {
        h.armTimer -= dt;
        continue; // pas encore armée
      }

      const r2 = h.radius * h.radius;

      // Tache d'huile: affecte les véhicules
      if (h.type === "oil") {
        for (const e of entities) {
          if (!e) continue;
          if (e === h.owner) continue;
          if (e.kind !== "vehicle" && e.kind !== "copcar") continue;

          const dx = e.x - h.x;
          const dy = e.y - h.y;
          if (dx * dx + dy * dy > r2) continue;

          // Effet de glisse: réduit la friction du véhicule temporairement
          e._oilTimer = Math.max(e._oilTimer ?? 0, 1.2);
        }
        continue;
      }

      // Mine: explose au contact
      if (h.type === "mine" && !h.triggered) {
        for (const e of entities) {
          if (!e || e === h.owner) continue;
          if (!["vehicle","copcar","ped","copped","player"].includes(e.kind)) continue;

          const dx = e.x - h.x;
          const dy = e.y - h.y;
          if (dx * dx + dy * dy > r2) continue;

          // Déclenchement
          h.triggered = true;
          effects?.addExplosion?.(h.x, h.y, h.explosionRadius);

          // Dégâts AoE
          const er2 = h.explosionRadius * h.explosionRadius;
          for (const t of entities) {
            if (!t) continue;
            const tx = t.x - h.x;
            const ty = t.y - h.y;
            const td2 = tx * tx + ty * ty;
            if (td2 > er2) continue;

            const ratio = 1 - Math.sqrt(td2) / h.explosionRadius;
            const dmg = (h.damage * ratio) | 0;

            if (["ped","copped","vehicle","copcar","player"].includes(t.kind)) {
              t.health = Math.max(0, (t.health ?? 0) - dmg);
              if (t.health <= 0 && "dead" in t) t.dead = true;
            }

            // Knockback
            const invD = td2 > 1 ? 1 / Math.sqrt(td2) : 0;
            t.vx = (t.vx ?? 0) + tx * invD * 250;
            t.vy = (t.vy ?? 0) + ty * invD * 250;
          }

          // Wanted si mine posée par joueur
          if (h.owner === player) {
            player.wanted = Math.min(5, (player.wanted ?? 0) + 2);
          }

          h.life = 0; // sera supprimée au prochain tick
          break;
        }
      }
    }
  }

  /**
   * Rendu greybox.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} camera
   */
  draw(ctx, camera) {
    for (const h of this.hazards) {
      const s = camera.worldToScreen(h.x, h.y);

      if (h.type === "oil") {
        // Flaque d'huile: ellipse semi-transparente noire/gris
        const alpha = Math.min(0.6, h.life / 5);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#111122";
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, h.radius, h.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Reflet irisé
        ctx.fillStyle = "#334488";
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.ellipse(s.x - 4, s.y - 3, h.radius * 0.5, h.radius * 0.3, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

      } else if (h.type === "mine") {
        const armed = (h.armTimer ?? 0) <= 0;
        // Mine: petit cercle sombre + clignotement si armée
        const blink = armed && (Math.floor(h._t * 4) % 2 === 0);
        ctx.fillStyle = blink ? "#FF2200" : "#442200";
        ctx.strokeStyle = "#888";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Croix
        ctx.strokeStyle = armed ? "#FF4400" : "#FFAA00";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s.x - 4, s.y); ctx.lineTo(s.x + 4, s.y);
        ctx.moveTo(s.x, s.y - 4); ctx.lineTo(s.x, s.y + 4);
        ctx.stroke();
      }
    }
  }
}
