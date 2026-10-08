import * as THREE from 'three';
import { TRAVEL_GLSL } from './travel';
import { planClips, texelOf, vatLayout, type ClipRange, type VatLayout } from './vat-math';

export interface Bake {
  vertexCount: number;
  frames: number;
  layout: VatLayout;
  clips: Record<string, ClipRange>;
  /** RGBA float texels (xyz used): the skinned position of every vertex in every baked frame. */
  positions: Float32Array;
  /** RGBA float texels (xyz used): the unit normal of the triangle each vertex belongs to, in every baked frame. */
  normals: Float32Array;
}

/**
 * Plays each wanted clip of a skinned model at evenly spaced times and records where every vertex ends up. The model's triangles
 * are not shared between vertices (the soldier is flat-shaded), so each vertex takes its triangle's face normal. The rig is put
 * back in its rest pose afterwards. `root` is the object the clips animate; positions are recorded relative to `root`.
 */
export function bakeVat(root: THREE.Object3D, mesh: THREE.SkinnedMesh, clips: readonly THREE.AnimationClip[], framesPerClip: Record<string, number>): Bake {
  const vertexCount = mesh.geometry.getAttribute('position').count;
  const plan = planClips(clips, framesPerClip);
  const frames = Object.values(plan).reduce((n, c) => n + c.frames, 0);
  const layout = vatLayout(vertexCount, frames);
  const size = layout.width * layout.height * 4;
  const positions = new Float32Array(size);
  const normals = new Float32Array(size);
  const index = mesh.geometry.getIndex();
  const triangles = index ? index.count / 3 : vertexCount / 3;
  const corner = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);

  const mixer = new THREE.AnimationMixer(root);
  const inverseRoot = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const n = new THREE.Vector3();

  root.updateMatrixWorld(true);
  inverseRoot.copy(root.matrixWorld).invert();
  for (const clip of clips) {
    const range = plan[clip.name];
    if (!range) continue;
    const action = mixer.clipAction(clip);
    action.play();
    for (let f = 0; f < range.frames; f++) {
      mixer.setTime((f / range.frames) * clip.duration);
      root.updateMatrixWorld(true);
      mesh.skeleton.update();
      const m = new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
      const frame = range.start + f;
      for (let v = 0; v < vertexCount; v++) {
        mesh.getVertexPosition(v, p).applyMatrix4(m);
        const { x, y } = texelOf(layout, v, frame);
        const i = (y * layout.width + x) * 4;
        positions[i] = p.x; positions[i + 1] = p.y; positions[i + 2] = p.z; positions[i + 3] = 1;
      }
      for (let t = 0; t < triangles; t++) {
        const [v0, v1, v2] = [corner(t, 0), corner(t, 1), corner(t, 2)];
        for (const [vertex, target] of [[v0, a], [v1, b], [v2, c]] as const) {
          const { x, y } = texelOf(layout, vertex, frame);
          const i = (y * layout.width + x) * 4;
          target.set(positions[i], positions[i + 1], positions[i + 2]);
        }
        n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
        for (const vertex of [v0, v1, v2]) {
          const { x, y } = texelOf(layout, vertex, frame);
          const i = (y * layout.width + x) * 4;
          normals[i] = n.x; normals[i + 1] = n.y; normals[i + 2] = n.z; normals[i + 3] = 0;
        }
      }
    }
    action.stop();
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  mesh.skeleton.pose();
  root.updateMatrixWorld(true);
  return { vertexCount, frames, layout, clips: plan, positions, normals };
}

