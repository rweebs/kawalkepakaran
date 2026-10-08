import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { degrade, qualityFor } from '../src/lib/bowobharata/scene/quality';
import { FX_LAYER, contactShadow, glowSprite } from '../src/lib/bowobharata/scene/effects';
import { FORMATION_FILES, formation, frontRankCount } from '../src/lib/bowobharata/stage-math';
import {
  arrowPhase, cavalryLanes, clashLayout, dofFocus, easeToward, elephantSlots, handheld, shadowFrame, springStep,
} from '../src/lib/bowobharata/scene/motion';
import { heightField, normalFromHeight, weaveField } from '../src/lib/bowobharata/scene/texturegen';

describe('quality tiers carry the new effects', () => {
  it('gives desktops shadows, ambient occlusion, depth of field and the full battle; phones none of the post effects', () => {
    const d = qualityFor(false, 2);
    const p = qualityFor(true, 3);
    expect([d.shadows, d.ao, d.dof]).toEqual([true, true, true]);
    expect([p.shadows, p.ao, p.dof]).toEqual([false, false, false]);
    expect(p.skirmishPairs).toBeLessThan(d.skirmishPairs);
    expect(p.cavalry).toBeLessThan(d.cavalry);
    expect(p.elephants).toBeLessThan(d.elephants);
    expect(p.elephants).toBeGreaterThan(0);
  });
});

