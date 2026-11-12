// One graph of every item across the three /pantau datasets, with Rahmat Wibowo (the Pelapor) at the centre as the
// person all three are about. Pure and browser-safe: the page builds the model at build time, the island lays it out.
//
// Edge kinds read as "attacks in, legal responses out":
// - in-fact:        published content about him (the rahmatwibowo.net site, Fomo posts). Documented, not a ruling.
// - in-allegation:  acts the Pelapor alleges against him (each terlapor). An allegation, labelled "dugaan".
// - out-response:   his responses (somasi, complaints, police reports, the separate Fomo complaint).
// - against:        police reports filed by others against him. Kept visible on purpose.
// - cross-fact / cross-inference: the same person or organisation found in two sources, with how it was matched.
// A cross-source match never asserts identity beyond its rule; anonymous Fomo accounts are never matched to names.
import type { WatchStore } from './sitemap-watch';
import type { Perkara, Terlapor } from './perkara';
import type { Fomo } from './fomo';

export type Source = 'rw' | 'site' | 'perkara' | 'fomo' | 'laporan';
export type NodeKind = 'center' | 'hub' | 'cluster' | 'member';
export type EdgeKind = 'in-fact' | 'in-allegation' | 'out-response' | 'against' | 'cross-fact' | 'cross-inference' | 'structure';
export const EDGE_KINDS: readonly EdgeKind[] = ['in-fact', 'in-allegation', 'out-response', 'against', 'cross-fact', 'cross-inference'];

export interface GNode { id: string; kind: NodeKind; source: Source; label: string; sub?: string; count: number; parent?: string; members?: string[] }
export interface GEdge { from: string; to: string; kind: EdgeKind; weight: number; note?: string }

export type MatchType = 'target-slug' | 'target-slug-fuzzy' | 'evidence-name' | 'evidence-name-partial' | 'organisation' | 'handle' | 'site-mentions-fomo';
export interface Match { type: MatchType; confidence: 'fact' | 'inference'; terlapor?: string; nama?: string; other: string; evidence: string; count: number }

