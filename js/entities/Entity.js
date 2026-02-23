import { aabb } from "../physics/AABB.js";

/**
 * Base class de toutes les entités "vivantes" du monde (player, ped, véhicules, props...).
 *
 * Convention importante:
 * - (x, y) = centre de l'entité (pas le coin haut-gauche).
 * - (w, h) = taille AABB (axis-aligned) utilisée pour collisions entité↔entité et requêtes spatial.
 * - vx/vy = vitesse en world units / seconde.
 * - angle = orientation (radians) surtout pour rendu et conduite.
 *
 * Collisions:
 * - solid: si true, participe aux collisions entités (broadphase + résolution).
 * - invMass: "inverse mass" pour la résolution:
 *   - 1   = léger (bouge facilement)
 *   - 0.25= lourd (voiture)
 *   - 0   = immobile (roadblock)
 */
let _NEXT_ID = 1;

export class Entity {
  constructor({ x = 0, y = 0, w = 20, h = 20 } = {}) {
    /** @type {number} Identifiant unique runtime (non persistant) */
    this.id = _NEXT_ID++;

    /** @type {number} Centre world */
    this.x = x;
    /** @type {number} Centre world */
    this.y = y;

    /** @type {number} Largeur AABB */
    this.w = w;
    /** @type {number} Hauteur AABB */
    this.h = h;

    /** @type {number} Vitesse X (world units/s) */
    this.vx = 0;
    /** @type {number} Vitesse Y (world units/s) */
    this.vy = 0;

    /** @type {number} Orientation (radians) */
    this.angle = 0;

    /** @type {string} Couleur debug (si rendu simple) */
    this.color = "#d9d9d9";

    /** @type {string} Type logique (sert à filtrer collisions/armes/IA) */
    this.kind = "entity";

    /** @type {boolean} Collisions entité↔entité activées ? */
    this.solid = true;

    /** @type {number} Inverse mass (voir en-tête) */
    this.invMass = 1;
  }

  /**
   * Hitbox AABB centrée sur (x,y).
   * Note: volontairement AABB (pas orientée), même si angle existe.
   */
  hitbox() {
    return aabb(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
  }

  /**
   * Update logique — à override.
   * @param {object} _ Contexte transmis par Game.update()
   */
  update(_) {}

  /**
   * Hook collision entité↔entité — à override.
   * @param {Entity} _other Autre entité
   * @param {object} _mtv Minimum Translation Vector (résolution)
   * @param {number} _dt Delta time secondes
   */
  onCollide(_other, _mtv, _dt) {
    // override dans subclasses
  }

  /**
   * Sérialisation minimale.
   * Note: "id" n'est pas persistant (runtime only).
   */
  serialize() {
    return {
      kind: this.kind,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      angle: this.angle
    };
  }
}
