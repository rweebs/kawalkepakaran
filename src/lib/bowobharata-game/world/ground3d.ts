// Ground detail round the chariot: grass tufts on a fixed 5 m grid in a ring that follows it (a cell's tuft is always the
// same, so tufts stay where they are as the ring moves on), and the dust its wheels raise. No tuft on the armies' field,
// by the mound or in a landmark.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAVILION, groundHeight } from '../../bowobharata/stage-math';
import { grassTexture } from '../../bowobharata/scene/dressing';
import { FIELD } from '../../bowobharata/scene/dressing-layout';
import { fxLayer } from '../../bowobharata/scene/effects';
import { mulberry32 } from '../../sky/rng';
import { clamp, forward, rightOf, smoothstep } from '../geom';
import { speedOf, type ChariotState } from '../drive';
import { clearance, staticColliders } from '../world';
import type { Layer, SceneGame } from './types';

/**
 * The tufts' grid (m); the ring round the chariot (m) and the most tufts it shows, on desktops and on phones (wherever it
 * is centred, a ring of 28 m meets at most 128 cells and one of 40 m at most 241); and how far a tuft keeps from a landmark (m).
 */
export const TUFTS = {
  cell: 5,
  desktop: { radius: 40, cap: 320 },
  phone: { radius: 28, cap: 140 },
  clear: 1,
} as const;
/** Metres round the mound kept clear, as the page's dressing keeps it. */
const MOUND_CLEAR = 12;
/**
 * The wheel dust: at most `max` motes of `life` s each. A mote fades in over `fadeIn` s to at most `peak` and out over the
 * rest of its life, so none changes faster than 2 Hz. The wheels raise `rate` motes a second at `full` m/s, none below
 * `from`, and half as many again in a slide; `drift` is the wind's pull east (m/s), as the page's dust drifts.
 */
export const DUST = { max: 64, life: 1.2, fadeIn: 0.3, peak: 0.32, rate: 36, from: 3, full: 12, slide: 1.5, size: 1.3, drift: 0.25 } as const;
/** The wheels stand this far either side of the chariot's centre line (m), on an axle this far behind its origin. */
const WHEEL = { across: 1.08, back: -0.2 } as const;
/** The longest step of scene time the dust takes in one sync (s). */
const MAX_STEP = 0.1;

/** The cells of a `cell` m grid that come within `radius` of (cx, cz): their centres are at most half a diagonal further. */
export function ringCells(cx: number, cz: number, radius: number, cell: number): { i: number; j: number }[] {
  const out: { i: number; j: number }[] = [];
  for (let i = Math.floor((cx - radius) / cell); i <= Math.floor((cx + radius) / cell); i++) {
    for (let j = Math.floor((cz - radius) / cell); j <= Math.floor((cz + radius) / cell); j++) {
      const nx = clamp(cx, i * cell, (i + 1) * cell);
      const nz = clamp(cz, j * cell, (j + 1) * cell);
      if (Math.hypot(nx - cx, nz - cz) <= radius) out.push({ i, j });
    }
  }
  return out;
}

/** A seed for a cell's own random stream, from its indices. */
function cellSeed(i: number, j: number, salt = 0): number {
  return (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ salt) >>> 0;
}
const TINT_SALT = 0x5bd1e995;

/** The tuft of cell (i, j) of the TUFTS grid: jittered inside the cell, its size and its turn, the same every time. */
export function cellTuft(i: number, j: number): { x: number; z: number; scale: number; turn: number } {
  const rnd = mulberry32(cellSeed(i, j));
  return {
    x: (i + 0.1 + 0.8 * rnd()) * TUFTS.cell,
    z: (j + 0.1 + 0.8 * rnd()) * TUFTS.cell,
    scale: 0.7 + 0.6 * rnd(),
    turn: rnd() * Math.PI * 2,
  };
}

/** On the armies' field (FIELD, edges included) or within 12 m of the mound: where no tuft grows. */
export function inField(x: number, z: number): boolean {
  if (x >= FIELD.minX && x <= FIELD.maxX && z >= FIELD.minZ && z <= FIELD.maxZ) return true;
  return Math.hypot(x - PAVILION.x, z - PAVILION.z) <= MOUND_CLEAR;
}

/** The mote's opacity at `age`: a rise over DUST.fadeIn and a fall over its life, 0 once it is spent. */
function moteAlpha(age: number): number {
  if (age >= DUST.life) return 0;
  return DUST.peak * Math.min(1, age / DUST.fadeIn) * (1 - age / DUST.life);
}

