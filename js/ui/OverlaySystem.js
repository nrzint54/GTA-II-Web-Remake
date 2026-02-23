/**
 * OverlaySystem (V2_0_0)
 *
 * Rendu des overlays plein écran:
 * - WASTED (fond rouge qui s'assombrit + texte blanc)
 * - BUSTED (fond bleu + texte blanc)
 * - Minimap en coin (vue aérienne 120x120px des environs)
 * - Score/Stats (argent, missions complétées)
 *
 * Usage:
 *   overlaySystem.triggerWasted()
 *   overlaySystem.triggerBusted()
 *   overlaySystem.update(dt)
 *   overlaySystem.draw(ctx, canvas, player, map, camera, scriptEngine)
 */
export class OverlaySystem {
  constructor() {
    // État overlay
    this._wastedTimer = 0;
    this._bustedTimer = 0;
    this._wastedActive = false;
    this._bustedActive = false;

    // Minimap
    this._minimapSize = 120;
    this._minimapScale = 0.06;   // pixels world -> pixels minimap

    // Tiles minimap (cache couleur)
    this._minimapCache = null;
    this._minimapCacheMap = null;
  }

  triggerWasted() {
    this._wastedActive = true;
    this._wastedTimer = 2.5;
  }

  triggerBusted() {
    this._bustedActive = true;
    this._bustedTimer = 2.5;
  }

  update(dt) {
    if (this._wastedActive) {
      this._wastedTimer -= dt;
      if (this._wastedTimer <= 0) { this._wastedActive = false; this._wastedTimer = 0; }
    }
    if (this._bustedActive) {
      this._bustedTimer -= dt;
      if (this._bustedTimer <= 0) { this._bustedActive = false; this._bustedTimer = 0; }
    }
  }

  /**
   * Dessine tous les overlays.
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas
   * @param {object} player
   * @param {object} map
   * @param {object} camera
   * @param {object} scriptEngine
   */
  draw(ctx, canvas, player, map, camera, scriptEngine) {
    // Minimap
    this._drawMinimap(ctx, canvas, player, map);

    // WASTED
    if (this._wastedActive) {
      this._drawDeathOverlay(ctx, canvas, "WASTED", "#FF0000", this._wastedTimer, 2.5);
    }

    // BUSTED
    if (this._bustedActive) {
      this._drawDeathOverlay(ctx, canvas, "BUSTED", "#0033CC", this._bustedTimer, 2.5);
    }

    // Score
    this._drawScore(ctx, canvas, player, scriptEngine);
  }

  _drawDeathOverlay(ctx, canvas, text, color, timer, maxTimer) {
    const t = 1 - timer / maxTimer; // 0 = début, 1 = fin
    const alpha = Math.min(0.85, t * 2);

    ctx.save();
    // Fond coloré
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;

    // Texte clignotant
    const blink = (Math.floor(performance.now() / 200) % 2) === 0;
    if (blink || t < 0.3) {
      const fontSize = 72;
      ctx.font = `bold ${fontSize}px Arial Black, Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Ombre
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillText(text, canvas.width/2 + 4, canvas.height/2 + 4);

      // Texte principal
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(text, canvas.width/2, canvas.height/2);
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  _drawMinimap(ctx, canvas, player, map) {
    const sz = this._minimapSize;
    const scale = this._minimapScale;
    const mx = canvas.width - sz - 12;
    const my = canvas.height - sz - 12;

    ctx.save();

    // Fond minimap
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.fillRect(mx, my, sz, sz);
    ctx.strokeRect(mx, my, sz, sz);

    // Clip à la zone minimap
    ctx.beginPath();
    ctx.rect(mx, my, sz, sz);
    ctx.clip();

    // Centre de la minimap = joueur
    const camX = player.x * scale - sz / 2;
    const camY = player.y * scale - sz / 2;

    // Dessiner les tiles de la map
    const ts = map.tileSize * scale;
    const tx0 = Math.max(0, Math.floor(camX / ts));
    const ty0 = Math.max(0, Math.floor(camY / ts));
    const tx1 = Math.min(map.width, Math.ceil((camX + sz) / ts) + 1);
    const ty1 = Math.min(map.height, Math.ceil((camY + sz) / ts) + 1);

    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        const t = map.tileAt(tx, ty);
        let col;
        switch(t) {
          case 1: col = "#000"; break;
          case 2: col = "#333"; break;
          case 3: col = "#555"; break;
          case 4: col = "#4DBBFF"; break;
          case 8: col = "#004400"; break;
          default: col = "#222"; break;
        }
        // Utiliser la légende si disponible
        const legend = map?.meta?.legend;
        const raw = legend ? (legend[String(t)] ?? "") : "";
        if (raw) {
          const n = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
          if (n.includes("route")||n.includes("road")) col = "#333";
          else if (n.includes("batiment")||n.includes("building")||n.includes("mur")) col = "#000";
          else if (n.includes("eau")||n.includes("water")) col = "#4DBBFF";
          else if (n.includes("parc")||n.includes("herbe")||n.includes("park")) col = "#004400";
          else if (n.includes("trottoir")||n.includes("sidewalk")) col = "#555";
        }
        ctx.fillStyle = col;
        const sx = mx + tx * ts - camX;
        const sy = my + ty * ts - camY;
        ctx.fillRect(sx, sy, ts + 0.5, ts + 0.5);
      }
    }

    // Joueur (point bleu)
    const px = mx + player.x * scale - camX;
    const py = my + player.y * scale - camY;
    ctx.fillStyle = player.inVehicle ? "#FFFF00" : "#0080FF";
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();

    // Indicateur direction joueur
    const ang = player.angle ?? 0;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(ang) * 6, py + Math.sin(ang) * 6);
    ctx.stroke();

    ctx.restore();
  }

  _drawScore(ctx, canvas, player, scriptEngine) {
    // Panel score discret en bas à droite
    const completed = scriptEngine?.completed?.size ?? 0;
    const total = scriptEngine?.scripts?.length ?? 0;
    const money = player.money ?? 0;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      `Missions: ${completed}/${total}  |  $${money.toLocaleString()}`,
      canvas.width - this._minimapSize - 20,
      canvas.height - 8
    );
    ctx.textAlign = "left";
    ctx.restore();
  }
}
