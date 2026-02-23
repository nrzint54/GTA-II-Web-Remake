/**
 * Mission "StealCarDeliver"
 *
 * Étapes:
 * 1) Choisir une voiture cible (libre) proche du joueur.
 * 2) Entrer dans CETTE voiture.
 * 3) Livrer au point dropOff.
 *
 * Stocke:
 * - targetVehicleId : id runtime de l'entité vehicle ciblée.
 * - _cachedTarget   : cache de l'entité (optimisation + utilisé par debugDraw).
 *
 * Contrat MissionManager:
 * - isComplete() et completionMessage() sont présents.
 */
export class MissionStealCarDeliver {
  /**
   * @param {object} p
   * @param {string} p.name
   * @param {{x:number,y:number}} p.dropOff
   * @param {number} [p.enterRadius=26]
   * @param {number} [p.deliverRadius=30]
   */
  constructor({ name, dropOff, enterRadius = 26, deliverRadius = 30 }) {
    this.name = name;

    /** @type {{x:number,y:number}} */
    this.dropOff = dropOff;

    this.enterRadius = enterRadius;
    this.deliverRadius = deliverRadius;

    /**
     * Machine à états:
     * - init  : (re)initialisation (on va sélectionner une cible)
     * - find  : le joueur doit entrer dans la voiture cible
     * - drive : livrer au point
     * - done  : terminé
     */
    this.state = "init";

    /** @type {number|null} */
    this.targetVehicleId = null;

    /** @type {any|null} */
    this._cachedTarget = null;

    /** @type {number} */
    this.reward = 250;
  }

  reset() {
    this.state = "init";
    this.targetVehicleId = null;
    this._cachedTarget = null;
  }

  statusText() {
    switch (this.state) {
      case "init": return "Initialisation…";
      case "find": return this.targetVehicleId == null ? "Trouve une voiture…" : "Trouve la voiture cible";
      case "drive": return "Livre au point vert";
      case "done": return "Terminé ✅";
      default: return "—";
    }
  }

  /** @returns {boolean} */
  isComplete() {
    return this.state === "done";
  }

  completionMessage() {
    return `Mission réussie ✅ +${this.reward}💰`;
  }

  /**
   * Update:
   * - Sélection cible si pas encore de targetVehicleId
   * - find : attendre que player.inVehicle soit la cible
   * - drive: rester dans la cible + atteindre dropOff
   *
   * Correctif v8_c:
   * - Avant: si aucun véhicule n'était dispo, la mission basculait "find" puis
   *   repassait en "init" à la frame suivante (boucle init/find). Ici, si
   *   targetVehicleId est null en state "find", on retente simplement un pick.
   *
   * @param {object} ctx
   * @param {object} ctx.player
   * @param {Array<any>} ctx.entities
   */
  update({ player, entities }) {
    if (this.state === "done") return;
    if (!player) return;

    entities = entities ?? [];

    // ------------------------------------------------------------------
    // 1) Acquisition / réacquisition d'une cible
    // ------------------------------------------------------------------
    if (this.targetVehicleId == null) {
      const target = this.pickTargetVehicle(player, entities);
      if (!target) {
        // Aucun véhicule libre: on reste en attente.
        // (On laisse state = "find" pour afficher un texte plus clair.)
        this.state = "find";
        this._cachedTarget = null;
        return;
      }

      this.targetVehicleId = target.id;
      this._cachedTarget = target;
      this.state = "find";
    }

    // Retrouve la cible (cache si possible)
    const target = this.getTarget(entities);
    if (!target) {
      // La cible a disparu (despawn, explosion, etc.) -> on repart sur une sélection.
      this.targetVehicleId = null;
      this._cachedTarget = null;
      this.state = "init";
      return;
    }

    // ------------------------------------------------------------------
    // 2) FIND: le joueur doit entrer dans LA voiture cible
    // ------------------------------------------------------------------
    if (this.state === "init") this.state = "find"; // sécurité si state incohérent

    if (this.state === "find") {
      if (player.inVehicle && player.inVehicle.id === this.targetVehicleId) {
        this.state = "drive";
      }
      return;
    }

    // ------------------------------------------------------------------
    // 3) DRIVE: rester dans la cible + atteindre le drop-off
    // ------------------------------------------------------------------
    if (this.state === "drive") {
      if (!player.inVehicle || player.inVehicle.id !== this.targetVehicleId) {
        // sorti / changé de véhicule -> retour à l'étape find
        this.state = "find";
        return;
      }

      const d = Math.hypot(player.x - this.dropOff.x, player.y - this.dropOff.y);
      if (d <= this.deliverRadius) {
        this.state = "done";
        player.money += this.reward;
        player.wanted = Math.min(5, (player.wanted ?? 0) + 1);
      }
    }
  }

  /**
   * Choix simple de cible:
   * - véhicule libre (driver null)
   * - le plus proche du joueur
   *
   * NOTE:
   * - Filtre actuel: e.kind === "vehicle" uniquement.
   *   => les copcars ne sont pas cibles ici (si tu veux, ajoute e.kind === "copcar").
   */
  pickTargetVehicle(player, entities) {
    let best = null;
    let bestD2 = Infinity;

    for (const e of entities) {
      if (!e) continue;
      if (e.kind !== "vehicle") continue;
      if (e.driver) continue;

      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const d2 = dx * dx + dy * dy;

      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }

    return best;
  }

  /**
   * Retrouve la cible par id, en utilisant un cache:
   * - si _cachedTarget toujours valide => retourne direct
   * - sinon recherche dans entities
   */
  getTarget(entities) {
    if (this._cachedTarget && this._cachedTarget.id === this.targetVehicleId) return this._cachedTarget;
    const t = entities.find((e) => e && e.id === this.targetVehicleId) ?? null;
    this._cachedTarget = t;
    return t;
  }

  /**
   * Debug draw:
   * - cercle orange sur la voiture cible (find/drive)
   * - cercle vert au dropOff + ligne joueur->dropOff quand state === "drive"
   *
   * IMPORTANT:
   * - debugDraw ne reçoit pas entities, donc il dépend de _cachedTarget.
   *   Si le cache est null (ou vieux), le marqueur peut disparaître.
   */
  debugDraw(ctx, w2s, player) {
    if (!ctx || !w2s || !player) return;

    // Cible: on se base sur le cache (mis à jour par update/getTarget)
    const t = this._cachedTarget;
    if (t && this.state !== "done") {
      const s = w2s(t.x, t.y);

      ctx.save();
      ctx.strokeStyle = "rgba(255,140,0,0.9)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, this.enterRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Drop-off: uniquement quand on doit livrer
    if (this.state === "drive") {
      const d = w2s(this.dropOff.x, this.dropOff.y);

      ctx.save();
      ctx.strokeStyle = "rgba(0,255,120,0.9)";
      ctx.beginPath();
      ctx.arc(d.x, d.y, this.deliverRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Ligne joueur -> dropOff
      const p = w2s(player.x, player.y);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}
