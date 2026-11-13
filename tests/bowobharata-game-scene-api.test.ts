import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/lib/bowobharata/KurukshetraScene.ts', 'utf8');
const stage = readFileSync('src/scripts/bowobharata-stage.ts', 'utf8');

describe('KurukshetraScene game API', () => {
  it('declares the opt-in game flag and the game handle', () => {
    expect(main).toMatch(/interface SceneInit \{[^}]*game\?: true/);
    expect(main).toMatch(/game\?: \{[^}]*root: THREE\.Group[^}]*setPose\(p: Pose \| null\): void[^}]*onFrame\(/s);
  });
  it('draws from the override pose and a zero view offset when set', () => {
    expect(main).toContain('const pose = poseOverride ?? poseAt(progress)');
    expect(main).toMatch(/game \|\| offset === 0\) camera\.clearViewOffset\(\)/);
  });
  it('runs the frame listeners before draw, and adds root to the scene', () => {
    expect(main).toMatch(/for \(const cb of frameListeners\) cb\(time, dt\);\s*(?:\/\/[^\n]*\s*)*if \(disposed\) return;\s*draw\(\);/);
    expect(main).toContain('scene.add(root)');
  });
  it('is never requested by the page', () => {
    expect(stage).not.toMatch(/\bgame\b/);
  });
});

describe('KurukshetraScene game mode', () => {
  it('switches every game-mode change on the game flag', () => {
    for (const s of [
      'const quality = game ? gameQuality(base) : base',
      'createArmies(ctx, dharma, adharma, { still: !!game })',
      '...(game ? [] : [createBattle(ctx)])',
      'createChariot(ctx, { drivable: !!game })',
      '...(game ? [] : [createPavilion(ctx)])',
      '{ flashes: !game }',
      '{ game: !!game }',
      '(90 * quality.terrainSize) / 260',
      '...(game ? [] : [createLightShafts(',
      'time += dt * timeScale',
      'chariot: ChariotRig',
      'setTimeScale(',
      'setPixelRatio(',
      'refreshShadows(',
      'frameListeners.clear()',
      'poseOverride = null',
    ]) expect(main, s).toContain(s);
  });
  it('keeps the page’s handheld camera and its dressing', () => {
    expect(main).toContain('handheld(time, reducedMotion ? 0 : 1)');
    expect(main).toContain('createDressing(ctx)');
  });
  it('holds the camera still in the game, where the chase camera has its own shake', () => {
    expect(main).toContain('const STILL_HAND = { x: 0, y: 0, roll: 0 } as const;');
    expect(main).toContain('const hand = game ? STILL_HAND : handheld(time, reducedMotion ? 0 : 1);');
  });
  it('builds the parts in the page’s order', () => {
    const at = [
      'createEnvironment(scene, camera, ctx, { game: !!game })',
      'createArmies(ctx, dharma, adharma, { still: !!game })',
      '...(game ? [] : [createBattle(ctx)])',
      'createChariot(ctx, { drivable: !!game })',
      '...(game ? [] : [createPavilion(ctx)])',
      'createBattleEffects(ctx, dharma, adharma, groundHeight, { flashes: !game })',
      '...(game ? [] : [createLightShafts(ctx, new THREE.Vector2(0.55, -0.83))])',
      'createDressing(ctx)',
    ].map((s) => [s, main.indexOf(s)] as const);
    for (const [s, i] of at) expect(i, s).toBeGreaterThan(-1);
    const positions = at.map(([, i]) => i);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
  it('declares the new handle members after onFrame', () => {
    const start = main.indexOf('game?: {');
    const block = main.slice(start, main.indexOf('\n  };', start));
    const at = [
      'onFrame(',
      'chariot: ChariotRig;',
      'quality: Quality;',
      'textures: { glow: THREE.Texture; soft: THREE.Texture; shaft: THREE.Texture };',
      'setTimeScale(k: number): void;',
      'setPixelRatio(r: number): void;',
      'refreshShadows(): void;',
    ].map((s) => [s, block.indexOf(s)] as const);
    for (const [s, i] of at) expect(i, s).toBeGreaterThan(-1);
    const positions = at.map(([, i]) => i);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('KurukshetraScene after dispose', () => {
  const from = main.indexOf('const frame = (now: number) => {');
  const frame = main.slice(from, main.indexOf('\n  };', from));

  it('a frame of a disposed scene returns before it draws or schedules the next', () => {
    expect(from).toBeGreaterThan(-1);
    expect(frame).toMatch(/^const frame = \(now: number\) => \{\s*raf = 0;\s*if \(paused \|\| disposed\) return;/);
  });

  it('a listener that disposes the scene ends the frame there: nothing drawn, nothing scheduled', () => {
    expect(frame).toMatch(
      /for \(const cb of frameListeners\) cb\(time, dt\);\s*(?:\/\/[^\n]*\s*)*if \(disposed\) return;\s*draw\(\);\s*raf = requestAnimationFrame\(frame\);$/,
    );
    expect(frame.match(/requestAnimationFrame\(/g)).toHaveLength(1);
  });
});
