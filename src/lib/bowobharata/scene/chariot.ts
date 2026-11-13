import * as THREE from 'three';
import { CHARIOT, groundHeight } from '../stage-math';
import { garment, hangingChain, horse, humanFigure, strand, type HorseRig } from './anatomy';
import { canvasTexture, contactShadow, glowSprite, wavingCloth, type Part, type SceneContext } from './effects';
import { gaitAt, spinWheel, type Gait } from './gait';
import type { Detail } from './materials';
import { springStep } from './motion';
import { dressHero, type Hero } from './hero';
import { instantiate, type Rig } from './models';

// Where the procedural figures' heads are centred (standing), which is where the crown, hair and feather were authored.
const HEAD_CENTRE = new THREE.Vector3(0.01, 1.7, 0);

// A white team: the one model is repainted per material, keeping its own shading and its dark hooves and eyes.
const HORSE_TINT = { Main: '#ebe6da', Main_Light: '#f8f5ee', Main_Dark: '#cdc5b4', Hair: '#d8d1c0', Muzzle: '#bba99c', Hooves: '#2b221b' };

type Joint = [number, number, number];
/** Shoulder, elbow and wrist of each arm, in a figure's standing coordinates (see humanFigure). */
interface ArmPose { left: Joint[]; right: Joint[] }

/** Freezes a table of arm poses down to every joint: the page's figures are built from them. */
function frozenArms<T extends Record<string, ArmPose>>(table: T): Readonly<T> {
  for (const pose of Object.values(table)) {
    for (const arm of [pose.left, pose.right]) {
      arm.forEach((joint) => Object.freeze(joint));
      Object.freeze(arm);
    }
    Object.freeze(pose);
  }
  return Object.freeze(table);
}

/** Arjuna's arms: drawing the bow on the page; lowered, hands at his sides, when the chariot is driven. */
export const ARJUNA_ARMS = frozenArms({
  aim: {
    left: [[0, 1.42, 0.22], [0.25, 1.32, 0.28], [0.48, 1.35, 0.26]],
    right: [[0, 1.42, -0.22], [0.12, 1.32, -0.24], [0.2, 1.36, 0.1]],
  },
  lowered: {
    left: [[0, 1.42, 0.22], [0.04, 1.15, 0.27], [0.08, 0.9, 0.25]],
    right: [[0, 1.42, -0.22], [0.04, 1.15, -0.27], [0.08, 0.9, -0.25]],
  },
});

/** Krishna's arms: one on the reins and one raised to the chakra on the page; both on the reins when the chariot is driven. */
export const KRISHNA_ARMS = frozenArms({
  raised: {
    left: [[0, 1.42, 0.22], [0.22, 1.2, 0.26], [0.45, 1.12, 0.2]],
    right: [[0, 1.42, -0.22], [0.08, 1.68, -0.32], [0.12, 1.95, -0.3]],
  },
  reins: {
    left: [[0, 1.42, 0.22], [0.22, 1.2, 0.26], [0.45, 1.12, 0.2]],
    right: [[0, 1.42, -0.22], [0.22, 1.2, -0.26], [0.45, 1.12, -0.2]],
  },
});

/** What the game reports each frame: forward speed (m/s, negative backing up), yaw rate (rad/s, positive turning left) and Laju. */
export interface ChariotMotion { speed: number; yawRate: number; boost: boolean }
/** The drivable chariot's handle: the root to place and turn, the motion that rolls its wheels and paces its team, the halo's pulse. */
export interface ChariotRig { root: THREE.Group; setMotion(m: ChariotMotion): void; pulse(): void }
export interface ChariotPart extends Part { rig?: ChariotRig }