/** "Petra Novandi Barus (Petra Barus)" -> "petra-novandi-barus"; accents and punctuation dropped. */
export const slugify = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The name and any plain alias in parentheses, slugified; "(akun X @handle)" style notes are not aliases. */
export function nameKeys(nama: string): string[] {
  const base = slugify(nama.replace(/\([^)]*\)/g, ' ').replace(/["“”]/g, ' '));
  const aliases = [...nama.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]).filter((a) => !/(akun|@|\b(pt|inc)\b)/i.test(a)).map(slugify);
  return [...new Set([base, ...aliases])].filter((k) => k.split('-').length >= 2);
}

/**
 * Fomo names that stand for many people, not one: the platform's placeholder for deleted accounts and generic labels.
 * They get their own group, never a person-like node, and are never matched to anyone.
 */
export const PLACEHOLDER = /^(deleted ?user|\[deleted\]|pengguna|anonymous|anonim|user)$/i;
export const isPlaceholder = (akun: string) => PLACEHOLDER.test(akun.trim());

const containsSeq = (hay: string, needle: string) => `-${hay}-`.includes(`-${needle}-`);
const textOf = (t: Terlapor) => [t.nama, Array.isArray(t.dugaan) ? t.dugaan.join(' ') : t.dugaan, ...t.catatan, ...t.somasi, t.aduan].join(' ');

/** Every cross-source match, each with the rule that produced it and whether that rule is a fact or an inference. */
export function computeMatches(site: WatchStore, perkara: Perkara, fomo: Fomo): Match[] {
  const paths = Object.keys(site.urls);
  const targets = paths.filter((p) => /^\/targets\/[^/]+\/$/.test(p)).map((p) => p.split('/')[2]);
  const evidence = paths.filter((p) => p.startsWith('/evidence/')).map((p) => p.split('/')[2]);
  const accounts = new Map(fomo.accounts.filter((a) => !isPlaceholder(a.akun)).map((a) => [a.akun.toLowerCase(), a.akun]));
  const companies = [...new Set(fomo.accounts.filter((a) => !isPlaceholder(a.akun)).map((a) => a.perusahaan).filter((c): c is string => !!c))];
  const out: Match[] = [];

  for (const t of perkara.terlapor) {
    if (t.nama.includes('[nama di lampiran]')) continue;
    const keys = nameKeys(t.nama);
    const base = { terlapor: t.id, nama: t.nama };
    // 1. The hostile site lists this name under targets/.
    const exact = targets.find((s) => keys.includes(s));
    if (exact) out.push({ ...base, type: 'target-slug', confidence: 'fact', other: `targets/${exact}/`, evidence: 'slug = nama', count: 1 });
    else {
      const toks = keys[0]?.split('-') ?? [];
      const fuzzy = toks.length >= 2 ? targets.find((s) => { const st = s.split('-'); return st[0] === toks[0] && st.includes(toks.at(-1)!); }) : undefined;
      if (fuzzy) out.push({ ...base, type: 'target-slug-fuzzy', confidence: 'inference', other: `targets/${fuzzy}/`, evidence: 'nama depan + belakang sama', count: 1 });
    }
    // 2. The name appears in the hostile site's evidence slugs.
    const full = evidence.filter((e) => keys.some((k) => containsSeq(e, k)));
    if (full.length) out.push({ ...base, type: 'evidence-name', confidence: 'fact', other: 'evidence/', evidence: full[0], count: full.length });
    else {
      const two = keys[0]?.split('-').slice(0, 2).join('-');
      const part = two && two.length >= 8 ? evidence.filter((e) => containsSeq(e, two)) : [];
      if (part.length) out.push({ ...base, type: 'evidence-name-partial', confidence: 'inference', other: 'evidence/', evidence: part[0], count: part.length });
    }
    // 3. An organisation named in the terlapor's entry is also a Fomo company badge (shared organisation, not identity).
    const hay = slugify(`${t.nama} ${t.klaster ?? ''}`);
    for (const c of companies) {
      const k = slugify(c);
      if (k.length >= 4 && containsSeq(hay, k)) out.push({ ...base, type: 'organisation', confidence: 'inference', other: c, evidence: 'organisasi sama disebut', count: fomo.accounts.filter((a) => a.perusahaan === c).length });
    }
    // 4. An @handle in the terlapor's entry equals a Fomo account name.
    for (const h of new Set([...textOf(t).matchAll(/@([A-Za-z0-9_.]{3,})/g)].map((m) => m[1].replace(/\.+$/, '').toLowerCase()))) {
      const acc = accounts.get(h);
      if (acc) out.push({ ...base, type: 'handle', confidence: 'inference', other: acc, evidence: `@${h}`, count: 1 });
    }
  }
  // 5. The hostile site's own evidence pages that are about Fomo.
  const aboutFomo = evidence.filter((e) => /(^|-)fomo(-|$)/.test(e));
  if (aboutFomo.length) out.push({ type: 'site-mentions-fomo', confidence: 'fact', other: 'Fomo', evidence: aboutFomo[0], count: aboutFomo.length });
  return out;
}

const TOP_COMPANIES = 6;

/** All nodes (centre, hubs, clusters, members) and finest-level edges. Layout and projection happen in the island. */
export function buildGraph(site: WatchStore, perkara: Perkara, fomo: Fomo, matches: readonly Match[]): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const add = (n: GNode) => { nodes.push(n); return n.id; };

  add({ id: 'rw', kind: 'center', source: 'rw', label: 'Rahmat Wibowo', count: 1 });

  // rahmatwibowo.net: one cluster per section group.
  const paths = Object.keys(site.urls);
  const sec = (p: string) => p.split('/')[1] ?? '';
  const groups: [string, string, (p: string) => boolean][] = [
    ['evidence', 'evidence/', (p) => sec(p) === 'evidence'],
    ['targets', 'targets/', (p) => sec(p) === 'targets'],
    ['documents', 'documents/', (p) => sec(p) === 'documents'],
    ['other', 'lainnya', (p) => !['evidence', 'targets', 'documents'].includes(sec(p))],
  ];
  add({ id: 'site', kind: 'hub', source: 'site', label: 'rahmatwibowo.net', count: paths.length, members: groups.map((g) => `site:${g[0]}`) });
  for (const [key, label, test] of groups) {
    const n = paths.filter(test).length;
    add({ id: `site:${key}`, kind: 'cluster', source: 'site', label, count: n, parent: 'site' });
    edges.push({ from: `site:${key}`, to: 'rw', kind: 'in-fact', weight: n });
  }

  // Terlapor, grouped by category.
  const byKat = new Map<string, Terlapor[]>();
  for (const t of perkara.terlapor) byKat.set(t.kategori, [...(byKat.get(t.kategori) ?? []), t]);
  const katKeys = [...byKat.keys()].sort();
  add({ id: 'perkara', kind: 'hub', source: 'perkara', label: 'Terlapor', count: perkara.terlapor.length, members: katKeys.map((k) => `pk:${k.slice(0, 1)}`) });
  for (const k of katKeys) {
    const ts = byKat.get(k)!;
    add({ id: `pk:${k.slice(0, 1)}`, kind: 'cluster', source: 'perkara', label: k.replace(/^[A-Z]\.\s*/, ''), sub: k.slice(0, 1), count: ts.length, parent: 'perkara', members: ts.map((t) => `tl:${t.id}`) });
    for (const t of ts) {
      add({ id: `tl:${t.id}`, kind: 'member', source: 'perkara', label: t.nama.replace(/\s*\((akun|pengelola)[^)]*\)/i, ''), sub: t.id, count: 1, parent: `pk:${k.slice(0, 1)}` });
      edges.push({ from: `tl:${t.id}`, to: 'rw', kind: 'in-allegation', weight: 1, note: 'dugaan' });
      const responses = t.somasi.length + (t.aduan && !/^(-|belum ada)$/i.test(t.aduan.trim()) ? 1 : 0);
      if (responses) edges.push({ from: 'rw', to: `tl:${t.id}`, kind: 'out-response', weight: responses, note: 'somasi/aduan' });
    }
  }

  // Police reports: by the Pelapor (out) and against him (in).
  const lpOut = perkara.laporan.filter((l) => l.arah === 'oleh-pelapor');
  const lpIn = perkara.laporan.filter((l) => l.arah === 'terhadap-pelapor');
  add({ id: 'laporan', kind: 'hub', source: 'laporan', label: 'Laporan polisi', count: perkara.laporan.length, members: ['lp:out', 'lp:in'] });
  add({ id: 'lp:out', kind: 'cluster', source: 'laporan', label: 'oleh Pelapor', count: lpOut.length, parent: 'laporan', members: lpOut.map((l) => `lp:${l.no}`) });
  add({ id: 'lp:in', kind: 'cluster', source: 'laporan', label: 'terhadap Pelapor', count: lpIn.length, parent: 'laporan', members: lpIn.map((l) => `lp:${l.no}`) });
  const known = new Set(perkara.terlapor.map((t) => t.id));
  for (const l of perkara.laporan) {
    const out = l.arah === 'oleh-pelapor';
    add({ id: `lp:${l.no}`, kind: 'member', source: 'laporan', label: l.no, sub: l.nomor, count: 1, parent: out ? 'lp:out' : 'lp:in' });
    if (out) edges.push({ from: 'rw', to: `lp:${l.no}`, kind: 'out-response', weight: 1, note: 'laporan polisi' });
    else edges.push({ from: `lp:${l.no}`, to: 'rw', kind: 'against', weight: 1, note: 'laporan terhadap Pelapor' });
    // Lampiran A parties (L-xx) are never named; such a report links to no terlapor node.
    for (const id of l.terlapor.filter((x) => known.has(x))) {
      if (out) edges.push({ from: `lp:${l.no}`, to: `tl:${id}`, kind: 'out-response', weight: 1, note: 'terlapor dalam laporan' });
      else edges.push({ from: `tl:${id}`, to: `lp:${l.no}`, kind: 'against', weight: 1, note: 'pelapor laporan ini' });
    }
  }

  // Fomo: the top company badges, the rest, the unbadged accounts, and the threads.
  const postsBy = new Map<string, number>();
  for (const p of fomo.posts) postsBy.set(p.akun, (postsBy.get(p.akun) ?? 0) + 1);
  const people = fomo.accounts.filter((a) => !isPlaceholder(a.akun));
  const placeholders = fomo.accounts.filter((a) => isPlaceholder(a.akun));
  const compPosts = new Map<string, number>();
  for (const a of people) if (a.perusahaan) compPosts.set(a.perusahaan, (compPosts.get(a.perusahaan) ?? 0) + (postsBy.get(a.akun) ?? 0));
  const top = [...compPosts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP_COMPANIES).map(([c]) => c);
  const clusterOf = (a: { perusahaan: string | null }) => (!a.perusahaan ? 'fm:anon' : top.includes(a.perusahaan) ? `fm:c:${a.perusahaan}` : 'fm:other');
  const fmClusters = [...top.map((c) => `fm:c:${c}`), 'fm:other', 'fm:anon', 'fm:deleted', 'fm:threads'];
  add({ id: 'fomo', kind: 'hub', source: 'fomo', label: 'Fomo', count: fomo.posts.length, members: fmClusters });
  const accBy = new Map<string, string[]>();
  for (const a of people) accBy.set(clusterOf(a), [...(accBy.get(clusterOf(a)) ?? []), a.akun]);
  for (const id of fmClusters.filter((c) => c !== 'fm:deleted' && c !== 'fm:threads')) {
    const accs = accBy.get(id) ?? [];
    const label = id === 'fm:other' ? 'perusahaan lain' : id === 'fm:anon' ? 'tanpa lencana' : id.slice(5);
    add({ id, kind: 'cluster', source: 'fomo', label, count: accs.length, parent: 'fomo', members: accs.map((a) => `fa:${a}`) });
  }
  // Placeholder names (e.g. DeletedUser) stand for many deleted accounts: one group, no members, posts counted on it.
  const placeholderPosts = placeholders.reduce((n, a) => n + (postsBy.get(a.akun) ?? 0), 0);
  add({ id: 'fm:deleted', kind: 'cluster', source: 'fomo', label: 'akun terhapus', sub: placeholders.map((a) => a.akun).join(', '), count: placeholders.length, parent: 'fomo' });
  if (placeholderPosts) edges.push({ from: 'fm:deleted', to: 'rw', kind: 'in-fact', weight: placeholderPosts, note: 'postingan' });
  add({ id: 'fm:threads', kind: 'cluster', source: 'fomo', label: 'thread', count: fomo.threads.length, parent: 'fomo', members: fomo.threads.map((t) => `ft:${t.thread}`) });
  for (const a of people) {
    add({ id: `fa:${a.akun}`, kind: 'member', source: 'fomo', label: a.akun, sub: a.perusahaan ?? undefined, count: postsBy.get(a.akun) ?? 0, parent: clusterOf(a) });
    const n = postsBy.get(a.akun) ?? 0;
    if (n) edges.push({ from: `fa:${a.akun}`, to: 'rw', kind: 'in-fact', weight: n, note: 'postingan' });
  }
  // Posts by accounts outside the account table (excluded in the source files) still count, on the unbadged cluster.
  const listed = new Set(fomo.accounts.map((a) => a.akun));
  const unlisted = fomo.posts.filter((p) => !listed.has(p.akun)).length;
  if (unlisted) edges.push({ from: 'fm:anon', to: 'rw', kind: 'in-fact', weight: unlisted, note: 'postingan' });
  for (const t of fomo.threads) {
    // Threads carry no edge of their own to the centre: their posts are already counted on the accounts.
    add({ id: `ft:${t.thread}`, kind: 'member', source: 'fomo', label: `#${t.thread}`, sub: t.judul, count: t.posts, parent: 'fm:threads' });
  }
  for (const p of fomo.posts) if (listed.has(p.akun) && !isPlaceholder(p.akun)) edges.push({ from: `fa:${p.akun}`, to: `ft:${p.thread}`, kind: 'structure', weight: 1 });
  // The dossier says the Fomo matter was reported separately: a response out.
  edges.push({ from: 'rw', to: 'fomo', kind: 'out-response', weight: 1, note: 'diadukan terpisah' });

  // Cross-source links from the matches.
  for (const m of matches) {
    const kind: EdgeKind = m.confidence === 'fact' ? 'cross-fact' : 'cross-inference';
    const from = m.terlapor ? `tl:${m.terlapor}` : 'site:evidence';
    const to = m.type === 'target-slug' || m.type === 'target-slug-fuzzy' ? 'site:targets'
      : m.type === 'evidence-name' || m.type === 'evidence-name-partial' ? 'site:evidence'
        : m.type === 'organisation' ? (top.includes(m.other) ? `fm:c:${m.other}` : 'fm:other')
          : m.type === 'handle' ? `fa:${m.other}` : 'fomo';
    edges.push({ from, to, kind, weight: m.type === 'organisation' ? 1 : m.count, note: m.type });
  }
  return { nodes, edges };
}

