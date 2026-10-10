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
