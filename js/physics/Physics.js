// Déplacement + collision décor (résolution séparée X puis Y)
import { aabb } from "./AABB.js"; // (actuellement non utilisé ici)

/**
 * Déplace une entité en appliquant une collision "tilemap" très simple.
 *
 * Méthode:
 * - applique dx sur x, teste collision, annule si collision
 * - applique dy sur y, teste collision, annule si collision
 *
 * Avantages:
 * - simple, stable, évite de “coller” dans les coins la plupart du temps
 *
 * Limites:
 * - pas de glissement avancé (pas de push le long du mur)
 * - si dx/dy trop grands (dt énorme), ça peut "téléporter" à travers des coins,
 *   même si Time clamp aide déjà à limiter.
 *
 * Requiert:
 * - map.aabbHitsSolid(aabb) → boolean
 *
 * @param {any} entity Entité avec x/y + hitbox()
 * @param {any} map Map exposant aabbHitsSolid()
 * @param {number} dx Déplacement X (world)
 * @param {number} dy Déplacement Y (world)
 */
export function moveWithTileCollisions(entity, map, dx, dy) {
  // 1) Axe X
  entity.x += dx;
  let box = entity.hitbox();
  if (map.aabbHitsSolid(box)) {
    // collision: on annule le mouvement X uniquement
    entity.x -= dx;
  }

  // 2) Axe Y
  entity.y += dy;
  box = entity.hitbox();
  if (map.aabbHitsSolid(box)) {
    // collision: on annule le mouvement Y uniquement
    entity.y -= dy;
  }
}
