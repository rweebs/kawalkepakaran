// The three.js scene for the /pantau fullscreen stage. Loaded only when someone opens fullscreen (dynamic import), so
// three.js never weighs on the normal page. Layout comes from ./pantau-3d (pure, tested); this file only draws.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { HEIGHT, KINDS, countUpTo, layout, yearMarks, type Kind, type StageItem } from './pantau-3d';

/** Same validated dark palette as the 2D charts: site blue, Fomo orange, alleged acts violet, responses aqua, against neutral. */
export const COLORS: Record<Kind, number> = { site: 0x3987e5, fomo: 0xd95926, act: 0x9085e9, resp: 0x199e70, against: 0xc3c2b7 };
const GOLD = 0xe3b341;

export interface StageScene {
  setDay(day: string): void;
  setVisible(kind: Kind, on: boolean): void;
  select(index: number | null): void;
  resize(): void;
  dispose(): void;
}

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  items: StageItem[];
  reducedMotion: boolean;
  onHover(index: number | null, x: number, y: number): void;
  onPick(index: number | null): void;
}

function textSprite(text: string, color = '#a3b1c6'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '600 52px system-ui, sans-serif';
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.fillText(text, 8, 48);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(4, 0.75, 1);
  return s;
}

export function createScene(o: SceneOptions): StageScene {
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0b1020, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1020, 30, 70);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(27, 4, 27);
  const controls = new OrbitControls(camera, o.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 6;
  controls.maxDistance = 70;
  controls.autoRotate = !o.reducedMotion;
  controls.autoRotateSpeed = 0.35;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  // The spine: Rahmat over time, with a head at "now".
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, HEIGHT, 16), new THREE.MeshBasicMaterial({ color: GOLD }));
  scene.add(spine);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshBasicMaterial({ color: GOLD }));
  head.position.y = HEIGHT / 2 + 0.6;
  scene.add(head);
  const name = textSprite('Rahmat Wibowo', '#f1f5f9');
  name.position.set(2.6, HEIGHT / 2 + 1.7, 0);
  scene.add(name);

  // Year rings with labels.
  for (const m of yearMarks(o.items)) {
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2) * 11.5, m.y, Math.sin((i / 96) * Math.PI * 2) * 11.5))),
      new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.6 }),
    );
    scene.add(ring);
    const label = textSprite(m.year);
    label.position.set(14, m.y, 0);
    scene.add(label);
  }

  // One point cloud and one set of spokes per kind, each holding its items in date order so the time slider is a draw range.
  const pos = layout(o.items);
  const byKind = new Map<Kind, { points: THREE.Points; lines: THREE.LineSegments; index: number[]; days: StageItem[]; shown: number }>();
  for (const k of KINDS) {
    const index = o.items.map((it, n) => (it.k === k ? n : -1)).filter((n) => n >= 0);
    const p = new Float32Array(index.length * 3);
    const l = new Float32Array(index.length * 6);
    index.forEach((n, j) => {
      const x = pos[n * 3];
      const y = pos[n * 3 + 1];
      const z = pos[n * 3 + 2];
      p.set([x, y, z], j * 3);
      // Spoke from the item to the spine at the same height ("points at him"); responses run from the spine outward.
      l.set(k === 'resp' ? [0, y, 0, x, y, z] : [x, y, z, 0, y, 0], j * 6);
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const points = new THREE.Points(pg, new THREE.PointsMaterial({ color: COLORS[k], size: k === 'against' ? 0.55 : 0.34, sizeAttenuation: true }));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(l, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: COLORS[k], transparent: true, opacity: k === 'resp' || k === 'against' ? 0.55 : 0.16 }));
    scene.add(points, lines);
    byKind.set(k, { points, lines, index, days: index.map((n) => o.items[n]), shown: index.length });
  }

  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
  marker.visible = false;
  scene.add(marker);

  const ray = new THREE.Raycaster();
  ray.params.Points = { threshold: 0.35 };
  const ndc = new THREE.Vector2();
  const pick = (ev: PointerEvent): number | null => {
    const r = o.canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const entries = [...byKind.values()].filter((v) => v.points.visible);
    for (const hit of ray.intersectObjects(entries.map((v) => v.points), false)) {
      const entry = entries.find((v) => v.points === hit.object);
      // Points past the time slider are not drawn; skip them.
      if (entry && hit.index !== undefined && hit.index < entry.shown) return entry.index[hit.index];
    }
    return null;
  };
  let downAt = 0;
  let downX = 0;
  let downY = 0;
  const onMove = (ev: PointerEvent) => {
    const i = pick(ev);
    o.onHover(i, ev.clientX, ev.clientY);
    o.canvas.classList.toggle('stage3d__canvas--pointer', i !== null);
  };
  const onDown = (ev: PointerEvent) => { downAt = performance.now(); downX = ev.clientX; downY = ev.clientY; };
  // A short press without dragging is a pick; a drag rotates the view.
  const onUp = (ev: PointerEvent) => { if (performance.now() - downAt < 300 && Math.hypot(ev.clientX - downX, ev.clientY - downY) < 6) o.onPick(pick(ev)); };
  o.canvas.addEventListener('pointermove', onMove);
  o.canvas.addEventListener('pointerdown', onDown);
  o.canvas.addEventListener('pointerup', onUp);

  let raf = 0;
  const loop = () => {
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };

  const api: StageScene = {
    setDay(day) {
      for (const v of byKind.values()) {
        v.shown = countUpTo(v.days, day);
        v.points.geometry.setDrawRange(0, v.shown);
        v.lines.geometry.setDrawRange(0, v.shown * 2);
      }
    },
    setVisible(kind, on) {
      const v = byKind.get(kind);
      if (v) { v.points.visible = on; v.lines.visible = on; }
    },
    select(index) {
      if (index === null) { marker.visible = false; return; }
      marker.position.set(pos[index * 3], pos[index * 3 + 1], pos[index * 3 + 2]);
      marker.visible = true;
      controls.autoRotate = false;
      controls.target.set(0, pos[index * 3 + 1], 0);
    },
    resize() {
      const w = o.canvas.clientWidth;
      const h = o.canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    },
    dispose() {
      cancelAnimationFrame(raf);
      o.canvas.removeEventListener('pointermove', onMove);
      o.canvas.removeEventListener('pointerdown', onDown);
      o.canvas.removeEventListener('pointerup', onUp);
      controls.dispose();
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => { (x as THREE.SpriteMaterial).map?.dispose(); x.dispose(); });
      });
      renderer.dispose();
    },
  };
  api.resize();
  loop();
  return api;
}
