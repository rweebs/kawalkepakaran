/** What may be shown: drafts are hidden in production and shown when drafts are included. */
export function visibleArsip<A extends { data: { draft: boolean } }>(arsip: A[], includeDrafts: boolean): A[] {
  return arsip.filter((a) => includeDrafts || !a.data.draft);
}
