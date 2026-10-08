import * as THREE from 'three';
import { mulberry32 } from '../../sky/rng';
import { arrowArc, type Slot } from '../stage-math';
import type { Detail } from './materials';
import { arrowPhase } from './motion';
import type { LoadedModels } from './models';
import type { Quality } from './quality';

/** One piece of the scene: an object to add, and a per-frame update (time in seconds, dharma palette mix 0..1). */
export interface Part {
  object: THREE.Object3D;
  update(time: number, mix: number): void;
  /** Called once the skinned models have loaded: swap the procedural shapes for the real ones. Never called if loading fails. */
  upgrade?(models: LoadedModels): void;
  /** Frees what the scene's own traversal cannot reach, such as baked animation textures. */
  dispose?(): void;
}

/** Shared by every part: the quality tier, the camera, one clock uniform for all shaders, and procedural textures. */
export interface SceneContext {
  quality: Quality;
  camera: THREE.Camera;
  uTime: { value: number };
  glow: THREE.Texture;
  soft: THREE.Texture;
  shadow: THREE.Texture;
  shaft: THREE.Texture;
  detail: Detail;
}

/** A texture drawn on a canvas at runtime (no image files are loaded). */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function radial(stops: [number, string][]): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    for (const [o, c] of stops) grad.addColorStop(o, c);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  });
}

export function createContext(quality: Quality, camera: THREE.Camera, detail: Detail): SceneContext {
  return {
    quality,
    camera,
    detail,
    uTime: { value: 0 },
    glow: radial([[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]),
    soft: radial([[0, 'rgba(255,255,255,0.85)'], [0.5, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]),
    shadow: radial([[0, 'rgba(0,0,0,0.7)'], [0.55, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]),
    // One shaft of sunlight: bright down its centre line, soft at the sides, fading out towards the top and bottom.
    shaft: canvasTexture(64, 256, (g, w, h) => {
      const across = g.createLinearGradient(0, 0, w, 0);
      across.addColorStop(0, 'rgba(255,255,255,0)'); across.addColorStop(0.5, 'rgba(255,255,255,1)'); across.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = across; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      const along = g.createLinearGradient(0, 0, 0, h);
      along.addColorStop(0, 'rgba(0,0,0,0)'); along.addColorStop(0.35, 'rgba(0,0,0,1)'); along.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = along; g.fillRect(0, 0, w, h);
    }),
  };
}

/**
 * The layer for everything that only the main colour pass should draw: glows, blobs, shafts and dust. The ambient-occlusion and
 * depth-of-field passes re-render the scene with one flat material, which draws a sprite as a solid, un-turned quad (a big
 * dark slanted panel), so they must not see these. The camera has this layer on only while the colour pass renders.
 */
export const FX_LAYER = 1;
export function fxLayer<T extends THREE.Object3D>(o: T): T {
  o.layers.set(FX_LAYER);
  return o;
}

/** A soft light halo that always faces the camera; additive halos are what the bloom pass (or the eye, on phones) reads as glow. */
export function glowSprite(tex: THREE.Texture, color: string, size: number, opacity = 1, additive = true): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
  s.scale.setScalar(size);
  return fxLayer(s);
}

/** A dark blot on the ground under an object, so it sits on the terrain instead of floating above it. */
export function contactShadow(tex: THREE.Texture, w: number, d: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  return fxLayer(m);
}

/** A banner hung from its left edge (x = 0) that ripples in the wind; the wave grows towards the free edge. */
export function wavingCloth(map: THREE.Texture, w: number, h: number, uTime: { value: number }, normalMap?: THREE.Texture): { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial } {
  const geometry = new THREE.PlaneGeometry(w, h, 16, 6);
  geometry.translate(w / 2, 0, 0);
  const material = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.85, normalMap: normalMap ?? null });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        float k = transformed.x / ${w.toFixed(3)};
        transformed.z += sin(uTime * 3.2 + transformed.x * 2.6 + transformed.y * 1.3) * 0.16 * k;
        transformed.y -= k * k * 0.08;`);
  };
  material.customProgramCacheKey = () => `cloth-${w}`;
  return { geometry, material };
}

/** Points that fade out as they get close to the camera, so big soft dust sprites never pop in front of the lens. */
function nearFade(mat: THREE.PointsMaterial, from: number, to: number): THREE.PointsMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vNear;')
      .replace('#include <project_vertex>', `#include <project_vertex>\nvNear = smoothstep(${from.toFixed(1)}, ${to.toFixed(1)}, -mvPosition.z);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vNear;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vNear;');
  };
  mat.customProgramCacheKey = () => `nearfade-${from}-${to}`;
  return mat;
}

