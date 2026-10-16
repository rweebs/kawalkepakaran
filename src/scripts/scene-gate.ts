// Shared start conditions for the WebGL stages (home sky, Bowobharata). Nothing here imports three.js: the stages call these
// before their dynamic import, so a visitor who never needs the scene never downloads it.

/** Reduced motion or a Save-Data connection: keep the static backdrop and let the visitor start the scene with a button. */
export function prefersStill(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || Boolean(conn?.saveData);
}

/** Resolves once `el` is (nearly) on screen. Without IntersectionObserver it resolves at once. */
export function whenInView(el: Element, rootMargin = '200px 0px'): Promise<void> {
  return new Promise((resolve) => {
    if (typeof IntersectionObserver !== 'function') { resolve(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); resolve(); }
    }, { rootMargin });
    io.observe(el);
  });
}

/** Shows the stage's start button and resolves on its click. Without a button it never resolves: the backdrop stays static. */
export function whenStartPressed(button: HTMLButtonElement | null | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (!button) return;
    button.hidden = false;
    button.addEventListener('click', () => { button.hidden = true; resolve(); }, { once: true });
  });
}
