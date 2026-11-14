// The game's riders on the drivable chariot: Krishna at the reins and Arjuna behind him, sculpted procedural bodies in
// costume, read from the chase camera (backs, shoulders, crowns and cloth from behind and above at 8–13 m) and from the side
// in the intro and lakon shots. Static parts are merged per material and per moving group: the body, the breathing chest and
// the turning head. Only the cloth ends (scarf and sashes) are chains of their own.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hangingChain, loft, type Radii } from './anatomy';
import type { ChariotMotion } from './chariot';
import type { SceneContext } from './effects';
import { paint } from './rig';

type V3 = THREE.Vector3;
type Joint = readonly [number, number, number];
/** Shoulder, elbow and wrist of each arm in the figure's standing coordinates (KRISHNA_ARMS and ARJUNA_ARMS in chariot.ts). */
export interface RiderArms { left: readonly Joint[]; right: readonly Joint[] }

const TAU = Math.PI * 2;
const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const v3 = (j: Joint) => new THREE.Vector3(j[0], j[1], j[2]);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (a: number, b: number, t: number) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k); };
const gauss = (d: number, w: number) => Math.exp(-(d / w) * (d / w));
/** A fixed hash of an integer into [0, 1): the riders' only jitter. */
const hash = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// Colours. Krishna: deep blue skin, yellow silk (pitambara), a blue scarf, a maroon sash. Arjuna: warm brown skin, silver
// armour trimmed in gold, a crimson dhoti, a saffron sash.
const C = {
  krishnaSkin: '#2f4c8c', krishnaLips: '#5a2f52', arjunaSkin: '#b07e5a', arjunaLips: '#7e4536',
  hair: '#120c0a', eye: '#0d0a0c',
  pitambara: '#f0b62a', scarf: '#1e3c96', sash: '#7a1424', crimson: '#8a1f2c', saffron: '#e8892a',
  gold: '#d4a24a', paleGold: '#e8c46a', ruby: '#a8142a', emerald: '#13804a', sapphire: '#1f3fae',
  // Arjuna's kavacha: polished steel, darker than cloth-white, so the light it catches reads as metal; the kilt's deep folds.
  steel: '#b3bbc6', crimsonFold: '#5e1119',
  // The peacock feather, from its bronze-green vane in to the eye's dark heart.
  vane: '#3d6b2a', barb: '#5e7f2c', eyeGold: '#c9a43a', eyeTeal: '#1aa59a', eyeBlue: '#1b2c8f', quill: '#e6dcc0',
} as const;
/** The garland's flowers, round and round: white, red, marigold, violet and rose. */
const FLOWERS = ['#f4efe0', '#c8263a', '#f2a516', '#5a3fa0', '#e57aa0'] as const;

/** One set per scene, shared by both riders: matte (skin, hair, flowers), metal (gold, the gems), steel (armour) and silk. */
function riderMaterials() {
  return {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.85, emissive: '#3a2408', emissiveIntensity: 0.35 }),
    steel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.92 }),
    silk: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color('#fff0c8'), sheenRoughness: 0.5 }),
  };
}
type Mats = ReturnType<typeof riderMaterials>;

// ---------------------------------------------------------------- geometry helpers (build time only)

/** Paints every vertex one colour and drops the texture coordinates, so parts of one material merge into one geometry. */
function tint<G extends THREE.BufferGeometry>(geo: G, hex: string): G {
  geo.deleteAttribute('uv');
  return paint(geo, hex);
}

const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const M4 = new THREE.Matrix4();
const ONE = vec(1, 1, 1);
const UP = vec(0, 1, 0);
/** Moves a part to (x, y, z), turned by the Euler angles (rx, ry, rz). */
function place<G extends THREE.BufferGeometry>(geo: G, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): G {
  return geo.applyMatrix4(M4.compose(vec(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), ONE));
}
/** Moves a part built along +y to `at`, its +y turned to `dir`. */
function aim<G extends THREE.BufferGeometry>(geo: G, at: V3, dir: V3): G {
  return geo.applyMatrix4(M4.compose(at, Q.setFromUnitVectors(UP, dir.clone().normalize()), ONE));
}
const ellipsoid = (rx: number, ry: number, rz: number, ws = 12, hs = 8) => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);

/** The parts as one geometry; the parts are disposed. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return geo;
}

/**
 * A surface closed round its length: rows + 1 rings of `cols` points from at(v, u) (v along, u around, both 0..1; u = 0 is
 * the front, +x, turning towards +z), indexed so the seam is shared and shades smooth. `colour` paints by (v, u).
 */
