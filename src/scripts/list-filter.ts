// Filters the list items on the page by what the visitor types. The box is hidden until this script runs, so the page works without JavaScript.
const box = document.querySelector<HTMLElement>('[data-list-filter]');
const input = box?.querySelector<HTMLInputElement>('input');
if (box && input) {
  box.hidden = false;
  const empty = box.querySelector<HTMLElement>('[data-list-filter-empty]');
  const items = [...document.querySelectorAll<HTMLElement>('main ul.stack > li, main a.card--link')];
  const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const texts = items.map((el) => norm(el.textContent ?? ''));
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    let shown = 0;
    items.forEach((el, i) => {
      const hit = q === '' || texts[i].includes(q);
      el.hidden = !hit;
      if (hit) shown += 1;
    });
    if (empty) empty.hidden = shown > 0 || q === '';
  });
}
