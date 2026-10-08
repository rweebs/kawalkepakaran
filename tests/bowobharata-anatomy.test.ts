import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { horse, humanFigure, loft, soldierGeometry } from '../src/lib/bowobharata/scene/anatomy';

const mat = () => new THREE.MeshStandardMaterial();
const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());

describe('loft', () => {
  const line = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 0)];
  it('builds rings of radial vertices along the path', () => {
    const g = loft(line, [[1, 1], [1, 1]], 4, 8);
    expect(g.getAttribute('position').count).toBe(5 * 9);
    expect(g.getIndex()!.count).toBe(4 * 8 * 6);
    expect(g.getAttribute('uv')).toBeDefined();
    expect(g.getAttribute('normal')).toBeDefined();
  });
  it('puts every ring vertex at the cross-section radius from the axis', () => {
    const pos = loft(line, [[0.5, 0.5], [0.5, 0.5]], 4, 8).getAttribute('position');
    for (let i = 0; i < pos.count; i++) expect(Math.hypot(pos.getY(i), pos.getZ(i))).toBeCloseTo(0.5, 5);
  });
  it('uses the first radius sideways (z) and the second in the plane of the path (y), tapering between ends', () => {
    const pos = loft(line, [[0.3, 0.6], [0.1, 0.2]], 2, 4).getAttribute('position');
    let maxZ = 0;
    let maxY = 0;
    for (let i = 0; i < 5; i++) { maxZ = Math.max(maxZ, Math.abs(pos.getZ(i))); maxY = Math.max(maxY, Math.abs(pos.getY(i))); }
    expect(maxZ).toBeCloseTo(0.3, 5);
    expect(maxY).toBeCloseTo(0.6, 5);
    expect(Math.abs(pos.getZ(2 * 5))).toBeCloseTo(0.1, 5);
  });
  it('faces its surface outwards', () => {
    const g = loft(line, [[1, 1], [1, 1]], 4, 8);
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const i = 2 * 9; // a vertex on the middle ring
    expect(pos.getY(i) * nor.getY(i) + pos.getZ(i) * nor.getZ(i)).toBeGreaterThan(0);
  });
});

describe('horse', () => {
  const h = horse({ coat: mat(), mane: mat(), hoof: mat(), eye: mat() });
  it('stands on the ground at about a real horse’s proportions', () => {
    const box = new THREE.Box3().setFromObject(h.group);
    expect(box.min.y).toBeGreaterThan(-0.06);
    expect(box.min.y).toBeLessThan(0.02);
    const s = size(h.group);
    expect(s.y).toBeGreaterThan(1.9);
    expect(s.y).toBeLessThan(2.4);
    expect(s.x).toBeGreaterThan(2.2);
    expect(s.z).toBeLessThan(0.9);
  });
  it('has four jointed legs, a head and a tail it can move', () => {
    expect(h.legs).toHaveLength(4);
    expect(h.head.children.length).toBeGreaterThan(3);
    expect(h.tail).toBeInstanceOf(THREE.Object3D);
  });
});

describe('human figure', () => {
  it('stands about 1.8 tall with head, arms and legs', () => {
    const f = humanFigure({ skin: mat(), cloth: mat() });
    const s = size(f.group);
    expect(s.y).toBeGreaterThan(1.7);
    expect(s.y).toBeLessThan(1.95);
    expect(f.head).toBeInstanceOf(THREE.Group);
  });
  it('sits lower when seated, and places its hands where the arm pose says', () => {
    const seated = humanFigure({ skin: mat(), cloth: mat(), seated: true });
    expect(size(seated.group).y).toBeLessThan(1.35);
    const raised = humanFigure({ skin: mat(), cloth: mat(), arms: { right: [[0, 1.42, -0.22], [0.08, 1.68, -0.32], [0.12, 1.95, -0.3]] } });
    expect(raised.rightHand.y).toBeGreaterThan(1.9);
  });
});

describe('body tagging', () => {
  it('marks the body parts so a skinned body can replace them, but never the figure group that carries the garments', () => {
    const f = humanFigure({ skin: mat(), cloth: mat() });
    expect(f.group.userData.body).toBeUndefined();
    const parts: THREE.Object3D[] = [];
    f.group.traverse((n) => { if (n !== f.group) parts.push(n); });
    expect(parts.length).toBeGreaterThan(5);
    for (const n of parts) expect(n.userData.body, n.type).toBe(true);
  });
  it('does not mark things added to the group afterwards', () => {
    const f = humanFigure({ skin: mat(), cloth: mat() });
    const hat = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat());
    f.group.add(hat);
    expect(hat.userData.body).toBeUndefined();
  });
});

describe('soldier', () => {
  it('is one merged, low-cost mesh', () => {
    const g = soldierGeometry();
    expect(g.getIndex()).not.toBeNull();
    expect(g.getIndex()!.count / 3).toBeLessThan(700);
    const box = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
    expect(box.max.y - box.min.y).toBeGreaterThan(2.3); // spear above the head
  });
});
