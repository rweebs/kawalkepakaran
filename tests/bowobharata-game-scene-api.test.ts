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
    expect(main).toMatch(/for \(const cb of frameListeners\) cb\(time, dt\);\s*draw\(\);/);
    expect(main).toContain('scene.add(root)');
  });
  it('is never requested by the page', () => {
    expect(stage).not.toMatch(/\bgame\b/);
  });
});
