// The nav is a <details open> so it works without JavaScript. On narrow screens it becomes a hamburger menu that starts closed,
// and the Media / Tentang groups are shown open as headed sections; on wide screens they are click-open dropdowns.
const menu = document.querySelector<HTMLDetailsElement>('details.nav__menu');
if (menu) {
  const narrow = window.matchMedia('(max-width: 720px)');
  const groups = () => [...menu.querySelectorAll<HTMLDetailsElement>('details.nav__group')];
  const sync = () => {
    menu.open = !narrow.matches;
    for (const g of groups()) g.open = narrow.matches;
  };
  sync();
  narrow.addEventListener('change', sync);

  // On wide screens only one dropdown is open at a time (not enforced natively, so it never collides with the flat mobile list).
  for (const g of groups()) {
    g.addEventListener('toggle', () => {
      if (!g.open || narrow.matches) return;
      for (const other of groups()) if (other !== g) other.open = false;
    });
  }

  menu.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (narrow.matches) {
      if (menu.open) {
        menu.open = false;
        menu.querySelector<HTMLElement>(':scope > summary')?.focus();
      }
      return;
    }
    const openGroup = groups().find((g) => g.open);
    if (openGroup) {
      openGroup.open = false;
      openGroup.querySelector<HTMLElement>('summary')?.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Node)) return;
    if (narrow.matches) {
      if (menu.open && !menu.contains(e.target)) menu.open = false;
    } else {
      for (const g of groups()) if (g.open && !g.contains(e.target)) g.open = false;
    }
  });
}
