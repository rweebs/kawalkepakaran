import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gaitAt, spinWheel } from '../src/lib/bowobharata/scene/gait';
import { ARJUNA_ARMS, KRISHNA_ARMS, createChariot, type ChariotPart } from '../src/lib/bowobharata/scene/chariot';
import { armyMotion, createArmies, frontClip } from '../src/lib/bowobharata/scene/army';
import { CLIP } from '../src/lib/bowobharata/scene/soldiers';
import { createContext } from '../src/lib/bowobharata/scene/effects';
import { createDetail } from '../src/lib/bowobharata/scene/materials';
import { qualityFor } from '../src/lib/bowobharata/scene/quality';
import type { LoadedModels } from '../src/lib/bowobharata/scene/models';
import { formation } from '../src/lib/bowobharata/stage-math';
import { CHARIOT_SILHOUETTE } from '../src/lib/bowobharata-game/chase';

// No DOM under vitest: a canvas whose 2D context swallows every call, so the texture painters run without drawing.
function stubCanvas() {
  const g: unknown = new Proxy(function () {}, { get: () => g, apply: () => g, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => g }) });
}

const context = () => createContext(qualityFor(false, 1), new THREE.PerspectiveCamera(), createDetail(8));
const DECK = 1.3;
const FRAME = 1 / 60;

function named(part: { object: THREE.Object3D }, name: string): THREE.Object3D {
  const o = part.object.getObjectByName(name);
  expect(o, name).toBeDefined();
  return o!;
}
const opacity = (o: THREE.Object3D) => ((o as THREE.Sprite).material as THREE.SpriteMaterial).opacity;
const spritesUnder = (o: THREE.Object3D) => {
  const out: THREE.Sprite[] = [];
  o.traverse((n) => { if ((n as THREE.Sprite).isSprite) out.push(n as THREE.Sprite); });
  return out;
};
/** The chariot with its root moved to the origin, so world coordinates are chariot-local. */
function atOrigin(part: ChariotPart): ChariotPart {
  part.object.position.set(0, 0, 0);
  part.object.updateMatrixWorld(true);
  return part;
}
/** The procedural horses' hind legs: the legs pivot at the hip, x −0.68 in each horse (anatomy.ts). */
function hindLegs(part: ChariotPart): THREE.Object3D[] {
  const horses = part.object.children.filter((c) => c.type === 'Group' && c.position.x === 3.1);
  expect(horses).toHaveLength(4);
  return horses.flatMap((h) => h.children.filter((c) => c.type === 'Group' && c.position.x === -0.68));
}

