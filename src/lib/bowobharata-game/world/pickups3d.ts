// The lakon's targets in the scene, drawn each frame from the engine's state, with no text (F2: arrows 2.2 times their
// size in a light material, and records under gold beams that the high chase camera sees from far off).
// - The prologue's records are arrows standing in the ground; a parva's are lontar on posts. Gold beams mark only these,
//   the player's real records.
// - The rewritten copies are grey, frayed and shimmering: a game device that stands for no particular page.
// - Mata shows a lotus over each record and a broken ring over each copy, both shapes.
// - A lotus ring under an amber beam marks where a lakon starts; a blue-white beam and the record circle mark Sanjaya's
//   tower, the hub; the finale lights 24 lamps round it.
// Nothing is drawn hitting anyone: a recorded arrow fades where it stands, and only the player's own record, a lontar,
// lifts and flies to the prabha.
import * as THREE from 'three';
import { groundHeight } from '../../bowobharata/stage-math';
import { fxLayer, glowSprite } from '../../bowobharata/scene/effects';
import { angleDiff, clamp, smoothstep, type XZ } from '../geom';
import type { ChariotState } from '../drive';
import type { GameState } from '../engine';
import { openTargets, type Decoy } from '../mission-run';
import type { MissionDef, PickupDef } from '../missions';
import { ANCHORS, RECORD_CIRCLE } from '../world';
import { brokenRingGeo, decoyFletchGeo, decoyShaftGeo, lotusGeo, merge, realShaftGeo, realTipGeo } from './shapes';
import type { Layer, SceneGame } from './types';

/** The copies' shimmer: their opacity swings base ± amp at hz, under the 2 Hz that comfort allows. */
export const SHIMMER = { hz: 1.2, base: 0.75, amp: 0.12 } as const;

/** The copies' opacity at scene time t (s). */
export function shimmerAt(t: number): number {
  return SHIMMER.base + SHIMMER.amp * Math.sin(2 * Math.PI * SHIMMER.hz * t);
}

/**
 * Seconds a record takes to go once recorded (a prologue arrow fading where it stands, a lontar flying to the prabha), and
 * a copy to fade in or out: longer than a half cycle at 2 Hz.
 */
const FADE = 0.4;
/**
 * Records and copies stand 2.2 times their modelled size, the tail leaning 25° off the vertical toward the Kurawa side
 * (east), as if they came in from there, give or take `spread` rad. A record's tip is `sink` m into the ground.
 */
const ARROW = { scale: 2.2, tilt: (25 * Math.PI) / 180, spread: 0.5, sink: 0.25 } as const;
/**
 * In the shapes' units: from their origin to where an arrow enters the ground (a record's tip ends 0.72 up, shapes.ts, and
 * sinks ARROW.sink; a copy has no head, and its splinters straddle the ground), and from there up to the tail's end.
 */
const ENTRY = { record: 0.72 - ARROW.sink / ARROW.scale, copy: 0.45 } as const;
const TAIL = { record: ENTRY.record + 0.53, copy: ENTRY.copy + 0.5 } as const;
/** A lontar: a box w × h × d (m) on a post; a recorded one rises `lift` m before it flies. */
const LONTAR = { w: 0.9, h: 0.12, d: 0.25, post: 1.1, lift: 2 } as const;
/**
 * Where a recorded lontar flies, in the chariot's frame (m ahead of its origin, m over the ground under it). The prabha is
 * centred 0.45 m ahead and 3.05 m up (Krishna stands 0.55 m ahead on the 1.3 m deck, the prabha at (−0.1, 1.75) in his
 * group, scene/chariot.ts), right behind his head; the lontar ends `over` m above that centre, at the top of its glow and
 * clear of the riders' tops (CHARIOT_SILHOUETTE: 3.68 m at most), so it never passes through anyone.
 */
const PRABHA = { ahead: 0.45, up: 3.05, over: 0.8 } as const;
/**
 * The flight, in fractions of FADE: the rise takes `rise`, then a curve from the top of the rise comes down on the prabha
 * from `arc` m above it, the lontar shrinking to `end` of its size. One recorded more than `reach` m from the prabha (the
 * skip records far ones) rises and fades where it stands instead of crossing the field.
 */
