/**
 * PickupSystem (V1_2_0)
 *
 * Gère les ramassables (pickups) éparpillés dans la ville, inspiré de GTA2:
 * - Money (argent)
 * - Health (soin)
 * - Armor (armure)
 * - Weapons (armes)
 * - PowerUps (bonus temporaires: vitesse, invincibilité…)
 *
 * Chaque pickup:
 * - A une position dans le monde
 * - Attend que le joueur passe dessus (<= collectRadius px)
 * - Disparaît un certain temps puis réapparaît (respawn timer)
 *
 * Usage:
 *   pickupSystem.spawnRandom(map, count) -- spawn aléatoire sur la map
 *   pickupSystem.update({ dt, player, hud, audio })
 *   pickupSystem.draw(ctx, camera)
 */

/** Types de pickups disponibles */
const PICKUP_TYPES = [
  { type: "money",   value: 500,    label: "💰 +$500",   color: "#FFD700", size: 14 },
  { type: "money",   value: 200,    label: "💰 +$200",   color: "#FFD700", size: 10 },
  { type: "health",  value: 40,     label: "❤️ +40 HP",  color: "#FF4444", size: 14 },
  { type: "armor",   value: 50,     label: "🛡️ +50 Armor",color: "#44AAFF", size: 14 },
  { type: "weapon",  value: "Uzi",  label: "🔫 Uzi",     color: "#AAAAAA", size: 14 },
  { type: "weapon",  value: "Shotgun", label:"🔫 Shotgun",color:"#AAAAAA", size:14 },
  { type: "weapon",  value: "Grenade",label:"💣 Grenade", color:"#888800", size:14 },
  { type: "weapon",  value: "RocketLauncher",label:"🚀 Rocket",color:"#FF6600",size:14},
  { type: "weapon",  value: "Flamethrower",label:"🔥 Flame",color:"#FF4400",size:14},
  { type: "powerup", value: "speed",label: "⚡ Speed!",  color: "#FFFF00", size: 16 },
];

export class PickupSystem {
  constructor() {
    /** @type {Pickup[]} */
    this.pickups = [];

    /** Rayon de collecte (px) */
    this.collectRadius = 22;
  }

  /**
   * Spawne N pickups aléatoires sur la carte.
   * @param {object} map
   * @param {number} count
   */
  spawnRandom(map, count = 40) {
    const ts = map.tileSize;
    const types = PICKUP_TYPES;
    let placed = 0;
    let tries = 0;

    while (placed < count && tries < 2000) {
      tries++;
      const tx = 4 + Math.floor(Math.random() * (map.width - 8));
      const ty = 4 + Math.floor(Math.random() * (map.height - 8));
      const t = map.tileAt(tx, ty);
      // On pose sur trottoir (3) ou sol (0) — pas sur bâtiment ni route
      if (t !== 3 && t !== 0) continue;

      const def = types[Math.floor(Math.random() * types.length)];
      this.pickups.push({
        x: (tx + 0.5) * ts,
        y: (ty + 0.5) * ts,
        type: def.type,
        value: def.value,
        label: def.label,
        color: def.color,
        size: def.size,
        active: true,
        respawnTimer: 0,
        respawnDelay: 25 + Math.random() * 20, // 25-45s
        // animation pulse
        _t: Math.random() * Math.PI * 2
      });
      placed++;
    }
  }

  /**
   * Ajoute un pickup à une position précise.
   * @param {object} p
   */
  add({ x, y, type, value, label, color, size = 14 }) {
    this.pickups.push({
      x, y, type, value,
      label: label ?? `+${value}`,
      color: color ?? "#FFD700",
      size,
      active: true,
      respawnTimer: 0,
      respawnDelay: 30,
      _t: 0
    });
  }

  /**
   * Update: collecte + respawn.
   */
  update({ dt, player, hud, audio }) {
    for (const p of this.pickups) {
      p._t += dt * 2.5;

      if (!p.active) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          p.active = true;
          p.respawnTimer = 0;
        }
        continue;
      }

      // Test collecte
      const dx = player.x - p.x;
      const dy = player.y - p.y;
      const d2 = dx * dx + dy * dy;

      if (d2 > this.collectRadius * this.collectRadius) continue;

      // Appliquer l'effet
      this._apply(p, player, hud, audio);

      // Désactiver + lancer le respawn
      p.active = false;
      p.respawnTimer = p.respawnDelay;
    }
  }

  /**
   * Applique l'effet du pickup au joueur.
   * @private
   */
  _apply(p, player, hud, audio) {
    switch (p.type) {
      case "money":
        player.money = (player.money ?? 0) + p.value;
        audio?.money?.();
        hud?.toast?.(`${p.label}`, 1.2);
        break;

      case "health":
        player.health = Math.min(100, (player.health ?? 100) + p.value);
        audio?.pickup?.();
        hud?.toast?.(p.label, 1.2);
        break;

      case "armor":
        player.armor = Math.min(100, (player.armor ?? 0) + p.value);
        hud?.toast?.(p.label, 1.2);
        break;

      case "weapon": {
        // Donne l'arme + des munitions
        const wep = p.value;
        // Si le joueur a déjà l'arme: ajoute des munitions
        const existing = player.weapons?.find?.(w => w.name === wep);
        if (existing) {
          const def = (typeof player._getWeaponDef === "function")
            ? player._getWeaponDef(wep)
            : { ammoMax: 30 };
          existing.ammo = Math.min(existing.ammo + Math.ceil(def.ammoMax / 2), def.ammoMax);
          hud?.toast?.(`${p.label} (munitions)`, 1.2);
        } else {
          player.addWeapon?.(wep);
          hud?.toast?.(p.label, 1.2);
        }
        break;
      }

      case "powerup":
        if (p.value === "speed") {
          player.speedBoost = (player.speedBoost ?? 0) + 8;
          hud?.toast?.(p.label, 1.2);
        }
        break;
    }
  }

  /**
   * Rendu greybox des pickups.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} camera
   */
  draw(ctx, camera) {
    for (const p of this.pickups) {
      if (!p.active) continue;

      const s = camera.worldToScreen(p.x, p.y);
      const pulse = 0.8 + Math.sin(p._t) * 0.2;
      const sz = (p.size * pulse) | 0;

      // Fond carré
      ctx.fillStyle = p.color + "88"; // semi-transparent
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.fillRect(s.x - sz / 2, s.y - sz / 2, sz, sz);
      ctx.strokeRect(s.x - sz / 2, s.y - sz / 2, sz, sz);

      // Symbole selon type
      ctx.fillStyle = p.color;
      ctx.font = `${Math.max(8, sz - 4)}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const sym = {
        money: "$",
        health: "+",
        armor: "A",
        weapon: "W",
        powerup: "!"
      }[p.type] ?? "?";
      ctx.fillText(sym, s.x, s.y);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }
}
