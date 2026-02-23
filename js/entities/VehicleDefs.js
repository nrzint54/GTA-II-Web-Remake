/**
 * VehicleDefs (V8_3_1_2)
 *
 * Objectif:
 * - Avoir ~la même "surface" que GTA2: beaucoup de modèles, chacun avec son handling.
 * - Data-driven: Vehicle/CopCar lisent ces valeurs au spawn.
 *
 * Notes:
 * - On ne cherche pas ici le 1:1 exact avec nyc.gci (GTA2) — mais on garde des rapports cohérents
 *   (CopCar/Meteor rapides, tank très lourd, bus lent mais résistant, etc.).
 * - Les champs "hp", "massKg", "seats", "group" sont surtout informatifs pour l'instant.
 */

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;

// GTA2: 1 cube = 64 pixels (nos anciennes valeurs étaient calibrées pour tileSize=32).
// Pour garder le même "feeling" en tuiles/seconde quand tileSize=64, on scale les vitesses linéaires.
const WORLD_SCALE = 2;

const SIZE = Object.freeze({
  bike:        { w: 18, h: 32 },
  motorcycle:  { w: 18, h: 36 },
  micro:       { w: 20, h: 36 },
  compact:     { w: 22, h: 40 },
  coupe:       { w: 24, h: 42 },
  sedan:       { w: 24, h: 46 },
  sport:       { w: 24, h: 44 },
  muscle:      { w: 26, h: 46 },
  van:         { w: 26, h: 52 },
  truck:       { w: 28, h: 56 },
  bus:         { w: 30, h: 64 },
  tank:        { w: 34, h: 66 },
  train:       { w: 40, h: 80 },
  trailer:     { w: 30, h: 60 }
});

/**
 * Dimensions EXACTES des sprites extraits de GTA2 (en pixels = world units).
 *
 * Pourquoi:
 * - GTA2 ne force pas les sprites véhicules à 64x64: chaque sprite a sa propre width/height
 *   (tailles paires) et est packé dans le fichier STYLE/STY.
 * - Pour coller au rendu et à la hitbox "GTA2", on aligne par défaut w/h sur la taille réelle
 *   du PNG (assets/vehicles/<ID>.png).
 */
