// One graph of every item across the three /pantau datasets, Rahmat Wibowo at the centre as the person they are all about:
// attacks in (orange), his legal responses out (blue), reports against him (neutral), cross-source matches (aqua).
// Server-rendered, hydrated for expand/focus. A side panel mirrors the selection for screen readers and phones, and a
// table lists every cross-source match with how it was made.
//
// Motion (motion/react, lazily loaded features): opening a group springs its members out of the group's node and
// closing pulls them back; line ends ride the same spring so they stay attached. Nothing animates on first mount, so
// the server-rendered graph is never replayed, and prefers-reduced-motion turns transforms and the halo loop off.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from 'motion/react';
import {
  EDGE_KINDS, SECTORS, layout, neighbours, projectEdges, visibleNodes,
  type EdgeKind, type GEdge, type GNode, type Match, type Placed, type Source,
} from '../lib/relasi';

// Two decimals everywhere a coordinate is printed, so server-rendered and client markup are byte-identical.
const r2 = (v: number) => Math.round(v * 100) / 100;

type Locale = 'id' | 'en';

const T = {
  id: {
    center: 'Sasaran / Pelapor', centerSub: '(korban menurut laporannya)',
    headline: (n: ReactNode, t: number, f: number) => <>{n} dari {t} nama yang dicantumkan rahmatwibowo.net sebagai "target" Rahmat Wibowo adalah orang yang ia laporkan sebagai terlapor{f ? ` (+${f} kecocokan tidak persis)` : ''}.</>,
    headlineSub: 'Situs yang menyebut Pelapor pelaku pelecehan mencantumkan, sebagai "korbannya", orang-orang yang justru ia laporkan atas dugaan pencemaran nama baik terhadap dirinya.',
    edge: { 'in-fact': 'Konten tentang Pelapor (terdokumentasi)', 'in-allegation': 'Perbuatan yang diduga Pelapor (dugaan)', 'out-response': 'Tanggapan hukum Pelapor (somasi, aduan, laporan)', against: 'Laporan pihak lain terhadap Pelapor', 'cross-fact': 'Kecocokan lintas sumber (fakta)', 'cross-inference': 'Kecocokan lintas sumber (dugaan)' } as Record<EdgeKind, string>,
    source: { rw: 'Pelapor', site: 'Situs rahmatwibowo.net', perkara: 'Terlapor (gelar perkara)', fomo: 'Fomo', laporan: 'Laporan polisi' } as Record<Source, string>,
    kind: { center: 'pusat', hub: 'sumber', cluster: 'kelompok', member: 'butir' },
    legend: 'Jenis hubungan (tekan untuk menampilkan atau menyembunyikan)', expandAll: 'Buka semua kelompok terlapor', collapse: 'Tutup semua',
    panelEmpty: 'Arahkan atau tekan sebuah titik untuk melihat hubungannya. Tekan sebuah kelompok untuk membukanya.',
    open: 'Buka kelompok', close: 'Tutup kelompok', items: (n: number) => `${n} butir`, links: 'Hubungan', toCenter: 'ke Pelapor', fromCenter: 'dari Pelapor',
    weight: (n: number) => `bobot ${n}`, matchesH: (n: number) => `Kecocokan lintas sumber (${n})`,
    mCols: { terlapor: 'Terlapor', other: 'Ditemukan di', type: 'Cara cocok', conf: 'Status', ev: 'Contoh', n: 'Jumlah' },
    mType: { 'target-slug': 'Nama = slug targets/', 'target-slug-fuzzy': 'Nama depan + belakang di slug targets/', 'evidence-name': 'Nama lengkap di slug evidence/', 'evidence-name-partial': 'Dua kata awal nama di slug evidence/', organisation: 'Organisasi yang sama juga lencana Fomo', handle: 'Nama akun sama', 'site-mentions-fomo': 'Halaman evidence/ tentang Fomo' },
    conf: { fact: 'Fakta', inference: 'Dugaan' },
    matchNote: 'Kecocokan menunjukkan nama atau organisasi yang sama muncul di dua sumber, bukan bahwa orangnya sama. Akun Fomo anonim tidak pernah dicocokkan dengan nama orang.',
    graphLabel: 'Grafik hubungan antara situs rahmatwibowo.net, terlapor, laporan polisi, dan Fomo, dengan Pelapor di tengah',
    sectorList: 'Daftar kelompok per sumber',
    placeholderNote: (n: string) => `Nama pengganti dari Fomo (${n}) untuk banyak akun yang sudah dihapus, bukan satu orang; tidak dicocokkan dengan siapa pun.`,
  },
  en: {
    center: 'Target / Pelapor', centerSub: '(victim per his reports)',
    headline: (n: ReactNode, t: number, f: number) => <>{n} of the {t} names rahmatwibowo.net lists as Rahmat Wibowo's "targets" are people he reported as terlapor{f ? ` (+${f} inexact matches)` : ''}.</>,
    headlineSub: 'The site that calls the Pelapor a harasser lists, as his "victims", the very people he reported for allegedly defaming him.',
    edge: { 'in-fact': 'Content about the Pelapor (documented)', 'in-allegation': 'Act alleged by the Pelapor (allegation)', 'out-response': "The Pelapor's legal responses (somasi, complaints, reports)", against: 'Reports by others against the Pelapor', 'cross-fact': 'Cross-source match (fact)', 'cross-inference': 'Cross-source match (inference)' } as Record<EdgeKind, string>,
    source: { rw: 'Pelapor', site: 'The rahmatwibowo.net site', perkara: 'Terlapor (case review)', fomo: 'Fomo', laporan: 'Police reports' } as Record<Source, string>,
    kind: { center: 'centre', hub: 'source', cluster: 'group', member: 'item' },
    legend: 'Link types (press to show or hide)', expandAll: 'Open every terlapor group', collapse: 'Close all',
    panelEmpty: 'Hover or press a node to see its links. Press a group to open it.',
    open: 'Open group', close: 'Close group', items: (n: number) => `${n} items`, links: 'Links', toCenter: 'to the Pelapor', fromCenter: 'from the Pelapor',
    weight: (n: number) => `weight ${n}`, matchesH: (n: number) => `Cross-source matches (${n})`,
    mCols: { terlapor: 'Terlapor', other: 'Found in', type: 'Match rule', conf: 'Status', ev: 'Example', n: 'Count' },
    mType: { 'target-slug': 'Name = targets/ slug', 'target-slug-fuzzy': 'First + last name in a targets/ slug', 'evidence-name': 'Full name in an evidence/ slug', 'evidence-name-partial': 'First two name words in an evidence/ slug', organisation: 'Same organisation is also a Fomo badge', handle: 'Same account name', 'site-mentions-fomo': 'evidence/ pages about Fomo' },
    conf: { fact: 'Fact', inference: 'Inference' },
    matchNote: 'A match shows the same name or organisation appears in two sources, not that it is the same person. Anonymous Fomo accounts are never matched to anyone\'s name.',
    graphLabel: 'Graph of links between the rahmatwibowo.net site, the terlapor, police reports and Fomo, with the Pelapor at the centre',
    sectorList: 'Groups by source',
    placeholderNote: (n: string) => `Fomo's stand-in name (${n}) for many deleted accounts, not one person; never matched to anyone.`,
  },
};

