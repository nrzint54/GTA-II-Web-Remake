/**
 * ScriptEngine (V2_0_0)
 *
 * Moteur de scripts de missions inspiré du GTA2 Script Engine.
 * Chaque mission est un objet JSON décrivant:
 * - Des déclencheurs (triggers): OnEnterZone, OnPhoneActivated, OnTimer, etc.
 * - Des conditions: PlayerInVehicle, GangRespect, WantedLevel, TargetDead, etc.
 * - Des actions: SpawnPed, SpawnVehicle, GiveWeapon, AddMoney, SetObjective, etc.
 *
 * Architecture:
 *   ScriptEngine
 *     └── MissionScript[]   (un script = une mission)
 *           ├── triggers[]  (déclencheurs)
 *           ├── steps[]     (étapes séquentielles)
 *           └── state       (état courant)
 *
 * Une mission progresse d'une étape à la suivante quand toutes les
 * conditions de l'étape courante sont remplies.
 */

export class ScriptEngine {
  constructor() {
    /** @type {MissionScript[]} */
    this.scripts = [];

    /** @type {string[]} IDs des missions complétées */
    this.completed = new Set();

    /** @type {string|null} Mission courante en cours */
    this.active = null;

    /** @type {object|null} État partagé entre étapes */
    this.ctx = null;

    // Entités spawned par les scripts (pour nettoyer si mission échoue)
    this._spawnedEntities = [];

    this._hud = null;
    this._world = null;
  }

  /**
   * Lie le moteur au monde du jeu.
   * @param {object} world
   * @param {object} hud
   */
  bind(world, hud) {
    this._world = world;
    this._hud = hud;
    this.ctx = {
      player: world.player,
      entities: world.entities,
      map: world.map,
      gangSystem: world.gangSystem,
      pickupSystem: world.pickupSystem,
      hazardSystem: world.hazardSystem,
      garageSystem: world.garageSystem,
      phoneSystem: world.phoneSystem,
      wantedSystem: world._wantedSystem,
      hud,
      targets: {},   // entités nommées (ex: ctx.targets["boss"])
      timers: {},    // timers nommés
      flags: {}      // drapeaux booléens
    };
  }

  /**
   * Charge un script de mission.
   * @param {MissionDef} def
   */
  load(def) {
    this.scripts.push({
      ...def,
      _stepIdx: 0,
      _state: "idle",   // idle | running | completed | failed
      _timers: {},
      _spawnedEntityIds: []
    });
  }

  /**
   * Démarre une mission par son ID.
   * @param {string} id
   * @returns {boolean}
   */
  start(id) {
    if (this.active) return false; // une seule mission à la fois
    const script = this.scripts.find(s => s.id === id);
    if (!script || this.completed.has(id)) return false;
    script._stepIdx = 0;
    script._state = "running";
    script._timers = {};
    this.active = id;

    // Actions OnStart
    if (script.onStart) {
      this._runActions(script.onStart, script);
    }

    this._hud?.toast?.(`🎯 Mission: ${script.name}`, 2.5);
    if (script.briefing) {
      setTimeout(() => this._hud?.toast?.(script.briefing, 3.5), 2800);
    }
    return true;
  }

  /**
   * Update du moteur de scripts (appelé chaque frame).
   * @param {number} dt
   */
  update(dt) {
    if (!this.ctx || !this._world) return;

    // Met à jour les timers globaux
    for (const key of Object.keys(this.ctx.timers)) {
      this.ctx.timers[key] = Math.max(0, this.ctx.timers[key] - dt);
    }

    // Mission active
    if (this.active) {
      const script = this.scripts.find(s => s.id === this.active);
      if (!script || script._state !== "running") return;

      // Timers du script
      for (const key of Object.keys(script._timers)) {
        script._timers[key] = Math.max(0, script._timers[key] - dt);
      }

      // Vérification d'échec (si conditions d'échec remplies)
      if (script.failIf && this._checkConditions(script.failIf, script)) {
        this._fail(script);
        return;
      }

      // Étape courante
      const step = script.steps?.[script._stepIdx];
      if (!step) {
        this._complete(script);
        return;
      }

      // Afficher l'objectif de cette étape
      if (step._justActivated !== false) {
        step._justActivated = false;
        if (step.objective) this._hud?.toast?.(`📌 ${step.objective}`, 2.5);
      }

      // Vérifier les conditions de l'étape
      if (this._checkConditions(step.conditions ?? [], script)) {
        // Actions de complétion de l'étape
        if (step.onComplete) this._runActions(step.onComplete, script);

        script._stepIdx++;
        const nextStep = script.steps?.[script._stepIdx];
        if (nextStep) {
          nextStep._justActivated = undefined; // reset pour afficher objectif
          if (nextStep.objective) {
            this._hud?.toast?.(`📌 ${nextStep.objective}`, 2.5);
          }
        } else {
          this._complete(script);
        }
      }
    }

    // Vérifier les déclencheurs auto (missions non actives)
    if (!this.active) {
      for (const script of this.scripts) {
        if (script._state !== "idle") continue;
        if (this.completed.has(script.id)) continue;
        if (script.autoTrigger && this._checkConditions(script.autoTrigger, script)) {
          this.start(script.id);
          break;
        }
      }
    }
  }

