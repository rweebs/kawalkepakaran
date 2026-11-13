// The /pantau relationship map in 3D, built like a small history museum. Rahmat Wibowo is one node among the others, not the
// centre: where a node sits comes only from its links (src/lib/relasi-3d.ts). A walk through time (src/lib/
// relasi-journey.ts) shows the graph growing: nodes and links appear on the day their first dated item does; the
// timeline is split into half-year "rooms", each with a placard that explains it and a few featured exhibits, and a
// guided walk flies the camera from exhibit to exhibit. The same nodes, edges and "allegation, not a finding" caveats as
// everywhere on /pantau. three.js loads only when the section is on screen; without WebGL only the intro text shows.
import { useEffect, useMemo, useRef, useState } from 'react';
import { EDGE_KINDS, neighbours, type EdgeKind, type GEdge, type GNode, type Match, type Source } from '../lib/relasi';
import { layout3d, type Layout3 } from '../lib/relasi-3d';
import { dayNumber, periodAt, periodsFor, walkStops, type Granularity, type JChapter, type Journey } from '../lib/relasi-journey';
import type { Kind } from '../lib/pantau-3d';
import type { RelasiScene } from '../lib/relasi-scene';

type Locale = 'id' | 'en';

const T = {
  id: {
    intro: 'Di sini Rahmat Wibowo bukan titik pusat, melainkan satu simpul di antara yang lain. Letak tiap simpul ditentukan oleh hubungannya: laporan polisi mendekat ke terlapornya, terlapor mendekat ke halaman situs yang menyebut namanya, akun Fomo mendekat ke thread-nya. Tekan "Mulai perjalanan" untuk menyusuri sejarahnya ruang demi ruang, atau geser garis waktu sendiri. Putar dengan menyeret, perbesar dengan menggulir, tekan sebuah titik untuk melihat hubungannya.',
    loading: 'Menyusun graf 3D…', noWebgl: 'Peramban ini tidak mendukung WebGL, jadi graf 3D tidak bisa dibuka. Semua data yang sama tersedia di bagian Gelar Perkara dan Fomo di bawah.',
    label: 'Graf hubungan 3D antara situs rahmatwibowo.net, terlapor, laporan polisi, dan Fomo, tanpa pusat tunggal',
    legend: 'Jenis hubungan (tekan untuk menampilkan atau menyembunyikan)', sources: 'Warna titik',
    edge: { 'in-fact': 'Konten tentang Pelapor (terdokumentasi)', 'in-allegation': 'Perbuatan yang diduga Pelapor (dugaan)', 'out-response': 'Tanggapan hukum Pelapor', against: 'Laporan pihak lain terhadap Pelapor', 'cross-fact': 'Kecocokan lintas sumber (fakta)', 'cross-inference': 'Kecocokan lintas sumber (dugaan)' } as Record<EdgeKind, string>,
    source: { rw: 'Pelapor', site: 'Situs rahmatwibowo.net', perkara: 'Terlapor (gelar perkara)', fomo: 'Fomo', laporan: 'Laporan polisi' } as Record<Source, string>,
    kind: { center: 'Pelapor', hub: 'sumber', cluster: 'kelompok', member: 'butir' } as Record<GNode['kind'], string>,
    ev: { site: 'Halaman situs', fomo: 'Postingan Fomo', act: 'Dugaan perbuatan', resp: 'Langkah hukum Pelapor', against: 'Laporan terhadap Pelapor' } as Record<Kind, string>,
    phase: { site: 'Halaman situs bertambah', fomo: 'Gelombang unggahan di Fomo', act: 'Dugaan perbuatan dicatat dalam berkas', resp: 'Langkah hukum Pelapor', against: 'Laporan terhadap Pelapor' } as Record<Kind, string>,
    panelEmpty: 'Tekan sebuah titik untuk melihat hubungannya.', links: 'Hubungan', items: (n: number) => `${n} butir`, weight: (n: number) => `bobot ${n}`,
    clear: 'Hapus pilihan', allegation: 'Dugaan Pelapor, bukan temuan polisi. Kecocokan menunjukkan nama atau organisasi yang sama muncul di dua sumber, bukan bahwa orangnya sama.',
    structure: 'Termasuk dalam kelompok', hint: 'Ukuran titik = jumlah hubungannya. Garis tipis abu-abu: keanggotaan kelompok.',
    full: 'Layar penuh', closeFull: 'Tutup (Esc)', title: 'Museum hubungan 3D', tour: 'Perjalanan', start: 'Mulai perjalanan', resume: 'Lanjutkan', pause: 'Jeda', prev: 'Sebelumnya', next: 'Berikutnya', home: 'Tampilkan semua', speed: 'Kecepatan',
    roomOf: (r: string, p: string) => `Ruang ${r} · ${p}`, exhibit: (i: number, n: number) => `Pameran ${i} dari ${n}`,
    scrub: 'Garis waktu', rooms: 'Ruang pamer', showing: 'Menampilkan sampai', everything: 'Semua sampai', walkHint: 'Tekan "Mulai perjalanan" atau geser garis waktu untuk melihat peta tumbuh dari September 2023.',
    explain: (c: JChapter, phase: string) => `${phase} adalah ciri ruang ini. Berkas mencatat ${c.counts.act} dugaan perbuatan, ${c.counts.resp} langkah hukum Pelapor (somasi, aduan, laporan polisi) dan ${c.counts.against} laporan pihak lain terhadap Pelapor. Di luar berkas, ${c.counts.fomo} postingan Fomo dan ${c.counts.site} halaman situs bertanggal pada periode ini. Di peta, ${c.newTerlapor} terlapor dan ${c.newAkun} akun Fomo muncul pertama kali.`,
    featured: 'Pameran unggulan periode ini', allEvents: (n: number) => `Semua ${n} peristiwa di ruang ini`, concerns: 'Terkait di peta', selectedNode: 'Titik terpilih',
    legendKinds: 'Jenis peristiwa',
    gran: 'Rincian', granOf: { room: 'Ruang', month: 'Bulan', day: 'Hari' } as Record<Granularity, string>,
    monthOf: (p: string) => `Bulan ${p}`, dayOf: (p: string) => `Hari ${p}`,
    explainShort: (c: JChapter) => `Tercatat ${c.counts.act} dugaan perbuatan, ${c.counts.resp} langkah hukum Pelapor, ${c.counts.against} laporan terhadap Pelapor, ${c.counts.fomo} postingan Fomo dan ${c.counts.site} halaman situs. Muncul pertama kali di peta: ${c.newTerlapor} terlapor dan ${c.newAkun} akun Fomo.`,
    noEvents: (d: string) => `Tidak ada peristiwa bertanggal pada ${d}. Pilih periode lain di rel atau gunakan Sebelumnya dan Berikutnya.`,
    monthDays: 'Hari bertanggal pada bulan ini', allDay: (n: number) => `Semua ${n} peristiwa`, 
  },
  en: {
    intro: 'Here Rahmat Wibowo is not the central point but one node among the others. Each node sits where its links put it: police reports sit close to their terlapor, terlapor close to the site pages that name them, Fomo accounts close to their threads. Press "Start the walk" to follow its history room by room, or drag the timeline yourself. Drag to rotate, scroll to zoom, press a point to see its links.',
    loading: 'Building the 3D graph…', noWebgl: 'This browser does not support WebGL, so the 3D graph cannot open. The same data is in the case-review and Fomo sections below.',
    label: '3D link graph between the rahmatwibowo.net site, the terlapor, police reports and Fomo, with no single centre',
    legend: 'Link types (press to show or hide)', sources: 'Point colours',
    edge: { 'in-fact': 'Content about the Pelapor (documented)', 'in-allegation': 'Act alleged by the Pelapor (allegation)', 'out-response': "The Pelapor's legal responses", against: 'Reports by others against the Pelapor', 'cross-fact': 'Cross-source match (fact)', 'cross-inference': 'Cross-source match (inference)' } as Record<EdgeKind, string>,
    source: { rw: 'Pelapor', site: 'The rahmatwibowo.net site', perkara: 'Terlapor (case review)', fomo: 'Fomo', laporan: 'Police reports' } as Record<Source, string>,
    kind: { center: 'Pelapor', hub: 'source', cluster: 'group', member: 'item' } as Record<GNode['kind'], string>,
    ev: { site: 'Site page', fomo: 'Fomo post', act: 'Alleged act', resp: "Pelapor's legal step", against: 'Report against the Pelapor' } as Record<Kind, string>,
    phase: { site: 'Site pages piling up', fomo: 'A wave of Fomo posts', act: 'Alleged acts logged in the file', resp: "The Pelapor's legal steps", against: 'Reports against the Pelapor' } as Record<Kind, string>,
    panelEmpty: 'Press a point to see its links.', links: 'Links', items: (n: number) => `${n} items`, weight: (n: number) => `weight ${n}`,
    clear: 'Clear selection', allegation: "The Pelapor's allegation, not a police finding. A match shows the same name or organisation appears in two sources, not that it is the same person.",
    structure: 'Belongs to group', hint: 'Point size = number of links. Thin grey line: group membership.',
    full: 'Fullscreen', closeFull: 'Close (Esc)', title: '3D relationship museum', tour: 'The walk', start: 'Start the walk', resume: 'Resume', pause: 'Pause', prev: 'Previous', next: 'Next', home: 'Show everything', speed: 'Speed',
    roomOf: (r: string, p: string) => `Room ${r} · ${p}`, exhibit: (i: number, n: number) => `Exhibit ${i} of ${n}`,
    scrub: 'Timeline', rooms: 'Rooms', showing: 'Showing up to', everything: 'Everything up to', walkHint: 'Press "Start the walk" or drag the timeline to watch the map grow from September 2023.',
    explain: (c: JChapter, phase: string) => `${phase} marks this room. The file logs ${c.counts.act} alleged acts, ${c.counts.resp} legal steps by the Pelapor (somasi, complaints, police reports) and ${c.counts.against} reports by others against the Pelapor. Outside the file, ${c.counts.fomo} Fomo posts and ${c.counts.site} dated site pages fall in this period. On the map, ${c.newTerlapor} terlapor and ${c.newAkun} Fomo accounts appear for the first time.`,
    featured: 'Featured exhibits of this period', allEvents: (n: number) => `All ${n} events in this room`, concerns: 'On the map', selectedNode: 'Selected point',
    legendKinds: 'Kinds of event',
    gran: 'Detail', granOf: { room: 'Rooms', month: 'Months', day: 'Days' } as Record<Granularity, string>,
    monthOf: (p: string) => `Month ${p}`, dayOf: (p: string) => `Day ${p}`,
    explainShort: (c: JChapter) => `Logged: ${c.counts.act} alleged acts, ${c.counts.resp} legal steps by the Pelapor, ${c.counts.against} reports against the Pelapor, ${c.counts.fomo} Fomo posts and ${c.counts.site} site pages. First appearing on the map: ${c.newTerlapor} terlapor and ${c.newAkun} Fomo accounts.`,
    noEvents: (d: string) => `No dated events on ${d}. Pick another period on the rail or use Previous and Next.`,
    monthDays: 'Days with events this month', allDay: (n: number) => `All ${n} events`,
  },
};
const EN_LABELS: Record<string, string> = {
  lainnya: 'other', 'perusahaan lain': 'other companies', 'tanpa lencana': 'no badge', 'akun terhapus': 'deleted accounts',
  thread: 'threads', 'oleh Pelapor': 'by the Pelapor', 'terhadap Pelapor': 'against the Pelapor', 'Laporan polisi': 'Police reports',
};
const HEX: Record<Source, string> = { rw: '#e3b341', site: '#3987e5', perkara: '#9085e9', fomo: '#d95926', laporan: '#c3c2b7' };
const KIND_HEX: Record<Kind, string> = { site: '#3987e5', fomo: '#d95926', act: '#9085e9', resp: '#199e70', against: '#c3c2b7' };
const EDGE_HEX: Record<EdgeKind, string> = { 'in-fact': '#d95926', 'in-allegation': '#f0a27c', 'out-response': '#3987e5', against: '#c9d1dc', 'cross-fact': '#199e70', 'cross-inference': '#6fd9b3', structure: '#475569' };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const iso = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export interface RelasiGraph3DProps { nodes: GNode[]; edges: GEdge[]; matches?: Match[]; targetsTotal?: number; locale?: Locale; journeySrc?: string }

