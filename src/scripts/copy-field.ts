// Copy buttons for read-only text fields (the badge embed snippet). Without JavaScript the field is still a plain, selectable
// textarea and the button stays hidden; with it, the button appears and copies the field, falling back to selecting the text.
for (const btn of document.querySelectorAll<HTMLButtonElement>('button[data-copy-field]')) {
  const field = document.getElementById(btn.dataset.copyField ?? '') as HTMLTextAreaElement | HTMLInputElement | null;
  if (!field) continue;
  const status = btn.parentElement?.querySelector<HTMLElement>('[data-copy-field-status]');
  btn.hidden = false;
  field.addEventListener('focus', () => field.select());
  btn.addEventListener('click', async () => {
    field.select();
    try {
      await navigator.clipboard.writeText(field.value);
      if (status) status.textContent = btn.dataset.done ?? '';
    } catch {
      // Clipboard refused (permissions or an insecure context): the text is selected, ready for the reader to copy by hand.
      if (status) status.textContent = btn.dataset.fallback ?? '';
    }
  });
}
