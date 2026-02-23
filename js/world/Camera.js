/**
 * Camera (top-down 2D)
 *
 * Convention:
 * - this.x / this.y = position world du coin haut-gauche du viewport.
 * - La caméra suit une target (souvent le player) avec un smoothing (lerp).
 *
 * Effet recherché:
 * - Un léger retard (lerp) donne un feeling GTA2 / arcade.
 * - Ce n'est pas une vraie "dead zone" au sens strict (pas de rectangle neutre),
 *   c'est un suivi interpolé.
 */
export class Camera {
  constructor() {
    /** @type {number} coin haut-gauche du viewport en world */
    this.x = 0;
    /** @type {number} coin haut-gauche du viewport en world */
    this.y = 0;

    /** @type {any|null} entité suivie (doit exposer x,y) */
    this.target = null;

    /**
     * Facteur de lissage (0..1).
     * - 0 => caméra figée
     * - 1 => suit instantanément
     * Valeur actuelle: 0.14 = suivi souple.
     */
    this.lerp = 0.14;
  }

  /** Définit l'entité à suivre (ex: player). */
  setTarget(entity) {
    this.target = entity;
  }

  /**
   * Update caméra à chaque frame.
   * - centre le viewport sur la target
   * - puis applique interpolation (lerp)
   *
   * @param {HTMLCanvasElement} canvas (sert à connaître largeur/hauteur écran)
   */
  update(canvas) {
    if (!this.target) return;

    // Position voulue: target au centre de l'écran
    const desiredX = this.target.x - canvas.width / 2;
    const desiredY = this.target.y - canvas.height / 2;

    // Lerp vers la cible (smoothing)
    this.x += (desiredX - this.x) * this.lerp;
    this.y += (desiredY - this.y) * this.lerp;
  }

  /**
   * Convertit world -> screen (pixels canvas).
   * - floor pour pixel-snapping (évite le flou/aliasing).
   *
   * @param {number} x world
   * @param {number} y world
   * @returns {{x:number,y:number}} screen
   */
  worldToScreen(x, y) {
    return { x: Math.floor(x - this.x), y: Math.floor(y - this.y) };
  }

  /**
   * Rectangle de vue en world.
   * Utilisé pour le culling de la map (dessiner seulement ce qui est visible).
   */
  viewRect(canvas) {
    return { x: this.x, y: this.y, w: canvas.width, h: canvas.height };
  }
}
