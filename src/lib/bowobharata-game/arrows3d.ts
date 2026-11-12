import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { arrowArc, CHARIOT, groundHeight } from '../bowobharata/stage-math';
import type { Vec3 } from '../sky/states';
import { type Arrow, type Run } from './rules';
import type { KurukshetraScene } from '../bowobharata/KurukshetraScene';

type Game = NonNullable<KurukshetraScene['game']>;

const FADE = 0.4;
const STUCK_HOLD = 1.4;
const START_X = 6;
const LANE_SPACING = 2.4;
const ARC_HEIGHT = 5;
const SCALE = 1.6;
/** Ground beside the chariot where missed arrows land: open ground, clear of the ranks and the horses. */
const MISS_SPOT = { x: CHARIOT.x + 2.6, z: CHARIOT.z - 1.8 };

/** Where a lane starts: along the Kurawa line, on the far side from the chariot. */
export function laneStart(lane: number): Vec3 {
  const z = CHARIOT.z + lane * LANE_SPACING;
  return { x: START_X, y: groundHeight(START_X, z) + 2.2, z };
}
function chariotTarget(): Vec3 {
  return { x: CHARIOT.x, y: groundHeight(CHARIOT.x, CHARIOT.z) + 1.5, z: CHARIOT.z };
}

function bake(geo: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(m);
  return g;
}
const at = (x: number, y: number, z: number, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1));
const noUv = (g: THREE.BufferGeometry) => { g.deleteAttribute('uv'); return g; };
const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map(noUv), false);

// Arrows are modelled along +Y (tip up), about one unit long.
function realShaftGeo() {
  return merge([
    bake(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), at(0, 0, 0)),
    bake(new THREE.ConeGeometry(0.09, 0.22, 4), at(0, -0.42, 0, Math.PI, 0)),
    bake(new THREE.ConeGeometry(0.09, 0.22, 4), at(0, -0.3, 0, Math.PI, 0)),
  ])!;
}
function realTipGeo() {
  return bake(new THREE.ConeGeometry(0.07, 0.24, 6), at(0, 0.6, 0));
}
/** Frayed: a thin split shaft with splinters poking out, no head. */
function decoyShaftGeo() {
  return merge([
    bake(new THREE.CylinderGeometry(0.014, 0.022, 1, 5), at(0, 0, 0)),
    bake(new THREE.CylinderGeometry(0.004, 0.012, 0.3, 3), at(0.03, 0.5, 0, 0, -0.5)),
    bake(new THREE.CylinderGeometry(0.004, 0.012, 0.26, 3), at(-0.03, 0.48, 0.01, 0, 0.6)),
    bake(new THREE.CylinderGeometry(0.004, 0.012, 0.22, 3), at(0, 0.47, 0.03, 0.6, 0)),
  ])!;
}
/** Curled fletching: two open arcs wrapped round the tail. */
function decoyFletchGeo() {
  return merge([
    bake(new THREE.TorusGeometry(0.1, 0.012, 4, 10, Math.PI * 1.3), at(0, -0.42, 0, Math.PI / 2, 0)),
    bake(new THREE.TorusGeometry(0.075, 0.012, 4, 10, Math.PI * 1.1), at(0, -0.33, 0, Math.PI / 2, 0.5)),
  ])!;
}
/** Lotus: five petals round a bud, facing the camera (lies in the XY plane). */
function lotusGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(bake(new THREE.ConeGeometry(0.06, 0.26, 4), new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a - Math.PI / 2)),
      new THREE.Vector3(1, 1, 1))));
  }
  parts.push(bake(new THREE.SphereGeometry(0.06, 6, 4), at(0, 0, 0)));
  return merge(parts)!;
}
/** Broken ring: a circle with a gap. */
function brokenRingGeo() {
  return noUv(new THREE.TorusGeometry(0.2, 0.025, 5, 14, Math.PI * 1.55));
}

interface Visual { state: Arrow['state']; since: number; from: Vec3 }

export interface ArrowLayer {
  sync(run: Run): void;
  screenPoints(width: number, height: number): { id: number; x: number; y: number }[];
  dispose(): void;
}

