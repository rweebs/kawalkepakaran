import * as THREE from 'three';
import { CHARIOT, groundHeight } from '../stage-math';
import { garment, hangingChain, horse, humanFigure, strand, type HorseRig } from './anatomy';
import { canvasTexture, contactShadow, glowSprite, wavingCloth, type Part, type SceneContext } from './effects';
import type { Detail } from './materials';
import { springStep } from './motion';
import { dressHero, type Hero } from './hero';
import { instantiate, type Rig } from './models';

// Where the procedural figures' heads are centred (standing), which is where the crown, hair and feather were authored.
const HEAD_CENTRE = new THREE.Vector3(0.01, 1.7, 0);

// A white team: the one model is repainted per material, keeping its own shading and its dark hooves and eyes.
const HORSE_TINT = { Main: '#ebe6da', Main_Light: '#f8f5ee', Main_Dark: '#cdc5b4', Hair: '#d8d1c0', Muzzle: '#bba99c', Hooves: '#2b221b' };

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

/** Sudarshana chakra: a spiked golden wheel, emissive so the bloom pass (or its halo sprites, on phones) makes it glow. */
function chakra(ctx: SceneContext): THREE.Group {
  const g = new THREE.Group();
  const fire = std('#ffd76a', 0.3, 0.6, { emissive: '#ffc04a', emissiveIntensity: 2.6 });
  g.add(mesh(new THREE.TorusGeometry(0.34, 0.04, 10, 48), fire), mesh(new THREE.TorusGeometry(0.18, 0.022, 8, 32), fire));
  const spike = new THREE.ConeGeometry(0.035, 0.15, 4);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const s = mesh(spike, fire, Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0);
    s.rotation.z = a - Math.PI / 2;
    g.add(s);
  }
  g.add(glowSprite(ctx.glow, '#ffcf6a', 2.2, 0.85), glowSprite(ctx.glow, '#ffb347', 5, 0.22));
  return g;
}

/** A crown turned on the lathe, sitting on top of a head centred at `y`. */
const crown = (M: Palette, y: number, tall = 1) => {
  const c = garment([[0.1, 0], [0.112, 0.06], [0.1, 0.1], [0.075, 0.18 * tall], [0.03, 0.26 * tall], [0.001, 0.29 * tall]], M.gold, 1);
  c.position.y = y + 0.07;
  return c;
};

/** Krishna as charioteer: dark blue skin, yellow dhoti, a blue scarf, garland and armlets, the crown with its peacock feather. */
function krishna(M: Palette, ctx: SceneContext): { group: THREE.Group; wheelOfLight: THREE.Group; halo: THREE.Sprite; reinHand: THREE.Vector3; scarfJoints: THREE.Group[]; gear: THREE.Object3D[] } {
  const f = humanFigure({
    skin: M.krishnaSkin,
    cloth: M.pitambara,
    arms: {
      left: [[0, 1.42, 0.22], [0.22, 1.2, 0.26], [0.45, 1.12, 0.2]],
      right: [[0, 1.42, -0.22], [0.08, 1.68, -0.32], [0.12, 1.95, -0.3]],
    },
  });
  const g = f.group;
  g.add(garment([[0.17, 1.0], [0.2, 0.85], [0.215, 0.62], [0.24, 0.4], [0.2, 0.36]], M.pitambara, 0.72));
  g.add(strand([[0.05, 1.46, 0.2], [0.13, 1.25, 0.06], [0.11, 1.02, -0.14], [0.0, 0.96, -0.2]], 0.026, M.scarf));
  g.add(strand([[0.02, 1.5, 0.14], [0.15, 1.32, 0.12], [0.19, 1.1, 0], [0.15, 1.32, -0.12], [0.02, 1.5, -0.14]], 0.024, M.flowers));
  for (const [x, y, z] of [[0.11, 1.31, 0.24], [0.04, 1.55, -0.27]]) {
    const band = mesh(new THREE.TorusGeometry(0.048, 0.012, 6, 16), M.gold, x, y, z);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }
  const hair = mesh(new THREE.SphereGeometry(0.105, 16, 12), M.hair, -0.025, 1.72, 0);
  hair.scale.set(1, 1.1, 1);
  const crownMesh = crown(M, 1.76);
  g.add(hair, crownMesh);
  const feather = mesh(new THREE.PlaneGeometry(0.14, 0.5), new THREE.MeshStandardMaterial({ map: featherTexture(), alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6 }), -0.06, 2.12, 0);
  feather.rotation.z = 0.3;
  g.add(feather);

  const wheelOfLight = chakra(ctx);
  wheelOfLight.position.set(0.12, 2.25, -0.3);
  const halo = glowSprite(ctx.glow, '#ffd27a', 6, 0.18);
  halo.position.set(0, 1.4, 0);
  g.add(wheelOfLight, halo);
  // The loose end of the scarf, streaming back from his shoulder in the wind.
  const scarfEnd = hangingChain(3, 0.24, [0.07, 0.014], [0.05, 0.01], M.scarf, 'down');
  scarfEnd.root.position.set(-0.08, 1.4, 0.1);
  scarfEnd.root.rotation.z = -0.35;
  g.add(scarfEnd.root);
  return { group: g, wheelOfLight, halo, reinHand: f.leftHand, scarfJoints: scarfEnd.joints, gear: [hair, crownMesh, feather] };
}