/** The visible stand-in for a node: itself, or its nearest ancestor that is visible. */
export function visibleAncestor(id: string, byId: ReadonlyMap<string, GNode>, visible: ReadonlySet<string>): string | null {
  let cur: string | undefined = id;
  while (cur) {
    if (visible.has(cur)) return cur;
    cur = byId.get(cur)?.parent;
  }
  return null;
}

/** Centre, hubs and clusters are always visible; members only inside expanded clusters. */
export function visibleNodes(nodes: readonly GNode[], expanded: ReadonlySet<string>): GNode[] {
  return nodes.filter((n) => n.kind !== 'member' || (n.parent !== undefined && expanded.has(n.parent)));
}

/** Edges mapped onto visible nodes, merged by (from, to, kind) with weights summed; self-loops dropped. */
export function projectEdges(edges: readonly GEdge[], byId: ReadonlyMap<string, GNode>, visible: ReadonlySet<string>): GEdge[] {
  const m = new Map<string, GEdge>();
  for (const e of edges) {
    // Structure (account posted in thread) is drawn only between two visible members, never folded into clusters.
    if (e.kind === 'structure' && !(visible.has(e.from) && visible.has(e.to))) continue;
    const from = visibleAncestor(e.from, byId, visible);
    const to = visibleAncestor(e.to, byId, visible);
    if (!from || !to || from === to) continue;
    const key = `${from}|${to}|${e.kind}`;
    const prev = m.get(key);
    if (prev) prev.weight += e.weight;
    else m.set(key, { from, to, kind: e.kind, weight: e.weight, note: e.note });
  }
  return [...m.values()];
}