export function createArrowLayer(game: Game, opts: { sight: () => boolean }): ArrowLayer {
  const group = new THREE.Group();
  group.name = 'arrow-layer';
  game.root.add(group);

  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.7, roughness: 0.35 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc24a, emissiveIntensity: 1.6, roughness: 0.3 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.95, metalness: 0 });
  const greyDark = new THREE.MeshStandardMaterial({ color: 0x5f6266, roughness: 1, metalness: 0 });
  const lotusMat = new THREE.MeshBasicMaterial({ color: 0xffd36b, toneMapped: false });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xb9bcc0, toneMapped: false });

  const geos = [realShaftGeo(), realTipGeo(), decoyShaftGeo(), decoyFletchGeo(), lotusGeo(), brokenRingGeo()];
  const [gRealShaft, gRealTip, gDecoyShaft, gDecoyFletch, gLotus, gRing] = geos;

  let cap = 0;
  let meshes: THREE.InstancedMesh[] = [];
  let realShaft!: THREE.InstancedMesh, realTip!: THREE.InstancedMesh, decoyShaft!: THREE.InstancedMesh,
    decoyFletch!: THREE.InstancedMesh, lotus!: THREE.InstancedMesh, ring!: THREE.InstancedMesh;

  function build(n: number) {
    for (const m of meshes) { group.remove(m); m.dispose(); }
    cap = n;
    const mk = (g: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.InstancedMesh(g, mat, n);
      m.frustumCulled = false;
      m.count = 0;
      group.add(m);
      return m;
    };
    realShaft = mk(gRealShaft, gold);
    realTip = mk(gRealTip, tipMat);
    decoyShaft = mk(gDecoyShaft, grey);
    decoyFletch = mk(gDecoyFletch, greyDark);
    lotus = mk(gLotus, lotusMat);
    ring = mk(gRing, ringMat);
    meshes = [realShaft, realTip, decoyShaft, decoyFletch, lotus, ring];
  }

  const visuals = new Map<number, Visual>();
  /** Screen-projection sources: launched, still-flying arrows only. */
  let flying: { id: number; pos: THREE.Vector3 }[] = [];
  let lastT = -Infinity;

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  const stampQuat = new THREE.Quaternion();

  const to = chariotTarget();
  const missGround = (): Vec3 => ({ x: MISS_SPOT.x, y: groundHeight(MISS_SPOT.x, MISS_SPOT.z) + 0.05, z: MISS_SPOT.z });

  function flightPos(a: Arrow, progress: number): Vec3 {
    return arrowArc(Math.min(1, Math.max(0, progress)), laneStart(a.lane), to, ARC_HEIGHT);
  }

  function sync(run: Run) {
    const arrows = run.wave.arrows;
    if (arrows.length > cap) build(arrows.length);
    if (run.t < lastT) visuals.clear();
    lastT = run.t;
    game.camera.updateMatrixWorld();
    stampQuat.copy(game.camera.quaternion);
    const sight = opts.sight();
    flying = [];
    let nReal = 0, nDecoy = 0, nLotus = 0, nRing = 0;

    for (const a of arrows) {
      if (run.t < a.launch) continue;
      const progress = (run.t - a.launch) / a.flight;
      let p: Vec3;
      let ahead: Vec3;
      let fade = 1;
      let v = visuals.get(a.id);

      if (a.state === 'flying') {
        visuals.delete(a.id);
        p = flightPos(a, progress);
        ahead = flightPos(a, progress + 0.02);
        flying.push({ id: a.id, pos: new THREE.Vector3(p.x, p.y, p.z) });
      } else {
        if (!v || v.state !== a.state) {
          v = { state: a.state, since: run.t, from: flightPos(a, progress) };
          visuals.set(a.id, v);
        }
        const k = run.t - v.since;
        if (a.state === 'caught') {
          const u = Math.min(1, k / FADE);
          p = { x: v.from.x + (to.x - v.from.x) * u, y: v.from.y + (to.y - v.from.y) * u, z: v.from.z + (to.z - v.from.z) * u };
          ahead = to;
          fade = 1 - u;
        } else if (a.state === 'missed' && a.kind === 'real') {
          const g = missGround();
          const u = Math.min(1, k / 0.35);
          p = { x: v.from.x + (g.x - v.from.x) * u, y: v.from.y + (g.y - v.from.y) * u, z: v.from.z + (g.z - v.from.z) * u };
          ahead = g;
          fade = k < STUCK_HOLD ? 1 : Math.max(0, 1 - (k - STUCK_HOLD) / FADE);
        } else {
          p = v.from;
          ahead = to;
          fade = Math.max(0, 1 - k / FADE);
        }
        if (fade <= 0) continue;
      }

      dir.set(ahead.x - p.x, ahead.y - p.y, ahead.z - p.z);
      if (dir.lengthSq() < 1e-8) dir.set(-1, -0.2, 0);
      dir.normalize();
      quat.setFromUnitVectors(up, dir);
      pos.set(p.x, p.y, p.z);
      scl.setScalar(SCALE * fade);
      mat.compose(pos, quat, scl);

      if (a.kind === 'real') {
        realShaft.setMatrixAt(nReal, mat);
        realTip.setMatrixAt(nReal, mat);
        nReal++;
      } else {
        decoyShaft.setMatrixAt(nDecoy, mat);
        decoyFletch.setMatrixAt(nDecoy, mat);
        nDecoy++;
      }

      if (sight) {
        pos.y += 0.9 * SCALE * fade;
        scl.setScalar(SCALE * fade);
        mat.compose(pos, stampQuat, scl);
        if (a.kind === 'real') lotus.setMatrixAt(nLotus++, mat);
        else ring.setMatrixAt(nRing++, mat);
      }
    }

    const counts: [THREE.InstancedMesh, number][] = [
      [realShaft, nReal], [realTip, nReal], [decoyShaft, nDecoy], [decoyFletch, nDecoy], [lotus, nLotus], [ring, nRing],
    ];
    for (const [m, n] of counts) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  const ndc = new THREE.Vector3();
  function screenPoints(width: number, height: number) {
    game.camera.updateMatrixWorld();
    const out: { id: number; x: number; y: number }[] = [];
    for (const f of flying) {
      ndc.copy(f.pos).project(game.camera);
      if (ndc.z > 1 || ndc.z < -1) continue;
      out.push({ id: f.id, x: (ndc.x * 0.5 + 0.5) * width, y: (1 - (ndc.y * 0.5 + 0.5)) * height });
    }
    return out;
  }

  function dispose() {
    for (const m of meshes) { group.remove(m); m.dispose(); }
    meshes = [];
    game.root.remove(group);
    for (const g of geos) g.dispose();
    for (const m of [gold, tipMat, grey, greyDark, lotusMat, ringMat]) m.dispose();
    visuals.clear();
    flying = [];
  }

  build(32);
  return { sync, screenPoints, dispose };
}
