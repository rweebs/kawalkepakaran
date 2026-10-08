import * as THREE from 'three';
import { TRAVEL_GLSL } from './travel';

/**
 * Tags every vertex of `geo` as part of a limb: aLimb = (id, pivot x, pivot y). Id 0 is the body, which stays put; ids 1..5 swing
 * about their pivot in the x-y plane. Merged creature meshes carry this so one shader can animate thousands of instances.
 */
export function tagLimb<G extends THREE.BufferGeometry>(geo: G, id: number, px = 0, py = 0): G {
  const n = geo.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = id; a[i * 3 + 1] = px; a[i * 3 + 2] = py; }
  geo.setAttribute('aLimb', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** Gives every vertex of `geo` one flat colour (merged parts keep their own colour through vertexColors). */
export function paint<G extends THREE.BufferGeometry>(geo: G, hex: string): G {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

export interface LimbOptions {
  /** Radians each tagged limb swings either side. */
  swing: number;
  /** Gait cycles per second times 2π. */
  speed: number;
  /** Phase offset per limb id, 0..5. */
  phases: number[];
  /** How far the whole body bobs per step. */
  bob?: number;
  /** Sideways lunge of the upper body, for fighters. */
  lunge?: number;
  /** Forward lean of instances that carry an aLean attribute, as a fraction of height. */
  lean?: number;
  /** Charge across the field: speed (units/s) and the length of the run before it starts over. */
  travel?: { speed: number; span: number };
  vertexColors?: boolean;
  roughness?: number;
  metalness?: number;
  normalMap?: THREE.Texture;
}

/**
 * A standard material whose vertex shader animates tagged limbs, with each instance out of step with the next (aPhase, 0..1).
 * Everything is driven by the shared clock uniform, so there is no per-frame work on the CPU.
 */
export function limbMaterial(uTime: { value: number }, o: LimbOptions): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    roughness: o.roughness ?? 0.65, metalness: o.metalness ?? 0.2, vertexColors: o.vertexColors ?? false, normalMap: o.normalMap ?? null,
  });
  const phases = Array.from({ length: 6 }, (_, i) => o.phases[i] ?? 0);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uSwing = { value: o.swing };
    shader.uniforms.uSpeed = { value: o.speed };
    shader.uniforms.uBob = { value: o.bob ?? 0 };
    shader.uniforms.uLunge = { value: o.lunge ?? 0 };
    shader.uniforms.uLean = { value: o.lean ?? 0 };
    shader.uniforms.uTravel = { value: new THREE.Vector2(o.travel?.speed ?? 0, o.travel?.span ?? 0) };
    shader.uniforms.uLimbPhase = { value: phases };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uSwing; uniform float uSpeed; uniform float uBob; uniform float uLunge; uniform float uLean;
        uniform vec2 uTravel; uniform float uLimbPhase[6];
        attribute vec3 aLimb; attribute float aPhase; attribute float aLean;`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        float gait = uTime * uSpeed + aPhase * 6.2831853;
        int limb = int(aLimb.x + 0.5);
        if (limb > 0) {
          float a = sin(gait + uLimbPhase[limb]) * uSwing;
          vec2 p = transformed.xy - aLimb.yz;
          float cs = cos(a); float sn = sin(a);
          transformed.xy = aLimb.yz + vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
        }
        transformed.y += abs(sin(gait)) * uBob;
        transformed.x += sin(gait * 0.5) * uLunge * smoothstep(0.3, 1.5, position.y);
        transformed.x += aLean * uLean * position.y;
        ${TRAVEL_GLSL}`);
  };
  m.customProgramCacheKey = () => `limb-${o.swing}-${o.speed}-${o.bob ?? 0}-${o.lunge ?? 0}-${o.lean ?? 0}-${o.travel ? 1 : 0}-${o.vertexColors ? 1 : 0}`;
  return m;
}