function surface(rows: number, cols: number, at: (v: number, u: number, out: V3) => void, colour: (v: number, u: number) => string): THREE.BufferGeometry {
  const pos = new Float32Array((rows + 1) * cols * 3);
  const col = new Float32Array((rows + 1) * cols * 3);
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let r = 0; r <= rows; r++) {
    for (let k = 0; k < cols; k++) {
      const i = (r * cols + k) * 3;
      at(r / rows, k / cols, p);
      pos[i] = p.x; pos[i + 1] = p.y; pos[i + 2] = p.z;
      c.set(colour(r / rows, k / cols));
      col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const a = r * cols + k;
      const b = r * cols + ((k + 1) % cols);
      idx.push(a, a + cols, b, b, a + cols, b + cols);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Catmull-Rom through four values. */
function cr(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t2 * t);
}
/** Column `col` of a table of rings keyed by height (column 0), read smoothly at height y. */
function keyed(keys: readonly (readonly number[])[], y: number, col: number): number {
  let i = 0;
  while (i < keys.length - 2 && y > keys[i + 1][0]) i++;
  const t = clamp01((y - keys[i][0]) / (keys[i + 1][0] - keys[i][0]));
  return cr(keys[Math.max(0, i - 1)][col], keys[i][col], keys[i + 1][col], keys[Math.min(keys.length - 1, i + 2)][col], t);
}
/** A superellipse's offset at angle phi: n = 2 is an ellipse, larger is squarer. */
const superCos = (phi: number, n: number) => { const c = Math.cos(phi); return Math.sign(c) * Math.abs(c) ** (2 / n); };
const superSin = (phi: number, n: number) => { const s = Math.sin(phi); return Math.sign(s) * Math.abs(s) ** (2 / n); };

/**
 * A ribbon of cloth along a smooth curve through `pts`, `width(t)` across and `thick` through, lying flat against a body whose
 * outward normal near a point is `out(point, result)`. Closed round its thin edge, so it shows from both sides.
 */
function ribbon(pts: V3[], width: (t: number) => number, thick: number, out: (p: V3, o: V3) => void, rows: number, hex: string, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const W = new THREE.Vector3();
  let last = -1;
  return surface(rows, 6, (v, u, o) => {
    if (v !== last) {
      last = v;
      curve.getPointAt(v, P);
      curve.getTangentAt(v, T);
      out(P, N);
      W.crossVectors(T, N).normalize();
      N.crossVectors(W, T).normalize();
    }
    const a = u * TAU;
    o.copy(P).addScaledVector(W, Math.cos(a) * width(v) * 0.5).addScaledVector(N, Math.sin(a) * thick * 0.5);
  }, () => hex);
}

/** A limb or lock of hair: `loft` along `pts`, painted. */
const limb = (pts: V3[], radii: Radii[], rings: number, radial: number, hex: string) => tint(loft(pts, radii, rings, radial), hex);

// ---------------------------------------------------------------- bodies

/** Detail per tier: desktop or phone. */
interface Tier { hi: boolean }
const seg = (t: Tier, desk: number, phone: number) => (t.hi ? desk : phone);

/** The head's centre in the figure's standing coordinates, where the crown and hair were authored; the head turns about it. */
const HEAD = [0.015, 1.7, 0] as const;

/**
 * The torso's rings, hips to neck: [height, centre x, depth in front, depth behind, half-width, squareness]. A lion waist
 * under a broad chest. The back stays flat: where the prabha's spikes sweep behind Krishna (y 1.25–1.41) it keeps to x −0.065
 * or forward, the edge of their bases, so at most a breath brushes them.
 */
const TORSO = [
  [0.84, 0, 0.1, 0.1, 0.16, 2.2],
  [0.95, 0.008, 0.094, 0.084, 0.135, 2.2],
  [1.05, 0.012, 0.104, 0.078, 0.142, 2.3],
  [1.17, 0.012, 0.118, 0.075, 0.168, 2.5],
  [1.28, 0.012, 0.124, 0.074, 0.194, 2.7],
  [1.37, 0.008, 0.112, 0.072, 0.206, 2.7],
  [1.44, 0, 0.085, 0.066, 0.18, 2.4],
  [1.5, 0, 0.06, 0.056, 0.1, 2],
  [1.56, 0.004, 0.05, 0.048, 0.058, 2],
] as const;

/** A point on the torso, `grow` m out from the skin (armour, a sash): build widens it, depth deepens it. */
function torsoAt(y: number, phi: number, build: number, depth: number, grow: number, o: V3): V3 {
  const n = keyed(TORSO, y, 5);
  const c = Math.cos(phi);
  const a = phi > Math.PI ? phi - TAU : phi;
  let x = keyed(TORSO, y, 1) + ((c >= 0 ? keyed(TORSO, y, 2) : keyed(TORSO, y, 3)) * depth + grow) * superCos(phi, n);
  if (c > 0) {
    // The chest, with a crisp lower edge, and a firm abdomen.
    const pec = (gauss(a - 0.55, 0.42) + gauss(a + 0.55, 0.42)) * (y > 1.27 ? gauss(y - 1.27, 0.08) : gauss(y - 1.27, 0.035));
    x += (0.016 * build * pec + 0.008 * gauss(a, 0.5) * gauss(y - 1.06, 0.07)) * c;
  }
  return o.set(x, y, (keyed(TORSO, y, 4) * build + grow) * superSin(phi, n));
}
const torso = (y0: number, y1: number, build: number, depth: number, grow: number, rows: number, cols: number, colour: (v: number, u: number) => string) =>
  surface(rows, cols, (v, u, o) => torsoAt(y0 + v * (y1 - y0), u * TAU, build, depth, grow, o), colour);

/** An arm's radius at its seven stations, shoulder to wrist: the elbow is the fourth. */
const ARM = [0.054, 0.049, 0.043, 0.038, 0.043, 0.036, 0.03] as const;
/** An arm, shoulder to wrist (the elbow turned, the biceps and forearm shaped), with the deltoid rounding the shoulder. */
function arm(j: readonly Joint[], heavy: number, t: Tier, hex: string): THREE.BufferGeometry[] {
  const [s, e, w] = j.map(v3);
  const side = Math.sign(s.z);
  return [
    limb([s.clone().add(vec(0, 0.015, -side * 0.01)), s.clone().lerp(e, 0.35), s.clone().lerp(e, 0.72), e, e.clone().lerp(w, 0.3), e.clone().lerp(w, 0.72), w],
      ARM.map((a): Radii => [a * heavy, a * heavy]), seg(t, 22, 12), seg(t, 12, 8), hex),
    place(tint(ellipsoid(0.057 * heavy, 0.063 * heavy, 0.054 * heavy, seg(t, 12, 8), seg(t, 9, 6)), hex), s.x - 0.004, s.y + 0.008, s.z + side * 0.006),
  ];
}
/** The radius of an arm built by arm() at fraction f of the way from shoulder (0) to wrist (1): for bands round it. */
function armRadius(f: number, heavy: number): number {
  const x = clamp01(f) * (ARM.length - 1);
  const i = Math.min(ARM.length - 2, Math.floor(x));
  return heavy * (ARM[i] + (ARM[i + 1] - ARM[i]) * (x - i));
}

/** A frame at `at` whose x runs along `along`, y as near `up` as it can: for a hand or an ornament. */
function frame(at: V3, along: V3, up: V3): THREE.Matrix4 {
  const X = along.clone().normalize();
  const Z = new THREE.Vector3().crossVectors(X, up).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X);
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(at);
}

/** A fist closed round the reins, its knuckles forward along the forearm, the thumb over the top: built round the wrist. */
function fist(t: Tier, hex: string, side: number): THREE.BufferGeometry {
  const ws = seg(t, 10, 7);
  const hs = seg(t, 8, 5);
  return merge([
    place(tint(ellipsoid(0.05, 0.042, 0.036, ws, hs), hex), 0.04, 0, 0),
    place(tint(ellipsoid(0.022, 0.036, 0.034, ws, hs), hex), 0.075, -0.006, 0),
    place(tint(ellipsoid(0.03, 0.013, 0.014, ws, hs), hex), 0.05, 0.03, -side * 0.018, 0, 0, -0.2),
  ]);
}
/** An open hand hanging at the side, fingers down and together, the thumb forward: built from the wrist down. */
function hangingHand(t: Tier, hex: string, side: number): THREE.BufferGeometry {
  const ws = seg(t, 10, 7);
  const hs = seg(t, 8, 5);
  return merge([
    place(tint(ellipsoid(0.044, 0.07, 0.02, ws, hs), hex), 0.004, -0.06, 0),
    place(tint(ellipsoid(0.038, 0.045, 0.016, ws, hs), hex), 0.006, -0.12, -side * 0.004, 0, 0, 0.12),
    place(tint(ellipsoid(0.013, 0.036, 0.013, ws, hs), hex), 0.04, -0.05, -side * 0.012, 0, 0, 0.35),
  ]);
}

/** A leg from inside the hip to the ankle (thigh, knee, calf), and its foot flat on y 0, toes forward. */
function leg(z: number, heavy: number, t: Tier, hex: string): THREE.BufferGeometry[] {
  const r = (a: number, b = a): Radii => [a * heavy, b * heavy];
  return [
    limb([vec(0, 0.92, z * 0.85), vec(0.02, 0.66, z), vec(0.035, 0.5, z), vec(0.01, 0.3, z), vec(-0.01, 0.12, z), vec(-0.012, 0.06, z)],
      [r(0.088), r(0.07), r(0.05), r(0.054, 0.058), r(0.036), r(0.034)], seg(t, 16, 9), seg(t, 12, 8), hex),
    limb([vec(-0.05, 0.034, z), vec(0.0, 0.04, z), vec(0.08, 0.034, z), vec(0.15, 0.024, z), vec(0.185, 0.016, z)],
      [[0.034, 0.034], [0.04, 0.04], [0.044, 0.03], [0.043, 0.02], [0.03, 0.012]], seg(t, 10, 6), seg(t, 10, 7), hex),
  ];
}

