import { Entity } from "./Entity.js";
import { moveWithTileCollisions } from "../physics/Physics.js";
import { fireHitscan } from "../gameplay/Weapons.js";
import { getWeaponDef, WEAPON_ORDER } from "../gameplay/WeaponSystem.js";

/**
 * Player (V1_2_0)
 * - Système multi-armes (Pistol, Uzi, Shotgun, Flamethrower, Grenade, Rocket)
 * - Armure absorbant les dégâts
 * - Dépôt de mines (Shift+M) / huile via véhicule (Shift+O)
 * - Activation bombe voiture (B)
 * - Mitrailleuse véhicule (clic si installée)
 * - Cycle armes: Q = suivante, 1-6 = directe
 * - Speed boost via powerup
 */
export class Player extends Entity {
  constructor({ x, y }) {
    super({ x, y, w: 18, h: 18 });
    this.kind = "player";
    this.color = "#6bdcff";

    this.health = 100;
    this.armor = 0;
    this.money = 0;
    this.wanted = 0;

    this.dead = false;
    this.deadTimer = 0;
    this.bustedFlag = false;
    this.bustedTimer = 0;

    this.inVehicle = null;

    this.accel = 1800;
    this.maxSpeed = 420;
    this.friction = 10;
    this.turnSpeed = 5.2;
    this.invMass = 0.9;
    this.solid = true;
    this.enterRadius = 30;

    // Système d'armes
    this.weapons = [{ name: "Pistol", ammo: 99 }];
    this.currentWeaponIdx = 0;
    this.fireCooldown = 0;

    // Ammo spéciale (garages)
    this.mineAmmo = 0;

    // PowerUps temporaires
    this.speedBoost = 0;
  }

  get currentWeapon() {
    return this.weapons[this.currentWeaponIdx] ?? this.weapons[0];
  }

  get weaponName() {
    const w = this.currentWeapon;
    const def = getWeaponDef(w?.name ?? "Pistol");
    return `${def.label} (${w?.ammo ?? 0})`;
  }

  addWeapon(name) {
    const def = getWeaponDef(name);
    const existing = this.weapons.find(w => w.name === name);
    if (existing) {
      existing.ammo = Math.min(existing.ammo + Math.ceil(def.ammoMax / 2), def.ammoMax);
    } else {
      this.weapons.push({ name, ammo: def.ammoMax });
      this.currentWeaponIdx = this.weapons.length - 1;
    }
  }

  _getWeaponDef(name) { return getWeaponDef(name); }

  busted() {
    if (this.bustedFlag || this.dead) return;
    this.bustedFlag = true;
    this.bustedTimer = 2.0;
    this.vx = 0; this.vy = 0;
    if (this.inVehicle) { this.inVehicle.driver = null; this.inVehicle = null; this.solid = true; }
  }

