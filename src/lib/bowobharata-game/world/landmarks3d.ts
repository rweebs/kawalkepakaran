// The field's landmarks, built once: Sanjaya's tower, the Pandawa camp, the Hastinapura gate, the two groves, the six
// watch posts and the rock clusters, each on its collider in world.ts. Up to CLEAR over the ground nothing reaches past its
// collider, so the chariot, which the contacts keep off the colliders, never runs through a landmark: only the banners and
// the trees' crowns reach further, higher up. No text: the banners' emblems are drawn as shapes.
import * as THREE from 'three';
import { groundHeight } from '../../bowobharata/stage-math';
import { canvasTexture, glowSprite, wavingCloth } from '../../bowobharata/scene/effects';
import { mulberry32 } from '../../sky/rng';
import { yawOf, type XZ } from '../geom';
import { ANCHORS, POSTS, ROCKS, TENTS, TREES, staticColliders, type Collider } from '../world';
import { disposeGroup } from './dispose';
import { at, bake, merge } from './shapes';
import type { SceneGame } from './types';

/** Metres over the ground up to which a landmark keeps inside its collider: the drivable chariot's crest is at 3.68. */
export const CLEAR = 4;
/** The banners stream north on the wind, so each shows its emblem east and west, the camp's toward its open east side. */
const WIND_YAW = Math.PI / 2;

const COLOR = {
  wood: '#6b4a2e',
  thatch: '#5a2c20',
  lamp: '#ffd08a',
  canvas: '#d9c9a5',
  saffron: '#b8682a',
  pole: '#4a3322',
  door: '#2b1d15',
  brick: '#8e4b34',
  andesite: '#5e5a55',
  bark: '#4a3526',
  leaves: ['#34472a', '#3d5530', '#476136'],
  iron: '#3a3c40',
} as const;

type Box = Extract<Collider, { kind: 'box' }>;
type Rect = Pick<Box, 'minX' | 'maxX' | 'minZ' | 'maxZ'>;

const std = (color: string, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
const ground = (p: XZ) => groundHeight(p.x, p.z);

/** Colours every vertex of a part, for meshes that merge parts of several colours under one material. */
function paint(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rgb.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
  return geo;
}

// ------------------------------------------------------------ Sanjaya's tower

/** The tower's legs: `spread` m from its centre on each axis at their middle, `mid` m up; `length` m long; leaning in `lean` rad. */
const LEGS = { spread: 1.4, mid: 3.85, length: 8.5, lean: 0.03 } as const;

/** Four legs leaning in, two rings of braces, the platform at 6 m and its parapet. At the feet it reaches 2.35 m out. */
function towerFrame(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const legAt = (y: number) => LEGS.spread - (y - LEGS.mid) * Math.tan(LEGS.lean);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.13, 0.19, LEGS.length, 6);
      parts.push(bake(leg, at(sx * LEGS.spread, LEGS.mid, sz * LEGS.spread, -sz * LEGS.lean, sx * LEGS.lean)));
    }
  }
  for (const y of [2, 4.3]) {
    const w = legAt(y);
    for (const s of [-1, 1]) {
      parts.push(bake(new THREE.BoxGeometry(2 * w, 0.14, 0.14), at(0, y, s * w)));
      parts.push(bake(new THREE.BoxGeometry(0.14, 0.14, 2 * w), at(s * w, y, 0)));
    }
  }
  parts.push(bake(new THREE.BoxGeometry(3.4, 0.28, 3.4), at(0, 6, 0)));
  for (const s of [-1, 1]) {
    parts.push(bake(new THREE.BoxGeometry(3.4, 0.56, 0.08), at(0, 6.42, s * 1.66)));
    parts.push(bake(new THREE.BoxGeometry(0.08, 0.56, 3.24), at(s * 1.66, 6.42, 0)));
  }
  return merge(parts)!;
}

/** A two-tiered pyramid roof on the legs' tops, and a finial. */
function towerRoof(): THREE.BufferGeometry {
  return merge([
    bake(new THREE.ConeGeometry(2.6, 1.15, 4, 1, false, Math.PI / 4), at(0, 8.675, 0)),
    bake(new THREE.ConeGeometry(1.55, 1.25, 4, 1, false, Math.PI / 4), at(0, 9.675, 0)),
    bake(new THREE.ConeGeometry(0.1, 0.7, 6), at(0, 10.6, 0)),
  ])!;
}

// ------------------------------------------------------------ the camp

