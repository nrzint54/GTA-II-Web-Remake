import { aabb } from "./AABB.js";

/**
 * OBB (Oriented Bounding Box) helpers.
 *
 * Objectif (GTA2-like):
 * - Les véhicules (et copcars) utilisent une hitbox orientée (OBB) pour collisions entité↔entité.
 * - La broadphase reste en AABB via l'AABB englobant l'OBB (SpatialHash).
 *
 * Convention:
 * - (cx, cy) = centre world
 * - (hx, hy) = demi-tailles
 * - (ux, uy) = axe local X (unitaire)
 * - (vx, vy) = axe local Y (unitaire, perpendiculaire)
 */

/** Angle de collision = angle + éventuel offset (ex: sprites GTA2 base "vers le haut"). */
export function getCollisionAngle(e) {
  const base = Number.isFinite(e?.angle) ? e.angle : 0;
  const off = Number.isFinite(e?.collisionAngleOffset) ? e.collisionAngleOffset : 0;
  return base + off;
}

/** Construit un OBB à partir d'une entité. */
export function entityOBB(e) {
  const ang = getCollisionAngle(e);
  const c = Math.cos(ang);
  const s = Math.sin(ang);

  const sx = Number.isFinite(e?.collisionScaleX) ? e.collisionScaleX : 1;
  const sy = Number.isFinite(e?.collisionScaleY) ? e.collisionScaleY : 1;

  const hx = ((e?.w ?? 0) * 0.5) * sx;
  const hy = ((e?.h ?? 0) * 0.5) * sy;

  // Axes locaux (rotation standard).
  // Note: sur Canvas (y vers le bas), cos/sin restent cohérents.
  const ux = c;
  const uy = s;
  const vx = -s;
  const vy = c;

  return {
    cx: e?.x ?? 0,
    cy: e?.y ?? 0,
    hx,
    hy,
    ux,
    uy,
    vx,
    vy
  };
}

/** Représente une AABB "axis-aligned" sous forme d'OBB (angle=0). */
export function aabbAsOBBFromEntity(e) {
  const sx = Number.isFinite(e?.collisionScaleX) ? e.collisionScaleX : 1;
  const sy = Number.isFinite(e?.collisionScaleY) ? e.collisionScaleY : 1;
  const hx = ((e?.w ?? 0) * 0.5) * sx;
  const hy = ((e?.h ?? 0) * 0.5) * sy;
  return {
    cx: e?.x ?? 0,
    cy: e?.y ?? 0,
    hx,
    hy,
    ux: 1,
    uy: 0,
    vx: 0,
    vy: 1
  };
}

/** Convertit un OBB en AABB englobante (broadphase). */
export function obbToAABB(o) {
  const ex = Math.abs(o.ux) * o.hx + Math.abs(o.vx) * o.hy;
  const ey = Math.abs(o.uy) * o.hx + Math.abs(o.vy) * o.hy;
  return aabb(o.cx - ex, o.cy - ey, ex * 2, ey * 2);
}

/** AABB broadphase d'une entité OBB. */
export function entityBroadphaseAABB(e) {
  return obbToAABB(entityOBB(e));
}

/**
 * MTV OBB vs OBB via SAT.
 * Retourne un vecteur {x,y} à appliquer à A pour la sortir de B, ou null.
 */
export function computeOBBMTV(a, b) {
  const axes = [
    { x: a.ux, y: a.uy },
    { x: a.vx, y: a.vy },
    { x: b.ux, y: b.uy },
    { x: b.vx, y: b.vy }
  ];

  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;

  let minOverlap = Infinity;
  let bestAxis = null;
  let bestSign = 1;

  for (const ax of axes) {
    let nx = ax.x;
    let ny = ax.y;
    const len = Math.hypot(nx, ny);
    if (len < 1e-8) continue;
    nx /= len;
    ny /= len;

    const dist = Math.abs(dx * nx + dy * ny);

    const ra =
      a.hx * Math.abs(a.ux * nx + a.uy * ny) +
      a.hy * Math.abs(a.vx * nx + a.vy * ny);

    const rb =
      b.hx * Math.abs(b.ux * nx + b.uy * ny) +
      b.hy * Math.abs(b.vx * nx + b.vy * ny);

    const overlap = ra + rb - dist;
    if (overlap <= 0) return null; // séparés

    if (overlap < minOverlap) {
      minOverlap = overlap;
      bestAxis = { x: nx, y: ny };
      const dir = dx * nx + dy * ny;
      // Si B est du côté +axis, on pousse A vers -axis.
      bestSign = dir >= 0 ? -1 : 1;
    }
  }

  if (!bestAxis || !Number.isFinite(minOverlap)) return null;
  return {
    x: bestAxis.x * minOverlap * bestSign,
    y: bestAxis.y * minOverlap * bestSign
  };
}
