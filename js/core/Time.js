/**
 * Time = helper pour calculer un dt stable à partir de requestAnimationFrame.
 *
 * Objectif:
 * - convertir le timestamp rAF (ms) en dt (secondes)
 * - clamp dt pour éviter le "spiral of death"
 *   (si le jeu freeze 2s, on n’applique pas dt=2 d’un coup)
 */
export class Time {
  constructor() {
    /** @type {number} Dernier timestamp rAF (ms) */
    this.prev = 0;

    /** @type {number} Dernier dt calculé (secondes) */
    this.dt = 0;
  }

  /**
   * Reset du timer (utile au start/restart).
   */
  reset() {
    this.prev = 0;
    this.dt = 0;
  }

  /**
   * Calcule le dt depuis le dernier frame.
   *
   * @param {number} tMs Timestamp en millisecondes fourni par requestAnimationFrame
   * @returns {number} dt en secondes (clamp)
   */
  step(tMs) {
    // Premier tick: on initialise prev sans produire de “gros dt”.
    if (!this.prev) this.prev = tMs;

    const raw = (tMs - this.prev) / 1000; // ms -> s
    this.prev = tMs;

    // Clamp: max 50ms (~20 FPS) pour éviter un dt énorme et instable.
    // (Tu peux ajuster selon la physique / gameplay).
    this.dt = Math.max(0, Math.min(raw, 1 / 20));
    return this.dt;
  }
}
