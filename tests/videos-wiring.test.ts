import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { NAV, PAGE_LASTMOD } from '../src/lib/site';

const read = (p: string) => readFileSync(p, 'utf8');

describe('videos wiring', () => {
  it('has Videos in the menu', () => {
    expect(NAV.filter((n) => n.href === '/videos')).toHaveLength(1);
    expect(NAV.find((n) => n.href === '/videos')?.label).toBe('Videos');
  });
  it('has a YYYY-MM-DD lastmod and a sitemap entry', () => {
    expect((PAGE_LASTMOD as Record<string, string>)['/videos']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(read('src/pages/sitemap.xml.ts')).toContain("path: '/videos'");
  });
  it('registers the videos collection', () => {
    expect(read('src/content.config.ts')).toMatch(/videos:\s*defineCollection/);
  });
  it('allows only the privacy-enhanced YouTube domain as a frame source, with no wildcard', () => {
    const csp = read('public/_headers').match(/Content-Security-Policy:([^\n]*)/)?.[1] ?? '';
    const frame = csp.match(/frame-src([^;]*)/)?.[1] ?? '';
    expect(frame).toContain('https://www.youtube-nocookie.com');
    expect(frame).not.toContain('spotify');
    expect(frame).not.toContain('*');
    expect(csp).toMatch(/img-src 'self' data:(;|$)/);
  });
  it('the page renders no iframe in markup (the player is created only on click) and has a no-JS watch link', () => {
    const page = read('src/pages/videos.astro');
    expect(page).not.toMatch(/<iframe/);
    expect(page).toContain('watchUrl');
    expect(page).toContain('<dialog');
  });
  it('the modal script removes the iframe on close so playback stops', () => {
    const js = read('src/scripts/video-modal.ts');
    expect(js).toContain('embedUrl');
    expect(js).toMatch(/addEventListener\('close'/);
    expect(js).toMatch(/\.remove\(\)|replaceChildren\(\)/);
  });
  it('gives every card the same 16:9 frame', () => {
    expect(read('src/styles/global.css')).toMatch(/\.video-thumb\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
  });
});
