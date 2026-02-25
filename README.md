# GTA II Web — V2_0_0 Stable

Remake jouable de GTA 2 en greybox (sans textures), 100% HTML/CSS/JS.
Canvas 2D pur — aucune dépendance externe.

## Nouveautés V2_0_0

- **ScriptEngine** : 7 missions scriptées (First Contact, El Pistolero, Rouleau Compresseur, Yakuza Rising, Hit & Run, Gangland, The Big Score)
- **AudioSystem** : sons procéduraux 100% Web Audio API (tirs, explosions, moteur, sirènes, pickup, WASTED, BUSTED, téléphone)
- **OverlaySystem** : WASTED / BUSTED plein écran + minimap dynamique en temps réel
- **Gang AI** : les peds de gang attaquent le joueur si réputation négative
- **Auto-fire** : Uzi et Lance-flammes tirent en continu avec clic maintenu

## Contrôles

| Touche | Action |
|--------|--------|
| Z/Q/S/D ou ↑ ↓ ← → | Déplacement (tank controls) |
| Souris | Viser |
| Clic gauche | Tirer (maintenu = auto-fire si Uzi/Flammes) |
| Enter | Entrer/Sortir du véhicule |
| F | Arme suivante |
| 1-6 | Sélection directe arme |
| T | Répondre au téléphone |
| Shift+M | Poser une mine (si stocks) |
| Shift+O | Déposer huile (si dans véhicule) |
| B | Activer bombe voiture |
| H | Sirène (si CopCar) |
| M | Mission suivante (fallback) |
| F5 | Sauvegarder (nécessite PHP) |

## Armes

| # | Arme | Type | Dégâts | Portée |
|---|------|------|--------|--------|
| 1 | Pistolet | Hitscan | 18 | 280px |
| 2 | Uzi | Hitscan auto | 8 | 200px |
| 3 | Fusil à pompe | Hitscan x6 | 14/pellet | 180px |
| 4 | Lance-flammes | Cône auto | 4/tick | 110px |
| 5 | Grenade | Projectile | 65 AoE | 80px radius |
| 6 | Bazooka | Projectile | 100 AoE | 100px radius |

## Gangs & Réputation

- **Zaibatsu** (rouge) — zone Nord-Est
- **Loonies** (orange) — zone Sud-Ouest  
- **Yakuza** (cyan) — zone Nord-Ouest

R©putation -100 à +100 :
- ≥ +20 : allié (t'ignore)
- -20 à +20 : neutre
- ≤ -20 : ennemi (attaque)

## Missions (7 scriptées)

1. **First Contact** — Introduction, collecte d'argent
2. **El Pistolero** — Zaibatsu : éliminer une cible + fuir
3. **Rouleau Compresseur** — Loonies : voler et livrer un véhicule
4. **Yakuza Rising** — Yakuza : livraison à pied + véhicule
5. **Hit & Run** — Course contre la montre (60 secondes)
6. **Gangland** — Défendre une zone (éliminer 3 ennemis)
7. **The Big Score** — Mission finale : braquage + évasion

## Architecture

```
js/
├── audio/          AudioSystem.js
├── core/           Game.js, Time.js, Effects.js
├── entities/       Player, Ped, Vehicle, CopCar, CopPed
├── gameplay/       WeaponSystem, ProjectileSystem, WantedSystem
├── gang/           GangSystem
├── garage/         GarageSystem
├── hazard/         HazardSystem
├── input/          Input
├── missions/       MissionManager, PhoneSystem
├── physics/        Physics, AABB, OBB, SpatialHash, EntityCollisions
├── pickup/         PickupSystem
├── police/         PoliceManager, PoliceNav
├── render/         Renderer2D
├── script/         ScriptEngine, MissionScripts
├── ui/             HUD, OverlaySystem
└── world/          Camera, Map, MapLoader, RoadGraph, createWorld
```
