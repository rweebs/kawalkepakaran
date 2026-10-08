import * as THREE from 'three';
import { cardShift, dharmaMix, formation, groundHeight, poseAt, viewOffsetX } from './stage-math';
import { createArmies } from './scene/army';
import { createBattle } from './scene/battle';
import { createChariot } from './scene/chariot';
import { createDressing } from './scene/dressing';
import { FX_LAYER, createBattleEffects, createContext, createLightShafts, type Part } from './scene/effects';
import { createEnvironment } from './scene/environment';
import { createDetail } from './scene/materials';
import { loadModels } from './scene/models';
import { dofFocus, easeToward, handheld, shadowFrame } from './scene/motion';
import { createPavilion } from './scene/pavilion';
import { createPost, type Post } from './scene/post';
import { degrade, qualityFor, shouldDropBloom, type Effects } from './scene/quality';
import { createProbe } from './scene/reflections';

export interface SceneInit { canvas: HTMLCanvasElement; reducedMotion: boolean; mobile: boolean; onLost?: () => void }
export interface KurukshetraScene {
  setProgress(p: number): void;
  resize(w: number, h: number): void;
  setPaused(p: boolean): void;
  dispose(): void;
}

// Under reduced motion the battle is shown as a still: arrows mid-flight, flags caught mid-wave.
const STILL_TIME = 3.2;

