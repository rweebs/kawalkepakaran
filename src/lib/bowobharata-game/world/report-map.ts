// The record map in 3D, for the chapter-report screens (src/components/bowobharata-game/ReportMap.tsx), which load it by
// dynamic import as its own chunk. It follows the /pantau scene (src/lib/relasi-scene.ts): one instanced sphere mesh for
// the nodes, one LineSegments per link kind with the links that touch the Pelapor in their own and drawn faintest, white
// lines and a wireframe ring for the selection, fog, and a slow, damped orbit. Unlike /pantau it labels nothing: every
// word, name and count stays in the DOM around the canvas. Bright and dim changes ease over 0.6 s, so nothing here
// changes brightness or opacity faster than 2 Hz. It imports only three and OrbitControls: positions, colours and sizes
// come in as plain numbers (report-map-view.ts's sceneInput).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** The link kinds; the same union as MapLinkKind in report-types.ts, which this module does not import. */
export type ReportLinkKind = 'in-allegation' | 'out-response' | 'against' | 'member';

/** Link colours by kind: /pantau's, and LINK_HEX in report-map-view.ts. */
export const LINK_COLORS: Readonly<Record<ReportLinkKind, number>> = { 'in-allegation': 0xf0a27c, 'out-response': 0x3987e5, against: 0xc9d1dc, member: 0x475569 };
const KINDS = Object.keys(LINK_COLORS) as ReportLinkKind[];
const BG = 0x0b1020;
const DIM = 0x1f2a44;
/** The scale of a node that is not on the map yet: too small to see or to hit. */
const HIDDEN = 1e-4;
/** How long a bright or dim change takes, in ms. */
export const EASE_MS = 600;

export interface ReportMapInput {
  /** x, y and z per node. */
  pos: ArrayLike<number>;
  /** The layout's extent. */
  radius: number;
  /** Each node's colour, as 0xrrggbb. */
  colors: readonly number[];
  /** Each node's radius. */
  radii: readonly number[];
  /** The links; `center` when one end is the Pelapor. */
  links: readonly { a: number; b: number; kind: ReportLinkKind; center: boolean }[];
}

/** A link's opacity while both its ends are bright: the Pelapor's links faintest (he is linked to almost every node), then membership, then the rest. */
export const linkOpacity = (kind: ReportLinkKind, center: boolean): number => (center ? 0.025 : kind === 'member' ? 0.22 : 0.5);
/** A link's opacity while either end is dim, which happens only when the map has a focus. */
export const dimLinkOpacity = (center: boolean): number => (center ? 0.01 : 0.06);

/** The fog, the camera and the orbit for a layout of this extent. */
export function sceneSettings(radius: number, reducedMotion: boolean) {
  return {
    fog: { near: radius * 1.6, far: radius * 4 },
    camera: { fov: 50, near: 0.5, far: radius * 8, position: [radius * 0.8, radius * 0.25, radius * 1.05] as [number, number, number] },
    controls: { dampingFactor: 0.08, minDistance: 8, maxDistance: radius * 4, autoRotate: !reducedMotion, autoRotateSpeed: 0.4 },
  };
}

/** Ease in and out (quadratic), 0..1 to 0..1. */
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export interface ReportObjects {
  group: THREE.Group;
  nodes: THREE.InstancedMesh;
  /** The links, one LineSegments per kind and side of the center split. Each has userData { kind, center, links }: its link indices, in order. */
  lines: THREE.LineSegments[];
  /** The selection's links, drawn on top. */
  hot: THREE.LineSegments;
  /** The wireframe ring around the selection. */
  ring: THREE.Mesh;
  /** Shows, brightens and selects (see ReportMapApi.setState); `now` in ms. The first call snaps, later ones ease. */
  setState(shown: readonly boolean[], bright: readonly boolean[], selected: number | null, now: number): void;
  /** Moves an ease on to `now` (ms). True when it wrote new colours or opacities, that is when a frame should be drawn. */
  tick(now: number): boolean;
  /** The nearest shown node under the ray, or null. */
  pick(ray: THREE.Raycaster): number | null;
  dispose(): void;
}