describe('effect layer', () => {
  const tex = new THREE.Texture();
  const camera = () => new THREE.PerspectiveCamera();
  it('keeps glow sprites and ground blobs out of the passes that re-render the scene with a flat material', () => {
    for (const o of [glowSprite(tex, '#fff', 2), contactShadow(tex, 3, 3)]) {
      const plain = camera(); // layer 0 only: what the ambient-occlusion and depth-of-field passes see
      expect(o.layers.test(plain.layers)).toBe(false);
      const colour = camera();
      colour.layers.enable(FX_LAYER); // what the main colour pass sees
      expect(o.layers.test(colour.layers)).toBe(true);
    }
  });
  it('uses a layer that real geometry is not on', () => {
    expect(FX_LAYER).not.toBe(0);
    expect(new THREE.Mesh().layers.isEnabled(FX_LAYER)).toBe(false);
  });
  it('is applied wherever the effects are made, and the post chain shows it only to the colour pass', () => {
    const effects = readFileSync('src/lib/bowobharata/scene/effects.ts', 'utf8');
    expect(effects).toContain('fxLayer(new THREE.Points(dustGeo');
    expect(effects).toContain('fxLayer(new THREE.Points(emberGeo');
    expect(effects).toMatch(/fxLayer\(new THREE\.Mesh\(new THREE\.PlaneGeometry\(7 \+ rnd\(\) \* 6, 60\)/);
    const post = readFileSync('src/lib/bowobharata/scene/post.ts', 'utf8');
    expect(post).toContain('camera.layers.enable(FX_LAYER)');
    expect(post).toContain('camera.layers.disable(FX_LAYER)');
    expect(readFileSync('src/lib/bowobharata/KurukshetraScene.ts', 'utf8')).toContain('camera.layers.enable(FX_LAYER)');
  });
});

describe('real soldiers in the front ranks', () => {
  it('gives desktops more real ranks than phones, and every device at least one', () => {
    const d = qualityFor(false, 2);
    const p = qualityFor(true, 3);
    expect(p.realRanks).toBeGreaterThanOrEqual(1);
    expect(d.realRanks).toBeGreaterThan(p.realRanks);
    expect(p.realFighters).toBeLessThan(d.realFighters);
  });
  it('counts the soldiers in the front ranks, never more than the army has', () => {
    expect(frontRankCount(6, 1800)).toBe(6 * FORMATION_FILES);
    expect(frontRankCount(2, 700)).toBe(2 * FORMATION_FILES);
    expect(frontRankCount(6, 100)).toBe(100);
    expect(frontRankCount(0, 1800)).toBe(0);
  });
  it('is the same ranks that formation() places at the front: rank 0 is the line nearest the centre', () => {
    const slots = formation(2 * FORMATION_FILES, 'adharma', 5);
    const front = slots.slice(0, FORMATION_FILES).map((s) => s.x);
    const second = slots.slice(FORMATION_FILES, 2 * FORMATION_FILES).map((s) => s.x);
    expect(Math.max(...front.map(Math.abs))).toBeLessThan(Math.min(...second.map(Math.abs)) + 0.8);
    expect(Math.min(...front)).toBeGreaterThan(3.5);
  });
});

describe('weaker desktops', () => {
  it('get a lighter tier when the machine reports few cores, without turning the effects off outright', () => {
    const strong = qualityFor(false, 2, 8);
    const weak = qualityFor(false, 2, 4);
    expect(weak.realRanks).toBeLessThan(strong.realRanks);
    expect(weak.realFighters).toBeLessThan(strong.realFighters);
    expect(weak.warriorsPerSide).toBeLessThan(strong.warriorsPerSide);
    expect(weak.shadowMap).toBeLessThan(strong.shadowMap);
    expect(weak.realRanks).toBeGreaterThan(qualityFor(true, 2, 4).realRanks);
    expect(weak.shadows).toBe(true);
  });
  it('treats an unknown core count as a capable machine, and never changes the phone tier', () => {
    expect(qualityFor(false, 2)).toEqual(qualityFor(false, 2, 8));
    expect(qualityFor(true, 3, 2)).toEqual(qualityFor(true, 3, 12));
  });
});

describe('degrade ladder', () => {
  const full = { ao: true, dof: true, bloom: true, shadows: true };
  it('drops one effect per step in order of cost: ao, dof, bloom, shadows', () => {
    const a = degrade(full);
    expect(a).toEqual({ ao: false, dof: true, bloom: true, shadows: true });
    const b = degrade(a);
    expect(b.dof).toBe(false);
    const c = degrade(b);
    expect(c.bloom).toBe(false);
    const d = degrade(c);
    expect(d).toEqual({ ao: false, dof: false, bloom: false, shadows: false });
  });
  it('does not mutate its input and is a fixed point once everything is off', () => {
    const snapshot = { ...full };
    degrade(full);
    expect(full).toEqual(snapshot);
    const off = { ao: false, dof: false, bloom: false, shadows: false };
    expect(degrade(off)).toEqual(off);
  });
});

describe('arrow lifecycle', () => {
  it('flies, then sticks in the ground for a while, then is gone', () => {
    expect(arrowPhase(0.5, 2, 1.5)).toEqual({ phase: 'flight', t: 0.25 });
    expect(arrowPhase(2.5, 2, 1.5).phase).toBe('stuck');
    expect(arrowPhase(3.4, 2, 1.5).phase).toBe('stuck');
    expect(arrowPhase(3.6, 2, 1.5).phase).toBe('gone');
  });
  it('reports how far through the stuck period it is, for the impact dust', () => {
    expect(arrowPhase(2.75, 2, 1.5)).toEqual({ phase: 'stuck', t: 0.5 });
  });
});

describe('easing towards a target', () => {
  it('moves part of the way, never overshooting, and not at all when no time has passed', () => {
    const x = easeToward(0, 1, 1 / 60, 3);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(0.1);
    expect(easeToward(0.4, 1, 0, 3)).toBe(0.4);
    for (const dt of [0.001, 0.016, 0.1, 0.5, 5]) expect(easeToward(0, 1, dt, 3)).toBeLessThanOrEqual(1);
  });
  it('is independent of the frame rate: two half-steps land where one whole step does', () => {
    const whole = easeToward(0.2, 0.9, 0.2, 3);
    const halves = easeToward(easeToward(0.2, 0.9, 0.1, 3), 0.9, 0.1, 3);
    expect(halves).toBeCloseTo(whole, 10);
  });
  it('arrives in about the same real time on a slow machine as on a fast one', () => {
    const run = (fps: number) => { let p = 0; for (let i = 0; i < fps * 2; i++) p = easeToward(p, 1, 1 / fps, 3); return p; };
    expect(run(2)).toBeCloseTo(run(60), 6);
    expect(run(60)).toBeGreaterThan(0.99);
  });
  it('also works downwards and is a no-op on the target', () => {
    expect(easeToward(1, 0, 0.1, 3)).toBeLessThan(1);
    expect(easeToward(0.5, 0.5, 0.1, 3)).toBe(0.5);
  });
});

describe('handheld camera', () => {
  it('is deterministic and gently bounded', () => {
    expect(handheld(12.3)).toEqual(handheld(12.3));
    for (let t = 0; t < 60; t += 0.37) {
      const h = handheld(t);
      expect(Math.abs(h.x)).toBeLessThan(0.1);
      expect(Math.abs(h.y)).toBeLessThan(0.07);
      expect(Math.abs(h.roll)).toBeLessThan(0.01);
    }
  });
  it('is perfectly still when the amount is zero (reduced motion)', () => {
    expect(handheld(5, 0)).toEqual({ x: 0, y: 0, roll: 0 });
  });
});

describe('spring chain', () => {
  it('settles on its target', () => {
    let s = { angle: 0, vel: 0 };
    for (let i = 0; i < 600; i++) s = springStep(s, 0.4, 1 / 60, 40, 6);
    expect(s.angle).toBeCloseTo(0.4, 2);
    expect(Math.abs(s.vel)).toBeLessThan(0.01);
  });
  it('lags behind a sudden change instead of snapping, and never explodes', () => {
    let s = { angle: 0, vel: 0 };
    s = springStep(s, 1, 1 / 60, 40, 6);
    expect(s.angle).toBeGreaterThan(0);
    expect(s.angle).toBeLessThan(0.2);
    let peak = 0;
    for (let i = 0; i < 300; i++) { s = springStep(s, 1, 1 / 60, 40, 6); peak = Math.max(peak, s.angle); }
    expect(peak).toBeLessThan(1.4);
  });
  it('returns a new state and leaves the old one alone', () => {
    const before = { angle: 0.2, vel: 0.1 };
    const after = springStep(before, 0, 1 / 60, 40, 6);
    expect(before).toEqual({ angle: 0.2, vel: 0.1 });
    expect(after).not.toBe(before);
  });
});

describe('clash line', () => {
  it('puts locked pairs on the line between the armies, facing each other, deterministically', () => {
    const a = clashLayout(80, 9);
    expect(clashLayout(80, 9)).toEqual(a);
    expect(a).toHaveLength(80);
    for (const p of a) {
      expect(Math.abs(p.x)).toBeLessThan(2.6);
      expect(p.gap).toBeGreaterThan(0.5);
      expect(p.gap).toBeLessThan(1.4);
      expect(p.phase).toBeGreaterThanOrEqual(0);
      expect(p.phase).toBeLessThan(Math.PI * 2);
    }
  });
  it('keeps every pair clear of Krishna’s chariot and its team, which stand at z = 9', () => {
    for (const p of clashLayout(90, 9)) expect(p.z).toBeLessThan(5);
  });
  it('keeps neighbouring pairs from standing on top of each other', () => {
    const a = clashLayout(60, 3);
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      expect(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z)).toBeGreaterThan(0.9);
    }
  });
});

