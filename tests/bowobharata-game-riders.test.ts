import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { ARJUNA_ARMS, KRISHNA_ARMS, createChariot, type ChariotPart } from '../src/lib/bowobharata/scene/chariot';
import { createRiders } from '../src/lib/bowobharata/scene/riders';
import { createContext } from '../src/lib/bowobharata/scene/effects';
import { createDetail } from '../src/lib/bowobharata/scene/materials';
import { qualityFor } from '../src/lib/bowobharata/scene/quality';
import { CHARIOT_SILHOUETTE } from '../src/lib/bowobharata-game/chase';
import { pagePrint } from './bowobharata-page-riders-print';

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
  // Recorded with bowobharata-page-riders-print.ts from the unchanged page code: a detached checkout of feat/bowobharata-game
  // at b664a05, whose src/lib/bowobharata/scene/ is the riders' base 486e625. Each mesh, line and sprite of both riders in
  // traversal order (kind, name, geometry and its parameters, local shape sums, world matrix, material), as built and after a
  // second of frames. Desktop and phone recorded identically.
  const PAGE = JSON.parse(readFileSync('tests/fixtures/bowobharata-page-riders.json', 'utf8'));

  it('builds and moves Krishna and Arjuna exactly as before, part by part, on desktops and phones', () => {
    for (const mobile of [false, true]) expect(pagePrint(mobile), `mobile ${mobile}`).toEqual(PAGE);
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
    expect(tips).toHaveLength(6);
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
    const starts = Array.from({ length: reins.count / 2 }, (_, i) => new THREE.Vector3().fromBufferAttribute(reins, i * 2));
    const hands = ['left', 'right'].map((side) => named(part.object, `krishna-hand-${side}`));
    // Every rein starts inside a fist, and each fist holds some.
    const holds = (hand: THREE.Object3D, p: THREE.Vector3) => new THREE.Box3().setFromObject(hand).expandByScalar(0.005).containsPoint(p);
    for (const p of starts) expect(hands.some((h) => holds(h, p)), `rein from ${p.toArray()}`).toBe(true);
    for (const h of hands) expect(starts.some((p) => holds(h, p)), h.name).toBe(true);
    const rest = hands.map(worldOf);
    let t = 0;
    for (const [speed, yawRate] of [[0, 0], [17, 1.2], [9, -1.4], [-5, 0.6]]) {
      t = drive(part, t, 3, speed, yawRate, () => hands.forEach((h, i) => expect(worldOf(h).distanceTo(rest[i])).toBeLessThan(1e-9)));
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
    // Slowly: the crown crosses its mean side to side at most 8 times in 20 s, no faster than 0.2 Hz.
    const mean = zs.reduce((sum, z) => sum + z, 0) / zs.length;
    let crossings = 0;
    for (let i = 1; i < zs.length; i++) if (Math.sign(zs[i] - mean) !== Math.sign(zs[i - 1] - mean)) crossings++;
    expect(crossings).toBeGreaterThan(0);
    expect(crossings).toBeLessThanOrEqual(8);
  });

  it('starts the cloth at its authored rest: the first frame moves no joint', () => {
    const part = chariot(true);
    const joints: THREE.Object3D[] = [];
    for (const name of ['krishna', 'arjuna']) named(part.object, name).traverse((n) => { if (n.children.some((c) => c.name === 'cloth')) joints.push(n); });
    expect(joints).toHaveLength(18);
    const authored = joints.map((j) => [j.rotation.x, j.rotation.z]);
    // Each end hangs a little back at rest.
    expect(authored.filter(([, z]) => z < -0.05)).toHaveLength(6);
    part.rig!.setMotion({ speed: 0, yawRate: 0, boost: false });
    part.update(FRAME, 0);
    joints.forEach((j, i) => {
      expect(Math.abs(j.rotation.x - authored[i][0]), `joint ${i}`).toBeLessThan(1e-6);
      expect(Math.abs(j.rotation.z - authored[i][1]), `joint ${i}`).toBeLessThan(1e-6);
    });
  });

  it('swings the cloth with the wind it is given, the wind the page scarf swings in', () => {
    const tipsAt = (wind: number) => {
      const riders = createRiders(context(), { krishna: KRISHNA_ARMS.reins, arjuna: ARJUNA_ARMS.lowered });
      const still = { speed: 0, yawRate: 0, boost: false };
      for (let f = 1; f <= 180; f++) riders.update(f * FRAME, FRAME, still, wind);
      const xs: number[] = [];
      for (const g of [riders.krishna, riders.arjuna]) {
        g.updateMatrixWorld(true);
        g.traverse((n) => { if (n.name.endsWith('-tip')) xs.push(worldOf(n).x); });
      }
      return xs;
    };
    const ahead = tipsAt(0.45);
    const behind = tipsAt(-0.45);
    expect(ahead).toHaveLength(6);
    ahead.forEach((x, i) => expect(x - behind[i], `tip ${i}`).toBeGreaterThan(0.08));
  });
});