// The drivable chariot's prabha turns this fast (rad/s), and never faster; after pulse() the halo falls back over this many seconds.
const PRABHA_TURN = 0.8;
const PULSE_FALL = 0.5;
// The wheels stand this far either side of the centre line (m), so in a turn the outer one rolls |yawRate| × WHEEL_Z m/s faster.
const WHEEL_Z = 1.08;
// Seconds per stride of the horse model's Walk and Gallop clips: the procedural legs keep time with the real ones.
const WALK_STRIDE = 1.167;
const GALLOP_STRIDE = 0.583;
// The procedural legs (fore −z, fore +z, hind −z, hind +z, as horse() builds them) swing in diagonal pairs.
const STRIDE_PHASE = [0, Math.PI, Math.PI, 0];
/** A motion reading that is not a finite number counts as 0. */
const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/** Drives a chain of joints with damped springs: each joint chases its parent's angle plus a wind push that grows along the chain. */
function chainDriver(joints: THREE.Group[]) {
  const base = joints.map((j) => j.rotation.z);
  let state = joints.map(() => ({ angle: 0, vel: 0 }));
  return (drive: number, dt: number) => {
    state = state.map((s, j) => springStep(s, (j === 0 ? 0 : state[j - 1].angle * 0.7) + drive * (0.4 + j * 0.25), dt, 38, 5.5));
    state.forEach((s, j) => { joints[j].rotation.z = base[j] + s.angle; });
  };
}

const std = (color: string, roughness = 0.6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

/** Materials are made per scene, so disposing one scene never leaves another holding freed GPU resources. */
function palette(detail: Detail) {
  return {
    gold: std('#d4a24a', 0.28, 0.9, { emissive: '#3a2408', emissiveIntensity: 0.4, normalMap: detail.metal }),
    wood: std('#5b3a1e', 0.8, 0, { normalMap: detail.wood }),
    coat: new THREE.MeshPhysicalMaterial({ color: '#efeae0', roughness: 0.42, sheen: 0.6, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.5 }),
    mane: std('#d9d2c2', 0.75),
    hoof: std('#2a2018', 0.5),
    eye: std('#0a0806', 0.2),
    krishnaSkin: std('#2f4c8c', 0.48),
    arjunaSkin: std('#b07e5a', 0.5),
    hair: std('#120c0a', 0.6),
    pitambara: new THREE.MeshPhysicalMaterial({ color: '#f0b62a', roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color('#fff0b0') }),
    scarf: std('#1e3c96', 0.6),
    flowers: std('#f6f1e4', 0.7),
    silver: std('#c9ced8', 0.3, 0.85),
    crimson: std('#7a1e2a', 0.6),
  };
}
type Palette = ReturnType<typeof palette>;

const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
};

function wheel(M: Palette): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.TorusGeometry(0.9, 0.07, 8, 32), M.gold));
  g.add(mesh(new THREE.TorusGeometry(0.82, 0.05, 6, 32), M.wood));
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.32, 12).rotateX(Math.PI / 2), M.gold));
  const spoke = new THREE.CylinderGeometry(0.028, 0.028, 0.8, 5);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const s = mesh(spoke, M.wood, -Math.sin(a) * 0.45, Math.cos(a) * 0.45, 0);
    s.rotation.z = a;
    g.add(s);
  }
  return g;
}

function featherTexture(): THREE.CanvasTexture {
  return canvasTexture(32, 128, (g, w, h) => {
    g.fillStyle = '#1f7a5a';
    g.beginPath(); g.ellipse(w / 2, h * 0.55, w * 0.42, h * 0.45, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d4a24a'; g.beginPath(); g.ellipse(w / 2, h * 0.3, 9, 12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b3fa6'; g.beginPath(); g.ellipse(w / 2, h * 0.3, 5, 7, 0, 0, Math.PI * 2); g.fill();
  });
}

function flagTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 96, (g, w, h) => {
    g.fillStyle = '#e6981e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b8261c'; g.beginPath(); g.arc(w / 2, h / 2, 20, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffe08a'; g.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 24, h / 2 + Math.sin(a) * 24); g.lineTo(w / 2 + Math.cos(a) * 34, h / 2 + Math.sin(a) * 34); g.stroke();
    }
  });
}