const SPRITE_DIMS = Object.freeze({
  "ALFA": { w: 24, h: 46 },
  "ALLARD": { w: 26, h: 46 },
  "AMDB4": { w: 24, h: 44 },
  "APC": { w: 28, h: 56 },
  "BANKVAN": { w: 26, h: 52 },
  "BMW": { w: 24, h: 42 },
  "BOXCAR": { w: 28, h: 56 },
  "BOXTRUCK": { w: 28, h: 56 },
  "BUG": { w: 22, h: 40 },
  "BUICK": { w: 24, h: 46 },
  "BUS": { w: 30, h: 64 },
  "COPCAR": { w: 24, h: 46 },
  "DART": { w: 22, h: 40 },
  "EDSEL": { w: 24, h: 46 },
  "EDSELFBI": { w: 24, h: 46 },
  "FIAT": { w: 22, h: 40 },
  "FIRETRUK": { w: 28, h: 56 },
  "GRAHAM": { w: 24, h: 46 },
  "GT24640": { w: 24, h: 44 },
  "GTRUCK": { w: 28, h: 56 },
  "GUNJEEP": { w: 28, h: 56 },
  "HOTDOG": { w: 26, h: 52 },
  "ICECREAM": { w: 26, h: 52 },
  "ISETLIMO": { w: 26, h: 52 },
  "ISETTA": { w: 20, h: 36 },
  "JEEP": { w: 28, h: 56 },
  "JEFFREY": { w: 24, h: 44 },
  "KRSNABUS": { w: 30, h: 64 },
  "LIMO": { w: 26, h: 52 },
  "LIMO2": { w: 26, h: 52 },
  "MEDICAR": { w: 26, h: 52 },
  "MERC": { w: 24, h: 44 },
  "MESSER": { w: 24, h: 46 },
  "MIURA": { w: 24, h: 44 },
  "MONSTER": { w: 28, h: 56 },
  "MORGAN": { w: 24, h: 46 },
  "MORRIS": { w: 22, h: 40 },
  "PICKUP": { w: 28, h: 56 },
  "RTYPE": { w: 24, h: 44 },
  "SPIDER": { w: 22, h: 40 },
  "SPRITE": { w: 22, h: 40 },
  "STINGRAY": { w: 24, h: 44 },
  "STRATOS": { w: 24, h: 44 },
  "STRATOSB": { w: 24, h: 44 },
  "STRIPETB": { w: 24, h: 42 },
  "STYPE": { w: 24, h: 46 },
  "STYPECAB": { w: 24, h: 46 },
  "SWATVAN": { w: 26, h: 52 },
  "T2000GT": { w: 24, h: 44 },
  "TANK": { w: 32, h: 64 },
  "TANKER": { w: 28, h: 56 },
  "TAXI": { w: 24, h: 46 },
  "TBIRD": { w: 26, h: 46 },
  "TOWTRUCK": { w: 28, h: 56 },
  "TRAIN": { w: 32, h: 64 },
  "TRAINCAB": { w: 32, h: 64 },
  "TRAINFB": { w: 32, h: 64 },
  "TRANCEAM": { w: 26, h: 46 },
  "TRUKCAB1": { w: 28, h: 56 },
  "TRUKCAB2": { w: 28, h: 56 },
  "TRUKCONT": { w: 30, h: 60 },
  "TRUKTRNS": { w: 30, h: 60 },
  "TVVAN": { w: 26, h: 52 },
  "VAN": { w: 26, h: 52 },
  "VESPA": { w: 26, h: 52 },
  "VTYPE": { w: 24, h: 46 },
  "WBTWIN": { w: 18, h: 36 },
  "XK120": { w: 24, h: 44 },
  "ZCX5": { w: 24, h: 44 }
});

function deriveHandling({ speed = 5, accel = 5, turn = 5, armor = 5, mass = 5 } = {}) {
  const s = clamp01(speed / 10);
  const a = clamp01(accel / 10);
  const t = clamp01(turn / 10);
  const ar = clamp01(armor / 10);
  const m = clamp01(mass / 10);

  // Unités internes:
  // - maxSpeed: "world units / sec" (tileSize=32 => 320 ~ 10 tiles/s)
  // - accel/brake: "world units / sec^2"
  const maxSpeed = Math.round(lerp(180, 520, s) * WORLD_SCALE);
  const reverseMaxSpeed = Math.round(maxSpeed * lerp(0.45, 0.62, s));
  const acceleration = Math.round(lerp(420, 1600, a) * WORLD_SCALE);
  const brake = Math.round(lerp(520, 1400, (a * 0.45 + ar * 0.55)) * WORLD_SCALE);

  // Handling:
  // - turnSpeed: vitesse de rotation (rad/s)
  // - friction: amortissement latéral et drift (plus haut = plus "grip")
  const turnSpeed = +(lerp(2.6, 6.4, t)).toFixed(2);
  const friction = +(lerp(2.9, 5.8, t)).toFixed(2);

  // Poids:
  // invMass plus petit => plus lourd (déplace moins dans les collisions).
  const invMass = +(lerp(0.95, 0.12, m)).toFixed(3);

  // Résistance:
  const health = Math.round(lerp(70, 280, ar));

  return { maxSpeed, reverseMaxSpeed, accel: acceleration, brake, turnSpeed, friction, invMass, health };
}