// Stand-ins for the three loaded models: named bones where the scene looks for them, and every clip it may play.
function fakeRig(bones: Record<string, [number, number, number]>, clips: string[]): GLTF {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.5), new THREE.MeshStandardMaterial()));
  for (const [name, p] of Object.entries(bones)) {
    const b = new THREE.Object3D();
    b.name = name;
    b.position.set(...p);
    scene.add(b);
  }
  return { scene, animations: clips.map((n) => new THREE.AnimationClip(n, 1, [])) } as unknown as GLTF;
}
function fakeSoldier(): GLTF {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0, 1, 1, 0], 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geo.setIndex([0, 1, 2, 3, 4, 5]);
  const hip = new THREE.Bone();
  const arm = new THREE.Bone();
  arm.name = 'arm';
  arm.position.set(1, 0, 0);
  hip.add(arm);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
  mesh.add(hip);
  mesh.bind(new THREE.Skeleton([hip, arm]));
  const scene = new THREE.Group();
  scene.add(mesh);
  const turn = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a).toArray();
  const clip = (n: string, a: number) => new THREE.AnimationClip(n, 1, [new THREE.QuaternionKeyframeTrack('arm.quaternion', [0, 1], [0, 0, 0, 1, ...turn(a)])]);
  return { scene, animations: [clip('Walk', 0.5), clip('Idle', 0.1), clip('Punch', 1), clip('Run', 0.8)] } as unknown as GLTF;
}
const BASE_CLIPS = ['Idle_Loop', 'Pistol_Aim_Neutral', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Spell_Simple_Idle_Loop'];
const fakeModels = (): LoadedModels => ({
  horse: fakeRig({ Tail1: [-1, 1, 0], Head: [1, 1.5, 0] }, ['Gallop', 'Walk', 'Idle_2', 'Idle']),
  base: fakeRig({ 'DEF-foot.L': [0, 0, 0.1], 'DEF-toe.L': [0.2, 0, 0.1], 'DEF-head': [0, 1.6, 0] }, BASE_CLIPS),
  human: fakeSoldier(),
});
/** Records every clip played from here on, with its action. */
function recordPlays() {
  const played: THREE.AnimationAction[] = [];
  const play = THREE.AnimationAction.prototype.play;
  vi.spyOn(THREE.AnimationAction.prototype, 'play').mockImplementation(function (this: THREE.AnimationAction) {
    played.push(this);
    return play.call(this);
  });
  return played;
}
const clipName = (a: THREE.AnimationAction) => a.getClip().name;

beforeEach(stubCanvas);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the team’s gait', () => {
  it('stands, walks and gallops by speed', () => {
    expect(gaitAt(0)).toMatchObject({ idle: 1, walk: 0, gallop: 0 });
    const slow = gaitAt(0.7);
    expect(slow.idle).toBeCloseTo(0.5, 9);
    expect(slow.walk).toBeCloseTo(0.5, 9);
    expect(slow.gallop).toBe(0);
    const canter = gaitAt(5);
    expect(canter.idle).toBe(0);
    expect(canter.gallop).toBeCloseTo(0.5, 9);
    expect(canter.walk).toBeCloseTo(0.5, 9);
    expect(gaitAt(-5)).toEqual(canter);
  });
  it('paces each clip by speed, within its limits', () => {
    expect(gaitAt(17).gallopRate).toBeCloseTo(2.125, 12);
    expect(gaitAt(25).gallopRate).toBe(2.2);
    expect(gaitAt(0).gallopRate).toBe(0.7);
    expect(gaitAt(0).walkRate).toBe(0.5);
    expect(gaitAt(1.6).walkRate).toBeCloseTo(1, 12);
    expect(gaitAt(10).walkRate).toBe(1.6);
  });
  it('has weights that sum to 1, each between 0 and 1, from 0 to 30 m/s', () => {
    for (let v = 0; v <= 30; v += 0.25) {
      const g = gaitAt(v);
      expect(g.idle + g.walk + g.gallop, `${v}`).toBeCloseTo(1, 12);
      for (const w of [g.idle, g.walk, g.gallop]) {
        expect(w, `${v}`).toBeGreaterThanOrEqual(-1e-12);
        expect(w, `${v}`).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });
  it('rolls a 0.9 m wheel', () => {
    expect(spinWheel(0, 9, 0.05)).toBeCloseTo(0.5, 12);
    expect(spinWheel(1, -9, 0.05)).toBeCloseTo(0.5, 12);
  });
});

describe('the page’s chariot', () => {
  it('has no rig, and Arjuna draws his bow beside the raised chakra', () => {
    const part = createChariot(context());
    expect(part.rig).toBeUndefined();
    for (const name of ['arjuna-bow', 'arjuna-string']) expect(named(part, name).visible, name).toBe(true);
    named(part, 'chakra');
    expect(part.object.getObjectByName('prabha')).toBeUndefined();
    for (const name of ['krishna-feather', 'arjuna-crown', 'banner', 'wheel-left', 'wheel-right']) named(part, name);
  });
  it('keeps its wheels still and its halo at 6 m', () => {
    const part = createChariot(context());
    part.update(0.05, 0);
    for (const name of ['wheel-left', 'wheel-right']) expect(named(part, name).rotation.z, name).toBe(0);
    expect(named(part, 'krishna-halo').scale.x).toBe(6);
  });
  it('draws and moves as it always has: tall banner, raised chakra, the reins in one hand, Arjuna aiming', () => {
    const part = atOrigin(createChariot(context()));
    const flag = new THREE.Box3().setFromObject(named(part, 'banner'));
    const size = flag.getSize(new THREE.Vector3()); // geometry is stored in 32-bit floats
    expect(size.x).toBeCloseTo(1.5, 6);
    expect(size.y).toBeCloseTo(1, 6);
    expect(flag.getCenter(new THREE.Vector3()).y).toBeCloseTo(DECK + 3.85, 6);
    // The banner pole is the chariot's only 4 cm cylinder.
    const poles = part.object.children.filter((c) => ((c as THREE.Mesh).geometry as THREE.CylinderGeometry | undefined)?.parameters?.radiusTop === 0.04);
    expect(poles).toHaveLength(1);
    expect(new THREE.Box3().setFromObject(poles[0]).max.y).toBeCloseTo(DECK + 4.4, 6);
    const chakra = named(part, 'chakra');
    expect(spritesUnder(chakra).map((s) => [s.scale.x, s.material.opacity])).toEqual([[2.2, 0.85], [5, 0.22]]);
    const halo = named(part, 'krishna-halo');
    for (const [t, mix] of [[0.5, 0], [1.3, 0.4], [2.7, 1]]) {
      part.update(t, mix);
      expect(chakra.rotation.z, `${t}`).toBeCloseTo(2.2 * t, 9);
      expect(chakra.position.y, `${t}`).toBeCloseTo(2.25 + 0.05 * Math.sin(1.4 * t), 9);
      expect(opacity(halo), `${t}`).toBeCloseTo(0.18 + 0.3 * mix, 9);
    }
    const reins = (named(part, 'reins') as THREE.LineSegments).geometry.getAttribute('position');
    for (let i = 0; i < reins.count; i += 2) {
      expect(reins.getY(i)).toBeCloseTo(DECK + 1.12, 6);
      expect(reins.getZ(i)).toBeCloseTo(0.2, 6);
    }
    const hands: number[] = [];
    named(part, 'arjuna').traverse((n) => {
      const geo = (n as THREE.Mesh).geometry as THREE.SphereGeometry | undefined;
      if (geo?.type === 'SphereGeometry' && geo.parameters.radius === 0.035) hands.push(n.position.y);
    });
    expect(hands.sort((x, y) => x - y)).toEqual([1.35, 1.36]);
  });
  it('dresses both riders and stands the team, once the models load', () => {
    const played = recordPlays();
    const part = createChariot(context());
    part.upgrade!(fakeModels());
    expect(played.map(clipName)).toEqual(['Idle', 'Idle_2', 'Idle', 'Idle_2', 'Spell_Simple_Idle_Loop', 'Pistol_Aim_Neutral']);
  });
});

describe('the drivable chariot', () => {
  const drivable = () => atOrigin(createChariot(context(), { drivable: true }));

  it('has a rig on its root, and Arjuna carries no bow', () => {
    const part = drivable();
    expect(part.rig).toBeDefined();
    expect(part.rig!.root).toBe(part.object);
    for (const name of ['arjuna-bow', 'arjuna-string', 'chakra']) expect(part.object.getObjectByName(name), name).toBeUndefined();
    for (const name of ['krishna-feather', 'arjuna-crown', 'banner', 'wheel-left', 'wheel-right']) named(part, name);
  });
  it('stays under the chase camera’s silhouette of the riders and the banner', () => {
    const part = drivable();
    for (const p of CHARIOT_SILHOUETTE.filter((s) => s.name !== 'horse-heads')) {
      const box = new THREE.Box3().setFromObject(named(part, p.name));
      expect(box.max.y, p.name).toBeLessThanOrEqual(p.y + 0.02);
      expect(p.x, p.name).toBeGreaterThanOrEqual(box.min.x - 0.05);
      expect(p.x, p.name).toBeLessThanOrEqual(box.max.x + 0.05);
    }
    // Nothing solid rises above the highest silhouette point: the banner pole is folded down with its flag.
    const highest = Math.max(...CHARIOT_SILHOUETTE.map((s) => s.y));
    part.object.traverse((n) => {
      if (!(n as THREE.Mesh).isMesh && !(n as THREE.Line).isLine) return;
      expect(new THREE.Box3().setFromObject(n).max.y, n.name || n.type).toBeLessThanOrEqual(highest + 0.02);
    });
  });
  it('keeps the prabha’s glows beside it in Krishna’s group, none over 3 m', () => {
    const part = drivable();
    const prabha = named(part, 'prabha');
    expect(spritesUnder(prabha)).toHaveLength(0);
    const krishna = named(part, 'krishna');
    expect(prabha.parent).toBe(krishna);
    const additive = spritesUnder(krishna).filter((s) => s.material.blending === THREE.AdditiveBlending);
    expect(Math.max(...additive.map((s) => s.scale.x))).toBeLessThanOrEqual(3);
    const glows = additive.filter((s) => s.position.distanceTo(prabha.position) < 1e-9).map((s) => [s.scale.x, s.material.opacity]);
    expect(glows.sort((a, b) => a[0] - b[0])).toEqual([[1, 0.6], [2.2, 0.15]]);
  });
  it('sets the prabha behind Krishna’s head, facing along the chariot, turning at 0.8 rad/s even at full speed', () => {
    const part = drivable();
    const prabha = named(part, 'prabha');
    expect(prabha.position.toArray().map((v) => Math.round(v * 1e9) / 1e9)).toEqual([-0.1, 1.75, 0]);
    part.rig!.setMotion({ speed: 25, yawRate: 1.2, boost: true });
    part.update(1, 0);
    part.object.updateMatrixWorld(true);
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(prabha.getWorldQuaternion(new THREE.Quaternion()));
    expect(Math.abs(axis.x)).toBeCloseTo(1, 9);
    const spike = prabha.getObjectsByProperty('isMesh', true).find((m) => (m as THREE.Mesh).geometry.type === 'ConeGeometry')!;
    const before = spike.getWorldQuaternion(new THREE.Quaternion());
    for (let t = 1 + FRAME; t < 1.5 + 1e-9; t += FRAME) part.update(t, 0);
    part.object.updateMatrixWorld(true);
    expect(spike.getWorldQuaternion(new THREE.Quaternion()).angleTo(before)).toBeCloseTo(0.4, 6);
  });
  it('keeps the prabha under its silhouette point at every angle it turns through', () => {
    const part = drivable();
    const limit = CHARIOT_SILHOUETTE.find((s) => s.name === 'prabha')!.y + 0.02;
    const prabha = named(part, 'prabha');
    // 16 spikes at 0.8 rad/s repeat every 0.49 s; a frame turns them 0.013 rad.
    for (let t = FRAME; t < 1; t += FRAME) {
      part.update(t, 0);
      part.object.updateMatrixWorld(true);
      expect(new THREE.Box3().setFromObject(prabha).max.y, `${t}`).toBeLessThanOrEqual(limit);
    }
  });
  it('folds the banner: a 1.2 × 0.8 m flag centred 1.6 m over the deck', () => {
    const box = new THREE.Box3().setFromObject(named(drivable(), 'banner'));
    const size = box.getSize(new THREE.Vector3()); // geometry is stored in 32-bit floats
    expect(size.x).toBeCloseTo(1.2, 6);
    expect(size.y).toBeCloseTo(0.8, 6);
    expect(box.getCenter(new THREE.Vector3()).y).toBeCloseTo(DECK + 1.6, 6);
  });
  it('has Krishna hold the reins in both hands, and Arjuna’s hands down at his sides', () => {
    const part = drivable();
    const reins = (named(part, 'reins') as THREE.LineSegments).geometry.getAttribute('position');
    const holds = Array.from({ length: reins.count / 2 }, (_, i) => [reins.getY(i * 2), reins.getZ(i * 2)]);
    for (const [y] of holds) expect(y).toBeCloseTo(DECK + 1.12, 6);
    expect([...new Set(holds.map(([, z]) => Math.round(z * 100) / 100))].sort((a, b) => a - b)).toEqual([-0.2, 0.2]);
    // Each hand holds the pair on its own side: no rein crosses to the other side's horses.
    for (let i = 0; i < reins.count; i += 2) expect(Math.sign(reins.getZ(i)), `rein ${i / 2}`).toBe(Math.sign(reins.getZ(i + 1)));
    // The procedural figure's hands are the 3.5 cm spheres at the wrists.
    const hands: number[] = [];
    named(part, 'arjuna').traverse((n) => {
      const geo = (n as THREE.Mesh).geometry as THREE.SphereGeometry | undefined;
      if (geo?.type === 'SphereGeometry' && geo.parameters.radius === 0.035) hands.push(n.position.y);
    });
    expect(hands).toHaveLength(2);
    for (const y of hands) expect(y).toBeLessThanOrEqual(0.95);
  });
});

describe('the drivable chariot with the real models', () => {
  /** The site's own horse and mannequin, parsed from public/models (they hold no images, so no DOM is needed). */
  async function realModels(): Promise<LoadedModels> {
    const parse = (file: string) => {
      const b = readFileSync(file);
      return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, '');
    };
    const [horse, base] = await Promise.all([parse('public/models/horse.glb'), parse('public/models/base.glb')]);
    return { horse, base, human: fakeSoldier() };
  }

  it('stays under the silhouette, dressed, standing, walking and galloping', async () => {
    const part = atOrigin(createChariot(context(), { drivable: true }));
    part.upgrade!(await realModels());
    const limit = Object.fromEntries(CHARIOT_SILHOUETTE.map((s) => [s.name, s.y + 0.02]));
    // The real horses' roots stand at x 3.35; their highest skinned vertex is measured against the horse-heads point.
    const horses = part.object.children.filter((c) => Math.abs(c.position.x - 3.35) < 1e-9 && c.getObjectsByProperty('isSkinnedMesh', true).length > 0);
    expect(horses).toHaveLength(4);
    const top: Record<string, number> = {};
    const raise = (name: string, y: number) => { top[name] = Math.max(top[name] ?? -Infinity, y); };
    let t = 0;
    for (const speed of [0, 2, 5, 17]) {
      part.rig!.setMotion({ speed, yawRate: 0, boost: false });
      // 3.4 s at each speed: a whole Idle cycle (3.33 s), and several of every Walk and Gallop cycle.
      for (let f = 0; f < 204; f++) {
        t += FRAME;
        part.update(t, 0);
        part.object.updateMatrixWorld(true);
        for (const name of ['prabha', 'krishna-feather', 'arjuna-crown', 'banner']) raise(name, new THREE.Box3().setFromObject(named(part, name)).max.y);
        if (f % 2 === 0) for (const h of horses) raise('horse-heads', new THREE.Box3().setFromObject(h, true).max.y);
      }
    }
    expect(Object.keys(top).sort()).toEqual(CHARIOT_SILHOUETTE.map((s) => s.name).sort());
    for (const [name, y] of Object.entries(top)) expect(y, name).toBeLessThanOrEqual(limit[name]);
  }, 60_000);
});