export function createScene({ canvas, reducedMotion, mobile, onLost }: SceneInit): KurukshetraScene {
  const quality = qualityFor(mobile, window.devicePixelRatio || 1, navigator.hardwareConcurrency || 8);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: mobile ? 'low-power' : 'high-performance' });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  camera.layers.enable(FX_LAYER); // the colour pass draws glows, shafts and dust; the post passes switch it off (see post.ts)
  const detail = createDetail(mobile ? 128 : 256);
  const ctx = createContext(quality, camera, detail);
  const dharma = formation(quality.warriorsPerSide, 'dharma', 5);
  const adharma = formation(quality.warriorsPerSide, 'adharma', 5);
  const environment = createEnvironment(scene, camera, ctx);
  const parts: Part[] = [
    environment,
    createArmies(ctx, dharma, adharma),
    createBattle(ctx),
    createChariot(ctx),
    createPavilion(ctx),
    createBattleEffects(ctx, dharma, adharma, groundHeight),
    createLightShafts(ctx, new THREE.Vector2(0.55, -0.83)),
    createDressing(ctx),
  ];
  for (const p of parts) scene.add(p.object);

  // The sky lights everything: reflections for the metals, and (desktop) a shadow-casting sun.
  const probe = createProbe(renderer, scene, environment.skyUniforms, mobile ? 64 : 128);
  let fx: Effects = { ao: quality.ao, dof: quality.dof, bloom: quality.bloom, shadows: quality.shadows };
  const setShadows = (on: boolean) => {
    renderer.shadowMap.enabled = on;
    environment.sun.castShadow = on;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const solid = !mats.some((x) => x.transparent) && m.name !== 'sky';
      m.castShadow = on && solid && m.name !== 'terrain';
      m.receiveShadow = on && solid;
      for (const x of mats) x.needsUpdate = true;
    });
  };
  if (fx.shadows) {
    const s = environment.sun.shadow;
    s.mapSize.set(quality.shadowMap, quality.shadowMap);
    s.bias = -0.0005;
    s.normalBias = 0.05;
    s.camera.near = 1;
    s.camera.far = 200;
    setShadows(true);
  }

  // The scene is complete and running with its procedural shapes; the real skinned models replace them if and when they arrive.
  let disposed = false;
  void loadModels().then((models) => {
    if (!models || disposed) return;
    for (const p of parts) p.upgrade?.(models);
    if (renderer.shadowMap.enabled) setShadows(true);
  });

  let post: Post | undefined;
  if (quality.bloom || quality.ao || quality.dof) post = createPost(renderer, scene, camera, fx);
  const frameMs: number[] = [];

  let progress = 0;
  let target = 0;
  let time = reducedMotion ? STILL_TIME : 0;
  let paused = false;
  let raf = 0;
  let last = 0;
  const look = new THREE.Vector3();
  const size = { w: 1, h: 1 };

  const draw = () => {
    const pose = poseAt(progress);
    // Keep the subject out from under the text card, which alternates sides from parva to parva.
    const offset = viewOffsetX(size.w, cardShift(progress), mobile);
    if (offset === 0) camera.clearViewOffset();
    else camera.setViewOffset(size.w, size.h, offset, 0, size.w, size.h);
    const hand = handheld(time, reducedMotion ? 0 : 1);
    camera.position.set(pose.pos.x + hand.x, pose.pos.y + hand.y, pose.pos.z);
    look.set(pose.look.x, pose.look.y, pose.look.z);
    camera.lookAt(look);
    camera.rotateZ(hand.roll);
    const mix = dharmaMix(progress);
    ctx.uTime.value = time;
    for (const p of parts) p.update(time, mix);
    probe.update(mix);

    if (fx.shadows) {
      const sun = environment.skyUniforms.uSun.value as THREE.Vector3;
      const f = shadowFrame(pose.look, pose.pos, sun);
      environment.sun.position.set(f.position.x, f.position.y, f.position.z);
      environment.sun.target.position.set(f.center.x, f.center.y, f.center.z);
      environment.sun.target.updateMatrixWorld();
      const c = environment.sun.shadow.camera;
      c.left = -f.halfSize; c.right = f.halfSize; c.top = f.halfSize; c.bottom = -f.halfSize;
      c.updateProjectionMatrix();
    }

    if (post) {
      const d = dofFocus(pose.pos, pose.look);
      post.setShot(d.focus, d.amount, time, mix);
      post.render();
    } else {
      renderer.render(scene, camera);
    }
  };

  const frame = (now: number) => {
    raf = 0;
    if (paused) return;
    const ms = now - last;
    const dt = Math.min(ms / 1000 || 0, 0.05);
    last = now;
    time += dt;
    // Real elapsed time, not the capped step: the camera reaches each shot as fast on a slow machine as on a fast one.
    progress = easeToward(progress, target, Math.min(ms / 1000 || 0, 0.5), 3);
    // Slow frames: shed the most expensive remaining effect, then judge the next stretch afresh.
    if (!mobile && ms > 0) {
      frameMs.push(ms);
      if (frameMs.length > 120) frameMs.shift();
      if (shouldDropBloom(frameMs)) {
        fx = degrade(fx);
        post?.setEffects(fx);
        if (!fx.shadows && renderer.shadowMap.enabled) setShadows(false);
        frameMs.length = 0;
      }
    }
    draw();
    raf = requestAnimationFrame(frame);
  };
  const start = () => { if (!raf && !paused) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

  const onContextLost = (e: Event) => { e.preventDefault(); stop(); onLost?.(); };
  canvas.addEventListener('webglcontextlost', onContextLost);

  draw();
  if (!reducedMotion) start();

  return {
    setProgress(p) {
      target = Math.min(1, Math.max(0, p));
      if (reducedMotion) { progress = target; draw(); }
    },
    resize(w, h) {
      size.w = w;
      size.h = h;
      renderer.setSize(w, h, false);
      post?.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      draw();
    },
    setPaused(p) {
      paused = p;
      if (p) stop();
      else if (!reducedMotion) start();
    },
    dispose() {
      disposed = true;
      stop();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
        for (const m of mats as (THREE.Material & { map?: THREE.Texture | null; emissiveMap?: THREE.Texture | null; normalMap?: THREE.Texture | null })[]) {
          m.map?.dispose();
          m.emissiveMap?.dispose();
          m.normalMap?.dispose();
          m.dispose();
        }
      });
      for (const t of [ctx.glow, ctx.soft, ctx.shadow, ctx.shaft, detail.terrain, detail.cloth, detail.wood, detail.metal]) t.dispose();
      for (const p of parts) p.dispose?.();
      probe.dispose();
      post?.dispose();
      renderer.dispose();
    },
  };
}
