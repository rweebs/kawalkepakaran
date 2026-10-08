import * as THREE from 'three';
import { PAVILION, groundHeight } from '../stage-math';
import { garment, humanFigure, strand } from './anatomy';
import { dressHero, type Hero } from './hero';
import { canvasTexture, contactShadow, glowSprite, wavingCloth, type Part, type SceneContext } from './effects';

const std = (color: string, roughness = 0.6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
};

/** Chaupar board: a cross of gold-ruled tracks on black lacquer. */
function boardTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g, w) => {
    g.fillStyle = '#120a0c'; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#d9a441'; g.lineWidth = 2;
    const cell = w / 8;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const inCross = (i >= 3 && i <= 4) || (j >= 3 && j <= 4);
        if (inCross) g.strokeRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
      }
    }
    g.fillStyle = '#8c1c26'; g.fillRect(3 * cell + 4, 3 * cell + 4, 2 * cell - 8, 2 * cell - 8);
  });
}

/** One face of a long pasa die: ivory with `n` pips along its length. */
function pipTexture(n: number): THREE.CanvasTexture {
  return canvasTexture(128, 40, (g, w, h) => {
    g.fillStyle = '#efe4cc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a0d0d';
    for (let i = 0; i < n; i++) { g.beginPath(); g.arc(((i + 1) / (n + 1)) * w, h / 2, 6, 0, Math.PI * 2); g.fill(); }
  });
}

function maskTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e8e1d2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#120a0a';
    for (const x of [w * 0.32, w * 0.68]) { g.beginPath(); g.ellipse(x, h * 0.42, 13, 7, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#8c1c26'; g.lineWidth = 3;
    g.beginPath(); g.arc(w / 2, h * 0.6, 22, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.strokeStyle = 'rgba(40,20,20,0.6)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(w * 0.62, 0); g.lineTo(w * 0.55, h * 0.3); g.lineTo(w * 0.6, h * 0.5); g.stroke();
  });
}

function curtainTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#4a0a12'); grad.addColorStop(0.5, '#7a1622'); grad.addColorStop(1, '#4a0a12');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c99a3a'; g.fillRect(0, h - 6, w, 6);
  });
}

