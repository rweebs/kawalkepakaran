import { atPageBottom, stateForSection, type SkyState } from '../lib/sky/states';
import type { AbabilScene } from '../lib/sky/AbabilScene';

// Ported from the former React SkyStage island. The static SVG sky is already on screen, so the heavy WebGL scene waits for the
// first sign of a real visitor, or a long idle fallback, and stays out of the load window where it would count as blocking time.
const root = document.querySelector<HTMLElement>('.sky-stage');
const canvas = root?.querySelector<HTMLCanvasElement>('.sky-stage__canvas');

if (root && canvas) {
  const sectionIds = (root.dataset.sections ?? '').split(',').filter(Boolean);
  const lastId = sectionIds[sectionIds.length - 1];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const forceFallback = new URLSearchParams(window.location.search).has('nowebgl');

  const IDLE_FALLBACK_MS = 8000;
  const WAKE_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;

  const whenSettled = (): Promise<void> => new Promise((resolve) => {
    let timer = 0;
    const stopWaiting = () => {
      window.clearTimeout(timer);
      window.removeEventListener('load', onLoad);
      for (const ev of WAKE_EVENTS) window.removeEventListener(ev, wake);
    };
    const wake = () => {
      stopWaiting();
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: 1000 });
      else window.setTimeout(resolve, 200);
    };
    const onLoad = () => { timer = window.setTimeout(wake, IDLE_FALLBACK_MS); };
    for (const ev of WAKE_EVENTS) window.addEventListener(ev, wake, { once: true, passive: true });
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
  });

  (async () => {
    try {
      if (forceFallback) return;
      await whenSettled();
      const { createScene } = await import('../lib/sky/AbabilScene');
      const scene: AbabilScene = createScene({ canvas, reducedMotion: reduced });
      const apply = (st: SkyState) => {
        scene.setState(st);
        root.setAttribute('data-state', st);
      };
      const onResize = () => scene.resize(window.innerWidth, window.innerHeight);
      onResize();
      canvas.classList.remove('sky-stage__canvas--hidden');
      root.dataset.mode = 'webgl';

      const io = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) apply(stateForSection((e.target as HTMLElement).id));
      }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el) io.observe(el);
      }
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', () => {
        if (lastId && atPageBottom(window.scrollY, window.innerHeight, document.documentElement.scrollHeight)) apply(stateForSection(lastId));
      }, { passive: true });
      document.addEventListener('visibilitychange', () => scene.setPaused(document.hidden));
    } catch {
      root.dataset.mode = 'fallback';
    }
  })();
}
