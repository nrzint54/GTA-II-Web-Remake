# GTA II WebV2_0_0

Remake jouable de GTA 2 en greybox (sans textures), 100% HTML/CSS/JS.
Canvas 2D pur â€” aucune dÃ©pendance externe.

## NouveautÃ©s V2_0_0

- **ScriptEngine** : 7 missions scriptÃ©es (First Contact, El Pistolero, Rouleau Compresseur, Yakuza Rising, Hit & Run, Gangland, The Big Score)
- **AudioSystem** : sons procÃ©duraux 100% Web Audio API (tirs, explosions, moteur, sirÃ¨nes, pickup, WASTED, BUSTED, tÃ©lÃ©phone)
- **OverlaySystem** : WASTED / BUSTED plein Ã©cran + minimap dynamique en temps rÃ©el
- **Gang AI** : les peds de gang attaquent le joueur si rÃ©putation nÃ©gative
- **Auto-fire** : Uzi et Lance-flammes tirent en continu avec clic maintenu

## Lancement

Serveur web local requis (fetch JSON) :
```
cd GTA_II_Web_V2_0_0
python3 -m http.server 8080
# Ouvrir http://localhost:8080
```

## ContrÃ´les

| Touche | Action |
|--------|--------|
| Z/Q/S/D ou â†‘â†“â†â†’ | DÃ©placement (tank controls) |
| Souris | Viser |
| Clic gauche | Tirer (maintenu = auto-fire si Uzi/Flammes) |
| Enter | Entrer/Sortir du vÃ©hicule |
| F | Arme suivante |
| 1-6 | SÃ©lection directe arme |
| T | RÃ©pondre au tÃ©lÃ©phone |
| Shift+M | Poser une mine (si stocks) |
| Shift+O | DÃ©poser huile (si dans vÃ©hicule) |
| B | Activer bombe voiture |
| H | SirÃ¨ne (si CopCar) |
| M | Mission suivante (fallback) |
| F5 | Sauvegarder (nÃ©cessite PHP) |

## Armes

| # | Arme | Type | DÃ©gÃ¢ts | PortÃ©e |
|---|------|------|--------|--------|
| 1 | Pistolet | Hitscan | 18 | 280px |
| 2 | Uzi | Hitscan auto | 8 | 200px |
| 3 | Fusil Ã  pompe | Hitscan x6 | 14/pellet | 180px |
| 4 | Lance-flammes | CÃ´ne auto | 4/tick | 110px |
| 5 | Grenade | Projectile | 65 AoE | 80px radius |
| 6 | Bazooka | Projectile | 100 AoE | 100px radius |

## Gangs & RÃ©putation

- **Zaibatsu** (rouge) â€” zone Nord-Est
- **Loonies** (orange) â€” zone Sud-Ouest  
- **Yakuza** (cyan) â€” zone Nord-Ouest

R©putation -100 Ã  +100 :
- â‰¥ +20 : alliÃ© (t'ignore)
- -20 Ã  +20 : neutre
- â‰¤ -20 : ennemi (attaque)

## Missions (7 scriptÃ©es)

1. **First Contact** â€” Introduction, collecte d'argent
2. **El Pistolero** â€” Zaibatsu : Ã©liminer une cible + fuir
3. **Rouleau Compresseur** â€” Loonies : voler et livrer un vÃ©hicule
4. **Yakuza Rising** â€” Yakuza : livraison Ã  pied + vÃ©hicule
5. **Hit & Run** â€” Course contre la montre (60 secondes)
6. **Gangland** â€” DÃ©fendre une zone (Ã©liminer 3 ennemis)
7. **The Big Score** â€” Mission finale : braquage + Ã©vasion

## Architecture

```
js/
â”œâ”€â”€ audio/          AudioSystem.js
â”œâ”€â”€ core/           Game.js, Time.js, Effects.js
â”œâ”€â”€ entities/       Player, Ped, Vehicle, CopCar, CopPed
â”œâ”€â”€ gameplay/       WeaponSystem, ProjectileSystem, WantedSystem
â”œâ”€â”€ gang/           GangSystem
â”œâ”€â”€ garage/         GarageSystem
â”œâ”€â”€ hazard/         HazardSystem
â”œâ”€â”€ input/          Input
â”œâ”€â”€ missions/       MissionManager, PhoneSystem
â”œâ”€â”€ physics/        Physics, AABB, OBB, SpatialHash, EntityCollisions
â”œâ”€â”€ pickup/         PickupSystem
â”œâ”€â”€ police/         PoliceManager, PoliceNav
â”œâ”€â”€ render/         Renderer2D
â”œâ”€â”€ script/         ScriptEngine, MissionScripts
â”œâ”€â”€ ui/             HUD, OverlaySystem
â””â”€â”€ world/          Camera, Map, MapLoader, RoadGraph, createWorld
```
