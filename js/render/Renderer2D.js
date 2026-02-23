import { Camera } from "../world/Camera.js";

/**
 * Renderer2D (V1_2_0)
 *
 * Améliorations:
 * - Rendu pickups, hazards (huile, mines), garages, phones, zones de gang
 * - Effets shots/smoke/explosions/sparks améliorés
 * - Cop car sirène clignotante
 * - Indicateur armure joueur
 * - Rendu bombe compte à rebours
 */
export class Renderer2D {
  constructor(ctx, canvas) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.ctx.imageSmoothingEnabled = false;
    this.camera = new Camera();
    this.useVehicleSprites = false;
    this.map = null;
    this._tileKindCache = new Map();
    this._cachedMapRef = null;
  }

  setMap(map) { this.map = map; }

  beginFrame() {
    const { ctx, canvas } = this;
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    this.camera.update(canvas);
  }

  endFrame() {}
  worldToScreen(x, y) { return this.camera.worldToScreen(x, y); }

  drawMap(map) {
    const { ctx, canvas } = this;
    const ts = map.tileSize;
    const view = this.camera.viewRect(canvas);
    const x0 = Math.max(0, Math.floor(view.x / ts));
    const y0 = Math.max(0, Math.floor(view.y / ts));
    const x1 = Math.min(map.width,  Math.ceil((view.x + view.w) / ts));
    const y1 = Math.min(map.height, Math.ceil((view.y + view.h) / ts));

    if (this._cachedMapRef !== map) { this._cachedMapRef = map; this._tileKindCache.clear(); }

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const t = map.tileAt(x, y);
        const kind = this._tileKind(map, t);
        const wx = x * ts; const wy = y * ts;
        const s = this.worldToScreen(wx, wy);

        let base = "#333";
        switch (kind) {
          case "road":     base = "#2A2A2A"; break;
          case "sidewalk": base = "#777777"; break;
          case "water":    base = "#4DBBFF"; break;
          case "building": base = "#000000"; break;
          case "grass":    base = "#00AA00"; break;
          case "tree":     base = "#00AA00"; break;
          case "rail":     base = "#7B4F2E"; break;
          case "station":  base = "#C8860A"; break;
          case "highway":  base = "#1A1A1A"; break;
          default:         base = "#333"; break;
        }

        ctx.fillStyle = base;
        ctx.fillRect(s.x, s.y, ts, ts);

        if (kind === "tree") {
          const trunkW = Math.max(4, (ts*0.18)|0); const trunkH = Math.max(8,(ts*0.34)|0);
          const trunkX = (s.x+(ts>>1)-(trunkW>>1))|0; const trunkY = (s.y+(ts>>1)-(trunkH>>1)+(ts*0.18))|0;
          ctx.fillStyle = "#8B4513";
          ctx.fillRect(trunkX, trunkY, trunkW, trunkH);
          const cx=(s.x+(ts>>1))|0; const cy=(s.y+(ts>>1)-(ts*0.12))|0; const r=Math.max(6,(ts*0.28)|0);
          ctx.fillStyle = "#00AA00";
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
        }
      }
    }
  }

  _tileKind(map, tileId) {
    if (this._tileKindCache.has(tileId)) return this._tileKindCache.get(tileId);
    let kind = "default";
    if (tileId===2) kind="road"; else if(tileId===3) kind="sidewalk";
    else if(tileId===4) kind="water"; else if(tileId===1) kind="building";
    else if(tileId===8) kind="grass"; else if(tileId===9) kind="tree";
    const legend = map?.meta?.legend;
    const raw = legend ? (legend[String(tileId)] ?? "") : "";
    if (raw) {
      const n = String(raw).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
      if(n.includes("rail")||n.includes("train")||n.includes("tram")||n.includes("ferr")||n.includes("sncf")||n.includes("voie")) kind="rail";
      else if(n.includes("gare")||n.includes("station")) kind="station";
      else if(n.includes("autoroute")||n.includes("highway")||n.includes("freeway")||n.includes("motorway")) kind="highway";
      else if(n.includes("route")||n.includes("road")||n.includes("chaussee")||n.includes("chaussée")) kind="road";
      else if(n.includes("trottoir")||n.includes("sidewalk")||n.includes("pavement")) kind="sidewalk";
      else if(n.includes("eau")||n.includes("water")||n.includes("river")||n.includes("canal")||n.includes("fleuve")) kind="water";
      else if(n.includes("batiment")||n.includes("building")||n.includes("mur")||n.includes("wall")||n.includes("montagne")||n.includes("mount")) kind="building";
      else if(n.includes("parc")||n.includes("herbe")||n.includes("grass")||n.includes("park")||n.includes("vegetation")||n.includes("sol")) kind="grass";
      else if(n.includes("arbre")||n.includes("tree")) kind="tree";
    }
    this._tileKindCache.set(tileId, kind);
    return kind;
  }

  drawEntity(e) {
    const { ctx } = this;
    const s = this.worldToScreen(e.x, e.y);
    if (e.kind === "player" && e.inVehicle) return;
    const ang = Number.isFinite(e.angle) ? e.angle : 0;

    // JOUEUR
    if (e.kind === "player") {
      ctx.save();
      ctx.translate(s.x|0, s.y|0);
      ctx.rotate(ang);
      ctx.fillStyle = "#0000FF";
      ctx.fillRect(-10, -10, 20, 20);
      // Armure: halo bleu clair si armure active
      if ((e.armor ?? 0) > 0) {
        ctx.strokeStyle = "#44AAFF";
        ctx.lineWidth = 2;
        ctx.strokeRect(-11, -11, 22, 22);
      }
      ctx.fillStyle = "#FFFF00";
      ctx.fillRect(10+3, -2, 6, 4);
      ctx.restore();
      return;
    }

    // PNJ civils
    if (e.kind === "ped") {
      const color = e.color ?? (e.gangId ? "#FF8800" : "#b8ff6b");
      ctx.fillStyle = color;
      ctx.fillRect(s.x-10, s.y-10, 20, 20);
      return;
    }

    // POLICE à pied
    if (e.kind === "copped") {
      ctx.fillStyle = "#00008B";
      ctx.fillRect(s.x-12, s.y-12, 25, 25);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(s.x-4, s.y-4, 8, 8);
      return;
    }

    // VÉHICULES (+ CopCar)
    if (e.kind === "vehicle" || e.kind === "copcar") {
      const W = 40, H = 20;
      if (!e._greyboxColor) {
        if (e.kind === "copcar") {
          e._greyboxColor = "#1a1a8a";
        } else {
          const r=(Math.random()*200+30)|0;
          const g=(Math.random()*200+30)|0;
          const b=(Math.random()*200+30)|0;
          e._greyboxColor = `rgb(${r},${g},${b})`;
        }
      }
      ctx.save();
      ctx.translate(s.x|0, s.y|0);
      ctx.rotate(ang);

      // Carrosserie
      ctx.fillStyle = e._greyboxColor;
      ctx.fillRect(-W/2, -H/2, W, H);

      // Fumée si low HP
      if (e.smoke > 0) {
        ctx.fillStyle = `rgba(80,80,80,${e.smoke*0.6})`;
        ctx.fillRect(-W/2, -H/2, W, H);
      }

      // Bombe compte à rebours
      if (e.hasBomb && e.bombTimer !== null && e.bombTimer !== undefined) {
        const blink = (Math.floor(performance.now()/250)%2)===0;
        if (blink) {
          ctx.fillStyle = "#FF2200";
          ctx.fillRect(-6,-6,12,12);
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "8px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(Math.ceil(e.bombTimer??0), 0, 0);
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
        }
      }

      // Mitrailleuse véhicule
      if (e.hasVehicleGun) {
        ctx.fillStyle = "#888";
        ctx.fillRect(W/2-2, -3, 8, 6);
      }

      // Phares avant
      ctx.fillStyle = "#FFFF00";
      const fw=6, fh=4, frontX=W/2-4, sideY=H/2-4;
      ctx.fillRect(frontX-fw/2,  sideY-fh/2, fw, fh);
      ctx.fillRect(frontX-fw/2, -sideY-fh/2, fw, fh);

      // Sirène copcar (gyrophare)
      if (e.kind === "copcar" && e.sirenOn) {
        const t = (performance.now()/300)%1;
        const blueOn = t < 0.5;
        ctx.fillStyle = blueOn ? "#0000FF" : "#FF0000";
        ctx.fillRect(-6, -H/2-6, 12, 5);
      }

      ctx.restore();
      return;
    }

    // Fallback
    ctx.fillStyle = "#FFF";
    ctx.fillRect(s.x-6, s.y-6, 12, 12);
  }

  /**
   * Rendu des effets (shots, explosions, smoke, sparks).
   */
  drawEffects(effects) {
    if (!effects) return;
    const { ctx } = this;

    // Shots (tracers)
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 1.5;
    for (const s of effects.shots) {
      const a = this.worldToScreen(s.x1, s.y1);
      const b = this.worldToScreen(s.x2, s.y2);
      ctx.globalAlpha = Math.min(1, s.ttl / 0.08);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Explosions
    for (const ex of effects.explosions) {
      const s = this.worldToScreen(ex.x, ex.y);
      const t = 1 - ex.ttl/0.45;
      const r = ex.r * (0.5 + t * 0.5);
      ctx.globalAlpha = Math.max(0, 1 - t * 1.2);
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      grad.addColorStop(0, "#FFFFFF");
      grad.addColorStop(0.3, "#FFAA00");
      grad.addColorStop(0.7, "#FF4400");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Fumée
    for (const sm of effects.smokes) {
      const s = this.worldToScreen(sm.x, sm.y);
      ctx.globalAlpha = Math.min(0.5, sm.ttl / 0.9 * 0.5);
      ctx.fillStyle = "#888";
      ctx.beginPath(); ctx.arc(s.x, s.y, sm.r, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Étincelles
    for (const sp of effects.sparks) {
      const s = this.worldToScreen(sp.x, sp.y);
      ctx.globalAlpha = Math.max(0, sp.ttl / 0.28);
      ctx.fillStyle = "#FFD700";
      ctx.fillRect(s.x-2, s.y-2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  drawMissionOverlay(missions, player) {
    // Overlay minimal: flèche vers l'objectif courant si mission active
    if (!missions || !player) return;
    const target = missions?.currentTarget?.();
    if (!target) return;

    const { ctx, canvas } = this;
    const ps = this.worldToScreen(player.x, player.y);
    const ts = this.worldToScreen(target.x, target.y);

    // Flèche directionnelle depuis le centre de l'écran vers la cible
    const dx = ts.x - canvas.width/2;
    const dy = ts.y - canvas.height/2;
    const dist = Math.hypot(dx, dy);

    // Si la cible est visible à l'écran, dessine un cercle sur elle
    if (ts.x >= 0 && ts.x <= canvas.width && ts.y >= 0 && ts.y <= canvas.height) {
      ctx.strokeStyle = "#FFD700";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(ts.x, ts.y, 20, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#FFD700";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("★ OBJECTIF", ts.x, ts.y - 24);
      ctx.textAlign = "left";
    } else if (dist > 0) {
      // Hors écran: flèche sur le bord
      const nx = dx/dist; const ny = dy/dist;
      const margin = 40;
      const ex = canvas.width/2 + nx*(Math.min(canvas.width/2, canvas.height/2) - margin);
      const ey = canvas.height/2 + ny*(Math.min(canvas.width/2, canvas.height/2) - margin);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(Math.atan2(ny, nx));
      ctx.fillStyle = "#FFD700";
      ctx.beginPath();
      ctx.moveTo(12, 0); ctx.lineTo(-8, -6); ctx.lineTo(-8, 6); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