/** The head round its centre, facing +x: cranium, jaw and chin, brow ridge, nose, a hint of lips, ears, eyes and brows. */
function head(t: Tier, skin: string, lips: string, broad: number): { skin: THREE.BufferGeometry[]; dark: THREE.BufferGeometry[] } {
  const ws = seg(t, 20, 12);
  const hs = seg(t, 14, 9);
  const s = (rx: number, ry: number, rz: number, hex: string, w = ws, h = hs) => tint(ellipsoid(rx, ry, rz, w, h), hex);
  return {
    skin: [
      place(s(0.098, 0.112, 0.08 * broad, skin), -0.008, 0.012, 0),
      place(s(0.072, 0.07, 0.066 * broad, skin), 0.024, -0.045, 0),
      place(s(0.03, 0.026, 0.034 * broad, skin, 10, 8), 0.072, -0.088, 0),
      place(s(0.02, 0.012, 0.062 * broad, skin, 12, 6), 0.082, 0.026, 0),
      place(s(0.017, 0.034, 0.014, skin, 8, 6), 0.093, -0.014, 0, 0, 0, 0.32),
      place(s(0.012, 0.009, 0.026 * broad, lips, 10, 6), 0.089, -0.058, 0),
      ...[-1, 1].map((z) => place(s(0.02, 0.032, 0.009, skin, 10, 6), -0.004, -0.004, z * 0.08 * broad)),
    ],
    dark: [-1, 1].flatMap((z) => [
      place(s(0.006, 0.0075, 0.018, C.eye, 8, 6), 0.083, 0.004, z * 0.034),
      place(s(0.006, 0.005, 0.024, C.hair, 8, 5), 0.097, 0.03, z * 0.034, z * 0.12, 0, 0),
    ]),
  };
}

// ---------------------------------------------------------------- garments and ornaments

/** A wrapped lower garment's rings, hem to waist: [height, centre x, depth, half-width]. */
type Wrap = readonly (readonly [number, number, number, number])[];

/** A point on a wrapped garment, `grow` m out; the fold between the legs deepens towards the hem, front and back. */
function wrapAt(wrap: Wrap, y: number, phi: number, grow: number, groove: number, o: V3): V3 {
  const a = phi > Math.PI ? phi - TAU : phi;
  const fold = groove * smooth(0.9, 0.42, y) * (gauss(a, 0.24) + gauss(Math.abs(a) - Math.PI, 0.3));
  const ripple = 0.004 * Math.sin(a * 11 + y * 3) * smooth(0.97, 0.6, y);
  return o.set(keyed(wrap, y, 1) + (keyed(wrap, y, 2) + grow + ripple - fold) * superCos(phi, 2.3), y, (keyed(wrap, y, 3) + grow + ripple) * superSin(phi, 2.3));
}
const wrapped = (wrap: Wrap, y0: number, y1: number, grow: number, groove: number, rows: number, cols: number, colour: (v: number, u: number) => string) =>
  surface(rows, cols, (v, u, o) => wrapAt(wrap, y0 + v * (y1 - y0), u * TAU, grow, groove, o), colour);

/**
 * The pleated fan hanging down the front of a wrapped garment from y1 to y0: `pleats` folds across, `top` and `bottom`
 * half-widths, a slab 8 mm thick so it shows from both sides. `colour` paints by height (0 at the hem) and by where on a
 * pleat a point lies (0 in a fold, 1 on a crest).
 */
function fan(wrap: Wrap, y0: number, y1: number, top: number, bottom: number, pleats: number, t: Tier, colour: (v: number, crest: number) => string): THREE.BufferGeometry {
  const across = pleats * 4;
  return surface(seg(t, 14, 7), across * 2, (v, u, o) => {
    const y = y0 + v * (y1 - y0);
    const k = u < 0.5 ? u * 2 : (1 - u) * 2;
    const hw = bottom + (top - bottom) * v;
    const zig = Math.abs(((k * pleats) % 1) - 0.5) * 2;
    const front = keyed(wrap, y, 1) + keyed(wrap, y, 2) + 0.012 + 0.016 * zig * (0.5 + 0.5 * (1 - v)) + 0.02 * (1 - v);
    o.set(u < 0.5 ? front : front - 0.008, y, -hw + 2 * hw * k);
  }, (v, u) => colour(v, Math.abs((((u < 0.5 ? u * 2 : (1 - u) * 2) * pleats) % 1) - 0.5) * 2));
}

/** A ring of `count` small round gems at radius r and height y about the y axis, alternating colours; squashed in z by `zs`. */
function gems(count: number, r: number, y: number, size: number, colours: readonly string[], zs: number, t: Tier, skip = -1): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    if (i === skip) continue;
    const a = (i / count) * TAU;
    out.push(place(tint(ellipsoid(size * 0.7, size, size, seg(t, 6, 4), seg(t, 4, 3)), colours[i % colours.length]), Math.cos(a) * r, y, Math.sin(a) * r * zs, 0, -a, 0));
  }
  return out;
}
/** A band round a limb at `at`, its axis along `dir`: a bangle, an anklet, an armlet's ring. */
const band = (r: number, tube: number, at: V3, dir: V3, t: Tier, hex: string) =>
  aim(tint(new THREE.TorusGeometry(r, tube, seg(t, 6, 4), seg(t, 18, 10)).rotateX(Math.PI / 2), hex), at, dir);

/** A crown turned on the lathe round the head's axis from [radius, height] pairs, a little narrower side to side. */
const lathe = (profile: readonly (readonly [number, number])[], t: Tier, hex: string, zs = 0.86) =>
  tint(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg(t, 28, 14)), hex).scale(1, 1, zs);

/** A cloth end on a chain: ribbon segments hanging from its root, flat face turned by `twist`; a marker named `tip` at its end. */
function clothEnd(M: Mats, hex: string, count: number, segLen: number, r0: Radii, r1: Radii, twist: number, tip: string) {
  const chain = hangingChain(count, segLen, r0, r1, M.silk, 'down');
  for (const j of chain.joints) {
    for (const c of j.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh) continue;
      m.name = 'cloth';
      tint(m.geometry.rotateY(twist), hex);
    }
  }
  const end = new THREE.Object3D();
  end.name = tip;
  end.position.y = -segLen;
  chain.joints[count - 1].add(end);
  return chain;
}

/** A mesh of one material from parts, named. */
function part(parts: THREE.BufferGeometry[], mat: THREE.Material, name: string): THREE.Mesh {
  const m = new THREE.Mesh(merge(parts), mat);
  m.name = name;
  return m;
}

/** The moving pieces of a rider that animate() drives. */
interface Rider {
  group: THREE.Group;
  head: THREE.Group;
  chest: THREE.Group;
  cloth: Cloth[];
  /** Arjuna's whole body, which shifts its weight. */
  sway?: THREE.Group;
}
/**
 * A cloth end's chain and its springs: each joint's swing back and forth (about z) and side to side (about x). `reach` is the
 * furthest forward any segment may lean (rad from hanging straight down): a sash hangs behind its rider's dhoti or kilt, which
 * stops it there.
 */
interface Cloth { joints: THREE.Group[]; base: number; phase: number; reach: number; ang: Float64Array; vel: Float64Array; side: Float64Array; sideVel: Float64Array }
function cloth(chain: { root: THREE.Group; joints: THREE.Group[] }, at: V3, base: number, phase: number, reach = Infinity): Cloth {
  chain.root.position.copy(at);
  const n = chain.joints.length;
  const c = { joints: chain.joints, base, phase, reach, ang: new Float64Array(n), vel: new Float64Array(n), side: new Float64Array(n), sideVel: new Float64Array(n) };
  // At rest the end hangs `base` back from its root, each segment straight on from the one above.
  c.ang[0] = base;
  pose(c);
  return c;
}

// ---------------------------------------------------------------- Krishna

/** The pitambara, draped to the shins and full over the hips. */
const DHOTI: Wrap = [
  [0.27, 0.026, 0.13, 0.186],
  [0.4, 0.022, 0.124, 0.178],
  [0.56, 0.018, 0.128, 0.19],
  [0.75, 0.012, 0.13, 0.198],
  [0.9, 0.01, 0.124, 0.19],
  [1.01, 0.012, 0.106, 0.15],
];