const EN_LABELS: Record<string, string> = {
  lainnya: 'other', 'perusahaan lain': 'other companies', 'tanpa lencana': 'no badge', 'akun terhapus': 'deleted accounts',
  thread: 'threads', 'oleh Pelapor': 'by the Pelapor', 'terhadap Pelapor': 'against the Pelapor', 'Laporan polisi': 'Police reports',
};
const EDGE_CLS: Record<EdgeKind, string> = { 'in-fact': 'rg-e--in', 'in-allegation': 'rg-e--alleg', 'out-response': 'rg-e--out', against: 'rg-e--against', 'cross-fact': 'rg-e--cross', 'cross-inference': 'rg-e--crossinf', structure: 'rg-e--struct' };

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const strokeW = (w: number) => Math.min(7, 1 + 1.4 * Math.log10(w + 1));

/** The shape of a node says its source, so identity never rests on color alone. Drawn around (0, 0): the node's
 *  group carries its position as a transform, which is what the spring animates. */
function Shape({ n }: { n: Placed }) {
  const cls = `rg-n rg-n--${n.kind} rg-n--${n.source}`;
  const r = n.r;
  if (n.source === 'site' && n.kind !== 'hub') return <rect className={cls} x={r2(-r)} y={r2(-r)} width={r2(r * 2)} height={r2(r * 2)} rx={2} />;
  if (n.source === 'perkara' && n.kind !== 'hub') return <path className={cls} d={`M0,${r2(-r * 1.2)}L${r2(r * 1.2)},0L0,${r2(r * 1.2)}L${r2(-r * 1.2)},0Z`} />;
  if (n.source === 'laporan' && n.kind !== 'hub') return <path className={cls} d={`M0,${r2(-r * 1.2)}L${r2(r * 1.1)},${r2(r * 0.8)}L${r2(-r * 1.1)},${r2(r * 0.8)}Z`} />;
  return <circle className={cls} cx={0} cy={0} r={r2(r)} />;
}

