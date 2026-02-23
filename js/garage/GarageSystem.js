/**
 * GarageSystem (V1_2_0)
 *
 * Garages inspirés de GTA2, avec 5 services:
 *
 * 1. Max Paynt     ($5,000)  : Répare voiture + efface wanted + change couleur
 * 2. Smith & Heston's ($25,000): Équipe mitrailleuse véhicule
 * 3. Gold Mines    ($50,000) : Équipe 10 mines sol (via HazardSystem)
 * 4. Hell Oil      ($10,000) : Équipe 10 taches d'huile (via HazardSystem)
 * 5. Red Army Surplus ($5,000): Pose une bombe à retardement sur le véhicule
 *
 * Chaque garage est une zone sur la map.
 * Quand le joueur entre dans la zone avec un véhicule, la porte se ferme
 * et le service est appliqué.
 *
 * Usage:
 *   garageSystem.init(map)
 *   garageSystem.update({ dt, player, entities, hud, hazardSystem })
 *   garageSystem.draw(ctx, camera)
 */

export const GARAGE_TYPES = {
  maxPaynt: {
    id: "maxPaynt",
    name: "Max Paynt",
    cost: 5000,
    size: 80,     // zone carrée (px)
    color: "#FF44CC",
    label: "MAX PAYNT\n$5,000\nRépare + Efface Wanted"
  },
  smithHeston: {
    id: "smithHeston",
    name: "Smith & Heston's",
    cost: 25000,
    size: 80,
    color: "#4488FF",
    label: "SMITH & HESTON'S\n$25,000\nMitrailleuse Véhicule"
  },
  goldMines: {
    id: "goldMines",
    name: "Gold Mines",
    cost: 50000,
    size: 80,
    color: "#FFD700",
    label: "GOLD MINES\n$50,000\n10 Mines"
  },
  hellOil: {
    id: "hellOil",
    name: "Hell Oil",
    cost: 10000,
    size: 80,
    color: "#884400",
    label: "HELL OIL\n$10,000\n10 Taches d'Huile"
  },
  redArmy: {
    id: "redArmy",
    name: "Red Army Surplus",
    cost: 5000,
    size: 80,
    color: "#FF2222",
    label: "RED ARMY SURPLUS\n$5,000\nBombe Voiture"
  }
};

export class GarageSystem {
  constructor() {
    /** @type {GarageInstance[]} */
    this.garages = [];

    /** Timer de fermeture de porte (animation greybox) */
    this._doorCloseT = 0;
    this._activating = null;
  }

  /**
   * Initialise les garages sur la map.
   * Les positions sont calculées depuis des points clés de la map.
   * @param {object} map
   */
  init(map) {
    const ts = map.tileSize;
    const W = map.width * ts;
    const H = map.height * ts;

    // Positions en proportion de la carte (robuste quelle que soit la taille)
    const positions = [
      { type: "maxPaynt",    rx: 0.25, ry: 0.25 },
      { type: "smithHeston", rx: 0.75, ry: 0.25 },
      { type: "goldMines",   rx: 0.25, ry: 0.75 },
      { type: "hellOil",     rx: 0.75, ry: 0.75 },
      { type: "redArmy",     rx: 0.50, ry: 0.50 }
    ];

    for (const pos of positions) {
      const def = GARAGE_TYPES[pos.type];
      const gx = pos.rx * W;
      const gy = pos.ry * H;

      // Snap à une tuile passable proche
      const tx = Math.floor(gx / ts);
      const ty = Math.floor(gy / ts);
      const snapX = (tx + 0.5) * ts;
      const snapY = (ty + 0.5) * ts;

      this.garages.push({
        ...def,
        x: snapX,
        y: snapY,
        doorState: "open", // open | closing | closed | open_after
        doorTimer: 0,
        _t: 0,
        _lastActivation: 0
      });
    }
  }

