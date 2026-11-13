// The open-world play field: a disc of open ground holding the two armies, the camp, the tower, the gate, two groves,
// the watch posts and the rocks; their colliders; and the zones that watch or shelter the chariot. Pure data and
// geometry. Units are metres; east is +x and north is −z.
import { formation, PAVILION } from '../bowobharata/stage-math';
import { clamp, dist, type XZ } from './geom';

/** The play disc (centre and radius r), where the soft wall starts, and its push in m/s² at the edge. */
export const PLAY = { cx: 0, cz: -10, r: 160, wall: 150, push: 6 } as const;
export const GAME_WARRIORS = 1024;
/** Metres from the outermost soldier to the edge of the army's collider. */
export const ARMY_PAD = 0.9;
export const SPAWN: Readonly<{ x: number; z: number; yaw: number }> = { x: 0, z: 9, yaw: -Math.PI / 2 };
export const TOWER_EXIT: Readonly<{ x: number; z: number; yaw: number }> = { x: -40, z: 60, yaw: 0 };
export const ANCHORS = {
  tower: { x: -46, z: 52 },
  camp: { x: -100, z: -10 },
  gate: { x: 115, z: -20 },
  groveNW: { x: -84, z: -106 },
  groveSE: { x: 95, z: 65 },
  northEnd: { x: 0, z: -80 },
} as const;
export const TOWER_R = 2.5;
export const RECORD_CIRCLE = 9;
export const GATE_CIRCLE = 5;

export type Collider =
  | { kind: 'box'; id: string; minX: number; maxX: number; minZ: number; maxZ: number; figure: boolean; tall: boolean }
  | { kind: 'circle'; id: string; x: number; z: number; r: number; figure: boolean; tall: boolean };
type Box = Extract<Collider, { kind: 'box' }>;

/** One army's collider: the bounding box of its formation (the scene's seed, 5), grown by ARMY_PAD. */
export function armyZone(side: 'dharma' | 'adharma', count = GAME_WARRIORS): Box {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of formation(count, side, 5)) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return {
    kind: 'box',
    id: `army-${side}`,
    minX: minX - ARMY_PAD,
    maxX: maxX + ARMY_PAD,
    minZ: minZ - ARMY_PAD,
    maxZ: maxZ + ARMY_PAD,
    figure: true,
    tall: false,
  };
}

/** Five tents 12 m from the camp at 60°, 120°, … 300°: the east side is open. */
export const TENTS: XZ[] = Array.from({ length: 5 }, (_, k) => {
  const a = ((60 + 60 * k) * Math.PI) / 180;
  return { x: ANCHORS.camp.x + 12 * Math.cos(a), z: ANCHORS.camp.z + 12 * Math.sin(a) };
});

const GROVE_RING = [
  [6, 6],
  [6, -6],
  [-6, 6],
  [-6, -6],
  [9, 0],
  [-9, 0],
  [0, 9],
  [0, -9],
] as const;
/** Eight trees ringing each grove, the NW grove first, with a clearing at the centre. */
export const TREES: XZ[] = [ANCHORS.groveNW, ANCHORS.groveSE].flatMap((g) => GROVE_RING.map(([dx, dz]) => ({ x: g.x + dx, z: g.z + dz })));

export const POSTS: XZ[] = [
  { x: 32, z: -20 },
  { x: 32, z: -70 },
  { x: 0, z: -62 },
  { x: 45, z: 18 },
  { x: 95, z: -45 },
  { x: 90, z: 20 },
];

const ROCK_CLUSTERS = [
  [-28, 98],
  [30, 100],
  [-120, 50],
  [125, -60],
  [40, -125],
] as const;
const ROCK_CLUSTER = [
  [0, 0, 1.8],
  [3.5, 1.5, 1.2],
  [-2, 3, 1.0],
] as const;
export const ROCKS: { at: XZ; r: number }[] = ROCK_CLUSTERS.flatMap(([cx, cz]) =>
  ROCK_CLUSTER.map(([dx, dz, r]) => ({ at: { x: cx + dx, z: cz + dz }, r })),
);

const GATE_PARTS = [
  ['gate-pylon-n', 113, 117, -28, -25],
  ['gate-pylon-s', 113, 117, -15, -12],
  ['gate-wall-n', 114, 116, -48, -28],
  ['gate-wall-s', 114, 116, -12, 8],
] as const;

function circle(id: string, p: XZ, r: number, tall = false): Collider {
  return { kind: 'circle', id, x: p.x, z: p.z, r, figure: false, tall };
}

