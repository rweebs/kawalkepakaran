/** Fails the build when a claim names a pakar that has no profile. */
export function assertKlaimRefsPakar(pakarIds: string[], klaim: { id: string; data: { pakar: string } }[]): void {
  const known = new Set(pakarIds);
  for (const k of klaim) {
    if (!known.has(k.data.pakar)) throw new Error(`klaim "${k.id}" refers to unknown pakar "${k.data.pakar}"`);
  }
}