export default function RelasiGraph3D({ nodes, edges, locale = 'id', journeySrc }: RelasiGraph3DProps) {
  const t = T[locale];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RelasiScene | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'nowebgl'>('idle');
  const [journey, setJourney] = useState<Journey | null>(null);
  const [jState, setJState] = useState<'loading' | 'done'>(journeySrc ? 'loading' : 'done');
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hidden, setHidden] = useState<Set<EdgeKind>>(new Set());
  const [full, setFull] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [stop, setStop] = useState(-1);
  const [day, setDay] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [gran, setGran] = useState<Granularity>('room');
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const label = (n: GNode) => (n.id === 'rw' ? 'Rahmat Wibowo' : locale === 'en' ? EN_LABELS[n.label] ?? n.label : n.label);
  const labelRef = useRef(label);
  labelRef.current = label;
  const journeyRef = useRef(journey);
  journeyRef.current = journey;
  const periods = useMemo(() => (journey ? periodsFor(journey, gran) : []), [journey, gran]);
  const walk = useMemo(() => (journey ? walkStops(journey, periods, gran) : []), [journey, periods, gran]);
  const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { ...o, timeZone: 'UTC' });
  const fmt = (d: string) => dtf({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${d}T00:00:00Z`));
  const fmtMonth = (d: string) => dtf({ month: 'short', year: 'numeric' }).format(new Date(`${d}T00:00:00Z`));

  // The museum data comes from its own JSON file; the graph waits for it so nodes can be dated when the scene is built.
  useEffect(() => {
    if (!journeySrc || !nodes.length) return;
    let live = true;
    fetch(journeySrc).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) { setJourney(j as Journey | null); setJState('done'); } }).catch(() => { if (live) setJState('done'); });
    return () => { live = false; };
  }, [journeySrc, nodes.length]);

  useEffect(() => {
    if (!nodes.length || !canvasRef.current || jState !== 'done') return;
    if (!webglOk()) { setState('nowebgl'); return; }
    let live = true;
    let scene: RelasiScene | null = null;
    let ro: ResizeObserver | null = null;
    setState('loading');
    // Layout is the slow part (a few hundred ms); give the browser a frame to paint the loading note first.
    const timer = setTimeout(() => {
      import('../lib/relasi-scene').then(({ createRelasiScene }) => {
        if (!live || !canvasRef.current) return;
        const layout: Layout3 = layout3d(nodes, edges);
        const nodeDay = journeyRef.current?.nodeDay ?? {};
        scene = createRelasiScene({
          canvas: canvasRef.current, nodes, layout, labelOf: (n) => labelRef.current(n),
          days: nodes.map((n) => (nodeDay[n.id] ? dayNumber(nodeDay[n.id]) : -Infinity)),
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          onHover: (id, x, y) => setHover((h) => (id ? { id, x, y } : h ? null : h)),
          onPick: (id) => { setSelected(id); setPlaying(false); },
        });
        sceneRef.current = scene;
        ro = new ResizeObserver(() => scene?.resize());
        ro.observe(canvasRef.current);
        setState('ready');
      }).catch(() => { if (live) setState('nowebgl'); });
    }, 30);
    return () => { live = false; clearTimeout(timer); ro?.disconnect(); scene?.dispose(); sceneRef.current = null; };
  }, [nodes, edges, jState]);

  useEffect(() => { sceneRef.current?.select(selected); }, [selected, state]);
  useEffect(() => { for (const k of EDGE_KINDS) sceneRef.current?.setKindVisible(k, !hidden.has(k)); }, [hidden, state]);
  useEffect(() => { sceneRef.current?.setTime(day === null ? null : dayNumber(day)); }, [day, state]);

  /** Select a node and fly to it; a manual pick pauses the walk. */
  const pick = (id: string) => { setPlaying(false); setSelected(id); sceneRef.current?.focus(id); };
  const goStop = (i: number) => {
    if (!journey || !walk.length) return;
    const n = ((i % walk.length) + walk.length) % walk.length;
    const e = journey.events[walk[n]];
    setStop(n);
    setDay(e.d);
    const id = e.nodes[0] ?? null;
    setSelected(id);
    if (id) sceneRef.current?.focus(id);
  };
  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    setPlaying(true);
    if (stop < 0 || stop >= walk.length - 1) goStop(0);
  };
  const resetView = () => { setPlaying(false); setStop(-1); setDay(null); setSelected(null); sceneRef.current?.focus(null); };
  useEffect(() => {
    if (!playing || !walk.length) return;
    const timer = setTimeout(() => { if (stop >= walk.length - 1) setPlaying(false); else goStop(stop + 1); }, 5200 / speed);
    return () => clearTimeout(timer);
    // goStop only reads journey, walk and the scene ref; stop, speed and playing are the triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, stop, speed, walk]);
  const jumpRoom = (c: JChapter) => {
    setPlaying(false);
    const k = walk.findIndex((w) => w >= c.first && w <= c.last);
    if (k >= 0) goStop(k); else { setStop(-1); setDay(c.to); }
  };
  const changeGran = (g: Granularity) => { setPlaying(false); setStop(-1); setGran(g); };
  const scrub = (n: number) => { setPlaying(false); setStop(-1); setDay(iso(n)); };

  useEffect(() => {
    document.documentElement.classList.toggle('rg3d-open', full);
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.documentElement.classList.remove('rg3d-open'); };
  }, [full]);
  useEffect(() => {
    if (!selected || full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected, full]);

  const sel = selected ? byId.get(selected) : null;
  const shown = useMemo(() => edges.filter((e) => !hidden.has(e.kind)), [edges, hidden]);
  const selLinks = useMemo(() => {
    if (!selected) return [];
    const real = neighbours(selected, shown.filter((e) => e.kind !== 'structure')).sort((a, b) => b.edge.weight - a.edge.weight);
    const parent = byId.get(selected)?.parent;
    const group = parent ? [{ other: parent, edge: null as GEdge | null, dir: 'out' as const }] : [];
    return [...group, ...real.map((r) => ({ other: r.other, edge: r.edge as GEdge | null, dir: r.dir }))].slice(0, 40);
  }, [selected, shown, byId]);
  const hovered = hover ? byId.get(hover.id) : null;
  const box = canvasRef.current?.getBoundingClientRect();

  // Museum state: the room the timeline is in, the exhibit being shown, and the date label.
  const ready = state === 'ready' && !!journey && walk.length > 0;
  const today = day ?? journey?.end ?? '';
  const room = journey ? periodAt(periods, today, gran) : null;
  // The rail shows every period, except in day mode where it shows the days with events in the current month.
  const rail = gran === 'day' ? periods.filter((c) => c.from.slice(0, 7) === today.slice(0, 7)) : periods;
  const exhibit = journey && stop >= 0 ? journey.events[walk[stop]] : null;
  const dominant: Kind = room ? (Object.entries(room.counts) as [Kind, number][]).sort((a, b) => b[1] - a[1])[0][0] : 'act';
  const startN = journey ? dayNumber(journey.start) : 0;
  const endN = journey ? dayNumber(journey.end) : 0;
  const roomTitle = room ? (gran === 'room' ? t.roomOf(ROMAN[room.id] ?? String(room.id + 1), `${fmtMonth(room.from)} – ${fmtMonth(room.to)}`) : gran === 'month' ? t.monthOf(fmtMonth(room.from)) : t.dayOf(fmt(room.from))) : '';
  const railLabel = (c: JChapter) => (gran === 'room' ? [ROMAN[c.id] ?? String(c.id + 1), fmtMonth(c.from)] : gran === 'month' ? [dtf({ month: 'short' }).format(new Date(`${c.from}T00:00:00Z`)), dtf({ year: '2-digit' }).format(new Date(`${c.from}T00:00:00Z`))] : [String(Number(c.from.slice(8, 10))), `${c.last - c.first + 1}×`]);
  const nodeBtn = (id: string) => { const o = byId.get(id); return o ? <button key={id} type="button" className="rg-linkbtn rg-linkbtn--strong" onClick={() => pick(id)}>{label(o)}</button> : null; };

  return (
    <div className={`rg3d${full ? ' rg3d--full' : ''}`} {...(full ? { role: 'dialog', 'aria-modal': true, 'aria-label': t.title } : {})}>
      <p className="muted rg3d__intro">{t.intro}</p>
      <div className="rg3d__bar">
        {full && <h3 className="rg3d__title">{t.title}</h3>}
        <div className="rg3d__tour" role="group" aria-label={t.tour}>
          <button type="button" className="viz-chip rg3d__play" aria-pressed={playing} disabled={!ready} onClick={togglePlay}>
            {playing ? `❚❚ ${t.pause}` : stop > 0 && stop < walk.length - 1 ? `▶ ${t.resume}` : `▶ ${t.start}`}
          </button>
          <button type="button" className="viz-chip" disabled={!ready} onClick={() => { setPlaying(false); goStop(stop < 0 ? walk.length - 1 : stop - 1); }}>{t.prev}</button>
          <button type="button" className="viz-chip" disabled={!ready} onClick={() => { setPlaying(false); goStop(stop + 1); }}>{t.next}</button>
          <button type="button" className="viz-chip" disabled={state !== 'ready'} onClick={resetView}>{t.home}</button>
          <span className="rg3d__speed" role="group" aria-label={t.speed}>
            {[0.5, 1, 2, 4].map((s) => <button key={s} type="button" className="viz-chip" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
          </span>
          {stop >= 0 && <span className="muted rg3d__step" aria-live="polite">{t.exhibit(stop + 1, walk.length)}</span>}
        </div>
        <button type="button" className="viz-chip rg3d__fs" aria-pressed={full} onClick={() => setFull((f) => !f)}>{full ? t.closeFull : t.full}</button>
      </div>
      <div className="rg3d__controls">
        <p className="rg-controls__label">{t.legend}</p>
        <ul className="rg-legend">
          {EDGE_KINDS.map((k) => (
            <li key={k}>
              <button type="button" className="viz-chip rg-chip" aria-pressed={!hidden.has(k)}
                onClick={() => setHidden((h) => { const x = new Set(h); if (x.has(k)) x.delete(k); else x.add(k); return x; })}>
                <span className="rg3d__swatch rg3d__swatch--line" style={{ background: EDGE_HEX[k] }} aria-hidden="true" />
                {t.edge[k]}
              </button>
            </li>
          ))}
        </ul>
        <p className="rg-controls__label">{t.sources}</p>
        <ul className="rg3d__sources">
          {(['rw', 'site', 'perkara', 'fomo', 'laporan'] as const).map((s) => (
            <li key={s}><span className="rg3d__swatch" style={{ background: HEX[s] }} aria-hidden="true" />{t.source[s]}</li>
          ))}
        </ul>
        <p className="muted rg3d__hint">{t.hint}</p>
      </div>

      <div className="rg3d__body">
        <div className="rg3d__main">
          <div className="rg3d__frame">
            <canvas ref={canvasRef} className="rg3d__canvas" role="img" aria-label={t.label} />
            {state !== 'ready' && <p className="rg3d__msg muted">{state === 'nowebgl' ? t.noWebgl : state === 'loading' || jState === 'loading' ? t.loading : ''}</p>}
            {hovered && hover && box && state === 'ready' && (
              <div className="rg3d__tip" style={{ left: hover.x - box.left + 12, top: hover.y - box.top + 12 }}>
                {label(hovered)} <span className="muted">· {t.source[hovered.source]}</span>
              </div>
            )}
          </div>
          {journey && (
            <div className="rg3d__time">
              <div className="rg3d__gran" role="group" aria-label={t.gran}>
                <span className="muted">{t.gran}</span>
                {(['room', 'month', 'day'] as Granularity[]).map((g) => (
                  <button key={g} type="button" className="viz-chip" aria-pressed={gran === g} disabled={state !== 'ready'} onClick={() => changeGran(g)}>{t.granOf[g]}</button>
                ))}
                {gran === 'day' && <span className="muted rg3d__gran-hint">{t.monthDays}: {fmtMonth(today)}</span>}
              </div>
              <ol className="rg3d__rooms" aria-label={t.rooms}>
                {rail.map((c) => (
                  <li key={c.id}>
                    <button type="button" className={`rg3d__room rg3d__room--${gran}`} aria-current={day !== null && room && c.id === room.id ? 'step' : undefined} disabled={state !== 'ready'}
                      title={`${fmt(c.from)} – ${fmt(c.to)}`} onClick={() => jumpRoom(c)}>
                      <span className="rg3d__room-n">{railLabel(c)[0]}</span>
                      <span className="rg3d__room-d">{railLabel(c)[1]}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <label className="rg3d__scrub">
                <span className="rg3d__scrub-l">{day === null ? t.everything : t.showing} <strong>{fmt(day ?? journey.end)}</strong></span>
                <input type="range" min={startN} max={endN} step={1} value={day ? dayNumber(day) : endN} disabled={state !== 'ready'} aria-label={t.scrub}
                  onChange={(e) => scrub(Number(e.target.value))} />
              </label>
            </div>
          )}
        </div>

        <aside className="rg-panel rg3d__panel" aria-live="polite">
          {journey && day !== null && !room ? (
            <p className="muted">{t.noEvents(fmt(day))}</p>
          ) : journey && room && day !== null ? (
            <section className="rg3d__placard">
              <p className="rg-panel__kind">{roomTitle}</p>
              <h4>{gran === 'room' ? t.phase[dominant] : `${t.ev[dominant]} · ${room.last - room.first + 1}`}</h4>
              <p>{gran === 'room' ? t.explain(room, t.phase[dominant]) : t.explainShort(room)}</p>
              <ul className="rg3d__chips" aria-label={t.legendKinds}>
                {(['act', 'resp', 'against', 'fomo', 'site'] as Kind[]).map((k) => (
                  <li key={k}><span className="rg3d__swatch" style={{ background: KIND_HEX[k] }} aria-hidden="true" />{t.ev[k]} <strong>{room.counts[k]}</strong></li>
                ))}
              </ul>
              {exhibit && (
                <article className="rg3d__exhibit" style={{ borderColor: KIND_HEX[exhibit.k] }}>
                  <p className="rg-panel__kind"><span className="rg3d__swatch" style={{ background: KIND_HEX[exhibit.k] }} aria-hidden="true" />{t.exhibit(stop + 1, walk.length)} · {fmt(exhibit.d)}</p>
                  <h5>{t.ev[exhibit.k]}: {exhibit.t}</h5>
                  {exhibit.x && <p className="rg3d__exhibit-x">{exhibit.x}</p>}
                  {exhibit.k === 'act' && <p className="muted rg3d__note">{t.allegation.split('.')[0]}.</p>}
                  {exhibit.nodes.length > 0 && <p className="rg3d__concerns"><span className="muted">{t.concerns}:</span> {exhibit.nodes.map(nodeBtn)}</p>}
                </article>
              )}
              <p className="rg-panel__h">{t.featured}</p>
              <ol className="rg3d__featured">
                {room.highlights.map((h) => {
                  const e = journey.events[h];
                  const k = walk.indexOf(h);
                  return (
                    <li key={h}>
                      <button type="button" className="rg-linkbtn" aria-current={k === stop ? 'true' : undefined} onClick={() => { setPlaying(false); goStop(k); }}>
                        <span className="rg3d__swatch" style={{ background: KIND_HEX[e.k] }} aria-hidden="true" />{fmt(e.d)} · {t.ev[e.k]}: {e.t}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <details className="rg3d__all" open={gran === 'day' || (gran === 'month' && room.last - room.first < 30)} key={`${gran}-${room.id}`}>
                <summary>{gran === 'room' ? t.allEvents(room.last - room.first + 1) : t.allDay(room.last - room.first + 1)}</summary>
                <ul>
                  {journey.events.slice(room.first, Math.min(room.last + 1, room.first + 200)).map((e, i) => (
                    <li key={room.first + i}><span className="muted">{fmt(e.d)}</span> <span className="rg3d__tag" style={{ color: KIND_HEX[e.k] }}>{t.ev[e.k]}</span> {e.t}{e.x ? ` — ${gran === 'day' ? e.x : `${e.x.slice(0, 140)}${e.x.length > 140 ? '…' : ''}`}` : ''}</li>
                  ))}
                </ul>
              </details>
            </section>
          ) : (
            <p className="muted">{journey ? t.walkHint : t.panelEmpty}</p>
          )}
          {sel && (
            <section className="rg3d__node">
              <p className="rg-panel__h">{t.selectedNode}</p>
              <p className="rg-panel__kind">{t.source[sel.source]} · {t.kind[sel.kind]}</p>
              <h4>{label(sel)}</h4>
              {sel.sub && sel.kind !== 'cluster' && <p className="muted rg-panel__sub">{sel.sub}</p>}
              <p className="muted">{t.items(sel.count)}</p>
              <button type="button" className="viz-chip" onClick={() => setSelected(null)}>{t.clear}</button>
              {selLinks.length > 0 && <>
                <p className="rg-panel__h">{t.links}</p>
                <ul className="rg-panel__list">
                  {selLinks.map((l) => {
                    const o = byId.get(l.other);
                    if (!o) return null;
                    return (
                      <li key={`${l.other}|${l.edge?.kind ?? 'member'}|${l.dir}`}>
                        <span className="rg3d__swatch rg3d__swatch--line" style={{ background: l.edge ? EDGE_HEX[l.edge.kind] : EDGE_HEX.structure }} aria-hidden="true" />
                        <span>
                          <button type="button" className="rg-linkbtn rg-linkbtn--strong" onClick={() => pick(l.other)}>{l.edge ? (l.dir === 'out' ? '→ ' : '← ') : ''}{label(o)}</button>{' '}
                          <span className="muted">{l.edge ? `${t.edge[l.edge.kind as Exclude<EdgeKind, 'structure'>] ?? ''} · ${t.weight(l.edge.weight)}` : t.structure}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>}
            </section>
          )}
          <p className="muted rg3d__note">{t.allegation}</p>
        </aside>
      </div>
    </div>
  );
}
