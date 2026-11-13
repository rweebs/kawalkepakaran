import * as THREE from 'three';
import { cardShift, dharmaMix, formation, groundHeight, poseAt, viewOffsetX, type Pose } from './stage-math';
import { createArmies } from './scene/army';
import { createBattle } from './scene/battle';
import { createChariot, type ChariotRig } from './scene/chariot';
import { createDressing } from './scene/dressing';
import { FX_LAYER, createBattleEffects, createContext, createLightShafts, type Part } from './scene/effects';
import { createEnvironment } from './scene/environment';
import { createDetail } from './scene/materials';
import { loadModels } from './scene/models';
import { dofFocus, easeToward, handheld, shadowFrame } from './scene/motion';
import { createPavilion } from './scene/pavilion';
import { createPost, type Post } from './scene/post';
import { degrade, gameQuality, qualityFor, shouldDropBloom, type Effects, type Quality } from './scene/quality';
import { createProbe } from './scene/reflections';

export interface SceneInit { canvas: HTMLCanvasElement; reducedMotion: boolean; mobile: boolean; onLost?: () => void; game?: true }
export interface KurukshetraScene {
  setProgress(p: number): void;
  resize(w: number, h: number): void;
  setPaused(p: boolean): void;
  dispose(): void;
  game?: {
    camera: THREE.PerspectiveCamera;
    root: THREE.Group;
    setPose(p: Pose | null): void;
    onFrame(cb: (time: number, dt: number) => void): () => void;
    chariot: ChariotRig;
    /** The game tier the scene was built with (see gameQuality). */
    quality: Quality;
    /** The scene's own procedural textures, for the game's layers to share; the scene disposes them. */
    textures: { glow: THREE.Texture; soft: THREE.Texture; shaft: THREE.Texture };
    /** How fast scene time runs, 1 being normal: Mata's slow motion and the outro's. The listeners still get real dt. */
    setTimeScale(k: number): void;
    setPixelRatio(r: number): void;
    /** Applies the shadows again when they are on, so layers added since cast and receive them. */
    refreshShadows(): void;
  };
}

// Under reduced motion the battle is shown as a still: arrows mid-flight, flags caught mid-wave.
const STILL_TIME = 3.2;
// The game's camera has no handheld drift: the chase camera has its own shake.
const STILL_HAND = { x: 0, y: 0, roll: 0 } as const;

export function createScene({ canvas, reducedMotion, mobile, onLost, game }: SceneInit): KurukshetraScene {
  const base = qualityFor(mobile, window.devicePixelRatio || 1, navigator.hardwareConcurrency || 8);
  const quality = game ? gameQuality(base) : base;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: mobile ? 'low-power' : 'high-performance' });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  camera.layers.enable(FX_LAYER); // the colour pass draws glows, shafts and dust; the post passes switch it off (see post.ts)
  // The ground's grit keeps its scale on the game's larger terrain: 90 repeats on the page's 260 m.
  const detail = createDetail(mobile ? 128 : 256, (90 * quality.terrainSize) / 260);
  const ctx = createContext(quality, camera, detail);
  const dharma = formation(quality.warriorsPerSide, 'dharma', 5);
  const adharma = formation(quality.warriorsPerSide, 'adharma', 5);
  const environment = createEnvironment(scene, camera, ctx, { game: !!game });
  // Game mode calms the battle: the ranks stand still, the chariot is the player's, and the fighting, the pavilion, the clash
  // flashes and the light shafts are left out. The parts are still made in the page's order; the chariot is kept for the handle.
  const parts: Part[] = [
    environment,
    createArmies(ctx, dharma, adharma, { still: !!game }),
    ...(game ? [] : [createBattle(ctx)]),
  ];
  const chariot = createChariot(ctx, { drivable: !!game });
  parts.push(
    chariot,
    ...(game ? [] : [createPavilion(ctx)]),
    createBattleEffects(ctx, dharma, adharma, groundHeight, { flashes: !game }),
    // In the game the page's horizon shafts would stand 111–147 m from (0, −10), inside the play disc.
    ...(game ? [] : [createLightShafts(ctx, new THREE.Vector2(0.55, -0.83))]),
    createDressing(ctx),
  );
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
  let timeScale = 1;
  let paused = false;
  let raf = 0;
  let last = 0;
  const look = new THREE.Vector3();
  let poseOverride: Pose | null = null;
  const frameListeners = new Set<(time: number, dt: number) => void>();
  const root = new THREE.Group();
  if (game) scene.add(root);
  const size = { w: 1, h: 1 };

  const draw = () => {
    const pose = poseOverride ?? poseAt(progress);
    // Keep the subject out from under the text card, which alternates sides from parva to parva.
    const offset = viewOffsetX(size.w, cardShift(progress), mobile);
    if (game || offset === 0) camera.clearViewOffset();
    else camera.setViewOffset(size.w, size.h, offset, 0, size.w, size.h);
    const hand = game ? STILL_HAND : handheld(time, reducedMotion ? 0 : 1);
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
    if (paused || disposed) return;
    const ms = now - last;
    const dt = Math.min(ms / 1000 || 0, 0.05);
    last = now;
    time += dt * timeScale;
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
    for (const cb of frameListeners) cb(time, dt);
    // A listener may have disposed the scene (the game tearing it down after an error): draw nothing, schedule nothing.
    if (disposed) return;
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
    game: game ? {
      camera,
      root,
      setPose(p) { poseOverride = p; },
      onFrame(cb) { frameListeners.add(cb); return () => { frameListeners.delete(cb); }; },
      chariot: chariot.rig!, // drivable in game mode, so it always has its rig
      quality,
      textures: { glow: ctx.glow, soft: ctx.soft, shaft: ctx.shaft },
      // Scene time never runs backwards, and a scale that is not a finite number counts as 1: NaN would stay in the clock.
      setTimeScale(k) { timeScale = Number.isFinite(k) ? Math.max(0, k) : 1; },
      setPixelRatio(r) { renderer.setPixelRatio(r); post?.setPixelRatio(r); },
      refreshShadows() { if (renderer.shadowMap.enabled) setShadows(true); },
    } : undefined,
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
      frameListeners.clear();
      poseOverride = null;
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
