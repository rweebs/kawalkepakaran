import { toIndonesianPath } from '../i18n';

// The site's theme song, "Ababil" (Raihan, YouTube Music "Topic" release). Played from the YouTube embed so the full track
// works without a login; nothing is requested from YouTube until a visitor presses the player button.
export interface Song { videoId: string; title: string; artist: string }

export const THEME_SONG: Song = {
  videoId: 'lmAzCin5__U',
  title: 'Ababil',
  artist: 'Raihan',
};

// The "Tentang penggagas" page has its own song.
export const TENTANG_SONG: Song = {
  videoId: 'WbkooeqB7wQ',
  title: "Rahmatun Lil'Alameen",
  artist: 'Maher Zain',
};

// The Bowobharata page has its own song too.
export const BOWOBHARATA_SONG: Song = {
  videoId: 'OgKCAkjlHDI',
  title: 'Mahabharat Titel Flute',
  artist: 'Vinay Keshari',
};

/** The song for a page: /tentang and /bowobharata play their own, every other page the theme song. */
export function songFor(rawPath: string): Song {
  const path = toIndonesianPath(rawPath);
  if (path === '/tentang') return TENTANG_SONG;
  if (path === '/kasus/abil-sudarman/bowobharata') return BOWOBHARATA_SONG;
  return THEME_SONG;
}

/** Pages whose song starts by itself on the visitor's first tap, click or key press (browsers block sound at page load). */
export const AUTOPLAY_PATHS: readonly string[] = ['/', '/tentang', '/kasus/abil-sudarman/bowobharata'];
export const shouldAutoplay = (path: string) => AUTOPLAY_PATHS.includes(toIndonesianPath(path));

/** Privacy-enhanced embed that autoplays (after a click) and loops the single video. */
export function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&rel=0&playsinline=1`;
}

export function musicUrl(id: string): string {
  return `https://music.youtube.com/watch?v=${id}`;
}
