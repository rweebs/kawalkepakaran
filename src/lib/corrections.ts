export interface Correction {
  /** Date the page was changed, YYYY-MM-DD. */
  date: string;
  /** Path of the page that changed. */
  path: string;
  id: string;
  en: string;
}

/** Public log of corrections, newest first. Add an entry whenever a published page is corrected, annotated or taken down. */
export const CORRECTIONS: readonly Correction[] = [];

/** Corrections that concern a page, ignoring a trailing slash and the language prefix difference is left to the caller. */
export function correctionsFor(path: string, log: readonly Correction[] = CORRECTIONS): Correction[] {
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
  return log.filter((c) => norm(c.path) === norm(path));
}