/** Outward from Krishna's chest and shoulders, blending to outward from the arms: how his scarf lies. */
function scarfNormal(p: V3, o: V3): V3 {
  const body = vec(p.x / 0.0169, (p.y - 1.18) / 0.09, p.z / 0.0729).normalize();
  const armSide = vec(-0.25, 0.45, Math.sign(p.z)).normalize();
  return o.copy(body).lerp(armSide, smooth(0.17, 0.27, Math.abs(p.z))).normalize();
}

/** The peacock feather: a quill rising back from the crown, a spray of barbs, and the eye layered on both faces. Head-local. */
function feather(t: Tier): THREE.BufferGeometry {
  const ws = seg(t, 12, 8);
  const hs = seg(t, 8, 5);
  const e = (rx: number, ry: number, rz: number, hex: string, x: number, y: number, z: number) => place(tint(ellipsoid(rx, ry, rz, ws, hs), hex), x, y, z);
  const eye = 0.585;
  const parts = [
    tint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([vec(-0.03, 0.24, 0), vec(-0.05, 0.4, 0), vec(-0.075, 0.55, 0), vec(-0.1, 0.665, 0)]), seg(t, 10, 6), 0.004, 5), C.quill),
    // The barbs below the eye, and the vane round it.
    e(0.014, 0.075, 0.004, C.barb, -0.058, 0.45, 0),
    e(0.048, 0.078, 0.006, C.vane, -0.085, eye, 0),
  ];
  // The eye, layered out from the vane on each face: gold, teal, then the deep blue heart.
  for (const side of [-1, 1]) {
    parts.push(
      e(0.031, 0.046, 0.004, C.eyeGold, -0.087, eye + 0.008, side * 0.004),
      e(0.022, 0.033, 0.004, C.eyeTeal, -0.088, eye + 0.004, side * 0.0075),
      e(0.012, 0.019, 0.004, C.eyeBlue, -0.089, eye, side * 0.011),
    );
  }
  // Turned to face back and to the side at once, so the eye reads from the chase camera and from the flank.
  return merge(parts).rotateY(-0.75);
}

