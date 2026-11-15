// The lakon's targets in the scene, drawn each frame from the engine's state, with no text (F2: arrows 2.2 times their
// size in a light material, and records under gold beams that the high chase camera sees from far off).
// - The prologue's records are arrows standing in the ground; a parva's are lontar on posts. Gold beams mark only these,
//   the player's real records.
// - The rewritten copies are grey, frayed and shimmering: a game device that stands for no particular page.
// - A course's gates stand on its days' lines: gold for a day's real gate, grey for a rewrite, and gold shimmering as the
//   copies do for a mimic. Lap posts stand in pairs with a ribbon between them, the next one under an amber beam. Antar's
//   letter rides rolled on the chariot while it is carried.
// - Mata shows a lotus over each record and real gate and a broken ring over each copy and rewrite gate, all shapes.
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
import { openTargets, type Decoy, type Phase, type RunState } from '../mission-run';
import { across, type DayDef, type GateDef, type MissionDef, type PickupDef } from '../missions';
import { MISSION_TIMING } from '../tuning';
import { ANCHORS, RECORD_CIRCLE } from '../world';
import { disposeGroup } from './dispose';
import { fadeOn, fading, instanced } from './instancing';
import { at as place, bake, brokenRingGeo, decoyFletchGeo, decoyShaftGeo, lotusGeo, merge, realShaftGeo, realTipGeo } from './shapes';
import type { Layer, SceneGame } from './types';

/** The copies' shimmer: their opacity swings base ± amp at hz, under the 2 Hz that comfort allows. */
export const SHIMMER = { hz: 1.2, base: 0.75, amp: 0.12 } as const;

/** The copies' opacity at scene time t (s). */
export function shimmerAt(t: number): number {
  return SHIMMER.base + SHIMMER.amp * Math.sin(2 * Math.PI * SHIMMER.hz * t);
}

/**
 * Seconds a record takes to go once recorded (a prologue arrow fading where it stands, a lontar flying to the prabha) or
 * to come out after its lakon began, a copy to fade in or out, the marker ring to fade once its intro ends, the next lap
 * post's beam to move on, and Antar's letter to come and go: longer than a half cycle at 2 Hz.
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
 * The beams (m). The shaft texture is brightest 35% down from its top and fades out at both ends, so a record's, the
 * marker's or the next lap post's beam stands `sunk` m into the ground: brightest 9.5 m up, still half as bright at its
 * foot. The tower's rises from the ground, brightest well above the roof.
 */
const BEAM = { w: 1.4, h: 30, sunk: 10, tower: { w: 2, h: 36 } } as const;
const MARKER = { r: 5, petals: 8, opacity: 0.85 } as const;
const LAMPS = { count: 24, r: 6 } as const;
/**
 * Halos are additive glow sprites, so phones without bloom still read them: size (m), opacity, and height over a record
 * arrow's entry point or a lamp (m).
 */
const HALO = { size: 1.8, opacity: 0.55, up: 0.45, lamp: { size: 1.3, opacity: 0.7, up: 0.25 } } as const;
/**
 * Stamps: their size against the shapes', how far above what they stamp (m), and the seconds they take to come out or go
 * with sight: never a faster swing than 2 Hz allows, however quickly sight is tapped.
 */
const STAMP = { scale: 2.6, over: 0.9, fade: 0.25 } as const;
/**
 * A course's gates (m): two pillars `pillar` round on plinths, sunk `sink` into the ground (the courses' ground falls at
 * most 0.14 m from a gate's centre to its ends), and an arch springing from their tops `spring` m up, rising `rise` more in
 * a tube `tube` round. Its crown, 4.7 m up, clears the riders (3.68 m) and stays well under the chase camera (6.8 m at its
 * lowest), which passes over a gate rather than through it. A gate is drawn within `far` m of the chariot, and comes and
 * goes over `fade` s: a passed day's rewrite gates go no faster.
 */
const GATE = { pillar: 0.17, sink: 0.35, spring: 3.9, rise: 0.7, tube: 0.1, far: 120, fade: 0.6 } as const;
/**
 * A pair of lap posts (m): two poles `pole` round standing `tall` out of the ground and sunk `sink`, the posts' width
 * apart, and a ribbon `deep` deep and `thick` thick tied between them at `hang`, sagging `sag` at its middle: over the
 * riders' heads and under the chase camera.
 */