/** Everything on the field that the chariot cannot pass through: the two army zones (figures) and 48 more. */
export function staticColliders(count = GAME_WARRIORS): Collider[] {
  return [
    armyZone('dharma', count),
    armyZone('adharma', count),
    circle('mound', PAVILION, 9.5),
    circle('tower', ANCHORS.tower, TOWER_R, true),
    ...GATE_PARTS.map(([id, minX, maxX, minZ, maxZ]): Collider => ({ kind: 'box', id, minX, maxX, minZ, maxZ, figure: false, tall: true })),
    ...TENTS.map((p, k) => circle(`tent-${k}`, p, 2.2)),
    ...TREES.map((p, k) => circle(`tree-${k}`, p, 0.8, true)),
    ...POSTS.map((p, k) => circle(`post-${k}`, p, 0.5)),
    ...ROCKS.map((rock, k) => circle(`rock-${k}`, rock.at, rock.r)),
  ];
}

export type Area = { kind: 'circle'; x: number; z: number; r: number } | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number };

export interface Zone {
  id: string;
  role: 'watch' | 'shelter';
  area: Area;
}

const kurawa = armyZone('adharma');
export const ZONES: Zone[] = [
  ...POSTS.map((p, k): Zone => ({ id: `post-${k}`, role: 'watch', area: { kind: 'circle', x: p.x, z: p.z, r: 28 } })),
  {
    id: 'ranks',
    role: 'watch',
    area: { kind: 'box', minX: kurawa.minX - 10, maxX: kurawa.maxX + 10, minZ: kurawa.minZ - 10, maxZ: kurawa.maxZ + 10 },
  },
  { id: 'gate', role: 'watch', area: { kind: 'circle', ...ANCHORS.gate, r: 25 } },
  { id: 'camp', role: 'shelter', area: { kind: 'circle', ...ANCHORS.camp, r: 22 } },
  { id: 'groveNW', role: 'shelter', area: { kind: 'circle', ...ANCHORS.groveNW, r: 18 } },
  { id: 'groveSE', role: 'shelter', area: { kind: 'circle', ...ANCHORS.groveSE, r: 18 } },
];

/** Inside the area, edges included. */
export function inArea(p: XZ, a: Area): boolean {
  if (a.kind === 'circle') return dist(p, a) <= a.r;
  return p.x >= a.minX && p.x <= a.maxX && p.z >= a.minZ && p.z <= a.maxZ;
}

export function zonesAt(p: XZ): { watched: boolean; shelter: boolean } {
  let watched = false;
  let shelter = false;
  for (const zone of ZONES) {
    if (!inArea(p, zone.area)) continue;
    if (zone.role === 'watch') watched = true;
    else shelter = true;
  }
  return { watched, shelter };
}

/** Distance from p to the collider's edge: negative inside, by the depth to the nearest edge. */
export function distToCollider(p: XZ, c: Collider): number {
  if (c.kind === 'circle') return dist(p, c) - c.r;
  const qx = clamp(p.x, c.minX, c.maxX);
  const qz = clamp(p.z, c.minZ, c.maxZ);
  if (qx !== p.x || qz !== p.z) return Math.hypot(p.x - qx, p.z - qz);
  return -Math.min(p.x - c.minX, c.maxX - p.x, p.z - c.minZ, c.maxZ - p.z);
}

/** The distance from p to the nearest collider (Infinity when there are none). */
export function clearance(p: XZ, cols: readonly Collider[] = staticColliders()): number {
  let least = Infinity;
  for (const c of cols) least = Math.min(least, distToCollider(p, c));
  return least;
}

/** Within the play disc, at least `margin` m inside its edge. */
export function inPlay(p: XZ, margin = 0): boolean {
  return Math.hypot(p.x - PLAY.cx, p.z - PLAY.cz) <= PLAY.r - margin;
}

/** The soft wall's pull toward the centre: 0 inside 150 m, rising linearly to 6 m/s² at 160 m and held there beyond. */
export function softWallAccel(p: XZ): XZ {
  const dx = p.x - PLAY.cx;
  const dz = p.z - PLAY.cz;
  const d = Math.hypot(dx, dz);
  const a = PLAY.push * clamp((d - PLAY.wall) / (PLAY.r - PLAY.wall), 0, 1);
  if (a <= 0) return { x: 0, z: 0 };
  return { x: (-dx / d) * a, z: (-dz / d) * a };
}