const STICK_SECONDS = 1.6;

/** Arrow volleys that stand in the ground where they land, impact dust, drifting haze, embers, and flashes along the clash line. */
export function createBattleEffects(ctx: SceneContext, dharma: Slot[], adharma: Slot[], groundAt: (x: number, z: number) => number): Part {
  const { quality } = ctx;
  const rnd = mulberry32(42);
  const group = new THREE.Group();

  // Arrows: each flies from a soldier on one side to one on the other, in volleys of ten that share a launch time.
  const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4).rotateX(Math.PI / 2);
  const arrows = new THREE.InstancedMesh(shaft, new THREE.MeshStandardMaterial({ color: '#6e5a3e', roughness: 0.8 }), quality.arrows);
  arrows.frustumCulled = false;
  const flights = Array.from({ length: quality.arrows }, (_, i) => {
    const fromSide = i % 2 === 0 ? dharma : adharma;
    const toSide = i % 2 === 0 ? adharma : dharma;
    const a = fromSide[Math.floor(rnd() * fromSide.length)];
    const b = toSide[Math.floor(rnd() * toSide.length)];
    return {
      from: { x: a.x, y: groundAt(a.x, a.z) + 1.6, z: a.z },
      to: { x: b.x, y: groundAt(b.x, b.z) + 0.15, z: b.z },
      height: 5 + rnd() * 5,
      duration: 1.8 + rnd() * 0.8,
      cycle: 6 + rnd() * 2,
      offset: Math.floor(i / 10) * 0.7 + rnd() * 0.15,
    };
  });
  const dummy = new THREE.Object3D();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  group.add(arrows);

  // A puff of dust where each of the first arrows lands.
  const puffs = flights.slice(0, Math.min(36, flights.length)).map((f) => {
    const s = glowSprite(ctx.soft, '#a98d6a', 1, 0, false);
    s.position.set(f.to.x, f.to.y + 0.2, f.to.z);
    group.add(s);
    return s;
  });

  // Dust hanging over the field: soft, not additive, so it veils rather than glows.
  const dustPos = new Float32Array(quality.dust * 3);
  for (let i = 0; i < quality.dust; i++) {
    dustPos[i * 3] = (rnd() - 0.5) * 30;
    dustPos[i * 3 + 1] = 0.3 + rnd() * 2.6;
    dustPos[i * 3 + 2] = 16 - rnd() * 60;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = nearFade(new THREE.PointsMaterial({ map: ctx.soft, size: 2.4, color: '#b39472', transparent: true, opacity: 0.3, depthWrite: false }), 3, 11);
  group.add(fxLayer(new THREE.Points(dustGeo, dustMat)));

  // Embers rising from the clash line and from Sengkuni's braziers.
  const emberPos = new Float32Array(quality.embers * 3);
  const emberSpeed = new Float32Array(quality.embers);
  for (let i = 0; i < quality.embers; i++) {
    emberPos[i * 3] = (rnd() - 0.5) * 10;
    emberPos[i * 3 + 1] = rnd() * 9;
    emberPos[i * 3 + 2] = 14 - rnd() * 56;
    emberSpeed[i] = 0.4 + rnd() * 0.9;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const emberMat = nearFade(new THREE.PointsMaterial({ map: ctx.glow, size: 0.35, color: '#ffae4a', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }), 2, 7);
  group.add(fxLayer(new THREE.Points(emberGeo, emberMat)));

  // Flashes where the lines meet: brief bright pulses, like steel catching the light.
  const flashes = Array.from({ length: 8 }, () => {
    const s = glowSprite(ctx.glow, '#ffd9a0', 2.4, 0);
    s.position.set((rnd() - 0.5) * 6, 1.4 + rnd(), 12 - rnd() * 50);
    group.add(s);
    return { sprite: s, speed: 0.6 + rnd() * 0.8, phase: rnd() * Math.PI * 2 };
  });

  return {
    object: group,
    update(time, mix) {
      flights.forEach((f, i) => {
        const { phase, t } = arrowPhase((time + f.offset) % f.cycle, f.duration, STICK_SECONDS);
        if (phase === 'gone') { arrows.setMatrixAt(i, hidden); return; }
        if (phase === 'flight') {
          const p = arrowArc(t, f.from, f.to, f.height);
          const q = arrowArc(Math.min(t + 0.02, 1.02), f.from, f.to, f.height);
          dummy.position.set(p.x, p.y, p.z);
          dummy.lookAt(q.x, q.y, q.z);
          dummy.scale.setScalar(1);
        } else {
          // Standing in the ground, tilted the way it came in, sinking out of sight at the end.
          const dx = f.to.x - f.from.x;
          const dz = f.to.z - f.from.z;
          const len = Math.hypot(dx, dz) || 1;
          dummy.position.set(f.to.x, f.to.y + 0.18, f.to.z);
          dummy.lookAt(f.to.x + (dx / len) * 0.5, f.to.y - 0.45, f.to.z + (dz / len) * 0.5);
          dummy.scale.setScalar(1 - Math.max(0, t - 0.75) * 4);
        }
        dummy.updateMatrix();
        arrows.setMatrixAt(i, dummy.matrix);
      });
      arrows.instanceMatrix.needsUpdate = true;

      puffs.forEach((s, i) => {
        const f = flights[i];
        const { phase, t } = arrowPhase((time + f.offset) % f.cycle, f.duration, STICK_SECONDS);
        const m = s.material as THREE.SpriteMaterial;
        if (phase === 'stuck') { m.opacity = (1 - t) * 0.5; s.scale.setScalar(0.5 + t * 2.4); } else m.opacity = 0;
      });

      const dust = dustGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < dust.count; i++) {
        let x = dust.getX(i) + 0.006;
        if (x > 15) x = -15;
        dust.setX(i, x);
      }
      dust.needsUpdate = true;
      dustMat.opacity = 0.3 - 0.12 * mix;

      const em = emberGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < em.count; i++) {
        let y = em.getY(i) + emberSpeed[i] * 0.016;
        if (y > 9) y = 0.2;
        em.setY(i, y);
        em.setX(i, em.getX(i) + Math.sin(time * 1.3 + i) * 0.004);
      }
      em.needsUpdate = true;
      emberMat.opacity = 0.9 - 0.5 * mix;

      for (const f of flashes) (f.sprite.material as THREE.SpriteMaterial).opacity = Math.pow(Math.max(0, Math.sin(time * f.speed + f.phase)), 12) * (1 - 0.6 * mix);
    },
  };
}