const LAP = { pole: 0.07, tall: 4.6, sink: 0.35, hang: 4.35, sag: 0.25, deep: 0.22, thick: 0.03 } as const;
/**
 * Antar's letter: a roll of palm leaf `len` m long and `r` round, lashed across the back of the banner pole at `at` in the
 * chariot's frame (forward, up, right): the pole stands at −1.05 on the 1.3 m deck behind Arjuna (−0.55), and the folded
 * flag's foot is 2.5 m up (scene/chariot.ts). The chase camera, behind and above, sees it there.
 */
const LETTER = { len: 0.9, r: 0.075, at: { x: -1.14, y: 2.15, z: 0 } } as const;
/** Rings lie this far over the ground (m), clear of the terrain mesh between its vertices. */
const LIFT = 0.12;
/**
 * The most records a lakon draws (the largest lays out 9), copies (a lakon lays out 4 at most; volleys add some), gates of
 * one kind (parva 4's 18 days hold 36 in all) and pairs of lap posts (parva 5 has 5).
 */
const CAP = { records: 16, copies: 64, gates: 40, posts: 8 } as const;
/** The longest step of scene time a fade takes in one sync (s), so a long gap between syncs cannot jump it. */
const MAX_STEP = 0.1;
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
  bamboo: '#d8be86',
  ribbon: '#f0973a',
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
  /** Scene time it came out, and eases in from (−Infinity: out with the lakon's first sync). */
  openedAt: number;
  /** Scene time it was recorded; NaN while open. */
  recordedAt: number;
  /** A lontar the chariot came by flies to the prabha, from `from` in the chariot's frame (ahead, right, up). */
  flies: boolean;
  from: { a: number; c: number; h: number };
}

/** One gate of the lakon's course, laid out when the lakon starts. */
interface GateSlot {
  id: string;
  /** The course's step, and the gate's day in it (0 for day 1). */
  step: number;
  day: number;
  real: boolean;
  mimic: boolean;
  /** Its centre on the day's line; its pose there, standing on the ground with its span across the day's heading. */
  at: XZ;
  pose: THREE.Matrix4;
  /** Where its stamp floats, over its arch. */
  stamp: THREE.Vector3;
  /** How far out it is, 0 to 1. */
  shown: number;
}

/** One pair of lap posts, laid out when the lakon starts. */
interface PostSlot {
  /** The lap course's step, and the post's place in its order (0 is P1, as run.lapPost counts). */
  step: number;
  index: number;
  at: XZ;
  pose: THREE.Matrix4;
  beam: THREE.Vector3;
  /** How far out the pair is, and how lit its amber beam (while it is the next post to cross), each 0 to 1. */
  shown: number;
  lit: number;
}

type Targets = ReturnType<typeof openTargets>;

/** Every record a lakon lays out, in step order: the collect steps' pickups, and a lap course's record (Task 31). */
function pickupsOf(def: MissionDef): PickupDef[] {
  return def.steps.flatMap((s) => (s.kind === 'collect' ? s.items : s.kind === 'laps' ? [s.then] : []));
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

/** A part in one colour, given as a vertex colour, so that parts of two colours merge into one mesh. */
function painted(geo: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = c.r;
    rgb[i * 3 + 1] = c.g;
    rgb[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  return geo;
}

/**
 * A gate as one shape, its foot at the origin and its span along z, the gates' width between its pillars' axes: two
 * pillars on plinths under capitals, rooted GATE.sink deep, and the arch between their tops, half an ellipse.
 */
function gateGeo(): THREE.BufferGeometry {
  const half = MISSION_TIMING.gateWidth / 2;
  const r = GATE.pillar;
  const tall = GATE.spring + GATE.sink;
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-half, half]) {
    parts.push(
      bake(new THREE.CylinderGeometry(r * 0.85, r, tall, 8), place(0, tall / 2 - GATE.sink, z)),
      bake(new THREE.CylinderGeometry(r * 1.6, r * 1.8, 0.3 + GATE.sink, 8), place(0, (0.3 - GATE.sink) / 2, z)),
      bake(new THREE.CylinderGeometry(r * 1.6, r * 1.3, 0.16, 8), place(0, GATE.spring - 0.04, z)),
    );
  }
  // It rises straight out of the capitals and meets itself over the middle of the span.
  const arc: THREE.Vector3[] = [];
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16) * Math.PI;
    arc.push(new THREE.Vector3(0, GATE.spring + GATE.rise * Math.sin(a), -half * Math.cos(a)));
  }
  parts.push(bake(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 32, GATE.tube, 6), place(0, 0, 0)));
  return merge(parts)!;
}