export function createGround(game: SceneGame, mobile: boolean): Layer {
  const ring = mobile ? TUFTS.phone : TUFTS.desktop;
  const group = new THREE.Group();
  group.name = 'ground-detail';
  game.root.add(group);

  // The page's tuft: two crossed alpha-cut planes of grass, on the effect layer as the page's are (see FX_LAYER).
  const blade = new THREE.PlaneGeometry(1.5, 1.2).translate(0, 0.6, 0);
  const cross = mergeGeometries([blade, blade.clone().rotateY(Math.PI / 2)])!;
  const grass = grassTexture();
  const tuftMat = new THREE.MeshStandardMaterial({ map: grass, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
  const tufts = fxLayer(new THREE.InstancedMesh(cross, tuftMat, ring.cap));
  tufts.name = 'ground-tufts';
  tufts.count = 0;
  tufts.frustumCulled = false;
  group.add(tufts);
  const solid = staticColliders().filter((c) => !c.figure);
  const d = new THREE.Object3D();
  const tint = new THREE.Color();
  let cell: { i: number; j: number } | null = null;

  /** Lays the ring round the chariot's cell, when it has moved to another cell. */
  function placeTufts(car: ChariotState) {
    const i = Math.floor(car.x / TUFTS.cell);
    const j = Math.floor(car.z / TUFTS.cell);
    if (!Number.isFinite(i) || !Number.isFinite(j) || (cell && cell.i === i && cell.j === j)) return;
    cell = { i, j };
    const cx = (i + 0.5) * TUFTS.cell;
    const cz = (j + 0.5) * TUFTS.cell;
    let n = 0;
    for (const c of ringCells(cx, cz, ring.radius, TUFTS.cell)) {
      if (n === ring.cap) break;
      const t = cellTuft(c.i, c.j);
      if (Math.hypot(t.x - cx, t.z - cz) > ring.radius || inField(t.x, t.z) || clearance(t, solid) < TUFTS.clear) continue;
      d.position.set(t.x, groundHeight(t.x, t.z) - 0.05, t.z);
      d.rotation.set(0, t.turn, 0);
      d.scale.setScalar(t.scale);
      d.updateMatrix();
      tufts.setMatrixAt(n, d.matrix);
      const rnd = mulberry32(cellSeed(c.i, c.j, TINT_SALT));
      tufts.setColorAt(n, tint.setHSL(0.13 + rnd() * 0.05, 0.25 + rnd() * 0.2, 0.55 + rnd() * 0.3));
      n++;
    }
    tufts.count = n;
    tufts.instanceMatrix.needsUpdate = true;
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
  }

  // The dust: soft points tinted like the page's dust, each with its own opacity in the colour's alpha.
  const pos = new Float32Array(DUST.max * 3);
  const rgba = new Float32Array(DUST.max * 4).fill(1);
  for (let k = 0; k < DUST.max; k++) rgba[k * 4 + 3] = 0;
  // Each mote's velocity and age stay on the CPU, in full precision.
  const vel = new Float64Array(DUST.max * 3);
  const age = new Float64Array(DUST.max).fill(DUST.life);
  const dustGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  const colAttr = new THREE.BufferAttribute(rgba, 4);
  dustGeo.setAttribute('position', posAttr);
  dustGeo.setAttribute('color', colAttr);
  const dustMat = new THREE.PointsMaterial({
    map: game.textures.soft, color: '#a98d6a', size: DUST.size, transparent: true, depthWrite: false, vertexColors: true,
  });
  const dust = fxLayer(new THREE.Points(dustGeo, dustMat));
  dust.name = 'wheel-dust';
  dust.frustumCulled = false;
  group.add(dust);
  const rnd = mulberry32(17);
  let owed = 0;
  let side = 1;
  let next = 0;
  let lastTime: number | null = null;

  /** One mote behind a wheel, the two in turn, kicked back and up; none while every mote is still in the air. */
  function raise(car: ChariotState) {
    for (let n = 0; n < DUST.max; n++) {
      const k = (next + n) % DUST.max;
      if (age[k] < DUST.life) continue;
      next = (k + 1) % DUST.max;
      side = -side;
      const f = forward(car.yaw);
      const r = rightOf(car.yaw);
      const back = WHEEL.back - 0.2 - rnd() * 0.5;
      const across = side * (WHEEL.across + (rnd() - 0.5) * 0.3);
      const x = car.x + f.x * back + r.x * across;
      const z = car.z + f.z * back + r.z * across;
      pos.set([x, groundHeight(x, z) + 0.2, z], k * 3);
      const kick = 0.6 + rnd() * 0.8;
      const out = side * rnd() * 0.5;
      vel.set([-f.x * kick + r.x * out + DUST.drift, 0.4 + rnd() * 0.5, -f.z * kick + r.z * out], k * 3);
      age[k] = 0;
      return;
    }
  }

  function stepDust(car: ChariotState, dt: number) {
    const drag = Math.exp(-1.6 * dt);
    for (let k = 0; k < DUST.max; k++) {
      if (age[k] >= DUST.life) continue;
      age[k] = Math.min(DUST.life, age[k] + dt);
      for (let a = k * 3; a < k * 3 + 3; a++) {
        pos[a] += vel[a] * dt;
        vel[a] *= drag;
      }
    }
    const pace = Math.abs(speedOf(car));
    owed += DUST.rate * smoothstep(DUST.from, DUST.full, Number.isFinite(pace) ? pace : 0) * (car.drifting ? DUST.slide : 1) * dt;
    while (owed >= 1) {
      owed -= 1;
      raise(car);
    }
    for (let k = 0; k < DUST.max; k++) rgba[k * 4 + 3] = moteAlpha(age[k]);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  return {
    sync(s, time) {
      placeTufts(s.car);
      const dt = lastTime === null || !Number.isFinite(time) ? 0 : clamp(time - lastTime, 0, MAX_STEP);
      if (Number.isFinite(time)) lastTime = time;
      stepDust(s.car, dt);
    },
    dispose() {
      game.root.remove(group);
      tufts.dispose();
      for (const x of [cross, dustGeo]) x.dispose();
      for (const m of [tuftMat, dustMat]) m.dispose();
      grass.dispose();
    },
  };
}