/**
 * The Sudarshana chakra's rings and spikes, emissive so the bloom pass (or the halo sprites beside them, on phones) makes them glow.
 * Given `spikes`, the spikes go in that group so it can turn them alone: a ring looks the same at any angle, and an unturned ring
 * keeps its bounding box square to the world (a turned one's box corners reach 0.54 m out).
 */
function chakraWheel(spikes?: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  const fire = std('#ffd76a', 0.3, 0.6, { emissive: '#ffc04a', emissiveIntensity: 2.6 });
  g.add(mesh(new THREE.TorusGeometry(0.34, 0.04, 10, 48), fire), mesh(new THREE.TorusGeometry(0.18, 0.022, 8, 32), fire));
  const spike = new THREE.ConeGeometry(0.035, 0.15, 4);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const s = mesh(spike, fire, Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0);
    s.rotation.z = a - Math.PI / 2;
    (spikes ?? g).add(s);
  }
  if (spikes) g.add(spikes);
  return g;
}

/** Sudarshana chakra: a spiked golden wheel with its glow. */
function chakra(ctx: SceneContext): THREE.Group {
  const g = chakraWheel();
  g.add(glowSprite(ctx.glow, '#ffcf6a', 2.2, 0.85), glowSprite(ctx.glow, '#ffb347', 5, 0.22));
  return g;
}

/** A crown turned on the lathe, sitting on top of a head centred at `y`. */
const crown = (M: Palette, y: number, tall = 1) => {
  const c = garment([[0.1, 0], [0.112, 0.06], [0.1, 0.1], [0.075, 0.18 * tall], [0.03, 0.26 * tall], [0.001, 0.29 * tall]], M.gold, 1);
  c.position.y = y + 0.07;
  return c;
};

/**
 * Krishna as charioteer: dark blue skin, yellow dhoti, a blue scarf, garland and armlets, the crown with its peacock feather.
 * Driven, he holds the reins in both hands and the chakra becomes the prabha, a halo behind his head that only turns slowly.
 */
