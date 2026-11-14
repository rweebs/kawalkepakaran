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

/** A link's opacity with no focus: the Pelapor's links faintest (he is linked to almost every node), then membership, then the rest. */
export const linkOpacity = (kind: ReportLinkKind, center: boolean): number => (center ? 0.025 : kind === 'member' ? 0.22 : 0.5);
/** A link's opacity under a focus when both ends are bright: this chapter's links, clearly drawn. */
export const litLinkOpacity = (kind: ReportLinkKind, center: boolean): number => (center ? 0.3 : kind === 'member' ? 0.55 : 0.85);
/** A link's opacity while either end is dim, which happens only when the map has a focus. */
export const dimLinkOpacity = (center: boolean): number => (center ? 0.01 : 0.06);

/** Under a focus, a dim node is drawn this much smaller. */
export const DIM_SIZE = 0.7;
/** A bright node's halo, under a focus: this much wider than the node, its colour added at this strength. */
export const HALO_SIZE = 1.7;
export const HALO_GLOW = 0.32;
/** The smallest node's radius on screen at the fitted distance, in px. */
export const MIN_NODE_PX = 3.5;
/** Room around the framed nodes, as a share of their sphere's radius. */
export const FIT_MARGIN = 0.08;
/** How long the camera takes to move to a new framing, in ms. */
export const FIT_MS = 1200;

/** The fog, the camera and the orbit for a layout of this extent, before the first framing replaces the fog and distance. */
export function sceneSettings(radius: number, reducedMotion: boolean) {
  return {
    fog: { near: radius * 1.6, far: radius * 4 },
    camera: { fov: 50, near: 0.5, far: radius * 8, position: [radius * 0.8, radius * 0.25, radius * 1.05] as [number, number, number] },
    controls: { dampingFactor: 0.08, minDistance: 8, maxDistance: radius * 4, autoRotate: !reducedMotion, autoRotateSpeed: 0.4 },
  };
}

export interface FitInput {
  pos: ArrayLike<number>;
  radii: readonly number[];
  shown: readonly boolean[];
  bright: readonly boolean[];
  /** The camera's vertical field of view, in degrees, and its width over its height. */
  fov: number;
  aspect: number;
  /** The canvas's height in px, which sets how large the nodes must be drawn. */
  heightPx: number;
}
export interface Fit {
  /** What the camera looks at: the centroid of the bright shown nodes, or of the shown nodes when none is bright. */
  target: [number, number, number];
  /** The camera's distance from the target. From any direction, every shown node, its halo included, is in view. */
  distance: number;
  /** The radius around the target that holds every shown node, its size and the margin. */
  radius: number;
  /** The nodes' scale: their radii times this put the smallest at MIN_NODE_PX on screen, at least 1. */
  scale: number;
}

/**
 * The framing of the shown nodes. It takes the sphere around the target that holds every shown node at its drawn size
 * (with its halo) plus FIT_MARGIN, and the distance at which that sphere fits the narrower of the two fields of view:
 * the sphere then stays inside the frustum from any direction, so the auto-rotation never clips a node. The node scale
 * follows from the distance and the canvas height, and the sphere is measured again with it.
 */
export function fitView(f: FitInput): Fit {
  const n = f.radii.length;
  let ids = [...Array(n).keys()].filter((i) => f.shown[i]);
  if (ids.length === 0) ids = [...Array(n).keys()];
  if (ids.length === 0) return { target: [0, 0, 0], distance: 10, radius: 1, scale: 1 };
  const lit = ids.filter((i) => f.bright[i]);
  const from = lit.length ? lit : ids;
  const target: [number, number, number] = [0, 1, 2].map((k) => from.reduce((s, i) => s + f.pos[i * 3 + k], 0) / from.length) as [number, number, number];
  const half = (f.fov * Math.PI) / 360;
  const tanV = Math.tan(half);
  const sinMin = Math.sin(Math.min(half, Math.atan(tanV * Math.max(1e-3, f.aspect))));
  const off = ids.map((i) => Math.hypot(f.pos[i * 3] - target[0], f.pos[i * 3 + 1] - target[1], f.pos[i * 3 + 2] - target[2]));
  const smallest = ids.reduce((m, i) => Math.min(m, f.radii[i]), Infinity);
  const sphere = (scale: number) => (1 + FIT_MARGIN) * ids.reduce((m, i, k) => Math.max(m, off[k] + f.radii[i] * scale * HALO_SIZE), 0) || 1;
  let scale = 1;
  for (let pass = 0; pass < 3; pass++) {
    const distance = sphere(scale) / sinMin;
    const unitsPerPx = (2 * distance * tanV) / Math.max(1, f.heightPx);
    scale = Math.max(1, (MIN_NODE_PX * unitsPerPx) / smallest);
  }
  const radius = sphere(scale);
  return { target, distance: radius / sinMin, radius, scale };
}