const FLIGHT = { rise: 0.35, arc: 1, end: 0.3, reach: 12 } as const;
/**
 * The beams (m). The shaft texture is brightest 35% down from its top and fades out at both ends, so a record's or the
 * marker's beam stands `sunk` m into the ground: brightest 9.5 m up, still half as bright at its foot. The tower's rises
 * from the ground, brightest well above the roof.
 */
const BEAM = { w: 1.4, h: 30, sunk: 10, tower: { w: 2, h: 36 } } as const;
const MARKER = { r: 5, petals: 8 } as const;
const LAMPS = { count: 24, r: 6 } as const;
/**
 * Halos are additive glow sprites, so phones without bloom still read them: size (m), opacity, and height over a record
 * arrow's entry point or a lamp (m).
 */
const HALO = { size: 1.8, opacity: 0.55, up: 0.45, lamp: { size: 1.3, opacity: 0.7, up: 0.25 } } as const;
/** Stamps: their size against the shapes', and how far above what they stamp (m). */
const STAMP = { scale: 2.6, over: 0.9 } as const;
/** Rings lie this far over the ground (m), clear of the terrain mesh between its vertices. */
const LIFT = 0.12;
/** The most records a lakon draws (the largest lays out 9) and copies (a lakon lays out 4 at most; volleys add some). */
const CAP = { records: 16, copies: 64 } as const;
/** Spreads the arrows' leans from one to the next. */
const GOLDEN = 2.399963229728653;

const COLOR = {
  shaft: '#f2deaa',
  shaftGlow: '#b8862e',
  tip: '#fff1c4',
  tipGlow: '#ffc24a',
  leaf: '#e9cf8f',
  leafGlow: '#a8782a',
  post: '#5b3a1e',
  copy: '#d6d9de',
  copyGlow: '#9aa0aa',
  lotus: '#ffd36b',
  ring: '#b9bcc0',
  gold: '#ffd98a',
  amber: '#ffb84a',
  tower: '#cfe3ff',
  halo: '#ffd27a',
  clay: '#9a4e2c',
  flame: '#ffd27a',
  lamp: '#ffb347',
} as const;

/** One record of the lakon, laid out when the lakon starts: where and how it stands, and how it goes once recorded. */
interface RecordSlot {
  id: string;
  at: XZ;
  lontar: boolean;
  /** The arrow's pose, or the lontar's box's and its post's; the yaw the box lies at. */
  pose: THREE.Matrix4;
  post: THREE.Matrix4;
  yaw: number;
  /** Where its halo hangs (a lontar's: on the box), its stamp floats and its beam stands. */
  halo: THREE.Vector3;
  stamp: THREE.Vector3;
  beam: THREE.Vector3;
  /** Drawn at some sync of this lakon and not gone yet. */
  out: boolean;
  /** Scene time it was recorded; NaN while open. */
  recordedAt: number;
  /** A lontar the chariot came by flies to the prabha, from `from` in the chariot's frame (ahead, right, up). */
  flies: boolean;
  from: { a: number; c: number; h: number };
}

type Targets = ReturnType<typeof openTargets>;

/** Every record a lakon lays out, in step order: the collect steps' pickups, and a lap course's record (Task 31). */
function pickupsOf(def: MissionDef): PickupDef[] {
  return def.steps.flatMap((s) => (s.kind === 'collect' ? s.items : s.kind === 'laps' ? [s.then] : []));
}

function hasPickup(targets: Targets, id: string): boolean {
  for (let i = 0; i < targets.length; i++) if (targets[i].kind === 'pickup' && targets[i].id === id) return true;
  return false;
}

function markerIn(targets: Targets): XZ | null {
  for (let i = 0; i < targets.length; i++) if (targets[i].kind === 'marker') return targets[i].at;
  return null;
}

/**
 * Lets each instance fade on its own: the geometry's instanced `aFade` (0 to 1) multiplies the material's alpha. Every
 * geometry drawn with such a material carries the attribute.
 */