/** Columns of sunlight slanting through the dust, standing at the horizon where the sun is; they turn to face the camera. */
export function createLightShafts(ctx: SceneContext, sunAzimuth: THREE.Vector2): Part {
  const rnd = mulberry32(5);
  const group = new THREE.Group();
  const count = ctx.quality.shadows ? 11 : 7;
  const shafts = Array.from({ length: count }, (_, i) => {
    const mat = new THREE.MeshBasicMaterial({ map: ctx.shaft, color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const m = fxLayer(new THREE.Mesh(new THREE.PlaneGeometry(7 + rnd() * 6, 60), mat));
    const spread = (i / (count - 1) - 0.5) * 1.1;
    const az = Math.atan2(sunAzimuth.x, sunAzimuth.y) + spread;
    const r = 120 + rnd() * 40;
    m.position.set(Math.sin(az) * r, 18, Math.cos(az) * r);
    m.rotation.z = (rnd() - 0.5) * 0.3;
    group.add(m);
    return { m, mat, base: 0.5 + rnd() * 0.5, speed: 0.15 + rnd() * 0.2, phase: rnd() * Math.PI * 2 };
  });
  return {
    object: group,
    update(time, mix) {
      const cam = ctx.camera.position;
      for (const s of shafts) {
        s.m.rotation.y = Math.atan2(cam.x - s.m.position.x, cam.z - s.m.position.z);
        s.mat.opacity = s.base * (0.05 + 0.08 * Math.sin(time * s.speed + s.phase)) * (0.7 + 0.6 * mix);
      }
    },
  };
}
