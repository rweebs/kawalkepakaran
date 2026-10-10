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

/** Corrections that concern a page or its other-language twin (pass the alternates), ignoring a trailing slash. */
export function correctionsFor(path: string, log: readonly Correction[] = CORRECTIONS, alternates: readonly string[] = []): Correction[] {
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
  const paths = new Set([path, ...alternates].map(norm));
  return log.filter((c) => paths.has(norm(c.path)));
}
