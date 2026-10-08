import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const dir = 'src/lib/bowobharata/scene';
const main = readFileSync('src/lib/bowobharata/KurukshetraScene.ts', 'utf8');
const modules = [
  'environment', 'army', 'chariot', 'pavilion', 'effects', 'quality', 'anatomy', 'rig', 'creatures', 'battle',
  'materials', 'texturegen', 'motion', 'reflections', 'post',
];
const all = () => [main, ...readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(`${dir}/${f}`, 'utf8'))];

describe('KurukshetraScene source guards', () => {
  it('is split into focused scene modules', () => {
    for (const m of modules) expect(existsSync(`${dir}/${m}.ts`), m).toBe(true);
  });
  it('loads no image files anywhere, and reads models only through the manifest in models.ts', () => {
    for (const src of all()) expect(src).not.toMatch(/TextureLoader|OBJLoader|FBXLoader|\.png|\.jpe?g|\.hdr/);
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && n !== 'models.ts')) {
      expect(readFileSync(`${dir}/${f}`, 'utf8'), f).not.toMatch(/GLTFLoader|\.glb|\.gltf/);
    }
    expect(main).not.toMatch(/GLTFLoader|\.glb|\.gltf/);
    expect(readFileSync(`${dir}/models.ts`, 'utf8')).toContain("from '../model-credits'");
  });
  it('keeps working with its own shapes when the models cannot be loaded', () => {
    const models = readFileSync(`${dir}/models.ts`, 'utf8');
    expect(models).toMatch(/catch \{\s*return null;/);
    expect(main).toMatch(/if \(!models \|\| disposed\) return;/);
  });
  it('sizes itself from the quality tier', () => {
    expect(main).toContain('qualityFor(mobile, window.devicePixelRatio || 1, navigator.hardwareConcurrency || 8)');
    expect(main).toContain('renderer.setPixelRatio(quality.pixelRatio)');
  });
  it('builds the post chain only when the tier has post effects, and sheds effects in order when frames are slow', () => {
    expect(main).toMatch(/if \(quality\.bloom \|\| quality\.ao \|\| quality\.dof\) post = createPost\(/);
    expect(main).toContain('shouldDropBloom(');
    expect(main).toContain('degrade(fx)');
  });
  it('turns on shadows only for tiers that allow them, and can turn them back off', () => {
    expect(main).toMatch(/if \(fx\.shadows\) \{/);
    expect(main).toContain('setShadows(false)');
    expect(main).toContain("m.name !== 'terrain'");
  });
  it('lights metals from the sky through a reflection probe that is disposed with the scene', () => {
    expect(main).toContain('createProbe(');
    expect(main).toContain('probe.dispose()');
  });
  it('eases the camera by real elapsed time, and leaves no debug hooks in', () => {
    expect(main).toContain('easeToward(progress, target, Math.min(ms / 1000 || 0, 0.5), 3)');
    expect(main).not.toMatch(/__bbdebug|TEMP-DEBUG/);
  });
  it('frames the subject away from the alternating text card', () => {
    expect(main).toContain('viewOffsetX(size.w, cardShift(progress), mobile)');
    expect(main).toContain('camera.clearViewOffset()');
    expect(main).toContain('camera.setViewOffset(');
  });
  it('keeps motion off under reduced motion, including the handheld camera', () => {
    expect(main).toContain('handheld(time, reducedMotion ? 0 : 1)');
  });
  it('survives a lost WebGL context by telling the caller', () => {
    expect(main).toContain("'webglcontextlost'");
    expect(main).toContain('onLost?.()');
  });
  it('does not loop under reduced motion and disposes GPU resources and textures', () => {
    expect(main).toMatch(/if \(!reducedMotion\) start\(\)/);
    expect(main).toContain('renderer.dispose()');
    expect(main).toContain('post?.dispose()');
    expect(main).toMatch(/\.normalMap\?\.dispose\(\)/);
    expect(main).toContain('geometry.dispose()');
    expect(main).toMatch(/\.map\?\.dispose\(\)/);
  });
});