describe('the riders’ arms', () => {
  it('lowers Arjuna’s hands and puts both of Krishna’s on the reins', () => {
    for (const arm of [ARJUNA_ARMS.lowered.left, ARJUNA_ARMS.lowered.right]) expect(arm[2][1]).toBeLessThanOrEqual(0.95);
    for (const arm of [KRISHNA_ARMS.reins.left, KRISHNA_ARMS.reins.right]) expect(arm[2][1]).toBeLessThanOrEqual(1.25);
  });
  it('keeps Krishna’s armlets halfway down his upper arms, raised or on the reins', () => {
    for (const [drivable, arms] of [[false, KRISHNA_ARMS.raised], [true, KRISHNA_ARMS.reins]] as const) {
      const bands: THREE.Vector3[] = [];
      named(createChariot(context(), { drivable }), 'krishna').traverse((n) => {
        const geo = (n as THREE.Mesh).geometry as THREE.TorusGeometry | undefined;
        if (geo?.type === 'TorusGeometry' && geo.parameters.radius === 0.048) bands.push(n.position.clone());
      });
      const mid = (arm: readonly (readonly number[])[]) => new THREE.Vector3(...arm[0]).lerp(new THREE.Vector3(...arm[1]), 0.5);
      expect(bands).toHaveLength(2);
      for (const arm of [arms.left, arms.right]) {
        expect(Math.min(...bands.map((b) => b.distanceTo(mid(arm)))), `${drivable}`).toBeLessThan(1e-9);
      }
    }
  });
  it('freezes both tables down to every joint, since the page’s figures are built from them', () => {
    for (const table of [ARJUNA_ARMS, KRISHNA_ARMS]) {
      expect(Object.isFrozen(table)).toBe(true);
      for (const pose of Object.values(table)) {
        expect(Object.isFrozen(pose)).toBe(true);
        for (const arm of [pose.left, pose.right]) {
          expect(Object.isFrozen(arm)).toBe(true);
          for (const joint of arm) expect(Object.isFrozen(joint)).toBe(true);
        }
      }
    }
  });
  it('keeps the page’s aim and raised arms', () => {
    expect(ARJUNA_ARMS.aim).toEqual({
      left: [[0, 1.42, 0.22], [0.25, 1.32, 0.28], [0.48, 1.35, 0.26]],
      right: [[0, 1.42, -0.22], [0.12, 1.32, -0.24], [0.2, 1.36, 0.1]],
    });
    expect(KRISHNA_ARMS.raised).toEqual({
      left: [[0, 1.42, 0.22], [0.22, 1.2, 0.26], [0.45, 1.12, 0.2]],
      right: [[0, 1.42, -0.22], [0.08, 1.68, -0.32], [0.12, 1.95, -0.3]],
    });
  });
});