function finalize(def) {
  const size = SIZE[def.size ?? "sedan"] ?? SIZE.sedan;
  const sprite = SPRITE_DIMS[def.id] ?? null;
  const handling = deriveHandling(def.ratings ?? {});
  const color = def.color ?? "#ffd25a";

  return Object.freeze({
    // identifiants
    id: def.id,
    name: def.name,
    // meta (pour plus tard / UI / scripts)
    group: def.group ?? "civil", // civil | service | emergency | gang | special
    class: def.class ?? "car",
    seats: def.seats ?? 2,
    hp: def.hp ?? null,
    massKg: def.massKg ?? null,

    // taille/collision
    // Par défaut on suit la taille réelle du sprite GTA2 (si dispo), sinon fallback sur la classe.
    w: def.w ?? sprite?.w ?? size.w,
    h: def.h ?? sprite?.h ?? size.h,
    color,

    // handling (utilisé)
    maxSpeed: def.maxSpeed ?? handling.maxSpeed,
    reverseMaxSpeed: def.reverseMaxSpeed ?? handling.reverseMaxSpeed,
    accel: def.accel ?? handling.accel,
    brake: def.brake ?? handling.brake,
    turnSpeed: def.turnSpeed ?? handling.turnSpeed,
    friction: def.friction ?? handling.friction,
    invMass: def.invMass ?? handling.invMass,
    health: def.health ?? handling.health
  });
}

/**
 * Base list: reprend les enums/noms GTA2 (mêmes script codes).
 * Source des noms/enums: GTAMods wiki "List of vehicles (GTA 2)".
 *
 * On garde volontairement les champs ratings: {speed, accel, turn, armor, mass}
 * sur une échelle 1..10 (facile à tuner).
 */