describe('cavalry and elephants', () => {
  it('start each side in its own half, in lanes behind the front rank', () => {
    for (const s of cavalryLanes(30, 'dharma', 4)) expect(s.x).toBeLessThan(-8);
    for (const s of cavalryLanes(30, 'adharma', 4)) expect(s.x).toBeGreaterThan(8);
    expect(cavalryLanes(30, 'dharma', 4)).toEqual(cavalryLanes(30, 'dharma', 4));
  });
  it('places elephants wide of the infantry, spaced out along the line', () => {
    const e = elephantSlots(6, 'adharma');
    expect(e).toHaveLength(6);
    for (const s of e) expect(s.x).toBeGreaterThan(14);
    const zs = e.map((s) => s.z).sort((p, q) => p - q);
    for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1]).toBeGreaterThan(4);
  });
});

describe('shadow frame', () => {
  const sun = { x: 0.5, y: 0.7, z: -0.5 };
  it('follows the focus point and widens as the camera pulls back, within limits', () => {
    const near = shadowFrame({ x: 0, y: 1, z: 9 }, { x: 4, y: 3, z: 16 }, sun);
    const far = shadowFrame({ x: 0, y: 0, z: -10 }, { x: 0, y: 46, z: 16 }, sun);
    expect(near.center).toEqual({ x: 0, y: 1, z: 9 });
    expect(near.halfSize).toBeGreaterThanOrEqual(14);
    expect(far.halfSize).toBeGreaterThan(near.halfSize);
    expect(far.halfSize).toBeLessThanOrEqual(48);
  });
  it('puts the light up the sun direction from the centre', () => {
    const f = shadowFrame({ x: 1, y: 2, z: 3 }, { x: 5, y: 5, z: 12 }, sun);
    expect(f.position.y).toBeGreaterThan(f.center.y);
    expect((f.position.x - f.center.x) / (f.position.y - f.center.y)).toBeCloseTo(sun.x / sun.y, 4);
    expect(Math.hypot(f.position.x - f.center.x, f.position.y - f.center.y, f.position.z - f.center.z)).toBeCloseTo(80, 3);
  });
});

