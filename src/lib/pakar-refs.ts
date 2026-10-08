/** Fails the build when a claim names a pakar that has no (visible) profile. */
export function assertKlaimRefsPakar(pakarIds: string[], klaim: { id: string; data: { pakar: string } }[]): void {
  const known = new Set(pakarIds);
  for (const k of klaim) {
    if (!known.has(k.data.pakar)) throw new Error(`klaim "${k.id}" refers to unknown or unpublished pakar "${k.data.pakar}"`);
  }
}

interface Row { id: string; data: { draft: boolean } }
interface KlaimRow { id: string; data: { pakar: string; draft: boolean } }

/**
 * The pakar and claims that may be shown. Every claim must name an existing pakar; a claim that will be shown must also
 * name a pakar that will be shown, so a published claim can never link to a hidden draft profile.
 */
export function selectVisible<P extends Row, K extends KlaimRow>(pakar: P[], klaim: K[], includeDrafts: boolean): { pakar: P[]; klaim: K[] } {
  assertKlaimRefsPakar(pakar.map((p) => p.id), klaim);
  const visiblePakar = pakar.filter((p) => includeDrafts || !p.data.draft);
  const visibleKlaim = klaim.filter((k) => includeDrafts || !k.data.draft);
  assertKlaimRefsPakar(visiblePakar.map((p) => p.id), visibleKlaim);
  return { pakar: visiblePakar, klaim: visibleKlaim };
}
