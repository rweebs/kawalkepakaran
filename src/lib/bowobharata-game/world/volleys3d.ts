// The clamour's volleys in the scene, drawn each frame from the engine's state, with no text (F2: arrows 2.2 times their
// size in a light material, and a column of amber light over a ring where each volley will land).
// - A volley's arrows fly along arrowPoint's arcs, then stand where they landed for VOLLEY.stand s and sink over
//   VOLLEY.sink s. One the prabha takes (absorbed) leaves the engine's list as it lands: nothing of it stands, and the
//   runtime pulses the prabha.
// - Its landing is told 1.4 s ahead, or from its planning in Mata's sight: an amber column that narrows as the arrows
//   come, over a ring the size of the patch.
// - Haze, the clamour's and the lakon's own, lies as soft points.
// Nobody is shown hit: an arrow within 3 m of the chariot's hull while below 4 m is never drawn (one in flight goes at
// once; a standing one fades first). When the lakon ends, what is still in the air fades rather than hanging there.
import * as THREE from 'three';
import { groundHeight } from '../../bowobharata/stage-math';
import { fxLayer } from '../../bowobharata/scene/effects';
import { clamp } from '../geom';
import { HULL } from '../collide';
import type { ChariotState } from '../drive';
import type { GameState } from '../engine';
import { VOLLEY } from '../tuning';
import { arrowPoint, telegraphAt, type Cloud, type Volley } from '../volley';
import { disposeGroup } from './dispose';
import { decoyFletchGeo, decoyShaftGeo } from './shapes';
import type { Layer, SceneGame } from './types';

/**
 * The hide rule: an arrow within `near` m of a hull circle (from its edge, across the ground) while below `below` m is
 * not drawn. One in flight goes at once; a standing one fades over `ease` s, from when the chariot's way over the next
 * `lead` s brings the hull that near, so it is gone before the hull is. `slope` m covers the ground's rise along an arrow.
 */
export const HIDE = { near: 3, below: 4, ease: 0.3, lead: 0.4, slope: 0.2 } as const;
/**
 * The telegraph: a column `w` × `h` m that narrows to `narrow` m by the landing, its foot `sunk` m in the ground, over a
 * ring of r `ring` and tube `tube` lying `lift` m over the ground; both amber (opacities `column` and `rings`), brought
 * in and out over `fade` s.
 */
export const TELEGRAPH = {
  w: 1.2, h: 6, narrow: 0.4, sunk: 1, ring: 2.4, tube: 0.08, lift: 0.1, fade: 0.3, color: '#ffb84a', column: 0.9, rings: 0.85,
} as const;
/**
 * Haze: soft points of `color` at a steady `opacity`, `puffs` to a cloud of r `r` m (each `size` across in the points'
 * units, out to `spread` m from the centre and `low`–`high` m up), easing in and out over `ease` s of its life; `cap`
 * clouds at most. A puff fades as it comes from `nearTo` to `nearFrom` m of the camera, so none fills the lens.
 */
export const HAZE = {
  color: '#a98d6a', opacity: 0.35, r: 6, ease: 0.6, puffs: 10, size: 9, spread: 3.6, low: 0.7, high: 2.1, cap: 16, nearFrom: 2, nearTo: 7,
} as const;
/** Seconds what is in the air takes to fade once the lakon is no longer active, and to come out as it leaves the bow. */
const AIR_FADE = 0.3;
/**
 * The most volleys drawn at once: each lasts 2.6 s planned and in the air, then 12.6 s standing and sinking; at the
 * clamour's height one comes every 3.5 s, so 5 overlap at most, the lakon's scripted one besides.
 */
const SLOTS = 8;
/** The most listed volleys a frame reads. */
const SCAN = 32;
/** The longest step of scene time a fade takes in one sync (s), so a long gap between syncs cannot jump it. */
const MAX_STEP = 0.1;
/** In the shapes' units: from their origin to where the frayed head enters the ground, the copies' way of standing. */
const ENTRY = 0.4;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const COLOR = { shaft: '#d6d9de', shaftGlow: '#9aa0aa', fletch: '#d6d9de' } as const;