/**
 * A pair of lap posts as one shape, its foot at the origin and its span along z, the posts' width between the poles: two
 * bamboo poles with saffron tips, and the saffron ribbon tied between them, sagging at its middle.
 */
function lapPostGeo(): THREE.BufferGeometry {
  const half = MISSION_TIMING.postWidth / 2;
  const long = LAP.tall + LAP.sink;
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-half, half]) {
    parts.push(
      painted(bake(new THREE.CylinderGeometry(LAP.pole * 0.8, LAP.pole, long, 6), place(0, long / 2 - LAP.sink, z)), COLOR.bamboo),
      painted(bake(new THREE.ConeGeometry(LAP.pole * 1.8, 0.3, 6), place(0, LAP.tall + 0.15, z)), COLOR.ribbon),
    );
  }
  const ribbon = bake(new THREE.BoxGeometry(LAP.thick, LAP.deep, 2 * half, 1, 1, 16), place(0, 0, 0));
  const pos = ribbon.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getZ(i) / half;
    pos.setY(i, pos.getY(i) + LAP.hang - LAP.sag * (1 - u * u));
  }
  ribbon.computeVertexNormals();
  parts.push(painted(ribbon, COLOR.ribbon));
  return merge(parts)!;
}

/** Antar's letter: a roll of palm leaf along z, bound near both ends and at its middle. */
function letterGeo(): THREE.BufferGeometry {
  const parts = [bake(new THREE.CylinderGeometry(LETTER.r, LETTER.r, LETTER.len, 12), place(0, 0, 0, Math.PI / 2))];
  for (const k of [-0.42, 0, 0.42]) {
    parts.push(bake(new THREE.CylinderGeometry(LETTER.r * 1.18, LETTER.r * 1.18, 0.05, 12), place(0, 0, k * LETTER.len, Math.PI / 2)));
  }
  return merge(parts)!;
}

