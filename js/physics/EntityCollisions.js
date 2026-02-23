import { intersects } from "./AABB.js";
import { aabbAsOBBFromEntity, computeOBBMTV, entityOBB } from "./OBB.js";

/**
 * Résout les collisions AABB entre entités (broadphase via spatial hash).
 *
 * - Détection: AABB vs AABB
 * - Résolution: Minimum Translation Vector (MTV)
 * - Répartition: selon invMass (invMass=0 => immobile)
 * - Post: amortissement de vitesse + hooks onCollide
 *
 * V8_b:
 * - Dégâts véhicule↔véhicule / véhicule↔mur simulés :
 *   ici on ajoute aussi des dégâts sur chocs entre entités (véhicules entre eux / véhicule sur ped etc.)
 */
export function resolveEntityCollisions({ entities, spatial, dt }) {
  if (!spatial) return;

  for (const a of entities) {
    if (!a) continue;

    const candidates = spatial.queryAABB(a.hitbox());
    for (const b of candidates) {
      if (!b || a === b) continue;

      // éviter double résolution (ordre stable)
      if (a.id != null && b.id != null && a.id > b.id) continue;

      if (!a.solid || !b.solid) continue;
      if (!shouldCollide(a, b)) continue;

      const boxA = a.hitbox();
      const boxB = b.hitbox();
      if (!intersects(boxA, boxB)) continue;

      // Narrowphase:
      // - défaut: AABB vs AABB (legacy)
      // - véhicules/copcars: OBB via SAT (GTA2-like)
      const aUsesOBB = usesOBB(a);
      const bUsesOBB = usesOBB(b);

      const mtv = (!aUsesOBB && !bUsesOBB)
        ? computeMTV(boxA, boxB)
        : computeOBBMTV(
            aUsesOBB ? entityOBB(a) : aabbAsOBBFromEntity(a),
            bUsesOBB ? entityOBB(b) : aabbAsOBBFromEntity(b)
          );
      if (!mtv) continue;

      // séparation partagée
      const totalInvMass = (a.invMass ?? 1) + (b.invMass ?? 1);
      const aShare = totalInvMass > 0 ? (a.invMass ?? 1) / totalInvMass : 0.5;
      const bShare = totalInvMass > 0 ? (b.invMass ?? 1) / totalInvMass : 0.5;

      a.x += mtv.x * aShare;
      a.y += mtv.y * aShare;
      b.x -= mtv.x * bShare;
      b.y -= mtv.y * bShare;

      applyVelocityDamping(a, b, mtv, dt);
      applyVehicleImpactDamage(a, b, mtv, dt);

      // hooks gameplay
      a.onCollide?.(b, mtv, dt);
      b.onCollide?.(a, { x: -mtv.x, y: -mtv.y }, dt);
    }
  }
}

function shouldCollide(a, b) {
  // civils entre eux: on désactive (évite les "boulettes" de peds)
  if (a.kind === "ped" && b.kind === "ped") return false;
  return true;
}

function usesOBB(e) {
  if (!e) return false;
  if (e.collisionShape === "obb") return true;
  // fallback (au cas où une vieille version ne poserait pas collisionShape)
  return e.kind === "vehicle" || e.kind === "copcar";
}

/**
 * MTV (Minimum Translation Vector) pour sortir A de B.
 * Retourne {x,y} (pousse A) ou null.
 */
function computeMTV(a, b) {
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.w, by2 = b.y + b.h;

  const overlapX1 = bx2 - ax1; // pousser A vers +x
  const overlapX2 = ax2 - bx1; // pousser A vers -x
  const overlapY1 = by2 - ay1; // pousser A vers +y
  const overlapY2 = ay2 - by1; // pousser A vers -y

  if (overlapX1 <= 0 || overlapX2 <= 0 || overlapY1 <= 0 || overlapY2 <= 0) return null;

  const minX = Math.min(overlapX1, overlapX2);
  const minY = Math.min(overlapY1, overlapY2);

  if (minX < minY) {
    return overlapX1 < overlapX2 ? { x: overlapX1, y: 0 } : { x: -overlapX2, y: 0 };
  }
  return overlapY1 < overlapY2 ? { x: 0, y: overlapY1 } : { x: 0, y: -overlapY2 };
}