  /**
   * Update garages.
   */
  update({ dt, player, entities, hud, hazardSystem }) {
    for (const g of this.garages) {
      g._t += dt;
      g._lastActivation = Math.max(0, (g._lastActivation ?? 0) - dt);

      if (g._lastActivation > 0) continue; // cooldown

      // Détecte si le joueur (en véhicule) est dans la zone
      const inZone = player.inVehicle &&
        Math.abs(player.x - g.x) < g.size / 2 &&
        Math.abs(player.y - g.y) < g.size / 2;

      if (!inZone) continue;

      const vehicle = player.inVehicle;
      const cost = g.cost;

      if ((player.money ?? 0) < cost) {
        hud?.toast?.(`❌ Pas assez d'argent! ($${cost})`, 1.5);
        g._lastActivation = 3; // re-check dans 3s
        continue;
      }

      // Applique le service
      player.money -= cost;
      this._applyService(g, vehicle, player, hud, hazardSystem);
      g._lastActivation = 8; // cooldown 8s
    }
  }

  /**
   * Applique le service du garage au véhicule/joueur.
   * @private
   */
  _applyService(garage, vehicle, player, hud, hazardSystem) {
    switch (garage.id) {
      case "maxPaynt":
        // Réparer + wanted + recolorer
        vehicle.health = vehicle.healthMax ?? 120;
        vehicle.smoke = 0;
        vehicle.dead = false;
        player.wanted = 0;
        // Nouvelle couleur aléatoire
        const r = (Math.random() * 200 + 30) | 0;
        const gv = (Math.random() * 200 + 30) | 0;
        const b = (Math.random() * 200 + 30) | 0;
        vehicle._greyboxColor = `rgb(${r},${gv},${b})`;
        vehicle.color = vehicle._greyboxColor;
        hud?.toast?.("🎨 Max Paynt: Réparé + Wanted effacé!", 2.5);
        break;

      case "smithHeston":
        // Équipe mitrailleuse véhicule
        vehicle.hasVehicleGun = true;
        vehicle.vehicleGunAmmo = 200;
        hud?.toast?.("💥 Smith & Heston's: Mitrailleuse installée!", 2.5);
        break;

      case "goldMines":
        // 10 mines dans le chargeur
        player.mineAmmo = Math.min(10, (player.mineAmmo ?? 0) + 10);
        hud?.toast?.("💣 Gold Mines: 10 mines chargées! (Shift+M)", 2.5);
        break;

      case "hellOil":
        // 10 taches d'huile dans le chargeur
        vehicle.oilAmmo = Math.min(10, (vehicle.oilAmmo ?? 0) + 10);
        hud?.toast?.("🛢️ Hell Oil: 10 taches d'huile chargées! (Shift+O)", 2.5);
        break;

      case "redArmy":
        // Bombe à retardement sur le véhicule
        vehicle.hasBomb = true;
        vehicle.bombTimer = null; // armée, pas encore déclenchée
        hud?.toast?.("💣 Red Army Surplus: Bombe installée! (B pour activer)", 2.5);
        break;
    }
  }

  /**
   * Rendu greybox des garages.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} camera
   */
  draw(ctx, camera) {
    for (const g of this.garages) {
      const s = camera.worldToScreen(g.x, g.y);
      const half = g.size / 2;

      // Zone du garage (rectangle)
      ctx.strokeStyle = g.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(s.x - half, s.y - half, g.size, g.size);
      ctx.setLineDash([]);

      // Fond semi-transparent
      ctx.fillStyle = g.color + "22";
      ctx.fillRect(s.x - half, s.y - half, g.size, g.size);

      // "Porte" (barre épaisse en bas)
      ctx.fillStyle = g.color + "99";
      ctx.fillRect(s.x - half, s.y + half - 6, g.size, 6);

      // Label (nom court)
      ctx.fillStyle = g.color;
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(g.name.toUpperCase(), s.x, s.y - 5);
      ctx.fillStyle = "#FFFFFF88";
      ctx.font = "8px monospace";
      ctx.fillText(`$${g.cost.toLocaleString()}`, s.x, s.y + 7);
      ctx.textAlign = "left";

      // Pulsation / clignotement
      const blink = Math.sin(g._t * 3) > 0;
      if (blink) {
        ctx.fillStyle = g.color + "44";
        ctx.beginPath();
        ctx.arc(s.x, s.y - 15, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