/**
 * Adds the lakon's targets to the game's root, under a `pickups` group, all drawn from `sync`:
 * - `record-arrows` with `record-arrow-tips`, `lontar` with `lontar-posts`, and a `record-halo` sprite on each record;
 * - `record-beams` over them; `decoys`; `stamp-lotus` and `stamp-ring` while sight is on;
 * - a course's `gate-real`, `gate-mimic` and `gate-rewrite`; a lap course's `lap-posts` and the next post's `lap-beams`;
 * - `marker-ring` and `marker-beam`; and, always, `tower-beam` and `record-circle`.
 * Antar's `letter` hangs on the chariot's own root, so it rides with it. `setFinale(true)` shows the finale's `lamps`,
 * `lamp-flames` and `lamp-halo`s and hides the lakon's targets.
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
  const AMBER = new THREE.Color(COLOR.amber);

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
  const arrows = instanced(play, 'record-arrows', shaftGeo, lit(COLOR.shaft, COLOR.shaftGlow, 0.45, 0.45, 0.15), CAP.records);
  const tips = instanced(play, 'record-arrow-tips', tipGeo, lit(COLOR.tip, COLOR.tipGlow, 1.6, 0.3), CAP.records);

  // A parva's lontar: the box, and the post it lies on.
  const leafGeo = new THREE.BoxGeometry(LONTAR.w, LONTAR.h, LONTAR.d);
  const postGeo = new THREE.CylinderGeometry(0.045, 0.06, LONTAR.post, 6).translate(0, LONTAR.post / 2, 0);
  const leafFade = fadeOn(leafGeo, CAP.records);
  const postFade = fadeOn(postGeo, CAP.records);
  const leaves = instanced(play, 'lontar', leafGeo, lit(COLOR.leaf, COLOR.leafGlow, 0.4, 0.7), CAP.records);
  const posts = instanced(play, 'lontar-posts', postGeo, fading(new THREE.MeshStandardMaterial({ color: COLOR.post, roughness: 0.85, metalness: 0 })), CAP.records);

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
  const copies = instanced(play, 'decoys', copyGeo, copyMat, CAP.copies);

  // A course's gates, each mesh with its own fade: gold for a day's real gate, the same gold shimmering for a mimic, grey
  // for any other rewrite. On FX_LAYER, as everything that fades per instance is: the occlusion and depth passes draw
  // with their own materials, which never read aFade.
  const realGeo = gateGeo();
  const mimicGeo = gateGeo();
  const greyGeo = gateGeo();
  const realFade = fadeOn(realGeo, CAP.gates);
  const mimicFade = fadeOn(mimicGeo, CAP.gates);
  const greyFade = fadeOn(greyGeo, CAP.gates);
  const gateReal = fxLayer(instanced(play, 'gate-real', realGeo, lit(COLOR.gold, COLOR.amber, 1.2, 0.4, 0.5), CAP.gates));
  const mimicMat = lit(COLOR.gold, COLOR.amber, 1.2, 0.4, 0.5);
  mimicMat.opacity = SHIMMER.base;
  const gateMimic = fxLayer(instanced(play, 'gate-mimic', mimicGeo, mimicMat, CAP.gates));
  const gateGrey = fxLayer(instanced(play, 'gate-rewrite', greyGeo, lit(COLOR.copy, COLOR.copyGlow, 0.4, 0.9), CAP.gates));

  // Mata's stamps, fading in and out together with sight: over records and copies, and over a course's gates.
  const lotusMat = new THREE.MeshBasicMaterial({ color: COLOR.lotus, toneMapped: false, transparent: true, opacity: 0 });
  const ringMat = new THREE.MeshBasicMaterial({ color: COLOR.ring, toneMapped: false, transparent: true, opacity: 0 });
  const lotus = fxLayer(instanced(play, 'stamp-lotus', lotusGeo(), lotusMat, CAP.records + CAP.gates));
  const rings = fxLayer(instanced(play, 'stamp-ring', brokenRingGeo(), ringMat, CAP.copies + CAP.gates));

  // The beams over the records, each turned to the camera about the vertical; tinted gold (fading with their records).
  const beamGeo = new THREE.PlaneGeometry(BEAM.w, BEAM.h);
  const beams = fxLayer(instanced(play, 'record-beams', beamGeo, glowMat('#ffffff', 0.8, game.textures.shaft), CAP.records));
  beams.renderOrder = 1;
  for (let k = 0; k < CAP.records; k++) beams.setColorAt(k, GOLD); // the colour buffer now, never in a frame
  const beamAt = new Float64Array(CAP.records * 3);

  // A lap course's posts, and the amber beam over the next one to cross, moving on as each is crossed.
  const lapGeo = lapPostGeo();
  const lapFade = fadeOn(lapGeo, CAP.posts);
  const lapMat = fading(new THREE.MeshStandardMaterial({ vertexColors: true, emissive: COLOR.leafGlow, emissiveIntensity: 0.35, roughness: 0.8, metalness: 0 }));
  const lapPosts = fxLayer(instanced(play, 'lap-posts', lapGeo, lapMat, CAP.posts));
  const lapBeams = fxLayer(instanced(play, 'lap-beams', beamGeo, glowMat('#ffffff', 0.8, game.textures.shaft), CAP.posts));
  lapBeams.renderOrder = 1;
  for (let k = 0; k < CAP.posts; k++) lapBeams.setColorAt(k, AMBER);
  const lapBeamAt = new Float64Array(CAP.posts * 3);

  // Antar's letter, on the chariot's own root, so it rides with its every tilt and sway; in the lontar's look.
  const letterShape = letterGeo();
  const letterFade = fadeOn(letterShape, 1);
  const letter = fxLayer(instanced(game.chariot.root, 'letter', letterShape, lit(COLOR.leaf, COLOR.leafGlow, 0.4, 0.7), 1));
  letter.position.set(LETTER.at.x, LETTER.at.y, LETTER.at.z);

  // The marker: the lotus ring, laid over the ground wherever the lakon starts, and its amber beam.
  const ringGeo = markerGeo();
  const ringPos = ringGeo.getAttribute('position') as THREE.BufferAttribute;
  const ringFlat = Float32Array.from(ringPos.array as ArrayLike<number>);
  const markMat = glowMat(COLOR.amber, MARKER.opacity);
  const markerRing = fxLayer(new THREE.Mesh(ringGeo, markMat));
  markerRing.name = 'marker-ring';
  markerRing.visible = false;
  markerRing.frustumCulled = false;
  markerRing.renderOrder = 1;
  const markerBeam = fxLayer(new THREE.Mesh(beamGeo, glowMat(COLOR.amber, 0.8, game.textures.shaft)));
  markerBeam.name = 'marker-beam';
  markerBeam.visible = false;
  markerBeam.renderOrder = 1;
  play.add(markerRing, markerBeam);

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
  const cups = instanced(finale, 'lamps', new THREE.CylinderGeometry(0.16, 0.1, 0.09, 10).translate(0, 0.045, 0), new THREE.MeshStandardMaterial({ color: COLOR.clay, roughness: 0.9, metalness: 0 }), LAMPS.count);
  const flames = instanced(finale, 'lamp-flames', new THREE.ConeGeometry(0.045, 0.16, 6).translate(0, 0.17, 0), new THREE.MeshBasicMaterial({ color: COLOR.flame, toneMapped: false }), LAMPS.count);
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

  // The lakon drawn: its records, gates and lap posts, and when each copy came out and went (scene time; −Infinity: out
  // with the lakon).
  let lakon: MissionDef | null = null;
  let records: RecordSlot[] = [];
  let gates: GateSlot[] = [];
  let laps: PostSlot[] = [];
  /** The lakon's first sync: what is out then shows at once, under the cut into its intro. */
  let fresh = true;
  const copyIn = new Map<number, number>();
  const copyOut = new Map<number, number>();
  /** The last sync's scene time, and whether there has been one (the first takes no step). */
  let clock = 0;
  let synced = false;
  /** How far out Mata's stamps are, 0 to 1. */
  let stampK = 0;
  /** How far out Antar's letter is, 0 to 1, and from when it may show (scene time; NaN while it is not carried). */
  let letterK = 0;
  let letterFrom = NaN;
  /** The marker ring: shown at a live mark at the last sync; when it lost its mark (scene time; NaN while live or gone). */
  let markLive = false;
  let markGoneAt = NaN;
  let markerX = NaN;
  let markerZ = NaN;
  /** The open targets, and what they were worked out for. */
  let targets: Targets = [];
  let targetsDef: MissionDef | null = null;
  let targetsPhase: Phase | null = null;
  let targetsStep = -1;
  let targetsRecorded = -1;
  let targetsMatched = false;

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
      openedAt: -Infinity,
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

  /**
   * Gate g of day `day` of the course at step `step`, from the lakon's data: its centre `across` the day's line, standing on
   * the ground there; the shape's span (along z) turned by the heading about the vertical lies along rightOf(heading).
   */
  function gateSlot(step: number, day: number, d: DayDef, g: GateDef): GateSlot {
    const c = across(d.at, d.heading, g.offset);
    const ground = groundHeight(c.x, c.z);
    turn.setFromAxisAngle(UP, d.heading);
    const pose = new THREE.Matrix4().compose(spot.set(c.x, ground, c.z), turn, size.set(1, 1, g.width / MISSION_TIMING.gateWidth));
    const crown = ground + GATE.spring + GATE.rise + GATE.tube;
    return { id: g.id, step, day, real: g.real, mimic: g.mimic, at: c, pose, stamp: new THREE.Vector3(c.x, crown + STAMP.over, c.z), shown: 0 };
  }

  /** Lap post `index` of the lap course at step `step`: the pair standing on the ground across its heading, its beam over it. */
  function postSlot(step: number, index: number, p: { at: XZ; heading: number }): PostSlot {
    const ground = groundHeight(p.at.x, p.at.z);
    turn.setFromAxisAngle(UP, p.heading);
    return {
      step,
      index,
      at: { x: p.at.x, z: p.at.z },
      pose: new THREE.Matrix4().compose(spot.set(p.at.x, ground, p.at.z), turn, ONE),
      beam: new THREE.Vector3(p.at.x, ground - BEAM.sunk + BEAM.h / 2, p.at.z),
      shown: 0,
      lit: 0,
    };
  }

  /** A new lakon: its records, gates and lap posts laid out where they stand, the last one's fades and marker forgotten. */
  function layOut(def: MissionDef): void {
    lakon = def;
    fresh = true;
    copyIn.clear();
    copyOut.clear();
    markLive = false;
    markGoneAt = NaN;
    records = pickupsOf(def).slice(0, CAP.records).map(slotOf);
    gates = [];
    laps = [];
    def.steps.forEach((s, i) => {
      if (s.kind === 'course') s.days.forEach((d, k) => d.gates.forEach((g) => gates.push(gateSlot(i, k, d, g))));
      if (s.kind === 'laps') s.posts.forEach((p, k) => laps.push(postSlot(i, k, p)));
    });
    gates = gates.slice(0, CAP.gates);
    laps = laps.slice(0, CAP.posts);
  }

  /** The open targets afresh, for openNow when they can change (a few times a lakon): a failed run's as an active one's. */
  function retarget(run: RunState, phase: Phase): Targets {
    return openTargets(phase === run.phase ? run : { ...run, phase });
  }

  // Every frame, synced or not (the finale orbits the tower without syncing), the beams keep facing the camera.
  const stopFrames = game.onFrame(() => faceCamera());

  function sync(s: GameState, time: number): void {
    const t = Number.isFinite(time) ? time : clock;
    const dt = synced ? clamp(t - clock, 0, MAX_STEP) : 0;
    clock = t;
    synced = true;
    if (s.run.def !== lakon) layOut(s.run.def);
    const run = s.run;
    const phase = run.phase;
    const open = openNow(run);
    const facing = game.camera.quaternion;
    // Mata's stamps come out and go over STAMP.fade, whatever sight does in between.
    stampK = clamp(stampK + (s.sight.on ? dt : -dt) / STAMP.fade, 0, 1);
    lotusMat.opacity = stampK;
    ringMat.opacity = stampK;
    const stamped = stampK > 0;

    let nArrow = 0;
    let nLeaf = 0;
    let nPost = 0;
    let nBeam = 0;
    let nHalo = 0;
    let nLotus = 0;
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const isOpen = hasPickup(open, r.id);
      if (isOpen) {
        if (!r.out) r.openedAt = fresh ? -Infinity : t;
        r.out = true;
        r.recordedAt = NaN;
      } else if (r.out && Number.isNaN(r.recordedAt)) {
        // No longer open: recorded, so it goes the way records go; or the lakon moved on without it, and it simply goes.
        if (run.recorded.includes(r.id)) {
          r.recordedAt = t;
          if (r.lontar) takeOff(r, s.car);
        } else {
          r.out = false;
        }
      }
      if (!r.out) continue;
      const u = isOpen ? 0 : Math.max(0, (t - r.recordedAt) / FADE);
      if (u >= 1) {
        r.out = false;
        continue;
      }
      // One that came out after its lakon began (Antar's after the gate, Uji ulang's after the laps) eases in; recorded
      // before it was whole, it goes from as far as it had come.
      const come = clamp(((isOpen ? t : r.recordedAt) - r.openedAt) / FADE, 0, 1);
      const left = (1 - u) * come;
      if (r.lontar) {
        // The post fades where it stands; the box lifts off it and flies.
        posts.setMatrixAt(nPost, r.post);
        postFade.setX(nPost++, left);
        if (isOpen) {
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
      if (isOpen && stamped) lotus.setMatrixAt(nLotus++, m4.compose(r.stamp, facing, size.setScalar(STAMP.scale * come)));
    }
    for (let k = nHalo; k < halos.length; k++) halos[k].visible = false;

    // The copies come out with the lakon, not before it starts.
    copyMat.opacity = shimmerAt(t);
    let nCopy = 0;
    let nRing = 0;
    for (let i = 0; i < s.decoys.length; i++) {
      const d = s.decoys[i];
      const level = Math.min(copyLevel(d, t), lifeLeft(d, run.t));
      if (phase === 'roam' || level <= 0 || nCopy === CAP.copies) continue;
      copies.setMatrixAt(nCopy, stand(m4, d.at, ARROW.spread * Math.sin(d.id * GOLDEN)));
      copyFade.setX(nCopy++, level);
      if (stamped && d.state === 'open') {
        spot.addScaledVector(dir, TAIL.copy * ARROW.scale);
        spot.y += STAMP.over;
        rings.setMatrixAt(nRing++, m4.compose(spot, facing, STAMP_SIZE));
      }
    }

    // A course's gates, read from the run: a real gate stands until it is recorded, from either side and on any day; a
    // rewrite gate until its day is passed. Each eases in and out, within GATE.far of the chariot; a mimic shimmers as the
    // copies do, and each gate's stamp grows and shrinks with it.
    const playing = phase === 'intro' || phase === 'active' || phase === 'failed';
    mimicMat.opacity = shimmerAt(t);
    let nReal = 0;
    let nMimic = 0;
    let nGrey = 0;
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const standing = playing && g.step === run.step && (g.real ? !run.recorded.includes(g.id) : g.day >= run.dayIndex);
      g.shown = ease(g.shown, standing && Math.hypot(g.at.x - s.car.x, g.at.z - s.car.z) < GATE.far, dt, GATE.fade);
      if (g.shown <= 0) continue;
      if (g.real) {
        gateReal.setMatrixAt(nReal, g.pose);
        realFade.setX(nReal++, g.shown);
      } else if (g.mimic) {
        gateMimic.setMatrixAt(nMimic, g.pose);
        mimicFade.setX(nMimic++, g.shown);
      } else {
        gateGrey.setMatrixAt(nGrey, g.pose);
        greyFade.setX(nGrey++, g.shown);
      }
      if (!stamped) continue;
      m4.compose(g.stamp, facing, size.setScalar(STAMP.scale * g.shown));
      if (g.real) lotus.setMatrixAt(nLotus++, m4);
      else rings.setMatrixAt(nRing++, m4);
    }

    // A lap course's posts stand while its step is open; the next post to cross is under the amber beam until the laps match.
    let nLap = 0;
    let nLapBeam = 0;
    for (let i = 0; i < laps.length; i++) {
      const p = laps[i];
      const live = playing && p.step === run.step;
      p.shown = ease(p.shown, live, dt, GATE.fade);
      p.lit = ease(p.lit, live && !run.matched && run.lapPost === p.index, dt, FADE);
      if (p.shown > 0) {
        lapPosts.setMatrixAt(nLap, p.pose);
        lapFade.setX(nLap++, p.shown);
      }
      if (p.lit > 0) {
        lapBeamAt[nLapBeam * 3] = p.beam.x;
        lapBeamAt[nLapBeam * 3 + 1] = p.beam.y;
        lapBeamAt[nLapBeam * 3 + 2] = p.beam.z;
        lapBeams.setColorAt(nLapBeam++, tint.copy(AMBER).multiplyScalar(p.lit));
      }
    }

    // Antar's letter is carried from the record of it to the gate: it shows once the lontar's flight to the prabha is over,
    // and goes at the gate, each over FADE.
    const current = run.def.steps[run.step];
    const carried = (phase === 'active' || phase === 'failed') && current !== undefined && current.kind === 'reach' && current.place === 'gate';
    if (!carried) letterFrom = NaN;
    else if (Number.isNaN(letterFrom)) letterFrom = fresh ? -Infinity : t + FADE;
    letterK = fresh && carried ? 1 : clamp(letterK + (carried && t >= letterFrom ? dt : -dt) / FADE, 0, 1);
    letterFade.setX(0, letterK);

    // The marker: the ring and its beam in roam; in an intro the ring alone, under the chariot where the lakon starts.
    const mark = phase === 'roam' ? markerIn(open) : phase === 'intro' ? (run.def.marker ?? run.def.start) : null;
    markerBeam.visible = mark !== null && phase === 'roam';
    if (mark) showMark(mark);
    else fadeMark(t);

    show(arrows, nArrow, arrowFade);
    show(tips, nArrow);
    show(leaves, nLeaf, leafFade);
    show(posts, nPost, postFade);
    show(copies, nCopy, copyFade);
    show(gateReal, nReal, realFade);
    show(gateMimic, nMimic, mimicFade);
    show(gateGrey, nGrey, greyFade);
    show(lapPosts, nLap, lapFade);
    show(letter, letterK > 0 && play.visible ? 1 : 0, letterFade);
    show(lotus, nLotus);
    show(rings, nRing);
    show(beams, nBeam);
    show(lapBeams, nLapBeam);
    if (beams.instanceColor) beams.instanceColor.needsUpdate = true;
    if (lapBeams.instanceColor) lapBeams.instanceColor.needsUpdate = true;
    faceCamera();
    fresh = false;
  }

  // What sync and the frame listener run each frame is declared from here to dispose, so the no-allocation check reads it.

  /**
   * The open targets, worked out afresh only when they can change: another lakon, phase, step or record (records only add
   * up within a run), or the laps matching, which opens Uji ulang's record. A failed run reads as active: its records stay
   * out through the fail shot and the retry.
   */
  function openNow(run: RunState): Targets {
    const phase: Phase = run.phase === 'failed' ? 'active' : run.phase;
    if (
      run.def !== targetsDef ||
      phase !== targetsPhase ||
      run.step !== targetsStep ||
      run.recorded.length !== targetsRecorded ||
      run.matched !== targetsMatched
    ) {
      targetsDef = run.def;
      targetsPhase = phase;
      targetsStep = run.step;
      targetsRecorded = run.recorded.length;
      targetsMatched = run.matched;
      targets = retarget(run, phase);
    }
    return targets;
  }

  function hasPickup(list: Targets, id: string): boolean {
    for (let i = 0; i < list.length; i++) if (list[i].kind === 'pickup' && list[i].id === id) return true;
    return false;
  }

  function markerIn(list: Targets): XZ | null {
    for (let i = 0; i < list.length; i++) if (list[i].kind === 'marker') return list[i].at;
    return null;
  }

  /**
   * A level eased toward 1 while `on` and toward 0 while not, a whole swing taking `seconds`; the lakon's first sync sets
   * it outright, under the cut into the lakon.
   */
  function ease(k: number, on: boolean, dt: number, seconds: number): number {
    if (fresh) return on ? 1 : 0;
    return clamp(k + (on ? dt : -dt) / seconds, 0, 1);
  }

  /** The pose of an arrow standing in the ground at `at`, its tail leaning toward `lean`; leaves its entry point in `spot` and its tail's direction in `dir`. */
  function stand(out: THREE.Matrix4, at: XZ, lean: number): THREE.Matrix4 {
    const s = Math.sin(ARROW.tilt);
    dir.set(s * Math.cos(lean), Math.cos(ARROW.tilt), -s * Math.sin(lean));
    spot.set(at.x, groundHeight(at.x, at.z), at.z);
    // The shapes point their tip along +y: the other way from the tail, into the ground.
    turn.setFromUnitVectors(UP, down.copy(dir).negate());
    return out.compose(spot, turn, ARROW_SIZE);
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
      // Out again (the same id in another run of the same lakon): its next going starts afresh.
      copyOut.delete(d.id);
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

  /**
   * A volley's copy leaves the engine's list at born + life with no 'gone' first: it fades out over its last FADE s of
   * run time instead, so it never pops. The lakon's own copies have no end.
   */
  function lifeLeft(d: Decoy, runT: number): number {
    return d.life === null ? 1 : clamp((d.born + d.life - runT) / FADE, 0, 1);
  }

  /** The marker ring whole at its mark, laid over the ground there; its beam goes with it. */
  function showMark(at: XZ): void {
    markLive = true;
    markGoneAt = NaN;
    markMat.opacity = MARKER.opacity;
    markerRing.visible = true;
    if (at.x === markerX && at.z === markerZ) return;
    markerX = at.x;
    markerZ = at.z;
    const g = groundHeight(at.x, at.z);
    drape(ringPos, ringFlat, at.x, at.z);
    markerRing.position.set(at.x, g, at.z);
    markerBeam.position.set(at.x, g - BEAM.sunk + BEAM.h / 2, at.z);
  }

  /**
   * The marker ring with no mark: once the intro ends it fades where it lay over FADE, since the last intro shot hands over
   * to the chase view with no cut to hide it; then it is hidden.
   */
  function fadeMark(t: number): void {
    if (markLive) {
      markLive = false;
      markGoneAt = t;
    }
    const k = Number.isNaN(markGoneAt) ? 0 : 1 - Math.max(0, t - markGoneAt) / FADE;
    if (k <= 0) markGoneAt = NaN;
    markMat.opacity = MARKER.opacity * Math.max(0, k);
    markerRing.visible = k > 0;
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

  /** Turns every beam about the vertical to face the camera: the records', the next lap post's, the marker's and the tower's. */
  function faceCamera(): void {
    const cam = game.camera.position;
    turnBeams(beams, beamAt);
    turnBeams(lapBeams, lapBeamAt);
    markerBeam.rotation.y = Math.atan2(cam.x - markerBeam.position.x, cam.z - markerBeam.position.z);
    towerBeam.rotation.y = Math.atan2(cam.x - towerBeam.position.x, cam.z - towerBeam.position.z);
  }

  /** Turns each beam a mesh draws, standing where `where` lists it, about the vertical to face the camera. */
  function turnBeams(mesh: THREE.InstancedMesh, where: Float64Array): void {
    const cam = game.camera.position;
    for (let k = 0; k < mesh.count; k++) {
      const x = where[k * 3];
      const y = where[k * 3 + 1];
      const z = where[k * 3 + 2];
      turn.setFromAxisAngle(UP, Math.atan2(cam.x - x, cam.z - z));
      mesh.setMatrixAt(k, m4.compose(spot.set(x, y, z), turn, ONE));
    }
    if (mesh.count > 0) mesh.instanceMatrix.needsUpdate = true;
  }

  /** Draws the first n instances of a mesh, and hides it while there are none (nothing to upload then). */
  function show(mesh: THREE.InstancedMesh, n: number, fade?: THREE.InstancedBufferAttribute): void {
    mesh.count = n;
    mesh.visible = n > 0;
    if (n === 0) return;
    mesh.instanceMatrix.needsUpdate = true;
    if (fade) fade.needsUpdate = true;
  }

  function setFinale(on: boolean): void {
    play.visible = !on;
    finale.visible = on;
    // The letter rides on the chariot, outside the lakon's group: it goes with the lakon's targets.
    if (on) letter.visible = false;
  }

  function dispose(): void {
    stopFrames();
    game.root.remove(group);
    disposeGroup(group);
    game.chariot.root.remove(letter);
    disposeGroup(letter);
  }

  return { sync, setFinale, dispose };
}
