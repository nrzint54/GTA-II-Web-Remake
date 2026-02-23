import { Time } from "./Time.js";
import { Effects } from "./Effects.js";
import { resolveEntityCollisions } from "../physics/EntityCollisions.js";
import { WantedSystem } from "../gameplay/WantedSystem.js";

/**
 * Game (V2_0_0)
 *
 * Boucle principale complète:
 * - ScriptEngine (7 missions scriptées)
 * - AudioSystem (sons procéduraux)
 * - OverlaySystem (WASTED/BUSTED + minimap)
 * - Auto-fire corrigé (Uzi/Flamethrower)
 * - Gang peds AI
 * - Bombe voiture, huile, mines
 * - Téléphones → ScriptEngine
 */
export class Game {
  constructor({ input, renderer, hud }) {
    this.input = input;
    this.renderer = renderer;
    this.hud = hud;
    this.time = new Time();
    this.running = false;
    this.world = null;
    this.wantedSystem = new WantedSystem();
    this._prevWasDead = false;
    this._prevWasBusted = false;
  }

  setWorld(world) {
    this.world = world;
    if (!this.world.effects) this.world.effects = new Effects();
    this.renderer.camera.setTarget(world.player);
    world.player._audio = world._audio; // audio accessible depuis Player
    this.renderer.setMap?.(world.map);

    // Bind ScriptEngine
    if (world.scriptEngine) {
      world.scriptEngine.bind(world, this.hud);
      // Mémoriser le WantedSystem dans world pour que ScriptEngine y accède
      world._wantedSystem = this.wantedSystem; world.scriptEngine.ctx.wantedSystem = this.wantedSystem;
      // Démarrer la première mission automatiquement
      world.scriptEngine.start("first_contact");
    }
  }

  start() {
    if (!this.world) throw new Error("World not set");
    this.running = true;
    this.time.reset();
    requestAnimationFrame(this._tick);
  }

  stop() { this.running = false; }

  _tick = (t) => {
    if (!this.running) return;
    const dt = this.time.step(t);
    this.update(dt);
    this.render();
    requestAnimationFrame(this._tick);
  };

