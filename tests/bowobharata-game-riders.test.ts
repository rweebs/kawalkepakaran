import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createChariot, type ChariotPart } from '../src/lib/bowobharata/scene/chariot';
import { createContext } from '../src/lib/bowobharata/scene/effects';
import { createDetail } from '../src/lib/bowobharata/scene/materials';
import { qualityFor } from '../src/lib/bowobharata/scene/quality';
import { CHARIOT_SILHOUETTE } from '../src/lib/bowobharata-game/chase';

// No DOM under vitest: a canvas whose 2D context swallows every call, so the texture painters run without drawing.
function stubCanvas() {
  const g: unknown = new Proxy(function () {}, { get: () => g, apply: () => g, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => g }) });
}
beforeEach(stubCanvas);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const FRAME = 1 / 60;
const context = (mobile = false) => createContext(qualityFor(mobile, 1), new THREE.PerspectiveCamera(), createDetail(8));
/** The chariot with its root at the origin, so world coordinates are chariot-local. */
function chariot(drivable: boolean, mobile = false): ChariotPart {
  const part = createChariot(context(mobile), { drivable });
  part.object.position.set(0, 0, 0);
  part.object.updateMatrixWorld(true);
  return part;
}
function named(root: THREE.Object3D, name: string): THREE.Object3D {
  const o = root.getObjectByName(name);
  expect(o, name).toBeDefined();
  return o!;
}
function allNamed(root: THREE.Object3D, name: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((n) => { if (n.name === name) out.push(n); });
  return out;
}
const meshesUnder = (o: THREE.Object3D) => o.getObjectsByProperty('isMesh', true) as THREE.Mesh[];
const limitOf = (name: string) => CHARIOT_SILHOUETTE.find((s) => s.name === name)!.y + 0.02;
/** Runs the chariot from `t` for `seconds` at one motion; returns the time reached. */
function drive(part: ChariotPart, t: number, seconds: number, speed: number, yawRate = 0, each?: (t: number) => void): number {
  part.rig!.setMotion({ speed, yawRate, boost: false });
  const end = t + seconds;
  while (t < end - 1e-9) {
    t += FRAME;
    part.update(t, 0);
    part.object.updateMatrixWorld(true);
    each?.(t);
  }
  return t;
}
const worldOf = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

describe('the page’s riders', () => {
  // Recorded from the page chariot before the game's riders were built (drivable: false, root at the origin, before any
  // update), on both tiers alike: mesh and line counts, vertex counts, the box and coordinate sum of the solid parts (the
  // glows are left out: Krishna's 6 m halo would swallow any change), and the material colours.
  const PAGE = {
    krishna: { meshes: 44, lines: 0, sprites: 3, verts: 4729, sum: 15923.359, min: [0.175, 1.301, -0.3615], max: [1.165, 4.045, 0.3005], colours: ['120c0a', '1e3c96', '2f4c8c', 'd4a24a', 'f0b62a', 'f6f1e4', 'ffd76a', 'ffffff'] },
    arjuna: { meshes: 20, lines: 1, sprites: 0, verts: 2879, sum: 6523.263, min: [-0.7156, 1.301, -0.194], max: [-0.035, 3.5215, 0.4192], colours: ['120c0a', '5b3a1e', '7a1e2a', 'b07e5a', 'c9ced8', 'd4a24a', 'efe6cf'] },
  };
  function fingerprint(rider: THREE.Object3D) {
    let meshes = 0; let lines = 0; let sprites = 0; let verts = 0; let sum = 0;
    const box = new THREE.Box3();
    const colours = new Set<string>();
    const p = new THREE.Vector3();
    rider.traverse((n) => {
      if ((n as THREE.Sprite).isSprite) sprites++;
      if (!(n as THREE.Mesh).isMesh && !(n as THREE.Line).isLine) return;
      if ((n as THREE.Mesh).isMesh) meshes++; else lines++;
      const pos = (n as THREE.Mesh).geometry.getAttribute('position');
      verts += pos.count;
      for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld); sum += p.x + p.y + p.z; }
      box.expandByObject(n, true);
      for (const m of ([] as THREE.Material[]).concat((n as THREE.Mesh).material)) colours.add((m as THREE.MeshStandardMaterial).color.getHexString());
    });
    const r = (v: number) => Math.round(v * 1e4) / 1e4;
    return { meshes, lines, sprites, verts, sum: Math.round(sum * 1e3) / 1e3, min: box.min.toArray().map(r), max: box.max.toArray().map(r), colours: [...colours].sort() };
  }

  it('builds Krishna and Arjuna exactly as before, on desktops and phones', () => {
    for (const mobile of [false, true]) {
      const part = chariot(false, mobile);
      for (const name of ['krishna', 'arjuna'] as const) expect(fingerprint(named(part.object, name)), `${name} ${mobile}`).toEqual(PAGE[name]);
    }
  });
});

