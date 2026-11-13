// The three.js scene for the 3D relationship graph on /pantau (src/components/RelasiGraph3D.tsx). Loaded by dynamic import
// only once the section is on screen, so three.js never weighs on the first paint. Positions come from ./relasi-3d.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { EdgeKind, GNode, Source } from './relasi';
import type { Layout3, Link3 } from './relasi-3d';

/** Node hue by source; Rahmat is gold, the same gold as the timeline stage. A point-light scene has no node shapes,
 *  so the legend names each hue and the side panel always spells out the source in words. */
export const SOURCE_COLORS: Record<Source, number> = { rw: 0xe3b341, site: 0x3987e5, perkara: 0x9085e9, fomo: 0xd95926, laporan: 0xc3c2b7 };
export const EDGE_COLORS: Record<EdgeKind | 'member', number> = {
  'in-fact': 0xd95926, 'in-allegation': 0xf0a27c, 'out-response': 0x3987e5, against: 0xc9d1dc,
  'cross-fact': 0x199e70, 'cross-inference': 0x6fd9b3, structure: 0x475569, member: 0x475569,
};
const BG = 0x0b1020;

export interface RelasiSceneOptions {
  canvas: HTMLCanvasElement;
  nodes: GNode[];
  layout: Layout3;
  /** Day number (days since 1970) on which each node first appears; -Infinity or omitted = always there. */
  days?: number[];
  reducedMotion: boolean;
  labelOf(n: GNode): string;
  onHover(id: string | null, x: number, y: number): void;
  onPick(id: string | null): void;
}
export interface RelasiScene {
  select(id: string | null): void;
  /** Show only what exists by this day number (nodes grow in, links draw in); null shows everything. */
  setTime(day: number | null): void;
  /** Fly the camera to a node, or back to the overview when null. Jumps when reduced motion is on. */
  focus(id: string | null): void;
  setKindVisible(kind: EdgeKind | 'member', on: boolean): void;
  resize(): void;
  dispose(): void;
}

/** Sphere radius grows with the number of links the node has (square root, so a node with 100 links is not 100 times wider). */
const radiusFor = (degree: number) => Math.min(4.5, 0.35 + 0.3 * Math.sqrt(degree));
const isFaint = (k: string) => k === 'member' || k === 'structure';

function textSprite(text: string, color = '#cbd5e1', scale = 1): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '600 46px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.lineWidth = 8;
  g.strokeStyle = '#0b1020';
  g.strokeText(text.slice(0, 26), 256, 48);
  g.fillStyle = color;
  g.fillText(text.slice(0, 26), 256, 48);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(7 * scale, 1.31 * scale, 1);
  s.renderOrder = 10;
  return s;
}