function buildKrishna(M: Mats, arms: RiderArms, t: Tier): Rider {
  const group = new THREE.Group();
  group.name = 'krishna';
  const S = C.krishnaSkin;
  const body: THREE.BufferGeometry[] = [];
  const silk: THREE.BufferGeometry[] = [];
  const gold: THREE.BufferGeometry[] = [];
  const locks: THREE.BufferGeometry[] = [];

  // Legs, feet and anklets; the neck; both arms to the reins, with bangles at the wrists.
  for (const z of [-0.105, 0.105]) {
    body.push(...leg(z, 1, t, S));
    gold.push(band(0.04, 0.007, vec(-0.012, 0.085, z), UP, t, C.gold));
  }
  body.push(limb([vec(0.002, 1.48, 0), vec(0.008, 1.57, 0), vec(0.013, 1.66, 0)], [[0.054, 0.058], [0.05, 0.054], [0.046, 0.05]], seg(t, 6, 4), seg(t, 14, 8), S));
  for (const [key, side] of [['left', 1], ['right', -1]] as const) {
    const j = arms[key];
    body.push(...arm(j, 1, t, S));
    const e = v3(j[1]);
    const w = v3(j[2]);
    const fore = w.clone().sub(e).normalize();
    for (const f of [0.8, 0.9]) gold.push(band(armRadius(0.5 + f / 2, 1) + 0.004, 0.006, e.clone().lerp(w, f), fore, t, C.gold));
    // An armlet (keyura) halfway down the upper arm: a ring with a leaf-shaped crest on its outer side.
    const s = v3(j[0]);
    const upper = e.clone().sub(s).normalize();
    const ring = merge([
      band(armRadius(0.25, 1) + 0.006, 0.009, vec(0, 0, 0), upper, t, C.gold),
      aim(place(tint(new THREE.ConeGeometry(0.02, 0.05, seg(t, 6, 4)), C.gold), 0, 0.01, 0), vec(0, 0, side * (armRadius(0.25, 1) + 0.012)), upper),
      place(tint(ellipsoid(0.008, 0.008, 0.006, 6, 4), C.ruby), 0, 0, side * (armRadius(0.25, 1) + 0.02)),
    ]);
    const armlet = new THREE.Mesh(ring, M.metal);
    armlet.name = `krishna-armlet-${key}`;
    armlet.position.copy(s.clone().lerp(e, 0.5));
    group.add(armlet);
    const hand = new THREE.Mesh(fist(t, S, side), M.matte);
    hand.name = `krishna-hand-${key}`;
    hand.position.copy(w);
    hand.geometry.applyMatrix4(frame(vec(0, 0, 0), fore, vec(0, 1, side * 0.4)));
    group.add(hand);
  }

  // The pitambara: wrapped, the fold between the legs, a pleated fan down the front, a gold border at the hem.
  silk.push(wrapped(DHOTI, 0.27, 1.01, 0, 0.06, seg(t, 26, 13), seg(t, 40, 22), (v) => (v < 0.06 ? C.sash : C.pitambara)));
  silk.push(fan(DHOTI, 0.31, 0.97, 0.03, 0.075, seg(t, 6, 4), t, (v) => (v < 0.04 ? C.sash : C.pitambara)));
  gold.push(wrapped(DHOTI, 0.268, 0.3, 0.005, 0.06, 2, seg(t, 40, 22), () => C.gold));
  // The maroon sash round the waist, knotted at the back of the left hip; the gold belt over it with a clasp at the front.
  silk.push(wrapped(DHOTI, 0.925, 0.995, 0.012, 0, seg(t, 4, 3), seg(t, 36, 18), () => C.sash));
  silk.push(place(tint(ellipsoid(0.04, 0.045, 0.04, seg(t, 10, 7), seg(t, 8, 5)), C.sash), -0.115, 0.95, 0.1));
  gold.push(wrapped(DHOTI, 0.995, 1.012, 0.016, 0, 1, seg(t, 36, 18), () => C.gold));
  gold.push(place(tint(new THREE.CylinderGeometry(0.026, 0.026, 0.012, seg(t, 14, 8)), C.gold), 0.135, 0.99, 0, 0, 0, Math.PI / 2));
  gold.push(place(tint(ellipsoid(0.006, 0.011, 0.011, 6, 4), C.ruby), 0.142, 0.99, 0));

  // The uttariya: over both shoulders and down the arms to the elbows, swagged across the chest; its ends hang from the elbows.
  const drape: V3[] = [];
  for (const [x, y, z] of [[0.215, 1.165, 0.305], [0.14, 1.27, 0.305], [0.06, 1.38, 0.29], [0.012, 1.47, 0.24], [0.02, 1.505, 0.16], [0.09, 1.43, 0.13], [0.136, 1.31, 0.085], [0.15, 1.225, 0]]) drape.push(vec(x, y, z));
  for (let i = drape.length - 2; i >= 0; i--) drape.push(vec(drape[i].x, drape[i].y, -drape[i].z));
  silk.push(ribbon(drape, (v) => 0.064 + 0.024 * Math.sin(v * Math.PI), 0.008, scarfNormal, seg(t, 64, 30), C.scarf));

  // The vaijayanti garland: flowers of five colours round the neck and down to the knees, a leaf between every few.
  const loop = new THREE.CatmullRomCurve3([
    vec(-0.045, 1.53, 0), vec(0.0, 1.5, 0.075), vec(0.085, 1.4, 0.1), vec(0.165, 1.24, 0.098), vec(0.16, 1.03, 0.1), vec(0.18, 0.8, 0.09),
    vec(0.205, 0.6, 0.05), vec(0.21, 0.53, 0), vec(0.205, 0.6, -0.05), vec(0.18, 0.8, -0.09), vec(0.16, 1.03, -0.1), vec(0.165, 1.24, -0.098),
    vec(0.085, 1.4, -0.1), vec(0.0, 1.5, -0.075),
  ], true, 'centripetal');
  const blooms = seg(t, 68, 40);
  const p = new THREE.Vector3();
  for (let i = 0; i < blooms; i++) {
    loop.getPointAt(i / blooms, p);
    const leaf = i % 4 === 3;
    const r = (leaf ? 0.016 : 0.02) * (0.85 + 0.3 * hash(i));
    body.push(place(tint(ellipsoid(r, r * (leaf ? 1.5 : 1), r * 0.8, seg(t, 6, 5), seg(t, 4, 3)), leaf ? '#2f6b2a' : FLOWERS[Math.floor(i / 4) % FLOWERS.length]), p.x, p.y, p.z, hash(i + 7) * 3, hash(i + 3) * 3, 0));
  }
  // The necklace and its pendant, a ruby, over the chest.
  gold.push(place(tint(new THREE.TorusGeometry(0.074, 0.007, seg(t, 6, 4), seg(t, 30, 14)), C.gold), 0.028, 1.475, 0, Math.PI / 2, 0.35, 0));
  gold.push(place(tint(ellipsoid(0.012, 0.016, 0.012, 8, 6), C.ruby), 0.104, 1.42, 0));

  // Hair: locks parted over the shoulders and down the front, and three short ones down the back of his neck. Behind him they
  // keep in front of x −0.075, clear of the prabha's inner ring (x −0.078 to −0.122), and end above y 1.47, over its outer ring.
  for (const z of [-0.03, 0, 0.03]) {
    const off = Math.abs(z) * 0.3;
    locks.push(limb([vec(-0.056 + off, 1.66, z * 0.8), vec(-0.055 + off, 1.6, z), vec(-0.061 + off, 1.53, z * 1.05), vec(-0.064 + off, 1.48, z * 1.1)],
      [[0.018, 0.009], [0.02, 0.009], [0.016, 0.008], [0.006, 0.004]], seg(t, 10, 6), seg(t, 6, 5), C.hair));
  }
  for (const z of [-1, 1]) {
    for (const [dz, end] of [[0, 1.3], [0.025, 1.34], [-0.022, 1.36]]) {
      locks.push(limb([vec(-0.035, 1.67, z * (0.06 + dz * 0.3)), vec(-0.04, 1.58, z * (0.09 + dz * 0.5)), vec(-0.012, 1.5, z * (0.13 + dz)), vec(0.05, 1.43, z * (0.15 + dz)), vec(0.1, end, z * (0.15 + dz))],
        [[0.018, 0.012], [0.02, 0.012], [0.016, 0.01], [0.012, 0.008], [0.005, 0.004]], seg(t, 14, 8), seg(t, 6, 5), C.hair));
    }
  }

  // The chest, which breathes.
  const chest = new THREE.Group();
  chest.name = 'krishna-chest';
  chest.add(part([torso(0.84, 1.56, 1, 1, 0, seg(t, 30, 16), seg(t, 36, 20), () => S)], M.matte, 'krishna-torso'));

  // The head, which turns: face, hair, the tiered mukuta with its jewel bands and crest, the kundala, the feather.
  const headGroup = new THREE.Group();
  headGroup.name = 'krishna-head';
  headGroup.position.set(HEAD[0], HEAD[1], HEAD[2]);
  const face = head(t, S, C.krishnaLips, 1);
  const crown = [
    lathe([[0.098, 0.04], [0.104, 0.046], [0.104, 0.085], [0.097, 0.09], [0.09, 0.095], [0.094, 0.128], [0.082, 0.134], [0.077, 0.138], [0.079, 0.172],
      [0.067, 0.178], [0.061, 0.183], [0.062, 0.212], [0.05, 0.218], [0.044, 0.224], [0.03, 0.258], [0.022, 0.285], [0.03, 0.305], [0.02, 0.33], [0.004, 0.358], [0.001, 0.362]], t, C.gold),
    ...gems(seg(t, 14, 10), 0.105, 0.066, 0.009, [C.ruby, C.emerald], 0.86, t, 0),
    ...gems(seg(t, 10, 8), 0.08, 0.156, 0.008, [C.sapphire, C.ruby], 0.86, t),
    ...gems(seg(t, 8, 6), 0.062, 0.198, 0.007, [C.emerald, C.ruby], 0.86, t),
    // The crest rising from the front of the band, a ruby at its heart.
    place(tint(ellipsoid(0.012, 0.075, 0.042, seg(t, 10, 6), seg(t, 8, 5)), C.gold), 0.1, 0.13, 0, 0, 0, -0.12),
    place(tint(ellipsoid(0.008, 0.016, 0.014, 8, 6), C.ruby), 0.112, 0.11, 0),
  ];
  for (const z of [-1, 1]) {
    crown.push(place(tint(new THREE.TorusGeometry(0.022, 0.005, seg(t, 6, 4), seg(t, 16, 10)), C.gold), -0.004, -0.058, z * 0.086));
    crown.push(place(tint(ellipsoid(0.01, 0.016, 0.008, 8, 6), C.emerald), -0.004, -0.088, z * 0.086));
  }
  // The hair: a cap set back from the face (its back stays in front of the prabha's plane), and the nape.
  const hairCap = [
    place(tint(ellipsoid(0.097, 0.118, 0.087, seg(t, 20, 12), seg(t, 14, 9)), C.hair), -0.016, 0.018, 0),
    place(tint(ellipsoid(0.05, 0.05, 0.066, seg(t, 12, 8), seg(t, 8, 5)), C.hair), -0.05, -0.04, 0),
  ];
  const featherMesh = new THREE.Mesh(feather(t), M.matte);
  featherMesh.name = 'krishna-feather';
  headGroup.add(part([...face.skin, ...face.dark], M.matte, 'krishna-face'), part(hairCap, M.matte, 'krishna-hair'), part(crown, M.metal, 'krishna-crown'), featherMesh);

  group.add(part(body, M.matte, 'krishna-body'), part(locks, M.matte, 'krishna-locks'), part(silk, M.silk, 'krishna-silk'), part(gold, M.metal, 'krishna-gold'), chest, headGroup);

  // The cloth ends: the scarf's from each elbow, the sash's two from the knot at the back of the hip.
  const ends: Cloth[] = [];
  for (const z of [-1, 1]) {
    const c = clothEnd(M, C.scarf, 3, 0.18, [0.04, 0.005], [0.03, 0.004], z * 0.6, 'krishna-scarf-tip');
    group.add(c.root);
    ends.push(cloth(c, vec(0.205, 1.165, z * 0.305), -0.12, z));
  }
  for (const [z, len, ph] of [[0.07, 0.15, 2], [0.13, 0.13, 3]] as const) {
    const c = clothEnd(M, C.sash, 3, len, [0.028, 0.005], [0.022, 0.004], 0, 'krishna-sash-tip');
    group.add(c.root);
    ends.push(cloth(c, vec(-0.128, 0.94, z), -0.08, ph, SASH_REACH));
  }
  return { group, head: headGroup, chest, cloth: ends };
}

// ---------------------------------------------------------------- Arjuna

