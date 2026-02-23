/**
 * SpriteSheet
 *
 * Petit helper de rendu pour spritesheets (proto).
 * - Charge une image (lazy) via URL (cache global par URL)
 * - Permet de dessiner une frame (src rect) sur le canvas
 *
 * Le but est juste d'éviter de ré-écrire 15 fois la même logique.
 */

const _cache = new Map();

function _entryFor(url) {
  let e = _cache.get(url);
  if (e) return e;

  const img = new Image();
  img.decoding = "async";

  e = {
    url,
    img,
    ready: false,
    error: false,
    width: 0,
    height: 0
  };

  img.onload = () => {
    e.ready = true;
    e.width = img.naturalWidth || img.width;
    e.height = img.naturalHeight || img.height;
  };
  img.onerror = () => {
    e.error = true;
  };

  img.src = url;
  _cache.set(url, e);
  return e;
}

export class SpriteSheet {
  /**
   * @param {string} url
   */
  constructor(url) {
    this.url = url;
  }

  /** @returns {{img:HTMLImageElement,ready:boolean,error:boolean,width:number,height:number}} */
  entry() {
    return _entryFor(this.url);
  }

  /**
   * Dessine une frame.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} p
   * @param {number} p.sx Source X
   * @param {number} p.sy Source Y
   * @param {number} p.sw Source W
   * @param {number} p.sh Source H
   * @param {number} p.dx Dest X
   * @param {number} p.dy Dest Y
   * @param {number} p.dw Dest W
   * @param {number} p.dh Dest H
   * @returns {boolean} true si dessin effectué
   */
  drawFrame(ctx, { sx, sy, sw, sh, dx, dy, dw, dh }) {
    const e = this.entry();
    if (!e.ready || e.error) return false;
    ctx.drawImage(e.img, sx, sy, sw, sh, dx, dy, dw, dh);
    return true;
  }
}