export interface Placed extends GNode { x: number; y: number; r: number }

/** Sector (centre angle, half width, degrees) per source; 0 deg = right, clockwise. Sectors never overlap. */
export const SECTORS: Record<Exclude<Source, 'rw'>, [number, number]> = { site: [-90, 40], fomo: [10, 58], laporan: [96, 13], perkara: [168, 50] };

/**
 * Deterministic radial layout in a square of side `size`: centre in the middle, hubs on ring 1, clusters spread in
 * their source's sector on ring 2, expanded members on rings 3-4 (alternating, so dense lists don't overlap).
 */
export function layout(nodes: readonly GNode[], size: number): Placed[] {
  const c = size / 2;
  // Outer rings stop short of the edge so side labels (up to ~20 characters) fit inside the square.
  const R = [0, size * 0.15, size * 0.27, size * 0.35, size * 0.385, size * 0.42];
  const rad = (deg: number) => (deg * Math.PI) / 180;
  // Rounded to 2 decimals so server and client print identical numbers (float formatting can differ by engine).
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const at = (radius: number, deg: number) => ({ x: r2(c + radius * Math.cos(rad(deg))), y: r2(c + radius * Math.sin(rad(deg))) });
  const nodeR = (n: GNode) => r2(n.kind === 'center' ? size * 0.045 : n.kind === 'hub' ? size * 0.03 : n.kind === 'cluster' ? Math.max(size * 0.011, Math.min(size * 0.021, size * 0.005 * Math.log2(n.count + 2))) : Math.max(2.5, size * 0.0055));
  const byParent = new Map<string, GNode[]>();
  for (const n of nodes) if (n.parent) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n]);
  const out: Placed[] = [];
  const angle = new Map<string, [number, number]>(); // node id -> [centre angle, half span]
  for (const n of nodes) {
    if (n.kind === 'center') out.push({ ...n, ...at(0, 0), r: nodeR(n) });
    if (n.kind === 'hub') {
      const [a, half] = SECTORS[n.source as Exclude<Source, 'rw'>];
      angle.set(n.id, [a, half]);
      out.push({ ...n, ...at(R[1], a), r: nodeR(n) });
      const kids = byParent.get(n.id) ?? [];
      kids.forEach((k, i) => {
        const span = (2 * half) / kids.length;
        const ka = a - half + span * (i + 0.5);
        angle.set(k.id, [ka, span / 2]);
        out.push({ ...k, ...at(R[2], ka), r: nodeR(k) });
      });
    }
  }
  for (const n of nodes) {
    if (n.kind !== 'cluster') continue;
    const kids = (byParent.get(n.id) ?? []).filter((k) => nodes.includes(k));
    if (!kids.length) continue;
    const [a, half] = angle.get(n.id) ?? [0, 10];
    // A short list fans out around its cluster; a long one uses its whole source sector on three rings.
    const sector = n.source !== 'rw' ? SECTORS[n.source] : [a, half];
    const big = kids.length > 12;
    const [ca, spread] = big ? [sector[0], sector[1] - 2] : [a, Math.min(half * 2.6, 50)];
    const rings = big ? [R[3], R[4], R[5]] : [R[3], R[4]];
    kids.forEach((k, i) => {
      const ka = kids.length === 1 ? ca : ca - spread + (2 * spread * i) / (kids.length - 1);
      out.push({ ...k, ...at(rings[i % rings.length], ka), r: nodeR(k) });
    });
  }
  return out;
}

/** Neighbours of a visible node through the projected edges, with the edge that links them. */
export interface Neighbour { other: string; edge: GEdge; dir: 'in' | 'out' }
export function neighbours(id: string, edges: readonly GEdge[]): Neighbour[] {
  const out: Neighbour[] = [];
  for (const e of edges) {
    if (e.from === id) out.push({ other: e.to, edge: e, dir: 'out' });
    else if (e.to === id) out.push({ other: e.from, edge: e, dir: 'in' });
  }
  return out;
}