describe('Krishna’s hair', () => {
  it('reads from behind: locks down the back of his neck, seen between the prabha’s rings', () => {
    const part = chariot(true);
    const solid = meshesUnder(named(part.object, 'krishna'));
    const ray = new THREE.Raycaster();
    // He stands at (0.55, 1.3, 0). Rays from behind at the back of his neck pass between the prabha's inner and outer rings.
    for (const y of [1.5, 1.52, 1.54]) {
      for (const z of [-0.03, 0, 0.03]) {
        ray.set(new THREE.Vector3(-3, 1.3 + y, z), new THREE.Vector3(1, 0, 0));
        expect(ray.intersectObjects(solid, false)[0]?.object.name, `y ${y}, z ${z}`).toBe('krishna-locks');
      }
    }
  });
});

describe('Arjuna’s armour', () => {
  it('is closed over his shoulders: rays straight down meet him within 8 cm of the breastplate’s top', () => {
    for (const mobile of [false, true]) {
      const part = chariot(true, mobile);
      const solid = meshesUnder(named(part.object, 'arjuna'));
      const ray = new THREE.Raycaster();
      let rays = 0;
      // He stands at (−0.55, 1.3, 0.1); the breastplate's top is 1.47 m up in his figure. Over his torso, inside the plate's
      // rim, and over each shoulder guard.
      for (let i = 0; i <= 17; i++) {
        for (let k = 0; k <= 60; k++) {
          const x = -0.08 + i * 0.01;
          const z = -0.3 + k * 0.01;
          if (((x - 0.004) / 0.07) ** 2 + (z / 0.15) ** 2 >= 1 && Math.hypot(x, Math.abs(z) - 0.24) >= 0.05) continue;
          rays++;
          ray.set(new THREE.Vector3(-0.55 + x, 5, 0.1 + z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObjects(solid, false)[0];
          expect(hit?.point.y ?? -Infinity, `x ${x.toFixed(2)}, z ${z.toFixed(2)}, mobile ${mobile}`).toBeGreaterThanOrEqual(1.3 + 1.47 - 0.08);
        }
      }
      expect(rays).toBeGreaterThan(200);
    }
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
      // Each spike (ConeGeometry(0.035, 0.15, 4): apex at y +0.075, base corners 0.035 out on x and z at y −0.075): its tip,
      // its middle, the centre and corners of its base, five points down each sloping edge and three along each base edge.
      const apex = new THREE.Vector3(0, 0.075, 0);
      const corners = [[0.035, 0], [0, 0.035], [-0.035, 0], [0, -0.035]].map(([x, z]) => new THREE.Vector3(x, -0.075, z));
      const LOCAL = [apex, new THREE.Vector3(), new THREE.Vector3(0, -0.075, 0), ...corners];
      corners.forEach((c, i) => {
        for (let k = 1; k <= 5; k++) LOCAL.push(apex.clone().lerp(c, k / 6));
        for (let k = 1; k <= 3; k++) LOCAL.push(c.clone().lerp(corners[(i + 1) % 4], k / 4));
      });
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
  }, 120_000);
});

describe('the riders’ per-frame code', () => {
  const RIDERS_SRC = readFileSync('src/lib/bowobharata/scene/riders.ts', 'utf8');
  /** What allocates in riders.ts's per-frame code, from `function animate(` to the end with comments stripped, rule by rule. */
  function perFrameProblems(src: string): string[] {
    const from = src.indexOf('function animate(');
    if (from < 0) return ['no function animate('];
    const code = src.slice(from).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const rules: [string, RegExp][] = [
      ['new', /\bnew\s/],
      ['arrow function', /=>/],
      ['array or object literal', /(?:[=(,:?&|!]|\b(?:return|of|in|throw))\s*[[{]/],
      ['spread', /\.\.\./],
      ['array helper', /\.(map|filter|forEach|reduce|flatMap|slice|concat|some|every|find|from|of)\(/],
    ];
    const problems = rules.filter(([, re]) => re.test(code)).map(([rule]) => rule);
    // Every function here is declared on its own at the start of a line, so none is made anew inside a frame.
    if ((code.match(/\bfunction\b/g) ?? []).length !== (code.match(/^function\b/gm) ?? []).length) problems.push('function expression or nested function');
    if (code.length < 500) problems.push('too short to be the per-frame code');
    return problems;
  }

  it('allocates nothing: no new, no closure or function made in a frame, no array or object literal, no spread, no array helper', () => {
    expect(perFrameProblems(RIDERS_SRC)).toEqual([]);
  });

  it('catches each way a frame could allocate, put into animate()', () => {
    const body = RIDERS_SRC.indexOf('{', RIDERS_SRC.indexOf('function animate(')) + 1;
    for (const line of [
      'for (const r of [k, a]) r.head.rotation.y = 0;',
      'if (dt < 0) return [dt, dt];',
      'const q = speed > 0 && [speed];',
      'const o = dt || { s: speed };',
      'const f = function () { return dt; };',
    ]) expect(perFrameProblems(`${RIDERS_SRC.slice(0, body)}\n  ${line}${RIDERS_SRC.slice(body)}`), line).not.toEqual([]);
  });
});

describe('the riders in the chariot', () => {
  it('sway their cloth at a standstill in the chariot’s wind', () => {
    const part = chariot(true);
    // The scarf ends hang from Krishna's elbows, which stay still: only the wind moves them at a standstill.
    const tips = allNamed(part.object, 'krishna-scarf-tip');
    expect(tips).toHaveLength(2);
    const xs = tips.map(() => [] as number[]);
    drive(part, 0, 12, 0, 0, () => tips.forEach((tip, i) => xs[i].push(worldOf(tip).x)));
    for (const x of xs) expect(Math.max(...x) - Math.min(...x)).toBeGreaterThan(0.03);
  });

  it('are wired in chariot.ts: the page scarf’s driver runs on the page only, and the riders get the same wind', () => {
    const chariot = readFileSync('src/lib/bowobharata/scene/chariot.ts', 'utf8');
    expect(chariot.match(/scarfDriver\(/g)).toHaveLength(1);
    expect(chariot).toMatch(/^\s*if \(!drivable\) scarfDriver\(wind, dt\);$/m);
    expect(chariot).toMatch(/^\s*riders\?\.update\(time, dt, motion, wind\);$/m);
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
    // Its rings and spikes all glow in one material.
    const fires = new Set(prabha.getObjectsByProperty('isMesh', true).map((m) => (m as THREE.Mesh).material));
    expect(fires.size).toBe(1);
    const fire = [...fires][0] as THREE.MeshStandardMaterial;
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

describe('the sash ends against their riders’ garments', () => {
  const BACK = new THREE.Vector3(-1, 0, 0);
  /** Faceting allowance: a sash end's centre line may sit at most this far (m) inside its rider's dhoti or kilt. */
  const TOL = 0.002;

  /**
   * The back half of a rider's silk below the waist, all that a sash end can reach, as its own two-sided mesh at the silk's
   * place: fewer triangles to cast against. Its world matrix is copied from the silk's each time it is used.
   */
  function backOf(silk: THREE.Mesh): THREE.Mesh {
    const geo = silk.geometry;
    const pos = geo.getAttribute('position');
    const index = geo.index!;
    const keep: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      if ((pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3 < 0.03 && (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3 < 1.02) keep.push(a, b, c);
    }
    const back = new THREE.BufferGeometry();
    back.setAttribute('position', pos);
    back.setIndex(keep);
    return new THREE.Mesh(back, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  }
  /** Points along a sash end's segments 1 and 2, the tip's chain; segment 0 hangs from the knot at the hip, in it by design. */
  function sashPoints(tip: THREE.Object3D): THREE.Vector3[] {
    const last = tip.parent!;
    const middle = last.parent!;
    const out: THREE.Vector3[] = [];
    for (const [from, to] of [[middle, last], [last, tip]]) {
      const a = worldOf(from);
      const b = worldOf(to);
      for (let k = 0; k <= 4; k++) out.push(a.clone().lerp(b, k / 4));
    }
    return out;
  }
  /** How far inside the garment a point is: the length of a backward ray that leaves through it, or 0 outside. */
  function depthIn(garment: THREE.Mesh, p: THREE.Vector3, ray: THREE.Raycaster): number {
    ray.set(p, BACK);
    const hit = ray.intersectObject(garment, false)[0];
    if (!hit) return 0;
    return hit.face!.normal.clone().transformDirection(garment.matrixWorld).dot(BACK) > 0 ? hit.distance : 0;
  }

  it('never sink into their rider’s dhoti or kilt: standing, backing up and driving, through a minute of wind, on both tiers', () => {
    const ray = new THREE.Raycaster();
    for (const mobile of [false, true]) {
      for (const speed of [0, -2, -4, 6]) {
        const part = chariot(true, mobile);
        const riders = (['krishna', 'arjuna'] as const).map((rider) => {
          const silk = named(part.object, `${rider}-silk`) as THREE.Mesh;
          const tips = allNamed(part.object, `${rider}-sash-tip`);
          expect(tips, rider).toHaveLength(2);
          return { rider, silk, back: backOf(silk), tips, deepest: 0 };
        });
        // Two seconds to settle, then a minute, five looks a second.
        let frame = 0;
        drive(part, 0, 62, speed, 0, (t) => {
          if (t < 2 || frame++ % 12 !== 0) return;
          for (const r of riders) {
            r.back.matrixWorld.copy(r.silk.matrixWorld);
            for (const tip of r.tips) for (const p of sashPoints(tip)) r.deepest = Math.max(r.deepest, depthIn(r.back, p, ray));
          }
        });
        for (const r of riders) expect(r.deepest, `${r.rider}, ${speed} m/s, mobile ${mobile}`).toBeLessThanOrEqual(TOL);
      }
    }
  }, 120_000);
});
