import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../sky/rng';
import { groundHeight } from '../stage-math';
import { dressingLayout } from './dressing-layout';
import { canvasTexture, fxLayer, type Part, type SceneContext } from './effects';

/** A clump of grass blades on a transparent canvas: a few dozen leaning blades tapering to a point. */
function grassTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g, w, h) => {
    const rnd = mulberry32(5);
    for (let i = 0; i < 26; i++) {
      const x = w * (0.12 + rnd() * 0.76);
      const lean = (rnd() - 0.5) * w * 0.34;
      const top = h * (0.08 + rnd() * 0.5);
      g.fillStyle = `hsl(${52 + rnd() * 18}, ${28 + rnd() * 22}%, ${34 + rnd() * 26}%)`;
      g.beginPath();
      g.moveTo(x - 3, h);
      g.quadraticCurveTo(x + lean * 0.4, h * 0.55, x + lean, top);
      g.quadraticCurveTo(x + lean * 0.5 + 3, h * 0.55, x + 3, h);
      g.fill();
    }
  });
}

/**
 * Grass tufts and rocks over the open ground beyond the field, so the plain is not a flat brown sheet. The tufts are crossed
 * alpha-cut planes and live on the effect layer (see FX_LAYER); the rocks are ordinary solid meshes.
 */
export function createDressing(ctx: SceneContext): Part {
  const group = new THREE.Group();
  const rnd = mulberry32(99);
  const d = new THREE.Object3D();
  const tint = new THREE.Color();

  const blade = new THREE.PlaneGeometry(1.5, 1.2).translate(0, 0.6, 0);
  const cross = mergeGeometries([blade, blade.clone().rotateY(Math.PI / 2)])!;
  const tuftSpots = dressingLayout(ctx.quality.tufts, 3);
  const tufts = fxLayer(new THREE.InstancedMesh(
    cross,
    new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, metalness: 0 }),
    tuftSpots.length,
  ));
  tufts.name = 'tufts';
  tuftSpots.forEach((s, i) => {
    d.position.set(s.x, groundHeight(s.x, s.z) - 0.05, s.z);
    d.rotation.set(0, s.turn, 0);
    d.scale.set(s.scale, s.scale * (0.7 + rnd() * 0.7), s.scale);
    d.updateMatrix();
    tufts.setMatrixAt(i, d.matrix);
    tufts.setColorAt(i, tint.setHSL(0.13 + rnd() * 0.05, 0.25 + rnd() * 0.2, 0.55 + rnd() * 0.3));
  });
  tufts.frustumCulled = false;
  group.add(tufts);

  const rockSpots = dressingLayout(ctx.quality.rocks, 11);
  const rocks = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, flatShading: true }),
    rockSpots.length,
  );
  rocks.name = 'rocks';
  rockSpots.forEach((s, i) => {
    d.position.set(s.x, groundHeight(s.x, s.z) + 0.1 * s.scale, s.z);
    d.rotation.set(rnd() * 0.6, s.turn, rnd() * 0.6);
    d.scale.set(s.scale * (0.8 + rnd() * 0.9), s.scale * (0.4 + rnd() * 0.5), s.scale * (0.8 + rnd() * 0.9));
    d.updateMatrix();
    rocks.setMatrixAt(i, d.matrix);
    rocks.setColorAt(i, tint.setHSL(0.07 + rnd() * 0.04, 0.12 + rnd() * 0.1, 0.32 + rnd() * 0.18));
  });
  rocks.frustumCulled = false;
  group.add(rocks);

  return {
    object: group,
    update() { /* still */ },
    dispose() {
      for (const m of [tufts, rocks]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); m.dispose(); }
    },
  };
}