  takeDamage(amount) {
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.5);
      this.armor = Math.max(0, this.armor - absorbed);
      amount -= absorbed;
    }
    this.health = Math.max(0, (this.health ?? 100) - amount);
  }

  update({ dt, input, map, entities, hud, effects, camera, projectileSystem, hazardSystem, audio }) {
    if (!Number.isFinite(dt) || dt <= 0) dt = 0.016;
    entities = entities ?? [];
    const _hud = hud ?? { toast: () => {} };

    if (this.speedBoost > 0) {
      this.speedBoost -= dt;
      this.maxSpeed = this.speedBoost > 0 ? 640 : 420;
    }

    // DEAD
    if ((this.health ?? 0) <= 0) {
      if (!this.dead) {
        this.dead = true;
        if (this.inVehicle) { this.inVehicle.driver = null; this.inVehicle = null; this.solid = true; }
        this.deadTimer = 2.0;
        this.vx = 0; this.vy = 0;
        _hud.toast?.("💀 WASTED", 1.6);
      }
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.respawn(map, { reason: "death" });
      return;
    }

    // BUSTED
    if (this.bustedFlag) {
      this.bustedTimer -= dt;
      _hud.toast?.("🚔 BUSTED", 0.35);
      this.vx = 0; this.vy = 0;
      if (this.bustedTimer <= 0) {
        this.bustedFlag = false;
        this.wanted = 0;
        this.respawn(map, { reason: "busted" });
      }
      return;
    }

    // IN VEHICLE
    if (this.inVehicle) {
      this.x = this.inVehicle.x;
      this.y = this.inVehicle.y;
      this.angle = this.inVehicle.angle;

      if (input.wasPressed("Enter")) { this.exitVehicle(map); return; }

      if (input.wasPressed("KeyH") && this.inVehicle?.kind === "copcar") {
        this.inVehicle.sirenOn = !this.inVehicle.sirenOn;
      }

      // Huile derrière (Shift+O)
      if (input.wasPressed("KeyO") && input.isDown?.("ShiftLeft") && hazardSystem) {
        const veh = this.inVehicle;
        if ((veh.oilAmmo ?? 0) > 0) {
          veh.oilAmmo--;
          const bx = veh.x - Math.cos(veh.angle) * 30;
          const by = veh.y - Math.sin(veh.angle) * 30;
          hazardSystem.dropOil(bx, by, this);
          _hud.toast?.(`🛢️ Huile! (${veh.oilAmmo} restantes)`, 1.0);
        } else {
          _hud.toast?.("❌ Plus d'huile! (Garage Hell Oil)", 1.2);
        }
      }

      // Bombe voiture (B)
      if (input.wasPressed("KeyB")) {
        const veh = this.inVehicle;
        if (veh.hasBomb && !veh.bombTimer) {
          veh.bombTimer = 10;
          _hud.toast?.("💣 BOMBE ACTIVÉE! (10s)", 2.0);
        }
      }

      // Mitrailleuse véhicule (clic gauche)
      const mouseHeld = input.isMouseDown?.(0);
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      if (mouseHeld && this.fireCooldown === 0 && this.inVehicle?.hasVehicleGun) {
        if ((this.inVehicle.vehicleGunAmmo ?? 0) > 0) {
          this.inVehicle.vehicleGunAmmo--;
          this.fireCooldown = 0.08;
          const cam = camera;
          const mx = (cam?.x ?? 0) + (input.mouse?.x ?? 0);
          const my = (cam?.y ?? 0) + (input.mouse?.y ?? 0);
          const ox = this.inVehicle.x; const oy = this.inVehicle.y;
          const aimDx = mx - ox; const aimDy = my - oy;
          const len = Math.hypot(aimDx, aimDy) || 1;
          const hit = fireHitscan({
            originX: ox, originY: oy, dirX: aimDx/len, dirY: aimDy/len,
            range: 350, shooter: this, entities,
            filter: e => e && ["ped","copped","vehicle","copcar"].includes(e.kind) && !e.dead && (e.health??1)>0
          });
          const endX = hit ? hit.hitX : ox + (aimDx/len)*350;
          const endY = hit ? hit.hitY : oy + (aimDy/len)*350;
          effects?.addShot?.(ox, oy, endX, endY);
          if (hit?.entity) { hit.entity.health = Math.max(0,(hit.entity.health??60)-15); this.wanted=Math.min(5,(this.wanted??0)+0.5); }
        }
      }

      // Drive-by (arme normale, clic)
      else if (mouseHeld && this.fireCooldown === 0) {
        this.fireCooldown = 1/6;
        const cam = camera;
        const mx=(cam?.x??0)+(input.mouse?.x??0); const my=(cam?.y??0)+(input.mouse?.y??0);
        const ox=this.inVehicle.x; const oy=this.inVehicle.y;
        const aimDx=mx-ox; const aimDy=my-oy; const len=Math.hypot(aimDx,aimDy)||1;
        const hit=fireHitscan({originX:ox,originY:oy,dirX:aimDx/len,dirY:aimDy/len,range:260,shooter:this,entities,filter:e=>e&&["ped","copped","vehicle","copcar"].includes(e.kind)&&!e.dead&&(e.health??1)>0});
        effects?.addShot?.(ox,oy,hit?hit.hitX:ox+(aimDx/len)*260,hit?hit.hitY:oy+(aimDy/len)*260);
        if(hit?.entity){ hit.entity.health=Math.max(0,(hit.entity.health??60)-18); this.wanted=Math.min(5,(this.wanted??0)+1); if(hit.entity.kind==="ped"||hit.entity.kind==="copped"){this._panicZone(entities,ox,oy,180,1.4);} }
      }

      return;
    }

    // ENTER VEHICLE
    if (input.wasPressed("Enter")) {
      const v = this.findNearestFreeVehicle(entities, this.enterRadius);
      if (v) { this.enterVehicle(v); return; }
    }

    // CYCLE ARMES Q
    if (input.wasPressed("KeyF")) {
      this.currentWeaponIdx = (this.currentWeaponIdx + 1) % this.weapons.length;
      _hud.toast?.(`🔫 ${getWeaponDef(this.currentWeapon.name).label}`, 0.8);
    }

    // Sélection 1-6
    for (let i = 1; i <= 6; i++) {
      if (input.wasPressed(`Digit${i}`)) {
        const wName = WEAPON_ORDER[i-1];
        const idx = this.weapons.findIndex(w => w.name === wName);
        if (idx !== -1) { this.currentWeaponIdx = idx; _hud.toast?.(`🔫 ${getWeaponDef(wName).label}`, 0.6); }
      }
    }

    // MINES (Shift+M)
    if (input.wasPressed("KeyM") && input.isDown?.("ShiftLeft") && hazardSystem) {
      if (this.mineAmmo > 0) {
        this.mineAmmo--;
        hazardSystem.dropMine(this.x, this.y, this);
        _hud.toast?.(`💣 Mine! (${this.mineAmmo} restantes)`, 1.0);
      } else {
        _hud.toast?.("❌ Plus de mines! (Garage Gold Mines)", 1.2);
      }
    }

    // TIR
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    const mouseHeld = input.isMouseDown?.(0);
    if (this.fireCooldown === 0 && mouseHeld) {
      this._fire({ entities, effects, projectileSystem, audio });
    }

    // DÉPLACEMENT (Tank controls)
    const steer = input.axisX();
    const throttle = -input.axisY();
    if (steer !== 0) this.angle += steer * this.turnSpeed * dt;
    const fx=Math.cos(this.angle??0); const fy=Math.sin(this.angle??0);
    this.vx += fx*throttle*this.accel*dt;
    this.vy += fy*throttle*this.accel*dt;
    const sp=Math.hypot(this.vx,this.vy);
    if(sp>this.maxSpeed){const s=this.maxSpeed/sp;this.vx*=s;this.vy*=s;}
    const fr=Math.max(0,1-this.friction*dt);
    this.vx*=fr; this.vy*=fr;
    moveWithTileCollisions(this,map,this.vx*dt,this.vy*dt);
  }

  _fire({ entities, effects, projectileSystem, audio }) {
    const wep = this.currentWeapon;
    if (!wep) return;
    const def = getWeaponDef(wep.name);
    if (def.name !== "Pistol" && wep.ammo <= 0) return;
    this.fireCooldown = 1 / def.fireRate; audio?.gunshot?.(def.name?.toLowerCase?.());
    if (def.name !== "Pistol") wep.ammo = Math.max(0, wep.ammo - 1);

    const ox = this.x; const oy = this.y;

    if (def.type === "hitscan") {
      for (let r = 0; r < def.rays; r++) {
        const spread = (Math.random()-0.5)*def.spread;
        const ang = (this.angle??0)+spread;
        const dx=Math.cos(ang); const dy=Math.sin(ang);
        const hit=fireHitscan({originX:ox,originY:oy,dirX:dx,dirY:dy,range:def.range,shooter:this,entities,filter:e=>e&&["ped","copped","vehicle","copcar"].includes(e.kind)&&!e.dead&&(e.health??1)>0});
        const endX=hit?hit.hitX:ox+dx*def.range; const endY=hit?hit.hitY:oy+dy*def.range;
        effects?.addShot?.(ox,oy,endX,endY);
        if(hit?.entity){
          const t=hit.entity;
          t.health=Math.max(0,(t.health??(t.kind==="vehicle"||t.kind==="copcar"?120:40))-def.damage);
          this.wanted=Math.min(5,(this.wanted??0)+(def.rays>1?0.4:1));
          if(t.kind==="ped"||t.kind==="copped"){this._panicZone(entities,ox,oy,180,1.4);t.panicFrom?.(ox,oy,2.3);}
          if((t.health??0)<=0&&!t.dead){"dead"in t&&(t.dead=true);if(t.kind==="ped")this.money=(this.money??0)+20;}
        } else {this._panicZone(entities,ox,oy,140,0.7);}
      }
    } else if (def.type === "flame") {
      for(let r=0;r<def.rays;r++){
        const spread=(Math.random()-0.5)*def.spread;
        const ang=(this.angle??0)+spread;
        const dx=Math.cos(ang); const dy=Math.sin(ang);
        const dist=30+Math.random()*def.range;
        effects?.addSmoke?.(ox+dx*dist,oy+dy*dist,12);
        for(const e of entities){
          if(!e||e.dead||(e.health??1)<=0)continue;
          if(!["ped","copped","vehicle","copcar"].includes(e.kind))continue;
          const ex=e.x-ox; const ey=e.y-oy; const ed=Math.hypot(ex,ey);
          if(ed>def.range||ed<1)continue;
          const dot=(ex/ed)*dx+(ey/ed)*dy;
          if(dot<Math.cos(def.spread))continue;
          e.health=Math.max(0,(e.health??40)-def.damage*0.5);
          if((e.health??0)<=0&&"dead"in e)e.dead=true;
        }
      }
      this.wanted=Math.min(5,(this.wanted??0)+0.2);
    } else if (def.type === "projectile" && projectileSystem) {
      const ang=this.angle??0;
      projectileSystem.spawn({
        type:def.name==="Grenade"?"grenade":"rocket",
        x:ox+Math.cos(ang)*15, y:oy+Math.sin(ang)*15,
        dirX:Math.cos(ang), dirY:Math.sin(ang),
        speed:def.projectileSpeed,
        damage:def.damage, fuseTime:def.fuseTime, radius:def.explosionRadius,
        shooter:this
      });
    }
  }

  _panicZone(entities,ox,oy,radius=180,seconds=1.4){
    const r2=radius*radius;
    for(const e of entities){if(!e||e.kind!=="ped")continue;const dx=e.x-ox;const dy=e.y-oy;if((dx*dx+dy*dy)<=r2)e.panicFrom?.(ox,oy,seconds);}
  }

  findNearestFreeVehicle(entities,radius){
    let best=null; let bestD2=radius*radius;
    for(const e of entities){
      if(!e||(e.kind!=="vehicle"&&e.kind!=="copcar"))continue;
      if(e.driver||e.dead||(e.health??1)<=0)continue;
      if(Math.hypot(e.vx??0,e.vy??0)>40)continue;
      const dx=e.x-this.x;const dy=e.y-this.y;const d2=dx*dx+dy*dy;
      if(d2<=bestD2){bestD2=d2;best=e;}
    }
    return best;
  }

  enterVehicle(vehicle){this.inVehicle=vehicle;vehicle.driver=this;this.solid=false;this.x=vehicle.x;this.y=vehicle.y;this.vx=0;this.vy=0;}

  exitVehicle(map){
    const v=this.inVehicle; if(!v)return;
    const side=26;
    const px=v.x+Math.cos((v.angle??0)-Math.PI/2)*side;
    const py=v.y+Math.sin((v.angle??0)-Math.PI/2)*side;
    v.driver=null; this.inVehicle=null;
    this.x=px; this.y=py; this.vx=0; this.vy=0; this.solid=true;
    if(map.aabbHitsSolid?.(this.hitbox())){this.x=v.x+Math.cos((v.angle??0)+Math.PI/2)*side;this.y=v.y+Math.sin((v.angle??0)+Math.PI/2)*side;}
  }

  /**
   * Respawn player.
   * - death  => hôpital (si défini), sinon spawn joueur.
   * - busted => commissariat (si défini), sinon spawn joueur.
   *
   * Les maps peuvent définir, dans JSON:
   *   spawns: {
   *     player: {x,y},
   *     hospital: {x,y} | hospitals:[{x,y}...],
   *     police: {x,y} | policeStations:[{x,y}...]
   *   }
   */
  respawn(map, { reason = "death" } = {}) {
    this.dead=false;this.deadTimer=0;this.bustedFlag=false;this.bustedTimer=0;
    this.health=100;this.armor=0;this.wanted=0;
    this.inVehicle=null;this.solid=true;this.fireCooldown=0;
    this.vx=0;this.vy=0;

    const spawns = map?.meta?.spawns;
    const pick = (v) => {
      if (!v) return null;
      if (Array.isArray(v)) return v.length ? v[(Math.random() * v.length) | 0] : null;
      return v;
    };

    // --- Choix du point cible ---
    // death => hospital -> hospitals[] -> player
    // busted => police -> policeStations[] -> player
    let target = null;
    if (reason === "busted") {
      target = pick(spawns?.police) ?? pick(spawns?.policeStations) ?? pick(spawns?.player);
    } else {
      target = pick(spawns?.hospital) ?? pick(spawns?.hospitals) ?? pick(spawns?.player);
    }

    const fallback = pick(spawns?.player) ?? { x: 80, y: 80 };
    const tx = Number.isFinite(target?.x) ? target.x : fallback.x;
    const ty = Number.isFinite(target?.y) ? target.y : fallback.y;

    // --- Trouver une tuile respawn safe (idéalement trottoir) ---
    const spot = this._findSafeRespawnSpot(map, tx, ty, { preferSidewalk: true });
    this.x = spot.x;
    this.y = spot.y;
  }

  _findSafeRespawnSpot(map, desiredX, desiredY, { preferSidewalk = true } = {}) {
    // Sans map => on renvoie la cible brute
    if (!map) return { x: desiredX, y: desiredY };

    const ts = map.tileSize ?? 64;
    const startTx = Math.floor(desiredX / ts);
    const startTy = Math.floor(desiredY / ts);

    // Ordre de préférence: trottoir (3) puis sol (0) puis route (2)
    const preferred = preferSidewalk ? [3, 0, 2] : [0, 3, 2];

    // 1) Passes: d'abord sur tiles préférées, ensuite sur toute tile non-solide (hors eau)
    const passes = [
      { allowAny: false },
      { allowAny: true }
    ];

    const maxR = 14; // ~ 28 tuiles de diamètre => largement suffisant
    for (const pass of passes) {
      for (let r = 0; r <= maxR; r++) {
        // scan en anneau (périmètre) pour un résultat stable
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

            const tx = startTx + dx;
            const ty = startTy + dy;
            const t = map.tileAt(tx, ty);
            if (t === 4) continue; // eau
            if (map.isSolidTile?.(t)) continue;
            if (!pass.allowAny && !preferred.includes(t)) continue;

            const cx = (tx + 0.5) * ts;
            const cy = (ty + 0.5) * ts;

            // Vérifie AABB (plus strict que juste tuile non-solide)
            const prevX = this.x, prevY = this.y;
            this.x = cx; this.y = cy;
            const ok = !map.aabbHitsSolid?.(this.hitbox());
            this.x = prevX; this.y = prevY;
            if (ok) return { x: cx, y: cy };
          }
        }
      }
    }

    // Fallback ultime
    return { x: desiredX, y: desiredY };
  }

  serialize(){
    return{...super.serialize(),health:this.health,armor:this.armor,money:this.money,wanted:this.wanted,weapons:this.weapons,currentWeaponIdx:this.currentWeaponIdx,mineAmmo:this.mineAmmo};
  }
}
