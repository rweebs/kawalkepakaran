import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FX_LAYER, createContext } from '../src/lib/bowobharata/scene/effects';
import { createDetail } from '../src/lib/bowobharata/scene/materials';
import { gameQuality, qualityFor } from '../src/lib/bowobharata/scene/quality';
import { FIELD } from '../src/lib/bowobharata/scene/dressing-layout';
import { PAVILION, groundHeight } from '../src/lib/bowobharata/stage-math';
import type { ChariotMotion, ChariotRig } from '../src/lib/bowobharata/scene/chariot';
import { angleDiff, forward, rightOf, yawOf, type XZ } from '../src/lib/bowobharata-game/geom';
import { NO_INPUT, initChariot, speedOf, stepChariot, type ChariotInput, type ChariotState } from '../src/lib/bowobharata-game/drive';
import { ANCHORS, POSTS, ROCKS, SPAWN, TENTS, TOWER_R, TREES, clearance, staticColliders, type Collider } from '../src/lib/bowobharata-game/world';
import { createWorld, startChapter, type GameState } from '../src/lib/bowobharata-game/engine';
import { missionFor, type StepDef } from '../src/lib/bowobharata-game/missions';
import type { Decoy, Phase } from '../src/lib/bowobharata-game/mission-run';
import { CHARIOT_SILHOUETTE } from '../src/lib/bowobharata-game/chase';
import type { SceneGame } from '../src/lib/bowobharata-game/world/types';
import { CLEAR, createLandmarks } from '../src/lib/bowobharata-game/world/landmarks3d';
import { DUST, TUFTS, cellTuft, createGround, inField, ringCells } from '../src/lib/bowobharata-game/world/ground3d';
import { bindChariot } from '../src/lib/bowobharata-game/world/chariot-bind';
import { SHIMMER, createPickups, shimmerAt } from '../src/lib/bowobharata-game/world/pickups3d';
import { disposeGroup } from '../src/lib/bowobharata-game/world/dispose';
import * as shapes from '../src/lib/bowobharata-game/world/shapes';
import * as arrows from '../src/lib/bowobharata-game/arrows3d';

// No DOM under vitest: a canvas whose 2D context swallows every call, so the texture painters run without drawing.
function stubCanvas() {
  const g: unknown = new Proxy(function () {}, { get: () => g, apply: () => g, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => g }) });
}

beforeEach(stubCanvas);
afterEach(() => vi.unstubAllGlobals());

type FrameListener = (time: number, dt: number) => void;
/** Anything that announces its own dispose: geometries, materials, textures, instanced meshes. */
type Disposable = { addEventListener(type: 'dispose', listener: () => void): void };

/** The scene's game handle without a renderer; its frame listeners are kept to look at. */
function fakeGame(): { game: SceneGame; frames: Set<FrameListener> } {
  const quality = gameQuality(qualityFor(false, 1));
  const ctx = createContext(quality, new THREE.PerspectiveCamera(), createDetail(8));
  const frames = new Set<FrameListener>();
  const game: SceneGame = {
    camera: new THREE.PerspectiveCamera(),
    root: new THREE.Group(),
    setPose: () => {},
    onFrame: (cb) => {
      frames.add(cb);
      return () => { frames.delete(cb); };
    },
    chariot: { root: new THREE.Group(), setMotion: () => {}, pulse: () => {} },
    quality,
    textures: { glow: ctx.glow, soft: ctx.soft, shaft: ctx.shaft },
    setTimeScale: () => {},
    setPixelRatio: () => {},
    refreshShadows: () => {},
  };
  return { game, frames };
}

/** A real engine state (the prologue at its start), with the car swapped for the one under test. */
const WORLD = createWorld({ mobile: false });
const PROLOGUE = missionFor(0, []);
const BASE: GameState = startChapter(PROLOGUE, PROLOGUE.start, 1, WORLD);
/** A car at (x, z) facing yaw, rolling forward at `speed` m/s. */
function car(x: number, z: number, yaw = 0, speed = 0): ChariotState {
  const f = forward(yaw);
  return { ...initChariot(x, z, yaw), vx: f.x * speed, vz: f.z * speed };
}
const stateAt = (x: number, z: number, yaw = 0, speed = 0): GameState => ({ ...BASE, car: car(x, z, yaw, speed) });

function named<T extends THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const o = root.getObjectByName(name);
  expect(o, name).toBeDefined();
  return o as T;
}
function allNamed(root: THREE.Object3D, name: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.name === name) out.push(o); });
  return out;
}

/** The vertices of one instance of a mesh (index 0 for a plain mesh), in world space. */
function vertices(mesh: THREE.Mesh, instance = 0): THREE.Vector3[] {
  mesh.updateWorldMatrix(true, false);
  const m = new THREE.Matrix4();
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).getMatrixAt(instance, m);
  m.premultiply(mesh.matrixWorld);
  const pos = mesh.geometry.getAttribute('position');
  return Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m));
}
/** Where an instance (or a plain object) stands, in world space. */
function placeOf(mesh: THREE.Object3D, instance = 0): THREE.Vector3 {
  mesh.updateWorldMatrix(true, false);
  const m = new THREE.Matrix4();
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).getMatrixAt(instance, m);
  return new THREE.Vector3().setFromMatrixPosition(m.premultiply(mesh.matrixWorld));
}
const flatDist = (v: { x: number; z: number }, p: XZ) => Math.hypot(v.x - p.x, v.z - p.z);
/** Instance matrices are stored as float32: a tenth of a millimetre covers their rounding anywhere on the field. */
const F32 = 1e-4;
/** Height of v over the ground under p. */
const over = (v: THREE.Vector3, p: XZ) => v.y - groundHeight(p.x, p.z);

/** What a layer made under root: every drawable's geometry, every instanced mesh, every material, and each map it painted itself (not the scene's). */
function ownedBy(root: THREE.Object3D, game: SceneGame): Set<Disposable> {
  const shared: THREE.Texture[] = Object.values(game.textures);
  const owned = new Set<Disposable>();
  root.traverse((o) => {
    const geometry = (o as { geometry?: THREE.BufferGeometry }).geometry;
    if (geometry && !(o as THREE.Sprite).isSprite) owned.add(geometry);
    if ((o as THREE.InstancedMesh).isInstancedMesh) owned.add(o as THREE.InstancedMesh);
    const material = (o as { material?: THREE.Material | THREE.Material[] }).material;
    for (const mat of (material ? (Array.isArray(material) ? material : [material]) : []) as THREE.MeshStandardMaterial[]) {
      owned.add(mat);
      if (mat.map && !shared.includes(mat.map)) owned.add(mat.map);
    }
  });
  return owned;
}
/** Runs `dispose`, then checks that it freed everything in `owned` and none of the scene's shared textures. */
function expectFreed(game: SceneGame, owned: Set<Disposable>, dispose: () => void): void {
  const freed = new Set<unknown>();
  for (const r of owned) r.addEventListener('dispose', () => freed.add(r));
  const shared: unknown[] = [];
  for (const t of Object.values(game.textures)) t.addEventListener('dispose', () => shared.push(t));
  dispose();
  for (const r of owned) expect(freed.has(r), (r as { type?: string }).type).toBe(true);
  expect(shared).toEqual([]);
}

