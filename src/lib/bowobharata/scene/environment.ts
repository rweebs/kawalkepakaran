import * as THREE from 'three';
import { mulberry32 } from '../../sky/rng';
import { groundHeight } from '../stage-math';
import type { Part, SceneContext } from './effects';

// Two palettes the whole sky, fog and sunlight move between: dusk of the dice game, dawn of dharma.
const DUSK = { top: '#0b0a1d', horizon: '#7c2c25', ground: '#1a0e0b', sun: '#ff8a4a', light: '#ff9a5c', fog: '#4a2420' };
const DAWN = { top: '#3d6fa9', horizon: '#f5cf90', ground: '#5c4834', sun: '#fff1c8', light: '#ffe8bc', fog: '#d9b98a' };
const c = (hex: string) => new THREE.Color(hex);
const mixColor = (out: THREE.Color, a: string, b: string, t: number) => out.copy(c(a)).lerp(c(b), t);

export const SKY_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

export const SKY_FRAGMENT = `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunColor; uniform vec3 uSun; uniform float uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uGround, clamp(-h * 4.0, 0.0, 1.0));
  float s = max(dot(d, normalize(uSun)), 0.0);
  col += uSunColor * (pow(s, 900.0) * 3.0 + pow(s, 24.0) * 0.3 + pow(s, 4.0) * 0.12);
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.25) * 1.4 + vec2(uTime * 0.006, 0.0);
    float cloud = smoothstep(0.5, 0.85, fbm(uv));
    vec3 lit = mix(uHorizon * 0.65, uSunColor, pow(s, 3.0) * 0.8 + 0.2);
    col = mix(col, lit, cloud * 0.6 * smoothstep(0.0, 0.25, h));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function createSky(uTime: { value: number }) {
  const uniforms = {
    uTop: { value: c(DUSK.top) }, uHorizon: { value: c(DUSK.horizon) }, uGround: { value: c(DUSK.ground) },
    uSunColor: { value: c(DUSK.sun) }, uSun: { value: new THREE.Vector3(0.55, 0.06, -0.83) }, uTime,
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}

function createTerrain(segments: number, normalMap: THREE.Texture): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(260, 260, segments, segments).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const earth = c('#3b2a1d');
  const dust = c('#8c6c49');
  const trampled = c('#2a1d14');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeight(x, z);
    pos.setY(i, y);
    const grain = (Math.sin(x * 1.7 + z * 0.9) * Math.cos(z * 1.3 - x * 0.4) + 1) / 2;
    tmp.copy(earth).lerp(dust, 0.25 + grain * 0.45 + Math.min(y, 3) * 0.08);
    tmp.lerp(trampled, Math.max(0, 1 - Math.abs(x) / 7) * 0.55);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, normalMap, normalScale: new THREE.Vector2(0.9, 0.9) }));
  terrain.name = 'terrain';
  return terrain;
}

/** Broken spears and dropped shields scattered over the ground between the two front lines. */
function createDebris(): THREE.Group {
  const rnd = mulberry32(7);
  const g = new THREE.Group();
  const spears = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4), new THREE.MeshStandardMaterial({ color: '#4a3622', roughness: 0.9 }), 160);
  const shields = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12), new THREE.MeshStandardMaterial({ color: '#5a4630', roughness: 0.6, metalness: 0.4 }), 60);
  const d = new THREE.Object3D();
  for (let i = 0; i < 160; i++) {
    const x = (rnd() - 0.5) * 8;
    const z = 14 - rnd() * 56;
    d.position.set(x, groundHeight(x, z) + 0.05, z);
    d.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.6, rnd() * Math.PI, (rnd() - 0.5) * 0.4);
    d.updateMatrix();
    spears.setMatrixAt(i, d.matrix);
  }
  for (let i = 0; i < 60; i++) {
    const x = (rnd() - 0.5) * 9;
    const z = 14 - rnd() * 56;
    d.position.set(x, groundHeight(x, z) + 0.04, z);
    d.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI, (rnd() - 0.5) * 0.5);
    d.updateMatrix();
    shields.setMatrixAt(i, d.matrix);
  }
  g.add(spears, shields);
  return g;
}

/** Sky, ground, fog and the light that falls on everything; follows the camera so the sky never shows an edge. */
export interface EnvironmentPart extends Part {
  /** The sky's shader uniforms, shared with the reflection probe. */
  skyUniforms: ReturnType<typeof createSky>['uniforms'];
  sun: THREE.DirectionalLight;
}

export function createEnvironment(scene: THREE.Scene, camera: THREE.Camera, ctx: SceneContext): EnvironmentPart {
  const group = new THREE.Group();
  const sky = createSky(ctx.uTime);
  sky.mesh.name = 'sky';
  group.add(sky.mesh, createTerrain(ctx.quality.terrainSegments, ctx.detail.terrain), createDebris());

  const fog = new THREE.FogExp2(c(DUSK.fog), 0.009);
  scene.fog = fog;

  const hemi = new THREE.HemisphereLight('#a9b4e0', '#4a3020', 0.85);
  const sun = new THREE.DirectionalLight(DUSK.light, 1.6);
  const fill = new THREE.DirectionalLight('#6d7fd6', 0.35);
  fill.position.set(-30, 18, 40);
  group.add(hemi, sun, sun.target, fill);

  return {
    object: group,
    skyUniforms: sky.uniforms,
    sun,
    update(_time, mix) {
      sky.mesh.position.copy(camera.position);
      mixColor(sky.uniforms.uTop.value, DUSK.top, DAWN.top, mix);
      mixColor(sky.uniforms.uHorizon.value, DUSK.horizon, DAWN.horizon, mix);
      mixColor(sky.uniforms.uGround.value, DUSK.ground, DAWN.ground, mix);
      mixColor(sky.uniforms.uSunColor.value, DUSK.sun, DAWN.sun, mix);
      sky.uniforms.uSun.value.set(0.55, 0.06 + 0.16 * mix, -0.83).normalize();
      mixColor(fog.color, DUSK.fog, DAWN.fog, mix);
      fog.density = 0.009 - 0.003 * mix;
      mixColor(sun.color, DUSK.light, DAWN.light, mix);
      sun.intensity = 1.6 + 1.2 * mix;
      sun.position.copy(sky.uniforms.uSun.value).multiplyScalar(100);
      hemi.intensity = 0.85 + 0.3 * mix;
    },
  };
}
