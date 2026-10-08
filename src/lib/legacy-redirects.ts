/** Paths of the old abilsudarman.my.id site that moved under the Kasus 001 case path. Everything else keeps its path. */
export const LEGACY_MOVES = [
  ['/en/articles', '/en/cases/abil-sudarman/articles'],
  ['/en/evidence', '/en/cases/abil-sudarman/evidence'],
  ['/en/timeline', '/en/cases/abil-sudarman/timeline'],
  ['/en/bowobharata', '/en/cases/abil-sudarman/bowobharata'],
  ['/artikel', '/kasus/abil-sudarman/artikel'],
  ['/bukti', '/kasus/abil-sudarman/bukti'],
  ['/linimasa', '/kasus/abil-sudarman/linimasa'],
  ['/bowobharata', '/kasus/abil-sudarman/bowobharata'],
] as const;

/** Pages that no longer exist: everything under the old path lands on one page, with no suffix carried over. */
export const LEGACY_REMOVED = [
  ['/en/pagespeed', '/en'],
  ['/pagespeed', '/'],
] as const;

/** Path on kawalkepakaran.org for a path on the old domain. Unknown paths map to themselves. */
export function legacyTarget(pathname: string): string {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  for (const [from, to] of LEGACY_REMOVED) {
    if (p === from || p.startsWith(`${from}/`)) return to;
  }
  for (const [from, to] of LEGACY_MOVES) {
    if (p === from) return to;
    if (p.startsWith(`${from}/`)) return to + p.slice(from.length);
  }
  return p;
}