/** Arjuna behind him in silver armour, the bow drawn: stave in the left hand, string to the right. */
function arjuna(M: Palette): { group: THREE.Group; gear: THREE.Object3D[] } {
  const f = humanFigure({
    skin: M.arjunaSkin,
    cloth: M.crimson,
    build: 1.1,
    arms: {
      left: [[0, 1.42, 0.22], [0.25, 1.32, 0.28], [0.48, 1.35, 0.26]],
      right: [[0, 1.42, -0.22], [0.12, 1.32, -0.24], [0.2, 1.36, 0.1]],
    },
  });
  const g = f.group;
  g.add(garment([[0.17, 0.95], [0.16, 1.08], [0.2, 1.28], [0.215, 1.42], [0.1, 1.5]], M.silver, 0.68));
  g.add(garment([[0.18, 1.0], [0.21, 0.8], [0.23, 0.55]], M.crimson, 0.72));
  const hair = mesh(new THREE.SphereGeometry(0.105, 16, 12), M.hair, -0.025, 1.72, 0);
  const crownMesh = crown(M, 1.76, 1.35);
  g.add(hair, crownMesh);

  const r = 0.8;
  const span = Math.PI * 0.4;
  const hand = f.leftHand;
  const bow = mesh(new THREE.TorusGeometry(r, 0.02, 6, 40, span * 2), M.wood, hand.x - r, hand.y, hand.z);
  bow.rotation.z = -span;
  const top = new THREE.Vector3(hand.x - r + r * Math.cos(span), hand.y + r * Math.sin(span), hand.z);
  const bottom = new THREE.Vector3(top.x, hand.y - r * Math.sin(span), hand.z);
  const nock = new THREE.Vector3(f.rightHand.x, f.rightHand.y, hand.z);
  const string = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([top, nock, nock, bottom]), new THREE.LineBasicMaterial({ color: '#efe6cf' }));
  g.add(bow, string);
  return { group: g, gear: [hair, crownMesh] };
}

/** Krishna's chariot between the two armies: four white horses, Krishna as charioteer with the chakra raised, Arjuna with his bow. */
export function createChariot(ctx: SceneContext): Part {
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
  for (const z of [-1.08, 1.08]) {
    const w = wheel(M);
    w.position.set(-0.2, 0.92, z);
    root.add(w);
  }

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

  const k = krishna(M, ctx);
  k.group.position.set(0.55, deck, 0);
  root.add(k.group);
  const a = arjuna(M);
  a.group.position.set(-0.55, deck, 0.1);
  root.add(a.group);

  // Reins from Krishna's hand to each horse's bit.
  const hand = k.reinHand.clone().add(k.group.position);
  const reins = horses.flatMap((h) => [hand, new THREE.Vector3(3.1 + 0.6 + 0.74, 1.5 + 0.2, h.group.position.z)]);
  const reinsLine = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(reins), new THREE.LineBasicMaterial({ color: '#e8c67c' }));
  reinsLine.frustumCulled = false;
  root.add(reinsLine);

  // The chariot's banner, streaming back from a tall pole.
  root.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.4, 6), M.gold, -1.05, deck + 2.2, 0));
  const { geometry: clothGeo, material: clothMat } = wavingCloth(flagTexture(), 1.5, 1.0, ctx.uTime, ctx.detail.cloth);
  const flag = new THREE.Mesh(clothGeo, clothMat);
  flag.position.set(-1.05, deck + 3.85, 0);
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

  return {
    object: root,
    upgrade(models) {
      horses.forEach((h, i) => {
        const rig = instantiate(models.horse, { height: 2.1, faceBones: ['Tail1', 'Head'] });
        rig.tint(HORSE_TINT);
        rig.root.position.set(3.1 + 0.25, 0, h.group.position.z);
        rig.play(i % 2 === 0 ? 'Idle' : 'Idle_2', i * 0.8);
        root.add(rig.root);
        h.group.visible = false;
        realHorses.push(rig);
      });
      heroes.push(
        dressHero(k.group, models, 'Spell_Simple_Idle_Loop', '#2f4c8c', k.gear, HEAD_CENTRE),
        dressHero(a.group, models, 'Pistol_Aim_Neutral', '#b07e5a', a.gear, HEAD_CENTRE),
      );
    },
    update(time, mix) {
      const dt = Math.min(0.05, Math.max(0.001, time - last));
      last = time;
      heroes.forEach((h) => h.update(dt));
      realHorses.forEach((rig, i) => {
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
      k.wheelOfLight.rotation.z = time * 2.2;
      k.wheelOfLight.position.y = 2.25 + Math.sin(time * 1.4) * 0.05;
      (k.halo.material as THREE.SpriteMaterial).opacity = 0.18 + 0.3 * mix;
      horses.forEach((h, i) => {
        h.legs.forEach((leg, j) => { leg.rotation.z = Math.sin(time * 1.2 + i + j * 1.7) * 0.04; });
        h.legs[0].rotation.z = Math.max(0, Math.sin(time * 0.9 + i * 2.1)) * 0.5;
        const toss = Math.sin(time * 1.1 + i * 1.3) * 0.05;
        h.head.rotation.z = toss;
        const gust = Math.sin(time * 1.7 + i) * 0.25 + Math.sin(time * 0.6 + i * 2) * 0.12;
        tailDrivers[i](gust, dt);
        maneDrivers[i](-toss * 3 + gust * 0.3, dt);
      });
    },
  };
}
