/**
 * Mission "GoTo"
 *
 * Objectif:
 * - Le joueur doit rejoindre une position (target.x, target.y) dans un rayon donné.
 * - Quand le joueur entre dans la zone: mission terminée + récompense.
 *
 * Contrat attendu par MissionManager:
 * - reset()
 * - update(ctx)
 * - statusText()
 * - isComplete()
 * - completionMessage()
 * - debugDraw(ctx, w2s, player) (optionnel)
 */
export class MissionGoTo {
  /**
   * @param {object} p
   * @param {string} p.name Nom de mission affiché
   * @param {{x:number,y:number}} p.target Point cible en world units
   * @param {number} [p.radius=24] Rayon de validation (world units)
   * @param {number} [p.reward=100] Récompense en argent
   */
  constructor({ name, target, radius = 24, reward = 100 }) {
    this.name = name;
    this.target = target;
    this.radius = radius;

    /** @type {boolean} Mission terminée ? */
    this.done = false;

    /** @type {number} Récompense en argent */
    this.reward = reward;
  }

  /** Réinitialise la mission (utile quand on repasse dessus via MissionManager.next()). */
  reset() {
    this.done = false;
  }

  /** Texte court destiné au HUD. */
  statusText() {
    return this.done ? "Terminé ✅" : "Va au point marqué";
  }

  /** @returns {boolean} */
  isComplete() {
    return this.done;
  }

  /** Texte du toast de fin. */
  completionMessage() {
    return `Mission réussie ✅ +${this.reward}💰`;
  }

  /**
   * Tick mission:
   * - vérifie distance joueur -> cible
   * - si ok: done=true et donne la récompense
   *
   * @param {object} ctx
   * @param {object} ctx.player
   */
  update({ player }) {
    if (this.done) return;
    if (!player || !this.target) return;

    const d = Math.hypot(player.x - this.target.x, player.y - this.target.y);
    if (d <= this.radius) {
      this.done = true;
      player.money += this.reward;
    }
  }

  /**
   * Dessin debug:
   * - cercle zone mission (jaune -> vert si done)
   * - ligne joueur -> cible
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {(x:number,y:number)=>{x:number,y:number}} w2s World->screen
   * @param {object} player
   */
  debugDraw(ctx, w2s, player) {
    if (!ctx || !w2s || !this.target || !player) return;

    const s = w2s(this.target.x, this.target.y);

    // Cercle zone cible
    ctx.save();
    ctx.strokeStyle = this.done ? "rgba(0,255,0,0.85)" : "rgba(255,255,0,0.85)";
    ctx.beginPath();
    ctx.arc(s.x, s.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Ligne joueur -> cible
    const p = w2s(player.x, player.y);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.20)";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    ctx.restore();
  }
}
