/**
 * MissionScripts (V2_0_0)
 *
 * 7 missions complètes pour le ScriptEngine, inspirées de GTA2:
 *
 * 1. "First Contact"     (auto-déclenchée)     : GoTo + collecte d'argent
 * 2. "El Pistolero"      (téléphone Zaibatsu)  : Éliminer une cible + fuir
 * 3. "Rouleau compresseur" (téléphone Loonies) : Voler et livrer un véhicule
 * 4. "Yakuza Rising"     (téléphone Yakuza)    : Gagner la réputation Yakuza
 * 5. "Hit & Run"         (wanted 2+)            : Semée de la police
 * 6. "Gangland"          (auto district Zaibatsu): Défendre une zone
 * 7. "The Big Score"     (toutes complétées)   : Mission finale argent
 *
 * Format de chaque mission:
 * {
 *   id: string,
 *   name: string,
 *   briefing: string,
 *   phoneIndex?: number,     // 0-4 pour téléphone associé
 *   autoTrigger?: Condition[], // déclenchement auto
 *   onStart?: Action[],
 *   steps: [{ objective, conditions, onComplete }],
 *   failIf?: Condition[],
 *   onComplete: Action[],
 *   onFail?: Action[]
 * }
 *
 * Note: les positions x/y sont en fraction 0..1 du monde (résolues au bind()).
 * La fonction resolveMissionPositions() les convertit en pixels.
 */

/**
 * Génère les définitions de missions avec positions résolues par rapport à la map.
 * @param {object} map
 * @returns {MissionDef[]}
 */
