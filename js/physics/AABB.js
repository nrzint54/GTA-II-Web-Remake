/**
 * AABB helpers.
 *
 * Convention:
 * - x, y = coin haut-gauche (top-left) de la boîte
 * - w, h = dimensions positives
 *
 * Note: les entités stockent leur position au CENTRE (x,y),
 * puis Entity.hitbox() convertit en AABB top-left.
 */

/**
 * Construit un objet AABB.
 * @param {number} x top-left
 * @param {number} y top-left
 * @param {number} w width
 * @param {number} h height
 * @returns {{x:number,y:number,w:number,h:number}}
 */
export function aabb(x, y, w, h) {
  return { x, y, w, h };
}

/**
 * Test d'intersection AABB vs AABB.
 * @param {{x:number,y:number,w:number,h:number}} a
 * @param {{x:number,y:number,w:number,h:number}} b
 * @returns {boolean}
 */
export function intersects(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}
