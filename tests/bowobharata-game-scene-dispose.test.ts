import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// KurukshetraScene's dispose against a stub renderer (3D-2): the game's scene lets go of its WebGL context, the case
// page's (src/scripts/bowobharata-stage.ts, which never passes `game`) does exactly as before. The scene's parts are
// stubbed: node has no WebGL and no canvas, and only the renderer's calls are under test.

const stub = vi.hoisted(() => {
  class StubRenderer {
    calls: string[] = [];
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0;
    toneMappingExposure = 1;
    outputColorSpace = '';
    constructor() { made.push(this); }
    setPixelRatio() {}
    setSize() {}
    render() { this.calls.push('render'); }
    dispose() { this.calls.push('dispose'); }
    forceContextLoss() { this.calls.push('forceContextLoss'); }
  }
  const made: StubRenderer[] = [];
  return { StubRenderer, made };
});
vi.mock('three', async (importOriginal) => ({ ...(await importOriginal<typeof import('three')>()), WebGLRenderer: stub.StubRenderer }));

/** A stand-in part: an empty group that updates and disposes nothing. */
const part = async () => {
  const T = await import('three');
  return () => ({ object: new T.Group(), update() {}, dispose() {}, rig: {} });
};
vi.mock('../src/lib/bowobharata/scene/army', async () => ({ createArmies: await part() }));
vi.mock('../src/lib/bowobharata/scene/battle', async () => ({ createBattle: await part() }));
vi.mock('../src/lib/bowobharata/scene/chariot', async () => ({ createChariot: await part() }));
vi.mock('../src/lib/bowobharata/scene/dressing', async () => ({ createDressing: await part() }));
vi.mock('../src/lib/bowobharata/scene/pavilion', async () => ({ createPavilion: await part() }));
vi.mock('../src/lib/bowobharata/scene/models', () => ({ loadModels: () => Promise.resolve(null) }));
vi.mock('../src/lib/bowobharata/scene/post', () => ({ createPost: () => ({ dispose() {}, render() {}, setShot() {}, setSize() {}, setEffects() {}, setPixelRatio() {} }) }));
vi.mock('../src/lib/bowobharata/scene/reflections', () => ({ createProbe: () => ({ update() {}, dispose() {} }) }));
vi.mock('../src/lib/bowobharata/scene/materials', async () => {
  const T = await import('three');
  return { createDetail: () => ({ terrain: new T.Texture(), cloth: new T.Texture(), wood: new T.Texture(), metal: new T.Texture() }) };
});
vi.mock('../src/lib/bowobharata/scene/environment', async () => {
  const T = await import('three');
  return {
    createEnvironment: () => ({
      object: new T.Group(), update() {}, dispose() {}, sun: new T.DirectionalLight(), skyUniforms: { uSun: { value: new T.Vector3(0, 1, 0) } },
    }),
  };
});
vi.mock('../src/lib/bowobharata/scene/effects', async (importOriginal) => {
  const T = await import('three');
  const real = await importOriginal<typeof import('../src/lib/bowobharata/scene/effects')>();
  return {
    ...real,
    createContext: () => ({ glow: new T.Texture(), soft: new T.Texture(), shadow: new T.Texture(), shaft: new T.Texture(), uTime: { value: 0 } }),
    createBattleEffects: await part(),
    createLightShafts: await part(),
  };
});

beforeEach(() => {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

const canvas = () => ({ addEventListener() {}, removeEventListener() {} }) as unknown as HTMLCanvasElement;

describe('KurukshetraScene dispose (3D-2)', () => {
  it('the game\'s scene disposes its renderer, then forces the loss of its context, once', async () => {
    const { createScene } = await import('../src/lib/bowobharata/KurukshetraScene');
    const scene = createScene({ canvas: canvas(), reducedMotion: true, mobile: true, game: true });
    const r = stub.made.at(-1)!;
    expect(scene.game).toBeDefined();
    scene.dispose();
    expect(r.calls.filter((c) => c !== 'render')).toEqual(['dispose', 'forceContextLoss']);
  });

  it('the case page\'s scene (no game flag) disposes its renderer and leaves its context alone, as before', async () => {
    const { createScene } = await import('../src/lib/bowobharata/KurukshetraScene');
    for (const mobile of [true, false]) {
      const scene = createScene({ canvas: canvas(), reducedMotion: true, mobile });
      const r = stub.made.at(-1)!;
      expect(scene.game).toBeUndefined();
      scene.dispose();
      expect(r.calls.filter((c) => c !== 'render')).toEqual(['dispose']);
    }
  });
});
