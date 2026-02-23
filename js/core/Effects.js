/**
 * FX Manager (V8_b)
 * Centralise des petits effets 2D "cheap" :
 * - shots     : tracers hitscan
 * - explosions: flash/boom
 * - smokes    : fumée persistante
 * - sparks    : étincelles d'impact (mur / choc voiture)
 */
export class Effects {
  constructor() {
    /** @type {{x1:number,y1:number,x2:number,y2:number,ttl:number}[]} */
    this.shots = [];
    /** @type {{x:number,y:number,r:number,ttl:number}[]} */
    this.explosions = [];
    /** @type {{x:number,y:number,r:number,ttl:number}[]} */
    this.smokes = [];
    /** @type {{x:number,y:number,vx:number,vy:number,ttl:number}[]} */
    this.sparks = [];
  }

  update(dt) {
    // shots
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.ttl -= dt;
      if (s.ttl <= 0) this.shots.splice(i, 1);
    }

    // explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.ttl -= dt;
      if (ex.ttl <= 0) this.explosions.splice(i, 1);
    }

    // smoke
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const sm = this.smokes[i];
      sm.ttl -= dt;
      if (sm.ttl <= 0) this.smokes.splice(i, 1);
    }

    // sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.ttl -= dt;
      // petit amortissement
      sp.vx *= Math.max(0, 1 - 9 * dt);
      sp.vy *= Math.max(0, 1 - 9 * dt);
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      if (sp.ttl <= 0) this.sparks.splice(i, 1);
    }
  }

  addShot(x1, y1, x2, y2) {
    this.shots.push({ x1, y1, x2, y2, ttl: 0.08 });
  }

  addExplosion(x, y, r = 46) {
    this.explosions.push({ x, y, r, ttl: 0.45 });

    // petite fumée "post boom"
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rr = 10 + Math.random() * 14;
      const px = x + Math.cos(ang) * rr;
      const py = y + Math.sin(ang) * rr;
      this.addSmoke(px, py, 18 + Math.random() * 10);
    }
  }

  addSmoke(x, y, r = 18) {
    this.smokes.push({ x, y, r, ttl: 0.9 });
  }

  /**
   * Étincelles (impact).
   * @param {number} x
   * @param {number} y
   * @param {number} n nombre de particules
   * @param {number} strength vitesse initiale
   */
  addSparks(x, y, n = 6, strength = 220) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = strength * (0.35 + Math.random() * 0.65);
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        ttl: 0.18 + Math.random() * 0.10
      });
    }
  }
}