const BASE = [
  // --- Standard cars ---
  { id: "ALFA",      name: "Romero",            size: "sedan",   seats: 4, class: "standard", group: "civil",  hp: 150, massKg: 1350, ratings: { speed: 5, accel: 5, turn: 5, armor: 5, mass: 5 } },
  { id: "BUICK",     name: "Bulwark",           size: "sedan",   seats: 4, class: "standard", group: "civil",  hp: 160, massKg: 1500, ratings: { speed: 5, accel: 5, turn: 5, armor: 5, mass: 6 } },
  { id: "DART",      name: "Minx",              size: "compact", seats: 4, class: "compact",  group: "civil",  hp: 110, massKg: 1050, ratings: { speed: 4, accel: 4, turn: 6, armor: 4, mass: 4 } },
  { id: "EDSEL",     name: "Eddy",              size: "sedan",   seats: 4, class: "standard", group: "civil",  hp: 155, massKg: 1450, ratings: { speed: 5, accel: 5, turn: 5, armor: 5, mass: 6 } },
  { id: "FIAT",      name: "Panto",             size: "compact", seats: 4, class: "compact",  group: "civil",  hp: 95,  massKg: 980,  ratings: { speed: 4, accel: 4, turn: 7, armor: 4, mass: 3 } },
  { id: "GRAHAM",    name: "Shark",             size: "sedan",   seats: 4, class: "standard", group: "civil",  hp: 170, massKg: 1600, ratings: { speed: 5, accel: 5, turn: 4, armor: 6, mass: 7 } },
  { id: "MESSER",    name: "Schmidt",           size: "sedan",   seats: 4, class: "standard", group: "civil",  hp: 165, massKg: 1550, ratings: { speed: 5, accel: 5, turn: 5, armor: 5, mass: 6 } },
  { id: "MORGAN",    name: "Morton",            size: "sedan",   seats: 4, class: "standard", group: "civil",  hp: 145, massKg: 1400, ratings: { speed: 5, accel: 5, turn: 5, armor: 5, mass: 5 } },
  { id: "MORRIS",    name: "Maurice",           size: "compact", seats: 4, class: "compact",  group: "civil",  hp: 120, massKg: 1150, ratings: { speed: 4, accel: 4, turn: 6, armor: 4, mass: 4 } },
  { id: "VTYPE",     name: "Z-Type",            size: "sedan",   seats: 4, class: "standard", group: "civil",  hp: 170, massKg: 1500, ratings: { speed: 6, accel: 5, turn: 5, armor: 6, mass: 6 } },

  // --- Sports & muscle ---
  { id: "RTYPE",     name: "A-Type",            size: "sport",   seats: 2, class: "sports",   group: "civil",  hp: 210, massKg: 1320, ratings: { speed: 8, accel: 7, turn: 7, armor: 4, mass: 5 }, color:"#ffd67a" },
  { id: "AMDB4",     name: "Aniston BD4",       size: "sport",   seats: 2, class: "sports",   group: "civil",  hp: 190, massKg: 1280, ratings: { speed: 7, accel: 6, turn: 7, armor: 4, mass: 5 }, color:"#ffe08e" },
  { id: "BMW",       name: "Beamer",            size: "coupe",   seats: 2, class: "sports",   group: "civil",  hp: 175, massKg: 1200, ratings: { speed: 7, accel: 6, turn: 7, armor: 4, mass: 4 }, color:"#ffe08e" },
  { id: "MERC",      name: "Benson",            size: "sport",   seats: 2, class: "sports",   group: "civil",  hp: 215, massKg: 1380, ratings: { speed: 8, accel: 7, turn: 7, armor: 4, mass: 5 }, color:"#ffe08e" },
  { id: "ZCX5",      name: "Furore GT",         size: "sport",   seats: 2, class: "sports",   group: "civil",  hp: 255, massKg: 1300, ratings: { speed: 9, accel: 8, turn: 8, armor: 4, mass: 5 }, color:"#fff0a8" },
  { id: "GT24640",   name: "GT-A1",             size: "sport",   seats: 2, class: "sports",   group: "civil",  hp: 260, massKg: 1320, ratings: { speed: 9, accel: 8, turn: 8, armor: 4, mass: 5 }, color:"#fff0a8" },
  { id: "JEFFREY",   name: "Jefferson",         size: "sport",   seats: 2, class: "sports",   group: "civil",  hp: 230, massKg: 1360, ratings: { speed: 8, accel: 7, turn: 7, armor: 4, mass: 5 }, color:"#ffe08e" },
  { id: "T2000GT",   name: "Michelli Roadster", size: "sport",   seats: 2, class: "sports",   group: "civil",  hp: 245, massKg: 1220, ratings: { speed: 9, accel: 8, turn: 8, armor: 3, mass: 4 }, color:"#fff0a8" },
  { id: "STINGRAY",  name: "Stinger",           size: "sport",   seats: 2, class: "sports",   group: "civil",  hp: 250, massKg: 1350, ratings: { speed: 9, accel: 8, turn: 8, armor: 4, mass: 5 }, color:"#fff0a8" },
  { id: "TRANCEAM",  name: "Trance-Am",         size: "muscle",  seats: 2, class: "muscle",   group: "civil",  hp: 235, massKg: 1560, ratings: { speed: 8, accel: 7, turn: 6, armor: 5, mass: 6 }, color:"#ffe08e" },
  { id: "TBIRD",     name: "T-Rex",             size: "muscle",  seats: 2, class: "muscle",   group: "civil",  hp: 210, massKg: 1700, ratings: { speed: 7, accel: 6, turn: 6, armor: 7, mass: 7 }, color:"#ffd67a" },
  { id: "ALLARD",    name: "Wellard",           size: "muscle",  seats: 2, class: "muscle",   group: "civil",  hp: 200, massKg: 1580, ratings: { speed: 7, accel: 6, turn: 6, armor: 5, mass: 6 }, color:"#ffd67a" },
  { id: "XK120",     name: "Jagular XK",        size: "sport",   seats: 2, class: "sports",   group: "civil",  hp: 225, massKg: 1420, ratings: { speed: 8, accel: 7, turn: 7, armor: 4, mass: 5 }, color:"#ffe08e" },

  // --- Micro / quirky ---
  { id: "ISETTA",    name: "Dementia",          size: "micro",   seats: 2, class: "micro",    group: "civil",  hp: 55,  massKg: 620,  ratings: { speed: 3, accel: 3, turn: 9, armor: 3, mass: 2 }, color:"#ffe9b5" },
  { id: "ISETLIMO",  name: "Dementia Limousine",size: "van",     seats: 4, class: "limo",     group: "civil",  hp: 80,  massKg: 1100, ratings: { speed: 4, accel: 3, turn: 5, armor: 4, mass: 4 }, color:"#ffe9b5" },

  // --- Taxis & limos ---
  { id: "STYPE",     name: "B-Type",            size: "sedan",   seats: 6, class: "taxi",     group: "service",hp: 165, massKg: 1600, ratings: { speed: 5, accel: 5, turn: 5, armor: 6, mass: 7 }, color:"#ffd25a" },
  { id: "TAXI",      name: "Taxi",              size: "sedan",   seats: 4, class: "taxi",     group: "service",hp: 150, massKg: 1450, ratings: { speed: 5, accel: 5, turn: 5, armor: 5, mass: 6 }, color:"#ffd25a" },
  { id: "STYPECAB",  name: "Taxi Xpress",       size: "sedan",   seats: 4, class: "taxi",     group: "service",hp: 175, massKg: 1500, ratings: { speed: 6, accel: 6, turn: 6, armor: 5, mass: 6 }, color:"#ffd25a" },
  { id: "LIMO",      name: "Stretch Limousine", size: "van",     seats: 6, class: "limo",     group: "civil",  hp: 210, massKg: 2100, ratings: { speed: 6, accel: 5, turn: 4, armor: 7, mass: 8 }, color:"#e9e9e9" },
  { id: "LIMO2",     name: "Sports Limousine",  size: "van",     seats: 6, class: "limo",     group: "civil",  hp: 260, massKg: 2050, ratings: { speed: 7, accel: 6, turn: 5, armor: 7, mass: 8 }, color:"#f0f0f0" },

  // --- Vans, food & media ---
  { id: "VAN",       name: "Van",               size: "van",     seats: 4, class: "van",      group: "civil",  hp: 125, massKg: 1750, ratings: { speed: 4, accel: 4, turn: 4, armor: 6, mass: 7 }, color:"#dcdcdc" },
  { id: "BANKVAN",   name: "G4 Bank Van",       size: "van",     seats: 2, class: "van",      group: "service",hp: 140, massKg: 2300, ratings: { speed: 4, accel: 4, turn: 3, armor: 8, mass: 9 }, color:"#cfd8ff" },
  { id: "HOTDOG",    name: "Hot Dog Van",       size: "van",     seats: 2, class: "van",      group: "service",hp: 120, massKg: 2000, ratings: { speed: 4, accel: 3, turn: 4, armor: 6, mass: 8 }, color:"#ffd25a" },
  { id: "ICECREAM",  name: "Ice-Cream Van",     size: "van",     seats: 2, class: "van",      group: "service",hp: 115, massKg: 1950, ratings: { speed: 4, accel: 3, turn: 4, armor: 6, mass: 8 }, color:"#ffe9ff" },
  { id: "TVVAN",     name: "TV Van",            size: "van",     seats: 2, class: "van",      group: "service",hp: 130, massKg: 1900, ratings: { speed: 4, accel: 4, turn: 4, armor: 6, mass: 8 }, color:"#cdeffd" },
  { id: "VESPA",     name: "U-Jerk Truck",      size: "van",     seats: 2, class: "van",      group: "service",hp: 130, massKg: 2100, ratings: { speed: 4, accel: 4, turn: 4, armor: 6, mass: 8 }, color:"#dff5d4" },

  // --- Trucks ---
  { id: "PICKUP",    name: "Pickup",            size: "truck",   seats: 2, class: "truck",    group: "civil",  hp: 160, massKg: 1900, ratings: { speed: 5, accel: 5, turn: 4, armor: 6, mass: 8 }, color:"#f0e1cf" },
  { id: "BOXTRUCK",  name: "Box Truck",         size: "truck",   seats: 2, class: "truck",    group: "service",hp: 180, massKg: 2900, ratings: { speed: 4, accel: 4, turn: 3, armor: 7, mass: 9 }, color:"#f0e1cf" },
  { id: "BOXCAR",    name: "Box Car",           size: "truck",   seats: 2, class: "truck",    group: "service",hp: 170, massKg: 2600, ratings: { speed: 4, accel: 4, turn: 3, armor: 7, mass: 9 }, color:"#f0e1cf" },
  { id: "GTRUCK",    name: "Garbage Truck",     size: "truck",   seats: 2, class: "truck",    group: "service",hp: 200, massKg: 3200, ratings: { speed: 3, accel: 3, turn: 2, armor: 9, mass: 10 }, color:"#d8f0c8" },
  { id: "TOWTRUCK",  name: "Tow Truck",         size: "truck",   seats: 2, class: "truck",    group: "service",hp: 190, massKg: 3100, ratings: { speed: 4, accel: 4, turn: 3, armor: 8, mass: 10 }, color:"#ffeaa0" },
  { id: "TANKER",    name: "Tanker",            size: "truck",   seats: 2, class: "truck",    group: "service",hp: 210, massKg: 3600, ratings: { speed: 3, accel: 3, turn: 2, armor: 9, mass: 10 }, color:"#f8d6d6" },

  // --- Bus / big ---
  { id: "BUS",       name: "Bus",               size: "bus",     seats: 10, class: "bus",     group: "service",hp: 240, massKg: 6500, ratings: { speed: 3, accel: 3, turn: 2, armor: 9, mass: 10 }, color:"#fff0a8" },
  { id: "KRSNABUS",  name: "Karma Bus",         size: "bus",     seats: 10, class: "bus",     group: "gang",   hp: 250, massKg: 6800, ratings: { speed: 3, accel: 3, turn: 2, armor: 10, mass: 10 }, color:"#ffbfbf" },

  // --- Specials / oddities ---
  { id: "BUG",       name: "Bug",               size: "compact", seats: 2, class: "hobby",    group: "civil",  hp: 90,  massKg: 1000, ratings: { speed: 4, accel: 4, turn: 7, armor: 4, mass: 4 }, color:"#e7ffd1" },
  { id: "MONSTER",   name: "Big Bug",           size: "truck",   seats: 2, class: "hobby",    group: "civil",  hp: 200, massKg: 2200, ratings: { speed: 5, accel: 5, turn: 4, armor: 7, mass: 8 }, color:"#e7ffd1" },
  { id: "SPIDER",    name: "Arachnid",          size: "compact", seats: 2, class: "sports",   group: "civil",  hp: 140, massKg: 1080, ratings: { speed: 7, accel: 7, turn: 9, armor: 3, mass: 4 }, color:"#fff0a8" },
  { id: "SPRITE",    name: "Spritzer",          size: "compact", seats: 2, class: "compact",  group: "civil",  hp: 120, massKg: 980,  ratings: { speed: 6, accel: 6, turn: 8, armor: 3, mass: 3 }, color:"#e0f7ff" },
  { id: "STRIPETB",  name: "Hachura",           size: "coupe",   seats: 2, class: "compact",  group: "civil",  hp: 160, massKg: 1180, ratings: { speed: 6, accel: 6, turn: 7, armor: 4, mass: 4 }, color:"#e0f7ff" },
  { id: "WBTWIN",    name: "Rumbler",           size: "motorcycle", seats: 1, class: "motorcycle", group: "gang", hp: 95, massKg: 220, ratings: { speed: 7, accel: 7, turn: 9, armor: 2, mass: 1 }, color:"#ffe08e" },

  // --- Gang-ish cars ---
  { id: "MIURA",     name: "Miara",             size: "sport",   seats: 2, class: "gang",     group: "gang",   hp: 220, massKg: 1280, ratings: { speed: 8, accel: 7, turn: 7, armor: 4, mass: 5 }, color:"#ffbfbf" },
  { id: "STRATOS",   name: "Meteor",            size: "sport",   seats: 2, class: "gang",     group: "gang",   hp: 270, massKg: 1250, ratings: { speed: 10, accel: 9, turn: 8, armor: 4, mass: 5 }, color:"#ffbfbf" },
  { id: "STRATOSB",  name: "Meteor",            size: "sport",   seats: 2, class: "gang",     group: "gang",   hp: 270, massKg: 1250, ratings: { speed: 10, accel: 9, turn: 8, armor: 4, mass: 5 }, color:"#ffbfbf" },

  // --- Emergency / government ---
  { id: "COPCAR",    name: "Cop Car",           size: "sedan",   seats: 2, class: "emergency",group: "emergency", hp: 260, massKg: 1600, ratings: { speed: 10, accel: 9, turn: 9, armor: 6, mass: 6 }, color:"#a7d0ff" },
  { id: "SWATVAN",   name: "SWAT Van",          size: "van",     seats: 4, class: "emergency",group: "emergency", hp: 220, massKg: 2600, ratings: { speed: 5, accel: 5, turn: 4, armor: 9, mass: 9 }, color:"#b6c6d8" },
  { id: "MEDICAR",   name: "Medicar",           size: "van",     seats: 2, class: "emergency",group: "emergency", hp: 210, massKg: 2400, ratings: { speed: 6, accel: 6, turn: 5, armor: 7, mass: 8 }, color:"#ffe9e9" },
  { id: "FIRETRUK",  name: "Fire Truck",        size: "truck",   seats: 2, class: "emergency",group: "emergency", hp: 260, massKg: 4800, ratings: { speed: 4, accel: 4, turn: 3, armor: 10, mass: 10 }, color:"#ffd0d0" },

  // --- 4x4 / armored ---
  { id: "JEEP",      name: "Land Roamer",       size: "truck",   seats: 4, class: "offroad",  group: "civil",  hp: 200, massKg: 2100, ratings: { speed: 6, accel: 6, turn: 5, armor: 7, mass: 8 }, color:"#dff5d4" },
  { id: "GUNJEEP",   name: "Armed Land Roamer", size: "truck",   seats: 4, class: "offroad",  group: "service",hp: 220, massKg: 2300, ratings: { speed: 6, accel: 6, turn: 5, armor: 8, mass: 9 }, color:"#dff5d4" },
  { id: "APC",       name: "Pacifier",          size: "truck",   seats: 2, class: "armored",  group: "special",hp: 260, massKg: 5200, ratings: { speed: 4, accel: 4, turn: 3, armor: 10, mass: 10 }, color:"#cdd9c0" },
  { id: "TANK",      name: "Tank",              size: "tank",    seats: 1, class: "armored",  group: "special",hp: 500, massKg: 30000,ratings: { speed: 2, accel: 2, turn: 2, armor: 10, mass: 10 }, color:"#cdd9c0" },

  // --- Trains & freight (peu utilisés dans le web prototype mais listés) ---
  { id: "TRAIN",     name: "Train",             size: "train",   seats: 0, class: "rail",     group: "special",hp: null, massKg: 80000,ratings: { speed: 3, accel: 2, turn: 1, armor: 10, mass: 10 }, color:"#cfcfcf" },
  { id: "TRAINCAB",  name: "Train Cab",         size: "train",   seats: 1, class: "rail",     group: "special",hp: null, massKg: 60000,ratings: { speed: 3, accel: 2, turn: 1, armor: 10, mass: 10 }, color:"#cfcfcf" },
  { id: "TRAINFB",   name: "Train FB",          size: "train",   seats: 0, class: "rail",     group: "special",hp: null, massKg: 60000,ratings: { speed: 3, accel: 2, turn: 1, armor: 10, mass: 10 }, color:"#cfcfcf" },

  // --- Truck cab / trailers ---
  { id: "TRUKCAB1",  name: "Truck Cab",         size: "truck",   seats: 2, class: "truck",    group: "service",hp: 220, massKg: 4100, ratings: { speed: 4, accel: 4, turn: 2, armor: 8, mass: 10 }, color:"#f0e1cf" },
  { id: "TRUKCAB2",  name: "Truck Cab SX",      size: "truck",   seats: 2, class: "truck",    group: "service",hp: 240, massKg: 4200, ratings: { speed: 5, accel: 5, turn: 2, armor: 8, mass: 10 }, color:"#f0e1cf" },
  { id: "TRUKCONT",  name: "Container",         size: "trailer", seats: 0, class: "trailer",  group: "service",hp: null, massKg: 7000, ratings: { speed: 1, accel: 1, turn: 1, armor: 10, mass: 10 }, color:"#e6e6e6" },
  { id: "TRUKTRNS",  name: "Transporter",       size: "trailer", seats: 0, class: "trailer",  group: "service",hp: null, massKg: 7600, ratings: { speed: 1, accel: 1, turn: 1, armor: 10, mass: 10 }, color:"#e6e6e6" },

  // --- Special agent (GTA2) ---
  { id: "EDSELFBI",  name: "Special Agent Car", size: "sedan",   seats: 2, class: "special",  group: "special",hp: 240, massKg: 1500, ratings: { speed: 8, accel: 7, turn: 7, armor: 6, mass: 6 }, color:"#d2d2d2" }
];