function krishna(M: Palette, ctx: SceneContext, drivable: boolean): { group: THREE.Group; wheelOfLight: THREE.Group; turning: THREE.Group; halo: THREE.Sprite; reinHand: THREE.Vector3; otherHand: THREE.Vector3; scarfJoints: THREE.Group[]; gear: THREE.Object3D[] } {
  const f = humanFigure({
    skin: M.krishnaSkin,
    cloth: M.pitambara,
    arms: drivable ? KRISHNA_ARMS.reins : KRISHNA_ARMS.raised,
  });
  const g = f.group;
  g.name = 'krishna';
  g.add(garment([[0.17, 1.0], [0.2, 0.85], [0.215, 0.62], [0.24, 0.4], [0.2, 0.36]], M.pitambara, 0.72));
  g.add(strand([[0.05, 1.46, 0.2], [0.13, 1.25, 0.06], [0.11, 1.02, -0.14], [0.0, 0.96, -0.2]], 0.026, M.scarf));
  g.add(strand([[0.02, 1.5, 0.14], [0.15, 1.32, 0.12], [0.19, 1.1, 0], [0.15, 1.32, -0.12], [0.02, 1.5, -0.14]], 0.024, M.flowers));
  // An armlet halfway down each upper arm; the second follows the right arm, raised or on the reins.
  for (const [x, y, z] of [[0.11, 1.31, 0.24], drivable ? [0.11, 1.31, -0.24] : [0.04, 1.55, -0.27]]) {
    const band = mesh(new THREE.TorusGeometry(0.048, 0.012, 6, 16), M.gold, x, y, z);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }
  const hair = mesh(new THREE.SphereGeometry(0.105, 16, 12), M.hair, -0.025, 1.72, 0);
  hair.scale.set(1, 1.1, 1);
  const crownMesh = crown(M, 1.76);
  g.add(hair, crownMesh);
  const feather = mesh(new THREE.PlaneGeometry(0.14, 0.5), new THREE.MeshStandardMaterial({ map: featherTexture(), alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6 }), -0.06, 2.12, 0);
  feather.name = 'krishna-feather';
  feather.rotation.z = 0.3;
  g.add(feather);

  let wheelOfLight: THREE.Group;
  // What turns: the whole chakra on the page, the prabha's spikes alone when driven.
  let turning: THREE.Group;
  if (drivable) {
    // The prabha holds only the rings and spikes, so its bounds are the metal the chase camera sees past (CHARIOT_SILHOUETTE in
    // chase.ts). Its glows hang beside it in his group: a sprite counts its whole quad in a bounding box.
    turning = new THREE.Group();
    wheelOfLight = chakraWheel(turning);
    wheelOfLight.name = 'prabha';
    wheelOfLight.position.set(-0.1, 1.75, 0);
    wheelOfLight.rotation.y = Math.PI / 2;
    for (const [color, size, opacity] of [['#ffcf6a', 1, 0.6], ['#ffb347', 2.2, 0.15]] as const) {
      const glow = glowSprite(ctx.glow, color, size, opacity);
      glow.position.copy(wheelOfLight.position);
      g.add(glow);
    }
  } else {
    wheelOfLight = chakra(ctx);
    wheelOfLight.name = 'chakra';
    wheelOfLight.position.set(0.12, 2.25, -0.3);
    turning = wheelOfLight;
  }
  const halo = drivable ? glowSprite(ctx.glow, '#ffd27a', 3, 0.12) : glowSprite(ctx.glow, '#ffd27a', 6, 0.18);
  halo.name = 'krishna-halo';
  halo.position.set(0, 1.4, 0);
  g.add(wheelOfLight, halo);
  // The loose end of the scarf, streaming back from his shoulder in the wind.
  const scarfEnd = hangingChain(3, 0.24, [0.07, 0.014], [0.05, 0.01], M.scarf, 'down');
  scarfEnd.root.position.set(-0.08, 1.4, 0.1);
  scarfEnd.root.rotation.z = -0.35;
  g.add(scarfEnd.root);
  return { group: g, wheelOfLight, turning, halo, reinHand: f.leftHand, otherHand: f.rightHand, scarfJoints: scarfEnd.joints, gear: [hair, crownMesh, feather] };
}

/** Arjuna behind him in silver armour, the bow drawn: stave in the left hand, string to the right. Driven, his arms are lowered and he carries no bow. */
function arjuna(M: Palette, drivable: boolean): { group: THREE.Group; gear: THREE.Object3D[] } {
  const f = humanFigure({
    skin: M.arjunaSkin,
    cloth: M.crimson,
    build: 1.1,
    arms: drivable ? ARJUNA_ARMS.lowered : ARJUNA_ARMS.aim,
  });
  const g = f.group;
  g.name = 'arjuna';
  g.add(garment([[0.17, 0.95], [0.16, 1.08], [0.2, 1.28], [0.215, 1.42], [0.1, 1.5]], M.silver, 0.68));
  g.add(garment([[0.18, 1.0], [0.21, 0.8], [0.23, 0.55]], M.crimson, 0.72));
  const hair = mesh(new THREE.SphereGeometry(0.105, 16, 12), M.hair, -0.025, 1.72, 0);
  const crownMesh = crown(M, 1.76, 1.35);
  crownMesh.name = 'arjuna-crown';
  g.add(hair, crownMesh);
  if (drivable) return { group: g, gear: [hair, crownMesh] };

  const r = 0.8;
  const span = Math.PI * 0.4;
  const hand = f.leftHand;
  const bow = mesh(new THREE.TorusGeometry(r, 0.02, 6, 40, span * 2), M.wood, hand.x - r, hand.y, hand.z);
  bow.name = 'arjuna-bow';
  bow.rotation.z = -span;
  const top = new THREE.Vector3(hand.x - r + r * Math.cos(span), hand.y + r * Math.sin(span), hand.z);
  const bottom = new THREE.Vector3(top.x, hand.y - r * Math.sin(span), hand.z);
  const nock = new THREE.Vector3(f.rightHand.x, f.rightHand.y, hand.z);
  const string = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([top, nock, nock, bottom]), new THREE.LineBasicMaterial({ color: '#efe6cf' }));
  string.name = 'arjuna-string';
  g.add(bow, string);
  return { group: g, gear: [hair, crownMesh] };
}

