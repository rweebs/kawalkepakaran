import { embedUrl } from '../lib/tiktok';

// The TikTok player is created only when a card is pressed and removed when the dialog closes,
// so nothing is requested from TikTok before a click and playback stops on close.
const dialog = document.querySelector<HTMLDialogElement>('#video-dialog');

if (dialog) {
  const stage = dialog.querySelector<HTMLElement>('.video-stage')!;
  const heading = dialog.querySelector<HTMLElement>('#video-dialog-title')!;

  const open = dialog.querySelector<HTMLAnchorElement>('.video-open')!;
  let current = '';
  const play = (id: string, title: string) => {
    const frame = document.createElement('iframe');
    frame.src = embedUrl(id);
    frame.title = title;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allowFullscreen = true;
    stage.replaceChildren(frame);
  };

  document.querySelectorAll<HTMLAnchorElement>('a.video-card').forEach((card) => {
    card.addEventListener('click', (ev) => {
      // keep "open in new tab" and middle-click working through the plain link
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      const title = card.dataset.title ?? '';
      current = card.dataset.tiktokId ?? '';
      heading.textContent = title;
      open.href = card.href;
      play(current, title);
      dialog.showModal();
    });
  });

  dialog.addEventListener('close', () => stage.replaceChildren());
  dialog.addEventListener('click', (ev) => { if (ev.target === dialog) dialog.close(); });
  dialog.querySelector('.video-reload')?.addEventListener('click', () => play(current, heading.textContent ?? ''));
  dialog.querySelector('.video-close')?.addEventListener('click', () => dialog.close());
}
