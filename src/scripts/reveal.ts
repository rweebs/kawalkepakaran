import { inView } from 'motion';
import { animate } from 'motion/mini';

// Scroll reveal for [data-reveal] blocks, using Motion's DOM API rather than a React island: no hydration, and styles are set
// through the CSSOM, which the strict CSP allows (a server-rendered style="opacity:0" would be blocked and then flash).
// Anything already on screen at load is left alone so the LCP is never delayed; only blocks below the fold fade in.
// Children marked [data-reveal-item] arrive in a short stagger.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const fold = window.innerHeight;
  for (const el of document.querySelectorAll<HTMLElement>('[data-reveal]')) {
    if (el.getBoundingClientRect().top < fold) continue;
    const items = el.querySelectorAll<HTMLElement>('[data-reveal-item]');
    const targets: HTMLElement[] = items.length ? Array.from(items) : [el];
    for (const t of targets) { t.style.opacity = '0'; t.style.transform = 'translateY(16px)'; }
    // Reveal once: inView fires on every re-entry, and a second animate on the same element cancels the first, which
    // surfaces as an unhandled rejection. A cancelled reveal is harmless, so its promise is settled quietly.
    const stop = inView(el, () => {
      stop();
      for (const [i, t] of targets.entries()) {
        animate(t, { opacity: 1, transform: 'translateY(0)' }, { duration: 0.5, delay: i * 0.08, ease: 'easeOut' }).finished.catch(() => {});
      }
    }, { margin: '0px 0px -10% 0px' });
  }
}
