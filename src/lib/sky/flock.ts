import { mulberry32 } from './rng';
import type { SkyState, Vec3 } from './states';

export interface Bird extends Vec3 { vx: number; vy: number; vz: number }
export interface FlockParams {
  separation: number; alignment: number; cohesion: number; targetWeight: number;
  maxSpeed: number; neighborRadius: number; separationRadius: number;
}

export const DEFAULT_FLOCK: FlockParams = {
  separation: 1.6, alignment: 1.2, cohesion: 0.5, targetWeight: 0.9,
  maxSpeed: 3.2, neighborRadius: 2.2, separationRadius: 0.7,
};

export function makeFlock(count: number, seed: number, radius = 3): Bird[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: (rnd() - 0.5) * radius * 2, y: (rnd() - 0.5) * radius, z: (rnd() - 0.5) * radius * 2,
    vx: rnd() - 0.5, vy: (rnd() - 0.5) * 0.2, vz: rnd() - 0.5,
  }));
}

export function stepFlock(birds: readonly Bird[], targets: readonly Vec3[], p: FlockParams, dt: number): Bird[] {
  const nr2 = p.neighborRadius * p.neighborRadius;
  const sr2 = p.separationRadius * p.separationRadius;
  return birds.map((b, i) => {
    let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, n = 0;
    for (let j = 0; j < birds.length; j++) {
      if (j === i) continue;
      const o = birds[j];
      const dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < nr2) {
        n += 1; ax += o.vx; ay += o.vy; az += o.vz; cx += o.x; cy += o.y; cz += o.z;
        if (d2 < sr2 && d2 > 1e-9) { sx -= dx / d2; sy -= dy / d2; sz -= dz / d2; }
      }
    }
    let vx = b.vx, vy = b.vy, vz = b.vz;
    if (n > 0) {
      vx += ((ax / n - b.vx) * p.alignment + (cx / n - b.x) * p.cohesion) * dt;
      vy += ((ay / n - b.vy) * p.alignment + (cy / n - b.y) * p.cohesion) * dt;
      vz += ((az / n - b.vz) * p.alignment + (cz / n - b.z) * p.cohesion) * dt;
    }
    vx += sx * p.separation * dt; vy += sy * p.separation * dt; vz += sz * p.separation * dt;
    const t = targets[i];
    vx += (t.x - b.x) * p.targetWeight * dt; vy += (t.y - b.y) * p.targetWeight * dt; vz += (t.z - b.z) * p.targetWeight * dt;
    const speed = Math.hypot(vx, vy, vz);
    if (speed > p.maxSpeed) { const k = p.maxSpeed / speed; vx *= k; vy *= k; vz *= k; }
    return { x: b.x + vx * dt, y: b.y + vy * dt, z: b.z + vz * dt, vx, vy, vz };
  });
}

export function birdTarget(state: SkyState, i: number, time: number): Vec3 {
  if (state === 'status') return { x: ((i % 7) - 3) * 0.8, y: 3, z: -2 };
  const a = time * 0.25 + i * 0.37;
  const r = 3.4 + (i % 5) * 0.55;
  return { x: Math.cos(a) * r, y: 0.6 + (i % 6) * 0.35 + Math.sin(time * 0.5 + i) * 0.25, z: Math.sin(a) * r };
}
