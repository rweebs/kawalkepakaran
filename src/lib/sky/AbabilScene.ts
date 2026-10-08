import * as THREE from 'three';
import { makeStars } from './layout';
import { makeFlock, stepFlock, birdTarget, DEFAULT_FLOCK } from './flock';
import { CAMERA_POSES, type SkyState } from './states';
import { BIRD_POSITIONS, STONE_LOCAL, STONE_RADIUS } from './bird-model';

export interface SceneInit { canvas: HTMLCanvasElement; reducedMotion: boolean }
export interface AbabilScene {
  setState(s: SkyState): void;
  resize(w: number, h: number): void;
  setPaused(p: boolean): void;
  dispose(): void;
}

const BIRD_COUNT = 96;
const BIRD_SCALE = 0.8;

function birdGeometry(phases: Float32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BIRD_POSITIONS), 3));
  // one phase value per instance
  g.setAttribute('phase', new THREE.InstancedBufferAttribute(phases, 1));
  return g;
}

export function createScene({ canvas, reducedMotion }: SceneInit): AbabilScene {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr <= 1, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

  // star dome
  const stars = makeStars(900, 7, 60);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(stars.flatMap((s) => [s.x, s.y, s.z])), 3));
  const starMat = new THREE.PointsMaterial({ size: 0.12, color: 0xcfd8ff, sizeAttenuation: true, transparent: true, opacity: 0.9 });
  scene.add(new THREE.Points(starGeo, starMat));

  // ababil flock
  const phases = new Float32Array(BIRD_COUNT).map((_, i) => (i * 0.37) % (Math.PI * 2));
  const birdMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBody: { value: new THREE.Color('#58647f') },
      uRim: { value: new THREE.Color('#c4cfe8') },
    },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      varying float vTip;
      void main() {
        vec3 p = position;
        float flap = sin(uTime * 9.0 + phase);
        p.y += abs(p.x) * flap * 0.7;
        vTip = smoothstep(0.25, 1.0, abs(p.x)) * 0.7 + smoothstep(0.3, 0.6, abs(p.z)) * 0.15;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uBody;
      uniform vec3 uRim;
      varying float vTip;
      void main() { gl_FragColor = vec4(mix(uBody, uRim, vTip), 1.0); }`,
    side: THREE.DoubleSide,
  });
  const birdGeo = birdGeometry(phases);
  const mesh = new THREE.InstancedMesh(birdGeo, birdMat, BIRD_COUNT);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // the stone each bird carries
  const stoneGeo = new THREE.IcosahedronGeometry(STONE_RADIUS, 1);
  const stoneMat = new THREE.MeshBasicMaterial({ color: 0xe08a2e });
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, BIRD_COUNT);
  stones.frustumCulled = false;
  scene.add(stones);
  const stoneOffset = new THREE.Vector3(STONE_LOCAL.x, STONE_LOCAL.y, STONE_LOCAL.z);
  const stoneDummy = new THREE.Object3D();

  let birds = makeFlock(BIRD_COUNT, 11);
  let state: SkyState = 'circle';
  let time = 0;
  let paused = false;
  let raf = 0;
  let last = performance.now();
  const dummy = new THREE.Object3D();
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tgtPos = new THREE.Vector3();
  const tgtLook = new THREE.Vector3();

  function applyPose(snap: boolean) {
    const pose = CAMERA_POSES[state];
    tgtPos.set(pose.pos.x, pose.pos.y, pose.pos.z);
    tgtLook.set(pose.look.x, pose.look.y, pose.look.z);
    if (snap) { camPos.copy(tgtPos); camLook.copy(tgtLook); }
  }

  function stepBirds(dt: number) {
    const targets = birds.map((_, i) => birdTarget(state, i, time));
    birds = stepFlock(birds, targets, DEFAULT_FLOCK, dt);
  }

  function writeBirds() {
    birds.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      if (Math.hypot(b.vx, b.vy, b.vz) > 1e-4) dummy.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
      dummy.scale.setScalar(BIRD_SCALE);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      stoneDummy.position.copy(stoneOffset).multiplyScalar(BIRD_SCALE).applyQuaternion(dummy.quaternion).add(dummy.position);
      stoneDummy.scale.setScalar(BIRD_SCALE * 1.5);
      stoneDummy.updateMatrix();
      stones.setMatrixAt(i, stoneDummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    stones.instanceMatrix.needsUpdate = true;
  }

  function render() {
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    birdMat.uniforms.uTime.value = time;
    writeBirds();
    renderer.render(scene, camera);
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) {
      time += dt;
      stepBirds(dt);
      const k = 1 - Math.exp(-dt * 2.5);
      camPos.lerp(tgtPos, k);
      camLook.lerp(tgtLook, k);
      render();
    }
    raf = requestAnimationFrame(frame);
  }

  function settle() {
    for (let i = 0; i < 120; i++) stepBirds(1 / 30);
    render();
  }

  applyPose(true);
  if (reducedMotion) settle();
  else raf = requestAnimationFrame(frame);

  return {
    setState(s) {
      state = s;
      applyPose(reducedMotion);
      if (reducedMotion) { time += 1; settle(); }
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      if (reducedMotion) render();
    },
    setPaused(p) { paused = p; },
    dispose() {
      cancelAnimationFrame(raf);
      for (const x of [starGeo, birdGeo, stoneGeo]) x.dispose();
      for (const m of [starMat, birdMat, stoneMat]) m.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
