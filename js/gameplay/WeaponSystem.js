/**
 * WeaponSystem (V2_0_0)
 *
 * Définitions data-driven des 6 armes du jeu.
 * Chaque arme a: type, damage, range, fireRate, rays, spread, etc.
 *
 * Types:
 *   hitscan    : rayon instantané (Pistol, Uzi, Shotgun)
 *   flame      : cône de feu en zone (Flamethrower)
 *   projectile : objet physique (Grenade, RocketLauncher)
 *
 * Auto-fire:
 *   auto: true  -> tir continu si clic maintenu (Uzi, Flamethrower)
 *   auto: false -> edge-déclenché (Pistol: infini, autres: 1 clic = 1 tir)
 *   Pour les grenades/roquettes: 1 clic par tir
 */

export const WEAPON_DEFS = [
  {
    name: "Pistol",
    label: "Pistolet",
    type: "hitscan",
    damage: 18,
    range: 280,
    fireRate: 5,     // tirs/sec
    rays: 1,
    spread: 0,
    auto: false,
    ammoMax: Infinity,
    projectileSpeed: 0,
    fuseTime: 0,
    explosionRadius: 0
  },
  {
    name: "Uzi",
    label: "Uzi",
    type: "hitscan",
    damage: 8,
    range: 200,
    fireRate: 12,
    rays: 1,
    spread: 0.14,
    auto: true,
    ammoMax: 200,
    projectileSpeed: 0,
    fuseTime: 0,
    explosionRadius: 0
  },
  {
    name: "Shotgun",
    label: "Fusil à pompe",
    type: "hitscan",
    damage: 14,
    range: 180,
    fireRate: 1.8,
    rays: 6,
    spread: 0.28,
    auto: false,
    ammoMax: 40,
    projectileSpeed: 0,
    fuseTime: 0,
    explosionRadius: 0
  },
  {
    name: "Flamethrower",
    label: "Lance-flammes",
    type: "flame",
    damage: 4,
    range: 110,
    fireRate: 20,
    rays: 4,
    spread: 0.5,
    auto: true,
    ammoMax: 80,
    projectileSpeed: 0,
    fuseTime: 0,
    explosionRadius: 0
  },
  {
    name: "Grenade",
    label: "Grenade",
    type: "projectile",
    damage: 65,
    range: 0,
    fireRate: 0.7,
    rays: 1,
    spread: 0,
    auto: false,
    ammoMax: 10,
    projectileSpeed: 380,
    fuseTime: 2.8,
    explosionRadius: 80
  },
  {
    name: "RocketLauncher",
    label: "Bazooka",
    type: "projectile",
    damage: 100,
    range: 0,
    fireRate: 0.6,
    rays: 1,
    spread: 0,
    auto: false,
    ammoMax: 6,
    projectileSpeed: 520,
    fuseTime: 0,
    explosionRadius: 100
  }
];

/** Ordre des armes (sélection 1-6) */
export const WEAPON_ORDER = WEAPON_DEFS.map(w => w.name);

/** Map nom -> def pour lookup O(1) */
const _byName = new Map(WEAPON_DEFS.map(w => [w.name, w]));

/**
 * Retourne la définition d'une arme par son nom.
 * Fallback sur Pistol si inconnu.
 */
export function getWeaponDef(name) {
  return _byName.get(name) ?? WEAPON_DEFS[0];
}

/**
 * Liste des noms d'armes disponibles.
 * @returns {string[]}
 */
export function getWeaponNames() {
  return WEAPON_ORDER;
}
