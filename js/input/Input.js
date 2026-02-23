/**
 * Gestionnaire d'input clavier + souris.
 *
 * Objectif:
 * - Fournir un état simple:
 *   - isDown(code)      : touche maintenue
 *   - wasPressed(code)  : touche pressée "cette frame uniquement"
 * - Fournir des axes "arcade" pour le mouvement:
 *   - axisX() : gauche/droite
 *   - axisY() : haut/bas
 * - Gérer la souris liée à un canvas:
 *   - mouse.x/y = coordonnées écran relatives au canvas (pas des coords world)
 *   - isMouseDown(btn) / wasMousePressed(btn)
 *
 * IMPORTANT (contrat de frame):
 * - Game.update() doit appeler input.endFrame() EN FIN DE FRAME
 *   pour vider pressed et mousePressed.
 */
export class Input {
  /**
   * @param {EventTarget} [target=window] Source d'événements clavier.
   */
  constructor(target = window) {
    /**
     * Touches actuellement maintenues.
     * @type {Set<string>}
     */
    this.down = new Set();

    /**
     * Touches pressées "juste cette frame".
     * Remise à zéro dans endFrame().
     * @type {Set<string>}
     */
    this.pressed = new Set();

    // ----------------------------
    // Clavier
    // ----------------------------
    target.addEventListener("keydown", (e) => {
      // Détecte l'edge: si la touche n'était pas déjà down, alors c'est un "pressed"
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });

    target.addEventListener("keyup", (e) => {
      this.down.delete(e.code);
    });

    // ----------------------------
    // Souris (coords écran relatives au canvas)
    // ----------------------------
    /**
     * Position souris en coordonnées écran du canvas (px).
     * Conversion en coordonnées world faite ailleurs (via camera).
     * @type {{x:number,y:number}}
     */
    this.mouse = { x: 0, y: 0 };

    /**
     * Boutons souris maintenus (index: 0=gauche, 1=milieu, 2=droit).
     * @type {boolean[]}
     */
    this.mouseDown = [false, false, false];

    /**
     * Boutons pressés "cette frame" (edge).
     * Reset dans endFrame().
     * @type {boolean[]}
     */
    this.mousePressed = [false, false, false];

    /**
     * Élément canvas auquel la souris est bindée (info debug/maintenance).
     * @type {HTMLElement|null}
     */
    this._mouseBoundEl = null;
  }

  /**
   * Lie la souris à un canvas:
   * - calcule mouse.x/y via getBoundingClientRect()
   * - track mousedown sur canvas
   * - track mouseup sur window (important: relâcher même en dehors du canvas)
   *
   * @param {HTMLCanvasElement} canvas
   */
  bindMouse(canvas) {
    if (!canvas) return;
    this._mouseBoundEl = canvas;

    // Convertit la position client (fenêtre) en coords relatives au canvas
    const getPos = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    };

    canvas.addEventListener("mousemove", (e) => getPos(e));

    canvas.addEventListener("mousedown", (e) => {
      getPos(e);
      const b = e.button ?? 0;

      // Etat "down" + edge "pressed"
      this.mouseDown[b] = true;
      this.mousePressed[b] = true;

      // Optionnel: focus le canvas si supporté (utile si tu gères tabIndex)
      canvas.focus?.();

      // Evite sélection/drag/scroll selon le navigateur
      e.preventDefault();
    });

    // IMPORTANT: mouseup sur window pour ne pas rester "bloqué" down si relâché hors canvas
    window.addEventListener("mouseup", (e) => {
      const b = e.button ?? 0;
      this.mouseDown[b] = false;
    });

    // Empêche le menu contextuel au clic droit (optionnel)
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /**
   * Edge mouse: true seulement la frame où le bouton vient d'être pressé.
   */
  wasMousePressed(button = 0) {
    return !!this.mousePressed[button];
  }

  /**
   * Etat mouse: true tant que le bouton est maintenu.
   */
  isMouseDown(button = 0) {
    return !!this.mouseDown[button];
  }

  // ----------------------------
  // API clavier
  // ----------------------------

  /**
   * @param {string} code KeyboardEvent.code (ex: "KeyW", "ArrowLeft")
   */
  isDown(code) {
    return this.down.has(code);
  }

  /**
   * @param {string} code KeyboardEvent.code
   * @returns {boolean} true seulement la frame où la touche vient d'être pressée
   */
  wasPressed(code) {
    return this.pressed.has(code);
  }

  // ----------------------------
  // Axes mouvement (arcade)
  // ----------------------------

  /**
   * Axe horizontal:
   * - gauche = -1 (ArrowLeft ou Q)
   * - droite = +1 (ArrowRight ou D)
   * Valeur possible: -1, 0, 1, ou 0 si contradictions (gauche+droit => 0).
   */
  axisX() {
    const left = this.isDown("ArrowLeft") || this.isDown("KeyQ") ? -1 : 0;
    const right = this.isDown("ArrowRight") || this.isDown("KeyD") ? 1 : 0;
    return left + right;
  }

  /**
   * Axe vertical:
   * - up = -1 (ArrowUp ou Z)
   * - down = +1 (ArrowDown ou S)
   * (Attention: -1 = vers le haut en world ? dépend de ton système de coordonnées.)
   */
  axisY() {
    const up = this.isDown("ArrowUp") || this.isDown("KeyZ") ? -1 : 0;
    const down = this.isDown("ArrowDown") || this.isDown("KeyS") ? 1 : 0;
    return up + down;
  }

  /**
   * DOIT être appelé en fin de frame (après update()).
   * - reset "pressed" clavier
   * - reset "pressed" souris
   */
  endFrame() {
    this.pressed.clear();

    // Reset edges souris (on garde mouseDown, on reset mousePressed)
    this.mousePressed[0] = this.mousePressed[1] = this.mousePressed[2] = false;
  }
}