// Map finale
export const VEHICLE_DEFS = Object.freeze(BASE.map(finalize));

const _byId = new Map(VEHICLE_DEFS.map((d) => [d.id, d]));

/**
 * @param {string} id Enum/script code (ex: "COPCAR", "RTYPE")
 * @returns {ReturnType<typeof finalize>}
 */
export function getVehicleDef(id) {
  const def = _byId.get(id);
  if (!def) throw new Error(`Unknown vehicle id "${id}"`);
  return def;
}

/**
 * Renvoie une liste filtrée (utile pour spawns civils).
 * @param {Partial<{group:string,class:string}>} [f]
 */
export function listVehicleDefs(f = {}) {
  const { group, class: klass } = f;
  return VEHICLE_DEFS.filter((d) => (!group || d.group === group) && (!klass || d.class === klass));
}

/**
 * Choix random, optionnellement filtré.
 * @param {Partial<{group:string}>} [f]
 */
export function pickRandomVehicleId(f = {}) {
  const list = listVehicleDefs(f);
  if (!list.length) return VEHICLE_DEFS[0].id;
  return list[(Math.random() * list.length) | 0].id;
}

// ---------------------------------------------------------------------------
// Paint / livery helpers ("palette-swap" façon GTA2)
// ---------------------------------------------------------------------------
// Objectif:
// - Véhicules civils (trafic PNJ) : même modèle, plusieurs couleurs via palette-swap.
// - Véhicules "spéciaux" (police/taxi/urgences/gangs/food-trucks…) : 1 PNG dédié,
//   donc PAS de palette-swap (paintId = null).