/** Arjuna's crimson dhoti, worn short as a kilt to the knee, over gold greaves. */
const KILT: Wrap = [
  [0.46, 0.02, 0.15, 0.215],
  [0.6, 0.016, 0.145, 0.212],
  [0.78, 0.012, 0.145, 0.214],
  [0.92, 0.01, 0.135, 0.2],
  [1.0, 0.012, 0.115, 0.165],
];

/** Arjuna's build and depth: his torso, and the kavacha over it. */
const ARJUNA = { build: 1.1, depth: 1.08 } as const;
/** A point on Arjuna's torso at height y and angle phi, `grow` m out: where his armour and its straps lie. */
const onArjuna = (y: number, phi: number, grow: number) => torsoAt(y, phi, ARJUNA.build, ARJUNA.depth, grow, new THREE.Vector3());
/** A point on the yoke over his shoulders, `v` of the way in from the plate's rim to the neck guard, `lift` m above it. */
function onYoke(phi: number, v: number, lift: number, o = new THREE.Vector3()): V3 {
  const rim = torsoAt(1.47, phi, ARJUNA.build, ARJUNA.depth, 0.014, new THREE.Vector3());
  o.set(0.004 + Math.cos(phi) * 0.08, 1.488, Math.sin(phi) * 0.076).sub(rim).multiplyScalar(v).add(rim);
  o.y += Math.sin(v * Math.PI) * 0.01 + lift;
  return o;
}
/** Outward from Arjuna's armour near a point: how the channavira's straps lie on it. */
const armourNormal = (p: V3, o: V3) => o.set((p.x - 0.008) / 0.0144, (p.y - 1.25) / 0.09, p.z / 0.04).normalize();

/**
 * One lame of a pauldron: a band of a shell round the deltoid (centre `at`, radii `r`) between polar angles a0 and a1 from
 * `axis`, flaring out a little to its lower edge, which is gold.
 */
function lame(at: V3, r: V3, axis: V3, a0: number, a1: number, t: Tier): THREE.BufferGeometry {
  const B = new THREE.Vector3(1, 0, 0).cross(axis).normalize();
  const D = axis.clone().cross(B).normalize();
  const d = new THREE.Vector3();
  return surface(seg(t, 5, 3), seg(t, 22, 12), (v, u, o) => {
    const th = a0 + (a1 - a0) * v;
    d.copy(axis).multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th) * Math.cos(u * TAU)).addScaledVector(D, Math.sin(th) * Math.sin(u * TAU));
    const k = 1 + 0.05 * v * v;
    o.set(at.x + d.x * r.x * k, at.y + d.y * r.y * k, at.z + d.z * r.z * k);
  }, (v) => (v > 0.7 ? C.gold : C.steel));
}

/**
 * One strap of the channavira, a closed loop: over the shoulder on `side`, down across his back to the far hip, round his
 * side, and up across his chest to the shoulder again; the two straps cross on his spine and on his breastbone.
 */
function strap(side: number, grow: number, t: Tier): THREE.BufferGeometry {
  const pts: V3[] = [onYoke(side * (Math.PI / 2 - 0.42), 0.45, 0.006), onYoke(side * Math.PI / 2, 0.45, 0.006), onYoke(side * (Math.PI / 2 + 0.42), 0.45, 0.006)];
  // Down the back to the far hip, round the side, and up the front: (height, angle) stations, filled in between.
  const stations: [number, number][] = [
    [1.43, side * (Math.PI - 0.95)], [1.27, side * Math.PI], [1.11, side * (Math.PI + 1.0)], [1.04, side * (Math.PI + Math.PI / 2)],
    [1.11, side * (TAU - 1.0)], [1.27, side * TAU], [1.43, side * (TAU + 0.95)],
  ];
  for (let i = 0; i < stations.length - 1; i++) {
    const [y0, a0] = stations[i];
    const [y1, a1] = stations[i + 1];
    for (let k = 0; k < 4; k++) {
      const f = k / 4;
      const y = y0 + (y1 - y0) * f;
      pts.push(onArjuna(y, a0 + (a1 - a0) * f, y < 1.14 ? grow + 0.012 : grow));
    }
  }
  pts.push(onArjuna(1.43, side * (TAU + 0.95), grow));
  return ribbon(pts, () => 0.032, 0.006, armourNormal, seg(t, 90, 44), C.gold, true);
}

