import { SpriteSheet } from "./SpriteSheet.js";

/**
 * VehicleSpriteBank
 *
 * Objectif (fidélité GTA2):
 * - On dessine les véhicules à partir d'une seule frame top-down.
 * - La rotation est faite au runtime via ctx.rotate() (pixel-art sans flou).
 *
 * Support "strip 8 directions" (optionnel):
 * - Si un asset est détecté comme un strip horizontal 8 directions,
 *   on n'extrait que la 1ère frame (sx=0) et on la tourne au runtime.
 *
 * IMPORTANT (orientation):
 * - Les sprites 1-frame sont extraits dans l'orientation GTA2 (avant en haut/Nord).
 * - Dans notre repère (angle=0 => Est/droite), on doit tourner +90°.
 *   (Si tu utilises -90°, tu obtiens exactement le bug "feux arrière devant").
 */

export class VehicleSpriteBank {
  /**
   * @param {object} [p]
   * @param {string} [p.basePath]
   * @param {string} [p.ext]
   * @param {boolean} [p.rotateSingle]
   * @param {number} [p.singleAngleOffset]
   * @param {boolean} [p.enablePaintSwap]
   */
  constructor({
    basePath = "assets/vehicles",
    ext = "png",
    rotateSingle = true,
    singleAngleOffset = Math.PI / 2,
    enablePaintSwap = true
  } = {}) {
    this.basePath = basePath;
    this.ext = ext;

    this.rotateSingle = rotateSingle;
    this.singleAngleOffset = singleAngleOffset;

    // Palette-swap (trafic civil)
    this.enablePaintSwap = enablePaintSwap;

    /**
     * Cache par modelId.
     * variants: cache des versions recolorées (paintId -> canvas)
     * baseHue: hue de référence (issue de baseColor) pour recolorer uniquement la carrosserie.
     *
     * @type {Map<string,{sheet:SpriteSheet,frames:number,frameW:number,frameH:number,ready:boolean,error:boolean,stripDetected?:boolean,variants:Map<string,HTMLCanvasElement>,baseHue:number|null}>}
     */
    this._cache = new Map();
  }

  // ---------------------------------------------------------------------------
  // Palette defs (IDs = VehicleDefs.VEHICLE_PAINT_IDS)
  // ---------------------------------------------------------------------------
  static PAINTS = Object.freeze({
    white:    { h: 0,   s: 0.00 },
    silver:   { h: 0,   s: 0.06 },
    graphite: { h: 0,   s: 0.10 },
    black:    { h: 0,   s: 0.00, lMul: 0.55 },

    red:      { h: 0,   s: 0.72 },
    orange:   { h: 28,  s: 0.78 },
    yellow:   { h: 52,  s: 0.80 },
    lime:     { h: 78,  s: 0.72 },
    green:    { h: 120, s: 0.68 },
    teal:     { h: 170, s: 0.62 },
    blue:     { h: 210, s: 0.72 },
    navy:     { h: 232, s: 0.68, lMul: 0.80 },
    purple:   { h: 280, s: 0.70 }
  });

  static _parseHexColor(c) {
    if (typeof c !== "string") return null;
    const s = c.trim();
    const m = /^#([0-9a-fA-F]{6})$/.exec(s);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  static _rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s, l };
  }