type Pt = { x: number; y: number; r: number };
/** Line from rim to rim, leaving room for the arrowhead at the end. */
function rim(a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x1: r2(a.x + (dx / d) * a.r), y1: r2(a.y + (dy / d) * a.r), x2: r2(b.x - (dx / d) * (b.r + 3)), y2: r2(b.y - (dy / d) * (b.r + 3)) };
}

const SPRING = { type: 'spring', stiffness: 260, damping: 30, mass: 0.8 } as const;
const FADE = { duration: 0.18, ease: 'easeOut' } as const;
const edgeKey = (e: GEdge) => `${e.from}|${e.to}|${e.kind}`;

export interface RelasiGraphProps { nodes: GNode[]; edges: GEdge[]; matches: Match[]; targetsTotal: number; locale?: Locale }

export default function RelasiGraph(props: RelasiGraphProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <Graph {...props} />
      </MotionConfig>
    </LazyMotion>
  );
}

function Graph({ nodes, edges, matches, targetsTotal, locale = 'id' }: RelasiGraphProps) {
  const t = T[locale];
  const reduce = useReducedMotion();
  const [ref, W] = useWidth(720);
  const size = Math.min(W, 820);
  const narrow = W < 560;
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<EdgeKind>>(new Set());

  const vis = useMemo(() => visibleNodes(nodes, expanded), [nodes, expanded]);
  const visIds = useMemo(() => new Set(vis.map((n) => n.id)), [vis]);
  const placed = useMemo(() => layout(vis, size), [vis, size]);
  const pos = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);
  // Every projected edge is drawn (hidden kinds fade out as a group); neighbours use only the shown kinds.
  const projAll = useMemo(() => projectEdges(edges, byId, visIds), [edges, byId, visIds]);
  const proj = useMemo(() => projAll.filter((e) => !hidden.has(e.kind)), [projAll, hidden]);
  const focus = hover ?? selected;
  const near = useMemo(() => (focus ? new Set([focus, ...neighbours(focus, proj).map((x) => x.other)]) : null), [focus, proj]);

  // Members that were not visible on the previous render enter from their parent; nothing enters on first mount.
  const prevVis = useRef<Set<string> | null>(null);
  useEffect(() => { prevVis.current = visIds; }, [visIds]);
  const entering = useMemo(() => {
    const out = new Map<string, number>();
    const prev = prevVis.current;
    if (!prev) return out;
    for (const n of vis) if (!prev.has(n.id)) out.set(n.id, Math.min(0.35, out.size * 0.006));
    return out;
    // prevVis is read at the moment vis changes, which is exactly when entering members are decided.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vis]);
  const origin = (id: string): Pt => {
    const n = byId.get(id);
    const p = n?.parent ? pos.get(n.parent) : undefined;
    const self = pos.get(id)!;
    return p ? { x: p.x, y: p.y, r: self.r } : self;
  };

  const label = (n: GNode) => (n.id === 'rw' ? t.center : locale === 'en' ? EN_LABELS[n.label] ?? n.label : n.label);
  const toggle = (id: string) => setExpanded((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const press = (n: GNode) => { setSelected(n.id); if (n.kind === 'cluster' && n.members?.length) toggle(n.id); };
  /** Select any node, opening its group first if it is a hidden member. */
  const goTo = (id: string) => {
    const n = byId.get(id);
    if (n?.kind === 'member' && n.parent) setExpanded((s) => (s.has(n.parent!) ? s : new Set([...s, n.parent!])));
    setSelected(id);
  };
  const showInGraph = (id: string) => {
    goTo(id);
    ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  };
  // Escape clears the selection wherever focus is: following a panel link unmounts the button that had focus.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelected(null); setHover(null); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);
  const exact = matches.filter((m) => m.type === 'target-slug').length;
  const fuzzy = matches.filter((m) => m.type === 'target-slug-fuzzy').length;
  const sel = selected ? byId.get(selected) : null;
  const selLinks = selected && visIds.has(selected) ? neighbours(selected, proj) : [];

  const edgeLine = (e: GEdge) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) return null;
    const end = rim(a, b);
    const ea = entering.get(e.from);
    const eb = entering.get(e.to);
    const isNew = ea !== undefined || eb !== undefined;
    const start = isNew ? rim(ea !== undefined ? origin(e.from) : a, eb !== undefined ? origin(e.to) : b) : end;
    const dim = near && !(near.has(e.from) && near.has(e.to));
    const sw = r2(strokeW(e.weight));
    return (
      <m.line key={edgeKey(e)} className={`rg-e ${EDGE_CLS[e.kind]}${dim ? ' rg-dim' : ''}${near && !dim ? ' rg-hot' : ''}`}
        initial={isNew ? { ...start, strokeWidth: sw } : false} animate={{ ...end, strokeWidth: sw }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        transition={{ ...SPRING, delay: Math.max(ea ?? 0, eb ?? 0) }}
        markerEnd={e.kind === 'structure' ? undefined : `url(#rg-arrow-${e.kind})`}>
        <title>{`${label(byId.get(e.from)!)} → ${label(byId.get(e.to)!)}: ${t.edge[e.kind as Exclude<EdgeKind, 'structure'>] ?? ''} (${e.weight})`}</title>
      </m.line>
    );
  };

  return (
    <div className="rg">
      <div className="rg-headline" role="note">
        <p className="rg-headline__big">{t.headline(
          <m.span className="rg-key" initial={{ backgroundSize: '0% 0.18em' }} whileInView={{ backgroundSize: '100% 0.18em' }}
            viewport={{ once: true, amount: 0.8 }} transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}>{exact}</m.span>,
          targetsTotal, fuzzy)}</p>
        <p className="muted">{t.headlineSub}</p>
      </div>

      <div className="rg-controls">
        <p className="rg-controls__label">{t.legend}</p>
        <ul className="rg-legend">
          {EDGE_KINDS.map((k) => (
            <li key={k}>
              <button type="button" className="viz-chip rg-chip" aria-pressed={!hidden.has(k)}
                onClick={() => setHidden((h) => { const x = new Set(h); if (x.has(k)) x.delete(k); else x.add(k); return x; })}>
                <svg width="26" height="10" aria-hidden="true"><line className={`rg-e ${EDGE_CLS[k]}`} x1="1" y1="5" x2="25" y2="5" strokeWidth={2.5} /></svg>
                {t.edge[k]}
              </button>
            </li>
          ))}
        </ul>
        <div className="rg-actions">
          <button type="button" className="viz-chip" onClick={() => setExpanded(new Set(nodes.filter((n) => n.kind === 'cluster' && n.source === 'perkara').map((n) => n.id)))}>{t.expandAll}</button>
          <button type="button" className="viz-chip" disabled={expanded.size === 0} onClick={() => { setExpanded(new Set()); setSelected(null); }}>{t.collapse}</button>
        </div>
      </div>

      <div className="rg-body">
        <div ref={ref} className="rg-frame">
          {/* The rings stay inside the middle 90% of the square, so the view is cropped top and bottom. */}
          <svg width={size} height={Math.round(size * 0.9)} viewBox={`0 ${Math.round(size * 0.05)} ${size} ${Math.round(size * 0.9)}`} role="group" aria-label={t.graphLabel} className="rg-svg"
            onPointerLeave={() => setHover(null)}>
            <defs>
              {EDGE_KINDS.map((k) => (
                <marker key={k} id={`rg-arrow-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path className={`rg-arrow ${EDGE_CLS[k]}`} d="M0,1L9,5L0,9Z" />
                </marker>
              ))}
            </defs>
            {!narrow && (['site', 'fomo', 'perkara', 'laporan'] as const).map((s) => {
              // Each caption sits on the outer edge of its own sector.
              const c = size / 2;
              // Side sectors put their caption at the sector's upper edge, clear of the horizontal labels.
              const [mid, half] = SECTORS[s];
              const deg = s === 'fomo' ? mid - half + 4 : s === 'perkara' ? mid - half + 6 : mid;
              const a = (deg * Math.PI) / 180;
              const lx = c + Math.cos(a) * size * 0.44;
              const ly = c + Math.sin(a) * size * 0.44;
              const anchor = Math.cos(a) > 0.3 ? 'end' : Math.cos(a) < -0.3 ? 'start' : 'middle';
              return <text key={s} className="rg-sector" x={r2(Math.min(size - 4, Math.max(4, lx)))} y={r2(Math.min(size * 0.95 - 6, Math.max(size * 0.05 + 14, ly)))} textAnchor={anchor}>{t.source[s]}</text>;
            })}
            {/* One group per link type, so a legend toggle fades the whole type out and back in. */}
            {[...EDGE_KINDS, 'structure' as const].map((k) => (
              <m.g key={k} initial={false} animate={{ opacity: hidden.has(k) ? 0 : 1 }} transition={FADE}
                className={hidden.has(k) ? 'rg-off' : undefined} aria-hidden={hidden.has(k) || undefined}>
                <AnimatePresence initial={false}>{projAll.filter((e) => e.kind === k).map(edgeLine)}</AnimatePresence>
              </m.g>
            ))}
            <g>
              <AnimatePresence initial={false}>
                {placed.map((n) => {
                  const dim = near && !near.has(n.id);
                  const c = size / 2;
                  const right = n.x >= c;
                  // Member labels only where they can be read: small groups, or the focused node and its neighbours.
                  const groupSize = n.parent ? byId.get(n.parent)?.members?.length ?? 0 : 0;
                  const showLabel = n.kind === 'hub' || (n.kind === 'cluster' && !narrow) || (n.kind === 'member' && (!!near?.has(n.id) || (!narrow && groupSize <= 16)));
                  const lbl = n.kind === 'center' ? null : short(label(n), n.kind === 'member' ? 18 : narrow ? 16 : 20);
                  const expandable = n.kind === 'cluster' && !!n.members?.length;
                  const delay = entering.get(n.id);
                  const from = delay !== undefined ? origin(n.id) : null;
                  const parent = n.parent ? pos.get(n.parent) : undefined;
                  return (
                    <m.g key={n.id} className={`rg-node${selected === n.id ? ' rg-sel' : ''}${expandable ? ' rg-node--x' : ''}`} tabIndex={0} role="button"
                      aria-label={`${label(n)}${n.sub && n.kind === 'member' ? `, ${n.sub}` : ''}: ${t.source[n.source]}, ${t.items(n.count)}${expandable ? `. ${expanded.has(n.id) ? t.close : t.open}` : ''}`}
                      aria-expanded={expandable ? expanded.has(n.id) : undefined}
                      initial={from ? { x: from.x, y: from.y, opacity: 0 } : false}
                      animate={{ x: n.x, y: n.y, opacity: 1 }}
                      exit={parent ? { x: parent.x, y: parent.y, opacity: 0, transition: { ...SPRING, opacity: { duration: 0.2 } } } : { opacity: 0 }}
                      transition={{ ...SPRING, delay: delay ?? 0, opacity: { duration: 0.2, delay: delay ?? 0 } }}
                      onPointerEnter={() => setHover(n.id)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                      onClick={() => press(n)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(n); } }}>
                      <g className={`rg-node__in${dim ? ' rg-dim' : ''}`}>
                        {selected === n.id && (reduce
                          ? <circle className="rg-halo" cx={0} cy={0} r={r2(n.r + 6)} />
                          : <m.circle className="rg-halo" cx={0} cy={0} initial={{ r: n.r + 2, opacity: 0.7 }} animate={{ r: n.r + 14, opacity: 0 }}
                            transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity }} />)}
                        <circle className="rg-hit" cx={0} cy={0} r={r2(Math.max(n.r + 6, 12))} />
                        <m.g initial={false} animate={{ scale: focus === n.id ? 1.18 : 1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
                          <Shape n={n} />
                        </m.g>
                        {expandable && <m.text className="rg-plus" x={0} y={3.5} textAnchor="middle" initial={false}
                          animate={{ rotate: expanded.has(n.id) ? 180 : 0 }} transition={{ duration: 0.25 }}>{expanded.has(n.id) ? '−' : '+'}</m.text>}
                        {n.kind === 'center' && <>
                          <text className="rg-center" x={0} y={4} textAnchor="middle">{narrow ? 'RW' : 'Rahmat Wibowo'}</text>
                          {!narrow && <text className="rg-center rg-center--sub" x={0} y={r2(n.r + 16)} textAnchor="middle">{t.center}</text>}
                          {!narrow && <text className="rg-center rg-center--sub" x={0} y={r2(n.r + 30)} textAnchor="middle">{t.centerSub}</text>}
                        </>}
                        {lbl && showLabel && (
                          <text className={`rg-label rg-label--${n.kind}`} x={n.kind === 'hub' ? 0 : r2(right ? n.r + 5 : -n.r - 5)} y={n.kind === 'hub' ? r2(-n.r - 6) : 4}
                            textAnchor={n.kind === 'hub' ? 'middle' : right ? 'start' : 'end'}>
                            {lbl}{n.kind === 'cluster' ? ` ${n.count}` : ''}
                          </text>
                        )}
                      </g>
                    </m.g>
                  );
                })}
              </AnimatePresence>
            </g>
          </svg>
        </div>

        <aside className="rg-panel" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <m.div key={sel?.id ?? '∅'} className="rg-panel__body" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={FADE}>
              {!sel ? <p className="muted">{t.panelEmpty}</p> : (
                <>
                  <p className="rg-panel__kind">{t.source[sel.source]} · {t.kind[sel.kind]}</p>
                  <h4>{sel.id === 'rw' ? 'Rahmat Wibowo' : label(sel)}</h4>
                  {sel.id === 'rw' && <p className="muted">{t.center} {t.centerSub}</p>}
                  {sel.sub && sel.kind !== 'cluster' && <p className="muted rg-panel__sub">{sel.sub}</p>}
                  {sel.id === 'fm:deleted' && <p className="muted">{t.placeholderNote(sel.sub ?? '')}</p>}
                  <p className="muted">{t.items(sel.count)}</p>
                  {sel.kind === 'cluster' && !!sel.members?.length && (
                    <button type="button" className="viz-chip" aria-expanded={expanded.has(sel.id)} onClick={() => toggle(sel.id)}>{expanded.has(sel.id) ? t.close : t.open}</button>
                  )}
                  {selLinks.length > 0 && <>
                    <p className="rg-panel__h">{t.links}</p>
                    <ul className="rg-panel__list">
                      {selLinks.sort((a, b) => b.edge.weight - a.edge.weight).slice(0, 40).map((l, i) => {
                        const o = byId.get(l.other)!;
                        return (
                          <m.li key={`${l.other}|${l.edge.kind}|${l.dir}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ ...FADE, delay: Math.min(0.4, i * 0.02) }}>
                            <svg width="20" height="8" aria-hidden="true"><line className={`rg-e ${EDGE_CLS[l.edge.kind]}`} x1="1" y1="4" x2="19" y2="4" strokeWidth={2.5} /></svg>
                            <span>
                              <button type="button" className="rg-linkbtn rg-linkbtn--strong" onClick={() => goTo(l.other)}>{l.dir === 'out' ? '→' : '←'} {o.id === 'rw' ? 'Rahmat Wibowo' : label(o)}</button>{' '}
                              <span className="muted">{t.edge[l.edge.kind as Exclude<EdgeKind, 'structure'>] ?? ''} · {t.weight(l.edge.weight)}</span>
                            </span>
                          </m.li>
                        );
                      })}
                    </ul>
                  </>}
                  {sel.kind === 'cluster' && expanded.has(sel.id) && sel.members && (
                    <ul className="rg-panel__members">{sel.members.slice(0, 120).map((mid) => { const mn = byId.get(mid); return mn ? <li key={mid}><button type="button" className="rg-linkbtn" onClick={() => setSelected(mid)}>{short(label(mn), 40)}</button></li> : null; })}</ul>
                  )}
                </>
              )}
            </m.div>
          </AnimatePresence>
        </aside>
      </div>

      {narrow && (
        <nav className="rg-sectors" aria-label={t.sectorList}>
          {(['site', 'fomo', 'perkara', 'laporan'] as const).map((s) => {
            const hub = byId.get(s);
            return hub ? (
              <div key={s} className="rg-sectors__group">
                <p className="rg-sectors__h">{t.source[s]}</p>
                <ul>
                  {(hub.members ?? []).map((id) => {
                    const c = byId.get(id);
                    return c ? (
                      <li key={id}>
                        <button type="button" className="viz-chip" aria-pressed={selected === id} aria-expanded={c.members?.length ? expanded.has(id) : undefined} onClick={() => press(c)}>
                          {label(c)} <span className="muted">{c.count}</span>
                        </button>
                      </li>
                    ) : null;
                  })}
                </ul>
              </div>
            ) : null;
          })}
        </nav>
      )}

      <details className="pantau__how rg-matches" open>
        <summary>{t.matchesH(matches.length)}</summary>
        <p className="muted">{t.matchNote}</p>
        <div className="viz-scroll">
          <table>
            <thead><tr><th scope="col">{t.mCols.terlapor}</th><th scope="col">{t.mCols.other}</th><th scope="col">{t.mCols.type}</th><th scope="col">{t.mCols.conf}</th><th scope="col">{t.mCols.n}</th><th scope="col">{t.mCols.ev}</th></tr></thead>
            <tbody>
              {matches.map((m, i) => (
                <tr key={i} className={m.type === 'target-slug' ? 'rg-row--key' : undefined}>
                  <td>{m.terlapor ? <button type="button" className="rg-linkbtn" onClick={() => showInGraph(`tl:${m.terlapor}`)}>{m.terlapor} · {m.nama}</button> : '–'}</td>
                  <td className="pk-mono">{m.other}</td>
                  <td>{t.mType[m.type]}</td>
                  <td><span className={`pk-arah${m.confidence === 'inference' ? ' pk-arah--terhadap-pelapor' : ''}`}>{t.conf[m.confidence]}</span></td>
                  <td>{m.count}</td>
                  <td className="pk-mono">{short(m.evidence, 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