/** A six-sided canvas wall under a saffron roof, a finial, and a dark door on its +x face. 2.15 m at its widest. */
function tentGeo(): THREE.BufferGeometry {
  return merge([
    paint(bake(new THREE.CylinderGeometry(2, 2, 1.5, 6, 1, true), at(0, 0.45, 0)), COLOR.canvas),
    paint(bake(new THREE.ConeGeometry(2.15, 1.9, 6), at(0, 2.1, 0)), COLOR.saffron),
    paint(bake(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 4), at(0, 3.35, 0)), COLOR.pole),
    paint(bake(new THREE.BoxGeometry(0.06, 1.15, 0.9), at(1.76, 0.55, 0)), COLOR.door),
  ])!;
}

/** The camp's banner: saffron edged in maroon, with the dharma wheel (rim, hub and eight spokes) in indigo. */
function dharmaWheelBanner(): THREE.CanvasTexture {
  return canvasTexture(128, 80, (g, w, h) => {
    g.fillStyle = '#d98b2b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#6e2216';
    g.fillRect(0, 0, w, 7);
    g.fillRect(0, h - 7, w, 7);
    const cx = w * 0.55;
    const cy = h / 2;
    g.strokeStyle = '#25306b';
    g.fillStyle = '#25306b';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(cx, cy, 24, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
      g.lineTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24);
      g.stroke();
    }
    g.beginPath();
    g.arc(cx, cy, 7, 0, Math.PI * 2);
    g.fill();
  });
}

// ------------------------------------------------------------ the gate

/** The pylons' tiers: each steps in by `inset` (m) on its sides and back, never from the opening, and ends `top` m up. */
const PYLON = [
  { inset: 0, top: 2.8 },
  { inset: 0.3, top: 4.6 },
  { inset: 0.6, top: 6.1 },
  { inset: 0.9, top: 7.3 },
  { inset: 1.2, top: 8.3 },
] as const;
/** A course of andesite over each tier (m). */
const BAND = 0.15;
/** The walls' top over the ground at the gate's centre, and their andesite coping (m). */
const WALL = { top: 2.6, coping: 0.25 } as const;

/** The lowest ground under a footprint, sampled every metre or so, edges included. */
function lowestUnder(b: Rect): number {
  let least = Infinity;
  const nx = Math.max(1, Math.ceil(b.maxX - b.minX));
  const nz = Math.max(1, Math.ceil(b.maxZ - b.minZ));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) least = Math.min(least, groundHeight(b.minX + ((b.maxX - b.minX) * i) / nx, b.minZ + ((b.maxZ - b.minZ) * j) / nz));
  }
  return least;
}

/**
 * The Hastinapura gate as a split gate (candi bentar) of red brick, built on world.ts's gate boxes, relative to the ground
 * at the gate's centre (`base`): each pylon a stack of tiers stepping in toward its sheer face on the opening, banded in
 * andesite under a pyramid; the walls with their coping. Nothing spans the opening.
 */
function gateGeo(boxes: readonly Box[], base: number): THREE.BufferGeometry {
  const g = ANCHORS.gate;
  const parts: THREE.BufferGeometry[] = [];
  const block = (r: Rect, y0: number, y1: number, color: string) =>
    paint(bake(new THREE.BoxGeometry(r.maxX - r.minX, y1 - y0, r.maxZ - r.minZ), at((r.minX + r.maxX) / 2 - g.x, (y0 + y1) / 2, (r.minZ + r.maxZ) / 2 - g.z)), color);
  for (const b of boxes) {
    const footing = lowestUnder(b) - base - 0.3;
    if (b.id.includes('wall')) {
      parts.push(block(b, footing, WALL.top, COLOR.brick), block(b, WALL.top, WALL.top + WALL.coping, COLOR.andesite));
      continue;
    }
    // The walls run north and south (world.ts), so the opening lies north or south of a pylon, toward the gate's centre:
    // the tiers keep that face sheer and step in from the other three.
    const sheer = g.z > b.maxZ ? b.maxZ : b.minZ;
    const back = sheer === b.maxZ ? -1 : 1;
    const cx = (b.minX + b.maxX) / 2;
    const half = (b.maxX - b.minX) / 2;
    const depth = b.maxZ - b.minZ;
    let y = footing;
    let top: Rect = b;
    for (const t of PYLON) {
      const far = sheer + back * (depth - t.inset);
      top = { minX: cx - half + t.inset, maxX: cx + half - t.inset, minZ: Math.min(sheer, far), maxZ: Math.max(sheer, far) };
      parts.push(block(top, y, t.top, COLOR.brick), block(top, t.top, t.top + BAND, COLOR.andesite));
      y = t.top + BAND;
    }
    // A square pyramid as wide as the last tier allows, centred on it.
    const r = Math.min(top.maxX - top.minX, top.maxZ - top.minZ) / 2;
    const cap = new THREE.ConeGeometry(r * Math.SQRT2, 1.6, 4, 1, false, Math.PI / 4);
    parts.push(paint(bake(cap, at(cx - g.x, y + 0.8, (top.minZ + top.maxZ) / 2 - g.z)), COLOR.andesite));
  }
  return merge(parts)!;
}