/**
 * Liste de peintures possibles pour le trafic civil.
 * (les noms doivent correspondre à VehicleSpriteBank.PAINTS)
 */
export const VEHICLE_PAINT_IDS = Object.freeze([
  "white",
  "silver",
  "graphite",
  "black",
  "red",
  "orange",
  "yellow",
  "lime",
  "green",
  "teal",
  "blue",
  "navy",
  "purple"
]);

export function pickRandomPaintId() {
  return VEHICLE_PAINT_IDS[(Math.random() * VEHICLE_PAINT_IDS.length) | 0];
}

// Modèles qui doivent rester en livrée fixe (PNG dédié), pas de recolor.
const FIXED_LIVERY = new Set([
  // Taxis / services identifiables
  "TAXI", "STYPE", "STYPECAB",
  "BANKVAN", "TVVAN", "ICECREAM", "HOTDOG", "VESPA",

  // Police / urgences
  "COPCAR", "SWATVAN", "MEDICAR", "FIRETRUK",

  // Gangs / véhicules "signature"
  "KRSNABUS", "MIURA", "STRATOS", "STRATOSB", "WBTWIN",

  // Armored / spéciaux
  "APC", "TANK", "EDSELFBI",

  // Rails / trains
  "TRAIN", "TRAINCAB", "TRAINFB"
]);

/**
 * @param {string} id
 * @returns {boolean} true si le véhicule doit conserver son PNG tel quel.
 */
export function isFixedLiveryVehicleId(id) {
  return FIXED_LIVERY.has(String(id || "").trim());
}