  update(dt) {
    const w = this.world;
    const { map, entities, player } = w;

    // Réponse téléphone (T)
    if (this.input.wasPressed("KeyT")) {
      const answered = w.phoneSystem?.tryAnswer?.(player.x, player.y, w.scriptEngine, this.hud, w.gangSystem);
      if (answered && w.scriptEngine?.ctx) {
        // Marquer le flag pour la mission "first_contact"
        const gang = w.gangSystem?.getGangAtPosition?.(player.x, player.y);
        if (gang?.id === "zaibatsu") w.scriptEngine.ctx.flags.phone_zaibatsu_answered = true;

        // Démarrer la bonne mission selon quel téléphone
        const phone = w.phoneSystem?.phones?.find?.(p => {
          const dx = player.x - p.x; const dy = player.y - p.y;
          return dx*dx+dy*dy < 40*40 && p.ringCooldown > 0;
        });
        if (phone !== undefined && !w.scriptEngine.active) {
          const missionsByPhone = [
            "el_pistolero",        // phoneIndex 0: Zaibatsu
            "rouleau_compresseur", // phoneIndex 1: Loonies
            "yakuza_rising",       // phoneIndex 2: Yakuza
            "hit_and_run",         // phoneIndex 3: Anonyme
            "the_big_score"        // phoneIndex 4: Mystère
          ];
          for (let pi = 0; pi < w.phoneSystem.phones.length; pi++) {
            const ph = w.phoneSystem.phones[pi];
            const phDx = player.x - ph.x; const phDy = player.y - ph.y;
            if (phDx*phDx+phDy*phDy < 40*40) {
              const mId = missionsByPhone[pi];
              if (mId) w.scriptEngine.start(mId);
              break;
            }
          }
        }
      }
    }

    // Mission switch manuel (M sans Shift)
    if (this.input.wasPressed("KeyM") && !this.input.isDown?.("ShiftLeft")) {
      // Fallback missions classiques si pas de script actif
      if (!w.scriptEngine?.active) {
        w.missions?.next?.();
      }
    }

    // Gangland mission (auto après el_pistolero)
    if (w.scriptEngine && !w.scriptEngine.active && w.scriptEngine.completed.has("el_pistolero") && !w.scriptEngine.completed.has("gangland")) {
      w.scriptEngine.start("gangland");
    }

    // Save (F5)
    if (this.input.wasPressed("F5")) this._trySave(1);

    // Load (F9)
    if (this.input.wasPressed("F9")) this._tryLoad(1);

    // ScriptEngine update
    w.scriptEngine?.update?.(dt);

    // Police
    const canvas = this.renderer?.canvas;
    w.police?.update?.({ dt, map, entities, player, hud: this.hud, camera: this.renderer?.camera, viewport: { w: canvas?.width??800, h: canvas?.height??600 } });

    // WantedSystem
    this.wantedSystem.update({ dt, player, entities });

    // GangSystem
    w.gangSystem?.update?.({ dt, player, entities, hud: this.hud });

    // GarageSystem
    w.garageSystem?.update?.({ dt, player, entities, hud: this.hud, hazardSystem: w.hazardSystem });

    // PhoneSystem
    w.phoneSystem?.update?.({ dt, player, missionSystem: w.scriptEngine, hud: this.hud });

    // PickupSystem
    w.pickupSystem?.update?.({ dt, player, hud: this.hud, audio: w._audio });

    // HazardSystem
    w.hazardSystem?.update?.({ dt, entities, effects: w.effects, player });

    // ProjectileSystem
    w.projectileSystem?.update?.({ dt, map, entities, effects: w.effects, hud: this.hud, player, audio: w._audio });

    // Bombe véhicule
    this._updateVehicleBombs(entities, w.effects, player, dt);

    // Huile glisse
    this._updateOilEffect(entities, dt);

    // OverlaySystem
    w._overlay?.update?.(dt);

    // WASTED/BUSTED overlays
    const isDead = player.dead || (player.health ?? 1) <= 0;
    const isBusted = player.bustedFlag;
    if (isDead && !this._prevWasDead) { w._overlay?.triggerWasted?.(); w._audio?.wasted?.(); }
    if (isBusted && !this._prevWasBusted) { w._overlay?.triggerBusted?.(); w._audio?.busted?.(); }
    this._prevWasDead = isDead;
    this._prevWasBusted = isBusted;

    // Audio moteur
    const sp = player.inVehicle ? Math.hypot(player.inVehicle.vx??0, player.inVehicle.vy??0) : 0;
    w._audio?.engineUpdate?.(sp, !!player.inVehicle);

    // Spatial
    w.spatial?.clear?.();
    if (w.spatial) for (const e of entities) w.spatial.insert(e);

    // Effects
    w.effects?.update?.(dt);

    // Entités
    for (const e of entities) {
      e.update({
        dt, input: this.input, map, entities, player, spatial: w.spatial,
        missions: w.scriptEngine,
        hud: this.hud, effects: w.effects, camera: this.renderer.camera,
        projectileSystem: w.projectileSystem,
        hazardSystem: w.hazardSystem,
        audio: w._audio
      });
    }

    // Collisions entités
    resolveEntityCollisions({ entities, spatial: w.spatial, dt });

    // HUD
    this.hud.set({
      health: player.inVehicle ? Math.floor(player.inVehicle.health??0) : Math.floor(player.health??0),
      armor: Math.floor(player.armor ?? 0),
      money: player.money,
      weapon: player.weaponName,
      wanted: wantedText(player.wanted),
      mission: w.scriptEngine?.currentName?.() ?? w.missions?.currentName?.() ?? "—",
      missionStatus: w.scriptEngine?.currentStatus?.() ?? w.missions?.currentStatus?.() ?? "—",
      gangRep: this._buildGangRepStr(w.gangSystem)
    });
    this.hud.update?.(dt);
    this.input.endFrame();
  }

  _updateVehicleBombs(entities, effects, player, dt) {
    for (const e of entities) {
      if (!e || !e.hasBomb || e.bombTimer === null || e.bombTimer === undefined) continue;
      e.bombTimer -= dt;
      if (e.bombTimer <= 0) {
        e.hasBomb = false;
        e.bombTimer = undefined;
        e.health = 0;
        effects?.addExplosion?.(e.x, e.y, 100);
        this.world?._audio?.explosion?.(100);
      }
    }
  }

  _updateOilEffect(entities, dt) {
    for (const e of entities) {
      if (!e || !["vehicle","copcar"].includes(e.kind)) continue;
      if ((e._oilTimer ?? 0) > 0) {
        e._oilTimer -= dt;
        e.vx *= Math.max(0, 1 - 0.5 * dt);
        e.vy *= Math.max(0, 1 - 0.5 * dt);
      }
    }
  }

  _buildGangRepStr(gangSystem) {
    if (!gangSystem) return "";
    return gangSystem.gangs.map(g => {
      const r = g.reputation;
      const icon = r >= 20 ? "✅" : r <= -20 ? "❌" : "⚪";
      return `${icon}${g.name.slice(0,3).toUpperCase()}:${r>=0?"+":""}${r}`;
    }).join(" ");
  }

  render() {
    const w = this.world;
    const { map, entities, player } = w;
    const missions = w.scriptEngine ?? w.missions;

    this.renderer.beginFrame();
    this.renderer.drawMap(map);
    w.gangSystem?.draw?.(this.renderer.ctx, this.renderer.camera);
    w.garageSystem?.draw?.(this.renderer.ctx, this.renderer.camera);
    w.phoneSystem?.draw?.(this.renderer.ctx, this.renderer.camera);
    w.pickupSystem?.draw?.(this.renderer.ctx, this.renderer.camera);
    w.hazardSystem?.draw?.(this.renderer.ctx, this.renderer.camera);
    for (const e of entities) this.renderer.drawEntity(e);
    w.projectileSystem?.draw?.(this.renderer.ctx, this.renderer.camera);
    this.renderer.drawEffects?.(w.effects);
    this.renderer.drawMissionOverlay(missions, player);

    // OverlaySystem (minimap + WASTED/BUSTED)
    w._overlay?.draw?.(
      this.renderer.ctx, this.renderer.canvas, player, map,
      this.renderer.camera, w.scriptEngine
    );

    this.renderer.endFrame();
  }

