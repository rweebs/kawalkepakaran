import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { FIELD, dressingLayout } from '../src/lib/bowobharata/scene/dressing-layout';
import { PAVILION } from '../src/lib/bowobharata/stage-math';
import { qualityFor } from '../src/lib/bowobharata/scene/quality';
import { FX_LAYER, createContext } from '../src/lib/bowobharata/scene/effects';
import { createDetail } from '../src/lib/bowobharata/scene/materials';

describe('ground dressing layout', () => {
  const spots = dressingLayout(2000, 3);
  it('places exactly the requested number, the same every time for a seed, and differently for another', () => {
    expect(spots).toHaveLength(2000);
    expect(dressingLayout(2000, 3)).toEqual(spots);
    expect(dressingLayout(2000, 4)).not.toEqual(spots);
  });
  it('keeps every tuft and rock off the field where the armies, the chariot and the clash line are', () => {
    for (const s of spots) {
      const inField = s.x > FIELD.minX && s.x < FIELD.maxX && s.z > FIELD.minZ && s.z < FIELD.maxZ;
      expect(inField, `${s.x},${s.z}`).toBe(false);
    }
  });
  it('keeps clear of the pavilion mound', () => {
    for (const s of spots) expect(Math.hypot(s.x - PAVILION.x, s.z - PAVILION.z)).toBeGreaterThan(12);
  });
  it('stays on the terrain, which reaches 130 units each way', () => {
    for (const s of spots) { expect(Math.abs(s.x)).toBeLessThan(125); expect(Math.abs(s.z)).toBeLessThan(125); }
  });
  it('gives every spot a usable size and turn', () => {
    for (const s of spots) {
      expect(s.scale).toBeGreaterThan(0.4);
      expect(s.scale).toBeLessThan(2.2);
      expect(s.turn).toBeGreaterThanOrEqual(0);
      expect(s.turn).toBeLessThan(Math.PI * 2);
    }
  });
  it('scatters evenly enough that no quarter of the free ground is empty', () => {
    const quarters = new Set(spots.map((s) => `${s.x < 0 ? 'w' : 'e'}${s.z < -10 ? 'n' : 's'}`));
    expect(quarters.size).toBe(4);
  });
});

describe('dressing tiers', () => {
  it('has fewer tufts and rocks on phones than on desktops, and some on both', () => {
    const d = qualityFor(false, 2);
    const p = qualityFor(true, 3);
    expect(p.tufts).toBeGreaterThan(0);
    expect(p.tufts).toBeLessThan(d.tufts);
    expect(p.rocks).toBeLessThan(d.rocks);
  });
});

// No DOM under vitest: a canvas whose 2D context swallows every call, so the texture painters run without drawing.
function stubCanvas() {
  const g: unknown = new Proxy(function () {}, { get: () => g, apply: () => g, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => g }) });
}

describe('the dressing part', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('draws grass on the effect layer, so the occlusion and depth-of-field passes never flatten its alpha-cut blades into solid quads', async () => {
    stubCanvas();
    const { createDressing } = await import('../src/lib/bowobharata/scene/dressing');
    const q = qualityFor(false, 1);
    const ctx = createContext(q, new THREE.PerspectiveCamera(), createDetail(8));
    const part = createDressing(ctx);
    const tuft = part.object.children.find((c) => c.name === 'tufts');
    const rock = part.object.children.find((c) => c.name === 'rocks');
    expect(tuft).toBeDefined();
    expect(rock).toBeDefined();
    expect(tuft!.layers.isEnabled(FX_LAYER)).toBe(true);
    expect(tuft!.layers.isEnabled(0)).toBe(false);
    expect(rock!.layers.isEnabled(0)).toBe(true);
  });
  it('is part of the scene', () => {
    expect(readFileSync('src/lib/bowobharata/KurukshetraScene.ts', 'utf8')).toContain('createDressing(ctx)');
  });
});