describe('landmarks', () => {
  it('counts 5 tents, 16 trees, 6 posts and 15 rocks', () => {
    const { group } = createLandmarks(fakeGame().game);
    expect(named<THREE.InstancedMesh>(group, 'tents').count).toBe(5);
    expect(named<THREE.InstancedMesh>(group, 'trees').count).toBe(16);
    expect(named<THREE.InstancedMesh>(group, 'posts').count).toBe(6);
    expect(named<THREE.InstancedMesh>(group, 'rocks').count).toBe(15);
    for (const n of ['tents', 'trees', 'posts', 'rocks']) expect(named<THREE.InstancedMesh>(group, n).isInstancedMesh, n).toBe(true);
  });

  it('stands the tower at (−46, groundHeight(−46, 52), 52)', () => {
    const tower = named(createLandmarks(fakeGame().game).group, 'tower');
    const p = placeOf(tower);
    expect(p.x).toBeCloseTo(-46, 9);
    expect(p.y).toBeCloseTo(groundHeight(-46, 52), 9);
    expect(p.z).toBeCloseTo(52, 9);
  });

  it('builds the tower from two merged meshes and a lamp sprite', () => {
    const tower = named(createLandmarks(fakeGame().game).group, 'tower');
    expect(tower.children.filter((c) => (c as THREE.Mesh).isMesh)).toHaveLength(2);
    expect(tower.children.filter((c) => (c as THREE.Sprite).isSprite)).toHaveLength(1);
    expect(tower.children).toHaveLength(3);
  });

  it('adds its group to the game root', () => {
    const { game } = fakeGame();
    const { group } = createLandmarks(game);
    expect(game.root.children).toContain(group);
  });

  it('puts each tent, tree, post and rock on its collider in world.ts, on the ground', () => {
    const { group } = createLandmarks(fakeGame().game);
    const sets: [string, XZ[]][] = [['tents', TENTS], ['trees', TREES], ['posts', POSTS], ['rocks', ROCKS.map((r) => r.at)]];
    for (const [name, spots] of sets) {
      const mesh = named<THREE.InstancedMesh>(group, name);
      spots.forEach((s, k) => {
        const p = placeOf(mesh, k);
        expect(flatDist(p, s), `${name} ${k}`).toBeLessThanOrEqual(F32);
        // Rocks sink a little into the ground; everything else stands on it.
        expect(Math.abs(over(p, s)), `${name} ${k}`).toBeLessThanOrEqual(name === 'rocks' ? 0.25 : F32);
      });
    }
  });

  it('keeps every tent, post and rock inside its collider, and each tree below CLEAR inside its trunk’s', () => {
    const { group } = createLandmarks(fakeGame().game);
    const tents = named<THREE.InstancedMesh>(group, 'tents');
    const posts = named<THREE.InstancedMesh>(group, 'posts');
    const rocks = named<THREE.InstancedMesh>(group, 'rocks');
    const trees = named<THREE.InstancedMesh>(group, 'trees');
    TENTS.forEach((t, k) => { for (const v of vertices(tents, k)) expect(flatDist(v, t)).toBeLessThanOrEqual(2.2 + 1e-9); });
    POSTS.forEach((p, k) => { for (const v of vertices(posts, k)) expect(flatDist(v, p)).toBeLessThanOrEqual(0.5 + 1e-9); });
    ROCKS.forEach((r, k) => { for (const v of vertices(rocks, k)) expect(flatDist(v, r.at)).toBeLessThanOrEqual(r.r + 1e-9); });
    TREES.forEach((t, k) => {
      const low = vertices(trees, k).filter((v) => over(v, t) < CLEAR);
      expect(low.length).toBeGreaterThan(0);
      for (const v of low) expect(flatDist(v, t)).toBeLessThanOrEqual(0.8 + 1e-9);
    });
    expect(CLEAR).toBeGreaterThanOrEqual(3.68 + 0.3); // the drivable chariot's crest (CHARIOT_SILHOUETTE), and some sway
  });

  it('keeps the tower below CLEAR inside its 2.5 m collider', () => {
    const tower = named(createLandmarks(fakeGame().game).group, 'tower');
    const meshes = tower.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
    const low = meshes.flatMap((m) => vertices(m)).filter((v) => over(v, ANCHORS.tower) < CLEAR);
    expect(low.length).toBeGreaterThan(0);
    for (const v of low) expect(flatDist(v, ANCHORS.tower)).toBeLessThanOrEqual(TOWER_R + 1e-9);
  });

  it('builds the gate as one merged mesh inside its four boxes, the opening clear', () => {
    const group = createLandmarks(fakeGame().game).group;
    const gate = named<THREE.Mesh>(group, 'gate');
    expect(gate.isMesh).toBe(true);
    expect(gate.children).toHaveLength(0);
    expect(placeOf(gate).x).toBeCloseTo(ANCHORS.gate.x, 9);
    expect(placeOf(gate).z).toBeCloseTo(ANCHORS.gate.z, 9);
    const boxes = staticColliders().filter((c): c is Extract<Collider, { kind: 'box' }> => c.kind === 'box' && c.id.startsWith('gate-'));
    expect(boxes).toHaveLength(4);
    const inBox = (v: THREE.Vector3, b: (typeof boxes)[number]) =>
      v.x >= b.minX - 1e-9 && v.x <= b.maxX + 1e-9 && v.z >= b.minZ - 1e-9 && v.z <= b.maxZ + 1e-9;
    const vs = vertices(gate);
    expect(vs.length % 3).toBe(0);
    // Every triangle lies in one box, so none spans the opening between the pylons.
    for (let t = 0; t < vs.length; t += 3) {
      const tri = vs.slice(t, t + 3);
      expect(boxes.some((b) => tri.every((v) => inBox(v, b))), `triangle ${t / 3}`).toBe(true);
    }
  });

  it('flies two camp banners and six grey post banners, all of them above CLEAR', () => {
    const group = createLandmarks(fakeGame().game).group;
    const camp = allNamed(group, 'camp-banner') as THREE.Mesh[];
    expect(camp).toHaveLength(2);
    for (const b of camp) {
      expect(b.isMesh && !(b as THREE.InstancedMesh).isInstancedMesh).toBe(true);
      // Hung from a pole that rises out of a tent, inside its collider.
      const tent = TENTS.find((t) => flatDist(placeOf(b), t) <= 1e-9);
      expect(tent, 'a camp banner hangs at a tent').toBeDefined();
      for (const v of vertices(b)) expect(over(v, tent!)).toBeGreaterThanOrEqual(CLEAR + 0.1);
    }
    const poles = named<THREE.Mesh>(group, 'camp-poles');
    for (const v of vertices(poles)) expect(TENTS.some((t) => flatDist(v, t) <= 2.2)).toBe(true);
    const grey = named<THREE.InstancedMesh>(group, 'post-banners');
    expect(grey.count).toBe(6);
    POSTS.forEach((p, k) => {
      expect(flatDist(placeOf(grey, k), p)).toBeLessThanOrEqual(F32);
      for (const v of vertices(grey, k)) expect(over(v, p)).toBeGreaterThanOrEqual(CLEAR + 0.1);
    });
  });

  it('waves the banners on the scene’s clock (wavingCloth, uTime from onFrame)', () => {
    const { game, frames } = fakeGame();
    const group = createLandmarks(game).group;
    expect(frames.size).toBe(1);
    for (const f of frames) f(3.25, 1 / 60);
    for (const mesh of [...allNamed(group, 'camp-banner'), named(group, 'post-banners')] as THREE.Mesh[]) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      expect(mat.customProgramCacheKey()).toMatch(/^cloth-/);
      const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '' };
      mat.onBeforeCompile(shader as unknown as Parameters<THREE.Material['onBeforeCompile']>[0], undefined as unknown as THREE.WebGLRenderer);
      expect(shader.uniforms.uTime.value).toBe(3.25);
    }
  });

  it('draws in 12 calls: the tower’s 2 meshes and lamp, tents, camp poles, 2 camp banners, gate, trees, posts, post banners, rocks', () => {
    const group = createLandmarks(fakeGame().game).group;
    let calls = 0;
    group.traverse((o) => { if ((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints) calls++; });
    expect(calls).toBe(12);
  });

  it('dispose removes the group, stops listening and frees its geometries, materials and textures, not the scene’s', () => {
    const { game, frames } = fakeGame();
    const lm = createLandmarks(game);
    const owned = ownedBy(lm.group, game);
    expect(owned.size).toBeGreaterThan(20);
    expectFreed(game, owned, () => lm.dispose());
    expect(game.root.children).not.toContain(lm.group);
    expect(frames.size).toBe(0);
  });
});

describe('ground detail', () => {
  const tufts = (game: SceneGame) => named<THREE.InstancedMesh>(game.root, 'ground-tufts');
  const tuftSpots = (mesh: THREE.InstancedMesh) => Array.from({ length: mesh.count }, (_, k) => placeOf(mesh, k));

  it('ringCells(0, 0, 40, 5): every centre within 40 + 3.54 m of the origin', () => {
    const cells = ringCells(0, 0, 40, 5);
    expect(cells.length).toBeGreaterThan(150);
    for (const { i, j } of cells) expect(Math.hypot((i + 0.5) * 5, (j + 0.5) * 5)).toBeLessThanOrEqual(40 + 3.54);
  });

  it('ringCells holds each cell once, and every cell whose centre is within the radius', () => {
    for (const [cx, cz] of [[0, 0], [-57.5, 102.5], [13.2, -7.9]]) {
      const cells = ringCells(cx, cz, 40, 5);
      const keys = new Set(cells.map((c) => `${c.i},${c.j}`));
      expect(keys.size).toBe(cells.length);
      for (let i = -20; i <= 20; i++) {
        for (let j = -20; j <= 20; j++) {
          const ci = Math.floor(cx / 5) + i;
          const cj = Math.floor(cz / 5) + j;
          if (Math.hypot((ci + 0.5) * 5 - cx, (cj + 0.5) * 5 - cz) <= 40) expect(keys.has(`${ci},${cj}`), `${ci},${cj}`).toBe(true);
        }
      }
    }
  });

  it('ringCells never holds more cells than a ring may show: 320 on desktops, 140 on phones', () => {
    expect(TUFTS.cell).toBe(5);
    expect(TUFTS.desktop).toEqual({ radius: 40, cap: 320 });
    expect(TUFTS.phone.cap).toBe(140);
    expect(TUFTS.phone.radius).toBeLessThanOrEqual(40);
    for (let k = 0; k < 40; k++) {
      const cx = k * 0.37 - 7;
      const cz = k * 1.13 - 21;
      expect(ringCells(cx, cz, TUFTS.desktop.radius, TUFTS.cell).length).toBeLessThanOrEqual(TUFTS.desktop.cap);
      expect(ringCells(cx, cz, TUFTS.phone.radius, TUFTS.cell).length).toBeLessThanOrEqual(TUFTS.phone.cap);
    }
  });

  it('cellTuft is deterministic, inside its cell, and differs from cell to cell', () => {
    for (const [i, j] of [[0, 0], [-12, 20], [7, -3], [-1, -1]]) {
      const a = cellTuft(i, j);
      expect(cellTuft(i, j)).toEqual(a);
      expect(a.x).toBeGreaterThanOrEqual(i * TUFTS.cell);
      expect(a.x).toBeLessThan((i + 1) * TUFTS.cell);
      expect(a.z).toBeGreaterThanOrEqual(j * TUFTS.cell);
      expect(a.z).toBeLessThan((j + 1) * TUFTS.cell);
      expect(a.scale).toBeGreaterThan(0.5);
      expect(a.scale).toBeLessThan(1.5);
      expect(a.turn).toBeGreaterThanOrEqual(0);
      expect(a.turn).toBeLessThan(Math.PI * 2);
    }
    const xs = new Set([[0, 0], [1, 0], [0, 1], [5, 9]].map(([i, j]) => cellTuft(i, j).x - i * TUFTS.cell));
    expect(xs.size).toBe(4);
  });

  it('inField: inside FIELD, or within 12 m of the mound', () => {
    expect(inField(0, -10)).toBe(true);
    expect(inField(FIELD.minX, FIELD.maxZ)).toBe(true);
    expect(inField(FIELD.maxX + 0.5, -40)).toBe(false);
    expect(inField(PAVILION.x + 11.9, PAVILION.z + 0.1)).toBe(true);
    expect(inField(PAVILION.x + 12.5, PAVILION.z + 1)).toBe(false);
    expect(inField(-60, 100)).toBe(false);
  });

  it('synced at (−60, 100), shows 1–320 tufts, all within the 40 m ring', () => {
    const { game } = fakeGame();
    const layer = createGround(game, false);
    layer.sync(stateAt(-60, 100), 0);
    const mesh = tufts(game);
    expect(mesh.count).toBeGreaterThanOrEqual(1);
    expect(mesh.count).toBeLessThanOrEqual(320);
    for (const p of tuftSpots(mesh)) expect(flatDist(p, { x: -60, z: 100 })).toBeLessThanOrEqual(40 + 3.54);
  });

  it('synced at (0, −10), puts no tuft inside FIELD or by the mound', () => {
    const { game } = fakeGame();
    const layer = createGround(game, false);
    layer.sync(stateAt(0, -10), 0);
    const mesh = tufts(game);
    expect(mesh.count).toBeGreaterThan(0);
    for (const p of tuftSpots(mesh)) {
      const insideField = p.x >= FIELD.minX && p.x <= FIELD.maxX && p.z >= FIELD.minZ && p.z <= FIELD.maxZ;
      expect(insideField, `${p.x}, ${p.z}`).toBe(false);
      expect(inField(p.x, p.z)).toBe(false);
    }
  });

  it('shows at most 140 tufts on phones', () => {
    const { game } = fakeGame();
    const layer = createGround(game, true);
    for (const [x, z] of [[-60, 100], [-130, -60], [120, 40], [0, 90]]) {
      layer.sync(stateAt(x, z), 0);
      const n = tufts(game).count;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(140);
    }
  });

  it('stands no tuft in a landmark', () => {
    const { game } = fakeGame();
    const layer = createGround(game, false);
    const solid = staticColliders().filter((c) => !c.figure);
    for (const [x, z] of [[-100, -10], [-46, 52], [115, -20], [95, 65], [-28, 98]]) {
      layer.sync(stateAt(x, z), 0);
      const spots = tuftSpots(tufts(game));
      expect(spots.length).toBeGreaterThan(0);
      for (const p of spots) expect(clearance(p, solid), `${p.x}, ${p.z}`).toBeGreaterThanOrEqual(TUFTS.clear - 1e-9);
    }
  });

  it('keeps each tuft where it is in the world as the chariot moves', () => {
    const { game } = fakeGame();
    const layer = createGround(game, false);
    const key = (p: THREE.Vector3) => `${p.x.toFixed(6)},${p.z.toFixed(6)}`;
    const near = (p: THREE.Vector3, c: XZ) => flatDist(p, c) < 20;
    layer.sync(stateAt(-60, 100), 0);
    const a = new Set(tuftSpots(tufts(game)).filter((p) => near(p, { x: -52, z: 104 })).map(key));
    layer.sync(stateAt(-44, 108), 0.1);
    const b = new Set(tuftSpots(tufts(game)).filter((p) => near(p, { x: -52, z: 104 })).map(key));
    expect(a.size).toBeGreaterThan(5);
    expect(b).toEqual(a);
  });

  it('keeps the wheel dust to 64 points, raises none at rest, and some behind a chariot at speed', () => {
    const { game } = fakeGame();
    const layer = createGround(game, false);
    const dust = named<THREE.Points>(game.root, 'wheel-dust');
    expect(dust.isPoints).toBe(true);
    expect(DUST.max).toBeLessThanOrEqual(64);
    expect(dust.geometry.getAttribute('position').count).toBeLessThanOrEqual(64);
    const alphas = () => {
      const c = dust.geometry.getAttribute('color');
      return Array.from({ length: c.count }, (_, i) => c.getW(i));
    };
    let t = 0;
    for (let k = 0; k < 60; k++) layer.sync(stateAt(-60, 100, 0.3, 0), (t += 1 / 60));
    expect(alphas().every((a) => a === 0)).toBe(true);
    let s = stateAt(-60, 100, 0.3, 14);
    for (let k = 0; k < 60; k++) {
      s = { ...s, car: { ...s.car, x: s.car.x + s.car.vx / 60, z: s.car.z + s.car.vz / 60 } };
      layer.sync(s, (t += 1 / 60));
    }
    const live = alphas().filter((a) => a > 0);
    expect(live.length).toBeGreaterThan(10);
    expect(Math.max(...live)).toBeLessThanOrEqual(DUST.peak + 1e-6);
    // Behind the chariot: every visible mote is behind the car's front.
    const pos = dust.geometry.getAttribute('position');
    const f = forward(s.car.yaw);
    for (let i = 0; i < pos.count; i++) {
      if (alphas()[i] <= 0) continue;
      expect((pos.getX(i) - s.car.x) * f.x + (pos.getZ(i) - s.car.z) * f.z).toBeLessThan(0.5);
    }
    // Brought to rest, the dust settles within its life.
    for (let k = 0; k < 120; k++) layer.sync({ ...s, car: { ...s.car, vx: 0, vz: 0 } }, (t += 1 / 60));
    expect(alphas().every((a) => a === 0)).toBe(true);
  });

  it('never fades a mote of dust faster than 2 Hz allows', () => {
    const { game } = fakeGame();
    const layer = createGround(game, false);
    const color = named<THREE.Points>(game.root, 'wheel-dust').geometry.getAttribute('color');
    const dt = 1 / 60;
    // A rise from 0 to the peak takes at least a quarter second (a half cycle at 2 Hz), and so does a fall.
    const maxStep = (DUST.peak * dt) / 0.25 + 1e-9;
    let s = stateAt(-60, 100, -0.4, 16);
    let prev = Array.from({ length: color.count }, (_, i) => color.getW(i));
    for (let k = 0; k < 240; k++) {
      const v = k < 150 ? 16 : 0;
      const f = forward(s.car.yaw);
      s = { ...s, car: { ...s.car, x: s.car.x + f.x * v * dt, z: s.car.z + f.z * v * dt, vx: f.x * v, vz: f.z * v, drifting: k % 40 < 20 } };
      layer.sync(s, k * dt);
      const now = Array.from({ length: color.count }, (_, i) => color.getW(i));
      now.forEach((a, i) => expect(Math.abs(a - prev[i]), `mote ${i} at frame ${k}`).toBeLessThanOrEqual(maxStep));
      prev = now;
    }
  });

  it('dispose removes its group and frees what it made, not the scene’s soft texture', () => {
    const { game } = fakeGame();
    const layer = createGround(game, false);
    layer.sync(stateAt(-60, 100, 0, 12), 0);
    const group = named(game.root, 'ground-detail');
    const mesh = named<THREE.InstancedMesh>(group, 'ground-tufts');
    const dust = named<THREE.Points>(group, 'wheel-dust');
    const tuftMat = mesh.material as THREE.MeshStandardMaterial;
    const owned: Disposable[] = [mesh.geometry, tuftMat, tuftMat.map!, dust.geometry, dust.material as THREE.Material, mesh];
    const freed = new Set<unknown>();
    for (const r of owned) r.addEventListener('dispose', () => freed.add(r));
    let softFreed = false;
    game.textures.soft.addEventListener('dispose', () => { softFreed = true; });
    layer.dispose();
    expect(game.root.children).not.toContain(group);
    for (const r of owned) expect(freed.has(r)).toBe(true);
    expect(softFreed).toBe(false);
  });

  it('draws in 2 calls: the tufts and the dust', () => {
    const { game } = fakeGame();
    createGround(game, false);
    let calls = 0;
    named(game.root, 'ground-detail').traverse((o) => { if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) calls++; });
    expect(calls).toBe(2);
  });
});