describe('the drivable chariot’s wheels', () => {
  const drivable = () => createChariot(context(), { drivable: true });
  it('roll with the speed', () => {
    const part = drivable();
    part.rig!.setMotion({ speed: 9, yawRate: 0, boost: false });
    part.update(0.05, 0);
    for (const name of ['wheel-left', 'wheel-right']) expect(Math.abs(named(part, name).rotation.z + 0.5), name).toBeLessThanOrEqual(1e-6);
  });
  it('roll each wheel at its own side’s speed: the outer one of a turn |yawRate| × 1.08 m/s faster, the inner one as much slower', () => {
    const part = drivable();
    part.rig!.setMotion({ speed: 9, yawRate: 0.5, boost: false }); // yaw grows: a left turn, the right wheel outside
    part.update(0.05, 0);
    expect(named(part, 'wheel-right').rotation.z).toBeCloseTo(-((9 + 0.54) * 0.05) / 0.9, 9);
    expect(named(part, 'wheel-left').rotation.z).toBeCloseTo(-((9 - 0.54) * 0.05) / 0.9, 9);
    const back = drivable();
    back.rig!.setMotion({ speed: -9, yawRate: 0.5, boost: false }); // backing up while yaw grows: the left wheel is outside
    back.update(0.05, 0);
    expect(named(back, 'wheel-left').rotation.z).toBeCloseTo(((9 + 0.54) * 0.05) / 0.9, 9);
    expect(named(back, 'wheel-right').rotation.z).toBeCloseTo(((9 - 0.54) * 0.05) / 0.9, 9);
  });
  it('turn opposite ways in a pivot on the spot, and change smoothly through a standstill', () => {
    const wheelsAt = (speed: number) => {
      const part = drivable();
      part.rig!.setMotion({ speed, yawRate: 0.9, boost: false });
      part.update(0.05, 0);
      return ['wheel-left', 'wheel-right'].map((name) => named(part, name).rotation.z);
    };
    const [left, right] = wheelsAt(0);
    expect(left).toBeCloseTo((0.9 * 1.08 * 0.05) / 0.9, 9); // the left wheel rolls back
    expect(right).toBeCloseTo(-(0.9 * 1.08 * 0.05) / 0.9, 9); // the right one forward
    for (const speed of [-1e-9, 1e-9]) {
      const [l, r] = wheelsAt(speed);
      expect(Math.abs(l - left), `${speed}`).toBeLessThan(1e-9);
      expect(Math.abs(r - right), `${speed}`).toBeLessThan(1e-9);
    }
  });
  it('ignore a speed or yaw rate that is not a finite number', () => {
    const part = drivable();
    part.rig!.setMotion({ speed: Number.NaN, yawRate: Number.POSITIVE_INFINITY, boost: false });
    part.update(0.05, 0);
    for (const name of ['wheel-left', 'wheel-right']) expect(Math.abs(named(part, name).rotation.z), name).toBe(0);
  });
});