// ------------------------------------------------------------ the groves, the posts and the rocks

/** A grove tree: a bare trunk up to CLEAR, then three stacked cones, slim enough that the chase camera passes them. */
function treeGeo(): THREE.BufferGeometry {
  return merge([
    paint(bake(new THREE.CylinderGeometry(0.22, 0.38, 4.7, 7), at(0, 2.05, 0)), COLOR.bark),
    paint(bake(new THREE.ConeGeometry(1.8, 3.2, 7), at(0, 5.8, 0)), COLOR.leaves[0]),
    paint(bake(new THREE.ConeGeometry(1.4, 2.8, 7), at(0, 7.4, 0)), COLOR.leaves[1]),
    paint(bake(new THREE.ConeGeometry(0.95, 2.4, 7), at(0, 9, 0)), COLOR.leaves[2]),
  ])!;
}

/** A watch post: a stone footing, a pole and a finial. Its banner hangs from the pole, 4.3 to 5.2 m up. 0.44 m at its widest. */
function postGeo(): THREE.BufferGeometry {
  return merge([
    bake(new THREE.BoxGeometry(0.62, 0.5, 0.62), at(0, 0.05, 0)),
    bake(new THREE.CylinderGeometry(0.08, 0.12, 5.4, 6), at(0, 2.6, 0)),
    bake(new THREE.ConeGeometry(0.15, 0.4, 6), at(0, 5.5, 0)),
  ])!;
}

/** A watch post's banner: grey, with the broken ring (a circle with a gap) in a darker grey. */
function brokenRingBanner(): THREE.CanvasTexture {
  return canvasTexture(128, 80, (g, w, h) => {
    g.fillStyle = '#8a8d90';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#4c4f53';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(w * 0.55, h / 2, 22, 0.3 * Math.PI, 1.85 * Math.PI);
    g.stroke();
  });
}

/**
 * Adds the landmarks to the game's root. Named: `tower` (its frame and roof, two merged meshes, and its lamp), `tents`,
 * `camp-poles`, two `camp-banner`s, `gate`, `trees`, `posts`, `post-banners` and `rocks`: 12 draw calls. The banners wave
 * on the scene's clock.
 */