/** Lets each instance fade on its own: the geometry's instanced `aFade` (0 to 1) multiplies the material's alpha. */
function fading<T extends THREE.Material>(mat: T): T {
  mat.transparent = true;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  mat.customProgramCacheKey = () => 'volley-fade';
  return mat;
}

/** Points that fade as they come from `to` m to `from` m of the camera, so a big soft puff never fills the lens. */
function nearFade(mat: THREE.PointsMaterial, from: number, to: number): THREE.PointsMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vNear;')
      .replace('#include <project_vertex>', `#include <project_vertex>\nvNear = smoothstep(${from.toFixed(1)}, ${to.toFixed(1)}, -mvPosition.z);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vNear;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vNear;');
  };
  mat.customProgramCacheKey = () => `volley-haze-${from}-${to}`;
  return mat;
}

/**
 * Adds the volleys to the game's root, under a `volleys` group, all drawn from `sync`: `volley-arrows` with
 * `volley-fletching` in the air, `landed-arrows` with `landed-fletching` standing, `telegraph-columns` and
 * `telegraph-rings` where they will land, and `haze`. On phones (`mobile`) a volley has 6 arrows, not 12.
 */
export function createVolleys(game: SceneGame, mobile: boolean): Layer {
  const per = mobile ? VOLLEY.arrowsMobile : VOLLEY.arrows;
  const cap = SLOTS * per;
  const group = new THREE.Group();
  group.name = 'volleys';
  game.root.add(group);

  // Scratch, reused every frame.
  const m4 = new THREE.Matrix4();
  const spot = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const size = new THREE.Vector3();
  const grey = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0);
  const ONE = new THREE.Vector3(1, 1, 1);
  const ARROW_SIZE = new THREE.Vector3().setScalar(VOLLEY.scale);

  function instanced(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, n: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.name = name;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  }
  /** Gives a geometry its per-instance opacity, or another's to share. */
  function fadeOn(geo: THREE.BufferGeometry, n: number, shared?: THREE.InstancedBufferAttribute): THREE.InstancedBufferAttribute {
    const attr = shared ?? new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute('aFade', attr);
    return attr;
  }

  // The arrows: the copies' frayed grey shaft, lit, and their curled fletching, unlit and left out of tone mapping so it
  // stays light at any hour of the day. Moved so the frayed head, which leads in flight and enters the ground, is the origin.
  const shaftMat = fading(new THREE.MeshStandardMaterial({ color: COLOR.shaft, emissive: COLOR.shaftGlow, emissiveIntensity: 0.6, roughness: 0.9, metalness: 0 }));
  const fletchMat = fading(new THREE.MeshBasicMaterial({ color: COLOR.fletch, toneMapped: false }));
  const airShaftGeo = decoyShaftGeo().translate(0, -ENTRY, 0);
  const airFletchGeo = decoyFletchGeo().translate(0, -ENTRY, 0);
  const landShaftGeo = airShaftGeo.clone();
  const landFletchGeo = airFletchGeo.clone();
  const airFade = fadeOn(airShaftGeo, cap);
  fadeOn(airFletchGeo, cap, airFade);
  const landFade = fadeOn(landShaftGeo, cap);
  fadeOn(landFletchGeo, cap, landFade);
  const airShafts = instanced('volley-arrows', airShaftGeo, shaftMat, cap);
  const airFletch = instanced('volley-fletching', airFletchGeo, fletchMat, cap);
  const landShafts = instanced('landed-arrows', landShaftGeo, shaftMat, cap);
  const landFletch = instanced('landed-fletching', landFletchGeo, fletchMat, cap);

  // How far an arrow reaches (m), from its shapes: ahead of its origin, behind it, and out from its length.
  let ahead = 0;
  let behind = 0;
  let thick = 0;
  for (const geo of [airShaftGeo, airFletchGeo]) {
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      ahead = Math.max(ahead, pos.getY(i));
      behind = Math.max(behind, -pos.getY(i));
      thick = Math.max(thick, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
  }
  const HEAD = ahead * VOLLEY.scale;
  const TAIL = behind * VOLLEY.scale;
  const THICK = thick * VOLLEY.scale;
  /** How far a standing arrow sinks along its length: all of it below the ground. */
  const SINK = TAIL + THICK + 0.3;

  // The telegraph: additive amber glows, fog off so they read across the field.
  const glowMat = (opacity: number, map: THREE.Texture | null) =>
    new THREE.MeshBasicMaterial({ map, color: TELEGRAPH.color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  // The column: the shaft texture turned over, so its brightest band lies low, 35% up from its foot in the ground.
  const columnGeo = new THREE.PlaneGeometry(TELEGRAPH.w, TELEGRAPH.h).rotateZ(Math.PI);
  const columns = fxLayer(instanced('telegraph-columns', columnGeo, glowMat(TELEGRAPH.column, game.textures.shaft), SLOTS));
  columns.renderOrder = 1;
  // The ring: a flattened torus round the patch, tilted with the ground there.
  const ringGeo = new THREE.TorusGeometry(TELEGRAPH.ring, TELEGRAPH.tube, 4, 72).rotateX(Math.PI / 2).scale(1, 0.3, 1);
  const rings = fxLayer(instanced('telegraph-rings', ringGeo, glowMat(TELEGRAPH.rings, null), SLOTS));
  rings.renderOrder = 1;
  for (let k = 0; k < SLOTS; k++) {
    // The colour buffers now, never in a frame.
    columns.setColorAt(k, grey);
    rings.setColorAt(k, grey);
  }
  /** Each drawn column's foot-to-top middle and its width's share of TELEGRAPH.w, for turning it to the camera. */
  const columnAt = new Float64Array(SLOTS * 3);
  const columnW = new Float64Array(SLOTS);

  // Haze: soft points, not additive, so it veils rather than glows; each puff's alpha is its cloud's level.
  const puffs = HAZE.cap * HAZE.puffs;
  const hazeAt = new Float32Array(puffs * 3);
  const hazeTint = new Float32Array(puffs * 4).fill(1);
  const hazeGeo = new THREE.BufferGeometry();
  const hazePos = new THREE.BufferAttribute(hazeAt, 3);
  const hazeCol = new THREE.BufferAttribute(hazeTint, 4);
  hazeGeo.setAttribute('position', hazePos);
  hazeGeo.setAttribute('color', hazeCol);
  hazeGeo.setDrawRange(0, 0);
  const hazeMat = nearFade(
    new THREE.PointsMaterial({
      map: game.textures.soft, color: HAZE.color, size: HAZE.size, transparent: true, opacity: HAZE.opacity, depthWrite: false, vertexColors: true,
    }),
    HAZE.nearFrom,
    HAZE.nearTo,
  );
  const haze = fxLayer(new THREE.Points(hazeGeo, hazeMat));
  haze.name = 'haze';
  haze.visible = false;
  haze.frustumCulled = false;
  group.add(haze);
  // Each puff's place in its cloud: a golden-angle spiral out to HAZE.spread m, between HAZE.low and HAZE.high up.
  const puffX = new Float64Array(HAZE.puffs);
  const puffZ = new Float64Array(HAZE.puffs);
  const puffY = new Float64Array(HAZE.puffs);
  for (let p = 0; p < HAZE.puffs; p++) {
    const r = HAZE.spread * Math.sqrt((p + 0.5) / HAZE.puffs);
    puffX[p] = r * Math.cos(p * GOLDEN);
    puffZ[p] = -r * Math.sin(p * GOLDEN);
    puffY[p] = HAZE.low + (HAZE.high - HAZE.low) * (0.5 + 0.5 * Math.sin(p * 2.1));
  }

  // The volleys drawn, each in a slot it keeps from when it is first listed until it goes: which volley it is (id,
  // planning, landing), the volley this frame, its arrows' arcs (each arrow's start and end), how much of each arrow
  // shows, when its telegraph came out (run.t; NaN until then), its ring's pose and its column's middle height.
  const slotId = new Float64Array(SLOTS).fill(-1);
  const slotPlanned = new Float64Array(SLOTS);
  const slotToX = new Float64Array(SLOTS);
  const slotToZ = new Float64Array(SLOTS);
  const slotArrows = new Int32Array(SLOTS);
  const slotNow: (Volley | null)[] = Array.from({ length: SLOTS }, () => null);
  const ends = new Float64Array(cap * 6);
  const shown = new Float32Array(cap);
  const toldAt = new Float64Array(SLOTS).fill(NaN);
  const ringPose = Array.from({ length: SLOTS }, () => new THREE.Matrix4());
  const columnY = new Float64Array(SLOTS);
  /** The slot each listed volley holds this frame (−1: none yet). */
  const held = new Int32Array(SCAN);
  // The hull circles' centres this frame (as hullCircles places them), and the chariot's way over the next HIDE.lead s.
  const hullX = new Float64Array(HULL.offsets.length);
  const hullZ = new Float64Array(HULL.offsets.length);
  let leadX = 0;
  let leadZ = 0;
  /** How far out what is in the air is (0 to 1): it fades once the lakon is not active. */
  let airK = 0;
  /** The last sync's scene time, and whether there has been one (the first takes no step). */
  let clock = 0;
  let synced = false;

  /** Gives a volley listed for the first time a free slot: its arrows' arcs from arrowPoint, its ring on the ground. −1 when full. */
  function claim(v: Volley): number {
    let i = 0;
    while (i < SLOTS && slotId[i] !== -1) i++;
    if (i === SLOTS) return -1;
    slotId[i] = v.id;
    slotPlanned[i] = v.planned;
    slotToX[i] = v.to.x;
    slotToZ[i] = v.to.z;
    toldAt[i] = NaN;
    const n = Math.min(v.arrows, per);
    slotArrows[i] = n;
    for (let k = 0; k < n; k++) {
      const a = arrowPoint(v, k, 0, groundHeight);
      const b = arrowPoint(v, k, 1, groundHeight);
      ends.set([a.x, a.y, a.z, b.x, b.y, b.z], (i * per + k) * 6);
      shown[i * per + k] = 1;
    }
    // The ring tilts with the ground at the landing (no landing is on the mound; the plain bends less than 0.03 m
    // across a ring), a hair over it; the column stands its foot TELEGRAPH.sunk m in the ground there.
    const g = groundHeight(v.to.x, v.to.z);
    const e = 0.5;
    const gx = (groundHeight(v.to.x + e, v.to.z) - groundHeight(v.to.x - e, v.to.z)) / (2 * e);
    const gz = (groundHeight(v.to.x, v.to.z + e) - groundHeight(v.to.x, v.to.z - e)) / (2 * e);
    turn.setFromUnitVectors(UP, dir.set(-gx, 1, -gz).normalize());
    ringPose[i].compose(spot.set(v.to.x, g + TELEGRAPH.lift, v.to.z), turn, ONE);
    columnY[i] = g - TELEGRAPH.sunk + TELEGRAPH.h / 2;
    return i;
  }

  function sync(s: GameState, time: number): void {
    const now = Number.isFinite(time) ? time : clock;
    const dt = synced ? clamp(now - clock, 0, MAX_STEP) : 0;
    clock = now;
    const phase = s.run.phase;
    const t = s.run.t;
    const live = phase === 'active';
    // The run's clock stands still once the lakon ends, and what is in the air would hang there: it fades instead.
    airK = synced ? clamp(airK + (live ? dt : -dt) / AIR_FADE, 0, 1) : live ? 1 : 0;
    synced = true;
    // No pressure runs in roam: nothing of the volleys or the haze shows there.
    const roam = phase === 'roam';
    match(s.volleys);
    hullOf(s.car);
    let nAir = 0;
    let nLand = 0;
    let nTold = 0;
    for (let i = 0; i < SLOTS; i++) {
      const v = slotNow[i];
      if (v === null || roam) continue;
      const lands = v.t0 + v.flight;
      if (v.state === 'landed') nLand = standing(i, t - lands, dt, nLand);
      else if (airK > 0) {
        nTold = telegraph(i, v, s.sight.on, t, lands, nTold);
        if (t >= v.t0) nAir = flying(i, (t - v.t0) / v.flight, t - v.t0, nAir);
      }
    }
    show(airShafts, nAir, airFade);
    show(airFletch, nAir);
    show(landShafts, nLand, landFade);
    show(landFletch, nLand);
    show(columns, nTold);
    show(rings, nTold);
    if (nTold > 0) {
      faceColumns();
      columns.instanceColor!.needsUpdate = true;
      rings.instanceColor!.needsUpdate = true;
    }
    hazeOf(s.clouds, t, roam);
  }

  // What sync runs each frame is declared from here to dispose, so the no-allocation check reads it.

  /** Pairs each listed volley with its slot: those drawn keep theirs, the slots of those gone are freed, the rest claim one. */
  function match(list: readonly Volley[]): void {
    const n = Math.min(list.length, SCAN);
    for (let i = 0; i < SLOTS; i++) slotNow[i] = null;
    for (let j = 0; j < n; j++) {
      const v = list[j];
      held[j] = -1;
      for (let i = 0; i < SLOTS; i++) {
        if (slotId[i] === v.id && slotPlanned[i] === v.planned && slotToX[i] === v.to.x && slotToZ[i] === v.to.z) {
          held[j] = i;
          slotNow[i] = v;
          break;
        }
      }
    }
    for (let i = 0; i < SLOTS; i++) if (slotNow[i] === null) slotId[i] = -1;
    for (let j = 0; j < n; j++) {
      if (held[j] >= 0) continue;
      const i = claim(list[j]);
      if (i >= 0) slotNow[i] = list[j];
    }
  }

  /** The hull circles' centres, as hullCircles places them ahead along the heading, and the chariot's way over HIDE.lead s. */
  function hullOf(car: ChariotState): void {
    const c = Math.cos(car.yaw);
    const s = Math.sin(car.yaw);
    for (let k = 0; k < HULL.offsets.length; k++) {
      hullX[k] = car.x + c * HULL.offsets[k];
      hullZ[k] = car.z - s * HULL.offsets[k];
    }
    leadX = car.vx * HIDE.lead;
    leadZ = car.vz * HIDE.lead;
  }

  /**
   * Whether the arrow whose origin is at (x, y, z), its head along `dir`, is under the hide rule: some part of it within
   * HIDE.near m of a hull circle while below HIDE.below m. Looking `ahead`, the hull anywhere on its way over the next
   * HIDE.lead s counts too.
   */
  function nearHull(x: number, y: number, z: number, ahead: boolean): boolean {
    const hx = x + dir.x * HEAD;
    const hz = z + dir.z * HEAD;
    const bx = x - dir.x * TAIL;
    const bz = z - dir.z * TAIL;
    const low = Math.min(y + dir.y * HEAD - groundHeight(hx, hz), y - dir.y * TAIL - groundHeight(bx, bz));
    if (low - THICK - HIDE.slope >= HIDE.below) return false;
    // Across the ground: the arrow's middle, and how far from it a hull circle's centre must keep.
    const mx = (hx + bx) / 2;
    const mz = (hz + bz) / 2;
    const reach = Math.hypot(hx - bx, hz - bz) / 2 + THICK + HULL.r + HIDE.near;
    const way = ahead ? leadX * leadX + leadZ * leadZ : 0;
    for (let k = 0; k < HULL.offsets.length; k++) {
      // The point of the centre's way nearest the middle: the centre itself when not looking ahead.
      const u = way > 0 ? clamp(((mx - hullX[k]) * leadX + (mz - hullZ[k]) * leadZ) / way, 0, 1) : 0;
      if (Math.hypot(mx - hullX[k] - u * leadX, mz - hullZ[k] - u * leadZ) < reach) return true;
    }
    return false;
  }

  /**
   * Slot i's arrows `u` of the way along their arcs, `since` s after they left the bow, drawn from index n; returns the
   * index after them. They come out over AIR_FADE s and fade with what is in the air; one under the hide rule goes at
   * once, as it flies fast, and is never drawn at the chariot.
   */
  function flying(i: number, u: number, since: number, n: number): number {
    const s = Math.min(u, 1);
    const h = VOLLEY.arcHeight;
    const level = airK * Math.min(1, since / AIR_FADE);
    for (let k = 0; k < slotArrows[i]; k++) {
      const a = i * per + k;
      const fx = ends[a * 6];
      const fy = ends[a * 6 + 1];
      const fz = ends[a * 6 + 2];
      const tx = ends[a * 6 + 3];
      const ty = ends[a * 6 + 4];
      const tz = ends[a * 6 + 5];
      // arrowArc's sums: straight from start to end, lifted by a parabola peaking at VOLLEY.arcHeight; heading along it.
      const x = fx + (tx - fx) * s;
      const y = fy + (ty - fy) * s + 4 * h * s * (1 - s);
      const z = fz + (tz - fz) * s;
      dir.set(tx - fx, ty - fy + 4 * h * (1 - 2 * s), tz - fz).normalize();
      shown[a] = nearHull(x, y, z, false) ? 0 : 1;
      if (shown[a] === 0 || level <= 0) continue;
      turn.setFromUnitVectors(UP, dir);
      m4.compose(spot.set(x, y, z), turn, ARROW_SIZE);
      airShafts.setMatrixAt(n, m4);
      airFletch.setMatrixAt(n, m4);
      airFade.setX(n++, level);
    }
    return n;
  }

  /**
   * Slot i's arrows `age` s after they landed, drawn from index n; returns the index after them. Each stands as it came
   * in, its head in the ground, for VOLLEY.stand s, then sinks along its length over VOLLEY.sink s. One under the hide
   * rule (looking ahead) fades out over HIDE.ease s, and back once the chariot has gone.
   */
  function standing(i: number, age: number, dt: number, n: number): number {
    if (age >= VOLLEY.stand + VOLLEY.sink) return n;
    const deep = SINK * clamp((age - VOLLEY.stand) / VOLLEY.sink, 0, 1);
    const step = dt / HIDE.ease;
    for (let k = 0; k < slotArrows[i]; k++) {
      const a = i * per + k;
      const fx = ends[a * 6];
      const fy = ends[a * 6 + 1];
      const fz = ends[a * 6 + 2];
      const tx = ends[a * 6 + 3];
      const ty = ends[a * 6 + 4];
      const tz = ends[a * 6 + 5];
      dir.set(tx - fx, ty - fy - 4 * VOLLEY.arcHeight, tz - fz).normalize();
      const x = tx + dir.x * deep;
      const y = ty + dir.y * deep;
      const z = tz + dir.z * deep;
      const goal = nearHull(x, y, z, true) ? 0 : 1;
      shown[a] = goal < shown[a] ? Math.max(goal, shown[a] - step) : Math.min(goal, shown[a] + step);
      if (shown[a] <= 0) continue;
      turn.setFromUnitVectors(UP, dir);
      m4.compose(spot.set(x, y, z), turn, ARROW_SIZE);
      landShafts.setMatrixAt(n, m4);
      landFletch.setMatrixAt(n, m4);
      landFade.setX(n++, shown[a]);
    }
    return n;
  }

  /**
   * Slot i's column and ring, drawn at index n from when its telegraph first showed (telegraphAt; once out, it stays out
   * whatever sight does) until the landing; returns the index after it. Both come in over TELEGRAPH.fade s and go over
   * the last TELEGRAPH.fade s before the arrows land, so nothing pops whether the volley lands or the light takes it; the
   * column narrows from TELEGRAPH.w to TELEGRAPH.narrow as the arrows come.
   */
  function telegraph(i: number, v: Volley, sight: boolean, t: number, lands: number, n: number): number {
    if (t >= lands) return n;
    if (Number.isNaN(toldAt[i])) {
      if (t < telegraphAt(v, sight)) return n;
      toldAt[i] = t;
    }
    const from = toldAt[i];
    const glow = airK * clamp(Math.min((t - from) / TELEGRAPH.fade, (lands - t) / TELEGRAPH.fade), 0, 1);
    columnAt[n * 3] = v.to.x;
    columnAt[n * 3 + 1] = columnY[i];
    columnAt[n * 3 + 2] = v.to.z;
    columnW[n] = 1 - (1 - TELEGRAPH.narrow / TELEGRAPH.w) * clamp((t - from) / (lands - from), 0, 1);
    columns.setColorAt(n, grey.setScalar(glow));
    rings.setMatrixAt(n, ringPose[i]);
    rings.setColorAt(n, grey);
    return n + 1;
  }

  /** Turns each drawn column about the vertical to face the camera, at its width. */
  function faceColumns(): void {
    const cam = game.camera.position;
    for (let k = 0; k < columns.count; k++) {
      const x = columnAt[k * 3];
      const y = columnAt[k * 3 + 1];
      const z = columnAt[k * 3 + 2];
      turn.setFromAxisAngle(UP, Math.atan2(cam.x - x, cam.z - z));
      columns.setMatrixAt(k, m4.compose(spot.set(x, y, z), turn, size.set(columnW[k], 1, 1)));
    }
  }

  /**
   * The haze: each cloud's puffs round it, at the cloud's level; none in roam. Its opacity stays HAZE.opacity. The
   * lakon's own lie whole from its start; a volley's eases in from its landing and out to its end by run.t, as the
   * engine drops it then with no 'gone' first.
   */
  function hazeOf(clouds: readonly Cloud[], t: number, roam: boolean): void {
    let n = 0;
    for (let j = 0; j < clouds.length && !roam && n + HAZE.puffs <= puffs; j++) {
      const c = clouds[j];
      const level = c.life === null ? 1 : clamp(Math.min((t - c.born) / HAZE.ease, (c.born + c.life - t) / HAZE.ease), 0, 1);
      if (level <= 0) continue;
      const spread = c.r / HAZE.r;
      for (let p = 0; p < HAZE.puffs; p++) {
        const x = c.at.x + puffX[p] * spread;
        const z = c.at.z + puffZ[p] * spread;
        hazeAt[n * 3] = x;
        hazeAt[n * 3 + 1] = groundHeight(x, z) + puffY[p];
        hazeAt[n * 3 + 2] = z;
        hazeTint[n * 4 + 3] = level;
        n++;
      }
    }
    hazeGeo.setDrawRange(0, n);
    haze.visible = n > 0;
    if (n === 0) return;
    hazePos.needsUpdate = true;
    hazeCol.needsUpdate = true;
  }

  /** Draws the first n instances of a mesh, and hides it while there are none (nothing to upload then). */
  function show(mesh: THREE.InstancedMesh, n: number, fade?: THREE.InstancedBufferAttribute): void {
    mesh.count = n;
    mesh.visible = n > 0;
    if (n === 0) return;
    mesh.instanceMatrix.needsUpdate = true;
    if (fade) fade.needsUpdate = true;
  }

  function dispose(): void {
    game.root.remove(group);
    disposeGroup(group);
  }

  return { sync, dispose };
}