describe('depth of field', () => {
  it('focuses on the subject and only blurs on close shots', () => {
    const close = dofFocus({ x: 0, y: 3, z: 16 }, { x: 0, y: 2, z: 9 });
    expect(close.focus).toBeCloseTo(Math.hypot(0, 1, 7), 5);
    expect(close.amount).toBe(1);
    expect(dofFocus({ x: 0, y: 46, z: 16 }, { x: 0, y: 0, z: -12 }).amount).toBe(0);
    const mid = dofFocus({ x: 0, y: 3, z: 30 }, { x: 0, y: 2, z: 9 }).amount;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('procedural height fields', () => {
  it('are deterministic, within 0..1, and tile without a seam', () => {
    const n = 64;
    const h = heightField(n, 5, 4, 3);
    expect(heightField(n, 5, 4, 3)).toEqual(h);
    expect(h).toHaveLength(n * n);
    for (const v of h) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    let seam = 0;
    let inner = 0;
    for (let i = 0; i < n; i++) {
      seam = Math.max(seam, Math.abs(h[i * n] - h[i * n + n - 1]), Math.abs(h[i] - h[(n - 1) * n + i]));
      inner = Math.max(inner, Math.abs(h[i * n + 10] - h[i * n + 11]));
    }
    expect(seam).toBeLessThan(inner * 1.5 + 0.05);
  });
  it('differs between seeds', () => {
    expect(heightField(32, 1, 4, 2)).not.toEqual(heightField(32, 2, 4, 2));
  });
});

describe('cloth weave', () => {
  it('repeats once per thread across the tile, so it tiles', () => {
    const n = 64;
    const w = weaveField(n, 8);
    expect(w).toHaveLength(n * n);
    for (const v of w) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    expect(w[0 * n + 3]).toBeCloseTo(w[0 * n + 3 + 8], 5); // one thread (n / 8 = 8 px) later it repeats
    expect(w[5 * n + 2]).toBeCloseTo(w[(5 + 8) * n + 2], 5);
    expect(new Set(Array.from(w, (v) => v.toFixed(3))).size).toBeGreaterThan(3);
  });
});

describe('normal maps', () => {
  it('turn a flat field into the straight-up normal colour', () => {
    const flat = new Float32Array(16 * 16).fill(0.5);
    const rgba = normalFromHeight(flat, 16, 2);
    expect(rgba).toHaveLength(16 * 16 * 4);
    expect([rgba[0], rgba[1], rgba[2], rgba[3]]).toEqual([128, 128, 255, 255]);
  });
  it('tilt towards the downhill side of a ramp', () => {
    const ramp = new Float32Array(16 * 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) ramp[y * 16 + x] = x / 15;
    const rgba = normalFromHeight(ramp, 16, 2);
    const i = (8 * 16 + 8) * 4;
    expect(rgba[i]).toBeLessThan(128); // height rises with x, so the normal leans to -x
    expect(rgba[i + 2]).toBeGreaterThan(128);
  });
});
