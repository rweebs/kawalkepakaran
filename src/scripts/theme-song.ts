import { embedUrl } from '../lib/theme-song';

// The YouTube player is created only after a visitor acts, so nothing is requested from YouTube before then.
// - Most pages: the player appears when the "Lagu tema" button is pressed.
// - Home and /tentang (data-autoplay): the song starts on the visitor's first tap, click or key press anywhere on the page,
//   because browsers block sound at page load. Pressing "Berhenti" stops it and keeps it from starting again this session.
// The player stays rendered (but invisible) while the panel is closed, so the song keeps playing; "Berhenti" removes the iframe.
const root = document.querySelector<HTMLElement>('[data-theme-song]');

if (root) {
  const toggle = root.querySelector<HTMLButtonElement>('.theme-song__toggle')!;
  const panel = root.querySelector<HTMLElement>('.theme-song__panel')!;
  const stage = root.querySelector<HTMLElement>('.theme-song__stage')!;
  const stop = root.querySelector<HTMLButtonElement>('.theme-song__stop')!;
  const label = root.querySelector<HTMLElement>('.theme-song__label')!;
  const STOPPED_KEY = 'theme-song:stopped';

  const stoppedBefore = () => {
    try { return sessionStorage.getItem(STOPPED_KEY) === '1'; } catch { return false; }
  };
  const rememberStop = () => {
    try { sessionStorage.setItem(STOPPED_KEY, '1'); } catch { /* storage unavailable: autoplay may re-arm on the next page */ }
  };

  // Autoplay: the first tap, click or key press outside the player starts the song; any play or stop disarms it.
  const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;
  const start = (e: Event) => {
    if (e.target instanceof Node && root.contains(e.target)) return; // the player's own controls handle themselves
    play();
  };
  const disarm = () => {
    for (const ev of GESTURES) document.removeEventListener(ev, start, true);
  };

  const isOpen = () => panel.dataset.open === 'true';
  const setOpen = (open: boolean) => {
    panel.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  const setPlaying = (playing: boolean) => {
    root.classList.toggle('is-playing', playing);
    label.textContent = (playing ? root.dataset.labelPlaying : root.dataset.labelIdle) ?? (playing ? 'Memutar' : 'Lagu tema');
  };

  const play = () => {
    disarm();
    if (stage.querySelector('iframe')) return;
    const frame = document.createElement('iframe');
    frame.src = embedUrl(root.dataset.videoId ?? '');
    frame.title = root.dataset.title ?? 'Lagu tema';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    stage.replaceChildren(frame);
    setPlaying(true);
  };

  toggle.addEventListener('click', () => {
    const opening = !isOpen();
    setOpen(opening);
    if (opening) play();
  });

  stop.addEventListener('click', () => {
    disarm();
    stage.replaceChildren();
    setPlaying(false);
    setOpen(false);
    rememberStop();
    toggle.focus();
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      setOpen(false);
      toggle.focus();
    }
  });

  if (root.dataset.autoplay === 'true' && !stoppedBefore()) {
    for (const ev of GESTURES) document.addEventListener(ev, start, { capture: true, passive: true });
  }
}