  /**
   * Vérifie un tableau de conditions (toutes doivent être vraies = AND).
   * @param {Condition[]} conditions
   * @param {MissionScript} script
   * @returns {boolean}
   */
  _checkConditions(conditions, script) {
    if (!conditions || conditions.length === 0) return true;
    const ctx = this.ctx;
    const player = ctx.player;

    for (const cond of conditions) {
      switch (cond.type) {
        case "EnterZone": {
          const z = cond.zone;
          const target = cond.who === "player" ? player :
            (ctx.targets[cond.who] ?? null);
          if (!target) return false;
          const dx = target.x - z.x; const dy = target.y - z.y;
          if (dx*dx + dy*dy > z.radius*z.radius) return false;
          break;
        }
        case "PlayerInVehicle":
          if (!player.inVehicle) return false;
          if (cond.model && player.inVehicle.model !== cond.model) return false;
          break;
        case "PlayerOnFoot":
          if (player.inVehicle) return false;
          break;
        case "PlayerHasWeapon": {
          const has = player.weapons?.some(w => w.name === cond.weapon);
          if (!has) return false;
          break;
        }
        case "GangRespect": {
          const rep = ctx.gangSystem?.getReputation?.(cond.gang) ?? 0;
          if (cond.op === ">=" && rep < cond.value) return false;
          if (cond.op === "<" && rep >= cond.value) return false;
          if (cond.op === "<=" && rep > cond.value) return false;
          if (cond.op === ">" && rep <= cond.value) return false;
          break;
        }
        case "WantedLevel": {
          const w = Math.floor(player.wanted ?? 0);
          if (cond.op === "<" && w >= cond.value) return false;
          if (cond.op === "<=" && w > cond.value) return false;
          if (cond.op === ">" && w <= cond.value) return false;
          if (cond.op === ">=" && w < cond.value) return false;
          if (cond.op === "==" && w !== cond.value) return false;
          break;
        }
        case "TargetDead": {
          const t = ctx.targets[cond.target];
          if (!t || !t.dead) return false;
          break;
        }
        case "TargetAlive": {
          const t = ctx.targets[cond.target];
          if (!t || t.dead || (t.health ?? 1) <= 0) return false;
          break;
        }
        case "HasMoney":
          if ((player.money ?? 0) < cond.amount) return false;
          break;
        case "TimerExpired": {
          const timer = script._timers[cond.timer] ?? 0;
          if (timer > 0) return false;
          break;
        }
        case "TimerRunning": {
          const timer = script._timers[cond.timer] ?? 0;
          if (timer <= 0) return false;
          break;
        }
        case "Flag":
          if (!!ctx.flags[cond.flag] !== !!cond.value) return false;
          break;
        case "VehicleDelivered": {
          const t = ctx.targets[cond.target];
          if (!t) return false;
          const z = cond.zone;
          const dx = t.x - z.x; const dy = t.y - z.y;
          if (dx*dx + dy*dy > z.radius*z.radius) return false;
          break;
        }
        default:
          console.warn(`[ScriptEngine] Condition inconnue: ${cond.type}`);
      }
    }
    return true;
  }