function applyVelocityDamping(a, b, mtv, dt) {
  // Réponse collision "normal-based" (plus stable avec OBB qu'un damping par axes).
  if (!dt) dt = 0.016;

  const len = Math.hypot(mtv.x ?? 0, mtv.y ?? 0);
  if (len < 1e-6) return;
  const nx = (mtv.x ?? 0) / len;
  const ny = (mtv.y ?? 0) / len;

  const invA = a.invMass ?? 1;
  const invB = b.invMass ?? 1;
  const invSum = invA + invB;
  if (invSum <= 0) return;

  const avx = a.vx ?? 0, avy = a.vy ?? 0;
  const bvx = b.vx ?? 0, bvy = b.vy ?? 0;

  const rvx = avx - bvx;
  const rvy = avy - bvy;

  const vn = rvx * nx + rvy * ny;
  // si déjà en séparation, on n'ajoute pas d'impulsion
  if (vn > 0) return;

  // petite restitution (GTA2-like: bounce léger mais amorti)
  const restitution = 0.05;
  const j = -(1 + restitution) * vn / invSum;

  a.vx = avx + nx * j * invA;
  a.vy = avy + ny * j * invA;
  b.vx = bvx - nx * j * invB;
  b.vy = bvy - ny * j * invB;

  // friction tangentielle (évite le "glissement" infini)
  const tx = -ny;
  const ty = nx;
  const vt = rvx * tx + rvy * ty;
  const mu = 0.22;
  let jt = -vt / invSum;
  const maxJt = Math.abs(j) * mu;
  jt = clamp(jt, -maxJt, maxJt);

  a.vx += tx * jt * invA;
  a.vy += ty * jt * invA;
  b.vx -= tx * jt * invB;
  b.vy -= ty * jt * invB;

  // damping global minime
  const damp = 0.985;
  a.vx *= damp;
  a.vy *= damp;
  b.vx *= damp;
  b.vy *= damp;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/**
 * Dégâts sur impacts impliquant des véhicules.
 * On utilise la vitesse relative projetée sur la normale de collision.
 */
function applyVehicleImpactDamage(a, b, mtv, dt) {
  const aIsCar = a.kind === "vehicle" || a.kind === "copcar";
  const bIsCar = b.kind === "vehicle" || b.kind === "copcar";
  if (!aIsCar && !bIsCar) return;

  // Cibles "molles": piétons civils, cops à pied, joueur à pied.
  // (Le joueur n'est plus solide quand il est dans un véhicule, donc pas de collision dans ce cas.)
  const isSoftTarget = (e) => e && (e.kind === "ped" || e.kind === "copped" || e.kind === "player");

  const nx0 = mtv.x ?? 0;
  const ny0 = mtv.y ?? 0;
  const nLen = Math.hypot(nx0, ny0) || 1;
  const nx = nx0 / nLen;
  const ny = ny0 / nLen;

  const rvx = (a.vx ?? 0) - (b.vx ?? 0);
  const rvy = (a.vy ?? 0) - (b.vy ?? 0);
  const relN = Math.abs(rvx * nx + rvy * ny);

  // cooldown pour éviter multi-hit en overlap
  a._carHitCd = Math.max(0, (a._carHitCd ?? 0) - (dt ?? 0.016));
  b._carHitCd = Math.max(0, (b._carHitCd ?? 0) - (dt ?? 0.016));

  // ------------------------------------------------------------
  // 1) Véhicule ↔ Véhicule : dégâts des deux côtés
  // ------------------------------------------------------------
  if (aIsCar && bIsCar) {
    const minRelCar = 140;
    if (relN < minRelCar) return;

    const scaleCar = 0.06; // tuning
    const dmgCar = Math.floor(relN * scaleCar);

    if ((a._carHitCd ?? 0) === 0) {
      a.health = Math.max(0, (a.health ?? 120) - dmgCar);
      a._carHitCd = 0.10;
    }
    if ((b._carHitCd ?? 0) === 0) {
      b.health = Math.max(0, (b.health ?? 120) - dmgCar);
      b._carHitCd = 0.10;
    }
    return;
  }

  // ------------------------------------------------------------
  // 2) Véhicule ↔ Piéton/CopPed/Joueur : "run over" damage
  // ------------------------------------------------------------
  const applyRunOver = (car, victim) => {
    if (!isSoftTarget(victim)) return;
    if (victim.dead === true) return;
    if ((victim.health ?? 1) <= 0) return;
    if ((victim._carHitCd ?? 0) > 0) return;

    // Seuil plus bas que véhicule↔véhicule: un run-over doit faire très mal.
    const minRelSoft = 80;
    if (relN < minRelSoft) return;

    // Dégâts: à ~200 de relN on KO un civil (40hp). Pour coller au feeling GTA2,
    // un CopPed n'est pas "invincible": on applique un multiplicateur pour qu'il
    // tombe à vitesse comparable.
    const scaleSoft = 0.25;
    const kindMul = victim.kind === "copped" ? 1.5 : 1.0;
    const dmgSoft = Math.max(1, Math.floor((relN - 50) * scaleSoft * kindMul));

    // Applique dégâts
    victim.health = Math.max(0, (victim.health ?? 40) - dmgSoft);
    victim._carHitCd = 0.18;

    // Panique (si applicable)
    victim.panicFrom?.(car.x, car.y, 2.0);

    // Wanted si le conducteur est le joueur (GTA2-like)
    const driver = car.driver;
    if (driver && driver.kind === "player") {
      const add = victim.kind === "copped" ? 2 : 1;
      driver.wanted = Math.min(5, Math.max(0, Math.floor(driver.wanted ?? 0) + add));
    }
  };

  if (aIsCar) applyRunOver(a, b);
  if (bIsCar) applyRunOver(b, a);
}
