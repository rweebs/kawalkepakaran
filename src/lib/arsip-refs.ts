interface ArsipRow { id: string; data: { draft: boolean } }
interface PihakRow { id: string; data: { articles: string[]; draft: boolean } }

/** Fails the build when a party names an article that does not exist. */
export function assertPihakRefs(articleIds: string[], pihak: { id: string; data: { articles: string[] } }[]): void {
  const known = new Set(articleIds);
  for (const p of pihak) {
    for (const a of p.data.articles) if (!known.has(a)) throw new Error(`pihak "${p.id}" refers to unknown article "${a}"`);
  }
}

/** What may be shown. A shown party must not point at an article that is hidden, so no page can link to a missing one. */
export function selectVisibleArsip<A extends ArsipRow, P extends PihakRow>(arsip: A[], pihak: P[], includeDrafts: boolean): { arsip: A[]; pihak: P[] } {
  assertPihakRefs(arsip.map((a) => a.id), pihak);
  const visibleArsip = arsip.filter((a) => includeDrafts || !a.data.draft);
  const visiblePihak = pihak.filter((p) => includeDrafts || !p.data.draft);
  assertPihakRefs(visibleArsip.map((a) => a.id), visiblePihak);
  return { arsip: visibleArsip, pihak: visiblePihak };
}
