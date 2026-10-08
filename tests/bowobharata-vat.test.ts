import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { frameBlend, planClips, texelOf, vatLayout } from '../src/lib/bowobharata/scene/vat-math';
import { bakeVat } from '../src/lib/bowobharata/scene/vat';

describe('vertex animation texture layout', () => {
  it('packs every vertex of every frame into a 2D texture, wrapping long frames onto several rows', () => {
    const l = vatLayout(4733, 36, 2048);
    expect(l.width).toBe(2048);
    expect(l.rowsPerFrame).toBe(3);
    expect(l.height).toBe(3 * 36);
    expect(vatLayout(100, 10, 2048).rowsPerFrame).toBe(1);
    expect(vatLayout(2048, 1, 2048).rowsPerFrame).toBe(1);
    expect(vatLayout(2049, 1, 2048).rowsPerFrame).toBe(2);
  });
  it('maps (vertex, frame) to a unique texel inside the texture', () => {
    const l = vatLayout(4733, 36, 2048);
    const seen = new Set<string>();
    for (const frame of [0, 1, 17, 35]) {
      for (const vid of [0, 1, 2047, 2048, 4095, 4732]) {
        const { x, y } = texelOf(l, vid, frame);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(l.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(l.height);
        seen.add(`${x},${y}`);
      }
    }
    expect(seen.size).toBe(4 * 6);
  });
  it('keeps one frame in its own rows, never spilling into the next frame', () => {
    const l = vatLayout(4733, 36, 2048);
    expect(texelOf(l, 4732, 0).y).toBeLessThan(texelOf(l, 0, 1).y);
  });
});

describe('clip plan', () => {
  it('gives each clip a consecutive block of frames and keeps its duration', () => {
    const plan = planClips([{ name: 'Walk', duration: 1.2 }, { name: 'Punch', duration: 0.8 }], { Walk: 14, Punch: 10 });
    expect(plan.Walk).toEqual({ start: 0, frames: 14, duration: 1.2 });
    expect(plan.Punch).toEqual({ start: 14, frames: 10, duration: 0.8 });
  });
  it('ignores clips it was not asked for', () => {
    const plan = planClips([{ name: 'Walk', duration: 1 }, { name: 'Death', duration: 2 }], { Walk: 8 });
    expect(Object.keys(plan)).toEqual(['Walk']);
  });
});

describe('looping through the baked frames', () => {
  it('picks two neighbouring frames and a blend between them', () => {
    const b = frameBlend(0.25, 1, 8, 0);
    expect(b.f0).toBe(2);
    expect(b.f1).toBe(3);
    expect(b.mix).toBeCloseTo(0, 10);
    const half = frameBlend(0.3125, 1, 8, 0);
    expect(half.f0).toBe(2);
    expect(half.mix).toBeCloseTo(0.5, 10);
  });
  it('wraps from the last frame back to the first, so the loop has no pop', () => {
    const b = frameBlend(0.95, 1, 8, 0);
    expect(b.f0).toBe(7);
    expect(b.f1).toBe(0);
  });
  it('offsets each soldier by its phase, so they are out of step', () => {
    expect(frameBlend(0, 1, 8, 0.5).f0).toBe(4);
    expect(frameBlend(0, 1, 8, 0.5).f0).not.toBe(frameBlend(0, 1, 8, 0).f0);
  });
  it('stays in range for any time, including negative and huge values', () => {
    for (const t of [-3.7, 0, 0.001, 12345.678]) {
      const b = frameBlend(t, 1.3, 14, 0.2);
      expect(b.f0).toBeGreaterThanOrEqual(0);
      expect(b.f0).toBeLessThan(14);
      expect(b.f1).toBeGreaterThanOrEqual(0);
      expect(b.f1).toBeLessThan(14);
      expect(b.mix).toBeGreaterThanOrEqual(0);
      expect(b.mix).toBeLessThan(1);
    }
  });
});

/** A two-bone strip of two triangles: the right-hand triangle follows bone 1, which a clip swings up by a quarter turn. */
function twoBoneRig() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0, 1, 1, 0], 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geo.setIndex([0, 1, 2, 3, 4, 5]);
  const root = new THREE.Bone();
  const arm = new THREE.Bone();
  arm.name = 'arm';
  arm.position.set(1, 0, 0);
  root.add(arm);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  mesh.add(root);
  mesh.bind(new THREE.Skeleton([root, arm]));
  const holder = new THREE.Group();
  holder.add(mesh);
  const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const clip = new THREE.AnimationClip('Swing', 1, [new THREE.QuaternionKeyframeTrack('arm.quaternion', [0, 1], [0, 0, 0, 1, ...quarter.toArray()])]);
  return { holder, mesh, clip };
}