/**
 * Krishna's chariot between the two armies: four white horses, Krishna as charioteer with the chakra raised, Arjuna with his bow.
 * `drivable` makes it the game's chariot (see the riders above): it gets a rig, its wheels roll and its team walks and gallops
 * with the speed set on the rig, and its banner is folded.
 */
export function createChariot(ctx: SceneContext, opts: { drivable?: boolean } = {}): ChariotPart {
  const drivable = !!opts.drivable;
  const M = palette(ctx.detail);
  const root = new THREE.Group();
  root.position.set(CHARIOT.x, groundHeight(CHARIOT.x, CHARIOT.z), CHARIOT.z);
  const shadow = contactShadow(ctx.shadow, 9, 4.2);
  shadow.position.x = 1.8;
  root.add(shadow);

  // Car: platform, gold rails and a front shield, the axle and two great wheels.
  const deck = 1.3;
  root.add(mesh(new THREE.BoxGeometry(2.2, 0.3, 1.6), M.wood, 0, deck - 0.15, 0));
  root.add(mesh(new THREE.BoxGeometry(2.24, 0.06, 1.64), M.gold, 0, deck, 0));
  for (const z of [-0.8, 0.8]) root.add(mesh(new THREE.BoxGeometry(2.2, 0.06, 0.06), M.gold, 0, deck + 0.55, z));
  root.add(mesh(new THREE.BoxGeometry(0.08, 0.7, 1.6), M.gold, 1.08, deck + 0.3, 0));
  root.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 8).rotateX(Math.PI / 2), M.wood, -0.2, 0.92, 0));
  const wheels = [-WHEEL_Z, WHEEL_Z].map((z) => {
    const w = wheel(M);
    w.name = z < 0 ? 'wheel-left' : 'wheel-right';
    w.position.set(-0.2, 0.92, z);
    root.add(w);
    return w;
  });

  // Pole and yoke to the team of four, harnessed abreast.
  const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), M.wood, 2.3, 1.1, 0);
  pole.rotation.z = Math.PI / 2 - 0.12;
  root.add(pole, mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.6, 6).rotateX(Math.PI / 2), M.gold, 3.55, 1.62, 0));
  const horses: HorseRig[] = [-1.05, -0.35, 0.35, 1.05].map((z) => {
    const h = horse({ coat: M.coat, mane: M.mane, hoof: M.hoof, eye: M.eye });
    h.group.position.set(3.1, 0, z);
    root.add(h.group);
    return h;
  });

  const k = krishna(M, ctx, drivable);
  k.group.position.set(0.55, deck, 0);
  root.add(k.group);
  const a = arjuna(M, drivable);
  a.group.position.set(-0.55, deck, 0.1);
  root.add(a.group);

  // Reins from Krishna's hand to each horse's bit. Driven, he holds them in both hands, each hand the pair on its own side.
  const hand = k.reinHand.clone().add(k.group.position);
  const otherHand = k.otherHand.clone().add(k.group.position);
  const reins = horses.flatMap((h) => [drivable && h.group.position.z < 0 ? otherHand : hand, new THREE.Vector3(3.1 + 0.6 + 0.74, 1.5 + 0.2, h.group.position.z)]);
  const reinsLine = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(reins), new THREE.LineBasicMaterial({ color: '#e8c67c' }));
  reinsLine.name = 'reins';
  reinsLine.frustumCulled = false;
  root.add(reinsLine);

  // The chariot's banner, streaming back from a tall pole. Driven, it is folded to a short pole and a smaller flag that stay
  // under the chase camera's view of the road (CHARIOT_SILHOUETTE in chase.ts).
  const poleHeight = drivable ? 2 : 4.4;
  root.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, poleHeight, 6), M.gold, -1.05, deck + poleHeight / 2, 0));
  const { geometry: clothGeo, material: clothMat } = drivable
    ? wavingCloth(flagTexture(), 1.2, 0.8, ctx.uTime, ctx.detail.cloth)
    : wavingCloth(flagTexture(), 1.5, 1.0, ctx.uTime, ctx.detail.cloth);
  const flag = new THREE.Mesh(clothGeo, clothMat);
  flag.name = 'banner';
  flag.position.set(-1.05, deck + (drivable ? 1.6 : 3.85), 0);
  flag.rotation.y = Math.PI;
  root.add(flag);

  const tailDrivers = horses.map((h) => chainDriver(h.tailJoints));
  const maneDrivers = horses.map((h) => chainDriver(h.maneJoints));
  const scarfDriver = chainDriver(k.scarfJoints);
  let last = 0;

  // Once the real, skinned models have loaded they replace the procedural horses and bodies; the reins follow each animated head.
  const realHorses: Rig[] = [];
  const heroes: Hero[] = [];
  const reinLine = reinsLine;
  const headPos = new THREE.Vector3();

  // Driven: the motion the game last set, how far each wheel has turned, the team's stride, each real horse's three clips,
  // and when the halo's latest pulse began (a pulse() starts it at the next update).
  let motion: ChariotMotion = { speed: 0, yawRate: 0, boost: false };
  const wheelTurn = [0, 0];
  let stride = 0;
  const gaitClips: { idle?: THREE.AnimationAction; walk?: THREE.AnimationAction; gallop?: THREE.AnimationAction }[] = [];
  let pulseQueued = false;
  let pulseFrom = -Infinity;
  const handle: ChariotRig | undefined = drivable
    ? {
        root,
        setMotion(m) { motion = { speed: finite(m.speed), yawRate: finite(m.yawRate), boost: m.boost }; },
        pulse() { pulseQueued = true; },
      }
    : undefined;

  // A wheel rolls at the chariot's speed; in a turn the outer wheel rolls |yawRate| × WHEEL_Z m/s faster. Yaw growing (a left
  // turn) puts the right wheel (+z) outside going forward, and the left one outside backing up.
  const rollWheels = (dt: number) => {
    const dir = motion.speed < 0 ? -1 : 1;
    const outer = Math.abs(motion.yawRate) * WHEEL_Z * dir;
    const rightOuter = motion.yawRate * dir > 0;
    wheelTurn[0] = spinWheel(wheelTurn[0], motion.speed + (rightOuter ? 0 : outer), dt);
    wheelTurn[1] = spinWheel(wheelTurn[1], motion.speed + (rightOuter ? outer : 0), dt);
    wheels.forEach((w, i) => { w.rotation.z = -wheelTurn[i]; });
  };
  // Each real horse plays Idle, Walk and Gallop at once, weighted and paced by the gait.
  const blendGait = (clips: (typeof gaitClips)[number] | undefined, g: Gait) => {
    clips?.idle?.setEffectiveWeight(g.idle);
    if (clips?.walk) { clips.walk.setEffectiveWeight(g.walk); clips.walk.timeScale = g.walkRate; }
    if (clips?.gallop) { clips.gallop.setEffectiveWeight(g.gallop); clips.gallop.timeScale = g.gallopRate; }
  };

  return {
    object: root,
    rig: handle,
    upgrade(models) {
      horses.forEach((h, i) => {
        const rig = instantiate(models.horse, { height: 2.1, faceBones: ['Tail1', 'Head'] });
        rig.tint(HORSE_TINT);
        rig.root.position.set(3.1 + 0.25, 0, h.group.position.z);
        if (drivable) gaitClips.push({ idle: rig.play('Idle', i * 0.8), walk: rig.play('Walk', i * 0.8), gallop: rig.play('Gallop', i * 0.8) });
        else rig.play(i % 2 === 0 ? 'Idle' : 'Idle_2', i * 0.8);
        root.add(rig.root);
        h.group.visible = false;
        realHorses.push(rig);
      });
      // Driven, Krishna keeps his own body: the mannequin has no clip that holds the reins, and his hands must stay on them.
      if (!drivable) heroes.push(dressHero(k.group, models, 'Spell_Simple_Idle_Loop', '#2f4c8c', k.gear, HEAD_CENTRE));
      heroes.push(dressHero(a.group, models, drivable ? 'Idle_Loop' : 'Pistol_Aim_Neutral', '#b07e5a', a.gear, HEAD_CENTRE));
    },
    update(time, mix) {
      const dt = Math.min(0.05, Math.max(0.001, time - last));
      last = time;
      const gait = drivable ? gaitAt(motion.speed) : null;
      heroes.forEach((h) => h.update(dt));
      realHorses.forEach((rig, i) => {
        if (gait) blendGait(gaitClips[i], gait);
        rig.mixer.update(dt);
        const head = rig.bone('Head');
        if (head) {
          head.getWorldPosition(headPos);
          root.worldToLocal(headPos);
          const attr = reinLine.geometry.getAttribute('position') as THREE.BufferAttribute;
          attr.setXYZ(i * 2 + 1, headPos.x + 0.25, headPos.y - 0.1, headPos.z);
          attr.needsUpdate = true;
        }
      });
      scarfDriver(Math.sin(time * 1.9) * 0.3 + Math.sin(time * 0.7 + 1) * 0.15, dt);
      if (drivable) {
        // The prabha only turns, slowly; the halo flares on a pulse and falls back over PULSE_FALL, once per call.
        k.turning.rotation.z = time * PRABHA_TURN;
        if (pulseQueued) { pulseFrom = time; pulseQueued = false; }
        const pulseK = Math.min(1, Math.max(0, 1 - (time - pulseFrom) / PULSE_FALL));
        (k.halo.material as THREE.SpriteMaterial).opacity = 0.12 + 0.2 * mix + 0.48 * pulseK;
        rollWheels(dt);
      } else {
        k.wheelOfLight.rotation.z = time * 2.2;
        k.wheelOfLight.position.y = 2.25 + Math.sin(time * 1.4) * 0.05;
        (k.halo.material as THREE.SpriteMaterial).opacity = 0.18 + 0.3 * mix;
      }
      // The procedural legs keep time with the real clips: a stride per Walk or Gallop cycle, at the gait's pace.
      if (gait) stride += dt * Math.PI * 2 * ((gait.walk * gait.walkRate) / WALK_STRIDE + (gait.gallop * gait.gallopRate) / GALLOP_STRIDE);
      horses.forEach((h, i) => {
        h.legs.forEach((leg, j) => { leg.rotation.z = Math.sin(time * 1.2 + i + j * 1.7) * 0.04; });
        h.legs[0].rotation.z = Math.max(0, Math.sin(time * 0.9 + i * 2.1)) * 0.5;
        // Driven, the standing fidget fades out as the stride swings in.
        if (gait) h.legs.forEach((leg, j) => { leg.rotation.z = leg.rotation.z * gait.idle + Math.sin(stride + STRIDE_PHASE[j] + i * 0.4) * (gait.walk * 0.3 + gait.gallop * 0.55); });
        const toss = Math.sin(time * 1.1 + i * 1.3) * 0.05;
        h.head.rotation.z = toss;
        const gust = Math.sin(time * 1.7 + i) * 0.25 + Math.sin(time * 0.6 + i * 2) * 0.12;
        tailDrivers[i](gust, dt);
        maneDrivers[i](-toss * 3 + gust * 0.3, dt);
      });
    },
  };
}