  /**
   * Exécute un tableau d'actions.
   * @param {Action[]} actions
   * @param {MissionScript} script
   */
  _runActions(actions, script) {
    if (!actions) return;
    const ctx = this.ctx;
    const player = ctx.player;
    const world = this._world;

    for (const action of actions) {
      switch (action.type) {
        case "SpawnPed": {
          const { Ped } = this._classes;
          if (!Ped) break;
          const ped = new Ped({ x: action.x, y: action.y });
          if (action.name) ctx.targets[action.name] = ped;
          if (action.gangId) ped.gangId = action.gangId;
          if (action.health) ped.health = action.health;
          world.entities.push(ped);
          script._spawnedEntityIds.push(ped.id);
          this._spawnedEntities.push(ped);
          break;
        }
        case "SpawnVehicle": {
          const { Vehicle, pickRandomVehicleId, isFixedLiveryVehicleId, pickRandomPaintId } = this._classes;
          if (!Vehicle) break;
          const model = action.model ?? pickRandomVehicleId({ group: "civil" });
          const paintId = action.color ?? (isFixedLiveryVehicleId(model) ? null : pickRandomPaintId());
          const veh = new Vehicle({ x: action.x, y: action.y, model, paintId });
          if (action.color) { veh._greyboxColor = action.color; veh.color = action.color; }
          if (action.name) ctx.targets[action.name] = veh;
          world.entities.push(veh);
          script._spawnedEntityIds.push(veh.id);
          this._spawnedEntities.push(veh);
          break;
        }
        case "GiveWeapon":
          player.addWeapon?.(action.weapon);
          if (action.ammo) {
            const w = player.weapons?.find?.(w => w.name === action.weapon);
            if (w) w.ammo = action.ammo;
          }
          break;
        case "AddMoney":
          player.money = (player.money ?? 0) + action.amount;
          ctx.hud?.toast?.(`💰 +$${action.amount}`, 1.5);
          world._audio?.money?.();
          break;
        case "AddRespect":
          ctx.gangSystem?.addRespect?.(action.gang, action.amount);
          ctx.hud?.toast?.(`${action.amount >= 0 ? "✅" : "❌"} ${action.gang}: ${action.amount >= 0 ? "+" : ""}${action.amount} REP`, 1.5);
          break;
        case "SetObjective":
          ctx.hud?.toast?.(`📌 ${action.text}`, 2.5);
          break;
        case "StartTimer":
          script._timers[action.name] = action.duration;
          break;
        case "SetFlag":
          ctx.flags[action.flag] = action.value;
          break;
        case "SetWanted":
          player.wanted = Math.max(0, Math.min(5, action.level));
          break;
        case "ClearWanted":
          player.wanted = 0;
          break;
        case "Toast":
          ctx.hud?.toast?.(action.text, action.duration ?? 2.0);
          break;
        case "Teleport":
          if (action.target === "player") {
            player.x = action.x; player.y = action.y;
            player.vx = 0; player.vy = 0;
          } else {
            const t = ctx.targets[action.target];
            if (t) { t.x = action.x; t.y = action.y; t.vx = 0; t.vy = 0; }
          }
          break;
        case "PlaySound":
          world._audio?.[action.sound]?.();
          break;
        case "SpawnPickup":
          ctx.pickupSystem?.add?.({
            x: action.x, y: action.y,
            type: action.pickupType ?? "money",
            value: action.value ?? 100,
            label: action.label ?? "+?",
            color: action.color ?? "#FFD700"
          });
          break;
        default:
          console.warn(`[ScriptEngine] Action inconnue: ${action.type}`);
      }
    }
  }

  _complete(script) {
    script._state = "completed";
    this.completed.add(script.id);
    this.active = null;

    if (script.onComplete) this._runActions(script.onComplete, script);

    this._hud?.toast?.(`✅ Mission réussie: ${script.name}!`, 3.0);
    this._world?._audio?.money?.();
    console.info(`[ScriptEngine] Mission complétée: ${script.id}`);
  }

  _fail(script) {
    script._state = "failed";
    this.active = null;

    if (script.onFail) this._runActions(script.onFail, script);
    this._hud?.toast?.(`❌ Mission échouée: ${script.name}`, 2.5);

    // Reset pour réessayer
    setTimeout(() => {
      script._state = "idle";
      script._stepIdx = 0;
    }, 5000);
    console.info(`[ScriptEngine] Mission échouée: ${script.id}`);
  }

  /** Nom de la mission active */
  currentName() {
    if (!this.active) return "—";
    return this.scripts.find(s => s.id === this.active)?.name ?? "—";
  }

  /** Statut de la mission active */
  currentStatus() {
    if (!this.active) return "—";
    const script = this.scripts.find(s => s.id === this.active);
    if (!script) return "—";
    const step = script.steps?.[script._stepIdx];
    return step?.objective ?? `Étape ${script._stepIdx + 1}/${script.steps?.length ?? 1}`;
  }

  /** Objectif courant (position, pour la flèche du renderer) */
  currentTarget() {
    if (!this.active) return null;
    const script = this.scripts.find(s => s.id === this.active);
    if (!script) return null;
    const step = script.steps?.[script._stepIdx];
    const cond = step?.conditions?.find(c => c.zone);
    if (cond?.zone) return { x: cond.zone.x, y: cond.zone.y };
    return null;
  }

  /** Injecte les classes nécessaires pour SpawnPed/SpawnVehicle */
  registerClasses(classes) {
    this._classes = classes;
  }
}