describe('baking a skinned mesh', () => {
  it('records every vertex of every frame, and the first frame is the rest pose', () => {
    const { holder, mesh, clip } = twoBoneRig();
    const bake = bakeVat(holder, mesh, [clip], { Swing: 3 });
    expect(bake.vertexCount).toBe(6);
    expect(bake.frames).toBe(3);
    expect(bake.layout.height).toBe(3);
    expect(bake.positions).toHaveLength(bake.layout.width * bake.layout.height * 4);
    const at = (vid: number, frame: number) => { const { x, y } = texelOf(bake.layout, vid, frame); const i = (y * bake.layout.width + x) * 4; return new THREE.Vector3(bake.positions[i], bake.positions[i + 1], bake.positions[i + 2]); };
    expect(at(0, 0).distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(1e-5);
    expect(at(4, 0).distanceTo(new THREE.Vector3(2, 0, 0))).toBeLessThan(1e-5);
  });
  it('moves the vertices that follow the animated bone, and leaves the others where they were', () => {
    const { holder, mesh, clip } = twoBoneRig();
    const bake = bakeVat(holder, mesh, [clip], { Swing: 3 });
    const at = (vid: number, frame: number) => { const { x, y } = texelOf(bake.layout, vid, frame); const i = (y * bake.layout.width + x) * 4; return new THREE.Vector3(bake.positions[i], bake.positions[i + 1], bake.positions[i + 2]); };
    expect(at(0, 2).distanceTo(at(0, 0))).toBeLessThan(1e-5); // the fixed triangle
    expect(at(4, 2).distanceTo(at(4, 0))).toBeGreaterThan(0.3); // the swung triangle
  });
  it('bakes one flat normal per triangle, of unit length, matching the moving triangle', () => {
    const { holder, mesh, clip } = twoBoneRig();
    const bake = bakeVat(holder, mesh, [clip], { Swing: 3 });
    const n = (vid: number, frame: number) => { const { x, y } = texelOf(bake.layout, vid, frame); const i = (y * bake.layout.width + x) * 4; return new THREE.Vector3(bake.normals[i], bake.normals[i + 1], bake.normals[i + 2]); };
    for (const f of [0, 1, 2]) {
      for (const vid of [0, 1, 2, 3, 4, 5]) expect(n(vid, f).length()).toBeCloseTo(1, 4);
      expect(n(3, f).distanceTo(n(4, f))).toBeLessThan(1e-5); // the three corners of a triangle share its normal
    }
    expect(n(0, 0).z).toBeCloseTo(1, 4);
  });
  it('leaves the rig in its rest pose when it is done', () => {
    const { holder, mesh, clip } = twoBoneRig();
    bakeVat(holder, mesh, [clip], { Swing: 3 });
    const arm = mesh.skeleton.bones[1];
    expect(arm.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
  });
});

describe('one baked soldier shared by the armies and the skirmish', () => {
  it('is baked once, through a cache, by whoever asks first', () => {
    const soldiers = readFileSync('src/lib/bowobharata/scene/soldiers.ts', 'utf8');
    expect(soldiers).toContain('export function getSoldierKit(');
    expect(soldiers).toMatch(/new WeakMap<LoadedModels, SoldierKit \| null>\(\)/);
    for (const f of ['army', 'battle']) {
      const src = readFileSync(`src/lib/bowobharata/scene/${f}.ts`, 'utf8');
      expect(src, f).toContain('getSoldierKit(models, ctx.uTime)');
      expect(src, f).not.toContain('prepareSoldiers(');
    }
  });
  it('replaces skirmish fighters pair by pair, hiding their procedural stand-ins and punching with the real clip', () => {
    const battle = readFileSync('src/lib/bowobharata/scene/battle.ts', 'utf8');
    expect(battle).toContain('CLIP.punch');
    expect(battle).toContain('quality.realFighters');
    expect(battle).toMatch(/setMatrixAt\(2 \* i/);
  });
});

describe('cavalry: a real galloping horse with a rider, charging in step', () => {
  it('shares one travel shader between the baked horse and the rider, so they never drift apart', () => {
    const travel = readFileSync('src/lib/bowobharata/scene/travel.ts', 'utf8');
    expect(travel).toContain('export const TRAVEL_GLSL');
    expect(travel).toContain('uTravel');
    for (const f of ['rig', 'vat']) {
      const src = readFileSync(`src/lib/bowobharata/scene/${f}.ts`, 'utf8');
      expect(src, f).toContain("from './travel'");
      expect(src, f).toContain('${TRAVEL_GLSL}');
    }
  });
  it('builds the rider alone, sitting above where a horse’s back would be, with a long lance', async () => {
    const { riderGeometry } = await import('../src/lib/bowobharata/scene/creatures');
    const box = new THREE.Box3().setFromBufferAttribute(riderGeometry('#aaaaaa', '#bb3333').getAttribute('position') as THREE.BufferAttribute);
    expect(box.min.y).toBeGreaterThan(1.3);
    expect(box.max.y).toBeGreaterThan(2.4);
    expect(box.max.x - box.min.x).toBeGreaterThan(2.5); // the lance
  });
  it('leaves the all-procedural cavalry in place as the fallback', async () => {
    const { cavalryGeometry } = await import('../src/lib/bowobharata/scene/creatures');
    const box = new THREE.Box3().setFromBufferAttribute(cavalryGeometry('#aaaaaa', '#bb3333').getAttribute('position') as THREE.BufferAttribute);
    expect(box.min.y).toBeLessThan(0.1); // hooves on the ground
  });
  it('swaps the cavalry for the real horse only for the instances it hides, and bakes the horse’s gallop', () => {
    const battle = readFileSync('src/lib/bowobharata/scene/battle.ts', 'utf8');
    expect(battle).toContain('getHorseKit(models, ctx.uTime');
    expect(battle).toContain('riderGeometry(');
    const soldiers = readFileSync('src/lib/bowobharata/scene/soldiers.ts', 'utf8');
    expect(soldiers).toContain("clips: ['Gallop']");
  });
});

describe('the baked texture is used on the GPU, never rebuilt per frame', () => {
  it('samples the position and normal textures in the vertex shader from a per-instance clip and phase', () => {
    const src = readFileSync('src/lib/bowobharata/scene/vat.ts', 'utf8');
    expect(src).toContain('uniform sampler2D uVatPos');
    expect(src).toContain('uniform sampler2D uVatNor');
    expect(src).toContain('attribute float aVid');
    expect(src).toContain('attribute float aPhase');
    expect(src).toContain('attribute float aClip');
    expect(src).toContain('HalfFloatType');
    expect(src).toContain('NearestFilter');
  });
});