function fading<T extends THREE.Material>(mat: T): T {
  mat.transparent = true;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  mat.customProgramCacheKey = () => 'pickup-fade';
  return mat;
}

/** Lays a shape made flat round the origin over the ground at (x, z): each vertex keeps its height over the ground under it, plus LIFT. */
function drape(pos: THREE.BufferAttribute, flat: ArrayLike<number>, x: number, z: number): void {
  const base = groundHeight(x, z);
  for (let i = 0; i < pos.count; i++) {
    const vx = flat[i * 3];
    const vy = flat[i * 3 + 1];
    const vz = flat[i * 3 + 2];
    pos.setXYZ(i, vx, vy + groundHeight(x + vx, z + vz) - base + LIFT, vz);
  }
  pos.needsUpdate = true;
}

/**
 * The lakon's marker: a flattened torus of r MARKER.r lying on the ground, with MARKER.petals flat petals pointing out from
 * it. Both are thinner than twice LIFT, so no part dips into the ground.
 */
function markerGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(MARKER.r, 0.14, 4, 96).rotateX(Math.PI / 2).scale(1, 0.3, 1)];
  for (let k = 0; k < MARKER.petals; k++) {
    const a = (k / MARKER.petals) * Math.PI * 2;
    const petal = new THREE.ConeGeometry(0.42, 1.3, 4).rotateZ(-Math.PI / 2).scale(1, 0.15, 1).rotateY(-a);
    parts.push(petal.translate(Math.cos(a) * (MARKER.r + 0.65), 0, Math.sin(a) * (MARKER.r + 0.65)));
  }
  return merge(parts)!;
}

/**
 * Adds the lakon's targets to the game's root, under a `pickups` group, all drawn from `sync`:
 * - `record-arrows` with `record-arrow-tips`, `lontar` with `lontar-posts`, and a `record-halo` sprite on each record;
 * - `record-beams` over them; `decoys`; `stamp-lotus` and `stamp-ring` while sight is on;
 * - `marker-ring` and `marker-beam`; and, always, `tower-beam` and `record-circle`.
 * `setFinale(true)` shows the finale's `lamps`, `lamp-flames` and `lamp-halo`s and hides the lakon's targets.
 */