/** The scene's objects, with no renderer: so they can be built and checked in node. */
export function buildReportObjects(input: ReportMapInput): ReportObjects {
  const { pos: P, radii, colors, links } = input;
  const n = radii.length;
  const group = new THREE.Group();

  // Nodes: one instanced sphere mesh, a colour per instance.
  const nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial(), n);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const at = new THREE.Vector3();
  const size = new THREE.Vector3();
  const place = (i: number, r: number) => {
    nodes.setMatrixAt(i, m4.compose(at.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), q, size.set(r, r, r)));
  };
  const base = colors.map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    place(i, radii[i]);
    nodes.setColorAt(i, base[i]);
  }
  nodes.instanceMatrix.needsUpdate = true;
  nodes.computeBoundingSphere();
  group.add(nodes);

  // Links: one LineSegments per kind, split into the links that touch the Pelapor and the rest. The material holds the
  // kind's colour and its opacity with both ends bright; a vertex alpha per link scales it down for dim links (under a
  // focus one kind holds bright and dim links at once) and to nothing for links not on the map yet, and eases.
  const lines: THREE.LineSegments[] = [];
  const slot: { alpha: Float32Array; attr: THREE.BufferAttribute; at: number }[] = [];
  for (const kind of KINDS) {
    for (const center of [false, true]) {
      const ids = links.flatMap((l, j) => (l.kind === kind && l.center === center ? [j] : []));
      if (ids.length === 0) continue;
      const xyz = new Float32Array(ids.length * 6);
      ids.forEach((j, m) => {
        const { a, b } = links[j];
        xyz.set([P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], m * 6);
      });
      const rgba = new Float32Array(ids.length * 8).fill(1);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(xyz, 3));
      const attr = new THREE.BufferAttribute(rgba, 4);
      geometry.setAttribute('color', attr);
      const material = new THREE.LineBasicMaterial({ color: LINK_COLORS[kind], vertexColors: true, transparent: true, opacity: linkOpacity(kind, center), depthWrite: false });
      const obj = new THREE.LineSegments(geometry, material);
      obj.userData = { kind, center, links: ids };
      ids.forEach((j, m) => { slot[j] = { alpha: rgba, attr, at: m }; });
      lines.push(obj);
      group.add(obj);
    }
  }

  // The selection: its links in white on top, and a wireframe ring. Sized once for the busiest node.
  const degree = new Array<number>(n).fill(0);
  for (const l of links) { degree[l.a]++; degree[l.b]++; }
  const hotXyz = new Float32Array(degree.reduce((m, d) => Math.max(m, d), 0) * 6);
  const hotAttr = new THREE.BufferAttribute(hotXyz, 3);
  const hotGeo = new THREE.BufferGeometry();
  hotGeo.setAttribute('position', hotAttr);
  hotGeo.setDrawRange(0, 0);
  const hot = new THREE.LineSegments(hotGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }));
  hot.renderOrder = 5;
  hot.frustumCulled = false;
  hot.visible = false;
  const ring = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
  ring.visible = false;
  group.add(hot, ring);

  // The state, and the ease between two states: from → to over EASE_MS from t0. `cur` is what the buffers hold.
  const shownNow = new Array<boolean>(n).fill(true);
  const from = base.map((c) => c.clone());
  const to = base.map((c) => c.clone());
  const cur = base.map((c) => c.clone());
  const aFrom = new Float32Array(links.length).fill(1);
  const aTo = new Float32Array(links.length).fill(1);
  const aCur = new Float32Array(links.length).fill(1);
  let t0 = 0;
  let easing = false;
  let primed = false;

  const write = (e: number) => {
    for (let i = 0; i < n; i++) nodes.setColorAt(i, cur[i].lerpColors(from[i], to[i], e));
    if (nodes.instanceColor) nodes.instanceColor.needsUpdate = true;
    for (let j = 0; j < links.length; j++) {
      const v = aFrom[j] + (aTo[j] - aFrom[j]) * e;
      aCur[j] = v;
      const s = slot[j];
      s.alpha[s.at * 8 + 3] = v;
      s.alpha[s.at * 8 + 7] = v;
    }
    for (const l of lines) (l.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  };

  const select = (sel: number | null) => {
    if (sel === null || !shownNow[sel]) {
      hot.visible = false;
      ring.visible = false;
      return;
    }
    let m = 0;
    for (const l of links) {
      if (!shownNow[l.a] || !shownNow[l.b]) continue;
      const other = l.a === sel ? l.b : l.b === sel ? l.a : -1;
      if (other < 0) continue;
      hotXyz.set([P[sel * 3], P[sel * 3 + 1], P[sel * 3 + 2], P[other * 3], P[other * 3 + 1], P[other * 3 + 2]], m * 6);
      m++;
    }
    hotAttr.needsUpdate = true;
    hotGeo.setDrawRange(0, m * 2);
    hot.visible = m > 0;
    const r = radii[sel] * 1.4 + 0.3;
    ring.position.set(P[sel * 3], P[sel * 3 + 1], P[sel * 3 + 2]);
    ring.scale.set(r, r, r);
    ring.visible = true;
  };

  const tick = (now: number): boolean => {
    if (!easing) return false;
    const k = Math.min(1, Math.max(0, (now - t0) / EASE_MS));
    write(ease(k));
    if (k >= 1) easing = false;
    return true;
  };

  return {
    group,
    nodes,
    lines,
    hot,
    ring,
    tick,
    setState(shown, bright, selected, now) {
      tick(now);
      let moved = false;
      for (let i = 0; i < n; i++) {
        const s = !!shown[i];
        if (s !== shownNow[i]) {
          shownNow[i] = s;
          place(i, s ? radii[i] : HIDDEN);
          moved = true;
        }
        // A node off the map turns to the background, so it fades in from there when it comes back.
        to[i].setHex(!s ? BG : bright[i] ? colors[i] : DIM);
        from[i].copy(primed ? cur[i] : to[i]);
      }
      if (moved) nodes.instanceMatrix.needsUpdate = true;
      links.forEach((l, j) => {
        const on = shownNow[l.a] && shownNow[l.b];
        aTo[j] = !on ? 0 : bright[l.a] && bright[l.b] ? 1 : dimLinkOpacity(l.center) / linkOpacity(l.kind, l.center);
        aFrom[j] = primed ? aCur[j] : aTo[j];
      });
      t0 = now;
      if (primed) easing = true;
      else {
        primed = true;
        easing = false;
        write(1);
      }
      select(selected);
    },
    pick(ray) {
      for (const hit of ray.intersectObject(nodes, false)) {
        if (hit.instanceId !== undefined && shownNow[hit.instanceId]) return hit.instanceId;
      }
      return null;
    },
    dispose() {
      group.removeFromParent();
      nodes.geometry.dispose();
      (nodes.material as THREE.Material).dispose();
      nodes.dispose();
      for (const l of [...lines, hot]) {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    },
  };
}

export interface ReportMapApi {
  /**
   * The nodes on the map, the bright ones among them, and the selected node (null for none, or when it is not shown).
   * Changes of brightness ease over 0.6 s; nodes join and leave the map at once.
   */
  setState(shown: readonly boolean[], bright: readonly boolean[], selected: number | null): void;
  /** Fits the drawing to the canvas's size. */
  resize(): void;
  /** Stops the loop and the listeners, frees every geometry, material and the controls, then the renderer and its context. */
  dispose(): void;
}

/**
 * The live scene on `canvas`. It draws only while the page is visible and the canvas on screen, and only when something
 * moved: the orbit, an ease or a resize. `onHover` gets the node under a mouse (or null) with the pointer's client
 * position; `onPick` the node under a short press without a drag, or null for empty space.
 */
export function createReportMap(
  o: ReportMapInput & { canvas: HTMLCanvasElement; reducedMotion: boolean; onHover(i: number | null, x: number, y: number): void; onPick(i: number | null): void },
): ReportMapApi {
  const objects = buildReportObjects(o);
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true });
    return start(o, objects, renderer);
  } catch (e) {
    objects.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
    throw e;
  }
}

