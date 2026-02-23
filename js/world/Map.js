/**
 * Map tile-based.
 *
 * Convention:
 * - width/height = dimensions en NOMBRE DE TILES (pas en pixels)
 * - tileSize = taille d'une tuile en world units (pixels logique)
 * - tiles = tableau 1D de taille width*height
 * - solids = liste d'IDs de tuiles considérées comme des murs (collisions)
 *
 * Extensions V8_3_1_2_2:
 * - On conserve les champs "meta" (tous les champs JSON inconnus) pour décrire une "ville"
 *   (nom, districts, spawns, missions suggérées, etc.).
 * - oneWay / laneCount: métadonnées route par tuile (optionnel).
 */
export class Map {
  /**
   * @param {object} p
   * @param {string} [p.id]
   * @param {number} p.width  Nombre de tuiles (X)
   * @param {number} p.height Nombre de tuiles (Y)
   * @param {number} p.tileSize Taille d'une tuile en world units
   * @param {number[]} p.tiles  Tableau 1D (y*width+x)
   * @param {number[]} p.solids Liste d'IDs de tuiles solides
   * @param {number[]} [p.oneWay]  Tableau 1D (y*width+x) de sens uniques (0=2-sens, 1=E,2=W,3=S,4=N)
   * @param {number[]} [p.laneCount] Tableau 1D (y*width+x) du nombre de voies par sens (1..4)
   * @param {any} [p.meta] (optionnel) métadonnées libres (nom, districts, spawns...)
   */
  constructor({ id, width, height, tileSize, tiles, solids, oneWay, laneCount, ...meta }) {
    this.id = id ?? "demo";

    // Métadonnées "ville" (rest JSON fields)
    // Exemples possibles:
    // - name, country, style
    // - districts: [{id,name,bounds:{x0,y0,x1,y1}}]
    // - spawns: { player:{x,y}, peds:[{x,y}...], vehicles:[{x,y,model}...] }
    // - missionHints: { goto:{...}, stealDeliver:{...} }
    // - legend: {"0":"..."}
    this.meta = meta ?? {};
    this.name = this.meta.name ?? this.id;

    /** nombre de tiles */
    this.width = width;
    /** nombre de tiles */
    this.height = height;

    /** taille d'une tile (world units) */
    this.tileSize = (Number.isFinite(tileSize) ? tileSize : 64);

    /** @type {number[]} tiles indexées y*width+x */
    this.tiles = tiles;

    /** @type {Set<number>} tile ids solides */
    this.solids = new Set(solids);

    // --- Route metadata (optionnel) ---
    // oneWay / laneCount sont des tableaux 1D alignés sur tiles[].
    // Si absents ou incohérents (mauvaise taille), on les ignore.
    const n = (width ?? 0) * (height ?? 0);
    this.oneWay = Array.isArray(oneWay) && oneWay.length === n ? oneWay : null;
    this.laneCount = Array.isArray(laneCount) && laneCount.length === n ? laneCount : null;
  }

  /** Index 1D dans tiles[] */
  idx(x, y) {
    return y * this.width + x;
  }

  /**
   * Lit l'id de tuile à (x,y) (en coordonnées tile).
   * Hors-map => renvoie 1 (mur) pour fermer le monde.
   */
  tileAt(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 1; // hors map = mur
    return this.tiles[this.idx(x, y)] ?? 0;
  }

  /** Sens unique à (x,y). 0 = 2-sens, 1=E,2=W,3=S,4=N. */
  oneWayAt(x, y) {
    if (!this.oneWay) return 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.oneWay[this.idx(x, y)] ?? 0;
  }

  /** Nombre de voies par sens à (x,y). Défaut 2 sur route, 1 ailleurs. */
  laneCountAt(x, y) {
    // Par défaut, on considère qu'une route "standard" a 2 voies par sens
    // (ça donne immédiatement l'effet multi-lanes sans avoir à authorer un layer).
    if (!this.laneCount) {
      const t = this.tileAt(x, y);
      return (t === 2) ? 2 : 1;
    }
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 1;
    const v = this.laneCount[this.idx(x, y)] ?? 1;
    return Math.max(1, Math.min(4, v | 0));
  }

  /** True si la tuile est solide (mur / obstacle). */
  isSolidTile(t) {
    return this.solids.has(t);
  }

  /**
   * Couleur debug par type de tuile.
   * (Proto: rendu couleur plein écran, pas de sprites.)
   */
  tileColor(t) {
    switch (t) {
      case 0: return "#1e242c"; // sol
      case 1: return "#38424f"; // batiment/mur
      case 2: return "#2a2a2a"; // route
      case 3: return "#3b3b3b"; // trottoir
      case 4: return "#4DBBFF"; // eau
      case 5: return "#00AA00"; // parc/végétation
      case 6: return "#7B4F2E"; // voie ferrée — MARRON
      case 7: return "#C8860A"; // dalle gare — ocre
      case 8: return "#1A1A1A"; // autoroute
      case 9: return "#203a2a"; // trigger
      default: return "#222";
    }
  }

  /**
   * Collision décor:
   * Teste si un AABB touche au moins une tuile solide.
   *
   * Entrée AABB:
   * - aabb.x/y = top-left en world
   * - aabb.w/h = taille en world
   *
   * Algo:
   * - convertit la zone AABB en range de tuiles [x0..x1], [y0..y1]
   * - si une seule tuile solide est trouvée -> true
   *
   * Note:
   * - x1/y1 utilisent floor((x+w)/ts) etc.
   * - si aabb tombe pile sur une frontière de tile, tu peux inclure la tile suivante.
   *   (Souvent OK en arcade.)
   */
  aabbHitsSolid(aabb) {
    const ts = this.tileSize;

    const x0 = Math.floor(aabb.x / ts);
    const y0 = Math.floor(aabb.y / ts);
    const x1 = Math.floor((aabb.x + aabb.w) / ts);
    const y1 = Math.floor((aabb.y + aabb.h) / ts);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = this.tileAt(x, y);
        if (this.isSolidTile(t)) return true;
      }
    }
    return false;
  }
}
