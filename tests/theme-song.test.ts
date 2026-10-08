import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AUTOPLAY_PATHS, BOWOBHARATA_SONG, TENTANG_SONG, THEME_SONG, embedUrl, musicUrl, shouldAutoplay, songFor } from '../src/lib/theme-song';

const read = (p: string) => readFileSync(p, 'utf8');

describe('theme song urls', () => {
  it('uses the video from the YouTube Music link', () => {
    expect(THEME_SONG.videoId).toBe('lmAzCin5__U');
    expect(musicUrl(THEME_SONG.videoId)).toBe('https://music.youtube.com/watch?v=lmAzCin5__U');
  });
  it('builds a privacy-enhanced, looping, autoplaying embed', () => {
    const url = new URL(embedUrl(THEME_SONG.videoId));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/lmAzCin5__U');
    expect(url.searchParams.get('autoplay')).toBe('1');
    expect(url.searchParams.get('loop')).toBe('1');
    expect(url.searchParams.get('playlist')).toBe('lmAzCin5__U');
  });
});

describe('song per page and autoplay', () => {
  it('plays its own song on /tentang and /bowobharata and the theme song everywhere else', () => {
    expect(TENTANG_SONG.videoId).toBe('WbkooeqB7wQ');
    expect(musicUrl(TENTANG_SONG.videoId)).toBe('https://music.youtube.com/watch?v=WbkooeqB7wQ');
    expect(songFor('/tentang')).toBe(TENTANG_SONG);
    expect(BOWOBHARATA_SONG.videoId).toBe('OgKCAkjlHDI');
    expect(musicUrl(BOWOBHARATA_SONG.videoId)).toBe('https://music.youtube.com/watch?v=OgKCAkjlHDI');
    expect(songFor('/kasus/abil-sudarman/bowobharata')).toBe(BOWOBHARATA_SONG);
    for (const p of ['/', '/kasus/abil-sudarman/artikel', '/kasus/abil-sudarman/linimasa', '/tentang/x']) expect(songFor(p), p).toBe(THEME_SONG);
  });
  it('autoplays only on the home page, /tentang and /bowobharata', () => {
    expect([...AUTOPLAY_PATHS]).toEqual(['/', '/tentang', '/kasus/abil-sudarman/bowobharata']);
    for (const p of ['/', '/tentang', '/kasus/abil-sudarman/bowobharata']) expect(shouldAutoplay(p), p).toBe(true);
    for (const p of ['/kasus/abil-sudarman/artikel', '/kasus/abil-sudarman/bukti', '/kasus/abil-sudarman/linimasa', '/videos']) expect(shouldAutoplay(p), p).toBe(false);
  });
});

describe('theme song on every page', () => {
  it('is mounted by the shared layout', () => {
    const layout = read('src/layouts/BaseLayout.astro');
    expect(layout).toContain("import ThemeSong from '../components/ThemeSong.astro'");
    expect(layout).toContain('<ThemeSong path={path} locale={locale} />');
  });
  it('renders no iframe in markup, so nothing is requested from YouTube before a click', () => {
    const component = read('src/components/ThemeSong.astro');
    expect(component).not.toMatch(/<iframe/);
    expect(component).toContain('aria-expanded="false"');
    expect(component).toContain('aria-controls="theme-song-panel"');
    expect(component).toContain('musicUrl(song.videoId)');
    expect(component).toContain('data-autoplay=');
  });
  it('creates the player on press and removes it to stop playback', () => {
    const js = read('src/scripts/theme-song.ts');
    expect(js).toContain('embedUrl');
    expect(js).toMatch(/createElement\('iframe'\)/);
    expect(js).toMatch(/stage\.replaceChildren\(\)/);
    expect(js).toMatch(/e\.key === 'Escape'/);
  });
  it('starts autoplay on the first tap, click or key press, and a stop or play disarms it for good', () => {
    const js = read('src/scripts/theme-song.ts');
    expect(js).toContain("const GESTURES = ['pointerdown', 'keydown', 'touchend']");
    expect(js).toMatch(/data-autoplay|dataset\.autoplay === 'true'/);
    expect(js).toMatch(/const disarm = /);
    expect(js).toMatch(/stop\.addEventListener\('click', \(\) => \{\s*disarm\(\);/);
    expect(js).toContain("'theme-song:stopped'");
  });
  it('keeps the player rendered but invisible while the panel is closed, so a playing song continues', () => {
    expect(read('src/styles/global.css')).toMatch(/\.theme-song__panel\[data-open='false'\] \{ visibility: hidden;/);
    expect(read('src/components/ThemeSong.astro')).not.toMatch(/<section[^>]*\shidden[\s>]/);
  });
  it('stops the bobbing icon for reduced motion', () => {
    expect(read('src/styles/global.css')).toMatch(/prefers-reduced-motion: reduce\) \{ \.theme-song\.is-playing \.theme-song__icon \{ animation: none/);
  });
});

describe('spotify is gone', () => {
  const walk = (p: string): string[] => (statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : [p]);
  it('leaves no spotify reference in source, tests or headers', () => {
    const files = [...walk('src'), ...walk('tests'), 'public/_headers']
      .filter((f) => /\.(astro|ts|tsx|md|css)$|_headers$/.test(f) && !f.endsWith('theme-song.test.ts') && !f.endsWith('videos-wiring.test.ts'));
    for (const f of files) expect(read(f).toLowerCase(), f).not.toContain('spotify');
  });
  it('removed the player component and its helper', () => {
    expect(existsSync('src/components/SpotifyPlayer.tsx')).toBe(false);
    expect(existsSync('src/lib/spotify-loop.ts')).toBe(false);
  });
});