function start(
  o: ReportMapInput & { canvas: HTMLCanvasElement; reducedMotion: boolean; onHover(i: number | null, x: number, y: number): void; onPick(i: number | null): void },
  objects: ReportObjects,
  renderer: THREE.WebGLRenderer,
): ReportMapApi {
  const s = sceneSettings(o.radius, o.reducedMotion);
  // Light on purpose: the game's own scene may still be drawing behind the report. No shadows, no post-processing.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(BG, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, s.fog.near, s.fog.far);
  const camera = new THREE.PerspectiveCamera(s.camera.fov, 1, s.camera.near, s.camera.far);
  camera.position.set(...s.camera.position);
  const controls = new OrbitControls(camera, o.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = s.controls.dampingFactor;
  controls.minDistance = s.controls.minDistance;
  controls.maxDistance = s.controls.maxDistance;
  controls.autoRotate = s.controls.autoRotate;
  controls.autoRotateSpeed = s.controls.autoRotateSpeed;
  controls.update();
  scene.add(objects.group);

  let raf = 0;
  let last = 0;
  let dirty = true;
  let busy = false;
  let onScreen = true;
  let disposed = false;
  let selected: number | null = null;
  let lastShown: boolean[] | null = null;
  let lastBright: boolean[] | null = null;
  const same = (a: readonly boolean[], b: boolean[] | null) => b !== null && a.length === b.length && a.every((v, i) => !!v === b[i]);

  const frame = (t: number) => {
    raf = 0;
    if (disposed) return;
    if (document.hidden || !onScreen) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    const moved = controls.update(dt);
    const eased = objects.tick(performance.now());
    if (moved || eased || dirty) {
      renderer.render(scene, camera);
      dirty = false;
    }
    // Idle when nothing moves: a press, a change, an ease or the page coming back wakes it.
    if (!raf && (moved || eased || busy || controls.autoRotate)) raf = requestAnimationFrame(frame);
    else if (!raf) last = 0;
  };
  const wake = () => {
    dirty = true;
    if (!raf && !disposed) raf = requestAnimationFrame(frame);
  };

  const onStart = () => {
    busy = true;
    controls.autoRotate = false;
    wake();
  };
  const onEnd = () => {
    busy = false;
    wake();
  };
  controls.addEventListener('start', onStart);
  controls.addEventListener('end', onEnd);
  controls.addEventListener('change', wake);

  const onVisibility = () => {
    if (!document.hidden) wake();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1]?.isIntersecting ?? true;
      if (onScreen) wake();
    })
    : null;
  io?.observe(o.canvas);

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickAt = (ev: PointerEvent): number | null => {
    const r = o.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    // The orbit may have moved the camera since the last frame was drawn.
    camera.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
    return objects.pick(ray);
  };
  let downAt = 0;
  let downX = 0;
  let downY = 0;
  // A finger's move is a turn, so only a mouse or pen hovers; a tap shows the tooltip instead, until the next tap.
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerType !== 'touch') o.onHover(pickAt(ev), ev.clientX, ev.clientY);
  };
  const onDown = (ev: PointerEvent) => {
    downAt = performance.now();
    downX = ev.clientX;
    downY = ev.clientY;
  };
  // A short press without a drag is a pick; a drag turns the map.
  const onUp = (ev: PointerEvent) => {
    if (performance.now() - downAt >= 300 || Math.hypot(ev.clientX - downX, ev.clientY - downY) >= 6) return;
    const i = pickAt(ev);
    o.onPick(i);
    if (ev.pointerType === 'touch') o.onHover(i, ev.clientX, ev.clientY);
  };
  const onLeave = (ev: PointerEvent) => {
    if (ev.pointerType !== 'touch') o.onHover(null, 0, 0);
  };
  o.canvas.addEventListener('pointermove', onMove);
  o.canvas.addEventListener('pointerdown', onDown);
  o.canvas.addEventListener('pointerup', onUp);
  o.canvas.addEventListener('pointerleave', onLeave);

  const api: ReportMapApi = {
    setState(shown, bright, sel) {
      if (disposed) return;
      const next = sel !== null && shown[sel] ? sel : null;
      // The same state again (a screen re-rendering) neither restarts the ease nor wakes the loop.
      if (next === selected && same(shown, lastShown) && same(bright, lastBright)) return;
      // Picking a node stops the auto-rotation, as on /pantau.
      if (next !== null && next !== selected) controls.autoRotate = false;
      selected = next;
      lastShown = shown.map((v) => !!v);
      lastBright = bright.map((v) => !!v);
      objects.setState(shown, bright, next, performance.now());
      wake();
    },
    resize() {
      if (disposed) return;
      const w = Math.max(1, o.canvas.clientWidth);
      const h = Math.max(1, o.canvas.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      wake();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      o.canvas.removeEventListener('pointermove', onMove);
      o.canvas.removeEventListener('pointerdown', onDown);
      o.canvas.removeEventListener('pointerup', onUp);
      o.canvas.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      io?.disconnect();
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      controls.removeEventListener('change', wake);
      controls.dispose();
      objects.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  api.resize();
  return api;
}
