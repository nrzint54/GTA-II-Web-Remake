import { Entity } from "./Entity.js";

/**
 * Roadblock:
 * - Entité immobile, solide, masse infinie (invMass=0)
 * - Sert de barrière / obstacle destructible
 *
 * Note: update() force vx/vy à 0 pour empêcher toute dérive.
 */
export class Roadblock extends Entity {
  constructor({ x, y }) {
    super({ x, y, w: 40, h: 18 });
    this.kind = "roadblock";
    this.color = "#b00020";

    this.solid = true;
    this.invMass = 0; // immobile
    this.health = 80;
  }

  update() {
    // Immobile: aucune intégration vitesse/position
    this.vx = 0;
    this.vy = 0;
  }
}
