import * as THREE from 'three';
import { mulberry32 } from '../../sky/rng';
import { FORMATION_FILES, frontRankCount, groundHeight, type Slot } from '../stage-math';
import { soldierGeometry } from './anatomy';
import { canvasTexture, wavingCloth, type Part, type SceneContext } from './effects';
import { limbMaterial } from './rig';
import { CLIP, getSoldierKit, soldierMesh, type SoldierKit, type SoldierSpot } from './soldiers';

function emblem(side: 'dharma' | 'adharma'): THREE.CanvasTexture {
  return canvasTexture(128, 96, (g, w, h) => {
    if (side === 'dharma') {
      g.fillStyle = '#1f3c9c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#e2b54a'; g.lineWidth = 5;
      g.beginPath(); g.arc(w / 2, h / 2, 28, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * 28, h / 2 + Math.sin(a) * 28); g.stroke();
      }
      g.fillStyle = '#e2b54a'; g.fillRect(0, h - 8, w, 8);
    } else {
      g.fillStyle = '#6a1018'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#120a0c'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath();
      for (let t = 0; t < 1; t += 0.02) {
        const r = 6 + t * 26;
        const a = t * Math.PI * 4;
        const x = w / 2 + Math.cos(a) * r;
        const y = h / 2 + Math.sin(a) * r * 0.75;
        if (t === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = '#120a0c'; g.beginPath(); g.arc(w / 2 + 30, h / 2 - 4, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c99a3a'; g.fillRect(0, h - 8, w, 8);
    }
  });
}

function army(side: 'dharma' | 'adharma', slots: Slot[], ctx: SceneContext, geometry: THREE.BufferGeometry, material: THREE.Material): { group: THREE.Group; mesh: THREE.InstancedMesh } {
  const g = new THREE.Group();
  const rnd = mulberry32(side === 'dharma' ? 11 : 23);
  const mesh = new THREE.InstancedMesh(geometry, material, slots.length);
  const phases = new Float32Array(slots.length);
  const lean = new Float32Array(slots.length);
  const d = new THREE.Object3D();
  const base = new THREE.Color(side === 'dharma' ? '#2e4da6' : '#7b1b26');
  const accent = new THREE.Color(side === 'dharma' ? '#c9a045' : '#1b1214');
  const col = new THREE.Color();
  slots.forEach((s, i) => {
    d.position.set(s.x, groundHeight(s.x, s.z), s.z);
    d.rotation.set(0, (side === 'dharma' ? 0 : Math.PI) + (rnd() - 0.5) * 0.35, 0);
    d.scale.setScalar(0.9 + rnd() * 0.2);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    col.copy(base).lerp(accent, rnd() < (side === 'dharma' ? 0.12 : 0.4) ? 0.8 : rnd() * 0.15).multiplyScalar(0.8 + rnd() * 0.35);
    mesh.setColorAt(i, col);
    phases[i] = s.phase / (Math.PI * 2);
    // The front ranks lean into the charge; the lean fades to nothing by the fourth rank.
    lean[i] = Math.max(0, 1 - Math.floor(i / FORMATION_FILES) / 3);
  });
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geometry.setAttribute('aLean', new THREE.InstancedBufferAttribute(lean, 1));
  mesh.instanceMatrix.needsUpdate = true;
  g.add(mesh);

  // A banner over every division (eight files), two rows deep.
  const { geometry: clothGeo, material: clothMat } = wavingCloth(emblem(side), 1.3, 0.9, ctx.uTime, ctx.detail.cloth);
  const pole = new THREE.CylinderGeometry(0.03, 0.03, 4, 5).translate(0, 2, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.8 });
  const sign = side === 'dharma' ? -1 : 1;
  for (let row = 0; row < 2; row++) {
    for (let div = 0; div < 8; div++) {
      const x = sign * (5.5 + row * 6);
      const z = 14 - (div * 8 + 4) * 0.75 - div * 1.6;
      const y = groundHeight(x, z);
      const p = new THREE.Mesh(pole, poleMat);
      p.position.set(x, y, z);
      const cloth = new THREE.Mesh(clothGeo, clothMat);
      cloth.position.set(x, y + 3.5, z);
      cloth.rotation.y = side === 'dharma' ? Math.PI / 2 : -Math.PI / 2;
      g.add(p, cloth);
    }
  }
  return { group: g, mesh };
}

/** Both armies drawn up along the field: Pandawa in blue and gold on the left, Kurawa in crimson and black on the right. */
export function createArmies(ctx: SceneContext, dharma: Slot[], adharma: Slot[]): Part {
  const group = new THREE.Group();
  // Scissoring legs, a bob at each step, and the front ranks leaning forward; every soldier out of step with the next.
  const material = limbMaterial(ctx.uTime, { swing: 0.5, speed: 3.4, phases: [0, 0, Math.PI], bob: 0.04, lean: 0.28, roughness: 0.65, metalness: 0.3 });
  // Each side gets its own geometry copy, because the per-instance phase attribute lives on the geometry.
  const sides = [
    { side: 'dharma' as const, slots: dharma, built: army('dharma', dharma, ctx, soldierGeometry(), material) },
    { side: 'adharma' as const, slots: adharma, built: army('adharma', adharma, ctx, soldierGeometry(), material) },
  ];
  for (const s of sides) group.add(s.built.group);

  // Once the real soldier has loaded, the front ranks, the ones the camera sees closely, are drawn as it: its own skeleton animation,
  // baked into textures and played by the GPU. Their procedural stand-ins are scaled to nothing; the ranks behind stay as they are.
  let kit: SoldierKit | null = null;
  return {
    object: group,
    update() { /* animated in the shader through ctx.uTime */ },
    upgrade(models) {
      kit = getSoldierKit(models, ctx.uTime);
      if (!kit) return;
      const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
      const rnd = mulberry32(77);
      for (const { side, slots, built } of sides) {
        const n = frontRankCount(ctx.quality.realRanks, slots.length);
        if (n === 0) continue;
        const tint = new THREE.Color(side === 'dharma' ? '#6f8be0' : '#c4505c');
        const facing = side === 'dharma' ? 0 : Math.PI;
        const spots: SoldierSpot[] = slots.slice(0, n).map((s) => ({
          x: s.x, z: s.z, rotY: facing + (rnd() - 0.5) * 0.3, phase: s.phase / (Math.PI * 2),
          clip: rnd() < 0.12 ? CLIP.idle : CLIP.walk, color: tint,
        }));
        for (let i = 0; i < n; i++) built.mesh.setMatrixAt(i, hidden);
        built.mesh.instanceMatrix.needsUpdate = true;
        group.add(soldierMesh(kit, spots, groundHeight));
      }
    },
    dispose() { kit?.dispose(); },
  };
}