export function createPickups(game: SceneGame): Layer & { setFinale(on: boolean): void } {
  const group = new THREE.Group();
  group.name = 'pickups';
  // The lakon's targets (hidden in the finale) and the finale's lamps (hidden until then).
  const play = new THREE.Group();
  play.name = 'pickups-play';
  const finale = new THREE.Group();
  finale.name = 'finale-lamps';
  finale.visible = false;
  group.add(play, finale);
  game.root.add(group);

  // Scratch, reused every frame.
  const m4 = new THREE.Matrix4();
  const spot = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const dir = new THREE.Vector3();
  const down = new THREE.Vector3();
  const size = new THREE.Vector3();
  const tint = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0);
  const ONE = new THREE.Vector3(1, 1, 1);
  const ARROW_SIZE = new THREE.Vector3().setScalar(ARROW.scale);
  const STAMP_SIZE = new THREE.Vector3().setScalar(STAMP.scale);
  const GOLD = new THREE.Color(COLOR.gold);

  function instanced(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, parent: THREE.Object3D): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.name = name;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  }
  /** Gives a geometry its per-instance opacity, or another's to share. */
  function fadeOn(geo: THREE.BufferGeometry, cap: number, shared?: THREE.InstancedBufferAttribute): THREE.InstancedBufferAttribute {
    const attr = shared ?? new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    geo.setAttribute('aFade', attr);
    return attr;
  }
  const lit = (color: string, glow: string, glowK: number, roughness: number, metalness = 0) =>
    fading(new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: glowK, roughness, metalness }));
  /** An additive glow: beams (with the shaft texture) and the rings on the ground. Fog off, so it reads across the field. */
  const glowMat = (color: string, opacity: number, map: THREE.Texture | null = null) =>
    new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

  // The prologue's arrows, shaft and tip, moved so that where they enter the ground is the origin; light and lit from within.
  const shaftGeo = realShaftGeo().translate(0, -ENTRY.record, 0);
  const tipGeo = realTipGeo().translate(0, -ENTRY.record, 0);
  const arrowFade = fadeOn(shaftGeo, CAP.records);
  fadeOn(tipGeo, CAP.records, arrowFade);
  const arrows = instanced('record-arrows', shaftGeo, lit(COLOR.shaft, COLOR.shaftGlow, 0.45, 0.45, 0.15), CAP.records, play);
  const tips = instanced('record-arrow-tips', tipGeo, lit(COLOR.tip, COLOR.tipGlow, 1.6, 0.3), CAP.records, play);

  // A parva's lontar: the box, and the post it lies on.
  const leafGeo = new THREE.BoxGeometry(LONTAR.w, LONTAR.h, LONTAR.d);
  const postGeo = new THREE.CylinderGeometry(0.045, 0.06, LONTAR.post, 6).translate(0, LONTAR.post / 2, 0);
  const leafFade = fadeOn(leafGeo, CAP.records);
  const postFade = fadeOn(postGeo, CAP.records);
  const leaves = instanced('lontar', leafGeo, lit(COLOR.leaf, COLOR.leafGlow, 0.4, 0.7), CAP.records, play);
  const posts = instanced('lontar-posts', postGeo, fading(new THREE.MeshStandardMaterial({ color: COLOR.post, roughness: 0.85, metalness: 0 })), CAP.records, play);

  const halos = Array.from({ length: CAP.records }, () => {
    const s = glowSprite(game.textures.glow, COLOR.halo, HALO.size, 0);
    s.name = 'record-halo';
    s.visible = false;
    s.renderOrder = 1;
    play.add(s);
    return s;
  });

  // The copies: the frayed shaft and the curled fletching in one mesh, the splinters at the ground.
  const copyGeo = merge([decoyShaftGeo(), decoyFletchGeo()])!.translate(0, -ENTRY.copy, 0);
  const copyFade = fadeOn(copyGeo, CAP.copies);
  const copyMat = lit(COLOR.copy, COLOR.copyGlow, 0.6, 0.9);
  copyMat.opacity = SHIMMER.base;
  const copies = instanced('decoys', copyGeo, copyMat, CAP.copies, play);

  // Mata's stamps.
  const lotus = fxLayer(instanced('stamp-lotus', lotusGeo(), new THREE.MeshBasicMaterial({ color: COLOR.lotus, toneMapped: false }), CAP.records, play));
  const rings = fxLayer(instanced('stamp-ring', brokenRingGeo(), new THREE.MeshBasicMaterial({ color: COLOR.ring, toneMapped: false }), CAP.copies, play));

  // The beams over the records, each turned to the camera about the vertical; tinted gold (fading with their records).
  const beamGeo = new THREE.PlaneGeometry(BEAM.w, BEAM.h);
  const beams = fxLayer(instanced('record-beams', beamGeo, glowMat('#ffffff', 0.8, game.textures.shaft), CAP.records, play));
  beams.renderOrder = 1;
  for (let k = 0; k < CAP.records; k++) beams.setColorAt(k, GOLD); // the colour buffer now, never in a frame
  const beamAt = new Float64Array(CAP.records * 3);

  // The marker: the lotus ring, laid over the ground wherever the lakon starts, and its amber beam.
  const ringGeo = markerGeo();
  const ringPos = ringGeo.getAttribute('position') as THREE.BufferAttribute;
  const ringFlat = Float32Array.from(ringPos.array as ArrayLike<number>);
  const markerRing = fxLayer(new THREE.Mesh(ringGeo, glowMat(COLOR.amber, 0.85)));
  markerRing.name = 'marker-ring';
  markerRing.visible = false;
  markerRing.frustumCulled = false;
  markerRing.renderOrder = 1;
  const markerBeam = fxLayer(new THREE.Mesh(beamGeo, glowMat(COLOR.amber, 0.8, game.textures.shaft)));
  markerBeam.name = 'marker-beam';
  markerBeam.visible = false;
  markerBeam.renderOrder = 1;
  play.add(markerRing, markerBeam);
  let markerX = NaN;
  let markerZ = NaN;

  // Sanjaya's tower: its blue-white beam, and the record circle where a lakon's records are delivered.
  const tower = ANCHORS.tower;
  const towerGround = groundHeight(tower.x, tower.z);
  const towerBeam = fxLayer(new THREE.Mesh(new THREE.PlaneGeometry(BEAM.tower.w, BEAM.tower.h), glowMat(COLOR.tower, 0.6, game.textures.shaft)));
  towerBeam.name = 'tower-beam';
  towerBeam.position.set(tower.x, towerGround + BEAM.tower.h / 2, tower.z);
  towerBeam.renderOrder = 1;
  const circleGeo = new THREE.TorusGeometry(RECORD_CIRCLE, 0.16, 4, 144).rotateX(Math.PI / 2).scale(1, 0.3, 1);
  const circlePos = circleGeo.getAttribute('position') as THREE.BufferAttribute;
  drape(circlePos, circlePos.array as ArrayLike<number>, tower.x, tower.z);
  const recordCircle = fxLayer(new THREE.Mesh(circleGeo, glowMat(COLOR.tower, 0.5)));
  recordCircle.name = 'record-circle';
  recordCircle.position.set(tower.x, towerGround, tower.z);
  recordCircle.frustumCulled = false;
  recordCircle.renderOrder = 1;
  group.add(towerBeam, recordCircle);

  // The finale: 24 clay lamps lit round the tower, each with its flame and its halo.
  const cups = instanced('lamps', new THREE.CylinderGeometry(0.16, 0.1, 0.09, 10).translate(0, 0.045, 0), new THREE.MeshStandardMaterial({ color: COLOR.clay, roughness: 0.9, metalness: 0 }), LAMPS.count, finale);
  const flames = instanced('lamp-flames', new THREE.ConeGeometry(0.045, 0.16, 6).translate(0, 0.17, 0), new THREE.MeshBasicMaterial({ color: COLOR.flame, toneMapped: false }), LAMPS.count, finale);
  for (let k = 0; k < LAMPS.count; k++) {
    const a = (k / LAMPS.count) * Math.PI * 2;
    const x = tower.x + LAMPS.r * Math.cos(a);
    const z = tower.z + LAMPS.r * Math.sin(a);
    const y = groundHeight(x, z);
    m4.makeTranslation(x, y, z);
    cups.setMatrixAt(k, m4);
    flames.setMatrixAt(k, m4);
    const halo = glowSprite(game.textures.glow, COLOR.lamp, HALO.lamp.size, HALO.lamp.opacity);
    halo.name = 'lamp-halo';
    halo.position.set(x, y + HALO.lamp.up, z);
    halo.renderOrder = 1;
    finale.add(halo);
  }
  for (const m of [cups, flames]) {
    m.count = LAMPS.count;
    m.visible = true;
  }

  // The lakon drawn: its records, and when each copy came out and went (scene time; −Infinity: out with the lakon).
  let lakon: MissionDef | null = null;
  let records: RecordSlot[] = [];
  /** The lakon's first sync: what is out then shows at once, under the cut into its intro. */
  let fresh = true;
  const copyIn = new Map<number, number>();
  const copyOut = new Map<number, number>();
  let clock = 0;

  /** The pose of an arrow standing in the ground at `at`, its tail leaning toward `lean`; leaves its entry point in `spot` and its tail's direction in `dir`. */
  function stand(out: THREE.Matrix4, at: XZ, lean: number): THREE.Matrix4 {
    const s = Math.sin(ARROW.tilt);
    dir.set(s * Math.cos(lean), Math.cos(ARROW.tilt), -s * Math.sin(lean));
    spot.set(at.x, groundHeight(at.x, at.z), at.z);
    // The shapes point their tip along +y: the other way from the tail, into the ground.
    turn.setFromUnitVectors(UP, down.copy(dir).negate());
    return out.compose(spot, turn, ARROW_SIZE);
  }

  function slotOf(p: PickupDef, k: number): RecordSlot {
    const g = groundHeight(p.at.x, p.at.z);
    const lean = ARROW.spread * Math.sin((k + 1) * GOLDEN);
    const slot: RecordSlot = {
      id: p.id,
      at: { x: p.at.x, z: p.at.z },
      lontar: p.visual === 'lontar',
      pose: new THREE.Matrix4(),
      post: new THREE.Matrix4(),
      yaw: lean,
      halo: new THREE.Vector3(),
      stamp: new THREE.Vector3(),
      beam: new THREE.Vector3(p.at.x, g - BEAM.sunk + BEAM.h / 2, p.at.z),
      out: false,
      recordedAt: NaN,
      flies: false,
      from: { a: 0, c: 0, h: 0 },
    };
    if (slot.lontar) {
      const mid = g + LONTAR.post + LONTAR.h / 2;
      turn.setFromAxisAngle(UP, lean);
      slot.pose.compose(spot.set(p.at.x, mid, p.at.z), turn, ONE);
      slot.post.compose(spot.set(p.at.x, g, p.at.z), turn, ONE);
      slot.halo.set(p.at.x, mid, p.at.z);
      slot.stamp.set(p.at.x, mid + LONTAR.h / 2 + STAMP.over, p.at.z);
    } else {
      stand(slot.pose, p.at, lean);
      slot.halo.set(p.at.x, g + HALO.up, p.at.z);
      slot.stamp.copy(spot).addScaledVector(dir, TAIL.record * ARROW.scale);
      slot.stamp.y += STAMP.over;
    }
    return slot;
  }

  /** A new lakon: its records laid out where they stand, the last one's fades forgotten. */
  function layOut(def: MissionDef): void {
    lakon = def;
    fresh = true;
    copyIn.clear();
    copyOut.clear();
    records = pickupsOf(def).slice(0, CAP.records).map(slotOf);
  }

  /** Where a lontar starts its flight, in the chariot's frame, and whether it flies (the chariot came by) or rises where it stands. */
  function takeOff(r: RecordSlot, car: ChariotState): void {
    const cos = Math.cos(car.yaw);
    const sin = Math.sin(car.yaw);
    const dx = r.at.x - car.x;
    const dz = r.at.z - car.z;
    // forward(yaw) = (cos, −sin) and rightOf(yaw) = (sin, cos).
    r.from.a = dx * cos - dz * sin;
    r.from.c = dx * sin + dz * cos;
    r.from.h = r.halo.y - groundHeight(car.x, car.z);
    r.flies = Math.hypot(r.from.a - PRABHA.ahead, r.from.c) <= FLIGHT.reach;
  }

  /** A recorded lontar u (0 to 1) of the way through its flight: its centre into `spot`; returns its size. */
  function flightAt(r: RecordSlot, u: number, car: ChariotState): number {
    const rose = 1 - (1 - Math.min(1, u / FLIGHT.rise)) ** 2;
    if (!r.flies) {
      spot.set(r.at.x, r.halo.y + LONTAR.lift * rose, r.at.z);
      return 1;
    }
    // In the chariot's frame, so the chariot never sweeps through it: up off the post, then a curve down onto the prabha
    // from above, over the horses and the riders.
    let a = r.from.a;
    let c = r.from.c;
    let h = r.from.h + LONTAR.lift * rose;
    let k = 1;
    if (u > FLIGHT.rise) {
      const v = smoothstep(FLIGHT.rise, 1, u);
      const end = PRABHA.up + PRABHA.over;
      const high = Math.max(h, end) + FLIGHT.arc;
      const w0 = (1 - v) * (1 - v);
      const w1 = 2 * v * (1 - v);
      const w2 = v * v;
      a = w0 * a + (w1 + w2) * PRABHA.ahead;
      c = w0 * c;
      h = w0 * h + w1 * high + w2 * end;
      k = 1 - (1 - FLIGHT.end) * v;
    }
    const cos = Math.cos(car.yaw);
    const sin = Math.sin(car.yaw);
    spot.set(car.x + a * cos + c * sin, groundHeight(car.x, car.z) + h, car.z - a * sin + c * cos);
    return k;
  }

  /** How much of a copy shows (0 to 1): it fades in when it comes out after the lakon began, and out once taken, filed or gone. */
  function copyLevel(d: Decoy, t: number): number {
    let since = copyIn.get(d.id);
    if (d.state === 'open') {
      if (since === undefined) {
        since = fresh ? -Infinity : t;
        copyIn.set(d.id, since);
      }
      return clamp((t - since) / FADE, 0, 1);
    }
    if (since === undefined) return 0;
    let went = copyOut.get(d.id);
    if (went === undefined) {
      went = t;
      copyOut.set(d.id, t);
    }
    return clamp((went - since) / FADE, 0, 1) * clamp(1 - (t - went) / FADE, 0, 1);
  }

  function placeMarker(at: XZ): void {
    if (at.x === markerX && at.z === markerZ) return;
    markerX = at.x;
    markerZ = at.z;
    const g = groundHeight(at.x, at.z);
    drape(ringPos, ringFlat, at.x, at.z);
    markerRing.position.set(at.x, g, at.z);
    markerBeam.position.set(at.x, g - BEAM.sunk + BEAM.h / 2, at.z);
  }

  /** Turns every beam about the vertical to face the camera. */
  function faceCamera(): void {
    const cam = game.camera.position;
    for (let k = 0; k < beams.count; k++) {
      const x = beamAt[k * 3];
      const y = beamAt[k * 3 + 1];
      const z = beamAt[k * 3 + 2];
      turn.setFromAxisAngle(UP, Math.atan2(cam.x - x, cam.z - z));
      beams.setMatrixAt(k, m4.compose(spot.set(x, y, z), turn, ONE));
    }
    if (beams.count > 0) beams.instanceMatrix.needsUpdate = true;
    markerBeam.rotation.y = Math.atan2(cam.x - markerBeam.position.x, cam.z - markerBeam.position.z);
    towerBeam.rotation.y = Math.atan2(cam.x - towerBeam.position.x, cam.z - towerBeam.position.z);
  }

  /** Draws the first n instances of a mesh, and hides it while there are none (nothing to upload then). */
  function show(mesh: THREE.InstancedMesh, n: number, fade?: THREE.InstancedBufferAttribute): void {
    mesh.count = n;
    mesh.visible = n > 0;
    if (n === 0) return;
    mesh.instanceMatrix.needsUpdate = true;
    if (fade) fade.needsUpdate = true;
  }

  // Every frame, synced or not (the finale orbits the tower without syncing), the beams keep facing the camera.
  const stopFrames = game.onFrame(() => faceCamera());

  function sync(s: GameState, time: number): void {
    const t = Number.isFinite(time) ? time : clock;
    clock = t;
    if (s.run.def !== lakon) layOut(s.run.def);
    const { phase } = s.run;
    // A failed lakon keeps its records out through its shot and while the retry waits: they are still to be recorded.
    const targets = openTargets(phase === 'failed' ? { ...s.run, phase: 'active' as const } : s.run);
    const sight = s.sight.on;
    const facing = game.camera.quaternion;

    let nArrow = 0;
    let nLeaf = 0;
    let nPost = 0;
    let nBeam = 0;
    let nHalo = 0;
    let nLotus = 0;
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const open = hasPickup(targets, r.id);
      if (open) {
        r.out = true;
        r.recordedAt = NaN;
      } else if (r.out && Number.isNaN(r.recordedAt)) {
        // No longer open: recorded, so it goes the way records go; or the lakon moved on without it, and it simply goes.
        if (s.run.recorded.includes(r.id)) {
          r.recordedAt = t;
          if (r.lontar) takeOff(r, s.car);
        } else {
          r.out = false;
        }
      }
      if (!r.out) continue;
      const u = open ? 0 : Math.max(0, (t - r.recordedAt) / FADE);
      if (u >= 1) {
        r.out = false;
        continue;
      }
      const left = 1 - u;
      if (r.lontar) {
        // The post fades where it stands; the box lifts off it and flies.
        posts.setMatrixAt(nPost, r.post);
        postFade.setX(nPost++, left);
        if (open) {
          leaves.setMatrixAt(nLeaf, r.pose);
          spot.copy(r.halo);
        } else {
          const k = flightAt(r, u, s.car);
          // A flying lontar turns to lie along the chariot as it comes in; one rising where it stands keeps its yaw.
          const yaw = r.flies ? r.yaw + angleDiff(s.car.yaw, r.yaw) * smoothstep(FLIGHT.rise, 1, u) : r.yaw;
          turn.setFromAxisAngle(UP, yaw);
          leaves.setMatrixAt(nLeaf, m4.compose(spot, turn, size.setScalar(k)));
        }
        leafFade.setX(nLeaf++, left);
      } else {
        // An arrow never moves: it fades where it stands.
        arrows.setMatrixAt(nArrow, r.pose);
        tips.setMatrixAt(nArrow, r.pose);
        arrowFade.setX(nArrow++, left);
        spot.copy(r.halo);
      }
      const halo = halos[nHalo++];
      halo.position.copy(spot);
      (halo.material as THREE.SpriteMaterial).opacity = HALO.opacity * left;
      halo.visible = true;
      beamAt[nBeam * 3] = r.beam.x;
      beamAt[nBeam * 3 + 1] = r.beam.y;
      beamAt[nBeam * 3 + 2] = r.beam.z;
      beams.setColorAt(nBeam++, tint.copy(GOLD).multiplyScalar(left));
      if (open && sight) lotus.setMatrixAt(nLotus++, m4.compose(r.stamp, facing, STAMP_SIZE));
    }
    for (let k = nHalo; k < halos.length; k++) halos[k].visible = false;

    // The copies come out with the lakon, not before it starts.
    copyMat.opacity = shimmerAt(t);
    let nCopy = 0;
    let nRing = 0;
    for (let i = 0; i < s.decoys.length; i++) {
      const d = s.decoys[i];
      const level = copyLevel(d, t);
      if (phase === 'roam' || level <= 0 || nCopy === CAP.copies) continue;
      copies.setMatrixAt(nCopy, stand(m4, d.at, ARROW.spread * Math.sin(d.id * GOLDEN)));
      copyFade.setX(nCopy++, level);
      if (sight && d.state === 'open') {
        spot.addScaledVector(dir, TAIL.copy * ARROW.scale);
        spot.y += STAMP.over;
        rings.setMatrixAt(nRing++, m4.compose(spot, facing, STAMP_SIZE));
      }
    }

    // The marker: the ring and its beam in roam; in an intro the ring alone, under the chariot where the lakon starts.
    const mark = phase === 'roam' ? markerIn(targets) : phase === 'intro' ? (s.run.def.marker ?? s.run.def.start) : null;
    markerRing.visible = mark !== null;
    markerBeam.visible = mark !== null && phase === 'roam';
    if (mark) placeMarker(mark);

    show(arrows, nArrow, arrowFade);
    show(tips, nArrow);
    show(leaves, nLeaf, leafFade);
    show(posts, nPost, postFade);
    show(copies, nCopy, copyFade);
    show(lotus, nLotus);
    show(rings, nRing);
    show(beams, nBeam);
    if (beams.instanceColor) beams.instanceColor.needsUpdate = true;
    faceCamera();
    fresh = false;
  }

  function setFinale(on: boolean): void {
    play.visible = !on;
    finale.visible = on;
  }

  function dispose(): void {
    stopFrames();
    game.root.remove(group);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      // A sprite's quad is three's own, shared by every sprite: only its material is the halo's.
      if (mesh.isMesh) geometries.add(mesh.geometry);
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      const m = (o as THREE.Mesh | THREE.Sprite).material;
      if (m) for (const x of Array.isArray(m) ? m : [m]) materials.add(x);
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  }

  return { sync, setFinale, dispose };
}
