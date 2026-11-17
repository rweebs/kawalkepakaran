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
import { ANCHORS, POSTS, ROCKS, SPAWN, TENTS, TOWER_EXIT, TOWER_R, TREES, clearance, staticColliders, type Collider } from '../src/lib/bowobharata-game/world';
import { DEFAULT_ASPECT, advance, createWorld, startChapter, timeScaleOf, viewOf, type FrameInput, type GameState } from '../src/lib/bowobharata-game/engine';
import { createBot } from '../src/lib/bowobharata-game/autopilot';
import { across, missionFor, type MissionDef, type StepDef } from '../src/lib/bowobharata-game/missions';
import type { Decoy, Phase } from '../src/lib/bowobharata-game/mission-run';
import { CHARIOT_SILHOUETTE, chaseView, initChase, stepChase, type ChaseCam, type ChaseOpts } from '../src/lib/bowobharata-game/chase';
import { hullCircles } from '../src/lib/bowobharata-game/collide';
import { CHASE, DRIVE, MISSION_TIMING, VOLLEY } from '../src/lib/bowobharata-game/tuning';
import { arrowPoint, scriptedVolley, telegraphAt, type Cloud, type Volley } from '../src/lib/bowobharata-game/volley';
import type { SceneGame } from '../src/lib/bowobharata-game/world/types';
import { CLEAR, createLandmarks } from '../src/lib/bowobharata-game/world/landmarks3d';
import { DUST, TUFTS, cellTuft, createGround, inField, ringCells, tuftFade } from '../src/lib/bowobharata-game/world/ground3d';
import { bindChariot } from '../src/lib/bowobharata-game/world/chariot-bind';
import { SHIMMER, createPickups, shimmerAt } from '../src/lib/bowobharata-game/world/pickups3d';
import { createVolleys } from '../src/lib/bowobharata-game/world/volleys3d';
import { FADE_KEY, fadeOn, fading, instanced } from '../src/lib/bowobharata-game/world/instancing';
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

  it('tuftFade: a tuft is whole within 6 m of the ring’s edge, gone at the edge, and falls smoothly between', () => {
    expect(TUFTS.fade).toBe(6);
    for (const r of [TUFTS.desktop.radius, TUFTS.phone.radius]) {
      expect(tuftFade(0, r)).toBe(1);
      expect(tuftFade(r - 6, r)).toBe(1);
      expect(tuftFade(r - 3, r)).toBeCloseTo(0.5, 12);
      expect(tuftFade(r, r)).toBe(0);
      expect(tuftFade(r + 5, r)).toBe(0);
      // It never rises outward, and never falls faster than a smoothstep over the 6 m does at its steepest (1.5 / 6 per m).
      let last = 1;
      for (let d = r - 7; d <= r + 1; d += 0.01) {
        const f = tuftFade(d, r);
        expect(f).toBeLessThanOrEqual(last + 1e-12);
        expect(last - f).toBeLessThanOrEqual((1.5 / 6) * 0.01 + 1e-9);
        last = f;
      }
    }
  });

  it('scales each tuft by tuftFade of its distance from the chariot, so none pops in or out at the edge or as the ring re-centres on a grid line', () => {
    const dt = 1 / 60;
    const speed = 14;
    // The most a tuft's size can change in a frame: the fade's steepest slope, times the largest tuft, times a frame's drive.
    const step = (1.5 / 6) * 1.3 * speed * dt + 1e-4;
    for (const mobile of [false, true]) {
      const { game } = fakeGame();
      const layer = createGround(game, mobile);
      const radius = mobile ? TUFTS.phone.radius : TUFTS.desktop.radius;
      const mesh = tufts(game);
      // Each drawn tuft, by where it stands, at its size now (tufts turn only about the vertical, so the upright axis's length).
      const sizes = () => {
        const out = new Map<string, number>();
        const m = new THREE.Matrix4();
        for (let k = 0; k < mesh.count; k++) {
          mesh.getMatrixAt(k, m);
          const p = new THREE.Vector3().setFromMatrixPosition(m);
          out.set(`${p.x.toFixed(3)},${p.z.toFixed(3)}`, new THREE.Vector3().setFromMatrixColumn(m, 1).length());
        }
        return out;
      };
      // 6 s at 14 m/s, bending gently: across many cells, so the ring re-centres again and again.
      let s = stateAt(-60, 100, 0.4, speed);
      let prev = new Map<string, number>();
      let cell = '';
      let recentred = 0;
      for (let k = 0; k < 360; k++) {
        const yaw = s.car.yaw - 0.2 * dt;
        const f = forward(yaw);
        s = { ...s, car: { ...s.car, yaw, x: s.car.x + f.x * speed * dt, z: s.car.z + f.z * speed * dt, vx: f.x * speed, vz: f.z * speed } };
        layer.sync(s, k * dt);
        const now = sizes();
        expect(now.size).toBeGreaterThan(20);
        for (const [key, size] of now) {
          const [x, z] = key.split(',').map(Number);
          const t = cellTuft(Math.floor(x / TUFTS.cell), Math.floor(z / TUFTS.cell));
          const d = Math.hypot(t.x - s.car.x, t.z - s.car.z);
          expect(d, key).toBeLessThan(radius);
          expect(size, key).toBeCloseTo(t.scale * tuftFade(d, radius), 4);
        }
        if (k > 0) {
          for (const key of new Set([...prev.keys(), ...now.keys()])) {
            expect(Math.abs((now.get(key) ?? 0) - (prev.get(key) ?? 0)), `${key} at frame ${k}`).toBeLessThanOrEqual(step);
          }
        }
        const c = `${Math.floor(s.car.x / TUFTS.cell)},${Math.floor(s.car.z / TUFTS.cell)}`;
        if (c !== cell) recentred++;
        cell = c;
        prev = now;
      }
      expect(recentred).toBeGreaterThan(10);
    }
  });

  it('fades the tufts each frame without allocating: only a new cell lays the ring out again', () => {
    const src = read('src/lib/bowobharata-game/world/ground3d.ts');
    const from = src.indexOf('  function fadeTufts(');
    expect(from).toBeGreaterThan(0);
    const to = src.indexOf('\n  }\n', from);
    const body = src.slice(from, to);
    expect(body).toContain('tuftFade(');
    expect(frameCodeFaults(body, src.slice(0, from) + src.slice(to), ['ringCells', 'cellTuft', 'mulberry32', 'forward', 'rightOf', 'placeTufts'])).toEqual([]);
    const sync = src.slice(src.indexOf('    sync(s, time) {'));
    expect(sync).toContain('placeTufts(s.car);');
    expect(sync).toContain('fadeTufts(s.car);');
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

/**
 * Every way a frame's code could build something, each named, found in `code` with its comments taken out: `new`, a
 * closure or spread, an object or array literal (after = ( , ? : or return), a template literal, a copying method,
 * Array.from or an Object helper; a call to any of `calls` (helpers that build their result); and a call to a closure or
 * function expression made in `outside` (the rest of the file), which a check of the frame's own text would miss.
 */
function frameCodeFaults(code: string, outside: string, calls: readonly string[] = []): string[] {
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const banned: [string, RegExp][] = [
    ['new', /\bnew\b/],
    ['closure', /=>/],
    ['spread', /\.\.\./],
    ['literal after = ( or ,', /[=(,]\s*[[{]/],
    ['literal in a ternary', /[?:]\s*[[{]/],
    ['returned literal', /\breturn\s*[[{]/],
    ['template literal', /`/],
    ['copying method', /\.(map|filter|slice|concat|flatMap|reduce|forEach|some|every|find|clone|split|join)\(/],
    ['Array.from or an Object helper', /\bArray\.from\(|\bArray\(|\bObject\.\w+\(/],
  ];
  const faults = banned.filter(([, re]) => re.test(bare)).map(([name]) => name);
  for (const name of calls) if (new RegExp(`\\b${name}\\(`).test(bare)) faults.push(`calls ${name}`);
  const closures = [...outside.matchAll(/\b(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function\b|(?:\([^()]*\)|\w+)\s*(?::[^=;]+?)?=>)/g)];
  for (const [, name] of closures) if (new RegExp(`\\b${name}\\(`).test(bare)) faults.push(`calls the closure ${name}`);
  return faults;
}

describe('frame-code check', () => {
  it('names each way a frame could build something, and passes the code a frame does run', () => {
    const cases: [string, string][] = [
      ['new', 'const m = new THREE.Matrix4();'],
      ['closure', 'list.sort((a, b) => a - b);'],
      ['spread', 'f(...xs);'],
      ['literal after = ( or ,', 'const p = { x: 1 };'],
      ['literal after = ( or ,', 'g(a, [1, 2]);'],
      ['literal in a ternary', 'const q = ok ? { x } : null;'],
      ['literal in a ternary', 'const q = ok ? null : [x];'],
      ['returned literal', 'return { x };'],
      ['returned literal', 'return [x];'],
      ['template literal', 'mesh.name = `${n}`;'],
      ['copying method', 'const v = spot.clone();'],
      ['copying method', 'const ys = xs.slice(1);'],
      ['Array.from or an Object helper', 'const a = Array.from(xs);'],
      ['Array.from or an Object helper', 'const o = Object.assign(p, q);'],
    ];
    for (const [name, code] of cases) expect(frameCodeFaults(code, ''), code).toContain(name);
    expect(frameCodeFaults('const p = arrowPoint(v, k, s, g);', '', ['arrowPoint'])).toEqual(['calls arrowPoint']);
    expect(frameCodeFaults('n = twice(n);', 'const twice = (k: number): number => k * 2;')).toEqual(['calls the closure twice']);
    expect(frameCodeFaults('n = half(n);', 'const half = function (k: number) { return k / 2; };')).toEqual(['calls the closure half']);
    expect(frameCodeFaults('n = one(n);', 'const one = k => k;')).toEqual(['calls the closure one']);
    // Comments are not code; and what the layers' frames do write passes.
    expect(frameCodeFaults('// a new { x } `here` => ... return [x]\n/* Array.from(xs) */\nx = 1;', '')).toEqual([]);
    const fine = [
      'const v = slotNow[i];',
      'if (v === null || roam) continue;',
      'shown[a] = goal < x ? Math.max(goal, x - step) : Math.min(goal, x + step);',
      'function show(mesh: THREE.InstancedMesh, n: number, fade?: THREE.InstancedBufferAttribute): void {',
      'columns.setMatrixAt(k, m4.compose(spot.set(x, y, z), turn, size.set(columnW[k], 1, 1)));',
    ].join('\n');
    expect(frameCodeFaults(fine, 'const glowMat = (opacity: number) => opacity;')).toEqual([]);
  });
});

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
      expect(mat.customProgramCacheKey(), name).toBe(FADE_KEY);
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

  it("draws the opening step's records of every lakon during its intro, each under its beam", () => {
    const slugs = [0, 2, 2, 4, 9, 1, 2, 2, 2];
    for (let ch = 0; ch <= 8; ch++) {
      const def = missionFor(ch, Array.from({ length: slugs[ch] }, (_, k) => `s${k}`));
      // The records open at the intro: the first step's (Antar's record after the gate opens once the letter is there).
      const items = itemsOf(def.steps.slice(0, 1));
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

  it('eases a volley’s copy out over the last 0.4 s of its life by run.t, so it never pops when the engine drops it; the lakon’s own stay whole', () => {
    const { game } = fakeGame();
    const layer = createPickups(game);
    const decoys = named<THREE.InstancedMesh>(game.root, 'decoys');
    const fade = decoys.geometry.getAttribute('aFade');
    const s = prologue([]);
    const lesson = s.decoys[0];
    expect(lesson.life).toBeNull();
    const copy: Decoy = { id: 40, at: { x: -40, z: 30 }, born: 10, life: 20, state: 'open', mimic: false };
    // As the engine keeps a copy: listed while run.t < born + life, then dropped with no 'gone' first.
    const atRun = (t: number, d: Decoy): GameState => ({ ...s, run: { ...s.run, t }, decoys: t < d.born + d.life! ? [lesson, d] : [lesson] });
    const level = (p: XZ) => {
      const [k] = instancesAt(decoys, p);
      return k === undefined ? 0 : fade.getX(k);
    };
    const dt = 1 / 60;
    layer.sync(atRun(20, copy), 1);
    expect(level(copy.at)).toBe(1);
    let last = 1;
    for (let k = 0; k <= 72; k++) {
      const t = 29.2 + k * dt;
      layer.sync(atRun(t, copy), 2 + k * dt);
      const now = level(copy.at);
      if (t < 30) expect(now, `run.t ${t}`).toBeCloseTo(Math.min(1, (30 - t) / 0.4), 5);
      else expect(now, `run.t ${t}`).toBe(0);
      expect(now).toBeLessThanOrEqual(last + 1e-12);
      expect(last - now, `run.t ${t}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
      expect(level(lesson.at)).toBe(1);
      last = now;
    }
    // One retired just before its end (by the cap or the route): it takes the lower of its going and its life, never a jump.
    const late: Decoy = { ...copy, id: 41, born: 30, at: { x: -44, z: 26 } };
    layer.sync(atRun(48, late), 5);
    layer.sync(atRun(49, late), 6);
    expect(level(late.at)).toBe(1);
    last = 1;
    for (let k = 0; k <= 60; k++) {
      const t = 49.5 + k * dt;
      layer.sync(atRun(t, t < 49.75 ? late : { ...late, state: 'gone' }), 7 + k * dt);
      const now = level(late.at);
      expect(now).toBeLessThanOrEqual(last + 1e-12);
      expect(last - now, `run.t ${t}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
      if (t >= 50) expect(now).toBe(0);
      last = now;
    }
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

  it('allocates nothing per frame: no new, literal, spread or closure from function sync( to function dispose(, where every per-frame helper lives', () => {
    const src = read('src/lib/bowobharata-game/world/pickups3d.ts');
    const from = src.indexOf('function sync(');
    const to = src.indexOf('function dispose(');
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const frame = src.slice(from, to);
    expect(frame).not.toContain('new THREE.');
    // openTargets, across, forward and rightOf each build their result: a frame reads the gates' and posts' places from
    // their slots, and the open targets are worked out again only when they can change (retarget, above sync).
    expect(frameCodeFaults(frame, src.slice(0, from) + src.slice(to), ['openTargets', 'across', 'forward', 'rightOf', 'pickupsOf'])).toEqual([]);
    // So the check reads every function a frame runs: above sync only what runs once, once a lakon, or when the open
    // targets can change; after dispose, none.
    const declared = (text: string) => [...text.matchAll(/\bfunction (\w+)\(/g)].map((m) => m[1]);
    const start = src.indexOf('export function createPickups(');
    expect(start).toBeGreaterThan(0);
    for (const fn of declared(src.slice(0, start))) {
      expect(['shimmerAt', 'pickupsOf', 'markerGeo', 'painted', 'gateGeo', 'lapPostGeo', 'letterGeo'], fn).toContain(fn);
    }
    for (const fn of declared(src.slice(start, from)).slice(1)) expect(['slotOf', 'gateSlot', 'postSlot', 'layOut', 'layReplays', 'retarget'], fn).toContain(fn);
    expect(declared(src.slice(to))).toEqual(['dispose']);
    // shimmerAt, the one module-level function a frame runs, is plain arithmetic.
    const shimmer = src.slice(src.indexOf('export function shimmerAt('));
    expect(shimmer.slice(0, shimmer.indexOf('\n}\n'))).not.toContain('new ');
  });

  describe('gates, lap posts and the letter', () => {
    type Layer = ReturnType<typeof createPickups>;
    const slugs = (n: number) => Array.from({ length: n }, (_, k) => `s${k}`);
    const roamOf = (def: MissionDef) => startChapter(def, def.start, 1, WORLD);
    const P2 = missionFor(2, slugs(2));
    const P4 = missionFor(4, slugs(9));
    const P5 = missionFor(5, slugs(1));
    const P7 = missionFor(7, slugs(2));
    const P2_ROAM = roamOf(P2);
    const P4_ROAM = roamOf(P4);
    const P5_ROAM = roamOf(P5);
    const P7_ROAM = roamOf(P7);
    /** A course's gate from the lakon's data: its day (0 for day 1), its centre on the day's line, the heading its span lies across. */
    type Gate = { id: string; day: number; real: boolean; mimic: boolean; at: XZ; heading: number; width: number };
    const gatesOf = (def: MissionDef): Gate[] =>
      def.steps.flatMap((s) =>
        s.kind === 'course'
          ? s.days.flatMap((d, k) =>
              d.gates.map((g) => ({ id: g.id, day: k, real: g.real, mimic: g.mimic, at: across(d.at, d.heading, g.offset), heading: d.heading, width: g.width })),
            )
          : [],
      );
    const GATES_P4 = gatesOf(P4);
    const GATES_P7 = gatesOf(P7);
    const POSTS = P5.steps.flatMap((s) => (s.kind === 'laps' ? s.posts : []));
    const THEN = P5.steps.flatMap((s) => (s.kind === 'laps' ? [s.then] : []))[0];
    /** The mesh a gate is drawn in: gold if real, gold shimmering if a mimic, grey otherwise. */
    const meshFor = (g: Gate) => (g.real ? 'gate-real' : g.mimic ? 'gate-mimic' : 'gate-rewrite');
    const meshOf = (root: THREE.Object3D, name: string) => named<THREE.InstancedMesh>(root, name);
    const fadeAt = (mesh: THREE.InstancedMesh, k: number) => mesh.geometry.getAttribute('aFade').getX(k);
    /** Syncs `s` for `seconds` in frames of 1/64 s after t0; returns the time reached. */
    function hold(layer: Layer, s: GameState, t0: number, seconds: number): number {
      const n = Math.round(seconds * 64);
      for (let k = 1; k <= n; k++) layer.sync(s, t0 + k / 64);
      return t0 + n / 64;
    }
    /** v's offsets from a point on a line's centre, across the line's heading and along it. */
    const lateral = (v: XZ, c: XZ, heading: number) => (v.x - c.x) * rightOf(heading).x + (v.z - c.z) * rightOf(heading).z;
    const along = (v: XZ, c: XZ, heading: number) => (v.x - c.x) * forward(heading).x + (v.z - c.z) * forward(heading).z;
    /** The riders' tops (CHARIOT_SILHOUETTE: Krishna's feather), m over the ground under the chariot. */
    const RIDERS = Math.max(...CHARIOT_SILHOUETTE.map((p) => p.y));
    const hueOf = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).h;
    /** The chase camera's settled boom and height (chase.ts): at rest, at top speed, and in a surge. */
    const BOOMS = [
      { boom: CHASE.distance, height: CHASE.height, boosting: false },
      { boom: CHASE.distanceAtTop, height: CHASE.heightAtTop, boosting: false },
      { boom: CHASE.distanceAtTop + CHASE.boostExtra, height: CHASE.heightAtTop + CHASE.boostLift, boosting: true },
    ];
    /**
     * The height (world y) the chase camera passes over p at, at its lowest, crossing along `heading` either way: chaseView's
     * pose with the chariot a boom's length past p, its height counted over the ground under the chariot, at rest, at top
     * speed and in a surge. On a slope that is not p's own ground.
     */
    function cameraOver(p: XZ, heading: number): number {
      let low = Infinity;
      for (const yaw of [heading, heading + Math.PI]) {
        const f = forward(yaw);
        for (const b of BOOMS) {
          const c = car(p.x + f.x * b.boom, p.z + f.z * b.boom, yaw);
          const cam: ChaseCam = { yaw, dist: b.boom, height: b.height, fov: CHASE.fov, boostK: b.boosting ? 1 : 0, shake: 0, boom: b.boom, look: yaw };
          const { pos } = chaseView(cam, c, { aspect: DEFAULT_ASPECT, boosting: b.boosting, ground: groundHeight, tall: [] }).pose;
          expect(Math.hypot(pos.x - p.x, pos.z - p.z)).toBeLessThan(1e-6);
          low = Math.min(low, pos.y);
        }
      }
      return low;
    }
    /** Each stamp's reach from its centre at whole size, in the shapes' units (times its scale in the scene). */
    const reachOf = (geo: THREE.BufferGeometry) => Math.max(...vertices(new THREE.Mesh(geo)).map((v) => v.length()));
    const REACH = { 'stamp-lotus': reachOf(shapes.lotusGeo()), 'stamp-ring': reachOf(shapes.brokenRingGeo()) } as const;
    /** Every stamp drawn at more than 5% of its whole size: its centre, its size and how far it reaches from its centre. */
    function stampsOut(root: THREE.Object3D): { name: string; at: THREE.Vector3; size: number; reach: number }[] {
      const out: { name: string; at: THREE.Vector3; size: number; reach: number }[] = [];
      for (const name of ['stamp-lotus', 'stamp-ring'] as const) {
        const mesh = meshOf(root, name);
        if (!shown(mesh)) continue;
        for (let k = 0; k < mesh.count; k++) {
          const p = new THREE.Vector3();
          const scale = new THREE.Vector3();
          matrixAt(mesh, k).decompose(p, new THREE.Quaternion(), scale);
          if (scale.x > 0.05 * 2.6) out.push({ name, at: p, size: scale.x, reach: REACH[name] * scale.x });
        }
      }
      return out;
    }
    /** The least gap from the camera at `cam` to any stamp drawn: from its centre, less its reach. */
    const stampGap = (root: THREE.Object3D, cam: { x: number; y: number; z: number }) =>
      Math.min(Infinity, ...stampsOut(root).map((s) => Math.hypot(s.at.x - cam.x, s.at.y - cam.y, s.at.z - cam.z) - s.reach));
    /** The scene camera where the runtime puts it after the layers are drawn: at the view's pose, looking at its look. */
    function placeCamera(game: SceneGame, pose: { pos: { x: number; y: number; z: number }; look: { x: number; y: number; z: number } }): void {
      game.camera.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
      game.camera.lookAt(pose.look.x, pose.look.y, pose.look.z);
      game.camera.updateMatrixWorld();
    }

    it('parva 4, day 1: the gate-real instances are the open real gates within 120 m of the chariot, each whole at its gate', () => {
      const { game } = fakeGame();
      const layer = createPickups(game);
      const mesh = meshOf(game.root, 'gate-real');
      layer.sync(P4_ROAM, 0);
      // None before the lakon starts.
      expect(drawn(game.root, 'gate-real')).toBe(0);
      let t = 0;
      let beyond = 0;
      for (const [x, z] of [[P4.start.x, P4.start.z], [0, -20], [-70, -40], [60, 30]]) {
        const s = at(P4_ROAM, { phase: 'active', dayIndex: 0 }, { car: car(x, z, Math.PI / 2) });
        t = hold(layer, s, t, 1);
        const open = GATES_P4.filter((g) => g.real && flatDist({ x, z }, g.at) < 120);
        beyond += GATES_P4.filter((g) => g.real).length - open.length;
        expect(open.length, `(${x}, ${z})`).toBeGreaterThan(0);
        expect(drawn(game.root, 'gate-real'), `(${x}, ${z})`).toBe(open.length);
        for (const g of open) {
          const here = instancesAt(mesh, g.at);
          expect(here, g.id).toHaveLength(1);
          expect(fadeAt(mesh, here[0]), g.id).toBe(1);
        }
      }
      // Some stood more than 120 m off, and were not drawn.
      expect(beyond).toBeGreaterThan(0);
      // A recorded gate is no longer open: from the start, three of the four.
      const recorded = at(P4_ROAM, { phase: 'active', dayIndex: 1, recorded: ['D1L'] }, { car: car(P4.start.x, P4.start.z, Math.PI / 2) });
      t = hold(layer, recorded, t, 1);
      expect(drawn(game.root, 'gate-real')).toBe(3);
      expect(instancesAt(mesh, GATES_P4.find((g) => g.id === 'D1L')!.at)).toHaveLength(0);
    });

    it('stands every gate of parva 4 and parva 7 on the ground at its centre, its pillars rooted at the ends of its span across the day’s heading, the arch over the riders and under the chase camera', () => {
      for (const [def, gates] of [[P4, GATES_P4], [P7, GATES_P7]] as const) {
        const { game } = fakeGame();
        const layer = createPickups(game);
        const roam = roamOf(def);
        layer.sync(roam, 0);
        let t = 0;
        for (const g of gates) {
          t = hold(layer, at(roam, { phase: 'active', dayIndex: g.day }, { car: car(g.at.x, g.at.z) }), t, 1);
          const mesh = meshOf(game.root, meshFor(g));
          const [k] = instancesAt(mesh, g.at);
          expect(k, `${def.chapter} ${g.id}`).toBeDefined();
          expect(Math.abs(over(placeOf(mesh, k), g.at)), g.id).toBeLessThanOrEqual(F32);
          const vs = vertices(mesh, k);
          const across_ = vs.map((v) => lateral(v, g.at, g.heading));
          // Thin along the heading; across it, the width of its span and no more than its plinths beyond.
          expect(Math.max(...vs.map((v) => Math.abs(along(v, g.at, g.heading)))), g.id).toBeLessThan(0.5);
          expect(Math.max(...across_.map(Math.abs)), g.id).toBeLessThan(g.width / 2 + 0.5);
          for (const side of [-1, 1]) {
            // A pillar on each end of the span, its foot in the ground and its top past the riders.
            const pillar = vs.filter((_, i) => Math.abs(across_[i] - (side * g.width) / 2) <= 0.35);
            expect(pillar.length, `${g.id} ${side}`).toBeGreaterThan(0);
            expect(Math.min(...pillar.map(height)), `${g.id} ${side}`).toBeLessThan(-0.1);
            expect(Math.max(...pillar.map(height)), `${g.id} ${side}`).toBeGreaterThan(RIDERS + 0.1);
          }
          // The way through: nothing between the pillars as low as the riders' heads; the crown 1.5 m under the chase
          // camera at its lowest over the gate, either way, on the slope as it lies.
          const inside = vs.filter((_, i) => Math.abs(across_[i]) < g.width / 2 - 0.4);
          expect(inside.length, g.id).toBeGreaterThan(0);
          expect(Math.min(...inside.map(height)), g.id).toBeGreaterThan(RIDERS + 0.1);
          expect(Math.max(...vs.map((v) => v.y)), g.id).toBeLessThan(cameraOver(g.at, g.heading) - 1.5);
        }
      }
    });

    it('draws real gates gold lit #ffb84a × 1.2 and rewrites grey; a mimic in the gold material at opacity shimmerAt(time), from the data’s mimic flag', () => {
      const { game } = fakeGame();
      const layer = createPickups(game);
      const gold = meshOf(game.root, 'gate-real').material as THREE.MeshStandardMaterial;
      const mimic = meshOf(game.root, 'gate-mimic');
      const mim = mimic.material as THREE.MeshStandardMaterial;
      const grey = meshOf(game.root, 'gate-rewrite').material as THREE.MeshStandardMaterial;
      expect(gold.isMeshStandardMaterial).toBe(true);
      expect(gold.emissive.getHexString()).toBe('ffb84a');
      expect(gold.emissiveIntensity).toBe(1.2);
      expect(hueOf(gold.color)).toBeGreaterThanOrEqual(0.1);
      expect(hueOf(gold.color)).toBeLessThanOrEqual(0.17);
      // The mimic's is the gold one's twin, its own so that only it shimmers.
      expect(mim).not.toBe(gold);
      expect(mim.color.equals(gold.color)).toBe(true);
      expect(mim.emissive.equals(gold.emissive)).toBe(true);
      for (const key of ['emissiveIntensity', 'roughness', 'metalness'] as const) expect(mim[key], key).toBe(gold[key]);
      expect(mim.customProgramCacheKey()).toBe(gold.customProgramCacheKey());
      // Grey: next to no hue.
      expect(grey.color.getHSL({ h: 0, s: 0, l: 0 }).s).toBeLessThan(0.15);
      expect(grey.emissive.getHSL({ h: 0, s: 0, l: 0 }).s).toBeLessThan(0.15);
      // Parva 4, day 4, the chariot by its line: its rewrites mimic gold, each mimic drawn at its gate.
      const c = car(-70, -40, Math.PI / 2);
      const s = at(P4_ROAM, { phase: 'active', dayIndex: 3 }, { car: c });
      let t = hold(layer, s, 0, 1);
      const mimics = GATES_P4.filter((g) => g.mimic && g.day >= 3 && flatDist(c, g.at) < 120);
      expect(mimics.length).toBeGreaterThan(0);
      expect(drawn(game.root, 'gate-mimic')).toBe(mimics.length);
      for (const g of mimics) expect(instancesAt(mimic, g.at), g.id).toHaveLength(1);
      // Its opacity is the copies' shimmer (1.2 Hz, under 2 Hz); the real gates hold still.
      for (let k = 1; k <= 90; k++) {
        t += 1 / 60;
        layer.sync(s, t);
        expect(mim.opacity).toBe(shimmerAt(t));
        expect(gold.opacity).toBe(1);
        expect(grey.opacity).toBe(1);
      }
      // Parva 7's rewrite gates are no mimics: all grey.
      const { game: g7 } = fakeGame();
      const l7 = createPickups(g7);
      const c7 = car(93, 12, Math.PI);
      hold(l7, at(P7_ROAM, { phase: 'active', dayIndex: 0 }, { car: c7 }), 0, 1);
      expect(GATES_P7.some((g) => g.mimic)).toBe(false);
      expect(drawn(g7.root, 'gate-mimic')).toBe(0);
      expect(drawn(g7.root, 'gate-rewrite')).toBe(GATES_P7.filter((g) => !g.real && flatDist(c7, g.at) < 120).length);
      expect(drawn(g7.root, 'gate-rewrite')).toBeGreaterThan(0);
    });

    it('parva 4, days 1 and 4, sight on: a stamp-lotus over the arch of each drawn real gate and a stamp-ring over each drawn rewrite gate, grey or mimic; sight off: no gate stamps', () => {
      const { game } = fakeGame();
      game.camera.position.set(-60, 30, -10);
      game.camera.lookAt(-70, 0, -50);
      // Day 1 draws the grey rewrite gates of days 1-3 and the first mimics; by day 4 every drawn rewrite gate is a mimic.
      // In both the chase camera (9.5 m behind the chariot) is far from every stamp, so none is eased out for it.
      const days = [
        { dayIndex: 0, c: car(-70, 45, Math.PI / 2), recorded: [] as string[] },
        { dayIndex: 3, c: car(-70, -40, Math.PI / 2), recorded: ['D1L', 'D3R'] },
      ];
      let t = 0;
      const layer = createPickups(game);
      const lotus = meshOf(game.root, 'stamp-lotus');
      const ring = meshOf(game.root, 'stamp-ring');
      let s = P4_ROAM;
      let real: Gate[] = [];
      for (const { dayIndex, c, recorded } of days) {
        s = at(P4_ROAM, { phase: 'active', dayIndex, recorded }, { car: c, decoys: [] });
        t = hold(layer, s, t, 1);
        expect(drawn(game.root, 'stamp-lotus')).toBe(0);
        expect(drawn(game.root, 'stamp-ring')).toBe(0);
        t = hold(layer, sighted(s), t, 0.5);
        real = GATES_P4.filter((g) => g.real && !recorded.includes(g.id) && flatDist(c, g.at) < 120);
        const rewrites = GATES_P4.filter((g) => !g.real && g.day >= dayIndex && flatDist(c, g.at) < 120);
        expect(real.length, `day ${dayIndex + 1}`).toBeGreaterThan(0);
        expect(rewrites.some((g) => g.mimic), `day ${dayIndex + 1}`).toBe(true);
        expect(rewrites.some((g) => !g.mimic), `day ${dayIndex + 1}`).toBe(dayIndex === 0);
        expect(drawn(game.root, 'gate-real')).toBe(real.length);
        expect(drawn(game.root, 'gate-rewrite') + drawn(game.root, 'gate-mimic')).toBe(rewrites.length);
        expect(drawn(game.root, 'stamp-lotus')).toBe(real.length);
        expect(drawn(game.root, 'stamp-ring')).toBe(rewrites.length);
        for (const [gates, stamps] of [[real, lotus], [rewrites, ring]] as const) {
          for (const g of gates) {
            const gate = meshOf(game.root, meshFor(g));
            const crown = Math.max(...vertices(gate, instancesAt(gate, g.at)[0]).map((v) => v.y));
            const here = instancesAt(stamps, g.at);
            expect(here, g.id).toHaveLength(1);
            const p = new THREE.Vector3();
            const q = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            matrixAt(stamps, here[0]).decompose(p, q, scale);
            // Over its arch, whole, and turned to the camera.
            expect(Math.min(...vertices(stamps, here[0]).map((v) => v.y)), g.id).toBeGreaterThan(crown);
            expect(scale.x, g.id).toBeCloseTo(2.6, 5);
            expect(q.angleTo(game.camera.quaternion), g.id).toBeLessThan(1e-3);
          }
        }
      }
      // Day 4 passed with sight on: its mimic goes, and its ring with it, the ring's size following the gate's fade, so
      // neither pops.
      const D4R = GATES_P4.find((g) => g.id === 'D4R')!;
      expect(D4R.mimic).toBe(true);
      const gate = meshOf(game.root, 'gate-mimic');
      const dt = 1 / 64;
      let lastSize = 2.6;
      let went = 0;
      for (let k = 1; k <= 48; k++) {
        layer.sync(sighted(at(s, { dayIndex: 4 })), t + k * dt);
        const g = shown(gate) ? instancesAt(gate, D4R.at) : [];
        const r = shown(ring) ? instancesAt(ring, D4R.at) : [];
        expect(r.length, `frame ${k}`).toBe(g.length);
        if (g.length === 0) {
          went++;
          continue;
        }
        const scale = new THREE.Vector3();
        matrixAt(ring, r[0]).decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
        expect(scale.x / 2.6, `frame ${k}`).toBeCloseTo(fadeAt(gate, g[0]), 5);
        expect(lastSize - scale.x, `frame ${k}`).toBeLessThanOrEqual((2.6 * dt) / 0.25 + 1e-5);
        lastSize = scale.x;
      }
      expect(went).toBeGreaterThan(0);
      t += 48 * dt;
      // Sight off: the stamps are gone within a quarter second; the gates stand.
      hold(layer, s, t, 0.3);
      expect(drawn(game.root, 'stamp-lotus')).toBe(0);
      expect(drawn(game.root, 'stamp-ring')).toBe(0);
      expect(drawn(game.root, 'gate-real')).toBe(real.length);
    });

    it('eases a passed day’s rewrite gates out over at least 0.6 s and draws them no more; a passed day’s real gate still open stays drawn', () => {
      const { game } = fakeGame();
      const layer = createPickups(game);
      const dt = 1 / 64;
      for (const [day, c] of [[0, car(-70, 30, Math.PI / 2)], [3, car(-70, -45, Math.PI / 2)]] as const) {
        const real = GATES_P4.find((g) => g.day === day && g.real)!;
        const rewrite = GATES_P4.find((g) => g.day === day && !g.real)!;
        expect(rewrite.mimic).toBe(day >= 3);
        const gold = meshOf(game.root, 'gate-real');
        const other = meshOf(game.root, meshFor(rewrite));
        const state = (dayIndex: number, recorded: string[] = []) => at(P4_ROAM, { phase: 'active', dayIndex, recorded }, { car: c });
        let t = hold(layer, state(day), 100 * day, 1);
        expect(instancesAt(other, rewrite.at), rewrite.id).toHaveLength(1);
        // The day passed, its real gate unrecorded.
        let last = 1;
        let gone = NaN;
        for (let k = 1; k <= 64; k++) {
          layer.sync(state(day + 1), t + k * dt);
          const [r] = instancesAt(gold, real.at);
          expect(r, `${real.id} at frame ${k}`).toBeDefined();
          expect(fadeAt(gold, r)).toBe(1);
          const here = shown(other) ? instancesAt(other, rewrite.at) : [];
          if (here.length === 0) {
            if (Number.isNaN(gone)) gone = k * dt;
            continue;
          }
          expect(Number.isNaN(gone), `${rewrite.id} came back`).toBe(true);
          const f = fadeAt(other, here[0]);
          expect(f).toBeLessThanOrEqual(last);
          expect(last - f, `${rewrite.id} at frame ${k}`).toBeLessThanOrEqual(dt / 0.6 + 1e-6);
          last = f;
        }
        expect(gone, rewrite.id).toBeGreaterThanOrEqual(0.6);
        expect(gone, rewrite.id).toBeLessThanOrEqual(0.7);
        t += 1;
        // Still drawn long after its day: it can be recorded from either side.
        t = hold(layer, state(day + 1), t, 4);
        expect(instancesAt(gold, real.at), real.id).toHaveLength(1);
        expect(shown(other) ? instancesAt(other, rewrite.at) : [], rewrite.id).toHaveLength(0);
        // Recorded at last, it goes too, eased.
        last = 1;
        gone = NaN;
        for (let k = 1; k <= 64; k++) {
          layer.sync(state(day + 1, [real.id]), t + k * dt);
          const here = instancesAt(gold, real.at);
          if (here.length === 0) {
            if (Number.isNaN(gone)) gone = k * dt;
            continue;
          }
          const f = fadeAt(gold, here[0]);
          expect(last - f, `${real.id} at frame ${k}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
          last = f;
        }
        expect(gone, real.id).toBeGreaterThanOrEqual(0.25);
        expect(gone, real.id).toBeLessThanOrEqual(0.7);
      }
    });

    it('never pops a gate: riding the course, passing days, recording a gate, jumping the chariot and ending the course, no gate’s fade swings faster than in a quarter second', () => {
      const { game } = fakeGame();
      const layer = createPickups(game);
      const NAMES = ['gate-real', 'gate-mimic', 'gate-rewrite'];
      const key = (name: string, p: XZ) => `${name} ${Math.round(p.x * 10)} ${Math.round(p.z * 10)}`;
      /** Each gate's fade as drawn, by id: 0 while it is not drawn. */
      const fades = (): Map<string, number> => {
        const byPlace = new Map<string, number>();
        for (const n of NAMES) {
          const mesh = meshOf(game.root, n);
          if (!shown(mesh)) continue;
          for (let k = 0; k < mesh.count; k++) byPlace.set(key(n, placeOf(mesh, k)), fadeAt(mesh, k));
        }
        return new Map(GATES_P4.map((g) => [g.id, byPlace.get(key(meshFor(g), g.at)) ?? 0]));
      };
      const dt = 1 / 64;
      let t = 0;
      let last = fades();
      const seen = new Set<string>();
      const frame = (s: GameState) => {
        t += dt;
        layer.sync(s, t);
        const now = fades();
        for (const g of GATES_P4) {
          expect(Math.abs(now.get(g.id)! - last.get(g.id)!), `${g.id} at ${t}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
          if (now.get(g.id)! > 0) seen.add(g.id);
        }
        last = now;
      };
      for (let k = 0; k < 32; k++) frame(P4_ROAM);
      for (let k = 0; k < 64; k++) frame(at(P4_ROAM, { phase: 'intro' }));
      // North along x = −70 at 17 m/s, each day passed as the chariot crosses its line, day 1's real gate recorded there.
      const lines = [25, 0, -25, -50, -75];
      for (let k = 0; k < 7 * 64; k++) {
        const z = 58 - 17 * k * dt;
        const dayIndex = lines.filter((l) => z < l).length;
        frame(at(P4_ROAM, { phase: 'active', dayIndex, recorded: z < 25 ? ['D1L'] : [] }, { car: car(-70, z, Math.PI / 2, 17) }));
      }
      // A jump across the field and back, as a retry or a teleport makes; then the course done.
      const later = (x: number, z: number, more: Partial<Run> = {}) => at(P4_ROAM, { phase: 'active', dayIndex: 5, recorded: ['D1L'], ...more }, { car: car(x, z) });
      for (let k = 0; k < 64; k++) frame(later(70, 0));
      for (let k = 0; k < 64; k++) frame(later(-70, -60));
      for (let k = 0; k < 64; k++) frame(later(-70, -60, { step: 1, dayIndex: 18 }));
      expect(seen.size).toBe(GATES_P4.length);
      for (const g of GATES_P4) expect(last.get(g.id), g.id).toBe(0);
    });

    /** A lakon with no volleys, so a ride through it is the course alone. */
    const quiet = (def: MissionDef): MissionDef => ({ ...def, riuh: { ...def.riuh, volleys: false } });
    /** No input but `drive`, as a ride holds its pedals. */
    const driving = (drive: Partial<ChariotInput>): FrameInput => ({ drive: { ...NO_INPUT, ...drive }, sight: false, skip: false, assist: false, aspect: DEFAULT_ASPECT });
    /** A stamp's size may change by at most a whole swing in a quarter second. */
    const SWING = (2.6 * (1 / 64)) / 0.25 + 1e-5;

    /**
     * Every gate of a course crossed straight through its middle, along its day's heading and back the other way, at
     * `speed`: the chariot from 6 m short of the gate to 10 m past where its camera crosses it, the chase camera stepped as
     * the engine steps it (the surge's boom and lift above the top speed) and placed after the layers, as the runtime does.
     * Every gate stands whole throughout (day 1, nothing recorded), so each of the courses' slopes and every stamp meets the
     * camera. Returns the least gap from the camera to a drawn stamp, and the steepest a stamp's size swung in a frame.
     */
    function sweep(def: MissionDef, speed: number): { least: number; swing: number; passes: number } {
      const roam = roamOf(def);
      const { game } = fakeGame();
      const layer = createPickups(game);
      const surge = speed > DRIVE.topSpeed;
      const opts: ChaseOpts = { aspect: DEFAULT_ASPECT, boosting: surge, ground: groundHeight, tall: [] };
      const dt = 1 / 64;
      const sizes = () => {
        const out = new Map<string, number>();
        for (const name of ['stamp-lotus', 'stamp-ring']) {
          const mesh = meshOf(game.root, name);
          if (!shown(mesh)) continue;
          for (let k = 0; k < mesh.count; k++) {
            const p = new THREE.Vector3();
            const scale = new THREE.Vector3();
            matrixAt(mesh, k).decompose(p, new THREE.Quaternion(), scale);
            out.set(`${name} ${Math.round(p.x * 10)} ${Math.round(p.z * 10)}`, scale.x);
          }
        }
        return out;
      };
      let t = 0;
      let least = Infinity;
      let swing = 0;
      let passes = 0;
      let last = new Map<string, number>();
      for (const g of gatesOf(def)) {
        for (const yaw of [g.heading, g.heading + Math.PI]) {
          const f = forward(yaw);
          let c: ChariotState = { ...car(g.at.x - f.x * 6, g.at.z - f.z * 6, yaw, speed), boostT: surge ? DRIVE.boostTime : 0 };
          let cam = initChase(c, opts);
          const frames = Math.ceil(((6 + cam.dist + 10) / speed) * 64);
          for (let k = 0; k < frames; k++) {
            c = { ...c, x: c.x + c.vx * dt, z: c.z + c.vz * dt };
            cam = stepChase(cam, c, dt, opts);
            t += dt;
            layer.sync(sighted(at(roam, { phase: 'active', dayIndex: 0, recorded: [] }, { car: c, cam, decoys: [] })), t);
            const view = chaseView(cam, c, opts);
            placeCamera(game, view.pose);
            least = Math.min(least, stampGap(game.root, view.pose.pos));
            // Once sight has brought the stamps out (their opacity eases in over a quarter second, a test of its own), no
            // stamp's size swings faster than that.
            const now = sizes();
            if ((meshOf(game.root, 'stamp-lotus').material as THREE.MeshBasicMaterial).opacity >= 1) {
              for (const key of new Set([...now.keys(), ...last.keys()])) swing = Math.max(swing, Math.abs((now.get(key) ?? 0) - (last.get(key) ?? 0)));
            }
            last = now;
          }
          passes++;
        }
      }
      return { least, swing, passes };
    }

    for (const speed of [13, 17, 25]) {
      it(`keeps every gate stamp at least 1.5 m from the chase camera, easing it out before the camera comes: every gate of parva 4 and parva 7 crossed both ways at ${speed} m/s`, { timeout: 60_000 }, () => {
        for (const def of [P4, P7]) {
          const { least, swing, passes } = sweep(def, speed);
          expect(passes, `parva ${def.chapter}`).toBe(gatesOf(def).length * 2);
          expect(least, `parva ${def.chapter}`).toBeGreaterThanOrEqual(1.5);
          // Eased, never popped: no stamp's size swings faster than a whole swing in a quarter second.
          expect(swing, `parva ${def.chapter}`).toBeLessThanOrEqual(SWING);
        }
      });
    }

    /**
     * The autopilot riding a course from its start until the course is done (or `limit` s), at most `cap` of the top
     * speed; with `surge`, the surge held wherever the bot does not brake, the camera on the surge's boom. Volleys are off
     * and the layer is synced with sight on, so every stamp is out; the camera is placed after the layers, as the runtime
     * places it. Returns the least gap from the camera to a drawn stamp, the fastest the chariot went, and the run.
     */
    function ride(def: MissionDef, cap: number, surge: boolean, limit = 150): { least: number; fastest: number; run: GameState['run'] } {
      let s = startChapter(quiet(def), def.start, 3, WORLD);
      const bot = createBot({ speedCap: cap, useSight: false });
      const { game } = fakeGame();
      const layer = createPickups(game);
      const real = 1 / 64;
      let t = 0;
      let least = Infinity;
      let fastest = 0;
      for (let k = 0; k < limit * 64 && s.run.step === 0 && s.run.phase !== 'failed'; k++) {
        let input = bot(s, WORLD);
        if (surge && s.run.phase === 'active') {
          const braking = input.drive.brake > 0;
          input = { ...input, drive: { ...input.drive, boost: !braking } };
          s = { ...s, car: { ...s.car, boostT: braking ? 0 : DRIVE.boostTime, cooldown: 0 } };
        }
        s = advance(s, input, real, WORLD).state;
        t += real * timeScaleOf(s);
        layer.sync(sighted(s), t);
        const view = viewOf(s, WORLD, DEFAULT_ASPECT);
        placeCamera(game, view.pose);
        least = Math.min(least, stampGap(game.root, view.pose.pos));
        fastest = Math.max(fastest, Math.hypot(s.car.vx, s.car.vz));
      }
      return { least, fastest, run: s.run };
    }

    for (const [speed, cap, surge] of [[13, 13 / 17, false], [17, 1, false], [25, DRIVE.boostTop / DRIVE.topSpeed, true]] as const) {
      it(`keeps every gate stamp at least 1.5 m from the chase camera while the autopilot rides parva 4 and parva 7 at up to ${speed} m/s`, { timeout: 120_000 }, () => {
        for (const def of [P4, P7]) {
          const { least, fastest, run } = ride(def, cap, surge);
          // It rode the course through, every day passed and every real gate recorded, at the speed asked for: within
          // 1 m/s of it on parva 4, and within a tenth on parva 7, whose haze holds the chariot to 0.55 of its top speed.
          expect(run.step, `parva ${def.chapter} at ${speed}`).toBe(1);
          expect(fastest, `parva ${def.chapter} at ${speed}`).toBeGreaterThan(def === P4 ? speed - 1 : speed * 0.9);
          expect(least, `parva ${def.chapter} at ${speed}`).toBeGreaterThanOrEqual(1.5);
        }
      });
    }

    it('keeps the stamps from the camera when a future day’s rewrite gates are crossed early: the engine riding the left lane of parva 4’s first straight at 17 and 25 m/s, day 1 held', { timeout: 60_000 }, () => {
      for (const surge of [false, true]) {
        const { game } = fakeGame();
        const layer = createPickups(game);
        const speed = surge ? DRIVE.boostTop : DRIVE.topSpeed;
        const c = { ...car(-74.5, 40, Math.PI / 2, speed), boostT: surge ? DRIVE.boostTime : 0 };
        const start = startChapter(quiet(P4), { x: c.x, z: c.z, yaw: c.yaw }, 3, WORLD);
        const cam = initChase(c, { aspect: DEFAULT_ASPECT, boosting: surge, ground: groundHeight, tall: WORLD.tall });
        let s: GameState = { ...start, car: c, cam, run: { ...start.run, phase: 'active', dayIndex: 0 } };
        let t = 0;
        let least = Infinity;
        for (let k = 0; k < 64 * 12 && s.car.z > -90; k++) {
          if (surge) s = { ...s, car: { ...s.car, boostT: DRIVE.boostTime } };
          s = advance(s, driving({ throttle: 1, boost: surge }), 1 / 64, WORLD).state;
          // Day 1 held: every rewrite gate on the lane is a later day's, taken early, and stands whole.
          s = { ...s, run: { ...s.run, dayIndex: 0 } };
          t += 1 / 64;
          layer.sync(sighted(s), t);
          const view = viewOf(s, WORLD, DEFAULT_ASPECT);
          placeCamera(game, view.pose);
          least = Math.min(least, stampGap(game.root, view.pose.pos));
        }
        expect(s.car.z, `surge ${surge}`).toBeLessThanOrEqual(-90);
        for (const id of ['D2L', 'D3L', 'D5L']) expect(s.run.taken, `${id}, surge ${surge}`).toContain(id);
        expect(least, `surge ${surge}`).toBeGreaterThanOrEqual(1.5);
      }
    });

    it('keeps the stamps from the camera that leads the chariot in reverse: backing through parva 4’s day 4 real gate', { timeout: 60_000 }, () => {
      const { game } = fakeGame();
      const layer = createPickups(game);
      const D4L = GATES_P4.find((g) => g.id === 'D4L')!;
      const f = forward(D4L.heading);
      // 15 m past the gate on its day's heading, facing on: the camera hangs 9.5 m behind, toward the gate.
      const start = startChapter(quiet(P4), { x: D4L.at.x + f.x * 15, z: D4L.at.z + f.z * 15, yaw: D4L.heading }, 3, WORLD);
      let s: GameState = { ...start, run: { ...start.run, phase: 'active', dayIndex: 3 } };
      let t = 0;
      let least = Infinity;
      let slowest = 0;
      for (let k = 0; k < 64 * 10; k++) {
        s = advance(s, driving({ brake: 1 }), 1 / 64, WORLD).state;
        t += 1 / 64;
        layer.sync(sighted(s), t);
        const view = viewOf(s, WORLD, DEFAULT_ASPECT);
        placeCamera(game, view.pose);
        least = Math.min(least, stampGap(game.root, view.pose.pos));
        slowest = Math.min(slowest, speedOf(s.car));
      }
      // It backed through at the reverse's top speed and 15 m on: the camera crossed the gate first, then the hull.
      expect(slowest).toBeLessThan(-DRIVE.reverseTop + 0.5);
      expect((s.car.x - D4L.at.x) * f.x + (s.car.z - D4L.at.z) * f.z).toBeLessThan(-15);
      expect(s.run.recorded).toContain('D4L');
      expect(least).toBeGreaterThanOrEqual(1.5);
    });

    it('eases records’ and copies’ stamps with them: with sight on, a recorded record’s lotus and a filed copy’s ring shrink as they go and a new copy’s ring grows as it comes, none faster than in a quarter second', () => {
      const { game } = fakeGame();
      const layer = createPickups(game);
      const lotus = meshOf(game.root, 'stamp-lotus');
      const ring = meshOf(game.root, 'stamp-ring');
      /** The size of the stamp of `mesh` whose centre stands within 1.5 m of p across the ground; 0 while none does. */
      const sizeNear = (mesh: THREE.InstancedMesh, p: XZ) => {
        if (!shown(mesh)) return 0;
        for (let k = 0; k < mesh.count; k++) {
          const at_ = new THREE.Vector3();
          const scale = new THREE.Vector3();
          matrixAt(mesh, k).decompose(at_, new THREE.Quaternion(), scale);
          if (flatDist(at_, p) <= 1.5) return scale.x;
        }
        return 0;
      };
      const s = sighted(prologue([]));
      const lesson = s.decoys[0];
      const L5 = ITEMS.find((it) => it.id === 'L5')!;
      const born: Decoy = { id: 9, at: { x: -40, z: 30 }, born: 0, life: null, state: 'open', mimic: false };
      const t = hold(layer, s, 0, 0.5);
      expect(sizeNear(lotus, L5.at)).toBeCloseTo(2.6, 5);
      expect(sizeNear(ring, lesson.at)).toBeCloseTo(2.6, 5);
      expect(sizeNear(ring, born.at)).toBe(0);
      // L5 recorded, the lesson filed and a volley's copy out, all at once.
      const going = sighted({ ...prologue(['L5']), decoys: [{ ...lesson, state: 'filed' }, born] });
      const dt = 1 / 64;
      let last = { record: 2.6, copy: 2.6, born: 0 };
      for (let k = 1; k <= 48; k++) {
        layer.sync(going, t + k * dt);
        const now = { record: sizeNear(lotus, L5.at), copy: sizeNear(ring, lesson.at), born: sizeNear(ring, born.at) };
        for (const part of ['record', 'copy', 'born'] as const) expect(Math.abs(now[part] - last[part]), `${part} at frame ${k}`).toBeLessThanOrEqual(SWING);
        last = now;
      }
      expect(last.record).toBe(0);
      expect(last.copy).toBe(0);
      expect(last.born).toBeCloseTo(2.6, 5);
    });

    it('parva 5: 5 lap-posts pairs, two poles 8 m apart across each post’s heading with a ribbon over the riders; an amber beam over the next post alone', () => {
      const { game } = fakeGame();
      game.camera.position.set(-70, 25, 40);
      const layer = createPickups(game);
      expect(POSTS).toHaveLength(5);
      layer.sync(P5_ROAM, 0);
      expect(drawn(game.root, 'lap-posts')).toBe(0);
      expect(drawn(game.root, 'lap-beams')).toBe(0);
      const s = at(P5_ROAM, { phase: 'active' }, { car: car(-84, -10) });
      let t = hold(layer, s, 0, 1);
      const mesh = meshOf(game.root, 'lap-posts');
      expect(drawn(game.root, 'lap-posts')).toBe(5);
      const half = MISSION_TIMING.postWidth / 2;
      expect(half).toBe(4);
      for (const p of POSTS) {
        const [k] = instancesAt(mesh, p.at);
        expect(k).toBeDefined();
        expect(fadeAt(mesh, k)).toBe(1);
        expect(Math.abs(over(placeOf(mesh, k), p.at))).toBeLessThanOrEqual(F32);
        const vs = vertices(mesh, k);
        const side_ = vs.map((v) => lateral(v, p.at, p.heading));
        expect(Math.max(...vs.map((v) => Math.abs(along(v, p.at, p.heading))))).toBeLessThan(0.3);
        expect(Math.max(...side_.map(Math.abs))).toBeLessThan(half + 0.3);
        for (const side of [-1, 1]) {
          const pole = vs.filter((_, i) => Math.abs(side_[i] - side * half) <= 0.2);
          expect(Math.min(...pole.map(height))).toBeLessThan(-0.1);
          expect(Math.max(...pole.map(height))).toBeGreaterThan(RIDERS + 0.3);
        }
        // The ribbon between them, all of it over the riders' heads; the whole pair 1.5 m under the chase camera at its
        // lowest over the post, either way, on the slope as it lies.
        const ribbon = vs.filter((_, i) => Math.abs(side_[i]) <= half - 0.5);
        expect(ribbon.length).toBeGreaterThan(0);
        expect(Math.min(...ribbon.map(height))).toBeGreaterThan(RIDERS + 0.1);
        expect(Math.max(...vs.map((v) => v.y))).toBeLessThan(cameraOver(p.at, p.heading) - 1.5);
      }
      // Two colours in one mesh: bamboo poles and a ribbon of another hue.
      expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
      const colours = new Set<string>();
      const col = mesh.geometry.getAttribute('color');
      for (let i = 0; i < col.count; i++) colours.add(`${col.getX(i).toFixed(3)} ${col.getY(i).toFixed(3)} ${col.getZ(i).toFixed(3)}`);
      expect(colours.size).toBe(2);
      // The next post, P1, under an amber beam, alone; the beam stands from under the ground, upright, turned to the camera.
      const beams = meshOf(game.root, 'lap-beams');
      expect(drawn(game.root, 'lap-beams')).toBe(1);
      expect(instancesAt(beams, POSTS[0].at)).toHaveLength(1);
      const amber = new THREE.Color();
      beams.getColorAt(0, amber);
      expect(amber.getHexString()).toBe('ffb84a');
      expect(Math.min(...vertices(beams, 0).map((v) => over(v, POSTS[0].at)))).toBeLessThan(0);
      expect(Math.max(...vertices(beams, 0).map((v) => over(v, POSTS[0].at)))).toBeGreaterThanOrEqual(19.5);
      facesCamera(matrixAt(beams, 0), game.camera.position);
      // Crossing P1 and P2: the beam moves on to P3, easing out at P1 and in at P3.
      t = hold(layer, at(s, { lapStart: 1, lapPost: 2 }), t, 0.5);
      expect(drawn(game.root, 'lap-beams')).toBe(1);
      expect(instancesAt(beams, POSTS[2].at)).toHaveLength(1);
      // The laps match: no next post, no beam; the posts stand until the record after them is recorded.
      t = hold(layer, at(s, { lapStart: 80, lapPost: 1, laps: [40, 41], matched: true }), t, 0.5);
      expect(drawn(game.root, 'lap-beams')).toBe(0);
      expect(drawn(game.root, 'lap-posts')).toBe(5);
      hold(layer, at(s, { step: 1, laps: [40, 41], matched: true, recorded: [THEN.id] }), t, 1);
      expect(drawn(game.root, 'lap-posts')).toBe(0);
    });

    it('never pops a lap post or its beam: through the intro, the laps, the match and the step’s end, none swings faster than in a quarter second', () => {
      const { game } = fakeGame();
      const layer = createPickups(game);
      const posts = meshOf(game.root, 'lap-posts');
      const beams = meshOf(game.root, 'lap-beams');
      const full = new THREE.Color('#ffb84a').r;
      const levels = (): number[] =>
        POSTS.flatMap((p) => {
          const k = shown(posts) ? instancesAt(posts, p.at)[0] : undefined;
          const b = shown(beams) ? instancesAt(beams, p.at)[0] : undefined;
          const c = new THREE.Color();
          if (b !== undefined) beams.getColorAt(b, c);
          return [k === undefined ? 0 : fadeAt(posts, k), b === undefined ? 0 : c.r / full];
        });
      const dt = 1 / 64;
      let t = 0;
      let last = levels();
      let lit = 0;
      const frame = (s: GameState) => {
        t += dt;
        layer.sync(s, t);
        const now = levels();
        now.forEach((v, i) => expect(Math.abs(v - last[i]), `${i} at ${t}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6));
        lit = Math.max(lit, ...now.filter((_, i) => i % 2 === 1));
        last = now;
      };
      for (let k = 0; k < 32; k++) frame(P5_ROAM);
      for (let k = 0; k < 64; k++) frame(at(P5_ROAM, { phase: 'intro' }));
      for (let n = 0; n < 10; n++) for (let k = 0; k < 20; k++) frame(at(P5_ROAM, { phase: 'active', lapStart: n > 0 ? 1 : null, lapPost: n % 5 }));
      for (let k = 0; k < 64; k++) frame(at(P5_ROAM, { phase: 'active', lapStart: 80, lapPost: 1, laps: [40, 41], matched: true }));
      for (let k = 0; k < 64; k++) frame(at(P5_ROAM, { phase: 'active', step: 1, laps: [40, 41], matched: true, recorded: [THEN.id] }));
      expect(lit).toBe(1);
      expect(last.every((v) => v === 0)).toBe(true);
    });

    it('parva 5 after the match: the lontar after the laps and its gold beam come out (the open targets are worked out again when the laps match)', () => {
      const { game } = fakeGame();
      const layer = createPickups(game);
      const laps = at(P5_ROAM, { phase: 'active', lapStart: 40, laps: [40], lapPost: 3 }, { car: car(-80, 20) });
      let t = hold(layer, laps, 0, 0.5);
      expect(drawn(game.root, 'lontar')).toBe(0);
      expect(drawn(game.root, 'record-beams')).toBe(0);
      // Matched: the same step, phase and records as before.
      const matched = at(laps, { laps: [40, 41], lapStart: 81, lapPost: 1, matched: true });
      t = hold(layer, matched, t, 0.5);
      expect(drawn(game.root, 'lontar')).toBe(1);
      expect(drawn(game.root, 'lontar-posts')).toBe(1);
      expect(drawn(game.root, 'record-beams')).toBe(1);
      expect(instancesAt(meshOf(game.root, 'lontar'), THEN.at)).toHaveLength(1);
      expect(instancesAt(meshOf(game.root, 'record-beams'), THEN.at)).toHaveLength(1);
      expect(shownNamed(game.root, 'record-halo')).toHaveLength(1);
    });

    it('eases in a record that comes out after the lakon began, over 0.4 s with its beam and halo: Uji ulang’s lontar after the match, Antar’s record after the gate', () => {
      const P2_ITEMS = itemsOf(P2.steps);
      const cases: [GameState, GameState, XZ][] = [
        [at(P5_ROAM, { phase: 'active', lapStart: 40, laps: [40], lapPost: 3 }), at(P5_ROAM, { phase: 'active', lapStart: 81, laps: [40, 41], lapPost: 1, matched: true }), THEN.at],
        [at(P2_ROAM, { phase: 'active', step: 1, recorded: ['A'] }), at(P2_ROAM, { phase: 'active', step: 2, recorded: ['A'] }), P2_ITEMS[1].at],
      ];
      for (const [before, after, spot] of cases) {
        const { game } = fakeGame();
        const layer = createPickups(game);
        const boxes = meshOf(game.root, 'lontar');
        const beams = meshOf(game.root, 'record-beams');
        let t = hold(layer, before, 0, 1);
        const dt = 1 / 64;
        let last = { box: 0, beam: 0, halo: 0 };
        const gold = new THREE.Color();
        for (let k = 1; k <= 40; k++) {
          layer.sync(after, t + k * dt);
          const [b] = instancesAt(boxes, spot);
          const [m] = instancesAt(beams, spot);
          expect(b, `frame ${k}`).toBeDefined();
          expect(m, `frame ${k}`).toBeDefined();
          beams.getColorAt(m, gold);
          const halo = shownNamed(game.root, 'record-halo')[0] as THREE.Sprite;
          const now = { box: fadeAt(boxes, b), beam: gold.r, halo: (halo.material as THREE.SpriteMaterial).opacity / 0.55 };
          for (const part of ['box', 'beam', 'halo'] as const) {
            expect(now[part], `${part} at frame ${k}`).toBeGreaterThanOrEqual(last[part]);
            expect(now[part] - last[part], `${part} at frame ${k}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
          }
          last = now;
        }
        expect(last.box).toBe(1);
        expect(last.halo).toBeCloseTo(1, 9);
        t += 40 * dt;
        // Whole from then on, as a record out from the lakon's start is.
        hold(layer, after, t, 0.5);
        expect(fadeAt(boxes, instancesAt(boxes, spot)[0])).toBe(1);
      }
      // Recorded while still coming out, it goes from as far as it had come (as of the frame it was recorded on): never
      // brighter on its way out.
      const { game } = fakeGame();
      const layer = createPickups(game);
      const boxes = meshOf(game.root, 'lontar');
      const B = P2_ITEMS[1];
      let t = hold(layer, cases[1][0], 0, 1);
      t = hold(layer, cases[1][1], t, 0.1);
      let last = fadeAt(boxes, instancesAt(boxes, B.at)[0]);
      expect(last).toBeGreaterThan(0);
      expect(last).toBeLessThan(0.5);
      let frames = 0;
      for (let k = 1; k <= 32; k++) {
        layer.sync(at(P2_ROAM, { phase: 'active', step: 3, recorded: ['A', B.id] }), t + k / 64);
        const [b] = instancesAt(boxes, B.at);
        if (b === undefined) break;
        const f = fadeAt(boxes, b);
        expect(Math.abs(f - last), `frame ${k}`).toBeLessThanOrEqual(1 / 64 / 0.25 + 1e-6);
        if (k > 1) expect(f, `frame ${k}`).toBeLessThan(last);
        last = f;
        frames++;
      }
      expect(frames).toBeGreaterThan(10);
    });

    it('carries the letter on the chariot in parva 2 only between collecting it and reaching the gate: it eases in once the lontar’s flight is over and out at the gate', () => {
      const { game } = fakeGame();
      const layer = createPickups(game);
      const letter = meshOf(game.chariot.root, 'letter');
      const level = () => (shown(letter) && letter.count > 0 ? fadeAt(letter, 0) : 0);
      const A = itemsOf(P2.steps)[0].id;
      const dt = 1 / 64;
      // Roam, the intro and the ride to the letter: none.
      layer.sync(P2_ROAM, 0);
      expect(level()).toBe(0);
      let t = hold(layer, at(P2_ROAM, { phase: 'intro' }), 0, 0.5);
      t = hold(layer, at(P2_ROAM, { phase: 'active' }), t, 1);
      expect(level()).toBe(0);
      // Collected: the gate is next. The lontar flies to the prabha over 0.4 s; then the letter eases in.
      const carried = at(P2_ROAM, { phase: 'active', step: 1, recorded: [A] });
      let last = 0;
      let came = NaN;
      for (let k = 1; k <= 64; k++) {
        layer.sync(carried, t + k * dt);
        const now = level();
        expect(now, `frame ${k}`).toBeGreaterThanOrEqual(last);
        expect(now - last, `frame ${k}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
        if (now > 0 && Number.isNaN(came)) came = k * dt;
        last = now;
      }
      expect(came).toBeGreaterThanOrEqual(0.4);
      expect(last).toBe(1);
      t += 1;
      // Held through a fail of the leg's clock and its retry.
      t = hold(layer, at(carried, { phase: 'failed' }), t, 1);
      expect(level()).toBe(1);
      t = hold(layer, carried, t, 1);
      expect(level()).toBe(1);
      // At the gate: it eases out, gone within half a second.
      const delivered = at(P2_ROAM, { phase: 'active', step: 2, recorded: [A] });
      let gone = NaN;
      for (let k = 1; k <= 48; k++) {
        layer.sync(delivered, t + k * dt);
        const now = level();
        expect(now, `frame ${k}`).toBeLessThanOrEqual(last);
        expect(last - now, `frame ${k}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
        if (now === 0 && Number.isNaN(gone)) gone = k * dt;
        last = now;
      }
      expect(gone).toBeGreaterThanOrEqual(0.25);
      expect(gone).toBeLessThanOrEqual(0.5);
      expect(shown(letter)).toBe(false);
      t += 1;
      // Not with the record after the gate, at the tower, in the outro, nor in any other lakon at any step.
      for (const s of [delivered, at(delivered, { step: 3, recorded: [A, 'B'] }), at(delivered, { phase: 'outro', step: 4, recorded: [A, 'B'] })]) {
        t = hold(layer, s, t, 0.5);
        expect(level()).toBe(0);
      }
      for (const def of [P4, P5, P7, missionFor(1, ['a', 'b'])]) {
        const { game: other } = fakeGame();
        const l = createPickups(other);
        const roam = roamOf(def);
        let u = 0;
        for (let step = 0; step < def.steps.length; step++) {
          u = hold(l, at(roam, { phase: 'active', step }), u, 0.5);
          expect(drawn(other.chariot.root, 'letter'), `chapter ${def.chapter} step ${step}`).toBe(0);
        }
      }
    });

    it('rolls the letter across the back of the banner pole, behind the riders: a lontar about 0.9 m long across the chariot, lit like the records, hidden in the finale', () => {
      const { game } = fakeGame();
      const layer = createPickups(game);
      const letter = meshOf(game.chariot.root, 'letter');
      // On the chariot itself, so it rides with its every tilt and sway.
      expect(letter.parent).toBe(game.chariot.root);
      // In the chariot's frame (forward, up, right): behind the riders (Arjuna stands at −0.55), at the banner pole (−1.05),
      // over the 1.3 m deck and under the folded flag's foot (2.5 m).
      expect(letter.position.x).toBeLessThan(-0.9);
      expect(letter.position.x).toBeGreaterThan(-1.3);
      expect(letter.position.y).toBeGreaterThan(1.8);
      expect(letter.position.y).toBeLessThan(2.4);
      expect(letter.position.z).toBe(0);
      letter.geometry.computeBoundingBox();
      const size = letter.geometry.boundingBox!.getSize(new THREE.Vector3());
      expect(size.z).toBeGreaterThanOrEqual(0.8);
      expect(size.z).toBeLessThanOrEqual(1);
      expect(size.x).toBeLessThan(0.25);
      expect(size.y).toBeLessThan(0.25);
      // The lontar's look: its leaf colour and glow.
      const leaf = meshOf(game.root, 'lontar').material as THREE.MeshStandardMaterial;
      const mat = letter.material as THREE.MeshStandardMaterial;
      expect(mat).not.toBe(leaf);
      expect(mat.color.equals(leaf.color)).toBe(true);
      expect(mat.emissive.equals(leaf.emissive)).toBe(true);
      expect(mat.emissiveIntensity).toBe(leaf.emissiveIntensity);
      // Carried, then the finale: hidden with the lakon's targets.
      const t = hold(layer, at(P2_ROAM, { phase: 'active', step: 1, recorded: ['A'] }), 0, 1);
      expect(drawn(game.chariot.root, 'letter')).toBe(1);
      layer.setFinale(true);
      expect(drawn(game.chariot.root, 'letter')).toBe(0);
      layer.setFinale(false);
      layer.sync(at(P2_ROAM, { phase: 'active', step: 1, recorded: ['A'] }), t + 1 / 64);
      expect(drawn(game.chariot.root, 'letter')).toBe(1);
    });

    it('puts the gates, lap posts, the next post’s beam and the letter on FX_LAYER, each fading per instance in the shared fade program; the beam an additive shaft', () => {
      const { game } = fakeGame();
      createPickups(game);
      const meshes: [THREE.Object3D, string][] = [
        [game.root, 'gate-real'], [game.root, 'gate-mimic'], [game.root, 'gate-rewrite'], [game.root, 'lap-posts'], [game.chariot.root, 'letter'],
      ];
      for (const [root, n] of meshes) {
        const mesh = meshOf(root, n);
        expect(mesh.layers.mask, n).toBe(1 << FX_LAYER);
        const mat = mesh.material as THREE.MeshStandardMaterial;
        expect(mat.isMeshStandardMaterial, n).toBe(true);
        expect(mat.transparent, n).toBe(true);
        expect(mat.customProgramCacheKey(), n).toBe(FADE_KEY);
        expect((mesh.geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute).isInstancedBufferAttribute, n).toBe(true);
      }
      // Each gate mesh its own fade: one shared attribute would fade them all together.
      const fadesOf = ['gate-real', 'gate-mimic', 'gate-rewrite'].map((n) => meshOf(game.root, n).geometry.getAttribute('aFade'));
      expect(new Set(fadesOf).size).toBe(3);
      const beam = meshOf(game.root, 'lap-beams');
      expect(beam.layers.mask).toBe(1 << FX_LAYER);
      const mat = beam.material as THREE.MeshBasicMaterial;
      expect(mat.blending).toBe(THREE.AdditiveBlending);
      expect(mat.map).toBe(game.textures.shaft);
      expect(mat.fog).toBe(false);
      expect(mat.depthWrite).toBe(false);
      expect(beam.geometry).toBe(meshOf(game.root, 'record-beams').geometry);
    });

    it('draws parva 4’s course in 7 calls with sight (3 for its gates) and parva 7’s in 6, parva 5’s laps in 4 (2 for the posts and their beam), and the letter in 1 more', () => {
      const calls = (root: THREE.Object3D) => {
        let n = 0;
        root.traverse((o) => {
          const inst = o as THREE.InstancedMesh;
          if (((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite) && shown(o) && (!inst.isInstancedMesh || inst.count > 0)) n++;
        });
        return n;
      };
      // Days 1–3 grey, the mimics from day 4, the real gates; their stamps; the tower's beam and circle.
      const { game: g4 } = fakeGame();
      hold(createPickups(g4), sighted(at(P4_ROAM, { phase: 'active' }, { car: car(-70, 0), decoys: [] })), 0, 1);
      for (const n of ['gate-real', 'gate-mimic', 'gate-rewrite', 'stamp-lotus', 'stamp-ring']) expect(drawn(g4.root, n), n).toBeGreaterThan(0);
      expect(calls(named(g4.root, 'pickups'))).toBe(7);
      // Parva 7 has no mimics: its real and grey gates, their stamps, the tower's beam and circle.
      const { game: g7 } = fakeGame();
      hold(createPickups(g7), sighted(at(P7_ROAM, { phase: 'active' }, { car: car(93, 12, Math.PI), decoys: [] })), 0, 1);
      for (const n of ['gate-real', 'gate-rewrite', 'stamp-lotus', 'stamp-ring']) expect(drawn(g7.root, n), n).toBeGreaterThan(0);
      expect(calls(named(g7.root, 'pickups'))).toBe(6);
      // The posts, the beam over P1, the tower's beam and circle.
      const { game: g5 } = fakeGame();
      hold(createPickups(g5), at(P5_ROAM, { phase: 'active' }, { decoys: [] }), 0, 1);
      expect(calls(named(g5.root, 'pickups'))).toBe(4);
      // The tower's beam and circle, and the letter on the chariot.
      const { game: g2 } = fakeGame();
      hold(createPickups(g2), at(P2_ROAM, { phase: 'active', step: 1, recorded: ['A'] }, { decoys: [] }), 0, 1);
      expect(calls(named(g2.root, 'pickups'))).toBe(2);
      expect(calls(g2.chariot.root)).toBe(1);
    });

    it('dispose takes the letter off the chariot and frees it, with everything under its group', () => {
      const { game } = fakeGame();
      const layer = createPickups(game);
      hold(layer, at(P2_ROAM, { phase: 'active', step: 1, recorded: ['A'] }), 0, 1);
      const letter = meshOf(game.chariot.root, 'letter');
      const owned = new Set([...ownedBy(named(game.root, 'pickups'), game), ...ownedBy(letter, game)]);
      expect(owned.has(letter)).toBe(true);
      expectFreed(game, owned, () => layer.dispose());
      expect(game.chariot.root.children).not.toContain(letter);
    });

    describe('roam: replay rings and free laps (Task 36)', () => {
      const RECORDS = [0, 2, 2, 4, 9, 1, 2, 2, 2];
      const lakonOf = (ch: number) => missionFor(ch, slugs(RECORDS[ch]));
      /** Chapter ch's roam with every chapter before it finished, the chariot at `from` (TOWER_EXIT by default). */
      const roamIn = (ch: number, from: { x: number; z: number; yaw: number } = TOWER_EXIT): GameState =>
        startChapter(lakonOf(ch), from, 1, WORLD, { finished: Array.from({ length: ch }, (_, k) => k), bests: [], bestLap: null, defOf: lakonOf });
      const R3 = roamIn(3);
      const IDLE: FrameInput = { drive: NO_INPUT, sight: false, skip: false, assist: false, aspect: DEFAULT_ASPECT };
      const rings = (root: THREE.Object3D) => allNamed(root, 'replay-ring') as THREE.Mesh[];
      const ringsShown = (root: THREE.Object3D) => rings(root).filter(shown);
      /** Each post's light, P1 to P5: its beam's colour over the full amber, 0 with no beam over it. */
      function postLight(root: THREE.Object3D): number[] {
        const beams = meshOf(root, 'lap-beams');
        const full = new THREE.Color('#ffb84a').r;
        return POSTS.map((p) => {
          const b = shown(beams) ? instancesAt(beams, p.at)[0] : undefined;
          if (b === undefined) return 0;
          const c = new THREE.Color();
          beams.getColorAt(b, c);
          return c.r / full;
        });
      }
      const calls = (root: THREE.Object3D) => {
        let n = 0;
        root.traverse((o) => {
          const inst = o as THREE.InstancedMesh;
          if (((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite) && shown(o) && (!inst.isInstancedMesh || inst.count > 0)) n++;
        });
        return n;
      };

      it("replay markers use the muted ring material: a replay-ring at each finished lakon's marker, draped over the ground, all of one additive grey material on FX_LAYER", () => {
        const { game } = fakeGame();
        createPickups(game).sync(R3, 0);
        const list = rings(game.root);
        // Parva 1's and 2's: the prologue has no marker.
        expect(list).toHaveLength(2);
        for (const m of [lakonOf(1).marker!, lakonOf(2).marker!]) {
          const ring = list.find((r) => flatDist(placeOf(r), m) <= 1e-9);
          expect(ring, `${m.x}, ${m.z}`).toBeDefined();
          expect(shown(ring!)).toBe(true);
          // The marker's flattened torus of r 5 with its petals, each vertex over the ground under it.
          const vs = vertices(ring!);
          for (const v of vs) {
            expect(height(v)).toBeGreaterThan(0.03);
            expect(height(v)).toBeLessThan(0.35);
          }
          const r = vs.map((v) => flatDist(v, m));
          expect(Math.min(...r)).toBeGreaterThan(4.7);
          expect(Math.max(...r)).toBeLessThan(6.6);
        }
        // Each its own draped copy of the shape, all of one material.
        expect(list[0].geometry).not.toBe(list[1].geometry);
        const mat = list[0].material as THREE.MeshBasicMaterial;
        for (const ring of list) {
          expect(ring.material).toBe(mat);
          expect(ring.layers.mask).toBe(1 << FX_LAYER);
        }
        expect(mat.isMeshBasicMaterial).toBe(true);
        expect(mat.blending).toBe(THREE.AdditiveBlending);
        expect([mat.transparent, mat.depthWrite, mat.fog]).toEqual([true, false, false]);
        // Muted: grey, and fainter than the lakon's own amber marker ring, which stands at chapter 3's marker.
        const marker = named<THREE.Mesh>(game.root, 'marker-ring').material as THREE.MeshBasicMaterial;
        expect(mat).not.toBe(marker);
        expect(mat.color.getHSL({ h: 0, s: 0, l: 0 }).s).toBeLessThan(0.1);
        expect(mat.opacity).toBeGreaterThan(0);
        expect(mat.opacity).toBeLessThan(marker.opacity);
        // Chapter 3's roam draws the marker ring and beam, the two rings, the free laps' posts, and the tower's beam and circle.
        expect(calls(named(game.root, 'pickups'))).toBe(7);
      });

      it('the replay rings show in roam only, easing out and in over 0.4 s, never faster than 2 Hz allows', () => {
        const { game } = fakeGame();
        const layer = createPickups(game);
        layer.sync(R3, 0);
        const mat = rings(game.root)[0].material as THREE.MeshBasicMaterial;
        const full = mat.opacity;
        const dt = 1 / 64;
        let t = 0;
        const run = (s: GameState, frames: number) => {
          const levels: number[] = [];
          for (let k = 0; k < frames; k++) {
            t += dt;
            layer.sync(s, t);
            levels.push(ringsShown(game.root).length > 0 ? mat.opacity : 0);
          }
          return levels;
        };
        // The lakon's own intro begins: out over 0.4 s, then hidden.
        const out = run(at(R3, { phase: 'intro' }), 40);
        [full, ...out].forEach((v, k, all) => k > 0 && expect(all[k - 1] - v, `out ${k}`).toBeLessThanOrEqual((full * dt) / 0.25 + 1e-9));
        expect(out.findIndex((v) => v === 0) * dt).toBeGreaterThanOrEqual(0.4 - dt - 1e-9);
        expect(out.at(-1)).toBe(0);
        // In roam again: in over 0.4 s, whole.
        const back = run(R3, 40);
        [0, ...back].forEach((v, k, all) => k > 0 && expect(v - all[k - 1], `in ${k}`).toBeLessThanOrEqual((full * dt) / 0.25 + 1e-9));
        expect(back.at(-1)).toBe(full);
      });

      it("parva 5's posts stand in every roam, none lit before a free lap; once P1 is crossed the next post lights, eased over 0.4 s (ruling 11)", () => {
        const { game } = fakeGame();
        const layer = createPickups(game);
        const posts = meshOf(game.root, 'lap-posts');
        let t = hold(layer, R3, 0, 1);
        expect(drawn(game.root, 'lap-posts')).toBe(5);
        for (const p of POSTS) expect(fadeAt(posts, instancesAt(posts, p.at)[0])).toBe(1);
        // No amber over them: in roam the one amber beam is the next lakon's marker.
        expect(postLight(game.root)).toEqual([0, 0, 0, 0, 0]);
        expect(drawn(game.root, 'lap-beams')).toBe(0);
        expect(shown(named(game.root, 'marker-beam'))).toBe(true);
        // P1 crossed: a lap is under way, and P2 is next.
        const under: GameState = { ...R3, roam: { ...R3.roam!, lapPost: 1, lapStart: 3 } };
        const dt = 1 / 64;
        let last = postLight(game.root);
        let whole = NaN;
        for (let k = 1; k <= 64; k++) {
          t += dt;
          layer.sync(under, t);
          const now = postLight(game.root);
          now.forEach((v, i) => expect(Math.abs(v - last[i]), `P${i + 1}, frame ${k}`).toBeLessThanOrEqual(dt / 0.4 + 1e-6));
          if (now[1] === 1 && Number.isNaN(whole)) whole = k * dt;
          last = now;
        }
        expect(last).toEqual([0, 1, 0, 0, 0]);
        expect(whole).toBeGreaterThanOrEqual(0.4 - 1e-9);
        // The lakon starts: chapter 3 has no laps, so the posts and their beam go, eased.
        hold(layer, at(under, { phase: 'intro' }), t, 1);
        expect(drawn(game.root, 'lap-posts')).toBe(0);
        expect(drawn(game.root, 'lap-beams')).toBe(0);
      });

      it("chapter 5's own posts are the free laps': one set of five pairs, standing whole as its lakon starts", () => {
        const { game } = fakeGame();
        const layer = createPickups(game);
        const R5 = roamIn(5);
        const posts = meshOf(game.root, 'lap-posts');
        let t = hold(layer, R5, 0, 1);
        expect(drawn(game.root, 'lap-posts')).toBe(5);
        for (const s of [at(R5, { phase: 'intro' }), at(R5, { phase: 'active' })]) {
          for (let k = 0; k < 64; k++) {
            t += 1 / 64;
            layer.sync(s, t);
            expect(drawn(game.root, 'lap-posts')).toBe(5);
            for (const p of POSTS) expect(fadeAt(posts, instancesAt(posts, p.at)[0])).toBe(1);
          }
        }
      });

      it("a replay changes the lakon at the cut, both ways: its first frame lays parva 1 out at once, and its return lays chapter 3's roam out at once (ruling 5)", () => {
        const { game } = fakeGame();
        const layer = createPickups(game);
        // Chapter 3's roam with the chariot at rest on parva 1's marker: its next frame starts the replay.
        const onM1 = roamIn(3, { ...lakonOf(1).marker!, yaw: 0 });
        let t = hold(layer, onM1, 0, 1);
        expect(ringsShown(game.root)).toHaveLength(2);
        const replay = advance(onM1, IDLE, 1 / 64, WORLD).state;
        expect(replay.run.def.chapter).toBe(1);
        expect(replay.shot?.kind).toBe('intro');
        t += 1 / 64;
        layer.sync(replay, t);
        // Under the cut into its intro: no ring and no free post; its two records out whole, and its marker ring.
        expect(ringsShown(game.root)).toEqual([]);
        expect(drawn(game.root, 'lap-posts')).toBe(0);
        const leaves = meshOf(game.root, 'lontar');
        expect(drawn(game.root, 'lontar')).toBe(2);
        for (const k of [0, 1]) expect(fadeAt(leaves, k)).toBe(1);
        expect(flatDist(placeOf(named(game.root, 'marker-ring')), lakonOf(1).marker!)).toBeLessThanOrEqual(1e-9);
        // Its end, after its outro: back in chapter 3's roam at TOWER_EXIT, under the cut to the chase view.
        let s: GameState = { ...replay, run: { ...replay.run, phase: 'outro', phaseT: 0 } };
        for (let k = 0; k < 4 * 64 && s.run.def.chapter === 1; k++) s = advance(s, IDLE, 1 / 64, WORLD).state;
        expect(s.run.def.chapter).toBe(3);
        expect(s.shot).toBeNull();
        layer.sync(s, t + 4);
        expect(ringsShown(game.root)).toHaveLength(2);
        expect((rings(game.root)[0].material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);
        expect(drawn(game.root, 'lap-posts')).toBe(5);
        expect(drawn(game.root, 'lontar')).toBe(0);
      });

      it('lays the rings out once a roam, never per frame, and frees them: a new roam replaces the old rings, and dispose frees the rest', () => {
        const { game } = fakeGame();
        const layer = createPickups(game);
        layer.sync(R3, 0);
        const first = rings(game.root);
        layer.sync({ ...R3, car: car(-30, 50) }, 0.1);
        expect(rings(game.root)).toEqual(first);
        expect(rings(game.root).every((r, k) => r === first[k])).toBe(true);
        // Chapter 8's roam: seven rings, and the two old ones' geometries freed with them.
        const freed = new Set<unknown>();
        for (const r of first) r.geometry.addEventListener('dispose', () => freed.add(r.geometry));
        layer.sync(roamIn(8), 0.2);
        expect(rings(game.root)).toHaveLength(7);
        expect(rings(game.root).some((r) => first.includes(r))).toBe(false);
        expect(freed.size).toBe(2);
        expectFreed(game, ownedBy(named(game.root, 'pickups'), game), () => layer.dispose());
      });
    });
  });
});

describe('volleys', () => {
  const PHONE_WORLD = createWorld({ mobile: true });
  const NAMES = ['volley-arrows', 'volley-fletching', 'landed-arrows', 'landed-fletching', 'telegraph-columns', 'telegraph-rings'];
  /** Whether o is drawn: it and every parent visible. */
  const visibleUp = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  const meshOf = (game: SceneGame, name: string) => named<THREE.InstancedMesh>(game.root, name);
  /** The instances the named mesh draws: none while it or a parent is hidden. */
  const drawnOf = (game: SceneGame, name: string) => {
    const m = meshOf(game, name);
    return visibleUp(m) ? m.count : 0;
  };
  const poseOf = (mesh: THREE.InstancedMesh, k: number) => {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(k, m);
    return m;
  };
  const basisOf = (m: THREE.Matrix4) => {
    const x = new THREE.Vector3();
    const y = new THREE.Vector3();
    const z = new THREE.Vector3();
    m.extractBasis(x, y, z);
    return { x, y, z };
  };
  const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
  /** Below this a mesh instance counts as not drawn: its own fade, the in-air fade, and the telegraph's brightness. */
  const fadeOf = (mesh: THREE.InstancedMesh, k: number) => mesh.geometry.getAttribute('aFade').getX(k);
  const glowOf = (mesh: THREE.InstancedMesh, k: number) => mesh.instanceColor!.getX(k);

  /** Where test volleys land, on open ground; the car waits far from it unless a test brings it there. */
  const LAND: XZ = { x: -40, z: 30 };
  const AWAY = car(-110, 100);
  /** Planned at run.t 30: warned until 31, in the air until it lands at 32.6. */
  const PLANNED = 30;
  /** The volley planned at PLANNED to land at `to`, in the state it has at run.t t. */
  function volleyAt(t: number, o: { to?: XZ; id?: number; mobile?: boolean } = {}): Volley {
    const v = scriptedVolley(o.to ?? LAND, PLANNED, o.id ?? 7, o.mobile ? PHONE_WORLD : WORLD);
    const lands = v.t0 + v.flight;
    return { ...v, state: t < v.t0 ? 'warn' : t < lands ? 'air' : 'landed' };
  }
  const V0 = volleyAt(0);
  const LANDS = V0.t0 + V0.flight;
  interface At {
    car?: ChariotState;
    clouds?: readonly Cloud[];
    phase?: Phase;
    sight?: boolean;
  }
  /** The prologue at run.t t with these volleys and haze: active, the car away and sight off unless told otherwise. */
  function stateAtT(t: number, volleys: readonly Volley[], o: At = {}): GameState {
    return {
      ...BASE,
      car: o.car ?? AWAY,
      volleys,
      clouds: o.clouds ?? [],
      sight: { ...BASE.sight, on: o.sight ?? false },
      run: { ...BASE.run, phase: o.phase ?? 'active', t },
    };
  }
  /** The run.t of the volley planned at PLANNED, at u of its flight (0 when it leaves, 1 when it lands). */
  const flightT = (u: number) => V0.t0 + u * V0.flight;
  /** The hull circle nearest p (the gap from its edge), across the ground. */
  const hullGap = (c: ChariotState, p: { x: number; z: number }) => Math.min(...hullCircles(c.x, c.z, c.yaw).map((h) => Math.hypot(p.x - h.x, p.z - h.z) - h.r));
  /** Parva 1, in roam at its marker, with its two patches of haze laid out. */
  const P1_ROAM = startChapter(missionFor(1, ['a', 'b']), missionFor(1, ['a', 'b']).start, 1, WORLD);

  it('one volley in the air: 12 volley-arrows on desktops and 6 on phones, each on its arrowPoint, 2.2 times its size, heading along its arc', () => {
    expect(VOLLEY.scale).toBe(2.2);
    for (const mobile of [false, true]) {
      const { game } = fakeGame();
      const layer = createVolleys(game, mobile);
      const t = flightT(0.5);
      const v = volleyAt(t, { mobile });
      expect(v.state).toBe('air');
      expect(v.arrows).toBe(mobile ? 6 : 12);
      layer.sync(stateAtT(t, [v]), 5);
      const shafts = meshOf(game, 'volley-arrows');
      const fletching = meshOf(game, 'volley-fletching');
      expect(drawnOf(game, 'volley-arrows')).toBe(mobile ? 6 : 12);
      expect(drawnOf(game, 'volley-fletching')).toBe(mobile ? 6 : 12);
      const s = (t - v.t0) / v.flight;
      for (let k = 0; k < v.arrows; k++) {
        const m = poseOf(shafts, k);
        const at = v3(arrowPoint(v, k, s, groundHeight));
        expect(new THREE.Vector3().setFromMatrixPosition(m).distanceTo(at), `arrow ${k}`).toBeLessThanOrEqual(1e-3);
        const { x, y, z } = basisOf(m);
        for (const b of [x, y, z]) expect(b.length()).toBeCloseTo(2.2, 5);
        // The shapes point their head along +y: here along the arc, the way the arrow flies.
        const ahead = v3(arrowPoint(v, k, s + 1e-5, groundHeight)).sub(at).normalize();
        expect(y.normalize().angleTo(ahead), `arrow ${k}`).toBeLessThan(1e-3);
        expect(poseOf(fletching, k).equals(m)).toBe(true);
        expect(fadeOf(shafts, k)).toBe(1);
      }
      expect(drawnOf(game, 'landed-arrows')).toBe(0);
    }
  });

  it('draws the arrows in a light material: a frayed shaft #d6d9de lit #9aa0aa, its fletching #d6d9de unlit and left out of tone mapping', () => {
    const { game } = fakeGame();
    createVolleys(game, false);
    for (const name of ['volley-arrows', 'landed-arrows']) {
      const mat = meshOf(game, name).material as THREE.MeshStandardMaterial;
      expect(mat.isMeshStandardMaterial, name).toBe(true);
      expect(mat.color.getHexString(), name).toBe('d6d9de');
      expect(mat.emissive.getHexString(), name).toBe('9aa0aa');
      expect(mat.transparent, name).toBe(true);
    }
    for (const name of ['volley-fletching', 'landed-fletching']) {
      const mat = meshOf(game, name).material as THREE.MeshBasicMaterial;
      expect(mat.isMeshBasicMaterial, name).toBe(true);
      expect(mat.color.getHexString(), name).toBe('d6d9de');
      expect(mat.toneMapped, name).toBe(false);
    }
    // Each reads its instance's aFade in the shader with the pickups' own patch: one program key for both layers.
    const count = (src: string, s: string) => src.split(s).length - 1;
    for (const name of NAMES.slice(0, 4)) {
      const mesh = meshOf(game, name);
      const mat = mesh.material as THREE.Material;
      expect(mat.customProgramCacheKey(), name).toBe(FADE_KEY);
      expect((mesh.geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute).isInstancedBufferAttribute, name).toBe(true);
      const lib = name.includes('fletching') ? THREE.ShaderLib.basic : THREE.ShaderLib.standard;
      const shader = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
      mat.onBeforeCompile(shader as unknown as Parameters<THREE.Material['onBeforeCompile']>[0], undefined as unknown as THREE.WebGLRenderer);
      expect(count(shader.vertexShader, 'vFade = aFade;'), name).toBe(1);
      expect(count(shader.fragmentShader, 'diffuseColor.a *= vFade;'), name).toBe(1);
    }
  });

  it('stands one telegraph column and one ring from telegraphAt to the landing: 1.4 s ahead, or from planning with sight', () => {
    for (const sight of [false, true]) {
      const { game } = fakeGame();
      const layer = createVolleys(game, false);
      const from = telegraphAt(V0, sight);
      expect(from).toBeCloseTo(sight ? PLANNED : LANDS - 1.4, 9);
      let shown = 0;
      for (let k = 0; k <= 200; k++) {
        const t = PLANNED - 0.495 + k * 0.02;
        layer.sync(stateAtT(t, [volleyAt(t)], { sight }), t);
        const want = t >= from && t < LANDS ? 1 : 0;
        expect(drawnOf(game, 'telegraph-columns'), `sight ${sight}, t ${t}`).toBe(want);
        expect(drawnOf(game, 'telegraph-rings'), `sight ${sight}, t ${t}`).toBe(want);
        shown += want;
      }
      expect(shown).toBeGreaterThan(sight ? 120 : 60);
    }
  });

  it('keeps a telegraph out once it shows: sight taken mid-warning brings it out then, and letting sight go does not take it back', () => {
    const { game } = fakeGame();
    const layer = createVolleys(game, false);
    const at = (t: number, sight: boolean) => layer.sync(stateAtT(t, [volleyAt(t)], { sight }), t);
    at(30.3, false);
    expect(drawnOf(game, 'telegraph-columns')).toBe(0);
    at(30.6, true);
    expect(drawnOf(game, 'telegraph-columns')).toBe(1);
    expect(drawnOf(game, 'telegraph-rings')).toBe(1);
    at(30.7, false);
    expect(drawnOf(game, 'telegraph-columns')).toBe(1);
    at(31.1, false);
    expect(drawnOf(game, 'telegraph-columns')).toBe(1);
    expect(drawnOf(game, 'telegraph-rings')).toBe(1);
  });

  it('draws the column as an amber additive plane 1.2 m wide and 6 m tall, fog off, standing on the ground at the landing, turned to the camera', () => {
    const { game } = fakeGame();
    const layer = createVolleys(game, false);
    const col = meshOf(game, 'telegraph-columns');
    col.geometry.computeBoundingBox();
    const size = col.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(1.2, 6);
    expect(size.y).toBeCloseTo(6, 6);
    expect(size.z).toBeCloseTo(0, 6);
    const mat = col.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHexString()).toBe('ffb84a');
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.fog).toBe(false);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.map).toBe(game.textures.shaft);
    for (const cam of [new THREE.Vector3(-60, 12, 52), new THREE.Vector3(-20, 9, 10), new THREE.Vector3(-41, 30, 31)]) {
      game.camera.position.copy(cam);
      layer.sync(stateAtT(32, [volleyAt(32)]), 32);
      const m = poseOf(col, 0);
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      expect(flatDist(p, LAND)).toBeLessThanOrEqual(F32);
      // Standing on the ground at the landing, all 6 m of it above the ground.
      const g = groundHeight(LAND.x, LAND.z);
      expect(p.y - 3, 'its foot').toBeCloseTo(g, 4);
      expect(p.y + 3, 'its top').toBeCloseTo(g + 6, 4);
      const { x, y, z } = basisOf(m);
      expect(y.clone().normalize().angleTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6);
      expect(Math.abs(angleDiff(Math.atan2(z.x, z.z), Math.atan2(cam.x - p.x, cam.z - p.z)))).toBeLessThan(1e-5);
      expect(x.length()).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it('narrows the column from 1.2 m to 0.4 m as the arrows come, and brings it and the ring in and out no faster than 2 Hz allows', () => {
    const { game } = fakeGame();
    const layer = createVolleys(game, false);
    const col = meshOf(game, 'telegraph-columns');
    const ring = meshOf(game, 'telegraph-rings');
    const dt = 1 / 60;
    const widths: number[] = [];
    let last = 0;
    let peak = 0;
    for (let t = LANDS - 1.4 + 0.004; t < LANDS + 0.2; t += dt) {
      layer.sync(stateAtT(t, [volleyAt(t)]), t);
      const out = drawnOf(game, 'telegraph-columns') > 0;
      const glow = out ? glowOf(col, 0) : 0;
      expect(out ? glowOf(ring, 0) : 0).toBeCloseTo(glow, 9);
      expect(Math.abs(glow - last), `t ${t}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
      if (out) widths.push(1.2 * basisOf(poseOf(col, 0)).x.length());
      peak = Math.max(peak, glow);
      last = glow;
    }
    expect(peak).toBe(1);
    expect(last).toBe(0);
    expect(widths[0]).toBeCloseTo(1.2, 3);
    expect(widths.at(-1)!).toBeGreaterThanOrEqual(0.4 - 1e-6);
    expect(widths.at(-1)!).toBeLessThan(0.42);
    for (let k = 1; k < widths.length; k++) expect(widths[k]).toBeLessThanOrEqual(widths[k - 1] + 1e-9);
  });

  it('lays the ring, a torus of r 2.4 with a round tube of 0.08 lying flat, in the same amber, over the ground round the landing', () => {
    const { game } = fakeGame();
    const layer = createVolleys(game, false);
    const ring = meshOf(game, 'telegraph-rings');
    ring.geometry.computeBoundingBox();
    const size = ring.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(2 * (2.4 + 0.08), 6);
    expect(size.z).toBeCloseTo(2 * (2.4 + 0.08), 6);
    // Lying flat, not squashed: the tube is as tall as it is wide.
    expect(size.y).toBeCloseTo(2 * 0.08, 6);
    const mat = ring.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHexString()).toBe('ffb84a');
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.fog).toBe(false);
    expect(mat.depthWrite).toBe(false);
    // No landing passes landingOk on the mound's slope; over the rolling plain a ring tilted to the slope at its centre
    // keeps within 0.021 m of the ground all round.
    for (const to of [LAND, { x: 60, z: 70 }, { x: -100, z: -40 }, { x: 95, z: 20 }]) {
      layer.sync(stateAtT(32, [volleyAt(32, { to })]), 32);
      expect(drawnOf(game, 'telegraph-rings')).toBe(1);
      expect(flatDist(placeOf(ring, 0), to)).toBeLessThanOrEqual(F32);
      // Every vertex clear of the ground under it, however the ground leans there, and none far over it.
      for (const p of vertices(ring, 0)) {
        const h = p.y - groundHeight(p.x, p.z);
        expect(h).toBeGreaterThan(0.04);
        expect(h).toBeLessThan(0.3);
      }
    }
  });

  it('stands the 12 landed-arrows where the volley landed, their heads in the ground, for 12 s; sinks them over the next 0.6 s; then none', () => {
    const { game } = fakeGame();
    const layer = createVolleys(game, false);
    const landed: Volley = { ...V0, state: 'landed' };
    const mesh = meshOf(game, 'landed-arrows');
    const standing: THREE.Vector3[] = [];
    for (const age of [0, 0.5, 6, 11.9]) {
      layer.sync(stateAtT(LANDS + age, [landed]), LANDS + age);
      expect(drawnOf(game, 'landed-arrows'), `age ${age}`).toBe(12);
      expect(drawnOf(game, 'landed-fletching'), `age ${age}`).toBe(12);
      expect(drawnOf(game, 'volley-arrows'), `age ${age}`).toBe(0);
      expect(drawnOf(game, 'telegraph-columns'), `age ${age}`).toBe(0);
      for (let k = 0; k < 12; k++) {
        const m = poseOf(mesh, k);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        const end = arrowPoint(V0, k, 1, groundHeight);
        expect(p.distanceTo(v3(end)), `arrow ${k}`).toBeLessThanOrEqual(1e-3);
        // As it came in: along the arc's last stretch, its head down into the ground.
        const before = v3(arrowPoint(V0, k, 1 - 1e-5, groundHeight));
        expect(basisOf(m).y.normalize().angleTo(v3(end).sub(before).normalize())).toBeLessThan(1e-3);
        expect(fadeOf(mesh, k)).toBe(1);
        standing[k] = p;
      }
    }
    // Sinking: still drawn, each lower than where it stood.
    layer.sync(stateAtT(LANDS + 12.3, [landed]), LANDS + 12.3);
    expect(drawnOf(game, 'landed-arrows')).toBe(12);
    for (let k = 0; k < 12; k++) expect(placeOf(mesh, k).y).toBeLessThan(standing[k].y - 0.3);
    // Sunk: the engine drops it at 12.6 s; none is drawn after, listed or not.
    layer.sync(stateAtT(LANDS + 12.61, [landed]), LANDS + 12.61);
    expect(drawnOf(game, 'landed-arrows')).toBe(0);
    expect(drawnOf(game, 'landed-fletching')).toBe(0);
    layer.sync(stateAtT(LANDS + 12.7, []), LANDS + 12.7);
    expect(drawnOf(game, 'landed-arrows')).toBe(0);
  });

  it('eases the arrows in as they leave, over at least 0.25 s, and carries each from the air to the ground with no jump', () => {
    const { game } = fakeGame();
    const layer = createVolleys(game, false);
    const air = meshOf(game, 'volley-arrows');
    const ground = meshOf(game, 'landed-arrows');
    const dt = 1 / 60;
    let last = 0;
    let before: THREE.Vector3 | null = null;
    for (let t = V0.t0 - 0.1; t < LANDS + 0.1; t += dt) {
      layer.sync(stateAtT(t, [volleyAt(t)]), t);
      const inAir = drawnOf(game, 'volley-arrows') > 0;
      const k = inAir ? fadeOf(air, 0) : drawnOf(game, 'landed-arrows') > 0 ? fadeOf(ground, 0) : 0;
      expect(k - last, `t ${t}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
      last = k;
      const p = inAir ? placeOf(air, 0) : drawnOf(game, 'landed-arrows') > 0 ? placeOf(ground, 0) : null;
      if (p && before) expect(p.distanceTo(before), `t ${t}`).toBeLessThan(1.5);
      before = p;
    }
    expect(drawnOf(game, 'landed-arrows')).toBe(12);
    expect(last).toBe(1);
  });

  it('hides each arrow in flight at once while it is within 3 m of a hull circle and below 4 m: none is drawn touching the chariot', () => {
    let hidden = 0;
    let shown = 0;
    const cars = [car(LAND.x, LAND.z, 0), car(LAND.x + 5, LAND.z, 1), car(LAND.x - 4, LAND.z + 3, 2.5), car(LAND.x + 7, LAND.z - 6, -1), car(LAND.x + 2, LAND.z + 9, 0.6)];
    for (const c of cars) {
      for (const u of [0.6, 0.8, 0.9, 0.95, 0.99]) {
        const { game } = fakeGame();
        const layer = createVolleys(game, false);
        const t = flightT(u);
        layer.sync(stateAtT(t, [volleyAt(t)], { car: c }), t);
        const n = drawnOf(game, 'volley-arrows');
        hidden += 12 - n;
        shown += n;
        for (const name of ['volley-arrows', 'volley-fletching']) {
          const mesh = meshOf(game, name);
          for (let k = 0; k < n; k++) {
            for (const p of vertices(mesh, k)) {
              if (hullGap(c, p) < 3) expect(p.y - groundHeight(p.x, p.z), `${name} ${k}, u ${u}`).toBeGreaterThanOrEqual(4);
            }
          }
        }
      }
    }
    expect(hidden).toBeGreaterThan(20);
    expect(shown).toBeGreaterThan(100);
  });

  it('eases landed arrows out over at least 0.25 s as the chariot drives over their patch, so none is drawn within 3 m of its hull, and back once it has gone', () => {
    const dt = 1 / 60;
    for (const [yaw, speed, side] of [[0.3, 12, 0], [2.2, 17, 1.5], [-1.2, 6, -2], [0.9, 25, 0.5]]) {
      const { game } = fakeGame();
      const layer = createVolleys(game, false);
      const mesh = meshOf(game, 'landed-arrows');
      const landed: Volley = { ...V0, state: 'landed' };
      const spots = Array.from({ length: 12 }, (_, k) => v3(arrowPoint(V0, k, 1, groundHeight)));
      const f = forward(yaw);
      const r = rightOf(yaw);
      // From 45 m short of the landing, across it (side m off its centre), to 45 m past it.
      const start = { x: LAND.x - f.x * 45 + r.x * side, z: LAND.z - f.z * 45 + r.z * side };
      const frames = Math.ceil(90 / speed / dt);
      let last = Array<number>(12).fill(1);
      let faded = 0;
      for (let k = 0; k <= frames; k++) {
        const c = car(start.x + f.x * speed * k * dt, start.z + f.z * speed * k * dt, yaw, speed);
        // The arrows' age stays put (a second after landing, well short of their sinking); the scene's clock runs on.
        layer.sync(stateAtT(LANDS + 1, [landed], { car: c }), 10 + k * dt);
        const now = Array<number>(12).fill(0);
        for (let i = 0; i < drawnOf(game, 'landed-arrows'); i++) {
          const p = placeOf(mesh, i);
          const j = spots.findIndex((s) => flatDist(s, p) <= 1e-3);
          expect(j, 'a standing arrow out of place').toBeGreaterThanOrEqual(0);
          now[j] = fadeOf(mesh, i);
          // An arrow is under 3 m long: one whose head stands 6 m or more off the hull cannot reach within 3 m of it.
          if (hullGap(c, p) >= 6) continue;
          for (const v of vertices(mesh, i)) expect(hullGap(c, v), `arrow ${j}, frame ${k}`).toBeGreaterThanOrEqual(3);
          for (const v of vertices(meshOf(game, 'landed-fletching'), i)) expect(hullGap(c, v), `fletching ${j}, frame ${k}`).toBeGreaterThanOrEqual(3);
        }
        for (let j = 0; j < 12; j++) {
          expect(Math.abs(now[j] - last[j]), `arrow ${j}, frame ${k}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
          if (now[j] === 0 && last[j] > 0) faded++;
        }
        last = now;
      }
      expect(faded, `yaw ${yaw}`).toBeGreaterThan(3);
      expect(last).toEqual(Array<number>(12).fill(1));
    }
  });

  it('fades in the air each arrow the chariot will reach where it lands: driving at 12, 17 and 25 m/s into a patch as it lands, no landed vertex is drawn within 3 m of a hull circle', () => {
    const dt = 1 / 60;
    // The arrows' own vertices, shaft and fletching, posed by an instance's matrix without a vector each.
    const shape = fakeGame();
    createVolleys(shape.game, false);
    const verts: number[] = [];
    for (const name of ['landed-arrows', 'landed-fletching']) {
      const pos = meshOf(shape.game, name).geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) verts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    const pose = new THREE.Matrix4();
    /** The least gap from any vertex of instance i to a hull circle's edge, across the ground. */
    const closest = (mesh: THREE.InstancedMesh, i: number, hull: { x: number; z: number; r: number }[]) => {
      mesh.getMatrixAt(i, pose);
      const e = pose.elements;
      let least = Infinity;
      for (let v = 0; v < verts.length; v += 3) {
        const x = e[0] * verts[v] + e[4] * verts[v + 1] + e[8] * verts[v + 2] + e[12];
        const z = e[2] * verts[v] + e[6] * verts[v + 1] + e[10] * verts[v + 2] + e[14];
        for (const h of hull) least = Math.min(least, Math.hypot(x - h.x, z - h.z) - h.r);
      }
      return least;
    };
    const spots = Array.from({ length: 12 }, (_, k) => arrowPoint(V0, k, 1, groundHeight));
    // Frames off the landing's own instant, so the landing step is the first frame past it.
    const start = V0.t0 - 0.097;
    const kLand = Math.ceil((LANDS - start) / dt);
    let near = 0;
    let unseen = 0;
    for (const speed of [12, 17, 25]) {
      for (const yaw of [0.4, 2.0, -2.6, -1.1]) {
        for (const side of [-2, 0, 1.5]) {
          for (const short of [7.05, 8.5, 10, 12]) {
            const { game } = fakeGame();
            const layer = createVolleys(game, false);
            const mesh = meshOf(game, 'landed-arrows');
            const f = forward(yaw);
            const r = rightOf(yaw);
            // At the landing step the front hull circle's centre, 3.6 m ahead of the car's, is `short` m short of the
            // landing and `side` m to its right: never within 7 m, so the volley lands rather than being taken.
            const at = { x: LAND.x - f.x * (short + 3.6) + r.x * side, z: LAND.z - f.z * (short + 3.6) + r.z * side };
            const was = Array<number>(12).fill(0);
            for (let k = 0; start + k * dt <= LANDS + 1.2; k++) {
              const t = start + k * dt;
              const go = (k - kLand) * dt * speed;
              const c = car(at.x + f.x * go, at.z + f.z * go, yaw, speed);
              layer.sync(stateAtT(t, [volleyAt(t)], { car: c }), 10 + k * dt);
              const hull = hullCircles(c.x, c.z, c.yaw);
              const n = drawnOf(game, 'landed-arrows');
              if (k === kLand) {
                expect(volleyAt(t).state).toBe('landed');
                expect(Math.min(...hull.map((h) => Math.hypot(h.x - LAND.x, h.z - LAND.z)))).toBeGreaterThan(VOLLEY.absorbR);
                unseen += 12 - n;
              }
              const now = Array<number>(12).fill(0);
              for (let i = 0; i < n; i++) {
                const p = placeOf(mesh, i);
                const j = spots.findIndex((s) => Math.hypot(s.x - p.x, s.z - p.z) <= 1e-3);
                expect(j, 'a standing arrow out of place').toBeGreaterThanOrEqual(0);
                now[j] = fadeOf(mesh, i);
                if (hullGap(c, p) >= 6) continue;
                near++;
                const why = `${speed} m/s, yaw ${yaw}, side ${side}, ${short} m short: arrow ${j}, ${k - kLand} frames after landing`;
                expect(closest(mesh, i, hull), why).toBeGreaterThanOrEqual(3);
              }
              // Once standing, no arrow changes faster than 2 Hz allows.
              if (k > kLand) for (let j = 0; j < 12; j++) expect(Math.abs(now[j] - was[j]), `arrow ${j}, frame ${k}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
              for (let j = 0; j < 12; j++) was[j] = now[j];
            }
          }
        }
      }
    }
    expect(near).toBeGreaterThan(20);
    expect(unseen).toBeGreaterThan(100);
  });

  it('fades what is in the air, the columns and the rings out over at least 0.25 s once the lakon is not active, and keeps them hidden', () => {
    const dt = 1 / 60;
    for (const phase of ['outro', 'failed', 'done'] as const) {
      const { game } = fakeGame();
      const layer = createVolleys(game, false);
      // Two volleys: one in the air, one warned with its telegraph out (sight is on); half a second of play brings both
      // telegraphs fully out. Then the lakon ends, and the run's clock stands still.
      const t = flightT(0.4);
      const other = scriptedVolley({ x: -70, z: 60 }, t - 0.4, 8, WORLD);
      for (let k = 30; k > 0; k--) {
        const tt = t - k * dt;
        layer.sync(stateAtT(tt, tt >= other.planned ? [volleyAt(tt), other] : [volleyAt(tt)], { sight: true }), 10 - k * dt);
      }
      const both = [volleyAt(t), other];
      expect(other.state).toBe('warn');
      layer.sync(stateAtT(t, both, { sight: true }), 10);
      expect(drawnOf(game, 'volley-arrows')).toBe(12);
      expect(drawnOf(game, 'telegraph-columns')).toBe(2);
      const level = () => ({
        air: drawnOf(game, 'volley-arrows') > 0 ? fadeOf(meshOf(game, 'volley-arrows'), 0) : 0,
        column: drawnOf(game, 'telegraph-columns') > 0 ? glowOf(meshOf(game, 'telegraph-columns'), 0) : 0,
        ring: drawnOf(game, 'telegraph-rings') > 0 ? glowOf(meshOf(game, 'telegraph-rings'), 0) : 0,
      });
      let last = level();
      expect(last.air).toBe(1);
      expect(last.column).toBeGreaterThan(0.5);
      let goneAt = NaN;
      for (let k = 1; k <= 240; k++) {
        layer.sync(stateAtT(t, both, { phase, sight: true }), 10 + k * dt);
        const now = level();
        for (const key of ['air', 'column', 'ring'] as const) {
          expect(now[key], `${phase} ${key} at frame ${k}`).toBeLessThanOrEqual(last[key] + 1e-9);
          expect(last[key] - now[key], `${phase} ${key} at frame ${k}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
        }
        if (now.air === 0 && now.column === 0 && now.ring === 0 && Number.isNaN(goneAt)) goneAt = k * dt;
        if (!Number.isNaN(goneAt)) for (const name of ['volley-arrows', 'volley-fletching', 'telegraph-columns', 'telegraph-rings']) expect(drawnOf(game, name), `${phase} ${name}`).toBe(0);
        last = now;
      }
      expect(goneAt).toBeGreaterThanOrEqual(0.25);
      expect(goneAt).toBeLessThanOrEqual(0.5);
    }
  });

  it('eases standing arrows and a volley’s haze out over at least 0.6 s once the lakon is not active, so none stays frozen; the lakon’s own haze stays', () => {
    const dt = 1 / 60;
    const volleyHaze: Cloud = { id: 20, at: { x: -30, z: 40 }, r: 6, born: LANDS, life: VOLLEY.cloudLife };
    const ownHaze: Cloud = { id: 3, at: { x: 40, z: -60 }, r: 6, born: 0, life: null };
    const landed: Volley = { ...V0, state: 'landed' };
    // Three seconds after the landing: standing, and the haze mid-life; the run's clock stands still once the lakon ends.
    const t = LANDS + 3;
    for (const phase of ['outro', 'failed', 'done'] as const) {
      const { game } = fakeGame();
      const layer = createVolleys(game, false);
      const haze = named<THREE.Points>(game.root, 'haze');
      const pos = haze.geometry.getAttribute('position');
      const col = haze.geometry.getAttribute('color');
      /** The most alpha among the puffs round a cloud (0 when none is drawn). */
      const puffs = (c: Cloud) => {
        let most = 0;
        const n = visibleUp(haze) ? haze.geometry.drawRange.count : 0;
        for (let i = 0; i < n; i++) if (Math.hypot(pos.getX(i) - c.at.x, pos.getZ(i) - c.at.z) <= c.r) most = Math.max(most, col.getW(i));
        return most;
      };
      const level = () => ({
        standing: drawnOf(game, 'landed-arrows') > 0 ? fadeOf(meshOf(game, 'landed-arrows'), 0) : 0,
        haze: puffs(volleyHaze),
      });
      const clouds = [volleyHaze, ownHaze];
      layer.sync(stateAtT(t, [landed], { clouds }), 10);
      let last = level();
      expect(last).toEqual({ standing: 1, haze: 1 });
      expect(drawnOf(game, 'landed-arrows')).toBe(12);
      let goneAt = NaN;
      for (let k = 1; k <= 120; k++) {
        layer.sync(stateAtT(t, [landed], { clouds, phase }), 10 + k * dt);
        const now = level();
        for (const key of ['standing', 'haze'] as const) {
          expect(now[key], `${phase} ${key}, frame ${k}`).toBeLessThanOrEqual(last[key] + 1e-9);
          expect(last[key] - now[key], `${phase} ${key}, frame ${k}`).toBeLessThanOrEqual(dt / 0.6 + 1e-6);
        }
        expect(puffs(ownHaze), `${phase}: the lakon's own haze`).toBe(1);
        if (now.standing === 0 && now.haze === 0 && Number.isNaN(goneAt)) goneAt = k * dt;
        if (!Number.isNaN(goneAt)) expect(drawnOf(game, 'landed-arrows'), `${phase}, frame ${k}`).toBe(0);
        last = now;
      }
      expect(goneAt).toBeGreaterThanOrEqual(0.6);
      expect(goneAt).toBeLessThanOrEqual(0.8);
    }
  });

  it('lets the light take a volley visibly: absorbed, its arrows fade where they were over at least 0.25 s, then nothing; the pulse is the runtime’s', () => {
    const { game } = fakeGame();
    const pulse = vi.fn();
    game.chariot.pulse = pulse;
    const layer = createVolleys(game, false);
    const air = meshOf(game, 'volley-arrows');
    const dt = 1 / 60;
    // The chariot at rest, its front hull circle's centre (3.6 m ahead of its own) 6 m short of the landing: within 7 m,
    // so the light takes the volley. The arrows on the near side are already gone; the far side's are out.
    const yaw = 0.7;
    const f = forward(yaw);
    const c = car(LAND.x - f.x * 9.6, LAND.z - f.z * 9.6, yaw);
    const drawn = () => {
      const out = new Map<string, number>();
      for (let i = 0; i < drawnOf(game, 'volley-arrows'); i++) {
        const p = placeOf(air, i);
        out.set(`${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`, fadeOf(air, i));
      }
      return out;
    };
    // The scene's clock, a frame at a time throughout.
    let clock = 10;
    for (let t = flightT(0.6); t < LANDS; t += dt, clock += dt) layer.sync(stateAtT(t, [volleyAt(t)], { car: c }), clock);
    let prev = drawn();
    expect(prev.size).toBeGreaterThan(2);
    // Absorbed: gone from s.volleys in the frame it lands. It leaves no copy and no haze either.
    let goneAt = NaN;
    for (let j = 1; j <= 40; j++, clock += dt) {
      layer.sync(stateAtT(LANDS + j * dt, [], { car: c }), clock);
      const now = drawn();
      for (const [key, level] of now) {
        expect(prev.has(key), `an arrow moved or came back, frame ${j}`).toBe(true);
        expect(level).toBeLessThanOrEqual(prev.get(key)! + 1e-9);
        expect(prev.get(key)! - level, `frame ${j}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
      }
      for (const [key, level] of prev) if (!now.has(key)) expect(level, `${key} popped out at frame ${j}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
      if (now.size === 0 && Number.isNaN(goneAt)) goneAt = j * dt;
      for (const name of NAMES.slice(2)) expect(drawnOf(game, name), name).toBe(0);
      prev = now;
    }
    expect(goneAt).toBeGreaterThanOrEqual(0.25);
    expect(goneAt).toBeLessThanOrEqual(0.4);
    for (const name of NAMES) expect(drawnOf(game, name), name).toBe(0);
    // The layer never pulses: the runtime does, once per 'absorbed' event.
    expect(pulse).not.toHaveBeenCalled();
  });

  it('draws nothing in roam, nor with nothing in flight or standing: empty lists, and a lakon’s own haze waits for its intro', () => {
    const { game } = fakeGame();
    const layer = createVolleys(game, false);
    const haze = named<THREE.Points>(game.root, 'haze');
    const nothing = (why: string) => {
      for (const name of NAMES) expect(drawnOf(game, name), `${why}: ${name}`).toBe(0);
      expect(visibleUp(haze), `${why}: haze`).toBe(false);
    };
    nothing('made');
    layer.sync(stateAtT(40, []), 1);
    nothing('active, empty');
    expect(P1_ROAM.run.phase).toBe('roam');
    expect(P1_ROAM.clouds).toHaveLength(2);
    expect(P1_ROAM.volleys).toEqual([]);
    layer.sync(P1_ROAM, 2);
    nothing('roam');
    // Even a stray volley in roam stays undrawn: no pressure runs there.
    layer.sync({ ...P1_ROAM, volleys: [volleyAt(32), { ...V0, id: 9, state: 'landed' }], run: { ...P1_ROAM.run, t: 32 } }, 3);
    nothing('roam with a volley');
    layer.sync({ ...P1_ROAM, run: { ...P1_ROAM.run, phase: 'intro' } }, 4);
    expect(visibleUp(haze)).toBe(true);
  });

  it('draws haze as points with the soft texture, #a98d6a at a steady 0.35, puffs within the cloud’s 6 m: equal over 10 syncs, no flicker', () => {
    const { game } = fakeGame();
    const layer = createVolleys(game, false);
    const haze = named<THREE.Points>(game.root, 'haze');
    const mat = haze.material as THREE.PointsMaterial;
    expect(haze.isPoints).toBe(true);
    expect(mat.map).toBe(game.textures.soft);
    expect(mat.color.getHexString()).toBe('a98d6a');
    expect(mat.opacity).toBe(0.35);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.vertexColors).toBe(true);
    // A puff fades as it comes from 12 m to 2 m of the camera, so none fills the lens: at Laju's top speed that is at
    // most 4 a second (a smoothstep's steepest is 1.5 over its band), within the 2 Hz comfort allows.
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.points.vertexShader, fragmentShader: THREE.ShaderLib.points.fragmentShader };
    mat.onBeforeCompile(shader as unknown as Parameters<THREE.Material['onBeforeCompile']>[0], undefined as unknown as THREE.WebGLRenderer);
    const band = shader.vertexShader.match(/vNear = smoothstep\(([\d.]+), ([\d.]+), -mvPosition\.z\);/);
    expect(band).not.toBeNull();
    const [near, far] = [Number(band![1]), Number(band![2])];
    expect([near, far]).toEqual([2, 12]);
    expect((1.5 / (far - near)) * DRIVE.boostTop).toBeLessThanOrEqual(4);
    expect(shader.fragmentShader).toContain('diffuseColor.a *= vNear;');
    const cloud: Cloud = { id: 9, at: { x: -30, z: 40 }, r: VOLLEY.cloudR, born: 10, life: VOLLEY.cloudLife };
    expect(cloud.r).toBe(6);
    const pos = haze.geometry.getAttribute('position');
    const col = haze.geometry.getAttribute('color');
    let first: number[] | null = null;
    for (let k = 0; k < 10; k++) {
      layer.sync(stateAtT(14 + k / 60, [], { clouds: [cloud] }), 5 + k / 60);
      expect(visibleUp(haze)).toBe(true);
      expect(mat.opacity).toBe(0.35);
      const n = haze.geometry.drawRange.count;
      expect(n).toBeGreaterThanOrEqual(6);
      const alphas = Array.from({ length: n }, (_, i) => col.getW(i));
      first ??= alphas;
      expect(alphas).toEqual(first);
      expect(alphas.every((a) => a === 1)).toBe(true);
      for (let i = 0; i < n; i++) {
        expect(Math.hypot(pos.getX(i) - cloud.at.x, pos.getZ(i) - cloud.at.z)).toBeLessThanOrEqual(6);
        expect(pos.getY(i) - groundHeight(pos.getX(i), pos.getZ(i))).toBeGreaterThan(0.3);
      }
    }
  });

  it('eases a volley’s haze in over its first 0.6 s and out over its last 0.6 s of run.t, no faster than 2 Hz, so it never pops when its life ends', () => {
    const { game } = fakeGame();
    const layer = createVolleys(game, false);
    const haze = named<THREE.Points>(game.root, 'haze');
    const col = haze.geometry.getAttribute('color');
    const cloud: Cloud = { id: 9, at: { x: -30, z: 40 }, r: 6, born: 10, life: 8 };
    const dt = 1 / 60;
    const level = () => (visibleUp(haze) && haze.geometry.drawRange.count > 0 ? col.getW(0) : 0);
    let last = 0;
    for (let t = 9.9; t < 18.2; t += dt) {
      // As the engine keeps haze: listed from its landing, dropped at born + life with no 'gone' first.
      layer.sync(stateAtT(t, [], { clouds: t >= 10 && t < 18 ? [cloud] : [] }), t);
      const want = Math.max(0, Math.min(1, (t - 10) / 0.6, (18 - t) / 0.6));
      expect(level(), `t ${t}`).toBeCloseTo(t >= 10 && t < 18 ? want : 0, 5);
      expect(Math.abs(level() - last), `t ${t}`).toBeLessThanOrEqual(dt / 0.25 + 1e-6);
      last = level();
    }
  });

  it('lays a lakon’s own haze out whole from its intro on, and keeps it through the outro', () => {
    const { game } = fakeGame();
    const layer = createVolleys(game, false);
    const haze = named<THREE.Points>(game.root, 'haze');
    const col = haze.geometry.getAttribute('color');
    const pos = haze.geometry.getAttribute('position');
    for (const phase of ['intro', 'active', 'outro', 'failed'] as const) {
      layer.sync({ ...P1_ROAM, run: { ...P1_ROAM.run, phase } }, 1);
      const n = haze.geometry.drawRange.count;
      expect(visibleUp(haze), phase).toBe(true);
      for (let i = 0; i < n; i++) expect(col.getW(i), phase).toBe(1);
      // Both of parva 1's patches, each round its own spot.
      for (const c of P1_ROAM.clouds) {
        let near = 0;
        for (let i = 0; i < n; i++) if (Math.hypot(pos.getX(i) - c.at.x, pos.getZ(i) - c.at.z) <= c.r) near++;
        expect(near, phase).toBeGreaterThanOrEqual(n / 2);
      }
    }
  });

  it('puts everything on FX_LAYER, the arrows too: the ambient-occlusion and depth passes never read aFade, so a fading arrow there would leave a footprint', () => {
    const { game } = fakeGame();
    createVolleys(game, false);
    for (const name of [...NAMES, 'haze']) expect(named(game.root, name).layers.mask, name).toBe(1 << FX_LAYER);
  });

  it('draws in 7 calls at most, and in none with nothing out', () => {
    const { game } = fakeGame();
    const layer = createVolleys(game, false);
    const calls = () => {
      let n = 0;
      named(game.root, 'volleys').traverse((o) => {
        const inst = o as THREE.InstancedMesh;
        if (((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) && visibleUp(o) && (!inst.isInstancedMesh || inst.count > 0)) n++;
      });
      return n;
    };
    expect(calls()).toBe(0);
    const t = flightT(0.5);
    const cloud: Cloud = { id: 3, at: { x: -30, z: 40 }, r: 6, born: 0, life: null };
    // One in the air with its telegraph out, one landed 4.2 s before, standing, and the haze.
    const earlier: Volley = { ...scriptedVolley({ x: -60, z: 60 }, PLANNED - 5, 2, WORLD), state: 'landed' };
    layer.sync(stateAtT(t, [volleyAt(t), earlier], { clouds: [cloud] }), t);
    expect(calls()).toBe(7);
    // All gone from the lists, the one in the air as an absorbed volley goes: the light takes its arrows over 0.3 s (the
    // arrows and their fletching still drawn), then nothing.
    layer.sync(stateAtT(t, []), t + 0.05);
    expect(calls()).toBe(2);
    for (let k = 1; k <= 8; k++) layer.sync(stateAtT(t, []), t + 0.05 + k * 0.05);
    expect(calls()).toBe(0);
  });

  it('allocates nothing per frame: no new, literal, spread or closure from function sync( to function dispose(, where every per-frame helper lives', () => {
    const src = read('src/lib/bowobharata-game/world/volleys3d.ts');
    const from = src.indexOf('  function sync(');
    const to = src.indexOf('  function dispose(');
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const frame = src.slice(from, to);
    // arrowPoint, hullCircles, forward and rightOf each build an object: a frame works the same sums in place.
    expect(frameCodeFaults(frame, src.slice(0, from) + src.slice(to), ['arrowPoint', 'hullCircles', 'forward', 'rightOf'])).toEqual([]);
    // So the check reads every function a frame runs: above sync only what runs once, or once a volley; after dispose, none.
    const declared = (text: string) => [...text.matchAll(/\bfunction (\w+)\(/g)].map((m) => m[1]);
    const start = src.indexOf('export function createVolleys(');
    expect(start).toBeGreaterThan(0);
    for (const fn of declared(src.slice(0, start))) expect(['nearFade'], fn).toContain(fn);
    for (const fn of declared(src.slice(start, from)).slice(1)) expect(['claim'], fn).toContain(fn);
    expect(declared(src.slice(to))).toEqual(['dispose']);
  });

  it('dispose removes its group and frees its geometries, materials and instanced meshes, not the scene’s textures', () => {
    const { game, frames } = fakeGame();
    const layer = createVolleys(game, false);
    const t = flightT(0.5);
    layer.sync(stateAtT(t, [volleyAt(t)], { clouds: [{ id: 3, at: { x: -30, z: 40 }, r: 6, born: 0, life: null }] }), t);
    const group = named(game.root, 'volleys');
    const owned = ownedBy(group, game);
    expect(owned.size).toBeGreaterThan(12);
    expectFreed(game, owned, () => layer.dispose());
    expect(game.root.children).not.toContain(group);
    expect(frames.size).toBe(0);
  });
});

describe('instancing', () => {
  it('makes an instanced mesh empty and hidden under its parent, gives a geometry its per-instance fade or shares one, and patches a material to read it', () => {
    const parent = new THREE.Group();
    const geo = new THREE.BoxGeometry();
    const mat = fading(new THREE.MeshBasicMaterial());
    const mesh = instanced(parent, 'boxes', geo, mat, 5);
    expect(mesh.parent).toBe(parent);
    expect(mesh.name).toBe('boxes');
    expect(mesh.count).toBe(0);
    expect(mesh.visible).toBe(false);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.instanceMatrix.count).toBe(5);
    const fade = fadeOn(geo, 5);
    expect(fade.isInstancedBufferAttribute).toBe(true);
    expect(fade.count).toBe(5);
    expect(geo.getAttribute('aFade')).toBe(fade);
    const other = new THREE.BoxGeometry();
    expect(fadeOn(other, 5, fade)).toBe(fade);
    expect(other.getAttribute('aFade')).toBe(fade);
    expect(mat.transparent).toBe(true);
    expect(mat.customProgramCacheKey()).toBe(FADE_KEY);
  });

  it('is where pickups3d and volleys3d make their instanced meshes and fades: neither keeps a copy, so both share one fade program', () => {
    for (const f of ['pickups3d.ts', 'volleys3d.ts']) {
      const src = read(join('src/lib/bowobharata-game/world', f));
      expect(src, f).toMatch(/from '\.\/instancing'/);
      for (const fn of ['instanced', 'fadeOn', 'fading']) expect(src, `${f}: ${fn}`).not.toMatch(new RegExp(`function ${fn}\\b|const ${fn}\\b`));
      expect(src, f).not.toMatch(/'pickup-fade'|'volley-fade'|attribute float aFade/);
    }
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

  it('is the one cleanup the layers share: landmarks3d, pickups3d and volleys3d call it and keep no copy of their own', () => {
    for (const f of ['landmarks3d.ts', 'pickups3d.ts', 'volleys3d.ts']) {
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
    for (const f of ['types.ts', 'shapes.ts', 'dispose.ts', 'instancing.ts', 'landmarks3d.ts', 'ground3d.ts', 'chariot-bind.ts', 'pickups3d.ts', 'volleys3d.ts']) expect(FILES).toContain(join(WORLD_DIR, f));
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