describe('the prabha’s pulse', () => {
  it('lifts the 3 m halo to 0.6 and lets it fall back to 0.12 over half a second', () => {
    const part = createChariot(context(), { drivable: true });
    const halo = named(part, 'krishna-halo');
    expect(halo.scale.x).toBe(3);
    part.update(1, 0);
    expect(opacity(halo)).toBeCloseTo(0.12, 9);
    part.rig!.pulse();
    let t = 1 + FRAME;
    part.update(t, 0);
    expect(Math.abs(opacity(halo) - 0.6)).toBeLessThanOrEqual(0.01);
    let last = opacity(halo);
    for (let i = 0; i < 36; i++) {
      t += FRAME;
      part.update(t, 0);
      expect(opacity(halo)).toBeLessThanOrEqual(last + 1e-12); // falls, never flickers back up
      last = opacity(halo);
      if (i === 14) expect(Math.abs(opacity(halo) - 0.36)).toBeLessThanOrEqual(0.01); // halfway at 0.25 s
    }
    expect(Math.abs(opacity(halo) - 0.12)).toBeLessThanOrEqual(0.01);
  });
  it('lets a pulse called during a fall wait for it to end: at most one rise per 0.5 s, and none lost', () => {
    const run = (pulseAt: (t: number) => boolean) => {
      const part = createChariot(context(), { drivable: true });
      const halo = named(part, 'krishna-halo');
      part.update(1, 0);
      const rises: number[] = [];
      let before = opacity(halo);
      for (let i = 1; i <= 180; i++) {
        const t = 1 + i * FRAME;
        if (pulseAt(t)) part.rig!.pulse();
        part.update(t, 0);
        if (opacity(halo) > before + 1e-9) rises.push(t);
        before = opacity(halo);
      }
      return rises;
    };
    // pulse() every 0.2 s for 2 s.
    const steady = run((t) => t <= 3 + 1e-9 && Math.abs(((t - 1) / 0.2) - Math.round((t - 1) / 0.2)) < 1e-6);
    for (let i = 1; i < steady.length; i++) expect(steady[i] - steady[i - 1], `rise ${i}`).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(steady.length).toBeGreaterThanOrEqual(4); // a pulse keeps coming every 0.5 s while the calls do
    // Two calls 0.2 s apart: the second waits for the first's fall, then flares.
    const pair = run((t) => Math.abs(t - (1 + 6 * FRAME)) < 1e-9 || Math.abs(t - (1 + 18 * FRAME)) < 1e-9);
    expect(pair).toHaveLength(2);
    expect(pair[1] - pair[0]).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(pair[1] - pair[0]).toBeLessThan(0.5 + 2 * FRAME);
  });
  it('brightens with the dharma mix', () => {
    const part = createChariot(context(), { drivable: true });
    part.update(1, 1);
    expect(opacity(named(part, 'krishna-halo'))).toBeCloseTo(0.32, 9);
  });
});