describe('bindChariot', () => {
  function rigStub(): { rig: ChariotRig; motions: ChariotMotion[] } {
    const motions: ChariotMotion[] = [];
    return { rig: { root: new THREE.Group(), setMotion: (m) => { motions.push({ ...m }); }, pulse: () => {} }, motions };
  }
  /** The root's pitch (about its right axis) and roll (about its nose), and its heading on the ground. */
  function attitude(root: THREE.Object3D) {
    const e = new THREE.Euler().setFromQuaternion(root.quaternion, 'YZX');
    return { yaw: e.y, pitch: e.z, roll: e.x };
  }
  /** The ground's own tilt under a car: sampled ±1.65 m along the heading and ±1.08 m across. */
  function groundTilt(c: ChariotState) {
    const f = forward(c.yaw);
    const r = rightOf(c.yaw);
    const h = (along: number, across: number) => groundHeight(c.x + f.x * along + r.x * across, c.z + f.z * along + r.z * across);
    return { pitch: Math.atan2(h(1.65, 0) - h(-1.65, 0), 3.3), roll: Math.atan2(h(0, -1.08) - h(0, 1.08), 2.16) };
  }

  it('for a car at (10, 20), yaw 0.5: stands on the ground there, faces forward(0.5) and passes speedOf(car)', () => {
    const { rig, motions } = rigStub();
    const c = car(10, 20, 0.5, 6.5);
    bindChariot(rig).sync(c, 1 / 60, 1 / 60);
    expect(rig.root.position.x).toBeCloseTo(10, 9);
    expect(Math.abs(rig.root.position.y - groundHeight(10, 20))).toBeLessThanOrEqual(1e-6);
    expect(rig.root.position.z).toBeCloseTo(20, 9);
    const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.root.quaternion);
    expect(Math.abs(angleDiff(yawOf({ x: nose.x, z: nose.z }), yawOf(forward(0.5))))).toBeLessThanOrEqual(0.06);
    expect(motions).toHaveLength(1);
    expect(motions[0].speed).toBe(speedOf(c));
  });

  it('passes the signed speed: negative while rolling back', () => {
    const { rig, motions } = rigStub();
    const back = car(-60, 100, 1.1, -2.5);
    bindChariot(rig).sync(back, 1 / 60, 1 / 60);
    expect(speedOf(back)).toBeLessThan(0);
    expect(motions[0].speed).toBe(speedOf(back));
  });

  it('tilts with the ground: pitch from ±1.65 m along, roll from ±1.08 m across', () => {
    const { rig } = rigStub();
    const bind = bindChariot(rig);
    // On the mound's slope, where the ground tilts hard both ways.
    for (const c of [car(10, 20, 0.5), car(23, 9, 2.2), car(-60, 100, -1)]) {
      bind.sync(c, 1 / 60, 1 / 60);
      const a = attitude(rig.root);
      const g = groundTilt(c);
      expect(Math.abs(angleDiff(a.yaw, c.yaw))).toBeLessThanOrEqual(1e-9);
      expect(a.pitch).toBeCloseTo(g.pitch, 9);
      expect(a.roll).toBeCloseTo(g.roll, 9);
    }
    expect(Math.abs(groundTilt(car(10, 20, 0.5)).pitch) + Math.abs(groundTilt(car(10, 20, 0.5)).roll)).toBeGreaterThan(0.2);
  });

  it('sways with the acceleration, within ±0.05 rad of pitch and ±0.06 rad of roll: nose up on the throttle, down on the brake, out of a turn', () => {
    const { rig } = rigStub();
    const bind = bindChariot(rig);
    const dt = 1 / 60;
    let c = car(-60, 100, 0.2);
    const sway: { pitch: number; roll: number; phase: string }[] = [];
    const drive = (frames: number, input: Partial<ChariotInput>, phase: string) => {
      for (let k = 0; k < frames; k++) {
        c = stepChariot(c, { ...NO_INPUT, ...input }, dt);
        bind.sync(c, dt, dt);
        const a = attitude(rig.root);
        const g = groundTilt(c);
        sway.push({ pitch: a.pitch - g.pitch, roll: a.roll - g.roll, phase });
      }
    };
    drive(120, { throttle: 1 }, 'throttle');
    drive(90, { throttle: 1, steer: 1 }, 'right turn');
    drive(60, { brake: 1 }, 'brake');
    for (const s of sway) {
      expect(Math.abs(s.pitch)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Math.abs(s.roll)).toBeLessThanOrEqual(0.06 + 1e-9);
    }
    const peak = (phase: string, key: 'pitch' | 'roll', sign: 1 | -1) => Math.max(...sway.filter((s) => s.phase === phase).map((s) => sign * s[key]));
    expect(peak('throttle', 'pitch', 1)).toBeGreaterThan(0.01);
    expect(peak('brake', 'pitch', -1)).toBeGreaterThan(0.03);
    // Turning right (yaw falling), the body leans out to the left: its top tilts toward −z, a negative roll.
    expect(peak('right turn', 'roll', -1)).toBeGreaterThan(0.01);
  });

  it('passes the turn rate over world time and Laju', () => {
    const { rig, motions } = rigStub();
    const bind = bindChariot(rig);
    bind.sync(car(-60, 100, 0.5, 8), 1 / 60, 1 / 120);
    const next = { ...car(-60, 100, 0.51, 8), x: -60 + forward(0.5).x * 8 / 120, z: 100 + forward(0.5).z * 8 / 120, boostT: 1.2 };
    bind.sync(next, 1 / 60, 1 / 120);
    expect(motions[1].yawRate).toBeCloseTo(0.01 * 120, 6);
    expect(motions[1].boost).toBe(true);
    expect(motions[0].boost).toBe(false);
  });

  it('starts afresh after a jump (a retry, a teleport, a new chapter): no sway kick, no turn', () => {
    const dt = 1 / 60;
    /** A binding that has driven a while, swaying: throttle, then a right turn. */
    function swaying() {
      const { rig, motions } = rigStub();
      const bind = bindChariot(rig);
      let c = car(-60, 100, 0.2);
      for (let k = 0; k < 90; k++) {
        c = stepChariot(c, { ...NO_INPUT, throttle: 1, steer: k > 45 ? 1 : 0 }, dt);
        bind.sync(c, dt, dt);
      }
      const a = attitude(rig.root);
      const g = groundTilt(c);
      expect(Math.abs(a.pitch - g.pitch) + Math.abs(a.roll - g.roll)).toBeGreaterThan(0.01);
      return { rig, motions, bind, c };
    }
    // Moved far on the same heading (a teleport), or turned about on the spot (a retry facing the other way).
    const cases = [(c: ChariotState) => car(-46, 60, c.yaw), (c: ChariotState) => car(c.x, c.z, c.yaw + 2)];
    for (const jump of cases) {
      const { rig, motions, bind, c } = swaying();
      const there = jump(c);
      bind.sync(there, dt, dt);
      const a = attitude(rig.root);
      const g = groundTilt(there);
      expect(a.pitch).toBeCloseTo(g.pitch, 9);
      expect(a.roll).toBeCloseTo(g.roll, 9);
      expect(motions.at(-1)!.yawRate).toBe(0);
      expect(rig.root.position.x).toBeCloseTo(there.x, 9);
    }
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const read = (f: string) => readFileSync(f, 'utf8');

describe('pickups', () => {
  type Run = GameState['run'];
  /** Whether o is drawn: it and every parent visible. */
  function shown(o: THREE.Object3D): boolean {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  }
  /** The instances the named mesh draws: none while it or a parent is hidden. */
  function drawn(root: THREE.Object3D, name: string): number {
    const m = named<THREE.InstancedMesh>(root, name);
    return shown(m) ? m.count : 0;
  }
  const shownNamed = (root: THREE.Object3D, name: string) => allNamed(root, name).filter(shown);
  /** The instances of a mesh standing at p on the ground plane. */
  const instancesAt = (mesh: THREE.InstancedMesh, p: XZ) =>
    Array.from({ length: mesh.count }, (_, k) => k).filter((k) => flatDist(placeOf(mesh, k), p) <= F32);
  function matrixAt(mesh: THREE.InstancedMesh, k: number): THREE.Matrix4 {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(k, m);
    return m;
  }
  /** Height over the ground right under v. */
  const height = (v: THREE.Vector3) => v.y - groundHeight(v.x, v.z);
  /** Whether the matrix stands upright with its face (+z) turned toward `cam` across the ground. */
  function facesCamera(m: THREE.Matrix4, cam: THREE.Vector3): void {
    const x = new THREE.Vector3();
    const y = new THREE.Vector3();
    const z = new THREE.Vector3();
    m.extractBasis(x, y, z);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    expect(y.clone().normalize().angleTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6);
    expect(Math.abs(angleDiff(Math.atan2(z.x, z.z), Math.atan2(cam.x - p.x, cam.z - p.z)))).toBeLessThan(1e-5);
  }

  const itemsOf = (steps: readonly StepDef[]) => steps.flatMap((s) => (s.kind === 'collect' ? s.items : []));
  const at = (s: GameState, run: Partial<Run>, extra: Partial<GameState> = {}): GameState => ({ ...s, ...extra, run: { ...s.run, ...run } });
  const sighted = (s: GameState): GameState => ({ ...s, sight: { ...s.sight, on: true } });
  /** The prologue, active, with `recorded` recorded. */
  const prologue = (recorded: string[]) => at(BASE, { phase: 'active', recorded });
  const ITEMS = itemsOf(PROLOGUE.steps);
  /** Parva 1: two lontar, A at (52, 44) and B at (62, −50); in roam at its marker (20, 62) until the lakon starts. */
  const P1 = missionFor(1, ['a', 'b']);
  const P1_ROAM = startChapter(P1, P1.start, 1, WORLD);
  const P1_ITEMS = itemsOf(P1.steps);
  const parva1 = (c: ChariotState, recorded: string[], phase: Phase = 'active') => at(P1_ROAM, { phase, recorded }, { car: c });

  it('shimmers the copies at 1.2 Hz, under 2 Hz: shimmerAt(0) is 0.75 and shimmerAt(1/4.8) is 0.87', () => {
    expect(SHIMMER).toEqual({ hz: 1.2, base: 0.75, amp: 0.12 });
    expect(SHIMMER.hz).toBeLessThanOrEqual(2);
    expect(shimmerAt(0)).toBe(0.75);
    expect(Math.abs(shimmerAt(1 / 4.8) - 0.87)).toBeLessThanOrEqual(1e-6);
    // base + amp·sin(2π·hz·t): the trough half a cycle after the crest, and the base again a whole cycle on.
    expect(shimmerAt(1 / 4.8 + 1 / 2.4)).toBeCloseTo(0.63, 9);
    expect(shimmerAt(1 / 1.2)).toBeCloseTo(0.75, 9);
  });

  it('after sync, the decoys’ opacity equals shimmerAt(time): grey frayed copies, #d6d9de lit #9aa0aa × 0.6', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    const decoys = named<THREE.InstancedMesh>(game.root, 'decoys');
    const mat = decoys.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHexString()).toBe('d6d9de');
    expect(mat.emissive.getHexString()).toBe('9aa0aa');
    expect(mat.emissiveIntensity).toBe(0.6);
    expect(mat.transparent).toBe(true);
    let prev = NaN;
    for (let k = 0; k < 150; k++) {
      const t = 4.2 + k / 60;
      layer.sync(BASE, t);
      expect(mat.opacity).toBe(shimmerAt(t));
      // Never steeper than the 1.2 Hz shimmer itself: 2π·1.2·0.12 a second.
      if (k > 0) expect(Math.abs(mat.opacity - prev)).toBeLessThanOrEqual((2 * Math.PI * 1.2 * 0.12) / 60 + 1e-12);
      prev = mat.opacity;
    }
    // The prologue's one copy, the Mata lesson on the L7→L8 line, standing in the ground there.
    expect(decoys.count).toBe(1);
    const spot = PROLOGUE.scripted.decoys[0];
    expect(flatDist(placeOf(decoys, 0), spot)).toBeLessThanOrEqual(F32);
    expect(Math.abs(over(placeOf(decoys, 0), spot))).toBeLessThanOrEqual(F32);
  });

  it('fades records, posts and copies in the shader: the patch reads each instance’s aFade and scales the alpha by it', () => {
    const { game } = fakeGame();
    createPickups(game);
    const count = (src: string, s: string) => src.split(s).length - 1;
    for (const name of ['record-arrows', 'record-arrow-tips', 'lontar', 'lontar-posts', 'decoys']) {
      const mesh = named<THREE.InstancedMesh>(game.root, name);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      expect(mat.isMeshStandardMaterial, name).toBe(true);
      expect(mat.transparent, name).toBe(true);
      expect(mat.customProgramCacheKey(), name).toBe('pickup-fade');
      expect((mesh.geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute).isInstancedBufferAttribute, name).toBe(true);
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
      mat.onBeforeCompile(shader as unknown as Parameters<THREE.Material['onBeforeCompile']>[0], undefined as unknown as THREE.WebGLRenderer);
      const { vertexShader: vs, fragmentShader: fs } = shader;
      // Each line goes in once, after the chunk it extends: a renamed chunk would leave the patch out without an error.
      expect(count(vs, 'attribute float aFade;'), name).toBe(1);
      expect(count(vs, 'varying float vFade;'), name).toBe(1);
      expect(count(vs, 'vFade = aFade;'), name).toBe(1);
      expect(count(fs, 'varying float vFade;'), name).toBe(1);
      expect(count(fs, 'diffuseColor.a *= vFade;'), name).toBe(1);
      expect(vs.indexOf('vFade = aFade;'), name).toBeGreaterThan(vs.indexOf('#include <begin_vertex>'));
      expect(vs.indexOf('attribute float aFade;'), name).toBeLessThan(vs.indexOf('vFade = aFade;'));
      expect(fs.indexOf('diffuseColor.a *= vFade;'), name).toBeGreaterThan(fs.indexOf('#include <color_fragment>'));
      expect(fs.indexOf('varying float vFade;'), name).toBeLessThan(fs.indexOf('diffuseColor.a *= vFade;'));
    }
  });

  it('prologue start: 8 record-arrows, 8 record-beams and 1 tower-beam', () => {
    const { game } = fakeGame();
    createPickups(game).sync(BASE, 0);
    expect(drawn(game.root, 'record-arrows')).toBe(8);
    expect(drawn(game.root, 'record-beams')).toBe(8);
    expect(shownNamed(game.root, 'tower-beam')).toHaveLength(1);
    // Shaft and tip, a halo for each, and no lontar: the prologue's records are arrows.
    expect(drawn(game.root, 'record-arrow-tips')).toBe(8);
    expect(shownNamed(game.root, 'record-halo')).toHaveLength(8);
    expect(drawn(game.root, 'lontar')).toBe(0);
    expect(drawn(game.root, 'lontar-posts')).toBe(0);
  });

  it('stands each prologue arrow at its record, 2.2 times its size, leaning 25° off the vertical, its tip in the ground', () => {
    const { game } = fakeGame();
    createPickups(game).sync(BASE, 0);
    const shafts = named<THREE.InstancedMesh>(game.root, 'record-arrows');
    const tips = named<THREE.InstancedMesh>(game.root, 'record-arrow-tips');
    const beams = named<THREE.InstancedMesh>(game.root, 'record-beams');
    for (const item of ITEMS) {
      const [k] = instancesAt(shafts, item.at);
      expect(k, item.id).toBeDefined();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const size = new THREE.Vector3();
      matrixAt(shafts, k).decompose(p, q, size);
      expect(Math.abs(over(p, item.at))).toBeLessThanOrEqual(F32);
      for (const c of [size.x, size.y, size.z]) expect(c).toBeCloseTo(2.2, 5);
      // The shapes point their tip along +y: here down into the ground, 25° off the vertical.
      const tip = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      expect(Math.acos(-tip.y)).toBeCloseTo((25 * Math.PI) / 180, 5);
      // The tip goes with its shaft and is partly in the ground; the shaft stands more than 2 m out of it.
      expect(matrixAt(tips, k).equals(matrixAt(shafts, k))).toBe(true);
      const tipHeights = vertices(tips, k).map(height);
      expect(Math.min(...tipHeights)).toBeLessThan(0);
      expect(Math.max(...tipHeights)).toBeGreaterThan(0);
      expect(Math.max(...vertices(shafts, k).map(height))).toBeGreaterThan(2);
      // Its gold beam stands over it, from under the ground to 20 m up.
      const [b] = instancesAt(beams, item.at);
      expect(b, item.id).toBeDefined();
      const beamHeights = vertices(beams, b).map((v) => over(v, item.at));
      expect(Math.min(...beamHeights)).toBeLessThan(0);
      expect(Math.max(...beamHeights)).toBeGreaterThanOrEqual(19.5);
    }
    // A light material, lit from within, so the arrows read at dusk (F2); the tips glow brighter.
    const mat = shafts.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l).toBeGreaterThanOrEqual(0.7);
    expect(mat.emissiveIntensity * mat.emissive.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(0);
    const tipMat = tips.material as THREE.MeshStandardMaterial;
    expect(tipMat.emissiveIntensity).toBeGreaterThan(mat.emissiveIntensity);
  });

  it('after 3 records and 0.5 s: 5 record-arrows and 5 record-beams', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    const three = prologue(['L1', 'L2', 'L3']);
    layer.sync(BASE, 10);
    layer.sync(three, 10);
    layer.sync(three, 10.5);
    expect(drawn(game.root, 'record-arrows')).toBe(5);
    expect(drawn(game.root, 'record-beams')).toBe(5);
    expect(shownNamed(game.root, 'record-halo')).toHaveLength(5);
    // The five still standing are the open records, where they stood.
    const shafts = named<THREE.InstancedMesh>(game.root, 'record-arrows');
    for (const item of ITEMS.slice(3)) expect(instancesAt(shafts, item.at), item.id).toHaveLength(1);
  });

  it('keeps each recorded arrow where it stands as it fades out, no faster than 2 Hz allows, and hides it within 0.5 s', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    const shafts = named<THREE.InstancedMesh>(game.root, 'record-arrows');
    const fade = shafts.geometry.getAttribute('aFade');
    layer.sync(BASE, 3);
    const pose = new Map(ITEMS.map((item) => [item.id, matrixAt(shafts, instancesAt(shafts, item.at)[0])]));
    const recorded = ['L2', 'L5', 'L7'];
    const last = new Map(recorded.map((id) => [id, 1]));
    const gone = new Map<string, number>();
    const beams = named<THREE.InstancedMesh>(game.root, 'record-beams');
    const full = new THREE.Color();
    beams.getColorAt(0, full);
    const glow = new Map(recorded.map((id) => [id, { beam: 1, halo: 1 }]));
    const dt = 1 / 60;
    for (let k = 0; k <= 36; k++) {
      layer.sync(prologue(recorded), 3 + k * dt);
      // Its beam and its halo fade with it, no faster.
      for (const id of recorded) {
        const spot = ITEMS.find((it) => it.id === id)!.at;
        const [b] = instancesAt(beams, spot);
        const halo = shownNamed(game.root, 'record-halo').find((h) => flatDist(h.position, spot) <= 1e-9) as THREE.Sprite | undefined;
        if (b === undefined || !halo) continue;
        const c = new THREE.Color();
        beams.getColorAt(b, c);
        const beamK = c.r / full.r;
        const haloK = (halo.material as THREE.SpriteMaterial).opacity / 0.55;
        const g = glow.get(id)!;
        expect(beamK).toBeLessThanOrEqual(g.beam + 1e-6);
        expect(g.beam - beamK).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
        expect(haloK).toBeLessThanOrEqual(g.halo + 1e-9);
        expect(g.halo - haloK).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
        glow.set(id, { beam: beamK, halo: haloK });
      }
      // Every arrow drawn stands exactly as it stood: none moves, toward the chariot or anywhere else.
      for (let i = 0; i < shafts.count; i++) {
        const item = ITEMS.find((it) => flatDist(placeOf(shafts, i), it.at) <= F32);
        expect(item, `instance ${i}, frame ${k}`).toBeDefined();
        expect(matrixAt(shafts, i).equals(pose.get(item!.id)!)).toBe(true);
        if (!recorded.includes(item!.id)) expect(fade.getX(i)).toBe(1);
      }
      for (const id of recorded) {
        const here = instancesAt(shafts, ITEMS.find((it) => it.id === id)!.at);
        if (here.length === 0) {
          if (!gone.has(id)) gone.set(id, k * dt);
          continue;
        }
        expect(gone.has(id), `${id} came back`).toBe(false);
        const f = fade.getX(here[0]);
        // Fading, at most a full swing in a quarter second (a half cycle at 2 Hz).
        expect(f).toBeLessThanOrEqual(last.get(id)!);
        expect(last.get(id)! - f).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
        last.set(id, f);
      }
    }
    for (const id of recorded) {
      expect(gone.get(id), id).toBeGreaterThanOrEqual(0.25);
      expect(gone.get(id), id).toBeLessThanOrEqual(0.5);
      // Faded well down before it went.
      expect(glow.get(id)!.beam, id).toBeLessThan(0.1);
      expect(glow.get(id)!.halo, id).toBeLessThan(0.1);
    }
  });

  it('shows no stamps without sight; with sight, a lotus over each of the 5 open records and a broken ring over the copy, facing the camera', () => {
    const { game } = fakeGame();
    game.camera.position.set(-20, 30, 60);
    game.camera.lookAt(-50, 0, 40);
    const layer = createPickups(game);
    const three = prologue(['L1', 'L2', 'L3']);
    layer.sync(BASE, 0);
    layer.sync(three, 0);
    layer.sync(three, 0.5);
    expect(drawn(game.root, 'stamp-lotus')).toBe(0);
    expect(drawn(game.root, 'stamp-ring')).toBe(0);
    // Sight on: the stamps come out, whole after a quarter second.
    for (let k = 1; k <= 20; k++) layer.sync(sighted(three), 0.5 + k / 64);
    expect(drawn(game.root, 'stamp-lotus')).toBe(5);
    expect(drawn(game.root, 'stamp-ring')).toBe(1);
    const lotus = named<THREE.InstancedMesh>(game.root, 'stamp-lotus');
    const ring = named<THREE.InstancedMesh>(game.root, 'stamp-ring');
    expect((lotus.material as THREE.MeshBasicMaterial).opacity).toBe(1);
    expect((ring.material as THREE.MeshBasicMaterial).opacity).toBe(1);
    for (let k = 0; k < 5; k++) {
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      matrixAt(lotus, k).decompose(p, q, new THREE.Vector3());
      // Over an open record's arrow, turned to the camera.
      expect(ITEMS.slice(3).some((it) => flatDist(p, it.at) <= 1.5)).toBe(true);
      expect(height(p)).toBeGreaterThan(2.5);
      // Read back from float32 instance storage: within 0.06°.
      expect(q.angleTo(game.camera.quaternion)).toBeLessThan(1e-3);
    }
    expect(flatDist(placeOf(ring, 0), PROLOGUE.scripted.decoys[0])).toBeLessThanOrEqual(1.5);
    // Sight off: they are gone within a quarter second.
    for (let k = 21; k <= 40; k++) layer.sync(three, 0.5 + k / 64);
    expect(drawn(game.root, 'stamp-lotus')).toBe(0);
    expect(drawn(game.root, 'stamp-ring')).toBe(0);
  });

  it('fades the stamps in and out over a quarter second: sight toggled every 0.1 s for 2 s never moves their opacity faster than 2 Hz allows', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    const s = prologue([]);
    /** A stamp mesh's opacity as drawn: 0 while it is hidden. */
    const level = (name: string) => (drawn(game.root, name) > 0 ? (named<THREE.Mesh>(game.root, name).material as THREE.MeshBasicMaterial).opacity : 0);
    const dt = 1 / 64;
    layer.sync(s, 0);
    let last = { lotus: 0, ring: 0 };
    let peak = 0;
    for (let k = 1; k * dt <= 2; k++) {
      const t = k * dt;
      layer.sync(Math.floor(t / 0.1) % 2 === 0 ? sighted(s) : s, t);
      const now = { lotus: level('stamp-lotus'), ring: level('stamp-ring') };
      expect(Math.abs(now.lotus - last.lotus), `lotus at frame ${k}`).toBeLessThanOrEqual(dt / 0.25 + 1e-9);
      expect(Math.abs(now.ring - last.ring), `ring at frame ${k}`).toBeLessThanOrEqual(dt / 0.25 + 1e-9);
      peak = Math.max(peak, now.lotus, now.ring);
      last = now;
    }
    // They still come out with each tap, never past whole.
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('roam: the marker ring and marker-beam stand at the lakon’s marker; its records and copies wait for the lakon', () => {
    const { game } = fakeGame();
    expect(P1_ROAM.run.phase).toBe('roam');
    createPickups(game).sync(P1_ROAM, 0);
    const ring = named(game.root, 'marker-ring');
    const beam = named(game.root, 'marker-beam');
    expect(shown(ring)).toBe(true);
    expect(shown(beam)).toBe(true);
    expect(flatDist(placeOf(ring), P1.marker!)).toBeLessThanOrEqual(1e-9);
    expect(flatDist(placeOf(beam), P1.marker!)).toBeLessThanOrEqual(1e-9);
    for (const n of ['lontar', 'lontar-posts', 'record-arrows', 'record-beams', 'decoys']) expect(drawn(game.root, n), n).toBe(0);
    expect(shown(named(game.root, 'tower-beam'))).toBe(true);
    expect(shown(named(game.root, 'record-circle'))).toBe(true);
  });

  it('during the prologue’s intro the marker ring lies at SPAWN under the chariot, with no beam; a parva’s at its marker', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    expect(BASE.run.phase).toBe('intro');
    layer.sync(BASE, 0);
    const ring = named<THREE.Mesh>(game.root, 'marker-ring');
    expect(shown(ring)).toBe(true);
    expect((ring.material as THREE.MeshBasicMaterial).opacity).toBe(0.85);
    expect(shown(named(game.root, 'marker-beam'))).toBe(false);
    expect(flatDist(placeOf(ring), SPAWN)).toBeLessThanOrEqual(1e-9);
    expect(flatDist(BASE.car, SPAWN)).toBe(0);
    // A parva's intro keeps it at its marker, where the chariot stopped to start the lakon.
    layer.sync(at(P1_ROAM, { phase: 'intro' }), 0.2);
    expect(shown(ring)).toBe(true);
    expect((ring.material as THREE.MeshBasicMaterial).opacity).toBe(0.85);
    expect(shown(named(game.root, 'marker-beam'))).toBe(false);
    expect(flatDist(placeOf(ring), P1.marker!)).toBeLessThanOrEqual(1e-9);
  });

  it('fades the marker ring out where it lay once the intro ends, over 0.4 s and no faster than 2 Hz allows: the last intro shot hands over with no cut', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    const ring = named<THREE.Mesh>(game.root, 'marker-ring');
    const mat = ring.material as THREE.MeshBasicMaterial;
    layer.sync(BASE, 5);
    const lay = ring.position.clone();
    const dt = 1 / 64;
    let last = mat.opacity;
    let gone = NaN;
    for (let k = 1; k <= 40; k++) {
      layer.sync(prologue([]), 5 + k * dt);
      if (!shown(ring)) {
        if (Number.isNaN(gone)) gone = k * dt;
        continue;
      }
      expect(Number.isNaN(gone), `the ring came back at frame ${k}`).toBe(true);
      expect(ring.position.equals(lay)).toBe(true);
      expect(mat.opacity).toBeLessThanOrEqual(last);
      expect(last - mat.opacity).toBeLessThanOrEqual(dt / 0.25 + 1e-9);
      last = mat.opacity;
    }
    expect(gone).toBeGreaterThanOrEqual(0.25);
    expect(gone).toBeLessThanOrEqual(0.5);
    expect(last).toBeLessThan(0.1);
    expect(shown(named(game.root, 'marker-beam'))).toBe(false);
    // A parva's next intro brings it back whole.
    layer.sync(at(P1_ROAM, { phase: 'intro' }), 6);
    expect(shown(ring)).toBe(true);
    expect(mat.opacity).toBe(0.85);
  });

  it('setFinale(true) lights 24 lamps in a ring of r 6 round the tower and hides the records, copies, record beams and markers, with no sync; setFinale(false) undoes it', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    layer.sync(BASE, 0);
    const lamps = named<THREE.InstancedMesh>(game.root, 'lamps');
    expect(shown(lamps)).toBe(false);
    layer.setFinale(true);
    expect(drawn(game.root, 'lamps')).toBe(24);
    expect(drawn(game.root, 'lamp-flames')).toBe(24);
    expect(shownNamed(game.root, 'lamp-halo')).toHaveLength(24);
    for (let k = 0; k < 24; k++) {
      const p = placeOf(lamps, k);
      expect(flatDist(p, ANCHORS.tower)).toBeCloseTo(6, 4);
      expect(Math.abs(height(p))).toBeLessThanOrEqual(F32);
    }
    // Lit: the flames do not wait on the light of the scene.
    expect((named<THREE.Mesh>(game.root, 'lamp-flames').material as THREE.MeshBasicMaterial).toneMapped).toBe(false);
    for (const n of ['record-arrows', 'record-arrow-tips', 'record-beams', 'decoys', 'lontar', 'lontar-posts', 'stamp-lotus', 'stamp-ring']) {
      expect(drawn(game.root, n), n).toBe(0);
    }
    for (const n of ['marker-ring', 'marker-beam']) expect(shown(named(game.root, n)), n).toBe(false);
    expect(shownNamed(game.root, 'record-halo')).toHaveLength(0);
    expect(shown(named(game.root, 'tower-beam'))).toBe(true);
    expect(shown(named(game.root, 'record-circle'))).toBe(true);
    layer.setFinale(false);
    expect(shown(lamps)).toBe(false);
    expect(shownNamed(game.root, 'lamp-halo')).toHaveLength(0);
    expect(drawn(game.root, 'record-arrows')).toBe(8);
    expect(drawn(game.root, 'record-beams')).toBe(8);
    expect(shown(named(game.root, 'marker-ring'))).toBe(true);
  });

  it('draws a parva’s records as lontar, a box 0.9 × 0.12 × 0.25 on a 1.1 m post, each under a gold beam', () => {
    const { game } = fakeGame();
    createPickups(game).sync(at(P1_ROAM, { phase: 'intro' }), 0);
    expect(drawn(game.root, 'lontar')).toBe(2);
    expect(drawn(game.root, 'lontar-posts')).toBe(2);
    expect(drawn(game.root, 'record-beams')).toBe(2);
    expect(drawn(game.root, 'record-arrows')).toBe(0);
    const boxes = named<THREE.InstancedMesh>(game.root, 'lontar');
    const posts = named<THREE.InstancedMesh>(game.root, 'lontar-posts');
    const beams = named<THREE.InstancedMesh>(game.root, 'record-beams');
    boxes.geometry.computeBoundingBox();
    const size = boxes.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(0.9, 6);
    expect(size.y).toBeCloseTo(0.12, 6);
    expect(size.z).toBeCloseTo(0.25, 6);
    for (const item of P1_ITEMS) {
      const [b] = instancesAt(boxes, item.at);
      const [p] = instancesAt(posts, item.at);
      expect(b, item.id).toBeDefined();
      expect(p, item.id).toBeDefined();
      const postHeights = vertices(posts, p).map((v) => over(v, item.at));
      expect(Math.min(...postHeights)).toBeCloseTo(0, 6);
      expect(Math.max(...postHeights)).toBeCloseTo(1.1, 6);
      // The box lies on the post's top.
      expect(Math.min(...vertices(boxes, b).map((v) => over(v, item.at)))).toBeCloseTo(1.1, 6);
      expect(instancesAt(beams, item.at), item.id).toHaveLength(1);
    }
  });

  it('lifts a recorded lontar 2 m and flies it to the prabha in 0.4 s, over the riders’ heads, while its post fades where it stands', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    const [A, B] = P1_ITEMS;
    const yaw = yawOf({ x: A.at.x - P1.marker!.x, z: A.at.z - P1.marker!.z });
    const f = forward(yaw);
    // At top speed, the hull's middle (1.6 m ahead of the origin) 3.3 m short of A: recorded on the next frame. Frames of
    // 1/64 s keep the times exact, so none lands a hair either side of 0.4 s.
    let c = car(A.at.x - f.x * 4.9, A.at.z - f.z * 4.9, yaw, 17);
    const dt = 1 / 64;
    layer.sync(parva1(c, []), 20);
    const boxes = named<THREE.InstancedMesh>(game.root, 'lontar');
    const posts = named<THREE.InstancedMesh>(game.root, 'lontar-posts');
    const postFade = posts.geometry.getAttribute('aFade');
    const rest = placeOf(boxes, instancesAt(boxes, A.at)[0]);
    const postPose = matrixAt(posts, instancesAt(posts, A.at)[0]);
    /** p in the chariot's frame: metres ahead of its origin, to its right, and over the ground under it. */
    const local = (p: THREE.Vector3) => {
      const fw = forward(c.yaw);
      const r = rightOf(c.yaw);
      return { a: (p.x - c.x) * fw.x + (p.z - c.z) * fw.z, c: (p.x - c.x) * r.x + (p.z - c.z) * r.z, h: p.y - groundHeight(c.x, c.z) };
    };
    const flight: { t: number; a: number; c: number; h: number; size: number; world: THREE.Vector3 }[] = [];
    let postGone = NaN;
    let postLast = 1;
    for (let k = 1; k <= 36; k++) {
      c = { ...c, x: c.x + c.vx * dt, z: c.z + c.vz * dt };
      layer.sync(parva1(c, ['A']), 20 + k * dt);
      const t = (k - 1) * dt;
      // B stands where it stood; any other box is A's, on its way.
      for (let i = 0; i < boxes.count; i++) {
        const p = placeOf(boxes, i);
        if (flatDist(p, B.at) <= F32) continue;
        const size = new THREE.Vector3();
        matrixAt(boxes, i).decompose(new THREE.Vector3(), new THREE.Quaternion(), size);
        flight.push({ t, ...local(p), size: size.x, world: p });
        // Its halo goes with it.
        expect(shownNamed(game.root, 'record-halo').some((h) => h.position.distanceTo(p) <= 0.05), `halo at ${t}`).toBe(true);
      }
      const here = instancesAt(posts, A.at);
      if (here.length === 0) {
        if (Number.isNaN(postGone)) postGone = t;
      } else {
        expect(Number.isNaN(postGone), 'the post came back').toBe(true);
        expect(matrixAt(posts, here[0]).equals(postPose)).toBe(true);
        expect(postFade.getX(here[0])).toBeLessThanOrEqual(postLast);
        postLast = postFade.getX(here[0]);
      }
    }
    // It starts where it lay and never sinks below it.
    expect(flight[0].t).toBe(0);
    expect(flight[0].world.distanceTo(rest)).toBeLessThanOrEqual(1e-3);
    for (const s of flight) expect(s.h).toBeGreaterThanOrEqual(flight[0].h - 1e-5);
    // It rises 2 m off its post before it goes anywhere: the highest it gets within 5 cm of where it lay (across the
    // ground, in the chariot's frame) is 2 m up, give or take 3 cm; then it flies.
    const near = flight.filter((s) => Math.hypot(s.a - flight[0].a, s.c - flight[0].c) <= 0.05);
    expect(near.length).toBeGreaterThan(2);
    expect(Math.abs(Math.max(...near.map((s) => s.h)) - flight[0].h - 2)).toBeLessThanOrEqual(0.03);
    expect(near.length).toBeLessThan(flight.length);
    // Over the riders: never near Krishna's feather, Arjuna's crown or the banner but above them.
    for (const s of flight) {
      for (const top of CHARIOT_SILHOUETTE.filter((p) => ['krishna-feather', 'arjuna-crown', 'banner'].includes(p.name))) {
        if (Math.abs(s.a - top.x) <= 0.5 && Math.abs(s.c) <= 0.6) expect(s.h, `${top.name} at ${s.t}`).toBeGreaterThanOrEqual(top.y + 0.05);
      }
    }
    // It ends at the prabha, small, and is gone in 0.4 s.
    const end = flight[flight.length - 1];
    const prabha = CHARIOT_SILHOUETTE.find((p) => p.name === 'prabha')!;
    expect(end.t).toBeGreaterThanOrEqual(0.35);
    expect(end.t).toBeLessThan(0.4);
    expect(Math.hypot(end.a - prabha.x, end.c, end.h - prabha.y)).toBeLessThanOrEqual(0.4);
    expect(end.size).toBeLessThanOrEqual(0.4);
    // The post faded where it stood, gone by 0.5 s.
    expect(postGone).toBeGreaterThanOrEqual(0.25);
    expect(postGone).toBeLessThanOrEqual(0.5);
    expect(drawn(game.root, 'lontar')).toBe(1);
    expect(drawn(game.root, 'record-beams')).toBe(1);
  });

  it('when the skip records lontar far from the chariot, they rise and fade where they stand instead of crossing the field', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    const c = car(ANCHORS.tower.x + 12, ANCHORS.tower.z, 0);
    layer.sync(parva1(c, []), 5);
    const boxes = named<THREE.InstancedMesh>(game.root, 'lontar');
    const turnOf = (k: number) => {
      const q = new THREE.Quaternion();
      matrixAt(boxes, k).decompose(new THREE.Vector3(), q, new THREE.Vector3());
      return q;
    };
    const lying = new Map(P1_ITEMS.map((it) => [it.id, turnOf(instancesAt(boxes, it.at)[0])]));
    const fade = boxes.geometry.getAttribute('aFade');
    const last = new Map(P1_ITEMS.map((it) => [it.id, 1]));
    const dt = 1 / 64;
    for (let k = 0; k <= 32; k++) {
      layer.sync(parva1(c, ['A', 'B'], 'outro'), 5 + k * dt);
      // Both still out for the first quarter second, fading, not dropped.
      if (k * dt < 0.25) expect(drawn(game.root, 'lontar'), `frame ${k}`).toBe(2);
      for (let i = 0; i < boxes.count; i++) {
        const p = placeOf(boxes, i);
        const item = P1_ITEMS.find((it) => flatDist(p, it.at) <= F32);
        expect(item, `box ${i} at frame ${k}`).toBeDefined();
        expect(over(p, item!.at)).toBeGreaterThanOrEqual(1.16 - 1e-4);
        expect(over(p, item!.at)).toBeLessThanOrEqual(1.16 + 2 + 1e-4);
        // It keeps lying as it lay: no turn toward a chariot far off.
        expect(turnOf(i).angleTo(lying.get(item!.id)!)).toBeLessThan(1e-3);
        // It fades, no faster than a quarter-second swing.
        const f = fade.getX(i);
        expect(f, `${item!.id} at frame ${k}`).toBeLessThanOrEqual(last.get(item!.id)!);
        expect(last.get(item!.id)! - f, `${item!.id} at frame ${k}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
        last.set(item!.id, f);
      }
      if (k * dt >= 0.4) expect(drawn(game.root, 'lontar'), `frame ${k}`).toBe(0);
    }
    for (const it of P1_ITEMS) expect(last.get(it.id), it.id).toBeLessThan(0.1);
  });

  it('draws the beams as additive planes with the shaft texture, fog off, upright and turned to the camera: 1.4 × 30, gold, amber and blue-white', () => {
    const { game } = fakeGame();
    const cam = game.camera.position.set(40, 25, 90);
    const layer = createPickups(game);
    layer.sync(BASE, 0);
    const beams = named<THREE.InstancedMesh>(game.root, 'record-beams');
    const marker = named<THREE.Mesh>(game.root, 'marker-beam');
    const tower = named<THREE.Mesh>(game.root, 'tower-beam');
    for (const b of [beams, marker, tower]) {
      const mat = b.material as THREE.MeshBasicMaterial;
      expect(mat.blending, b.name).toBe(THREE.AdditiveBlending);
      expect(mat.map, b.name).toBe(game.textures.shaft);
      expect(mat.fog, b.name).toBe(false);
      expect(mat.depthWrite, b.name).toBe(false);
      expect(mat.transparent, b.name).toBe(true);
    }
    beams.geometry.computeBoundingBox();
    const size = beams.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(1.4, 6);
    expect(size.y).toBeCloseTo(30, 6);
    expect(marker.geometry).toBe(beams.geometry);
    for (let k = 0; k < beams.count; k++) facesCamera(matrixAt(beams, k), cam);
    tower.updateMatrixWorld();
    facesCamera(tower.matrixWorld, cam);
    // The roam marker's beam turns the same way.
    layer.sync(P1_ROAM, 0.1);
    marker.updateMatrixWorld();
    facesCamera(marker.matrixWorld, cam);
    // Gold over the records, amber at the marker, blue-white at the tower.
    layer.sync(BASE, 0.2);
    const hue = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).h;
    const gold = new THREE.Color();
    beams.getColorAt(0, gold);
    expect(hue(gold)).toBeGreaterThanOrEqual(0.1);
    expect(hue(gold)).toBeLessThanOrEqual(0.17);
    const amber = (marker.material as THREE.MeshBasicMaterial).color;
    expect(hue(amber)).toBeGreaterThanOrEqual(0.07);
    expect(hue(amber)).toBeLessThan(hue(gold));
    const blue = (tower.material as THREE.MeshBasicMaterial).color;
    expect(blue.b).toBeGreaterThan(blue.r);
    expect(blue.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l).toBeGreaterThan(0.8);
  });

  it('turns the tower beam to the camera on every frame, synced or not, so it holds through the finale’s orbit', () => {
    const { game, frames } = fakeGame();
    const layer = createPickups(game);
    expect(frames.size).toBe(1);
    layer.setFinale(true);
    const tower = named<THREE.Mesh>(game.root, 'tower-beam');
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      game.camera.position.set(ANCHORS.tower.x + 14 * Math.cos(a), 12, ANCHORS.tower.z + 14 * Math.sin(a));
      for (const frame of frames) frame(k / 2, 1 / 60);
      tower.updateMatrixWorld();
      facesCamera(tower.matrixWorld, game.camera.position);
    }
  });

  it('puts the halos, beams, rings and stamps on FX_LAYER; the halos are additive glow sprites', () => {
    const { game } = fakeGame();
    createPickups(game);
    const fx = 1 << FX_LAYER;
    for (const n of ['record-beams', 'marker-beam', 'tower-beam', 'marker-ring', 'record-circle', 'stamp-lotus', 'stamp-ring']) {
      expect(named(game.root, n).layers.mask, n).toBe(fx);
    }
    for (const n of ['marker-ring', 'record-circle']) {
      const mat = named<THREE.Mesh>(game.root, n).material as THREE.MeshBasicMaterial;
      expect(mat.blending, n).toBe(THREE.AdditiveBlending);
      expect(mat.depthWrite, n).toBe(false);
    }
    const halos = [...allNamed(game.root, 'record-halo'), ...allNamed(game.root, 'lamp-halo')] as THREE.Sprite[];
    expect(halos.length).toBeGreaterThanOrEqual(9 + 24);
    for (const h of halos) {
      expect(h.isSprite).toBe(true);
      expect(h.layers.mask).toBe(fx);
      const mat = h.material as THREE.SpriteMaterial;
      expect(mat.blending).toBe(THREE.AdditiveBlending);
      expect(mat.map).toBe(game.textures.glow);
    }
  });

  it('lays the record circle, a ring of r 9, round the tower over the ground', () => {
    const { game } = fakeGame();
    createPickups(game);
    const circle = named<THREE.Mesh>(game.root, 'record-circle');
    const vs = vertices(circle);
    for (const v of vs) {
      expect(Math.abs(flatDist(v, ANCHORS.tower) - 9)).toBeLessThanOrEqual(0.25);
      expect(height(v)).toBeGreaterThan(0.03);
      expect(height(v)).toBeLessThan(0.35);
    }
    // All the way round.
    const sectors = new Set(vs.map((v) => Math.floor(((Math.atan2(v.z - ANCHORS.tower.z, v.x - ANCHORS.tower.x) + Math.PI) / (2 * Math.PI)) * 36) % 36));
    expect(sectors.size).toBe(36);
  });

  it('makes the marker ring a flattened torus of r 5 with 8 petals, laid over the ground at the marker', () => {
    const { game } = fakeGame();
    createPickups(game).sync(P1_ROAM, 0);
    const m = P1.marker!;
    const vs = vertices(named<THREE.Mesh>(game.root, 'marker-ring'));
    for (const v of vs) {
      expect(height(v)).toBeGreaterThan(0.03);
      expect(height(v)).toBeLessThan(0.35);
    }
    const r = vs.map((v) => flatDist(v, m));
    expect(Math.min(...r)).toBeGreaterThan(4.7);
    expect(Math.max(...r)).toBeLessThan(6.6);
    expect(r.filter((d) => Math.abs(d - 5) <= 0.2).length).toBeGreaterThan(100);
    // The petals reach out past the ring at eight bearings, 45° apart.
    const sectors = new Set(
      vs.filter((v) => flatDist(v, m) > 5.6).map((v) => Math.round((Math.atan2(v.z - m.z, v.x - m.x) + 2 * Math.PI) / (Math.PI / 4)) % 8),
    );
    expect(sectors.size).toBe(8);
  });

  it('lays a new lakon’s records out afresh: from the prologue’s arrows to parva 1’s lontar', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    layer.sync(BASE, 0);
    expect(drawn(game.root, 'record-arrows')).toBe(8);
    layer.sync(at(P1_ROAM, { phase: 'intro' }), 0.1);
    expect(drawn(game.root, 'record-arrows')).toBe(0);
    expect(drawn(game.root, 'lontar')).toBe(2);
    expect(drawn(game.root, 'record-beams')).toBe(2);
    expect(drawn(game.root, 'decoys')).toBe(P1.scripted.decoys.length);
  });

  it('brings a parva’s records and copies out the moment its intro begins at the marker (the same lakon, roam to intro)', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    layer.sync(P1_ROAM, 0);
    expect(drawn(game.root, 'lontar')).toBe(0);
    expect(drawn(game.root, 'record-beams')).toBe(0);
    layer.sync(at(P1_ROAM, { phase: 'intro' }), 0.1);
    expect(drawn(game.root, 'lontar')).toBe(2);
    expect(drawn(game.root, 'lontar-posts')).toBe(2);
    expect(drawn(game.root, 'record-beams')).toBe(2);
    expect(drawn(game.root, 'decoys')).toBe(P1.scripted.decoys.length);
    expect(shown(named(game.root, 'marker-beam'))).toBe(false);
    // And once active, they stay out.
    layer.sync(at(P1_ROAM, { phase: 'active' }), 0.2);
    expect(drawn(game.root, 'lontar')).toBe(2);
    expect(drawn(game.root, 'record-beams')).toBe(2);
  });

  it('draws every record of every lakon during its intro, each under its beam', () => {
    const slugs = [0, 2, 2, 4, 9, 1, 2, 2, 2];
    for (let ch = 0; ch <= 8; ch++) {
      const def = missionFor(ch, Array.from({ length: slugs[ch] }, (_, k) => `s${k}`));
      const items = itemsOf(def.steps);
      const s0 = startChapter(def, def.start, 1, WORLD);
      const { game } = fakeGame();
      createPickups(game).sync(at(s0, { phase: 'intro' }), 0);
      expect(drawn(game.root, ch === 0 ? 'record-arrows' : 'lontar'), `chapter ${ch}`).toBe(items.length);
      expect(drawn(game.root, 'record-beams'), `chapter ${ch}`).toBe(items.length);
    }
  });

  it('keeps the records out while a failed lakon waits for its retry', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    layer.sync(prologue(['L1']), 0);
    layer.sync(at(BASE, { phase: 'failed', recorded: ['L1'] }), 1);
    expect(drawn(game.root, 'record-arrows')).toBe(7);
    expect(drawn(game.root, 'record-beams')).toBe(7);
  });

  it('fades a filed copy out where it stands over 0.4 s, fades a later copy in, and shows none in roam', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    const decoys = named<THREE.InstancedMesh>(game.root, 'decoys');
    const fade = decoys.geometry.getAttribute('aFade');
    const s = prologue([]);
    layer.sync(s, 1);
    expect(decoys.count).toBe(1);
    expect(fade.getX(0)).toBe(1);
    const pose = matrixAt(decoys, 0);
    const filed: GameState = { ...s, decoys: [{ ...s.decoys[0], state: 'filed' }] };
    const dt = 1 / 64;
    let gone = NaN;
    let last = 1;
    for (let k = 0; k <= 36; k++) {
      layer.sync(filed, 1 + k * dt);
      if (decoys.count === 0) {
        if (Number.isNaN(gone)) gone = k * dt;
        continue;
      }
      expect(Number.isNaN(gone), 'the copy came back').toBe(true);
      expect(matrixAt(decoys, 0).equals(pose)).toBe(true);
      expect(fade.getX(0)).toBeLessThanOrEqual(last);
      expect(last - fade.getX(0)).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
      last = fade.getX(0);
    }
    expect(gone).toBeGreaterThanOrEqual(0.25);
    expect(gone).toBeLessThanOrEqual(0.5);
    // A copy that appears later (a volley's) fades in rather than popping up.
    const later: GameState = { ...filed, decoys: [...filed.decoys, { id: 9, at: { x: -40, z: 30 }, born: 5, life: null, state: 'open', mimic: false }] };
    const level = () => {
      const [k] = instancesAt(decoys, { x: -40, z: 30 });
      return k === undefined ? 0 : fade.getX(k);
    };
    layer.sync(later, 2);
    expect(level()).toBe(0);
    layer.sync(later, 2.2);
    expect(level()).toBeCloseTo(0.5, 6);
    layer.sync(later, 2.5);
    expect(level()).toBe(1);
    // Before a lakon starts, its copies are not out.
    layer.sync(P1_ROAM, 3);
    expect(drawn(game.root, 'decoys')).toBe(0);
  });

  it('fades a copy filed a second time, as when a lakon is played again with the same def', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    const decoys = named<THREE.InstancedMesh>(game.root, 'decoys');
    const fade = decoys.geometry.getAttribute('aFade');
    const s = prologue([]);
    const copy = (state: Decoy['state']): GameState => ({ ...s, decoys: [{ ...s.decoys[0], state }] });
    layer.sync(copy('open'), 1);
    layer.sync(copy('filed'), 1.1);
    layer.sync(copy('filed'), 2);
    expect(decoys.count).toBe(0);
    // Out again (startChapter numbers its copies from 1 each run), then filed again: it fades as the first time.
    layer.sync(copy('open'), 3);
    expect(decoys.count).toBe(1);
    layer.sync(copy('filed'), 4);
    layer.sync(copy('filed'), 4.1);
    expect(decoys.count).toBe(1);
    expect(fade.getX(0)).toBeCloseTo(0.75, 6);
  });

  it('draws the prologue’s start in 15 calls and the finale in 28: an instanced mesh per kind, a sprite per halo', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    layer.sync(BASE, 0);
    const calls = () => {
      let n = 0;
      named(game.root, 'pickups').traverse((o) => {
        const inst = o as THREE.InstancedMesh;
        if (((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite) && shown(o) && (!inst.isInstancedMesh || inst.count > 0)) n++;
      });
      return n;
    };
    // Arrows and tips, 8 halos, the beams, the copy, the marker ring, and the tower's beam and circle.
    expect(calls()).toBe(15);
    layer.setFinale(true);
    // The tower's beam and circle, the lamps, their flames and their 24 halos.
    expect(calls()).toBe(28);
  });

  it('dispose removes its group, stops listening and frees its geometries, materials and instanced meshes, not the scene’s textures', () => {
    const { game, frames } = fakeGame();
    const layer = createPickups(game);
    layer.sync(BASE, 0);
    const group = named(game.root, 'pickups');
    const owned = ownedBy(group, game);
    expect(owned.size).toBeGreaterThan(30);
    expectFreed(game, owned, () => layer.dispose());
    expect(game.root.children).not.toContain(group);
    expect(frames.size).toBe(0);
  });

  it('allocates nothing per frame: no new THREE. between function sync( and function dispose(, where every per-frame helper lives', () => {
    const src = read('src/lib/bowobharata-game/world/pickups3d.ts');
    const from = src.indexOf('function sync(');
    const to = src.indexOf('function dispose(');
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    expect(src.slice(from, to)).not.toContain('new THREE.');
    // So the check reads every function a frame runs: above sync only what runs once, or once a lakon; after dispose, none.
    const declared = (text: string) => [...text.matchAll(/\bfunction (\w+)\(/g)].map((m) => m[1]);
    const start = src.indexOf('export function createPickups(');
    expect(start).toBeGreaterThan(0);
    for (const fn of declared(src.slice(0, start))) expect(['shimmerAt', 'pickupsOf', 'fading', 'markerGeo'], fn).toContain(fn);
    for (const fn of declared(src.slice(start, from)).slice(1)) expect(['instanced', 'fadeOn', 'slotOf', 'layOut'], fn).toContain(fn);
    expect(declared(src.slice(to))).toEqual(['dispose']);
    // shimmerAt, the one module-level function a frame runs, is plain arithmetic.
    const shimmer = src.slice(src.indexOf('export function shimmerAt('));
    expect(shimmer.slice(0, shimmer.indexOf('\n}\n'))).not.toContain('new ');
  });
});

describe('disposeGroup', () => {
  it('frees each geometry, material and instanced mesh under a group once, hidden ones, points and lines too; never a texture or the sprites’ shared quad', () => {
    const tex = new THREE.Texture();
    const sharedGeo = new THREE.BoxGeometry();
    const sharedMat = new THREE.MeshBasicMaterial({ map: tex });
    const inst = new THREE.InstancedMesh(new THREE.ConeGeometry(), new THREE.MeshStandardMaterial(), 4);
    const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ map: tex }));
    const line = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    const multi = new THREE.Mesh(new THREE.PlaneGeometry(), [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()]);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.add(new THREE.Mesh(sharedGeo, sharedMat), points, sprite);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(sharedGeo, sharedMat), inst, line, multi, hidden);
    const owned: Disposable[] = [
      sharedGeo, sharedMat, inst, inst.geometry, inst.material as THREE.Material, points.geometry, points.material as THREE.Material,
      line.geometry, line.material as THREE.Material, multi.geometry, ...(multi.material as THREE.Material[]), sprite.material,
    ];
    const times = new Map<unknown, number>();
    for (const r of owned) r.addEventListener('dispose', () => times.set(r, (times.get(r) ?? 0) + 1));
    let quad = 0;
    let texture = 0;
    sprite.geometry.addEventListener('dispose', () => quad++);
    tex.addEventListener('dispose', () => texture++);
    disposeGroup(root);
    for (const r of owned) expect(times.get(r), (r as { type?: string }).type).toBe(1);
    expect(quad).toBe(0);
    expect(texture).toBe(0);
  });

  it('is the one cleanup the layers share: landmarks3d and pickups3d call it and keep no copy of their own', () => {
    for (const f of ['landmarks3d.ts', 'pickups3d.ts']) {
      const src = read(join('src/lib/bowobharata-game/world', f));
      expect(src, f).toMatch(/from '\.\/dispose'/);
      expect(src, f).toContain('disposeGroup(group)');
      expect(src, f).not.toMatch(/new Set<THREE\.BufferGeometry>|new Set<THREE\.Material>/);
    }
  });
});

describe('world/ framing (source)', () => {
  const WORLD_DIR = 'src/lib/bowobharata-game/world';
  const FILES = walk(WORLD_DIR).filter((f) => /\.tsx?$/.test(f));
  // The global constraints' exact specifiers, each matched with its closing quote: '../../bowobharata/stage-math' and the
  // scene modules stay allowed.
  const FORBIDDEN = [
    '../record', '../data', '../data-build', '../copy', '../../perkara', '../../linimasa', '../../linimasa-locale',
    '../../linimasa-en', '../../bowobharata', '../../bowobharata-en', '../../../i18n', '../../../data/perkara.json',
  ];
  const forbiddenIn = (src: string) => FORBIDDEN.filter((s) => src.includes(`'${s}'`) || src.includes(`"${s}"`));
  const TEXT = /fillText|strokeText|TextGeometry|FontLoader|CSS2DRenderer|CSS3DRenderer/;

  it('covers every file of the layers', () => {
    for (const f of ['types.ts', 'shapes.ts', 'dispose.ts', 'landmarks3d.ts', 'ground3d.ts', 'chariot-bind.ts', 'pickups3d.ts']) expect(FILES).toContain(join(WORLD_DIR, f));
  });

  it('the matcher catches each specifier with its closing quote, and lets the allowed ones through', () => {
    expect(forbiddenIn(`import { COPY } from '../copy';`)).toEqual(['../copy']);
    expect(forbiddenIn(`const d = await import("../data");`)).toEqual(['../data']);
    expect(forbiddenIn(`import { x } from '../data-build';`)).toEqual(['../data-build']);
    expect(forbiddenIn(`import p from '../../../data/perkara.json';`)).toEqual(['../../../data/perkara.json']);
    expect(forbiddenIn(`import { PARVAS } from '../../bowobharata';`)).toEqual(['../../bowobharata']);
    expect(forbiddenIn(`import { groundHeight } from '../../bowobharata/stage-math';`)).toEqual([]);
    expect(forbiddenIn(`import { fxLayer } from '../../bowobharata/scene/effects';`)).toEqual([]);
    expect(forbiddenIn(`import { ANCHORS } from '../world';`)).toEqual([]);
  });

  it('no file in world/ imports the record, the data, the copy or any page text', () => {
    for (const f of FILES) expect(forbiddenIn(read(f)), f).toEqual([]);
  });

  it('no file in world/ draws text', () => {
    for (const f of FILES) expect(read(f).match(TEXT)?.[0] ?? null, f).toBeNull();
  });
});

describe('three allow-list (all of src)', () => {
  // The 74 THREE names and 11 three/examples/jsm imports in use at 0045dd5: three.core is 257,731 B of a 260,000 B budget,
  // so a new class or examples module can break check-dist.
  const BASE_THREE = new Set([
    'ACESFilmicToneMapping', 'AdditiveBlending', 'AnimationAction', 'AnimationClip', 'AnimationMixer', 'BackSide', 'Box3',
    'BoxGeometry', 'BufferAttribute', 'BufferGeometry', 'Camera', 'CanvasTexture', 'CatmullRomCurve3', 'Color', 'ConeGeometry',
    'CylinderGeometry', 'DataTexture', 'DataUtils', 'DirectionalLight', 'DoubleSide', 'Euler', 'Float32BufferAttribute', 'Fog',
    'FogExp2', 'Group', 'HalfFloatType', 'HemisphereLight', 'IUniform', 'IcosahedronGeometry', 'InstancedBufferAttribute',
    'InstancedMesh', 'LatheGeometry', 'Line', 'LineBasicMaterial', 'LineLoop', 'LineSegments', 'LinearFilter',
    'LinearMipmapLinearFilter', 'Material', 'Matrix4', 'Mesh', 'MeshBasicMaterial', 'MeshPhysicalMaterial', 'MeshStandardMaterial',
    'MeshStandardMaterialParameters', 'NearestFilter', 'NormalBlending', 'Object3D', 'PCFShadowMap', 'PMREMGenerator',
    'PerspectiveCamera', 'PlaneGeometry', 'PointLight', 'Points', 'PointsMaterial', 'Quaternion', 'RGBAFormat', 'Raycaster',
    'RepeatWrapping', 'SRGBColorSpace', 'Scene', 'ShaderMaterial', 'SkinnedMesh', 'SphereGeometry', 'Sprite', 'SpriteMaterial',
    'Texture', 'TorusGeometry', 'TubeGeometry', 'Vector2', 'Vector3', 'Vector4', 'WebGLRenderTarget', 'WebGLRenderer',
  ]);
  const BASE_JSM = new Set([
    'utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js',
    'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/ShaderPass.js', 'postprocessing/OutputPass.js',
    'postprocessing/UnrealBloomPass.js', 'postprocessing/GTAOPass.js', 'postprocessing/BokehPass.js',
    'controls/OrbitControls.js', 'loaders/GLTFLoader.js',
  ].map((s) => `three/examples/jsm/${s}`));
  const SOURCES = walk('src').filter((f) => /\.tsx?$/.test(f));

  it('pins 74 names and 11 examples modules', () => {
    expect(BASE_THREE.size).toBe(74);
    expect(BASE_JSM.size).toBe(11);
  });

  it('every THREE.X in src/**/*.ts(x) is one of the 74', () => {
    const used = new Set<string>();
    const stray: string[] = [];
    for (const f of SOURCES) {
      for (const m of read(f).matchAll(/\bTHREE\.([A-Za-z_$][\w$]*)/g)) {
        used.add(m[1]);
        if (!BASE_THREE.has(m[1])) stray.push(`${f}: THREE.${m[1]}`);
      }
    }
    expect(stray).toEqual([]);
    expect(used.size).toBeGreaterThan(60); // the walk reaches the scene
  });

  it('every three/examples/jsm specifier in src is one of the 11, and three is otherwise imported whole', () => {
    const stray: string[] = [];
    let jsm = 0;
    for (const f of SOURCES) {
      const src = read(f);
      for (const m of src.matchAll(/three\/examples\/jsm\/[^'"`\s]+/g)) {
        jsm++;
        if (!BASE_JSM.has(m[0])) stray.push(`${f}: ${m[0]}`);
      }
      // Any other way into the package (three/addons, three/src, three/webgpu …) would bypass the pin.
      for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*)['"](three(?:\/[^'"]*)?)['"]/g)) {
        if (m[1] !== 'three' && !BASE_JSM.has(m[1])) stray.push(`${f}: ${m[1]}`);
      }
    }
    expect(stray).toEqual([]);
    expect(jsm).toBeGreaterThanOrEqual(11);
  });

  it('no named import from three brings in a class outside the 74', () => {
    const stray: string[] = [];
    for (const f of SOURCES) {
      for (const m of read(f).matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]three['"]/g)) {
        if (m[1]) continue;
        for (const spec of m[2].split(',').map((s) => s.trim()).filter(Boolean)) {
          if (spec.startsWith('type ')) continue;
          const name = spec.split(/\s+as\s+/)[0];
          if (!BASE_THREE.has(name)) stray.push(`${f}: ${name}`);
        }
      }
    }
    expect(stray).toEqual([]);
  });
});

