/**
 * MissionManager
 *
 * Rôle:
 * - Gère une liste de missions "plug-in" (GoTo, StealCar, ...).
 * - Expose currentName()/currentStatus() pour le HUD.
 * - Permet un passage manuel next() et un auto-next quand une mission est finie.
 *
 * Contrat "mission" (API minimale):
 * - name: string
 * - reset?(): void
 * - update?(ctx): void
 * - isComplete?(): boolean
 * - statusText?(): string
 * - completionMessage?(): string
 *
 * Note maintenance:
 * - Game.serialize() sauvegarde missions.index (voir core/Game.js).
 * - Au load, on réinjecte index/current dans main.js. Pour éviter les incohérences,
 *   une méthode setIndex() est fournie (optionnel à utiliser côté loader).
 */
export class MissionManager {
  /**
   * @param {Array<any>} missions Liste de missions instanciées
   */
  constructor(missions = []) {
    this.missions = missions;

    /** @type {number} index courant dans missions */
    this.index = 0;

    /** @type {any|null} mission courante */
    this.current = missions[0] ?? null;

    // Auto passage mission suivante (après toast)
    this._pendingNext = false;
    this._nextTimer = 0;
  }

  /**
   * Ajoute une mission au manager.
   * - Utile quand on construit la liste dynamiquement (ex: depuis map.meta.missions)
   * - Si aucune mission courante n'existe, la mission ajoutée devient courante.
   *
   * @param {any} mission
   */
  add(mission) {
    if (!mission) return;

    this.missions.push(mission);

    // Si c'est la première mission ajoutée, elle devient courante.
    if (!this.current) {
      this.index = 0;
      this.current = this.missions[0] ?? null;
      this.current?.reset?.();
    }
  }

  /**
   * Force une mission courante par index.
   * - Clamp sur [0..missions.length-1]
   * - Met à jour current
   * - Optionnellement reset la mission choisie
   *
   * @param {number} i
   * @param {boolean} [doReset=true]
   */
  setIndex(i, doReset = true) {
    if (!this.missions.length) {
      this.index = 0;
      this.current = null;
      this._pendingNext = false;
      this._nextTimer = 0;
      return;
    }

    const n = this.missions.length;
    const idx = Number.isFinite(i) ? Math.max(0, Math.min(n - 1, (i | 0))) : 0;
    this.index = idx;
    this.current = this.missions[this.index] ?? null;

    if (doReset) this.current?.reset?.();

    this._pendingNext = false;
    this._nextTimer = 0;
  }

  /**
   * Passe à la mission suivante:
   * - cycle en boucle via modulo
   * - reset la mission
   * - reset auto-next state
   */
  next() {
    if (!this.missions.length) return;

    this.index = (this.index + 1) % this.missions.length;
    this.current = this.missions[this.index] ?? null;
    this.current?.reset?.();

    this._pendingNext = false;
    this._nextTimer = 0;
  }

  /**
   * Tick manager:
   * 1) update mission courante
   * 2) si mission finie -> toast + planification next (délai)
   * 3) compte à rebours puis next()
   *
   * @param {object} ctx Contexte jeu (dt, player, entities, map, hud, ...)
   */
  update(ctx) {
    // Sécurité dt (évite NaN)
    const dt = Number.isFinite(ctx?.dt) && ctx.dt > 0 ? ctx.dt : 0.016;

    // 1) update mission actuelle
    this.current?.update?.(ctx);

    // 2) si mission déclarée "complete" -> toast + planification next
    const done = this.current?.isComplete?.() === true;
    if (done && !this._pendingNext) {
      this._pendingNext = true;
      this._nextTimer = 1.2; // délai avant mission suivante

      const msg = this.current?.completionMessage?.() ?? "Mission réussie ✅";
      ctx?.hud?.toast?.(msg, 1.2);
    }

    // 3) auto-next countdown
    if (this._pendingNext) {
      this._nextTimer -= dt;
      if (this._nextTimer <= 0) {
        this.next();
      }
    }
  }

  /** @returns {string} */
  currentName() {
    return this.current ? this.current.name : "—";
  }

  /** @returns {string} */
  currentStatus() {
    return this.current?.statusText?.() ?? "—";
  }
}

// ---- Extensions V1_2_0 ----

// Méthode startNext() pour le PhoneSystem
MissionManager.prototype.startNext = function() {
  if (this.index < this.missions.length) {
    const m = this.missions[this.index];
    m?.reset?.();
    return true;
  }
  return false;
};

// Méthode currentTarget() pour le renderer overlay
MissionManager.prototype.currentTarget = function() {
  const m = this.missions[this.index];
  return m?.target ?? m?.dropOff ?? null;
};