describe('the game’s riders', () => {
  const RIDERS = ['krishna', 'arjuna'] as const;
  /** Meshes that count against a rider's budget: all but the cloth chains' segments, and the prabha's rings and spikes. */
  const budgeted = (rider: THREE.Object3D) => {
    const prabha = new Set(meshesUnder(rider.getObjectByName('prabha') ?? new THREE.Group()));
    return meshesUnder(rider).filter((m) => m.name !== 'cloth' && !prabha.has(m));
  };
  const triangles = (rider: THREE.Object3D) => meshesUnder(rider).reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3, 0);

  it('merges each rider into at most 14 meshes, besides the cloth chains', () => {
    for (const mobile of [false, true]) {
      const part = chariot(true, mobile);
      for (const name of RIDERS) {
        const rider = named(part.object, name);
        const n = budgeted(rider).length;
        expect(n, `${name} ${mobile}`).toBeLessThanOrEqual(14);
        expect(n, `${name} ${mobile}`).toBeGreaterThanOrEqual(5);
        expect(meshesUnder(rider).some((m) => m.name === 'cloth'), name).toBe(true);
      }
    }
  });

  it('keeps each rider under 30k triangles on desktop, and fewer on phones', () => {
    const desk = chariot(true, false);
    const phone = chariot(true, true);
    for (const name of RIDERS) {
      const d = triangles(named(desk.object, name));
      const p = triangles(named(phone.object, name));
      expect(d, name).toBeLessThanOrEqual(30_000);
      expect(d, name).toBeGreaterThan(4_000);
      expect(p, name).toBeLessThan(d * 0.75);
    }
  });

  it('carries no weapon', () => {
    const part = chariot(true);
    for (const name of RIDERS) {
      named(part.object, name).traverse((n) => expect(n.name, `${name}: ${n.name}`).not.toMatch(/bow|arrow|quiver|sword|spear|mace/i));
    }
  });

  it('makes its materials per scene: two chariots share none', () => {
    const mats = (part: ChariotPart) => new Set(RIDERS.flatMap((name) => meshesUnder(named(part.object, name)).flatMap((m) => ([] as THREE.Material[]).concat(m.material))));
    const a = mats(chariot(true));
    for (const m of mats(chariot(true))) expect(a.has(m)).toBe(false);
  });

  it('builds the same riders every time: no randomness', () => {
    const positions = (part: ChariotPart) => RIDERS.flatMap((name) => meshesUnder(named(part.object, name)).map((m) => Array.from(m.geometry.getAttribute('position').array as Float32Array)));
    expect(positions(chariot(true))).toEqual(positions(chariot(true)));
    const src = readFileSync('src/lib/bowobharata/scene/riders.ts', 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});

describe('the game’s riders in motion', () => {
  /** The angle (rad) by which a rider's head faces left of the rider: + about the y axis. */
  function headTurn(part: ChariotPart, rider: 'krishna' | 'arjuna'): number {
    const body = named(part.object, rider);
    const head = named(part.object, `${rider}-head`);
    const q = body.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(head.getWorldQuaternion(new THREE.Quaternion()));
    const face = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    return Math.atan2(-face.z, face.x);
  }

  it('turns both heads toward the turn, damped and never past 0.3 rad', () => {
    for (const rider of ['krishna', 'arjuna'] as const) {
      const part = chariot(true);
      let t = drive(part, 0, 1, 0);
      expect(Math.abs(headTurn(part, rider)), rider).toBeLessThan(0.01);
      // Damped: a turn read on the first frame barely moves the head.
      t = drive(part, t, FRAME, 9, 1);
      expect(headTurn(part, rider), rider).toBeGreaterThan(0);
      expect(headTurn(part, rider), rider).toBeLessThan(0.05);
      t = drive(part, t, 5, 9, 1);
      const left = headTurn(part, rider);
      expect(left, rider).toBeGreaterThan(0.12);
      expect(left, rider).toBeLessThanOrEqual(0.3);
      t = drive(part, t, 5, 9, -1);
      expect(headTurn(part, rider), rider).toBeCloseTo(-left, 3);
      for (const yawRate of [3, -3, 1e6, -1e6]) {
        drive(part, t, 2, 12, yawRate, () => expect(Math.abs(headTurn(part, rider)), `${rider} ${yawRate}`).toBeLessThanOrEqual(0.3));
      }
    }
  });

  it('keeps the feather, the crown and the prabha under their silhouette points through every idle and turn', () => {
    const part = chariot(true);
    const top = (name: string) => new THREE.Box3().setFromObject(named(part.object, name)).max.y;
    const check = () => { for (const name of ['krishna-feather', 'arjuna-crown', 'prabha']) expect(top(name), name).toBeLessThanOrEqual(limitOf(name)); };
    let t = drive(part, 0, 12, 0, 0, check); // Arjuna's slow shift of weight, both ways
    for (const yawRate of [1, -1, 3, -3]) t = drive(part, t, 2.5, 9, yawRate, check);
  });

  it('streams the scarf’s and both sashes’ ends back with speed, and keeps them calm in reverse', () => {
    const CLOTH = ['krishna-scarf-tip', 'krishna-sash-tip', 'arjuna-sash-tip'];
    const settle = (speed: number) => {
      const part = chariot(true);
      drive(part, 0, 4, speed);
      // The average over the last second, so the flutter does not decide it.
      const sums = new Map<THREE.Object3D, number>();
      drive(part, 4, 1, speed, 0, () => {
        for (const name of CLOTH) for (const tip of allNamed(part.object, name)) sums.set(tip, (sums.get(tip) ?? 0) + worldOf(tip).x * FRAME);
      });
      return CLOTH.map((name) => allNamed(part.object, name).map((tip) => sums.get(tip)!));
    };
    const still = settle(0);
    const fast = settle(17);
    const back = settle(-5);
    CLOTH.forEach((name, i) => {
      expect(still[i].length, name).toBeGreaterThanOrEqual(1);
      still[i].forEach((x, j) => {
        expect(fast[i][j], `${name} ${j}`).toBeLessThan(x - 0.15);
        expect(Number.isFinite(back[i][j]), `${name} ${j}`).toBe(true);
        // Backing up, the wind comes from behind: the ends lean forward a little, never far.
        expect(back[i][j] - x, `${name} ${j}`).toBeLessThan(0.12);
      });
    });
  });

  it('never whips the cloth forward when the chariot backs up from full speed', () => {
    const part = chariot(true);
    const tips = ['krishna-scarf-tip', 'krishna-sash-tip', 'arjuna-sash-tip'].flatMap((n) => allNamed(part.object, n));
    drive(part, 0, 4, 0);
    const rest = tips.map((tip) => worldOf(tip).x);
    let t = drive(part, 4, 4, 17);
    // Brake through a standstill into reverse at 22 m/s², then hold −5 m/s.
    for (let v = 17; v > -5; v -= 22 * FRAME) {
      t = drive(part, t, FRAME, v, 0, () => tips.forEach((tip, i) => expect(worldOf(tip).x - rest[i], `tip ${i}`).toBeLessThan(0.2)));
    }
    drive(part, t, 3, -5, 0, () => tips.forEach((tip, i) => {
      expect(worldOf(tip).x - rest[i], `tip ${i}`).toBeLessThan(0.2);
      expect(Number.isFinite(worldOf(tip).y), `tip ${i}`).toBe(true);
    }));
  });

  it('keeps Krishna’s hands on the reins through every motion', () => {
    const part = chariot(true);
    const reins = (named(part.object, 'reins') as THREE.LineSegments).geometry.getAttribute('position');
    const holds = [0, 1].map((side) => {
      const hand = named(part.object, side ? 'krishna-hand-right' : 'krishna-hand-left');
      return { hand, start: worldOf(hand) };
    });
    for (const { start } of holds) {
      // Each fist closes round the start of its own side's reins.
      let nearest = Infinity;
      for (let i = 0; i < reins.count; i += 2) nearest = Math.min(nearest, start.distanceTo(new THREE.Vector3().fromBufferAttribute(reins, i)));
      expect(nearest).toBeLessThan(0.05);
    }
    let t = 0;
    for (const [speed, yawRate] of [[0, 0], [17, 1.2], [9, -1.4], [-5, 0.6]]) {
      t = drive(part, t, 3, speed, yawRate, () => { for (const { hand, start } of holds) expect(worldOf(hand).distanceTo(start)).toBeLessThan(1e-9); });
    }
  });

  it('breathes slowly: each chest swells by at most 1.5 %, no faster than 0.3 Hz', () => {
    for (const rider of ['krishna', 'arjuna']) {
      const part = chariot(true);
      const chest = named(part.object, `${rider}-chest`);
      let lo = Infinity; let hi = -Infinity; let crossings = 0; let before = 0;
      drive(part, 0, 20, 0, 0, () => {
        const s = chest.scale.x;
        lo = Math.min(lo, s); hi = Math.max(hi, s);
        const sign = Math.sign(s - 1);
        if (sign !== 0 && before !== 0 && sign !== before) crossings++;
        if (sign !== 0) before = sign;
      });
      expect(hi - 1, rider).toBeLessThanOrEqual(0.015);
      expect(1 - lo, rider).toBeLessThanOrEqual(0.015);
      expect(hi - lo, rider).toBeGreaterThan(0.004);
      // Two crossings of the rest scale per breath: 20 s at 0.3 Hz is at most 12.
      expect(crossings, rider).toBeLessThanOrEqual(12);
    }
  });

  it('shifts Arjuna’s weight slightly, slowly', () => {
    const part = chariot(true);
    const crown = named(part.object, 'arjuna-crown');
    const xs: number[] = [];
    const zs: number[] = [];
    drive(part, 0, 20, 0, 0, () => { const p = worldOf(crown); xs.push(p.x); zs.push(p.z); });
    const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
    expect(spread(zs) + spread(xs)).toBeGreaterThan(0.01);
    expect(spread(zs)).toBeLessThan(0.08);
    expect(spread(xs)).toBeLessThan(0.08);
    // At most 2 Hz: no frame moves the crown by more than 2π × 2 Hz × the sway's reach per second.
    for (let i = 1; i < zs.length; i++) expect(Math.hypot(zs[i] - zs[i - 1], xs[i] - xs[i - 1])).toBeLessThan(2 * Math.PI * 2 * 0.08 * FRAME);
  });
});

describe('the prabha behind the game’s Krishna', () => {
  /** The parts of Krishna's head the turning spikes must never pass through. */
  const GEAR = /^krishna-(feather|crown|hair|locks)$/;

  it('never passes its spikes through his feather, crown or hair, his head still or turned, over a full turn', () => {
    for (const yawRate of [0, 3, -3]) {
      const part = chariot(true);
      let t = drive(part, 0, 3, 9, yawRate);
      const gear = meshesUnder(named(part.object, 'krishna')).filter((m) => GEAR.test(m.name));
      expect(gear.map((m) => m.name).sort(), `${yawRate}`).toEqual(expect.arrayContaining(['krishna-crown', 'krishna-feather', 'krishna-hair']));
      for (const m of gear) for (const mat of ([] as THREE.Material[]).concat(m.material)) mat.side = THREE.DoubleSide;
      const spikes = named(part.object, 'prabha').getObjectsByProperty('isMesh', true).filter((m) => (m as THREE.Mesh).geometry.type === 'ConeGeometry');
      expect(spikes).toHaveLength(16);
      // Each spike's tip, and the corners and centre of its base (ConeGeometry(0.035, 0.15, 4): apex at y +0.075).
      const LOCAL = [[0, 0.075, 0], [0, -0.075, 0], [0.035, -0.075, 0], [-0.035, -0.075, 0], [0, -0.075, 0.035], [0, -0.075, -0.035], [0, 0, 0]].map((p) => new THREE.Vector3(...p));
      const sample = () => spikes.flatMap((s) => LOCAL.map((p) => p.clone().applyMatrix4(s.matrixWorld)));
      const ray = new THREE.Raycaster();
      let prev = sample();
      // A full turn at 0.8 rad/s in steps of 0.04 rad: each step a 2 cm chord of the tips' circle.
      const step = 0.04 / 0.8;
      for (let k = 0; k < Math.ceil((2 * Math.PI) / 0.04); k++) {
        t = drive(part, t, step - 1e-12, 9, yawRate);
        const now = sample();
        now.forEach((p, i) => {
          const d = p.clone().sub(prev[i]);
          const len = d.length();
          if (len < 1e-9) return;
          ray.set(prev[i], d.divideScalar(len));
          ray.far = len;
          const hit = ray.intersectObjects(gear, false)[0];
          expect(hit?.object.name ?? null, `yawRate ${yawRate}, t ${t.toFixed(3)}, point ${i}`).toBeNull();
        });
        prev = now;
      }
    }
  }, 60_000);
});

describe('the riders’ per-frame code', () => {
  it('allocates nothing: no new, and no array helpers that build arrays or closures, from function animate( to the end', () => {
    const src = readFileSync('src/lib/bowobharata/scene/riders.ts', 'utf8');
    const from = src.indexOf('function animate(');
    expect(from).toBeGreaterThan(0);
    const frame = src.slice(from);
    expect(frame).not.toMatch(/\bnew\s/);
    expect(frame).not.toMatch(/\.(map|filter|forEach|reduce|flatMap|slice|concat)\(/);
    expect(frame).not.toMatch(/=>\s*\(?\{|\[\s*\.\.\./);
  });
});

describe('the prabha seen from the side', () => {
  /** The drivable chariot at the origin, seen by `camera`. */
  function seenBy(camera: THREE.PerspectiveCamera): ChariotPart {
    const part = createChariot(createContext(qualityFor(false, 1), camera, createDetail(8)), { drivable: true });
    part.object.position.set(0, 0, 0);
    part.object.updateMatrixWorld(true);
    return part;
  }
  const cameraAt = (camera: THREE.PerspectiveCamera, x: number, y: number, z: number) => {
    camera.position.set(x, y, z);
    camera.updateMatrixWorld(true);
    return camera;
  };
  /** Reads the prabha's light: its rings' emissive intensity, then its two glows' opacities, the smaller glow first. */
  function lightOf(part: ChariotPart): () => number[] {
    const prabha = named(part.object, 'prabha');
    const fire = (prabha.getObjectsByProperty('isMesh', true)[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const glows = named(part.object, 'krishna').children
      .filter((c) => (c as THREE.Sprite).isSprite && c.position.distanceTo(prabha.position) < 1e-9)
      .sort((a, b) => a.scale.x - b.scale.x) as THREE.Sprite[];
    expect(glows).toHaveLength(2);
    return () => [fire.emissiveIntensity, glows[0].material.opacity, glows[1].material.opacity];
  }
  // The prabha centre is at (0.45, 3.05, 0) in the chariot; its rings face along x.
  const TODAY = [2.6, 0.6, 0.15];
  const EDGE_ON = [0.45, 3.05, 12] as const;

  it('is exactly as today seen face-on: from the chase camera behind, as it swings, and from in front', () => {
    for (const [x, y, z] of [[-10, 7, 0], [-9.5, 7, 3.5], [-11, 7, -4], [12, 4, -2]]) {
      const camera = cameraAt(new THREE.PerspectiveCamera(), x, y, z);
      const part = seenBy(camera);
      const light = lightOf(part);
      drive(part, 0, 3, 9, 0.4, () => expect(light(), `${x} ${y} ${z}`).toEqual(TODAY));
    }
  });

  it('dims seen edge-on from the side, and is never brighter than today', () => {
    const camera = cameraAt(new THREE.PerspectiveCamera(), ...EDGE_ON);
    const part = seenBy(camera);
    const light = lightOf(part);
    drive(part, 0, 4, 0, 0, () => light().forEach((v, i) => expect(v, `${i}`).toBeLessThanOrEqual(TODAY[i])));
    light().forEach((v, i) => expect(v, `${i}`).toBeLessThan(TODAY[i] * 0.5));
  });

  it('eases each way with a time constant of at least 0.5 s', () => {
    const camera = cameraAt(new THREE.PerspectiveCamera(), -10, 7, 0);
    const part = seenBy(camera);
    const light = lightOf(part);
    let t = drive(part, 0, 1, 0);
    // Round to the side at once: no frame takes more than 1 − e^(−dt / 0.5) of the way, and half a second at most 1 − 1/e.
    cameraAt(camera, ...EDGE_ON);
    const step = 1 - Math.exp(-FRAME / 0.5);
    let before = light();
    t = drive(part, t, 0.5, 0, 0, () => {
      const now = light();
      now.forEach((v, i) => expect(before[i] - v, `${i}`).toBeLessThanOrEqual(step * (TODAY[i] - 0) + 1e-9));
      before = now;
    });
    const half = light();
    t = drive(part, t, 15, 0);
    const edge = light();
    edge.forEach((v, i) => expect(v, `${i}`).toBeLessThan(TODAY[i] * 0.5));
    half.forEach((v, i) => expect(v, `${i}`).toBeGreaterThanOrEqual(TODAY[i] - (1 - Math.exp(-1)) * (TODAY[i] - edge[i]) - 1e-6));
    // And back round behind: it rises as slowly, all the way to today's light.
    cameraAt(camera, -10, 7, 0);
    before = light();
    t = drive(part, t, 0.5, 0, 0, () => {
      const now = light();
      now.forEach((v, i) => expect(v - before[i], `${i}`).toBeLessThanOrEqual(step * TODAY[i] + 1e-9));
      before = now;
    });
    light().forEach((v, i) => expect(v, `${i}`).toBeLessThanOrEqual(edge[i] + (1 - Math.exp(-1)) * (TODAY[i] - edge[i]) + 1e-6));
    drive(part, t, 60, 0);
    expect(light()).toEqual(TODAY);
  });
});