describe('arrows3d (back-compatibility)', () => {
  it('still exports createArrowLayer and laneStart', () => {
    expect(typeof arrows.createArrowLayer).toBe('function');
    expect(typeof arrows.laneStart).toBe('function');
    expect(arrows.laneStart(0).x).toBe(6);
  });

  it('takes its shapes from world/shapes, which exports them with the bake and merge helpers', () => {
    const src = read('src/lib/bowobharata-game/arrows3d.ts');
    expect(src).toMatch(/from '\.\/world\/shapes'/);
    for (const fn of ['realShaftGeo', 'realTipGeo', 'decoyShaftGeo', 'decoyFletchGeo', 'lotusGeo', 'brokenRingGeo', 'bake', 'merge']) {
      expect(src, fn).not.toMatch(new RegExp(`function ${fn}\\b|const ${fn}\\b`));
    }
    for (const fn of ['realShaftGeo', 'realTipGeo', 'decoyShaftGeo', 'decoyFletchGeo', 'lotusGeo', 'brokenRingGeo'] as const) {
      const geo = shapes[fn]();
      expect(geo.getAttribute('position').count, fn).toBeGreaterThan(0);
    }
    expect(typeof shapes.bake).toBe('function');
    expect(typeof shapes.merge).toBe('function');
    expect(typeof shapes.at).toBe('function');
    expect(typeof shapes.noUv).toBe('function');
  });
});
