import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tagLimb } from './rig';

/** Cross-section radii: [sideways (the z axis for paths in the x-y plane), in the plane of the path]. */
export type Radii = [number, number];
type P = [number, number, number];

const v = (p: P, dy = 0) => new THREE.Vector3(p[0], p[1] + dy, p[2]);
const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

/**
 * Sweep an elliptical cross-section along a smooth curve through `points`, the radii easing from one entry to the next.
 * This is how every body here is shaped: a horse's barrel and neck, a leg, a torso, an arm. Open ended; ends are tapered
 * or hidden inside the next part.
 */
export function loft(points: THREE.Vector3[], radii: Radii[], rings = 16, radial = 12): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const z = new THREE.Vector3(0, 0, 1);
  const x = new THREE.Vector3(1, 0, 0);
  const C = new THREE.Vector3();
  const T = new THREE.Vector3();
  const S = new THREE.Vector3();
  const U = new THREE.Vector3();
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    curve.getPointAt(t, C);
    curve.getTangentAt(t, T);
    S.crossVectors(T, Math.abs(T.z) > 0.9 ? x : z).normalize();
    U.crossVectors(S, T).normalize();
    const f = t * (radii.length - 1);
    const i = Math.min(Math.floor(f), radii.length - 2);
    const k = f - i;
    const a = lerp(radii[i][0], radii[i + 1][0], k);
    const b = lerp(radii[i][1], radii[i + 1][1], k);
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      const ca = Math.cos(ang) * a;
      const sb = Math.sin(ang) * b;
      pos.push(C.x + U.x * ca + S.x * sb, C.y + U.y * ca + S.y * sb, C.z + U.z * ca + S.z * sb);
      uv.push(j / radial, t);
    }
  }
  const row = radial + 1;
  for (let r = 0; r < rings; r++) {
    for (let j = 0; j < radial; j++) {
      const a = r * row + j;
      const b = a + row;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
};
const path = (pts: P[]) => pts.map((p) => v(p));

// ---------------------------------------------------------------- horse

export interface HorseMaterials { coat: THREE.Material; mane: THREE.Material; hoof: THREE.Material; eye: THREE.Material }
export interface HorseRig { group: THREE.Group; legs: THREE.Group[]; head: THREE.Group; tail: THREE.Group; tailJoints: THREE.Group[]; maneJoints: THREE.Group[] }

/**
 * A short chain of tapering segments, each hung from the end of the one before, so a tail, mane or scarf can bend along its
 * length. Segments run down (-y) or forward (+x) from the root; every joint rotates about z.
 */
export function hangingChain(count: number, segLen: number, r0: Radii, r1: Radii, mat: THREE.Material, axis: 'down' | 'x'): { root: THREE.Group; joints: THREE.Group[] } {
  const joints: THREE.Group[] = [];
  let parent: THREE.Group | undefined;
  for (let i = 0; i < count; i++) {
    const j = new THREE.Group();
    if (parent) { j.position.set(axis === 'x' ? segLen : 0, axis === 'down' ? -segLen : 0, 0); parent.add(j); }
    const k0 = i / count;
    const k1 = (i + 1) / count;
    const end = axis === 'x' ? new THREE.Vector3(segLen, 0, 0) : new THREE.Vector3(0, -segLen, 0);
    j.add(new THREE.Mesh(loft([new THREE.Vector3(), end], [
      [lerp(r0[0], r1[0], k0), lerp(r0[1], r1[1], k0)], [lerp(r0[0], r1[0], k1), lerp(r0[1], r1[1], k1)],
    ], 3, 8), mat));
    joints.push(j);
    parent = j;
  }
  return { root: joints[0], joints };
}

function leg(pts: P[], radii: Radii[], hoofAt: P, M: HorseMaterials, pivot: P): THREE.Group {
  const g = new THREE.Group();
  g.position.set(...pivot);
  g.add(new THREE.Mesh(loft(path(pts), radii, 14, 10), M.coat));
  const hoof = part(new THREE.CylinderGeometry(0.06, 0.075, 0.08, 12), M.hoof, ...hoofAt);
  g.add(hoof);
  return g;
}

/** A horse facing +x, hooves on y = 0, about 1.5 at the withers: barrel, arched neck, head with ears and eyes, jointed legs. */
export function horse(M: HorseMaterials): HorseRig {
  const group = new THREE.Group();
  // Barrel, from the root of the tail over the rump and back to the withers.
  group.add(new THREE.Mesh(loft(
    path([[-0.95, 1.36, 0], [-0.75, 1.47, 0], [-0.35, 1.43, 0], [0.05, 1.39, 0], [0.42, 1.5, 0], [0.66, 1.52, 0]]),
    [[0.1, 0.12], [0.3, 0.33], [0.31, 0.35], [0.3, 0.34], [0.27, 0.36], [0.2, 0.3]], 24, 16,
  ), M.coat));

  // Neck and head, on their own pivot at the base of the neck so the head can toss.
  const head = new THREE.Group();
  head.position.set(0.6, 1.5, 0);
  head.add(new THREE.Mesh(loft(
    path([[0, 0, 0], [0.2, 0.25, 0], [0.4, 0.5, 0], [0.52, 0.55, 0], [0.62, 0.42, 0], [0.78, 0.15, 0]]),
    [[0.2, 0.28], [0.15, 0.2], [0.12, 0.14], [0.11, 0.13], [0.09, 0.1], [0.07, 0.075]], 22, 14,
  ), M.coat));
  head.add(part(new THREE.SphereGeometry(0.075, 12, 10), M.coat, 0.78, 0.14, 0));
  const maneChain = hangingChain(3, 0.2, [0.04, 0.09], [0.02, 0.04], M.mane, 'x');
  maneChain.root.position.set(0.02, 0.3, 0);
  maneChain.root.rotation.z = 0.78;
  head.add(maneChain.root);
  for (const zz of [-0.07, 0.07]) {
    const ear = part(new THREE.ConeGeometry(0.03, 0.12, 6), M.coat, 0.46, 0.68, zz);
    ear.rotation.z = -0.25;
    head.add(ear, part(new THREE.SphereGeometry(0.022, 8, 6), M.eye, 0.58, 0.5, zz * 1.35));
  }
  group.add(head);

  // Legs: forelegs straight through the knee, hind legs with the backward-bending hock.
  const fore = (zz: number) => leg(
    [[0, 0, 0], [0.03, -0.32, 0], [0.02, -0.72, 0], [0.04, -1.02, 0], [0.08, -1.15, 0]],
    [[0.1, 0.12], [0.07, 0.08], [0.05, 0.055], [0.05, 0.055], [0.055, 0.06]], [0.09, -1.18, 0], M, [0.42, 1.22, zz],
  );
  const hind = (zz: number) => leg(
    [[0, 0, 0], [0.1, -0.35, 0], [-0.08, -0.72, 0], [-0.05, -1.05, 0], [-0.02, -1.17, 0]],
    [[0.13, 0.16], [0.09, 0.11], [0.05, 0.06], [0.05, 0.055], [0.055, 0.06]], [-0.01, -1.21, 0], M, [-0.68, 1.25, zz],
  );
  const legs = [fore(-0.14), fore(0.14), hind(-0.15), hind(0.15)];
  group.add(...legs);

  const tailChain = hangingChain(4, 0.22, [0.06, 0.07], [0.015, 0.02], M.mane, 'down');
  tailChain.root.position.set(-0.95, 1.38, 0);
  tailChain.root.rotation.z = -0.5;
  group.add(tailChain.root);
  return { group, legs, head, tail: tailChain.root, tailJoints: tailChain.joints, maneJoints: maneChain.joints };
}

// ---------------------------------------------------------------- people

export interface FigureOptions {
  skin: THREE.Material;
  cloth: THREE.Material;
  seated?: boolean;
  /** Shoulder, elbow, wrist for each arm, in standing coordinates (left = +z). */
  arms?: { left?: P[]; right?: P[] };
  /** Widens the torso for a heavier build. */
  build?: number;
}
export interface FigureRig { group: THREE.Group; head: THREE.Group; leftHand: THREE.Vector3; rightHand: THREE.Vector3; lift: number }

const DEFAULT_LEFT: P[] = [[0, 1.42, 0.22], [0.02, 1.15, 0.25], [0.05, 0.9, 0.24]];
const DEFAULT_RIGHT: P[] = [[0, 1.42, -0.22], [0.02, 1.15, -0.25], [0.05, 0.9, -0.24]];

/** A person facing +x, feet on y = 0, about 1.8 tall standing; seated cross-legged the upper body drops by 0.6. */
export function humanFigure(o: FigureOptions): FigureRig {
  const group = new THREE.Group();
  const lift = o.seated ? -0.6 : 0;
  const w = o.build ?? 1;

  for (const side of [-1, 1]) {
    const pts: P[] = o.seated
      ? [[0, 0.32, side * 0.1], [0.38, 0.18, side * 0.3], [0.12, 0.1, -side * 0.05]]
      : [[0, 0.92, side * 0.09], [0.03, 0.5, side * 0.1], [0, 0.08, side * 0.1]];
    group.add(new THREE.Mesh(loft(path(pts), [[0.085, 0.09], [0.055, 0.06], [0.04, 0.045]], 12, 10), o.cloth));
    const foot = part(new THREE.SphereGeometry(0.06, 10, 8), o.skin, pts[2][0] + 0.05, 0.04, pts[2][2]);
    foot.scale.set(1.9, 0.65, 0.85);
    group.add(foot);
  }

  group.add(new THREE.Mesh(loft(
    path([[0, 0.88 + lift, 0], [0, 1.05 + lift, 0], [0.01, 1.25 + lift, 0], [0, 1.42 + lift, 0], [0, 1.5 + lift, 0]]),
    [[0.16 * w, 0.11 * w], [0.14 * w, 0.1 * w], [0.18 * w, 0.12 * w], [0.2 * w, 0.1 * w], [0.07, 0.06]], 16, 14,
  ), o.skin));
  group.add(new THREE.Mesh(loft(path([[0, 1.47 + lift, 0], [0.01, 1.6 + lift, 0]]), [[0.05, 0.05], [0.048, 0.05]], 4, 10), o.skin));

  const head = new THREE.Group();
  head.position.set(0.01, 1.7 + lift, 0);
  const skull = part(new THREE.SphereGeometry(0.1, 20, 16), o.skin);
  skull.scale.set(1.05, 1.2, 0.92);
  const jaw = part(new THREE.SphereGeometry(0.07, 14, 10), o.skin, 0.03, -0.06, 0);
  jaw.scale.set(1, 0.9, 1.05);
  const nose = part(new THREE.ConeGeometry(0.018, 0.05, 8), o.skin, 0.105, -0.01, 0);
  nose.rotation.z = -Math.PI / 2;
  head.add(skull, jaw, nose);
  for (const zz of [-0.095, 0.095]) head.add(part(new THREE.SphereGeometry(0.022, 8, 6), o.skin, 0, -0.01, zz));
  group.add(head);

  const arm = (pts: P[]) => {
    group.add(new THREE.Mesh(loft(pts.map((p) => v(p, lift)), [[0.05, 0.05], [0.04, 0.042], [0.03, 0.032]], 12, 10), o.skin));
    const end = v(pts[2], lift);
    group.add(part(new THREE.SphereGeometry(0.035, 10, 8), o.skin, end.x, end.y, end.z));
    return end;
  };
  const leftHand = arm(o.arms?.left ?? DEFAULT_LEFT);
  const rightHand = arm(o.arms?.right ?? DEFAULT_RIGHT);
  // Everything built so far is the body; garments and gear added by the caller are not, so a skinned body can replace just this.
  group.traverse((n) => { if (n !== group) n.userData.body = true; });
  return { group, head, leftHand, rightHand, lift };
}

/** A garment turned on the lathe around the body's vertical axis: profile points are [radius, height]. */
export function garment(profile: [number, number][], mat: THREE.Material, depth = 0.7): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 28), mat);
  m.scale.set(depth, 1, 1);
  return m;
}

