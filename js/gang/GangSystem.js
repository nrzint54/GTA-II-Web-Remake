/**
 * GangSystem (V1_2_0)
 *
 * Système de gangs inspiré de GTA2:
 * - Zaibatsu (rouge)   : gang corporatif, zone industrielle
 * - Loonies  (orange)  : gang de fous, zone résidentielle
 * - Yakuza   (cyan)    : gang asiatique, zone commerciale
 *
 * Chaque gang a:
 * - Une zone délimitée (bounds en tiles)
 * - Une réputation joueur: -100 (ennemi) à +100 (allié)
 * - Une réaction selon la réputation:
 *   - >= 20 : allié (aide, ignore)
 *   - -20 à 20 : neutre (ignore)
 *   - <= -20 : ennemi (attaque)
 *
 * Usage:
 *   gangSystem.init(map)
 *   gangSystem.update({ dt, player, entities, hud })
 *   gangSystem.addRespect(gangId, amount)
 *   gangSystem.getReputation(gangId) -> number
 *   gangSystem.draw(ctx, camera, map)
 */

export const GANG_DEFS = [
  {
    id: "zaibatsu",
    name: "Zaibatsu",
    color: "#FF2222",
    colorDark: "#880000",
    // Zone couvrant ~1/3 de la map (adaptée dynamiquement à la taille réelle de la map)
    boundsRatio: { x0: 0.60, y0: 0.0,  x1: 1.0,  y1: 0.5 },
    spawnRate: 2, // peds de gang / spawns
    reputation: 0
  },
  {
    id: "loonies",
    name: "Loonies",
    color: "#FF8800",
    colorDark: "#884400",
    boundsRatio: { x0: 0.0, y0: 0.5, x1: 0.45, y1: 1.0 },
    spawnRate: 2,
    reputation: 0
  },
  {
    id: "yakuza",
    name: "Yakuza",
    color: "#00DDFF",
    colorDark: "#006688",
    boundsRatio: { x0: 0.0, y0: 0.0, x1: 0.55, y1: 0.5 },
    spawnRate: 2,
    reputation: 0
  }
];

export class GangSystem {
  constructor() {
    /** @type {GangDef[]} Définitions des gangs (copies modifiables) */
    this.gangs = GANG_DEFS.map(g => ({ ...g, bounds: null, reputation: 0 }));

    /** Map ref (set dans init) */
    this._map = null;

    /** Timer spawn peds de gang */
    this._spawnT = 0;
    this._maxGangPeds = 12;
  }

  /**
   * Initialise les bounds réelles selon la map.
   * @param {object} map
   */
  init(map) {
    this._map = map;
    const w = map.width * map.tileSize;
    const h = map.height * map.tileSize;

    for (const g of this.gangs) {
      const r = g.boundsRatio;
      g.bounds = {
        x0: r.x0 * w,
        y0: r.y0 * h,
        x1: r.x1 * w,
        y1: r.y1 * h
      };
    }
  }

  /**
   * Retourne le gang dont le joueur est dans la zone (ou null).
   * @param {number} x
   * @param {number} y
   * @returns {GangDef|null}
   */
  getGangAtPosition(x, y) {
    for (const g of this.gangs) {
      if (!g.bounds) continue;
      if (x >= g.bounds.x0 && x <= g.bounds.x1 &&
          y >= g.bounds.y0 && y <= g.bounds.y1) {
        return g;
      }
    }
    return null;
  }

  /**
   * Retourne le gang par ID.
   * @param {string} id
   * @returns {GangDef|null}
   */
  getGang(id) {
    return this.gangs.find(g => g.id === id) ?? null;
  }

  /**
   * Modifie la réputation avec un gang.
   * @param {string} gangId
   * @param {number} amount (positif = gagner de la réputation)
   */
  addRespect(gangId, amount) {
    const g = this.getGang(gangId);
    if (!g) return;
    g.reputation = Math.max(-100, Math.min(100, g.reputation + amount));
  }