export function createRelasiScene(o: RelasiSceneOptions): RelasiScene {
  const { nodes, layout } = o;
  const P = layout.positions;
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(BG, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, layout.radius * 1.6, layout.radius * 4);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, layout.radius * 8);
  camera.position.set(layout.radius * 0.8, layout.radius * 0.25, layout.radius * 1.05);
  const controls = new OrbitControls(camera, o.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = layout.radius * 4;
  controls.autoRotate = !o.reducedMotion;
  controls.autoRotateSpeed = 0.4;
  const home = camera.position.clone();
  let anim: { t0: number; dur: number; fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null = null;
  controls.addEventListener('start', () => { controls.autoRotate = false; anim = null; });

  // Nodes: one instanced sphere mesh, colour per instance.
  const geo = new THREE.SphereGeometry(1, 16, 12);
  const mat = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, nodes.length);
  const m4 = new THREE.Matrix4();
  const degree = new Array<number>(nodes.length).fill(0);
  for (const l of layout.links) { degree[l.a]++; degree[l.b]++; }
  const radii = degree.map(radiusFor);
  const days = o.days ?? nodes.map(() => -Infinity);
  let cutoff = Infinity;
  const linkDay = (l: Link3) => Math.max(days[l.a], days[l.b]);
  const byDay = (x: Link3, y: Link3) => { const a = linkDay(x); const b = linkDay(y); return a < b ? -1 : a > b ? 1 : 0; };
  const baseColor = nodes.map((n) => new THREE.Color(SOURCE_COLORS[n.source]));
  nodes.forEach((_, i) => {
    const r = radii[i];
    m4.compose(new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), new THREE.Quaternion(), new THREE.Vector3(r, r, r));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, baseColor[i]);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);

  // Links: one LineSegments per kind, split into links that touch Rahmat and the rest. Rahmat is linked to almost
  // everything, so his links are drawn very faint (they would otherwise read as a star around him) and the links
  // between the other entities carry the picture. A legend toggle flips both halves of a kind.
  const rwIdx = layout.index.get('rw') ?? -1;
  const baseOpacity = (k: string, touchesRw: boolean) => (touchesRw ? 0.025 : isFaint(k) ? 0.22 : 0.5);
  const kinds = [...new Set(layout.links.map((l) => l.kind))];
  const lines: { obj: THREE.LineSegments; kind: string; rw: boolean; lday: number[] }[] = [];
  for (const k of kinds) {
    for (const rw of [false, true]) {
      const ls = layout.links.filter((l) => l.kind === k && (l.a === rwIdx || l.b === rwIdx) === rw).sort(byDay);
      if (!ls.length) continue;
      const arr = new Float32Array(ls.length * 6);
      ls.forEach((l, j) => arr.set([P[l.a * 3], P[l.a * 3 + 1], P[l.a * 3 + 2], P[l.b * 3], P[l.b * 3 + 1], P[l.b * 3 + 2]], j * 6));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: EDGE_COLORS[k], transparent: true, opacity: baseOpacity(k, rw) }));
      scene.add(obj);
      lines.push({ obj, kind: k, rw, lday: ls.map(linkDay) });
    }
  }
  // Links of the selected node, drawn on top at full strength.
  const hotGeo = new THREE.BufferGeometry();
  const hot = new THREE.LineSegments(hotGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }));
  hot.renderOrder = 5;
  hot.visible = false;
  scene.add(hot);

  // Always-on labels for Rahmat and the four source hubs; the selection adds its neighbours.
  const labels: THREE.Sprite[] = [];
  const permanent: THREE.Sprite[] = [];
  nodes.forEach((n, i) => {
    if (n.kind !== 'hub' && n.kind !== 'center') return;
    const s = textSprite(o.labelOf(n), n.kind === 'center' ? '#f6d77a' : '#e2e8f0', 1.1);
    s.position.set(P[i * 3], P[i * 3 + 1] + radii[i] + 1.4, P[i * 3 + 2]);
    s.userData.i = i;
    scene.add(s);
    permanent.push(s);
  });
  const disposeSprite = (s: THREE.Sprite) => { (s.material as THREE.SpriteMaterial).map?.dispose(); s.material.dispose(); };
  const clearLabels = () => { for (const s of labels.splice(0)) { scene.remove(s); disposeSprite(s); } };

  const hidden = new Set<string>();
  const ring = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
  ring.visible = false;
  scene.add(ring);

  let selected: number | null = null;
  /** [neighbour index, link index] for every shown link of node i, heaviest first. */
  const neighbourIdx = (i: number): [number, number][] => {
    const out: [number, number][] = [];
    layout.links.forEach((l, k) => {
      if (hidden.has(l.kind) || days[l.a] > cutoff || days[l.b] > cutoff) return;
      if (l.a === i) out.push([l.b, k]);
      else if (l.b === i) out.push([l.a, k]);
    });
    return out.sort((x, y) => layout.links[y[1]].weight - layout.links[x[1]].weight);
  };

  const dimmed = new THREE.Color(0x1f2a44);
  const paint = () => {
    const near = selected === null ? null : new Set([selected, ...neighbourIdx(selected).map((x) => x[0])]);
    nodes.forEach((_, i) => mesh.setColorAt(i, near && !near.has(i) ? dimmed : baseColor[i]));
    mesh.instanceColor!.needsUpdate = true;
    for (const l of lines) (l.obj.material as THREE.LineBasicMaterial).opacity = near ? (l.rw ? 0.01 : 0.06) : baseOpacity(l.kind, l.rw);
  };

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (ev: PointerEvent): number | null => {
    const r = o.canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(mesh, false)[0]?.instanceId ?? null;
  };
  let downAt = 0, downX = 0, downY = 0;
  const onMove = (ev: PointerEvent) => {
    const i = pick(ev);
    o.onHover(i === null ? null : nodes[i].id, ev.clientX, ev.clientY);
    o.canvas.classList.toggle('rg3d__canvas--pointer', i !== null);
  };
  const onDown = (ev: PointerEvent) => { downAt = performance.now(); downX = ev.clientX; downY = ev.clientY; };
  // A short press without dragging is a pick; a drag rotates the view.
  const onUp = (ev: PointerEvent) => {
    if (performance.now() - downAt < 300 && Math.hypot(ev.clientX - downX, ev.clientY - downY) < 6) {
      const i = pick(ev);
      o.onPick(i === null ? null : nodes[i].id);
    }
  };
  o.canvas.addEventListener('pointermove', onMove);
  o.canvas.addEventListener('pointerdown', onDown);
  o.canvas.addEventListener('pointerup', onUp);

  let raf = 0;
  const loop = () => {
    if (anim) {
      const k = Math.min(1, (performance.now() - anim.t0) / anim.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(anim.fromP, anim.toP, e);
      controls.target.lerpVectors(anim.fromT, anim.toT, e);
      if (k >= 1) anim = null;
    }
    controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };

  const api: RelasiScene = {
    select(id) {
      clearLabels();
      const sel = id === null ? -1 : nodes.findIndex((n) => n.id === id);
      selected = sel >= 0 ? sel : null;
      if (selected === null) { hot.visible = false; ring.visible = false; paint(); return; }
      const nb = neighbourIdx(selected);
      const arr = new Float32Array(nb.length * 6);
      nb.forEach(([other], j) => arr.set([P[selected! * 3], P[selected! * 3 + 1], P[selected! * 3 + 2], P[other * 3], P[other * 3 + 1], P[other * 3 + 2]], j * 6));
      hotGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      hotGeo.computeBoundingSphere();
      hot.visible = nb.length > 0;
      const r = radii[selected] * 1.4 + 0.3;
      ring.position.set(P[selected * 3], P[selected * 3 + 1], P[selected * 3 + 2]);
      ring.scale.set(r, r, r);
      ring.visible = true;
      // Label the selection and its heaviest neighbours (hubs and Rahmat already carry a permanent label).
      const show = [selected, ...nb.map((x) => x[0]).slice(0, 14)].filter((i) => nodes[i].kind !== 'hub' && nodes[i].kind !== 'center');
      for (const i of show) {
        const s = textSprite(o.labelOf(nodes[i]), i === selected ? '#ffffff' : '#a3b1c6');
        s.position.set(P[i * 3], P[i * 3 + 1] + radii[i] + 1.2, P[i * 3 + 2]);
        scene.add(s);
        labels.push(s);
      }
      controls.autoRotate = false;
      paint();
    },
    focus(id) {
      controls.autoRotate = false;
      const i = id === null ? -1 : nodes.findIndex((n) => n.id === id);
      let toT = new THREE.Vector3(0, 0, 0);
      let toP = home.clone();
      if (i >= 0) {
        toT = new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        const dir = camera.position.clone().sub(controls.target).normalize();
        toP = toT.clone().add(dir.multiplyScalar(Math.max(16, layout.radius * 0.45)));
      }
      if (o.reducedMotion) { camera.position.copy(toP); controls.target.copy(toT); anim = null; return; }
      anim = { t0: performance.now(), dur: 1300, fromP: camera.position.clone(), toP, fromT: controls.target.clone(), toT };
    },
    setTime(day) {
      cutoff = day === null ? Infinity : day;
      const q = new THREE.Quaternion();
      nodes.forEach((_, i) => {
        const r = days[i] <= cutoff ? radii[i] : 0.0001;
        m4.compose(new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), q, new THREE.Vector3(r, r, r));
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      for (const l of lines) {
        let lo = 0;
        let hi = l.lday.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (l.lday[mid] <= cutoff) lo = mid + 1; else hi = mid; }
        l.obj.geometry.setDrawRange(0, lo * 2);
      }
      for (const s of permanent) s.visible = days[s.userData.i as number] <= cutoff;
      api.select(selected === null ? null : nodes[selected].id);
    },
    setKindVisible(kind, on) {
      if (on) hidden.delete(kind); else hidden.add(kind);
      for (const l of lines) if (l.kind === kind) l.obj.visible = on;
      api.select(selected === null ? null : nodes[selected].id);
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
      clearLabels();
      permanent.forEach(disposeSprite);
      controls.dispose();
      geo.dispose();
      mat.dispose();
      mesh.dispose();
      for (const l of lines) { l.obj.geometry.dispose(); (l.obj.material as THREE.Material).dispose(); }
      hotGeo.dispose();
      (hot.material as THREE.Material).dispose();
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      renderer.dispose();
    },
  };
  api.resize();
  loop();
  return api;
}