/** A tube along a curve: a scarf, a garland, a bowstring. */
export function strand(pts: P[], radius: number, mat: THREE.Material, segments = 40): THREE.Mesh {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path(pts)), segments, radius, 8, false), mat);
}

/** The army's foot soldier as one merged, low-poly mesh facing +x: the same shaped body, with helmet, shield and spear. */
export function soldierGeometry(): THREE.BufferGeometry {
  const parts = [
    loft(path([[0, 0.9, 0.09], [0.03, 0.5, 0.1], [0, 0.06, 0.1]]), [[0.105, 0.11], [0.075, 0.08], [0.06, 0.065]], 3, 5),
    loft(path([[0, 0.9, -0.09], [0.03, 0.5, -0.1], [0, 0.06, -0.1]]), [[0.105, 0.11], [0.075, 0.08], [0.06, 0.065]], 3, 5),
    loft(path([[0, 0.86, 0], [0, 1.08, 0], [0, 1.3, 0], [0, 1.47, 0]]), [[0.17, 0.12], [0.15, 0.11], [0.2, 0.13], [0.08, 0.07]], 4, 6),
    loft(path([[0, 1.4, 0.2], [0.12, 1.15, 0.24], [0.25, 1.05, 0.16]]), [[0.045, 0.045], [0.035, 0.035], [0.03, 0.03]], 2, 4),
    loft(path([[0, 1.4, -0.2], [0.08, 1.2, -0.24], [0.1, 1.3, -0.22]]), [[0.045, 0.045], [0.035, 0.035], [0.03, 0.03]], 2, 4),
    new THREE.SphereGeometry(0.11, 7, 5).scale(1, 1.15, 0.95).translate(0.01, 1.6, 0),
    new THREE.ConeGeometry(0.12, 0.2, 7).translate(0, 1.76, 0),
    new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10).rotateZ(Math.PI / 2).translate(0.3, 1.05, 0.18),
    new THREE.CylinderGeometry(0.016, 0.016, 2.4, 4).translate(0.1, 1.25, -0.22),
    new THREE.ConeGeometry(0.045, 0.2, 4).translate(0.1, 2.55, -0.22),
  ];
  // The two legs (the first two parts) swing about the hip; everything else is the body.
  parts.forEach((p, i) => tagLimb(p, i === 0 ? 1 : i === 1 ? 2 : 0, 0, 0.9));
  const merged = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return merged;
}