/** Half-float textures from a bake: read with nearest filtering in the vertex shader, which keeps them small and portable. */
export function vatTextures(bake: Bake): { pos: THREE.DataTexture; nor: THREE.DataTexture } {
  const make = (data: Float32Array) => {
    const half = new Uint16Array(data.length);
    for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
    const tex = new THREE.DataTexture(half, bake.layout.width, bake.layout.height, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  };
  return { pos: make(bake.positions), nor: make(bake.normals) };
}

export interface VatOptions {
  roughness?: number;
  metalness?: number;
  /** Tint the head skin-toned and the legs darker by height; right for a person, wrong for a horse. Default true. */
  skin?: boolean;
  /** Charge across the field and start over (speed in units per second, length of the run), in step with any rider on it. */
  travel?: { speed: number; span: number };
}

/**
 * A standard material that moves each instance's vertices by playing its clip from the baked textures: per vertex it reads two
 * neighbouring frames and blends them. Per instance, aClip picks the clip and aPhase puts it out of step; per vertex, aVid says
 * which texel to read. Nothing here runs on the CPU per frame beyond updating the clock uniform.
 */
export function vatMaterial(uTime: { value: number }, bake: Bake, clipOrder: readonly string[], o: VatOptions = {}): { material: THREE.MeshStandardMaterial; textures: { pos: THREE.DataTexture; nor: THREE.DataTexture } } {
  const textures = vatTextures(bake);
  const clipData = Array.from({ length: 4 }, (_, i) => {
    const c = bake.clips[clipOrder[i] ?? clipOrder[0]];
    return new THREE.Vector4(c.start, c.frames, c.duration, 0);
  });
  const material = new THREE.MeshStandardMaterial({ roughness: o.roughness ?? 0.7, metalness: o.metalness ?? 0.2 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uVatPos = { value: textures.pos };
    shader.uniforms.uVatNor = { value: textures.nor };
    shader.uniforms.uVatLayout = { value: new THREE.Vector3(bake.layout.width, bake.layout.rowsPerFrame, bake.layout.height) };
    shader.uniforms.uVatClip = { value: clipData };
    shader.uniforms.uTravel = { value: new THREE.Vector2(o.travel?.speed ?? 0, o.travel?.span ?? 0) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uVatPos; uniform sampler2D uVatNor; uniform vec3 uVatLayout; uniform vec4 uVatClip[4]; uniform float uTime;
        uniform vec2 uTravel;
        attribute float aVid; attribute float aPhase; attribute float aClip;
        varying float vVatHeight;
        vec2 vatUv(float vid, float frame) {
          float row = frame * uVatLayout.y + floor(vid / uVatLayout.x);
          float col = mod(vid, uVatLayout.x);
          return (vec2(col, row) + 0.5) / vec2(uVatLayout.x, uVatLayout.z);
        }`)
      .replace('#include <beginnormal_vertex>', `
        vec4 vatClip = uVatClip[int(aClip + 0.5)];
        float vatTurn = uTime / vatClip.z + aPhase;
        float vatT = (vatTurn - floor(vatTurn)) * vatClip.y;
        float vatF0 = min(floor(vatT), vatClip.y - 1.0);
        float vatF1 = mod(vatF0 + 1.0, vatClip.y);
        float vatMix = min(vatT - vatF0, 0.999999);
        vec3 vatPos = mix(texture2D(uVatPos, vatUv(aVid, vatClip.x + vatF0)).xyz, texture2D(uVatPos, vatUv(aVid, vatClip.x + vatF1)).xyz, vatMix);
        vec3 objectNormal = normalize(mix(texture2D(uVatNor, vatUv(aVid, vatClip.x + vatF0)).xyz, texture2D(uVatNor, vatUv(aVid, vatClip.x + vatF1)).xyz, vatMix));
        vVatHeight = vatPos.y;
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vatPos;
        ${TRAVEL_GLSL}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vVatHeight;')
      // Skin on the head, a darker leg: the model has no texture, so tint by height.
      .replace('#include <color_fragment>', o.skin === false ? '#include <color_fragment>' : `#include <color_fragment>
        float vatHead = smoothstep(1.46, 1.52, vVatHeight);
        float vatLeg = 1.0 - smoothstep(0.35, 0.8, vVatHeight);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.45, 0.34), vatHead * 0.85);
        diffuseColor.rgb *= 1.0 - vatLeg * 0.35;`);
  };
  material.customProgramCacheKey = () => `vat-${o.skin === false ? 'plain' : 'skin'}-${o.travel ? 'travel' : 'still'}`;
  return { material, textures };
}
