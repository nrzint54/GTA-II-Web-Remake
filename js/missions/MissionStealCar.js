/**
 * Mission "StealCar"
 *
 * Objectif:
 * - Réussite dès que le joueur est dans un véhicule (peu importe lequel).
 *
 * Récompense:
 * - +150 money
 * - wanted +1 (clamp 0..5)
 *
 * Note maintenance:
 * - Le paramètre radius n'est pas utilisé dans update() actuellement.
 *   Tu peux soit le retirer, soit l'exploiter plus tard (ex: "vole une voiture dans une zone"). 
 */
export class MissionStealCar {
  /**
   * @param {object} p
   * @param {string} p.name
   * @param {number} [p.radius=28] (non utilisé actuellement)
   */
  constructor({ name, radius = 28 }) {
    this.name = name;
    this.radius = radius;

    /** @type {boolean} */
    this.done = false;
  }

  reset() {
    this.done = false;
  }

  /**
   * @param {object} ctx
   * @param {object} ctx.player
   */
  update({ player }) {
    if (this.done) return;
    if (!player) return;

    // Condition simple: être dans un véhicule
    if (player.inVehicle) {
      this.done = true;
      player.money += 150;
      player.wanted = Math.min(5, (player.wanted ?? 0) + 1);
    }
  }

  /**
   * Debug draw:
   * - affiche un petit carré au-dessus du joueur (indique "entre dans un véhicule")
   */
  debugDraw(ctx, w2s, player) {
    if (!ctx || !w2s || !player) return;

    const p = w2s(player.x, player.y);
    ctx.save();
    ctx.fillStyle = this.done ? "rgba(0,255,0,0.65)" : "rgba(255,140,0,0.65)";
    ctx.fillRect(p.x - 6, p.y - 40, 12, 12);
    ctx.restore();
  }
}