function buildArjuna(M: Mats, arms: RiderArms, t: Tier): Rider {
  const group = new THREE.Group();
  group.name = 'arjuna';
  // His weight shifts: everything stands in a body that rolls a little about his feet.
  const sway = new THREE.Group();
  sway.name = 'arjuna-body';
  group.add(sway);
  const S = C.arjunaSkin;
  const H = ARJUNA.build;
  const ARMS = 1.18;
  const skin: THREE.BufferGeometry[] = [];
  const silk: THREE.BufferGeometry[] = [];
  const gold: THREE.BufferGeometry[] = [];
  const locks: THREE.BufferGeometry[] = [];
  const pauldrons: THREE.BufferGeometry[] = [];

  // Legs and feet, gold greaves over the shins; the neck and its guard.
  for (const z of [-0.115, 0.115]) {
    skin.push(...leg(z, H, t, S));
    gold.push(limb([vec(0.036, 0.445, z), vec(0.012, 0.3, z), vec(-0.008, 0.15, z)], [[0.064, 0.068], [0.066, 0.07], [0.046, 0.048]], seg(t, 8, 5), seg(t, 12, 8), C.gold));
    gold.push(band(0.068, 0.007, vec(0.034, 0.44, z), UP, t, C.paleGold));
  }
  skin.push(limb([vec(0.002, 1.47, 0), vec(0.008, 1.57, 0), vec(0.013, 1.66, 0)], [[0.058, 0.062], [0.054, 0.058], [0.05, 0.054]], seg(t, 6, 4), seg(t, 14, 8), S));
  gold.push(place(lathe([[0.07, 1.452], [0.086, 1.466], [0.083, 1.5], [0.068, 1.524], [0.062, 1.53]], t, C.gold, 0.95), 0.004, 0, 0));

  // Arms lowered, hands at his sides: layered pauldrons over the deltoids, gold keyura below them, gold vambraces.
  for (const [key, side] of [['left', 1], ['right', -1]] as const) {
    const j = arms[key];
    skin.push(...arm(j, ARMS, t, S));
    const s = v3(j[0]);
    const e = v3(j[1]);
    const w = v3(j[2]);
    const brace = [0.3, 0.62, 0.95].map((f): Radii => { const r = armRadius(0.5 + f / 2, ARMS) + 0.007; return [r, r]; });
    gold.push(limb([e.clone().lerp(w, 0.3), e.clone().lerp(w, 0.62), e.clone().lerp(w, 0.95)], brace, seg(t, 6, 4), seg(t, 12, 8), C.gold));
    // Three lames over the deltoid (arm() sets its centre and radii), each lower one tucked under the one above.
    const deltoid = vec(s.x - 0.004, s.y + 0.008, s.z + side * 0.006);
    const radii = vec(0.057, 0.063, 0.054).multiplyScalar(ARMS);
    const axis = vec(0, 0.8, side * 0.6).normalize();
    pauldrons.push(
      lame(deltoid, radii.clone().addScalar(0.003), axis, 0.83, 1.3, t),
      lame(deltoid, radii.clone().addScalar(0.006), axis, 0.48, 0.95, t),
      lame(deltoid, radii.clone().addScalar(0.009), axis, 0, 0.6, t),
    );
    // The keyura, hugging the upper arm below the pauldron, a leaf crest on its outer side.
    const upper = e.clone().sub(s).normalize();
    const ring = armRadius(0.31, ARMS) + 0.004;
    const at = s.clone().lerp(e, 0.62);
    gold.push(band(ring, 0.008, at, upper, t, C.gold));
    gold.push(aim(place(tint(new THREE.ConeGeometry(0.018, 0.045, seg(t, 6, 4)), C.gold), 0, 0.01, 0), at.clone().add(vec(0, 0, side * (ring + 0.006))), upper));
    const hand = new THREE.Mesh(hangingHand(t, S, side), M.matte);
    hand.name = `arjuna-hand-${key}`;
    hand.position.copy(w);
    sway.add(hand);
  }

  // The crimson kilt: a pleated fan with deep folds, a bold gold hem. A gold belt with its clasp; below it a band of kilt, then
  // the saffron sash, knotted at the back of the hip.
  silk.push(wrapped(KILT, 0.46, 1.0, 0, 0.02, seg(t, 18, 9), seg(t, 40, 22), () => C.crimson));
  silk.push(fan(KILT, 0.5, 0.87, 0.03, 0.07, seg(t, 5, 4), t, (v, crest) => (v < 0.05 ? C.paleGold : crest < 0.45 ? C.crimsonFold : C.crimson)));
  gold.push(wrapped(KILT, 0.45, 0.5, 0.008, 0.02, 3, seg(t, 40, 22), () => C.gold));
  gold.push(wrapped(KILT, 0.95, 0.985, 0.014, 0, 2, seg(t, 36, 18), () => C.gold));
  const clasp = wrapAt(KILT, 0.967, 0, 0.022, 0, vec(0, 0, 0));
  gold.push(place(tint(new THREE.CylinderGeometry(0.03, 0.03, 0.012, seg(t, 16, 10)), C.gold), clasp.x, clasp.y, 0, 0, 0, Math.PI / 2));
  gold.push(place(tint(ellipsoid(0.007, 0.012, 0.012, 8, 6), C.ruby), clasp.x + 0.007, clasp.y, 0));
  silk.push(wrapped(KILT, 0.875, 0.925, 0.016, 0, seg(t, 4, 3), seg(t, 36, 18), () => C.saffron));
  silk.push(place(tint(ellipsoid(0.042, 0.046, 0.04, seg(t, 10, 7), seg(t, 8, 5)), C.saffron), -0.14, 0.9, 0.11));

  // Long hair down his back to the shoulder blades, over the back plate.
  for (let i = -2; i <= 2; i++) {
    const z = i * 0.034;
    const end = 1.3 + Math.abs(i) * 0.035;
    locks.push(limb([vec(-0.08, 1.68, z * 0.8), vec(-0.1, 1.6, z), vec(-0.104, 1.5, z * 1.1), vec(-0.103, 1.4, z * 1.15), vec(-0.098, end, z * 1.2)],
      [[0.03, 0.013], [0.034, 0.014], [0.028, 0.012], [0.019, 0.009], [0.008, 0.004]], seg(t, 14, 8), seg(t, 6, 5), C.hair));
  }

  // The kavacha, which breathes with him: a steel breastplate with a ridge down the spine and a sculpted chest, gold trim at its
  // neck, armholes and lower edge, the yoke over the shoulders, and four overlapping lames over the abdomen with gold edges.
  const chest = new THREE.Group();
  chest.name = 'arjuna-chest';
  const plate = surface(seg(t, 26, 13), seg(t, 44, 24), (v, u, o) => {
    torsoAt(1.12 + v * 0.35, u * TAU, H, ARJUNA.depth, 0.014 + 0.007 * smooth(0.08, 0, v), o);
  }, (v, u) => {
    const y = 1.12 + v * 0.35;
    const a = Math.abs(u > 0.5 ? u * TAU - TAU : u * TAU);
    const hole = Math.hypot((y - 1.39) / 0.07, (a - Math.PI / 2) / 0.4);
    return y < 1.155 || y > 1.446 || (hole > 0.72 && hole < 1) ? C.gold : C.steel;
  });
  const yoke = surface(seg(t, 4, 2), seg(t, 44, 24), (v, u, o) => { onYoke(u * TAU, v, 0, o); }, (v) => (v < 0.15 || v > 0.75 ? C.gold : C.steel));
  const lames = [[0.99, 1.04], [1.02, 1.07], [1.05, 1.1], [1.08, 1.13]].map(([y0, y1]) =>
    surface(3, seg(t, 44, 24), (v, u, o) => { torsoAt(y0 + v * (y1 - y0), u * TAU, H, ARJUNA.depth, 0.026 - 0.01 * v, o); }, (v) => (v < 0.3 ? C.gold : C.steel)));
  const bead = (pts: V3[], r: number) => limb(pts, pts.map((_, i): Radii => { const k = i === 0 || i === pts.length - 1 ? 0.7 : 1; return [r * k, r * k]; }), seg(t, 16, 8), seg(t, 8, 6), C.steel);
  const ridges = [
    bead([1.14, 1.22, 1.3, 1.38, 1.45].map((y) => onArjuna(y, Math.PI, 0.016)), 0.008),
    bead([-1.1, -0.55, 0, 0.55, 1.1].map((a) => onArjuna(1.228 + 0.03 * (a / 1.1) ** 2, a, 0.018)), 0.007),
    bead([1.235, 1.32, 1.41].map((y) => onArjuna(y, 0, 0.016)), 0.006),
  ];
  chest.add(part([plate, yoke, ...lames, ...ridges], M.steel, 'arjuna-armour'));
  // The channavira: two gold straps crossed over his chest and his back, a gold boss on each crossing.
  const front = onArjuna(1.27, 0, 0.025);
  const back = onArjuna(1.27, Math.PI, 0.025);
  const boss = (p: V3) => place(tint(new THREE.CylinderGeometry(0.034, 0.034, 0.01, seg(t, 20, 12)), C.gold), p.x, p.y, p.z, 0, 0, Math.PI / 2);
  chest.add(part([
    strap(1, 0.019, t), strap(-1, 0.023, t), boss(front), boss(back),
    place(tint(ellipsoid(0.006, 0.015, 0.015, 8, 6), C.ruby), front.x + 0.006, front.y, front.z),
    place(tint(ellipsoid(0.006, 0.013, 0.013, 8, 6), C.paleGold), back.x - 0.006, back.y, back.z),
  ], M.metal, 'arjuna-channavira'));

  // The head, which turns: face, hair, the tall kirita with its jewel bands and front plate, and earrings.
  const headGroup = new THREE.Group();
  headGroup.name = 'arjuna-head';
  headGroup.position.set(HEAD[0], HEAD[1], HEAD[2]);
  const face = head(t, S, C.arjunaLips, 1.06);
  const kirita = [
    lathe([[0.1, 0.035], [0.107, 0.042], [0.107, 0.088], [0.1, 0.094], [0.096, 0.1], [0.1, 0.2], [0.093, 0.206], [0.088, 0.212], [0.072, 0.29],
      [0.054, 0.36], [0.034, 0.42], [0.014, 0.47], [0.004, 0.495], [0.001, 0.5]], t, C.gold),
    ...gems(seg(t, 12, 10), 0.108, 0.065, 0.01, [C.ruby, C.emerald], 0.86, t, 0),
    ...gems(seg(t, 10, 8), 0.1, 0.17, 0.009, [C.sapphire, C.ruby], 0.86, t, 0),
    place(tint(ellipsoid(0.01, 0.085, 0.04, seg(t, 10, 6), seg(t, 10, 6)), C.gold), 0.1, 0.16, 0, 0, 0, -0.08),
    place(tint(ellipsoid(0.008, 0.017, 0.015, 8, 6), C.ruby), 0.111, 0.15, 0),
  ];
  for (const z of [-1, 1]) kirita.push(place(tint(new THREE.TorusGeometry(0.016, 0.004, seg(t, 6, 4), seg(t, 14, 8)), C.gold), -0.004, -0.05, z * 0.09));
  const hairCap = [
    place(tint(ellipsoid(0.1, 0.12, 0.093, seg(t, 20, 12), seg(t, 14, 9)), C.hair), -0.018, 0.018, 0),
    place(tint(ellipsoid(0.055, 0.055, 0.078, seg(t, 12, 8), seg(t, 8, 5)), C.hair), -0.055, -0.04, 0),
  ];
  headGroup.add(part([...face.skin, ...face.dark], M.matte, 'arjuna-face'), part(hairCap, M.matte, 'arjuna-hair'), part(kirita, M.metal, 'arjuna-crown'));

  sway.add(part(skin, M.matte, 'arjuna-skin'), part(locks, M.matte, 'arjuna-locks'), part(silk, M.silk, 'arjuna-silk'), part(gold, M.metal, 'arjuna-gold'),
    part(pauldrons, M.steel, 'arjuna-pauldrons'), chest, headGroup);

  // The sash's two ends, from the knot at the back of his hip.
  const ends: Cloth[] = [];
  for (const [z, len, ph] of [[0.08, 0.14, 4], [0.14, 0.12, 5]] as const) {
    const c = clothEnd(M, C.saffron, 3, len, [0.03, 0.005], [0.024, 0.004], 0, 'arjuna-sash-tip');
    sway.add(c.root);
    ends.push(cloth(c, vec(-0.165, 0.895, z), -0.08, ph, SASH_REACH));
  }
  return { group, head: headGroup, chest, cloth: ends, sway };
}