  static _hslToRgb(h, s, l) {
    const C = (1 - Math.abs(2 * l - 1)) * s;
    const Hp = (h / 60);
    const X = C * (1 - Math.abs((Hp % 2) - 1));
    let r1 = 0, g1 = 0, b1 = 0;
    if (0 <= Hp && Hp < 1) { r1 = C; g1 = X; b1 = 0; }
    else if (1 <= Hp && Hp < 2) { r1 = X; g1 = C; b1 = 0; }
    else if (2 <= Hp && Hp < 3) { r1 = 0; g1 = C; b1 = X; }
    else if (3 <= Hp && Hp < 4) { r1 = 0; g1 = X; b1 = C; }
    else if (4 <= Hp && Hp < 5) { r1 = X; g1 = 0; b1 = C; }
    else if (5 <= Hp && Hp < 6) { r1 = C; g1 = 0; b1 = X; }
    const m = l - C / 2;
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255)
    };
  }

  _urlFor(modelId) {
    return `${this.basePath}/${modelId}.${this.ext}`;
  }

  /**
   * @param {string} modelId
   */
  _get(modelId) {
    const id = String(modelId || "").trim();
    if (!id) return null;

    let e = this._cache.get(id);
    if (!e) {
      e = {
        sheet: new SpriteSheet(this._urlFor(id)),
        frames: 1,
        frameW: 0,
        frameH: 0,
        ready: false,
        error: false,
        variants: new Map(),
        baseHue: null
      };
      this._cache.set(id, e);
    }

    const imgEntry = e.sheet.entry();
    e.error = !!imgEntry.error;
    if (!imgEntry.ready || imgEntry.error) {
      e.ready = false;
      return e;
    }

    const w = imgEntry.width;
    const h = imgEntry.height;

    // Détection strip 8 directions (évite faux positifs sur des frames carrées 64×64).
    // Heuristique:
    // - divisible par 8
    // - frame candidate >= 16px (sinon on finirait sur 8px pour 64×64)
    // - largeur suffisamment "allongée" vs hauteur
    const candW = w / 8;
    const looksLikeStrip8 =
      w >= 8 &&
      (w % 8 === 0) &&
      candW >= 16 &&
      w >= h * 2;

    e.stripDetected = looksLikeStrip8;
    e.frames = 1;
    e.frameW = looksLikeStrip8 ? Math.floor(candW) : w;
    e.frameH = h;
    e.ready = true;
    return e;
  }

  _ensureBaseHue(e, baseColor) {
    if (Number.isFinite(e.baseHue)) return;
    const rgb = VehicleSpriteBank._parseHexColor(baseColor);
    if (!rgb) { e.baseHue = null; return; }
    const { h } = VehicleSpriteBank._rgbToHsl(rgb.r, rgb.g, rgb.b);
    e.baseHue = Number.isFinite(h) ? h : null;
  }

  /**
   * Génère (et met en cache) une version recolorée du véhicule.
   * @param {any} e
   * @param {string} paintId
   * @param {string|null} baseColor
   * @returns {HTMLCanvasElement|null}
   */
  _getVariantCanvas(e, paintId, baseColor) {
    if (!this.enablePaintSwap) return null;
    const p = VehicleSpriteBank.PAINTS?.[paintId];
    if (!p) return null;

    const key = String(paintId);
    const cached = e.variants.get(key);
    if (cached) return cached;

    const imgEntry = e.sheet.entry();
    if (!imgEntry.ready || imgEntry.error) return null;

    this._ensureBaseHue(e, baseColor ?? null);

    const c = document.createElement("canvas");
    c.width = e.frameW;
    c.height = e.frameH;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;

    // Copie la frame de base (si strip 8 directions -> 1ère frame)
    ctx.drawImage(imgEntry.img, 0, 0, e.frameW, e.frameH, 0, 0, e.frameW, e.frameH);

    const img = ctx.getImageData(0, 0, e.frameW, e.frameH);
    const data = img.data;

    const baseHue = Number.isFinite(e.baseHue) ? e.baseHue : null;
    const targetHue = p.h;
    const targetS = p.s;
    const lMul = Number.isFinite(p.lMul) ? p.lMul : 1.0;

    // Heuristique GTA2-like:
    // - recolore uniquement les pixels suffisamment "colorés" (saturation)
    // - et proches de la teinte de référence du modèle (baseHue)
    // => évite de toucher vitres/pneus/contours.
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;

      const r = data[i], g = data[i + 1], b = data[i + 2];
      const hsl = VehicleSpriteBank._rgbToHsl(r, g, b);
      if (hsl.s < 0.18) continue;                 // trop gris
      if (hsl.l < 0.08 || hsl.l > 0.93) continue; // contours/reflets

      if (baseHue !== null) {
        const d = Math.abs(hsl.h - baseHue);
        const dh = Math.min(d, 360 - d);
        if (dh > 45) continue;
      }

      const nh = targetHue;
      const ns = Math.min(1, Math.max(0, (targetS > 0 ? (hsl.s * 0.35 + targetS * 0.65) : hsl.s * 0.18)));
      const nl = Math.min(1, Math.max(0, hsl.l * lMul));

      const rgb2 = VehicleSpriteBank._hslToRgb(nh, ns, nl);
      data[i] = rgb2.r;
      data[i + 1] = rgb2.g;
      data[i + 2] = rgb2.b;
    }

    ctx.putImageData(img, 0, 0);
    e.variants.set(key, c);
    return c;
  }

  /**
   * Dessine le véhicule (si sprite dispo).
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} p
   * @param {string} p.modelId
   * @param {number} p.angle
   * @param {number} p.x
   * @param {number} p.y
   * @param {number} p.w
   * @param {number} p.h
   * @param {string|null} [p.paintId]
   * @param {string|null} [p.baseColor]
   * @returns {boolean}
   */
  draw(ctx, { modelId, angle, x, y, w, h, paintId = null, baseColor = null }) {
    const e = this._get(modelId);
    if (!e || !e.ready || e.error) return false;

    const imgEntry = e.sheet.entry();
    if (!imgEntry.ready || imgEntry.error) return false;

    // Palette-swap: si paintId non-null, on tente d'obtenir un canvas recoloré.
    const variant = paintId ? this._getVariantCanvas(e, String(paintId), baseColor ?? null) : null;

    // Source: variant = canvas (déjà crop), sinon image originale.
    const src = variant || imgEntry.img;

    const a = Number.isFinite(angle) ? angle : 0;
    const cx = x + w / 2;
    const cy = y + h / 2;

    if (this.rotateSingle) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a + this.singleAngleOffset);

      // Si strip 8 directions: on ne garde que la 1ère frame (sx=0).
      ctx.drawImage(src, 0, 0, e.frameW, e.frameH, -w / 2, -h / 2, w, h);

      ctx.restore();
      return true;
    }

    // Fallback (rare): pas de rotation
    ctx.drawImage(src, 0, 0, e.frameW, e.frameH, x, y, w, h);
    return true;
  }
}
