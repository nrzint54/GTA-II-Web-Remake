/**
 * WantedSystem (V1_2_0)
 *
 * Système de wanted level (avis de recherche) inspiré de GTA2:
 *
 * Level 0: Police ignore
 * Level 1: Un policier (CopPed) suit le joueur
 * Level 2: Voiture de police (CopCar) + CopPed
 * Level 3: Renforts (2 CopCars + 2 CopPeds)
 * Level 4: SWAT (CopCars rapides + CopPeds lourds)
 * Level 5: Armée (tous moyens de pression)
 *
 * Le wanted diminue si:
 * - Le joueur reste hors de vue de la police (zone non visible) pendant graceTime
 * - Le joueur va dans un garage Max Paynt
 *
 * Usage:
 *   wantedSystem.update({ dt, player, entities, map, hud })
 *   wantedSystem.onPlayerAction(player, actionType)
 */

export class WantedSystem {
  constructor() {
    /** Temps de grâce avant que le wanted commence à décroître (en secondes) */
    this.graceTime = 8;

    /** Timer courant de grâce (reset à chaque fois que la police "voit" le joueur) */
    this._graceTimer = 0;

    /** Temps entre chaque décrémentation de wanted */
    this._decayInterval = 4;
    this._decayTimer = 0;

    /** Timer pour éviter le spam d'actions "wanted" */
    this._cooldown = 0;
  }

  /**
   * Update du système wanted.
   * Gère la décroissance et applique les seuils visuels.
   */
  update({ dt, player, entities }) {
    this._cooldown = Math.max(0, this._cooldown - dt);

    const wantedLevel = Math.min(5, Math.max(0, Math.floor(player.wanted ?? 0)));
    if (wantedLevel === 0) {
      this._graceTimer = 0;
      this._decayTimer = 0;
      return;
    }

    // Vérifie si la police voit le joueur
    const seenByPolice = this._isSeenByPolice(player, entities);

    if (seenByPolice) {
      this._graceTimer = this.graceTime;
      this._decayTimer = 0;
    } else {
      // Pas vu: commence à compter le temps de grâce
      this._graceTimer = Math.max(0, this._graceTimer - dt);

      if (this._graceTimer <= 0) {
        // Décrémentation progressive
        this._decayTimer += dt;
        if (this._decayTimer >= this._decayInterval) {
          this._decayTimer = 0;
          player.wanted = Math.max(0, (player.wanted ?? 0) - 1);
        }
      }
    }
  }

  /**
   * Détermine si la police voit le joueur.
   * Méthode simple: si une entité police est à moins de 250px du joueur.
   * @private
   */
  _isSeenByPolice(player, entities) {
    const range2 = 250 * 250;
    for (const e of entities) {
      if (!e) continue;
      if (e.kind !== "copped" && e.kind !== "copcar") continue;
      if (e.dead || (e.health ?? 1) <= 0) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      if (dx * dx + dy * dy < range2) return true;
    }
    return false;
  }

  /**
   * Augmente le wanted suite à une action du joueur.
   * @param {any} player
   * @param {string} actionType "kill_ped"|"kill_cop"|"hit_vehicle"|"rob"|"shoot_bystander"
   */
  onPlayerAction(player, actionType) {
    if (this._cooldown > 0) return;

    const increments = {
      "kill_ped":        1,
      "kill_cop":        2,
      "hit_vehicle":     0.5,
      "rob":             1,
      "shoot_bystander": 1,
      "explosion":       2
    };

    const inc = increments[actionType] ?? 0.5;
    player.wanted = Math.min(5, (player.wanted ?? 0) + inc);
    this._cooldown = 0.3;
  }

  /**
   * Description textuelle du niveau wanted.
   * @param {number} level
   * @returns {string}
   */
  static describe(level) {
    switch (Math.floor(level)) {
      case 0: return "—";
      case 1: return "★ Police";
      case 2: return "★★ + CopCar";
      case 3: return "★★★ Renforts";
      case 4: return "★★★★ SWAT";
      case 5: return "★★★★★ ARMÉE";
      default: return "?";
    }
  }
}