// ---------------------------------------------------------------- the riders

/** The game's two riders, and the motion that brings them to life. */
export interface GameRiders {
  /** Named 'krishna': the chariot adds his prabha and halo. */
  krishna: THREE.Group;
  arjuna: THREE.Group;
  /**
   * Each frame: scene time (s), the frame's dt (s), the chariot's motion and the wind, the same that swings the page's scarf
   * (chariot.ts). The first frame has no frame before it, so everything starts at rest and moves from the next.
   */
  update(time: number, dt: number, motion: ChariotMotion, wind: number): void;
}

/**
 * Builds both riders for the drivable chariot, with fewer segments on phones (the tier without shadows). `arms` are their
 * poses: Krishna's hands on the reins (the reins start at his wrists), Arjuna's lowered at his sides.
 */
export function createRiders(ctx: SceneContext, arms: { krishna: RiderArms; arjuna: RiderArms }): GameRiders {
  const M = riderMaterials();
  const t: Tier = { hi: ctx.quality.shadows };
  const k = buildKrishna(M, arms.krishna, t);
  const a = buildArjuna(M, arms.arjuna, t);
  let started = false;
  return {
    krishna: k.group,
    arjuna: a.group,
    update(time, dt, motion, wind) {
      animate(k, a, time, started ? dt : 0, motion.speed, motion.yawRate, wind);
      started = true;
    },
  };
}

// ---------------------------------------------------------------- per frame: from here down runs every frame and allocates nothing

/** Both heads turn toward the turn by at most HEAD_TURN rad (Arjuna's a little more), easing in over HEAD_EASE s. */
const HEAD_TURN = 0.24;
const HEAD_EASE = 0.45;
/** Breathing: each chest swells by at most BREATH, at 0.22 Hz (Krishna) and 0.2 Hz (Arjuna). */
const BREATH = 0.009;
/** Arjuna's weight shifts over 14 s: a roll of at most SHIFT rad about his feet. */
const SHIFT = 0.014;
/** A sash end never leans forward of this (rad): hanging from its knot behind the hip, it clears the dhoti or kilt below. */
const SASH_REACH = -0.02;
/** The cloth's springs, per unit inertia, stepped at most CLOTH_STEP s at a time. */
const CLOTH_K = 30;
const CLOTH_C = 9.3;
const CLOTH_STEP = 1 / 60;

function animate(k: Rider, a: Rider, time: number, dt: number, speed: number, yawRate: number, wind: number): void {
  const ease = 1 - Math.exp(-dt / HEAD_EASE);
  const turn = HEAD_TURN * Math.tanh(yawRate / 0.7);
  k.head.rotation.y += (turn - k.head.rotation.y) * ease;
  a.head.rotation.y += (turn * 1.08 - a.head.rotation.y) * ease;
  const kb = 1 + BREATH * Math.sin(time * TAU * 0.22);
  k.chest.scale.set(kb, 1, kb);
  const ab = 1 + BREATH * Math.sin(time * TAU * 0.2 + 1.7);
  a.chest.scale.set(ab, 1, ab);
  if (a.sway) a.sway.rotation.x = SHIFT * Math.sin(time * TAU * 0.07);
  // The cloth swings in the wind, blows back with speed (backing up, a little forward and never far), swings out of a turn,
  // and flutters faster the faster it goes.
  const q = (speed * speed) / 49;
  const flow = speed >= 0 ? -1.3 * Math.tanh(q) : 0.22 * Math.tanh(q);
  const flutter = 0.1 * Math.tanh(Math.max(0, speed) / 9) + 0.02 * Math.tanh(Math.max(0, -speed) / 9);
  const out = -0.45 * Math.tanh((speed * yawRate) / 12);
  const steps = Math.max(1, Math.ceil(dt / CLOTH_STEP - 1e-9));
  const h = dt / steps;
  for (let i = 0; i < k.cloth.length; i++) swing(k.cloth[i], wind, flow, flutter, out, time, h, steps);
  for (let i = 0; i < a.cloth.length; i++) swing(a.cloth[i], wind, flow, flutter, out, time, h, steps);
}

/**
 * Each joint's springs chase the change of angle from the segment above: the segments' own angles grow down the chain. No
 * segment leans further forward than the cloth's reach: its target stops there, and so does the segment itself.
 */
function swing(c: Cloth, wind: number, flow: number, flutter: number, out: number, time: number, h: number, steps: number): void {
  const n = c.joints.length;
  let above = 0;
  let aboveSide = 0;
  let lean = 0;
  for (let j = 0; j < n; j++) {
    const w = (j + 1) / n;
    const angle = Math.min(c.reach, c.base + wind * (0.3 + 0.3 * w) + flow * (0.7 + 0.3 * w) + flutter * w * Math.sin(time * 6 + c.phase + 1.3 * j));
    const side = out * (0.6 + 0.4 * w);
    const rel = angle - above;
    const relSide = side - aboveSide;
    above = angle;
    aboveSide = side;
    for (let s = 0; s < steps; s++) {
      c.vel[j] += ((rel - c.ang[j]) * CLOTH_K - c.vel[j] * CLOTH_C) * h;
      c.ang[j] += c.vel[j] * h;
      c.sideVel[j] += ((relSide - c.side[j]) * CLOTH_K - c.sideVel[j] * CLOTH_C) * h;
      c.side[j] += c.sideVel[j] * h;
    }
    lean += c.ang[j];
    if (lean > c.reach) {
      c.ang[j] -= lean - c.reach;
      if (c.vel[j] > 0) c.vel[j] = 0;
      lean = c.reach;
    }
  }
  pose(c);
}

/** Sets each joint of a cloth end from its springs. */
function pose(c: Cloth): void {
  for (let j = 0; j < c.joints.length; j++) {
    c.joints[j].rotation.z = c.ang[j];
    c.joints[j].rotation.x = c.side[j];
  }
}
