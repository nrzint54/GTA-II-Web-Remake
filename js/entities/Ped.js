import { Entity } from "./Entity.js";
import { moveWithTileCollisions } from "../physics/Physics.js";

/**
 * Ped (V2_0_0)
 *
 * Améliorations:
 * - Support gangId: les peds de gang ont un comportement différent
 * - État gang_attack: fonce vers le joueur si réputation négative
 * - Mort propre avec cadavre qui persiste
 */
export class Ped extends Entity {
  constructor({ x, y }) {
    super({ x, y, w: 16, h: 16 });
    this.kind = "ped";
    this.color = "#b8ff6b";
    this.health = 40;
    this.accel = 420;
    this.maxSpeed = 220;
    this.friction = 8;
    this.invMass = 1;

    // IA
    this.state = "wander"; // wander | panic | dead | gang_attack
    this.panicTime = 0;
    this.panicFromX = 0;
    this.panicFromY = 0;

    // Wander
    this._t = 0;
    this._dir = { x: 0, y: 0 };

    // Gang
    this.gangId = null;
    this._gangTargetX = null;
    this._gangTargetY = null;
    this._gangAttackCd = 0;
  }

  panicFrom(x, y, seconds = 2.0) {
    if (this.health <= 0) return;
    this.state = "panic";
    this.panicTime = Math.max(this.panicTime, seconds);
    this.panicFromX = x; this.panicFromY = y;
    this.color = this.gangId ? (this.gangId === "zaibatsu" ? "#FF2222" : this.gangId === "loonies" ? "#FF4400" : "#00AAFF") : "#ff7b7b";
  }

  update({ dt, map, spatial, player, entities }) {
    // Mort
    if (this.health <= 0) {
      this.state = "dead";
      this.solid = false;
      this.color = "#5a5a5a";
      this.vx *= 0.5; this.vy *= 0.5;
      return;
    }

    this._gangAttackCd = Math.max(0, (this._gangAttackCd ?? 0) - dt);

    let desiredX = 0, desiredY = 0;

    // IA Gang Attack
    if (this.state === "gang_attack" && this._gangTargetX !== null) {
      const dx = this._gangTargetX - this.x;
      const dy = this._gangTargetY - this.y;
      const d = Math.hypot(dx, dy) || 1;

      if (d < 20 && this._gangAttackCd === 0) {
        // Contact: attaque le joueur
        if (player && d < 25) {
          player.takeDamage?.(5);
          this._gangAttackCd = 0.5;
        }
        desiredX = 0; desiredY = 0;
      } else {
        desiredX = dx / d; desiredY = dy / d;
      }
      // Retour à wander si joueur trop loin
      if (d > 350) { this.state = "wander"; }

    } else if (this.state === "panic") {
      this.panicTime -= dt;
      if (this.panicTime <= 0) {
        this.panicTime = 0;
        this.state = "wander";
        this.color = this._origColor();
        this.maxSpeed = 220;
      } else {
        let dx = this.x - this.panicFromX; let dy = this.y - this.panicFromY;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d;
        desiredX = dx * 2.0; desiredY = dy * 2.0;
        if (player) {
          const px = this.x - player.x; const py = this.y - player.y;
          const pd2 = px*px + py*py;
          if (pd2 < 120*120 && pd2 > 1) {
            const inv = 1/Math.sqrt(pd2);
            desiredX += px*inv*1.2; desiredY += py*inv*1.2;
          }
        }
        this.maxSpeed = 320;
      }
    } else {
      // Wander
      this._t -= dt;
      if (this._t <= 0) {
        this._t = 0.6 + Math.random() * 1.2;
        const a = Math.random() * Math.PI * 2;
        this._dir.x = Math.cos(a); this._dir.y = Math.sin(a);
      }
      desiredX = this._dir.x; desiredY = this._dir.y;

      // Évitement
      let avoidX = 0, avoidY = 0;
      const nearby = spatial?.queryAABB?.(this.hitbox()) ?? [];
      for (const e of nearby) {
        if (e === this) continue;
        if (e.kind !== "vehicle" && e.kind !== "player") continue;
        const dx = this.x - e.x; const dy = this.y - e.y;
        const d2 = dx*dx + dy*dy;
        if (d2 > 1 && d2 < 90*90) { const inv=1/Math.sqrt(d2); avoidX+=dx*inv; avoidY+=dy*inv; }
      }
      desiredX += avoidX * 1.4; desiredY += avoidY * 1.4;
      this.maxSpeed = 220;
    }

    // Mouvement
    this.vx += desiredX * this.accel * dt;
    this.vy += desiredY * this.accel * dt;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > this.maxSpeed) { const s=this.maxSpeed/speed; this.vx*=s; this.vy*=s; }
    const fr = Math.max(0, 1 - this.friction * dt);
    this.vx *= fr; this.vy *= fr;
    if (Math.abs(this.vx) + Math.abs(this.vy) > 0.5) this.angle = Math.atan2(this.vy, this.vx);
    moveWithTileCollisions(this, map, this.vx * dt, this.vy * dt);
  }

  _origColor() {
    if (!this.gangId) return "#b8ff6b";
    if (this.gangId === "zaibatsu") return "#FF2222";
    if (this.gangId === "loonies") return "#FF8800";
    if (this.gangId === "yakuza") return "#00DDFF";
    return "#b8ff6b";
  }
}