export function buildMissionScripts(map) {
  const W = map.width * map.tileSize;
  const H = map.height * map.tileSize;

  // Helper: convertit fraction (0..1) en position world
  const p = (rx, ry) => ({ x: rx * W, y: ry * H });

  // Zones prédéfinies par proportion de la carte
  const zones = {
    center:       p(0.50, 0.50),
    zaibatsuHQ:   p(0.75, 0.20),
    looniesHQ:    p(0.20, 0.75),
    yakuzaHQ:     p(0.20, 0.20),
    port:         p(0.80, 0.80),
    garage1:      p(0.25, 0.25),
    garage2:      p(0.75, 0.75),
    dropoff1:     p(0.60, 0.40),
    dropoff2:     p(0.30, 0.60),
    spawnA:       p(0.55, 0.55),
    spawnB:       p(0.45, 0.45),
    escape:       p(0.10, 0.10)
  };

  return [

    // ─────────────────────────────────────────────
    // MISSION 1: "First Contact" — Introduction
    // ─────────────────────────────────────────────
    {
      id: "first_contact",
      name: "First Contact",
      briefing: "Rejoint le centre-ville. De l'argent t'attend là-bas.",
      autoTrigger: [], // démarre immédiatement

      onStart: [
        { type: "Toast", text: "🎯 Rejoins le centre-ville!", duration: 2.5 },
        { type: "SpawnPickup",
          x: zones.center.x, y: zones.center.y,
          pickupType: "money", value: 1000,
          label: "💰 +$1000", color: "#FFD700"
        }
      ],

      steps: [
        {
          objective: "Rejoins le centre-ville",
          conditions: [
            { type: "EnterZone", who: "player", zone: { ...zones.center, radius: 80 } }
          ],
          onComplete: [
            { type: "Toast", text: "👍 Bien. Maintenant équipe-toi.", duration: 2.0 },
            { type: "GiveWeapon", weapon: "Uzi", ammo: 60 }
          ]
        },
        {
          objective: "Prends le téléphone Zaibatsu (zone rouge, appuie T)",
          conditions: [
            { type: "Flag", flag: "phone_zaibatsu_answered", value: true }
          ]
        }
      ],

      onComplete: [
        { type: "AddMoney", amount: 500 },
        { type: "AddRespect", gang: "zaibatsu", amount: 10 },
        { type: "Toast", text: "✅ Bienvenue dans la ville!", duration: 2.5 }
      ]
    },

    // ─────────────────────────────────────────────
    // MISSION 2: "El Pistolero" — Zaibatsu
    // ─────────────────────────────────────────────
    {
      id: "el_pistolero",
      name: "El Pistolero",
      briefing: "Zaibatsu: Élimine la cible, puis fuis. Vite.",
      phoneIndex: 0, // téléphone Zaibatsu

      onStart: [
        { type: "Toast", text: "📍 Cible au Nord-Est. Élimine-la.", duration: 2.5 },
        {
          type: "SpawnPed",
          name: "target_pistolero",
          x: zones.zaibatsuHQ.x + 40,
          y: zones.zaibatsuHQ.y + 20,
          health: 60
        }
      ],

      steps: [
        {
          objective: "Élimine la cible Zaibatsu",
          conditions: [
            { type: "TargetDead", target: "target_pistolero" }
          ],
          onComplete: [
            { type: "SetWanted", level: 2 },
            { type: "Toast", text: "💀 Cible éliminée! FUIS la police!", duration: 2.5 }
          ]
        },
        {
          objective: "Semée la police (wanted doit redescendre à 0)",
          conditions: [
            { type: "WantedLevel", op: "==", value: 0 }
          ],
          onComplete: [
            { type: "Toast", text: "🚗 Bien joué, tu t'en es sorti!", duration: 2.0 }
          ]
        }
      ],

      failIf: [
        { type: "WantedLevel", op: ">=", value: 5 }
      ],

      onComplete: [
        { type: "AddMoney", amount: 2500 },
        { type: "AddRespect", gang: "zaibatsu", amount: 20 },
        { type: "GiveWeapon", weapon: "Shotgun", ammo: 20 }
      ],

      onFail: [
        { type: "Toast", text: "❌ Armée déployée — Mission échouée!", duration: 2.5 }
      ]
    },

    // ─────────────────────────────────────────────
    // MISSION 3: "Rouleau Compresseur" — Loonies
    // ─────────────────────────────────────────────
    {
      id: "rouleau_compresseur",
      name: "Rouleau Compresseur",
      briefing: "Les Loonies: Vole le véhicule marqué et livre-le au port.",
      phoneIndex: 1, // téléphone Loonies

      onStart: [
        { type: "Toast", text: "🚗 Trouve et vole le véhicule cible!", duration: 2.5 },
        {
          type: "SpawnVehicle",
          name: "target_vehicle",
          x: zones.spawnA.x,
          y: zones.spawnA.y,
          model: "LIMO",
          color: "#FF8800"
        }
      ],

      steps: [
        {
          objective: "Monte dans la limo orange",
          conditions: [
            { type: "PlayerInVehicle" }
          ],
          onComplete: [
            { type: "Toast", text: "🚗 Maintenant livre-la au port!", duration: 2.0 }
          ]
        },
        {
          objective: "Livre la limo au port (zone bleue)",
          conditions: [
            { type: "PlayerInVehicle" },
            { type: "EnterZone", who: "player", zone: { ...zones.port, radius: 90 } }
          ],
          onComplete: [
            { type: "Toast", text: "✅ Livraison effectuée!", duration: 2.0 }
          ]
        }
      ],

      onComplete: [
        { type: "AddMoney", amount: 4000 },
        { type: "AddRespect", gang: "loonies", amount: 25 },
        { type: "ClearWanted" },
        { type: "GiveWeapon", weapon: "Grenade", ammo: 5 }
      ]
    },

    // ─────────────────────────────────────────────
    // MISSION 4: "Yakuza Rising" — Yakuza
    // ─────────────────────────────────────────────
    {
      id: "yakuza_rising",
      name: "Yakuza Rising",
      briefing: "Yakuza: Prouve ta valeur. Atteins leur QG sans arme à la main.",
      phoneIndex: 2, // téléphone Yakuza

      onStart: [
        { type: "Toast", text: "⚔️ Rejoins le QG Yakuza sans voiture.", duration: 2.5 }
      ],

      steps: [
        {
          objective: "Rejoins le QG Yakuza à pied",
          conditions: [
            { type: "PlayerOnFoot" },
            { type: "EnterZone", who: "player", zone: { ...zones.yakuzaHQ, radius: 100 } }
          ],
          onComplete: [
            { type: "AddRespect", gang: "yakuza", amount: 15 },
            { type: "Toast", text: "🎌 Yakuza: Honoré. Maintenant, une livraison.", duration: 2.5 },
            {
              type: "SpawnVehicle",
              name: "yakuza_car",
              x: zones.yakuzaHQ.x + 50,
              y: zones.yakuzaHQ.y,
              model: "MERC",
              color: "#00DDFF"
            }
          ]
        },
        {
          objective: "Livre la Merc cyan au point de dépôt",
          conditions: [
            { type: "PlayerInVehicle" },
            { type: "EnterZone", who: "player", zone: { ...zones.dropoff2, radius: 80 } }
          ],
          onComplete: [
            { type: "Toast", text: "✅ Livraison Yakuza réussie!", duration: 2.0 }
          ]
        }
      ],

      onComplete: [
        { type: "AddMoney", amount: 5000 },
        { type: "AddRespect", gang: "yakuza", amount: 30 },
        { type: "GiveWeapon", weapon: "RocketLauncher", ammo: 3 }
      ]
    },

    // ─────────────────────────────────────────────
    // MISSION 5: "Hit & Run" — Temps limité
    // ─────────────────────────────────────────────
    {
      id: "hit_and_run",
      name: "Hit & Run",
      briefing: "Atteins le dépôt d'argent en moins de 60 secondes!",
      phoneIndex: 3, // téléphone anonyme

      onStart: [
        { type: "StartTimer", name: "race_timer", duration: 60 },
        { type: "Toast", text: "⏱️ 60 secondes pour atteindre le dépôt!", duration: 2.5 },
        { type: "SpawnPickup",
          x: zones.dropoff1.x, y: zones.dropoff1.y,
          pickupType: "money", value: 3000,
          label: "💰 DÉPÔT", color: "#FFD700"
        }
      ],

      steps: [
        {
          objective: "Atteins le dépôt (zone jaune) en moins de 60s!",
          conditions: [
            { type: "EnterZone", who: "player", zone: { ...zones.dropoff1, radius: 70 } }
          ],
          onComplete: [
            { type: "Toast", text: "💰 Argent récupéré!", duration: 2.0 }
          ]
        }
      ],

      failIf: [
        { type: "TimerExpired", timer: "race_timer" }
      ],

      onComplete: [
        { type: "AddMoney", amount: 3000 },
        { type: "Toast", text: "⚡ Dans les temps! Beau travail.", duration: 2.5 }
      ],

      onFail: [
        { type: "Toast", text: "⏱️ Trop lent! Mission échouée.", duration: 2.5 }
      ]
    },

    // ─────────────────────────────────────────────
    // MISSION 6: "Gangland" — Défense de zone
    // ─────────────────────────────────────────────
    {
      id: "gangland",
      name: "Gangland",
      briefing: "Des rivaux envahissent notre zone. Élimine-les tous.",
      phoneIndex: 0, // Zaibatsu, 2e appel

      onStart: [
        { type: "Toast", text: "⚔️ 3 ennemis entrent dans la zone!", duration: 2.5 },
        { type: "SpawnPed", name: "gang_enemy_1", x: zones.spawnA.x, y: zones.spawnA.y, health: 50 },
        { type: "SpawnPed", name: "gang_enemy_2", x: zones.spawnA.x + 30, y: zones.spawnA.y, health: 50 },
        { type: "SpawnPed", name: "gang_enemy_3", x: zones.spawnA.x - 30, y: zones.spawnA.y, health: 50 }
      ],

      steps: [
        {
          objective: "Élimine les 3 ennemis de gang",
          conditions: [
            { type: "TargetDead", target: "gang_enemy_1" },
            { type: "TargetDead", target: "gang_enemy_2" },
            { type: "TargetDead", target: "gang_enemy_3" }
          ],
          onComplete: [
            { type: "Toast", text: "💪 Zone sécurisée!", duration: 2.0 }
          ]
        }
      ],

      onComplete: [
        { type: "AddMoney", amount: 6000 },
        { type: "AddRespect", gang: "zaibatsu", amount: 35 },
        { type: "GiveWeapon", weapon: "Flamethrower", ammo: 40 }
      ]
    },

    // ─────────────────────────────────────────────
    // MISSION 7: "The Big Score" — Mission finale
    // ─────────────────────────────────────────────
    {
      id: "the_big_score",
      name: "The Big Score",
      briefing: "Le grand braquage. Récupère la caisse, livre-la, et disparais.",
      phoneIndex: 4, // téléphone mystère

      onStart: [
        { type: "Toast", text: "💰 Le grand coup! Voiture blindée au port.", duration: 3.0 },
        {
          type: "SpawnVehicle",
          name: "armored_van",
          x: zones.port.x,
          y: zones.port.y,
          model: "BANKVAN",
          color: "#556655"
        },
        { type: "SpawnPickup",
          x: zones.escape.x, y: zones.escape.y,
          pickupType: "money", value: 10000,
          label: "💰 $10,000 — FUITE!", color: "#FF0000"
        }
      ],

      steps: [
        {
          objective: "Vol la fourgonnette blindée au port",
          conditions: [
            { type: "PlayerInVehicle" },
            { type: "EnterZone", who: "player", zone: { ...zones.port, radius: 100 } }
          ],
          onComplete: [
            { type: "SetWanted", level: 3 },
            { type: "Toast", text: "🚨 ALERTE! Fuis vers le point d'évasion!", duration: 2.5 }
          ]
        },
        {
          objective: "Atteins le point d'évasion (fuis la police!)",
          conditions: [
            { type: "EnterZone", who: "player", zone: { ...zones.escape, radius: 90 } }
          ],
          onComplete: [
            { type: "ClearWanted" },
            { type: "Toast", text: "✅ Tu t'en es sorti. Beau boulot.", duration: 2.5 }
          ]
        }
      ],

      failIf: [
        { type: "WantedLevel", op: ">=", value: 5 }
      ],

      onComplete: [
        { type: "AddMoney", amount: 10000 },
        { type: "AddRespect", gang: "zaibatsu", amount: 40 },
        { type: "AddRespect", gang: "loonies", amount: 40 },
        { type: "AddRespect", gang: "yakuza", amount: 40 },
        { type: "Toast", text: "🏆 THE BIG SCORE — VOUS AVEZ TOUT GAGNÉ!", duration: 5.0 }
      ],

      onFail: [
        { type: "Toast", text: "❌ L'armée t'a eu. Mission échouée.", duration: 2.5 },
        { type: "ClearWanted" }
      ]
    }

  ];
}