/** Ease in and out (quadratic), 0..1 to 0..1. */
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export interface ReportObjects {
  group: THREE.Group;
  nodes: THREE.InstancedMesh;
  /** The bright nodes' halos under a focus: one additive instance per node, black (adding nothing) when off. */
  halos: THREE.InstancedMesh;
  /** The links, one LineSegments per kind and side of the center split. Each has userData { kind, center, links }: its link indices, in order. */
  lines: THREE.LineSegments[];
  /** The selection's links, drawn on top. */
  hot: THREE.LineSegments;
  /** The wireframe ring around the selection. */
  ring: THREE.Mesh;
  /**
   * Shows, brightens and selects (see ReportMapApi.setState), with the nodes' scale (Fit.scale; the last one when left
   * out); `now` in ms. The first call snaps, later ones ease colour, size, halo and link opacity over EASE_MS.
   */
  setState(shown: readonly boolean[], bright: readonly boolean[], selected: number | null, now: number, scale?: number): void;
  /** Moves an ease on to `now` (ms). True when it wrote new values, that is when a frame should be drawn. */
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

  // Nodes: one instanced sphere mesh, a colour and a size per instance. Their halos: a second, additive one.
  const nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial(), n);
  const halos = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    n,
  );
  // Sizes change with the framing, so the build-time bounds would not hold: never culled, and measured again for picks.
  nodes.frustumCulled = false;
  halos.frustumCulled = false;
  halos.renderOrder = 1;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const at = new THREE.Vector3();
  const size = new THREE.Vector3();
  const place = (mesh: THREE.InstancedMesh, i: number, r: number) => {
    mesh.setMatrixAt(i, m4.compose(at.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), q, size.set(r, r, r)));
  };
  const base = colors.map((c) => new THREE.Color(c));
  const black = new THREE.Color(0);
  for (let i = 0; i < n; i++) {
    place(nodes, i, radii[i]);
    place(halos, i, radii[i] * HALO_SIZE);
    nodes.setColorAt(i, base[i]);
    halos.setColorAt(i, black);
  }
  nodes.instanceMatrix.needsUpdate = true;
  halos.instanceMatrix.needsUpdate = true;
  group.add(nodes, halos);

  // Links: one LineSegments per kind, split into the links that touch the Pelapor and the rest, in the kind's colour.
  // Each link's opacity is its vertex alpha: under a focus one kind holds bright and dim links at once, so the opacity
  // is per link, and it eases.
  const lines: THREE.LineSegments[] = [];
  const slot: { alpha: Float32Array; at: number }[] = [];
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
      ids.forEach((j, m) => {
        rgba[m * 8 + 3] = rgba[m * 8 + 7] = linkOpacity(kind, center);
        slot[j] = { alpha: rgba, at: m };
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(xyz, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
      const material = new THREE.LineBasicMaterial({ color: LINK_COLORS[kind], vertexColors: true, transparent: true, depthWrite: false });
      const obj = new THREE.LineSegments(geometry, material);
      obj.userData = { kind, center, links: ids };
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
  const gFrom = new Float32Array(n);
  const gTo = new Float32Array(n);
  const gCur = new Float32Array(n);
  const sFrom = Float32Array.from(radii);
  const sTo = Float32Array.from(radii);
  const sCur = Float32Array.from(radii);
  const aFrom = Float32Array.from(links, (l) => linkOpacity(l.kind, l.center));
  const aTo = Float32Array.from(aFrom);
  const aCur = Float32Array.from(aFrom);
  const glow = new THREE.Color();
  let scaleNow = 1;
  let t0 = 0;
  let easing = false;
  let primed = false;

  const write = (e: number) => {
    for (let i = 0; i < n; i++) {
      nodes.setColorAt(i, cur[i].lerpColors(from[i], to[i], e));
      gCur[i] = gFrom[i] + (gTo[i] - gFrom[i]) * e;
      halos.setColorAt(i, glow.copy(base[i]).multiplyScalar(gCur[i]));
      sCur[i] = sFrom[i] + (sTo[i] - sFrom[i]) * e;
      place(nodes, i, sCur[i]);
      place(halos, i, gCur[i] > 0 ? sCur[i] * HALO_SIZE : HIDDEN);
    }
    for (const mesh of [nodes, halos]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }
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
    const r = sTo[sel] * 1.4 + 0.3 * scaleNow;
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
    halos,
    lines,
    hot,
    ring,
    tick,
    setState(shown, bright, selected, now, scale = scaleNow) {
      tick(now);
      scaleNow = scale;
      const focus = shown.some((s, i) => s && !bright[i]);
      for (let i = 0; i < n; i++) {
        const s = !!shown[i];
        const came = s && !shownNow[i];
        shownNow[i] = s;
        // A node off the map turns to the background and shrinks at once, so it grows and fades in from there when it comes back.
        to[i].setHex(!s ? BG : bright[i] ? colors[i] : DIM);
        from[i].copy(primed ? cur[i] : to[i]);
        gTo[i] = s && focus && bright[i] ? HALO_GLOW : 0;
        gFrom[i] = primed && s ? gCur[i] : gTo[i];
        sTo[i] = !s ? HIDDEN : radii[i] * scale * (focus && !bright[i] ? DIM_SIZE : 1);
        sFrom[i] = !primed || !s ? sTo[i] : came ? HIDDEN : sCur[i];
      }
      links.forEach((l, j) => {
        const on = shownNow[l.a] && shownNow[l.b];
        const lit = bright[l.a] && bright[l.b];
        aTo[j] = !on ? 0 : !lit ? dimLinkOpacity(l.center) : focus ? litLinkOpacity(l.kind, l.center) : linkOpacity(l.kind, l.center);
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
      for (const mesh of [nodes, halos]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
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
  const fog = new THREE.Fog(BG, s.fog.near, s.fog.far);
  scene.fog = fog;
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
  // The framing: where the camera is headed, eased over FIT_MS, and the radius of the framed sphere (for the fog).
  let fitR = o.radius;
  let move: { t0: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromD: number; toD: number; fromR: number; toR: number } | null = null;
  const dir = new THREE.Vector3();
  const aim = new THREE.Vector3();
  /** Puts the camera `d` from target `t`, keeping its direction (the orbit may be turning it), and fogs only the far side. */
  const place = (t: THREE.Vector3, d: number) => {
    dir.subVectors(camera.position, controls.target);
    if (dir.lengthSq() < 1e-9) dir.set(...s.camera.position);
    dir.normalize();
    controls.target.copy(t);
    camera.position.copy(t).addScaledVector(dir, d);
  };
  const fogTo = () => {
    const d = camera.position.distanceTo(controls.target);
    fog.near = d;
    fog.far = d + 4 * fitR;
  };
  /** Frames the shown nodes (fitView) and sets the nodes' scale for that distance: eased, or at once. */
  const refit = (now: number, animate: boolean) => {
    if (!lastShown || !lastBright) return;
    const f = fitView({ pos: o.pos, radii: o.radii, shown: lastShown, bright: lastBright, fov: camera.fov, aspect: camera.aspect, heightPx: o.canvas.clientHeight });
    controls.maxDistance = Math.max(s.controls.maxDistance, f.distance * 2);
    camera.far = Math.max(s.camera.far, (f.distance + f.radius) * 2);
    camera.updateProjectionMatrix();
    objects.setState(lastShown, lastBright, selected, now, f.scale);
    aim.set(...f.target);
    if (animate) {
      move = { t0: now, fromT: controls.target.clone(), toT: aim.clone(), fromD: camera.position.distanceTo(controls.target), toD: f.distance, fromR: fitR, toR: f.radius };
    } else {
      move = null;
      fitR = f.radius;
      place(aim, f.distance);
      controls.update();
    }
  };
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
    const travelling = move !== null;
    if (move) {
      const k = Math.min(1, Math.max(0, (performance.now() - move.t0) / FIT_MS));
      const e = ease(k);
      fitR = move.fromR + (move.toR - move.fromR) * e;
      place(aim.lerpVectors(move.fromT, move.toT, e), move.fromD + (move.toD - move.fromD) * e);
      if (k >= 1) move = null;
    }
    const moved = controls.update(dt) || travelling;
    fogTo();
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
    move = null;
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
      const reframe = !same(shown, lastShown) || !same(bright, lastBright);
      const first = lastShown === null;
      lastShown = shown.map((v) => !!v);
      lastBright = bright.map((v) => !!v);
      // A new chapter, or a new focus, moves the camera to frame it (at once the first time and under reduced motion).
      if (reframe) refit(performance.now(), !first && !o.reducedMotion);
      else objects.setState(shown, bright, next, performance.now());
      wake();
    },
    resize() {
      if (disposed) return;
      const w = Math.max(1, o.canvas.clientWidth);
      const h = Math.max(1, o.canvas.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      refit(performance.now(), false);
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