export function createLandmarks(game: SceneGame): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  group.name = 'landmarks';
  const rnd = mulberry32(18);
  const d = new THREE.Object3D();
  const tint = new THREE.Color();
  const uTime = { value: 0 };
  const stopClock = game.onFrame((time) => { uTime.value = time; });
  const wood = std(COLOR.wood, 0.85, { flatShading: true });
  const painted = (roughness: number) => std('#ffffff', roughness, { vertexColors: true, flatShading: true });
  const place = (mesh: THREE.InstancedMesh, k: number, p: XZ, y: number, turn: number, sx = 1, sy = 1, sz = sx) => {
    d.position.set(p.x, y, p.z);
    d.rotation.set(0, turn, 0);
    d.scale.set(sx, sy, sz);
    d.updateMatrix();
    mesh.setMatrixAt(k, d.matrix);
  };

  // Sanjaya's tower: the frame and the roof, and the lamp under the roof.
  const tower = new THREE.Group();
  tower.name = 'tower';
  tower.position.set(ANCHORS.tower.x, ground(ANCHORS.tower), ANCHORS.tower.z);
  const frame = new THREE.Mesh(towerFrame(), wood);
  frame.name = 'tower-frame';
  const roof = new THREE.Mesh(towerRoof(), std(COLOR.thatch, 0.9, { flatShading: true }));
  roof.name = 'tower-roof';
  const lamp = glowSprite(game.textures.glow, COLOR.lamp, 2.4, 0.85);
  lamp.name = 'tower-lamp';
  lamp.position.set(0, 6.9, 0);
  tower.add(frame, roof, lamp);

  // The camp: five tents, their doors to the camp's centre; banners on poles rising out of the two by its open east side.
  const tents = new THREE.InstancedMesh(tentGeo(), painted(0.9), TENTS.length);
  tents.name = 'tents';
  TENTS.forEach((t, k) => {
    place(tents, k, t, ground(t), yawOf({ x: ANCHORS.camp.x - t.x, z: ANCHORS.camp.z - t.z }));
    const v = 0.9 + rnd() * 0.14;
    tents.setColorAt(k, tint.setRGB(v, v, v * 0.97));
  });
  const flanking = [...TENTS].sort((a, b) => b.x - a.x).slice(0, 2);
  const poles = new THREE.Mesh(
    merge(flanking.flatMap((t) => [
      bake(new THREE.CylinderGeometry(0.05, 0.06, 4.6, 5), at(t.x, ground(t) + 4.9, t.z)),
      bake(new THREE.ConeGeometry(0.1, 0.3, 6), at(t.x, ground(t) + 7.35, t.z)),
    ]))!,
    wood,
  );
  poles.name = 'camp-poles';
  const dharmaTex = dharmaWheelBanner();
  const campCloth = wavingCloth(dharmaTex, 1.6, 1, uTime);
  const campBanners = flanking.map((t) => {
    const b = new THREE.Mesh(campCloth.geometry, campCloth.material);
    b.name = 'camp-banner';
    b.position.set(t.x, ground(t) + 6.6, t.z);
    b.rotation.y = WIND_YAW;
    return b;
  });

  // The gate, one merged mesh on the gate's boxes.
  const gateBoxes = staticColliders().filter((c): c is Box => c.kind === 'box' && c.id.startsWith('gate-'));
  const gateBase = ground(ANCHORS.gate);
  const gate = new THREE.Mesh(gateGeo(gateBoxes, gateBase), painted(0.92));
  gate.name = 'gate';
  gate.position.set(ANCHORS.gate.x, gateBase, ANCHORS.gate.z);

  // The groves.
  const trees = new THREE.InstancedMesh(treeGeo(), painted(0.9), TREES.length);
  trees.name = 'trees';
  TREES.forEach((t, k) => {
    place(trees, k, t, ground(t), rnd() * Math.PI * 2, 0.92 + rnd() * 0.12, 0.98 + rnd() * 0.14);
    const v = 0.85 + rnd() * 0.25;
    trees.setColorAt(k, tint.setRGB(v * (0.92 + rnd() * 0.16), v, v * (0.9 + rnd() * 0.12)));
  });

  // The watch posts and their grey banners.
  const posts = new THREE.InstancedMesh(postGeo(), std(COLOR.iron, 0.7, { flatShading: true }), POSTS.length);
  posts.name = 'posts';
  const ringTex = brokenRingBanner();
  const postCloth = wavingCloth(ringTex, 1.3, 0.9, uTime);
  const postBanners = new THREE.InstancedMesh(postCloth.geometry, postCloth.material, POSTS.length);
  postBanners.name = 'post-banners';
  POSTS.forEach((p, k) => {
    place(posts, k, p, ground(p), rnd() * Math.PI);
    place(postBanners, k, p, ground(p) + 4.75, WIND_YAW + (rnd() - 0.5) * 0.4);
  });

  // The rock clusters: each rock within its collider's radius, sunk a little.
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), std('#ffffff', 0.95, { flatShading: true }), ROCKS.length);
  rocks.name = 'rocks';
  ROCKS.forEach((rock, k) => {
    place(rocks, k, rock.at, ground(rock.at) - 0.12 * rock.r, rnd() * Math.PI * 2, 0.94 * rock.r, (0.5 + rnd() * 0.2) * rock.r, 0.9 * rock.r);
    rocks.setColorAt(k, tint.setHSL(0.07 + rnd() * 0.04, 0.12 + rnd() * 0.1, 0.32 + rnd() * 0.18));
  });

  group.add(tower, tents, poles, ...campBanners, gate, trees, posts, postBanners, rocks);
  game.root.add(group);

  return {
    group,
    dispose() {
      stopClock();
      game.root.remove(group);
      disposeGroup(group);
      // The emblems are this layer's own textures; the lamp's glow is the scene's.
      dharmaTex.dispose();
      ringTex.dispose();
    },
  };
}