describe('the drivable team', () => {
  it('swings the procedural legs with the gait: a fidget at rest, a stride at a gallop', () => {
    const swing = (speed: number) => {
      const part = createChariot(context(), { drivable: true });
      part.rig!.setMotion({ speed, yawRate: 0, boost: false });
      const legs = hindLegs(part);
      let most = 0;
      for (let t = FRAME; t < 2; t += FRAME) {
        part.update(t, 0);
        for (const leg of legs) most = Math.max(most, Math.abs(leg.rotation.z));
      }
      return most;
    };
    expect(swing(0)).toBeLessThanOrEqual(0.04 + 1e-9);
    expect(swing(9)).toBeGreaterThan(0.4);
  });
  it('blends the real horses’ Idle, Walk and Gallop by speed, and dresses Arjuna alone, standing', () => {
    const played = recordPlays();
    const part = createChariot(context(), { drivable: true });
    part.upgrade!(fakeModels());
    const horseClips = played.map(clipName).filter((n) => !BASE_CLIPS.includes(n));
    expect(horseClips.sort()).toEqual([...Array(4).fill('Gallop'), ...Array(4).fill('Idle'), ...Array(4).fill('Walk')]);
    expect(played.map(clipName).filter((n) => BASE_CLIPS.includes(n))).toEqual(['Idle_Loop']);

    const weights = (name: string) => played.filter((a) => clipName(a) === name).map((a) => a.getEffectiveWeight());
    part.rig!.setMotion({ speed: 0, yawRate: 0, boost: false });
    part.update(0.05, 0);
    expect(weights('Idle')).toEqual([1, 1, 1, 1]);
    expect(weights('Walk')).toEqual([0, 0, 0, 0]);
    expect(weights('Gallop')).toEqual([0, 0, 0, 0]);
    part.rig!.setMotion({ speed: 5, yawRate: 0, boost: false });
    part.update(0.1, 0);
    for (const w of weights('Idle')) expect(w).toBe(0);
    for (const w of [...weights('Walk'), ...weights('Gallop')]) expect(w).toBeCloseTo(0.5, 9);
    for (const a of played.filter((x) => clipName(x) === 'Walk')) expect(a.timeScale).toBe(1.6);
    for (const a of played.filter((x) => clipName(x) === 'Gallop')) expect(a.timeScale).toBe(0.7);
  });
  it('steps backward when the chariot backs up: the clips run in reverse and the stride turns back', () => {
    const clipScales = (speed: number) => {
      const played = recordPlays();
      const part = createChariot(context(), { drivable: true });
      part.upgrade!(fakeModels());
      part.rig!.setMotion({ speed, yawRate: 0, boost: false });
      part.update(0.05, 0);
      const scales = (name: string) => played.filter((a) => clipName(a) === name).map((a) => a.timeScale);
      vi.restoreAllMocks();
      return { walk: scales('Walk'), gallop: scales('Gallop') };
    };
    expect(clipScales(4)).toEqual({ walk: [1.6, 1.6, 1.6, 1.6], gallop: [0.7, 0.7, 0.7, 0.7] });
    expect(clipScales(-4)).toEqual({ walk: [-1.6, -1.6, -1.6, -1.6], gallop: [-0.7, -0.7, -0.7, -0.7] });

    // The procedural stride's phase, read off the +z hind legs of the first two horses, which swing 0.4 rad apart
    // (at 4 m/s the standing fidget has faded out entirely, so each swing is sin(phase) times one amplitude).
    const strideStep = (speed: number) => {
      const part = createChariot(context(), { drivable: true });
      part.rig!.setMotion({ speed, yawRate: 0, boost: false });
      const phase = () => {
        const legs = hindLegs(part);
        const a = legs[1].rotation.z;
        const b = legs[3].rotation.z;
        return Math.atan2(a, (b - a * Math.cos(0.4)) / Math.sin(0.4));
      };
      part.update(1, 0);
      const from = phase();
      part.update(1 + FRAME, 0);
      const d = phase() - from;
      return Math.atan2(Math.sin(d), Math.cos(d));
    };
    const ahead = strideStep(4);
    expect(ahead).toBeGreaterThan(0);
    expect(strideStep(-4)).toBeCloseTo(-ahead, 9);
  });
  it('leaves Krishna’s own body on the reins once the models load', () => {
    const part = createChariot(context(), { drivable: true });
    part.upgrade!(fakeModels());
    part.update(0.05, 0);
    const body: boolean[] = [];
    named(part, 'krishna').traverse((n) => { if (n.userData.body) body.push(n.visible); });
    expect(body.length).toBeGreaterThan(0);
    expect(body.every(Boolean)).toBe(true);
    const arjuna: boolean[] = [];
    named(part, 'arjuna').traverse((n) => { if (n.userData.body) arjuna.push(n.visible); });
    expect(arjuna.some(Boolean)).toBe(false);
  });
});

