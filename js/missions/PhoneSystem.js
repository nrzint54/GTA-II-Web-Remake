/**
 * PhoneSystem (V1_2_0)
 *
 * Système de téléphones inspiré de GTA2:
 * - Les téléphones sont des objets physiques sur la map.
 * - Quand le joueur est dans le rayon d'un téléphone qui sonne, il peut
 *   appuyer sur T pour répondre et démarrer une mission.
 * - Chaque téléphone peut avoir une liste de missions rattachées.
 * - Après avoir décroché, le téléphone repart en cooldown.
 *
 * Usage:
 *   phoneSystem.init(map)
 *   phoneSystem.update({ dt, player, missionSystem, hud })
 *   phoneSystem.draw(ctx, camera)
 */

export class PhoneSystem {
  constructor() {
    /** @type {Phone[]} */
    this.phones = [];

    /** Rayon de réponse (px) */
    this.answerRadius = 40;

    /** Le téléphone actuellement actif (sonne) */
    this._activePhone = null;

    /** Timer de sonnerie entre les appels */
    this._ringT = 0;
    this._ringInterval = 0.4; // beep-beep toutes les 0.4s
    this._ringOn = false;
  }

  /**
   * Initialise des téléphones sur la carte.
   * Positions en proportions de map (robuste quelle que soit la taille).
   * @param {object} map
   * @param {Array<object>} [missionDefs] Définitions de missions à associer
   */
  init(map, missionDefs = []) {
    const ts = map.tileSize;
    const W = map.width * ts;
    const H = map.height * ts;

    // Points téléphones prédéfinis (proportions relatives)
    const phonePoints = [
      { rx: 0.15, ry: 0.15, gangId: "zaibatsu", label: "Zaibatsu" },
      { rx: 0.85, ry: 0.15, gangId: "loonies",  label: "Loonies"  },
      { rx: 0.15, ry: 0.85, gangId: "yakuza",   label: "Yakuza"   },
      { rx: 0.50, ry: 0.35, gangId: null,        label: "Anonyme"  },
      { rx: 0.70, ry: 0.65, gangId: null,        label: "Mystère"  },
    ];

    for (let idx = 0; idx < phonePoints.length; idx++) {
      const pp = phonePoints[idx];
      const x = pp.rx * W;
      const y = pp.ry * H;

      this.phones.push({
        x, y,
        gangId: pp.gangId,
        label: pp.label,
        // Missions associées (liste d'IDs ou de scripts)
        missions: missionDefs.filter(m => m.phoneIndex === idx),
        // État du téléphone
        ringing: false,
        ringDelay: 15 + idx * 8,  // décalage initial entre téléphones
        ringCooldown: 0,
        ringTimer: 0,
        answered: false,
        missionIndex: 0,
        _t: 0
      });
    }
  }

  /**
   * Update du système de téléphones.
   */
  update({ dt, player, missionSystem, hud }) {
    this._ringT = Math.max(0, this._ringT - dt);
    if (this._ringT <= 0) {
      this._ringOn = !this._ringOn;
      this._ringT = this._ringInterval;
    }

    for (const phone of this.phones) {
      phone._t += dt;

      // Cooldown entre appels
      if (phone.ringCooldown > 0) {
        phone.ringCooldown -= dt;
        phone.ringing = false;
        continue;
      }

      // Délai avant de commencer à sonner
      if (phone.ringDelay > 0) {
        phone.ringDelay -= dt;
        continue;
      }

      // Fait sonner le téléphone si pas en cours de mission
      phone.ringing = true;
      phone.ringTimer += dt;

      // Détecte proximité joueur
      const dx = player.x - phone.x;
      const dy = player.y - phone.y;
      const inRange = dx * dx + dy * dy < this.answerRadius * this.answerRadius;

      if (inRange) {
        // Affiche prompt de réponse
        hud?.toast?.(`📞 ${phone.label} sonne — [T] pour répondre`, 0.3);
      }
    }

    // Pas de dépendance à input ici — appelé depuis Game avec wasPressed
  }

  /**
   * Tente de répondre au téléphone le plus proche du joueur.
   * @param {number} playerX
   * @param {number} playerY
   * @param {object} missionSystem
   * @param {object} hud
   * @param {object} gangSystem (optionnel)
   * @returns {boolean} true si un téléphone a été décroché
   */
  tryAnswer(playerX, playerY, missionSystem, hud, gangSystem) {
    const r2 = this.answerRadius * this.answerRadius;

    for (const phone of this.phones) {
      if (!phone.ringing) continue;
      if (phone.ringCooldown > 0) continue;

      const dx = playerX - phone.x;
      const dy = playerY - phone.y;
      if (dx * dx + dy * dy > r2) continue;

      // Décrocher le téléphone
      phone.ringing = false;
      phone.ringCooldown = 30 + Math.random() * 20; // re-sonne dans 30-50s

      // Donner de la réputation gang si applicable
      if (phone.gangId && gangSystem) {
        gangSystem.addRespect(phone.gangId, 5);
        hud?.toast?.(`📞 [${phone.label}]: Mission disponible! +5 REP`, 2.5);
      } else {
        hud?.toast?.(`📞 [${phone.label}]: Mission disponible!`, 2.5);
      }

      // Déclencher la prochaine mission non complétée
      if (missionSystem?.startNext?.()) {
        hud?.toast?.(`🎯 Nouvelle mission: ${missionSystem.currentName?.() ?? "?"}`, 2.0);
      }

      return true;
    }

    return false;
  }

  /**
   * Rendu greybox des téléphones.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} camera
   */
  draw(ctx, camera) {
    for (const phone of this.phones) {
      if (phone.ringCooldown > 0) continue; // pas visible en cooldown

      const s = camera.worldToScreen(phone.x, phone.y);
      const ringing = phone.ringing;

      // Couleur selon sonnerie
      const color = ringing ? (this._ringOn ? "#FFFF00" : "#AAAA00") : "#AAAAAA";

      // Boîtier du téléphone
      ctx.fillStyle = "#333";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillRect(s.x - 7, s.y - 7, 14, 14);
      ctx.strokeRect(s.x - 7, s.y - 7, 14, 14);

      // Combiné (forme simplifiée)
      ctx.fillStyle = color;
      ctx.fillRect(s.x - 4, s.y - 5, 8, 3);  // haut
      ctx.fillRect(s.x - 4, s.y + 2, 8, 3);  // bas
      ctx.fillRect(s.x - 4, s.y - 5, 2, 10); // gauche
      ctx.fillRect(s.x + 2,  s.y - 5, 2, 10); // droite

      // Ondes sonores si sonnerie active
      if (ringing && this._ringOn) {
        ctx.strokeStyle = "#FFFF00";
        ctx.lineWidth = 1;
        for (let r = 1; r <= 3; r++) {
          ctx.globalAlpha = (4 - r) / 4;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 12 + r * 6, -Math.PI / 2 - 0.4, -Math.PI / 2 + 0.4);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Label du gang
      if (phone.label) {
        ctx.fillStyle = "#FFFFFF88";
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillText(phone.label, s.x, s.y - 12);
        ctx.textAlign = "left";
      }
    }
  }
}
