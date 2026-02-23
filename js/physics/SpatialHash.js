/**
 * SpatialHash = index broadphase pour réduire le coût des collisions entité↔entité.
 *
 * Idée:
 * - On découpe le monde en cellules carrées (cellSize).
 * - Chaque entité est insérée dans toutes les cellules que son AABB recouvre.
 * - queryAABB() renvoie les entités présentes dans les cellules correspondantes.
 *
 * Hypothèse:
 * - On rebuild la hash chaque frame (clear + insert tous les entities).
 *   C'est simple et stable, suffisant pour un prototype.
 */
export class SpatialHash {
  constructor(cellSize = 64) {
    /** @type {number} Taille cellule (world units) */
    this.cellSize = cellSize;

    /** @type {Map<string, any[]>} buckets par cellule "cx,cy" */
    this.map = new Map();
  }

  clear() {
    this.map.clear();
  }

  _key(cx, cy) {
    return `${cx},${cy}`;
  }

  /**
   * Calcule toutes les cellules intersectées par un AABB.
   * @param {{x:number,y:number,w:number,h:number}} a
   * @returns {Array<[number,number]>}
   */
  _cellsForAABB(a) {
    const cs = this.cellSize;

    const x0 = Math.floor(a.x / cs);
    const y0 = Math.floor(a.y / cs);
    const x1 = Math.floor((a.x + a.w) / cs);
    const y1 = Math.floor((a.y + a.h) / cs);

    const out = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) out.push([x, y]);
    }
    return out;
  }

  /**
   * Insert une entité dans la hash (dans toutes ses cellules).
   * @param {any} e Entité avec hitbox()
   */
  insert(e) {
    const a = e.hitbox();
    for (const [cx, cy] of this._cellsForAABB(a)) {
      const k = this._key(cx, cy);
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push(e);
    }
  }

  /**
   * Renvoie une liste d'entités candidates pour collision/interactions.
   * Déduplique via Set car une entité peut être présente dans plusieurs cellules.
   *
   * @param {{x:number,y:number,w:number,h:number}} aabb
   * @returns {any[]} candidates
   */
  queryAABB(aabb) {
    const found = new Set();
    for (const [cx, cy] of this._cellsForAABB(aabb)) {
      const k = this._key(cx, cy);
      const bucket = this.map.get(k);
      if (!bucket) continue;
      for (const e of bucket) found.add(e);
    }
    return [...found];
  }
}