/** Sengkuni's dice pavilion on its mound, turned to face the opening shot. */
export function createPavilion(ctx: SceneContext): Part {
  const root = new THREE.Group();
  root.position.set(PAVILION.x, groundHeight(PAVILION.x, PAVILION.z) - 0.1, PAVILION.z);
  root.rotation.y = -Math.atan2(11, 8);

  const stone = std('#2b2326', 0.9);
  const lacquer = std('#5a1018', 0.45, 0.1);
  const gold = std('#c9973c', 0.3, 0.9, { emissive: '#2a1606', emissiveIntensity: 0.4, normalMap: ctx.detail.metal });
  // Sengkuni's robe: purple-black silk, so he stands out against the crimson pavilion.
  const robe = new THREE.MeshPhysicalMaterial({ color: '#2b1d3d', roughness: 0.5, sheen: 0.8, sheenColor: new THREE.Color('#c9a0ff') });
  const dark = std('#1d1013', 0.8);

  root.add(contactShadow(ctx.shadow, 9, 9));
  root.add(mesh(new THREE.BoxGeometry(6, 0.4, 6), stone, 0, 0.2, 0), mesh(new THREE.BoxGeometry(4.6, 0.4, 4.6), stone, 0, 0.6, 0));
  const floor = 0.8;

  // Pillars, roof and curtains.
  for (const [x, z] of [[-1.9, -1.9], [-1.9, 1.9], [1.9, -1.9], [1.9, 1.9]]) {
    root.add(mesh(new THREE.CylinderGeometry(0.14, 0.17, 3, 12), lacquer, x, floor + 1.5, z));
    root.add(mesh(new THREE.BoxGeometry(0.42, 0.16, 0.42), gold, x, floor + 3.05, z));
  }
  const roof = mesh(new THREE.ConeGeometry(3.6, 1.3, 4), dark, 0, floor + 3.8, 0);
  roof.rotation.y = Math.PI / 4;
  root.add(roof, mesh(new THREE.BoxGeometry(5.1, 0.12, 5.1), gold, 0, floor + 3.18, 0), mesh(new THREE.SphereGeometry(0.16, 12, 10), gold, 0, floor + 4.55, 0));
  const { geometry: curtainGeo, material: curtainMat } = wavingCloth(curtainTexture(), 1.7, 2.6, ctx.uTime, ctx.detail.cloth);
  for (const z of [-1.85, 0.05]) {
    const c = new THREE.Mesh(curtainGeo, curtainMat);
    c.position.set(-1.9, floor + 1.6, z);
    c.rotation.y = -Math.PI / 2;
    root.add(c);
  }

  // The board, lit from within.
  const board = boardTexture();
  root.add(mesh(new THREE.BoxGeometry(2.0, 0.3, 1.4), dark, 0, floor + 0.15, 0));
  const top = mesh(new THREE.PlaneGeometry(1.9, 1.3), std('#ffffff', 0.5, 0.2, { map: board, emissiveMap: board, emissive: '#ffcf6a', emissiveIntensity: 0.55 }), 0, floor + 0.31, 0);
  top.rotation.x = -Math.PI / 2;
  root.add(top);

  // Three long pasa dice, turning above the board.
  const faces = [1, 2, 3, 4].map(pipTexture);
  const end = std('#e2d6bc', 0.5);
  const dieMats = [end, end, ...[0, 1, 2, 3].map((i) => std('#ffffff', 0.4, 0, { map: faces[i], emissive: '#ff3b3b', emissiveIntensity: 0.12 }))];
  const dieGeo = new THREE.BoxGeometry(0.62, 0.18, 0.18);
  const dice = [-0.45, 0, 0.45].map((z, i) => {
    // Low over the near half of the board, so they never hide Sengkuni from the opening shot.
    const d = mesh(dieGeo, dieMats, 0.35 + 0.1 * i, floor + 0.62 + i * 0.07, z);
    const glow = glowSprite(ctx.glow, '#ff5a3a', 0.9, 0.35);
    glow.position.copy(d.position).setY(floor + 0.45);
    root.add(d, glow);
    return d;
  });

  // Sengkuni, seated cross-legged behind the board in a dark robe, one hand reaching over the dice.
  const skin = std('#b07a54', 0.5);
  const hair = std('#140c0a', 0.6);
  const fig = humanFigure({
    skin, cloth: robe, seated: true, build: 1.15,
    arms: {
      right: [[0, 1.42, -0.22], [0.3, 1.25, -0.2], [0.62, 1.2, -0.08]],
      left: [[0, 1.42, 0.22], [0.15, 1.12, 0.28], [0.35, 0.98, 0.24]],
    },
  });
  const s = fig.group;
  // These pieces are shaped for the cross-legged pose, so they give way to the real seated mannequin when it arrives.
  const crossLegged = [
    garment([[0.25, 0.0], [0.44, 0.12], [0.36, 0.32], [0.2, 0.42]], robe, 1),
    garment([[0.2, 0.3], [0.215, 0.5], [0.235, 0.7], [0.185, 0.86], [0.07, 0.92]], robe, 0.72),
    strand([[0.05, 0.88, 0.22], [0.16, 0.75, 0.1], [0.18, 0.6, -0.05], [0.06, 0.45, -0.22]], 0.03, gold),
  ];
  s.add(...crossLegged);
  const beard = mesh(new THREE.ConeGeometry(0.06, 0.16, 10), hair, 0.07, 1.56 + fig.lift, 0);
  beard.rotation.z = Math.PI;
  const scalp = mesh(new THREE.SphereGeometry(0.105, 16, 12), hair, -0.025, 1.72 + fig.lift, 0);
  const diadem = mesh(new THREE.CylinderGeometry(0.1, 0.112, 0.08, 16), gold, 0, 1.8 + fig.lift, 0);
  s.add(beard, scalp, diadem);
  s.position.set(-1.05, floor, 0);
  root.add(s);

  // Masks hanging in the air behind him.
  const maskMat = std('#ffffff', 0.45, 0, { map: maskTexture(), emissive: '#3a0a0a', emissiveIntensity: 0.3 });
  const maskGeo = new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI);
  const masks = [[-1.5, 2.4, -1.2], [-1.7, 2.9, 0.4], [-1.4, 2.2, 1.4]].map(([x, y, z]) => {
    const m = mesh(maskGeo, maskMat, x, floor + y, z);
    m.scale.set(0.8, 1, 0.45);
    m.rotation.y = Math.PI / 2;
    root.add(m);
    return m;
  });

  // Braziers at the front corners, and the red light they throw.
  const flames = [-1.4, 1.4].flatMap((z) => {
    root.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 8), gold, 1.7, floor + 0.45, z));
    root.add(mesh(new THREE.CylinderGeometry(0.3, 0.14, 0.25, 12), dark, 1.7, floor + 1.0, z));
    return [['#ff7a2a', 1.3, 0.9], ['#ffcf6a', 0.7, 1.0], ['#ff3a1a', 2.2, 0.35]].map(([color, size, opacity]) => {
      const f = glowSprite(ctx.glow, color as string, size as number, opacity as number);
      f.position.set(1.7, floor + 1.35, z);
      root.add(f);
      return { sprite: f, size: size as number, opacity: opacity as number };
    });
  });
  const light = new THREE.PointLight('#ff4a2a', 30, 26, 1.6);
  light.position.set(1.2, floor + 2, 0);
  root.add(light);

  // Once the real mannequin has loaded, Sengkuni sits on a throne and talks with his hands, as the animation library has it.
  let sengkuni: Hero | undefined;
  let last = 0;

  return {
    object: root,
    upgrade(models) {
      for (const piece of crossLegged) piece.visible = false;
      sengkuni = dressHero(s, models, 'Sitting_Talking_Loop', '#4a3270', [beard, scalp, diadem], new THREE.Vector3(0.01, 1.7 + fig.lift, 0));
      const seat = mesh(new THREE.BoxGeometry(0.62, 0.46, 0.66), dark, -0.1, 0.23, 0);
      const cushion = mesh(new THREE.BoxGeometry(0.64, 0.06, 0.68), robe, -0.1, 0.49, 0);
      const back = mesh(new THREE.BoxGeometry(0.1, 0.95, 0.7), lacquer, -0.46, 0.7, 0);
      const crest = mesh(new THREE.BoxGeometry(0.14, 0.12, 0.78), gold, -0.46, 1.2, 0);
      s.add(seat, cushion, back, crest);
    },
    update(time, mix) {
      const dt = Math.min(0.05, Math.max(0.001, time - last));
      last = time;
      sengkuni?.update(dt);
      dice.forEach((d, i) => {
        d.rotation.x = time * (1.1 + i * 0.35);
        d.rotation.y = time * 0.6 + i;
        d.position.y = floor + 0.62 + i * 0.07 + Math.sin(time * 1.6 + i * 2) * 0.05;
      });
      masks.forEach((m, i) => {
        m.position.y = floor + [2.4, 2.9, 2.2][i] + Math.sin(time * 0.8 + i * 2.3) * 0.12;
        m.rotation.z = Math.sin(time * 0.5 + i) * 0.12;
      });
      const flicker = 0.85 + 0.15 * Math.sin(time * 13) * Math.sin(time * 7.3);
      for (const f of flames) {
        f.sprite.scale.setScalar(f.size * flicker);
        (f.sprite.material as THREE.SpriteMaterial).opacity = f.opacity * flicker * (1 - 0.4 * mix);
      }
      light.intensity = 30 * flicker * (1 - 0.6 * mix);
    },
  };
}