  _saveKey(slot) {
    return `gta2web_v2_save_slot${slot}`;
  }

  _saveLocal(slot, payload) {
    try {
      localStorage.setItem(this._saveKey(slot), JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  _loadLocal(slot) {
    try {
      const raw = localStorage.getItem(this._saveKey(slot));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async _trySave(slot = 1) {
    const data = this.serialize();
    const payload = { slot, when: Date.now(), data };

    // Toujours sauvegarder en local (backup), puis tenter PHP.
    const localOk = this._saveLocal(slot, payload);

    let serverOk = false;
    try {
      const res = await fetch("php/save_write.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, data })
      });
      serverOk = !!res.ok;
    } catch {
      serverOk = false;
    }

    if (serverOk) this.hud.toast?.("💾 Sauvegardé (serveur)", 1.4);
    else if (localOk) this.hud.toast?.("💾 Sauvegardé (local)", 1.4);
    else this.hud.toast?.("❌ Échec sauvegarde", 1.4);
  }

  async _tryLoad(slot = 1) {
    // 1) PHP
    let payload = null;
    try {
      const res = await fetch(`php/save_read.php?slot=slot${slot}`, { cache: "no-store" });
      if (res.ok) payload = await res.json();
    } catch {
      payload = null;
    }

    // 2) Local
    if (!payload) payload = this._loadLocal(slot);

    if (!payload) {
      this.hud.toast?.("📂 Aucune sauvegarde", 1.4);
      return;
    }

    const ok = this._applySave(payload.data ?? payload);
    this.hud.toast?.(ok ? "📂 Chargé" : "❌ Sauvegarde invalide", 1.4);
  }

  _applySave(save) {
    const w = this.world;
    if (!w || !save || !save.player) return false;

    const p = w.player;
    const sP = save.player;

    // Player (minimal, sans reconstruire tout le monde)
    if (Number.isFinite(sP.x)) p.x = sP.x;
    if (Number.isFinite(sP.y)) p.y = sP.y;
    if (Number.isFinite(sP.vx)) p.vx = sP.vx;
    if (Number.isFinite(sP.vy)) p.vy = sP.vy;
    if (Number.isFinite(sP.angle)) p.angle = sP.angle;

    if (Number.isFinite(sP.health)) p.health = sP.health;
    if (Number.isFinite(sP.armor)) p.armor = sP.armor;
    if (Number.isFinite(sP.money)) p.money = sP.money;
    if (Number.isFinite(sP.wanted)) p.wanted = sP.wanted;
    if (Number.isFinite(sP.mineAmmo)) p.mineAmmo = sP.mineAmmo;

    if (Array.isArray(sP.weapons) && sP.weapons.length) {
      p.weapons = sP.weapons.map(w2 => ({ name: String(w2?.name ?? "Pistol"), ammo: Number(w2?.ammo ?? 0) }));
      const idx = Math.max(0, Math.min(p.weapons.length - 1, (sP.currentWeaponIdx ?? 0) | 0));
      p.currentWeaponIdx = idx;
    }

    // Reset états transitoires
    p.dead = false; p.deadTimer = 0;
    p.bustedFlag = false; p.bustedTimer = 0;
    if (p.inVehicle) { try { p.inVehicle.driver = null; } catch {} }
    p.inVehicle = null;
    p.solid = true;

    // Gangs
    w.gangSystem?.deserialize?.(save.gangRep);

    // Missions scriptées
    if (w.scriptEngine) {
      const done = Array.isArray(save.completedMissions) ? save.completedMissions : [];
      w.scriptEngine.completed = new Set(done);
      if (w.scriptEngine.ctx?.flags && save.flags && typeof save.flags === "object") {
        w.scriptEngine.ctx.flags = { ...w.scriptEngine.ctx.flags, ...save.flags };
      }
    }

    // Recenter caméra
    this.renderer?.camera?.setTarget?.(p);
    return true;
  }

  serialize() {
    const { map, entities, player } = this.world;
    return {
      version: 3, when: Date.now(), mapId: map.id??"unknown",
      player: player.serialize(),
      entities: entities.filter(e=>e!==player).map(e=>e.serialize?.()),
      completedMissions: [...(this.world.scriptEngine?.completed??[])],
      gangRep: this.world.gangSystem?.serialize?.(),
      flags: this.world.scriptEngine?.ctx?.flags ?? {}
    };
  }
}

function wantedText(w) {
  const n = Math.max(0, Math.floor(w ?? 0));
  if (n === 0) return "—";
  const blink = (Math.floor(performance.now()/250)%2)===0;
  return "★".repeat(n) + (blink ? " " : "");
}
