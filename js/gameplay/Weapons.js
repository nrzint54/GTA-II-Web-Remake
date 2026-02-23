/**
 * Gameplay / Weapons
 *
 * Ici: mécanique "hitscan" (rayon instantané).
 *
 * Principe:
 * - On trace un segment du point (origin) jusqu'à (origin + dir * range)
 * - On teste l'intersection avec les hitbox AABB des entités
 * - On renvoie la PREMIÈRE entité touchée (la plus proche sur le segment)
 *
 * Attention:
 * - Pas de gestion de tiles/walls ici (les murs ne bloquent pas le tir),
 *   sauf si tu ajoutes un test map.raycast ou une aabbHitsSolid le long du segment.
 * - Les hitbox sont axis-aligned (AABB), même si l'entité a un angle.
 */

/**
 * Tire un rayon (hitscan) et renvoie la première entité touchée.
 *
 * @param {object} p
 * @param {number} p.originX Point de départ (world)
 * @param {number} p.originY Point de départ (world)
 * @param {number} p.dirX Direction normalisée X (idéalement)
 * @param {number} p.dirY Direction normalisée Y (idéalement)
 * @param {number} p.range Longueur max du rayon
 * @param {any}    p.shooter Entité qui tire (ignorée dans les collisions)
 * @param {Array<any>} p.entities Liste d'entités testées
 * @param {(e:any)=>boolean} [p.filter] Filtre optionnel
 *
 * @returns {{entity:any, hitX:number, hitY:number, t:number} | null}
 *  - t ∈ [0,1] représente la position le long du segment (0=origin, 1=end)
 *  - hitX/hitY = point de contact sur le segment
 */
export function fireHitscan({ originX, originY, dirX, dirY, range, shooter, entities, filter }) {
  // Endpoint du segment (P1)
  const endX = originX + dirX * range;
  const endY = originY + dirY * range;

  // Meilleur hit (le plus proche, donc plus petit t)
  let best = null;

  for (const e of entities) {
    if (!e) continue;

    // On évite l'auto-hit
    if (e === shooter) continue;

    // Filtre métier (ex: n'autoriser que ped/cop/vehicle)
    if (filter && !filter(e)) continue;

    // Convention: ignore les carcasses (dead) et entités à 0 HP
    // (Permet que les "cadavres" ne bloquent pas les tirs)
    if (e.dead === true) continue;
    if ((e.health ?? 1) <= 0) continue;

    // Hitbox AABB obligatoire pour être touchable
    const hb = e.hitbox?.();
    if (!hb) continue;

    // Test intersection segment vs AABB
    const hit = segmentIntersectsAABB(originX, originY, endX, endY, hb.x, hb.y, hb.w, hb.h);
    if (!hit) continue;

    // On garde le hit le plus proche (t minimal)
    if (!best || hit.t < best.t) {
      best = { entity: e, hitX: hit.x, hitY: hit.y, t: hit.t };
    }
  }

  return best;
}

/**
 * Intersection segment P0(x0,y0) -> P1(x1,y1) avec un AABB (slab method).
 *
 * Entrée:
 * - segment défini par P(t) = P0 + t*(P1-P0), t ∈ [0,1]
 * - AABB défini par (ax,ay,aw,ah) où ax/ay = coin top-left (comme renvoyé par aabb())
 *
 * Sortie:
 * - null si pas d'intersection
 * - sinon { t, x, y } avec t = premier point d'entrée dans la boîte
 *
 * Note:
 * - Méthode "slab": calcule intervalle de t valide sur X puis sur Y
 * - Supporte dx≈0 ou dy≈0 (segment quasi vertical/horizontal)
 */
function segmentIntersectsAABB(x0, y0, x1, y1, ax, ay, aw, ah) {
  const dx = x1 - x0;
  const dy = y1 - y0;

  const minX = ax;
  const maxX = ax + aw;
  const minY = ay;
  const maxY = ay + ah;

  let tmin = 0; // entrée
  let tmax = 1; // sortie

  // --- Slab X ---
  if (Math.abs(dx) < 1e-8) {
    // Segment quasi vertical: il faut que x0 soit dans [minX, maxX]
    if (x0 < minX || x0 > maxX) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - x0) * inv;
    let t2 = (maxX - x0) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  // --- Slab Y ---
  if (Math.abs(dy) < 1e-8) {
    // Segment quasi horizontal: il faut que y0 soit dans [minY, maxY]
    if (y0 < minY || y0 > maxY) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - y0) * inv;
    let t2 = (maxY - y0) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  // tmin = premier instant où le segment "entre" dans l'AABB
  return { t: tmin, x: x0 + dx * tmin, y: y0 + dy * tmin };
}

/**
 * Applique des dégâts “génériques” sur une entité.
 * Centralisé pour éviter de dupliquer la logique partout.
 *
 * Règles:
 * - ignore target null
 * - ignore target.dead === true
 * - clamp HP à >= 0
 * - si la propriété "dead" existe sur l'entité et qu'on tombe à 0 HP:
 *   on met target.dead = true
 *
 * @param {any} target Entité (ped/cop/vehicle/copcar...) avec au moins {health}
 * @param {number} dmg Dégâts >= 0
 * @returns {boolean} true si la cible est "tuée" par ce coup (HP <= 0 après)
 */
export function applyDamage(target, dmg) {
  if (!target) return false;
  if (target.dead === true) return false;

  const hp = target.health ?? 0;
  const nhp = Math.max(0, hp - dmg);
  target.health = nhp;

  // Si l'entité supporte la notion de "dead", on la marque à 0 HP
  if (nhp <= 0 && "dead" in target) target.dead = true;

  return nhp <= 0;
}
