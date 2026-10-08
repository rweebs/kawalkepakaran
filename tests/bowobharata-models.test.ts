import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { CREDITS, MODELS } from '../src/lib/bowobharata/model-credits';
import * as THREE from 'three';
import { facingAngle, fitScale } from '../src/lib/bowobharata/scene/fit';
import { gearAt } from '../src/lib/bowobharata/scene/hero';

const read = (p: string) => readFileSync(p, 'utf8');

describe('model manifest', () => {
  it('lists only files that are in public/models and are compressed small', () => {
    for (const [name, m] of Object.entries(MODELS)) {
      const file = `public${m.url}`;
      expect(existsSync(file), name).toBe(true);
      expect(statSync(file).size, name).toBeLessThan(900 * 1024);
    }
  });
  it('records the author, licence and source page of every model', () => {
    for (const [name, m] of Object.entries(MODELS)) {
      expect(m.author, name).toBe('Quaternius');
      expect(['CC0 1.0', 'CC BY 3.0'], name).toContain(m.license);
      expect(m.source, name).toMatch(/^https:\/\/poly\.pizza\/m\//);
    }
  });
  it('credits every model that requires attribution (CC BY), on the page', () => {
    const page = read('src/pages/kasus/abil-sudarman/bowobharata.astro');
    expect(page).toContain('CREDITS');
    for (const m of Object.values(MODELS)) {
      if (m.license === 'CC BY 3.0') {
        const credit = CREDITS.find((c) => c.source === m.source);
        expect(credit, m.source).toBeDefined();
        expect(credit!.text).toContain('Quaternius');
        expect(credit!.text).toContain('CC BY 3.0');
      }
    }
  });
  it('caches the models for a week, so a returning visitor does not download them again', () => {
    expect(read('public/_headers')).toMatch(/\/models\/\*\n\s+Cache-Control: public, max-age=604800/);
  });
  it('keeps the credits module free of three.js so the page never imports it', () => {
    expect(read('src/lib/bowobharata/model-credits.ts')).not.toMatch(/from 'three/);
  });
});

describe('headgear that follows an animated head', () => {
  const id = new THREE.Quaternion();
  const yaw = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
  it('sits at the head centre plus its authored offset when the head has not moved from rest', () => {
    const g = gearAt({ restQ: id, nowQ: id, bonePos: new THREE.Vector3(0.1, 1.5, 0), headLift: 0.12, offset: new THREE.Vector3(0, 0.2, 0), authoredQ: id });
    expect(g.position.distanceTo(new THREE.Vector3(0.1, 1.5 + 0.12 + 0.2, 0))).toBeLessThan(1e-9);
    expect(g.quaternion.angleTo(id)).toBeLessThan(1e-9);
  });
  it('turns its offset and its own orientation with the head, keeping the head centre as the pivot', () => {
    const g = gearAt({ restQ: id, nowQ: yaw(Math.PI / 2), bonePos: new THREE.Vector3(0, 1.5, 0), headLift: 0.12, offset: new THREE.Vector3(1, 0, 0), authoredQ: id });
    expect(g.position.distanceTo(new THREE.Vector3(0, 1.62, -1))).toBeLessThan(1e-9); // +x turned a quarter about y lands on -z
    expect(g.quaternion.angleTo(yaw(Math.PI / 2))).toBeLessThan(1e-9);
  });
  it('is relative to the head’s rest orientation, so a model that rests turned still gives no spurious rotation', () => {
    const g = gearAt({ restQ: yaw(1.1), nowQ: yaw(1.1), bonePos: new THREE.Vector3(), headLift: 0.1, offset: new THREE.Vector3(0.3, 0.1, 0), authoredQ: id });
    expect(g.position.distanceTo(new THREE.Vector3(0.3, 0.2, 0))).toBeLessThan(1e-9);
    expect(g.quaternion.angleTo(id)).toBeLessThan(1e-9);
  });
  it('leaves the head lift in the head’s own up direction, so a tilted head lifts its gear along the tilt', () => {
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const g = gearAt({ restQ: id, nowQ: tilt, bonePos: new THREE.Vector3(), headLift: 0.5, offset: new THREE.Vector3(), authoredQ: id });
    expect(g.position.distanceTo(new THREE.Vector3(-0.5, 0, 0))).toBeLessThan(1e-9);
  });
});

describe('fitting a model into the scene', () => {
  it('turns a model so tail-to-head points along +x', () => {
    expect(facingAngle({ x: 0, y: 1, z: 0 }, { x: 2, y: 1, z: 0 })).toBeCloseTo(0);
    expect(facingAngle({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 3 })).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(facingAngle({ x: 0, y: 1, z: 0 }, { x: -1, y: 1, z: 0 }))).toBeCloseTo(Math.PI);
  });
  it('ignores height when working out which way a model faces', () => {
    expect(facingAngle({ x: 0, y: 0, z: 0 }, { x: 1, y: 9, z: 0 })).toBeCloseTo(0);
  });
  it('scales a model so its measured size becomes the target size', () => {
    expect(fitScale(0.5, 2)).toBeCloseTo(4);
    expect(fitScale(100, 1.8)).toBeCloseTo(0.018);
  });
  it('never divides by zero for an empty or degenerate model', () => {
    expect(fitScale(0, 2)).toBe(1);
    expect(fitScale(-3, 2)).toBe(1);
    expect(fitScale(Number.NaN, 2)).toBe(1);
  });
});
