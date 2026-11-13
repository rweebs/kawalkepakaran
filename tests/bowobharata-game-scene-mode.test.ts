import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { GAME_WARRIORS_PER_SIDE, gameQuality, qualityFor, type Quality } from '../src/lib/bowobharata/scene/quality';
import { createDetail } from '../src/lib/bowobharata/scene/materials';
import { createEnvironment, type EnvironmentPart } from '../src/lib/bowobharata/scene/environment';
import { createBattleEffects, createContext, type Part } from '../src/lib/bowobharata/scene/effects';
import { formation, groundHeight } from '../src/lib/bowobharata/stage-math';

// No DOM under vitest: a canvas whose 2D context swallows every call, so the texture painters run without drawing.
function stubCanvas() {
  const g: unknown = new Proxy(function () {}, { get: () => g, apply: () => g, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => g }) });
}

/** A context as the scene builds it: the ground's normal map repeats in proportion to the terrain's size. */
const contextFor = (quality: Quality) => createContext(quality, new THREE.PerspectiveCamera(), createDetail(8, (90 * quality.terrainSize) / 260));
const pageContext = () => contextFor(qualityFor(false, 1));
const gameContext = () => contextFor(gameQuality(qualityFor(false, 1)));

beforeEach(stubCanvas);
afterEach(() => vi.unstubAllGlobals());

describe('game quality', () => {
  it('calms a phone: 700 a side, no skirmish, arrows, rocks or post effects, on the 720 m terrain', () => {
    expect(gameQuality(qualityFor(true, 3))).toMatchObject({
      warriorsPerSide: 700, skirmishPairs: 0, arrows: 0, rocks: 0, ao: false, dof: false, bloom: false, shadows: false,
      pixelRatio: 1.25, terrainSize: 720, terrainSegments: 128,
    });
  });
  it('keeps a desktop’s bloom, shadows and pixel ratio, with 1024 a side and 256 terrain segments', () => {
    expect(gameQuality(qualityFor(false, 2))).toMatchObject({ warriorsPerSide: 1024, bloom: true, shadows: true, pixelRatio: 1.5, terrainSegments: 256 });
    expect(gameQuality(qualityFor(false, 2, 4)).warriorsPerSide).toBe(1024);
    expect(GAME_WARRIORS_PER_SIDE).toBe(1024);
  });
  it('has no battle layer to fill', () => {
    for (const q of [qualityFor(true, 3), qualityFor(false, 2), qualityFor(false, 2, 4)]) {
      expect(gameQuality(q)).toMatchObject({ skirmishPairs: 0, realFighters: 0, cavalry: 0, elephants: 0, arrows: 0, rocks: 0 });
    }
  });
  it('leaves every page tier on the 260 m terrain', () => {
    for (const q of [qualityFor(true, 3), qualityFor(false, 2), qualityFor(false, 2, 4)]) expect(q.terrainSize).toBe(260);
  });
  it('does not mutate its input', () => {
    const page = qualityFor(false, 2);
    const before = { ...page };
    gameQuality(page);
    expect(page).toEqual(before);
  });
});

describe('ground detail', () => {
  it('repeats the ground’s normal map 90 times by default, and as often as asked', () => {
    expect(createDetail(8).terrain.repeat.x).toBe(90);
    expect(createDetail(8, 249.23).terrain.repeat.x).toBe(249.23);
    expect(createDetail(8, 249.23).terrain.repeat.y).toBe(249.23);
  });
  it('leaves the other surfaces alone', () => {
    const d = createDetail(8, 249.23);
    expect([d.cloth.repeat.x, d.wood.repeat.y, d.metal.repeat.x]).toEqual([3, 6, 2]);
  });
});

describe('the environment', () => {
  const environment = (ctx: ReturnType<typeof contextFor>, opts?: { game?: boolean }) =>
    createEnvironment(new THREE.Scene(), new THREE.PerspectiveCamera(), ctx, opts);
  const terrainSize = (env: EnvironmentPart) => {
    const terrain = env.object.getObjectByName('terrain');
    expect(terrain).toBeDefined();
    return new THREE.Box3().setFromObject(terrain!).getSize(new THREE.Vector3());
  };
  const hasDebris = (env: EnvironmentPart) => env.object.children.some((c) => c.name === 'debris');

  it('lays the 720 m terrain in the game, with no debris on it', () => {
    const env = environment(gameContext(), { game: true });
    const size = terrainSize(env);
    expect(Math.abs(size.x - 720)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(size.z - 720)).toBeLessThanOrEqual(0.01);
    expect(hasDebris(env)).toBe(false);
    expect(env.object.getObjectByName('debris')).toBeUndefined();
    expect(() => env.update(1, 0.5)).not.toThrow();
  });
  it('keeps the page’s 260 m terrain and its debris', () => {
    for (const env of [environment(pageContext()), environment(pageContext(), { game: false })]) {
      const size = terrainSize(env);
      expect(Math.abs(size.x - 260)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(size.z - 260)).toBeLessThanOrEqual(0.01);
      expect(hasDebris(env)).toBe(true);
    }
  });
});

describe('the battle effects', () => {
  const dharma = formation(128, 'dharma', 5);
  const adharma = formation(128, 'adharma', 5);
  const flashes = (part: Part) => {
    let n = 0;
    part.object.traverse((o) => { if (o.name === 'clash-flash') n++; });
    return n;
  };

  it('build and run in the game without the clash flashes', () => {
    let part: Part | undefined;
    expect(() => {
      part = createBattleEffects(gameContext(), dharma, adharma, groundHeight, { flashes: false });
      for (let t = 0; t <= 6; t += 0.25) part.update(t, t / 6);
    }).not.toThrow();
    expect(part!.object.getObjectByName('clash-flash')).toBeUndefined();
    expect(flashes(part!)).toBe(0);
  });
  it('keep the page’s eight flashes', () => {
    expect(flashes(createBattleEffects(pageContext(), dharma, adharma, groundHeight, { flashes: true }))).toBe(8);
    expect(flashes(createBattleEffects(pageContext(), dharma, adharma, groundHeight))).toBe(8);
  });
});