  /**
   * Retourne la réputation avec un gang.
   * @param {string} gangId
   * @returns {number}
   */
  getReputation(gangId) {
    return this.getGang(gangId)?.reputation ?? 0;
  }

  /**
   * Est-ce que le gang est allié?
   * @param {string} gangId
   * @returns {boolean}
   */
  isAlly(gangId) {
    return this.getReputation(gangId) >= 20;
  }

  /**
   * Est-ce que le gang est ennemi?
   * @param {string} gangId
   * @returns {boolean}
   */
  isEnemy(gangId) {
    return this.getReputation(gangId) <= -20;
  }

  /**
   * Update du système de gang.
   * - Applique les réactions des peds de gang au joueur selon réputation.
   */
  update({ dt, player, entities, hud }) {
    if (!this._map) return;

    // Détecte si le joueur entre dans un nouveau territoire
    const currentGang = this.getGangAtPosition(player.x, player.y);

    // Réactions des peds de gang (marqués avec e.gangId)
    for (const e of entities) {
      if (!e || !e.gangId) continue;
      if (e.dead || (e.health ?? 1) <= 0) continue;

      const rep = this.getReputation(e.gangId);

      // Si ennemi: les peds de gang attaquent le joueur (panique inversée)
      if (rep <= -20 && e.kind === "ped") {
        // Fait marcher le ped vers le joueur (override wander)
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d < 200 && d > 1) {
          // La logique d'attaque est simple: on pousse le ped vers le joueur.
          // Le ped normal n'a pas de tir, donc c'est du contact.
          e.state = "gang_attack";
          e._gangTargetX = player.x;
          e._gangTargetY = player.y;
        }
      } else if (rep >= 20 && e.kind === "ped") {
        // Allié: ignore le joueur
        if (e.state === "gang_attack") e.state = "wander";
      }
    }
  }

  /**
   * Rendu des zones de gang (indicateurs visuels sur la map).
   * Dessine un bord coloré subtil sur les frontières de zone.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} camera
   */
  draw(ctx, camera) {
    for (const g of this.gangs) {
      if (!g.bounds) continue;

      const tl = camera.worldToScreen(g.bounds.x0, g.bounds.y0);
      const br = camera.worldToScreen(g.bounds.x1, g.bounds.y1);
      const w = br.x - tl.x;
      const h = br.y - tl.y;

      // Bord coloré très subtil (greybox: juste le contour)
      ctx.strokeStyle = g.color + "44";
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      ctx.strokeRect(tl.x, tl.y, w, h);
      ctx.setLineDash([]);

      // Label du gang dans un coin
      const labelX = tl.x + 6;
      const labelY = tl.y + 16;
      if (w > 60 && h > 30) {
        ctx.fillStyle = g.color + "99";
        ctx.font = "bold 11px monospace";
        ctx.fillText(g.name.toUpperCase(), labelX, labelY);

        // Indicateur de réputation
        const rep = g.reputation;
        const repStr = rep >= 0 ? `+${rep}` : `${rep}`;
        ctx.fillStyle = rep >= 20 ? "#00FF00" : rep <= -20 ? "#FF4444" : "#FFFFFF88";
        ctx.font = "10px monospace";
        ctx.fillText(`REP: ${repStr}`, labelX, labelY + 13);
      }
    }
  }

  /**
   * Sérialise les réputations pour la sauvegarde.
   * @returns {object}
   */
  serialize() {
    const rep = {};
    for (const g of this.gangs) rep[g.id] = g.reputation;
    return { reputations: rep };
  }

  /**
   * Restaure les réputations depuis une sauvegarde.
   * @param {object} data
   */
  deserialize(data) {
    const rep = data?.reputations ?? {};
    for (const g of this.gangs) {
      if (rep[g.id] !== undefined) g.reputation = rep[g.id];
    }
  }
}