describe('the ranks', () => {
  const dharma = formation(128, 'dharma', 5);
  const adharma = formation(128, 'adharma', 5);
  /** The limb shader's motion uniforms, read by compiling the material against a minimal shader. */
  function limbUniforms(part: { object: THREE.Object3D }) {
    const mesh = part.object.getObjectsByProperty('isInstancedMesh', true)[0] as THREE.InstancedMesh;
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '' };
    (mesh.material as THREE.Material).onBeforeCompile(shader as never, undefined as never);
    const u = shader.uniforms;
    return { swing: u.uSwing.value, speed: u.uSpeed.value, bob: u.uBob.value, lean: u.uLean.value };
  }
  /** The real front ranks' clips and placements, once the soldier model loads. */
  function frontRanks(still: boolean, models: LoadedModels) {
    const part = createArmies(context(), dharma, adharma, { still });
    part.upgrade!(models);
    const meshes = part.object.getObjectsByProperty('isInstancedMesh', true).filter((m) => (m as THREE.InstancedMesh).geometry.getAttribute('aClip')) as THREE.InstancedMesh[];
    expect(meshes).toHaveLength(2);
    return {
      clips: meshes.flatMap((m) => Array.from(m.geometry.getAttribute('aClip').array as Float32Array)),
      matrices: meshes.flatMap((m) => Array.from(m.instanceMatrix.array)),
    };
  }

  it('march on the page and stand still in the game', () => {
    expect(armyMotion(false)).toEqual({ swing: 0.5, speed: 3.4, bob: 0.04, lean: 0.28 });
    expect(armyMotion(true)).toMatchObject({ swing: 0, bob: 0, lean: 0 });
  });
  it('give the real front ranks their clip from one roll each', () => {
    expect(frontClip(0.05, false)).toBe(CLIP.idle);
    expect(frontClip(0.5, false)).toBe(CLIP.walk);
    for (const r of [0, 0.5, 0.99]) expect(frontClip(r, true), `${r}`).toBe(CLIP.idle);
  });
  it('drive the procedural ranks’ shader with that motion', () => {
    expect(limbUniforms(createArmies(context(), dharma, adharma))).toEqual(armyMotion(false));
    expect(limbUniforms(createArmies(context(), dharma, adharma, { still: true }))).toEqual(armyMotion(true));
  });
  it('stand the real front ranks idle where the page has them walk, in the same places', () => {
    const models = fakeModels();
    const page = frontRanks(false, models);
    const still = frontRanks(true, models);
    expect(page.clips).toContain(CLIP.walk);
    expect(page.clips).toContain(CLIP.idle);
    expect(still.clips.every((c) => c === CLIP.idle)).toBe(true);
    expect(still.matrices).toEqual(page.matrices);
  });
});

describe('the figures’ source', () => {
  const chariot = readFileSync('src/lib/bowobharata/scene/chariot.ts', 'utf8');
  const army = readFileSync('src/lib/bowobharata/scene/army.ts', 'utf8');
  it('dresses Arjuna standing when driven, and Krishna only on the page', () => {
    expect(chariot).toContain("drivable ? 'Idle_Loop' : 'Pistol_Aim_Neutral'");
    const krishna = chariot.match(/^.*dressHero\(k\.group.*$/gm) ?? [];
    expect(krishna).toHaveLength(1);
    expect(krishna[0]).toMatch(/^\s*if \(!drivable\) /);
  });
  it('keeps the shared soldier kit and one roll per real soldier', () => {
    expect(army).toContain('getSoldierKit(models, ctx.uTime)');
    expect(army).toContain('frontClip(rnd(), still)');
  });
});
