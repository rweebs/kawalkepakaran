import { parvaProgress } from '../lib/bowobharata/stage-math';
import { atPageBottom } from '../lib/sky/states';
import type { KurukshetraScene } from '../lib/bowobharata/KurukshetraScene';

// Same loading discipline as sky-stage.ts: the page is already complete and readable without this; the WebGL scene and the
// motion library wait for the first sign of a real visitor, or a long idle fallback, so they never count against the load.
const root = document.querySelector<HTMLElement>('.bb-stage');
const canvas = root?.querySelector<HTMLCanvasElement>('.bb-stage__canvas');
const parvas = document.getElementById('parvas');

if (root && canvas && parvas) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.matchMedia('(max-width: 700px)').matches;
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

  // Fades each parva card and poster in once as it scrolls into view. Content is fully visible until this runs.
  const revealOnScroll = async () => {
    try {
      const { animate, inView } = await import('motion');
      inView('.bb-reveal', (el) => {
        animate(el, { opacity: [0, 1], transform: ['translateY(24px)', 'translateY(0px)'] }, { duration: 0.6, ease: 'easeOut' });
      }, { margin: '0px 0px -10% 0px' });
    } catch {
      /* motion unavailable: the content simply stays visible */
    }
  };

  (async () => {
    try {
      await whenSettled();
      if (!reduced) void revealOnScroll();
      if (forceFallback) return;

      const { createScene } = await import('../lib/bowobharata/KurukshetraScene');
      let scene: KurukshetraScene | undefined;
      const fallback = () => {
        scene?.dispose();
        scene = undefined;
        canvas.classList.add('bb-stage__canvas--hidden');
        root.dataset.mode = 'fallback';
      };
      scene = createScene({ canvas, reducedMotion: reduced, mobile, onLost: fallback });
      const live = scene;

      const onResize = () => live.resize(window.innerWidth, window.innerHeight);
      const sections = Array.from(parvas.querySelectorAll<HTMLElement>('.bb-parva'));
      const onScroll = () => {
        // Each parva gets its own camera shot when its centre is at the viewport centre, however tall its section is.
        const centers = sections.map((el) => { const r = el.getBoundingClientRect(); return r.top + window.scrollY + r.height / 2; });
        // The viewport centre never passes the last parva when the page bottoms out, so the bottom counts as the end.
        live.setProgress(atPageBottom(window.scrollY, window.innerHeight, document.documentElement.scrollHeight) ? 1 : parvaProgress(centers, window.scrollY + window.innerHeight / 2));
      };
      onResize();
      onScroll();
      canvas.classList.remove('bb-stage__canvas--hidden');
      root.dataset.mode = 'webgl';

      let onScreen = true;
      const sync = () => live.setPaused(document.hidden || !onScreen);
      new IntersectionObserver((entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        sync();
      }).observe(parvas);
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', onScroll, { passive: true });
      document.addEventListener('visibilitychange', sync);
    } catch {
      root.dataset.mode = 'fallback';
    }
  })();
}
