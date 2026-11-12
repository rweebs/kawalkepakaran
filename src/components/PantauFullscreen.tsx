// Fullscreen 3D mode for /pantau. A button on the page; pressing it opens a fullscreen stage where every dated item of the
// three sources sits around a gold spine (Rahmat Wibowo over time) and points at it, while his legal steps point out.
// three.js and the data (/pantau-data/stage3d.json) load only on open, so the normal page carries neither.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KINDS, countUpTo, type Kind, type StageItem } from '../lib/pantau-3d';
import type { StageScene } from '../lib/pantau-scene';

type Locale = 'id' | 'en';

const T = {
  id: {
    open: 'Layar penuh 3D', openHint: 'Semua 1.500+ item dari tiga sumber dalam satu ruang 3D, dengan garis waktu yang bisa diputar.',
    title: 'Pantau 3D: semuanya mengarah ke satu orang', close: 'Tutup (Esc)', loading: 'Memuat data dan adegan 3D…',
    noWebgl: 'Peramban ini tidak mendukung WebGL, jadi tampilan 3D tidak bisa dibuka. Semua data tetap ada di halaman biasa.',
    failed: 'Gagal memuat data 3D. Coba lagi.',
    kinds: { site: 'Situs rahmatwibowo.net', fomo: 'Postingan Fomo', act: 'Dugaan perbuatan (berkas)', resp: 'Somasi, aduan, laporan Pelapor', against: 'Laporan pihak lain terhadap Pelapor' } as Record<Kind, string>,
    kindShort: { site: 'situs', fomo: 'Fomo', act: 'dugaan', resp: 'tanggapan', against: 'terhadap Pelapor' } as Record<Kind, string>,
    upTo: 'Sampai', play: 'Putar sejarah', pause: 'Jeda', reset: 'Tampilkan semua', speed: 'Kecepatan',
    attacks: 'Konten & dugaan perbuatan yang mengarah ke Pelapor', responses: 'Langkah hukum Pelapor', against: 'Laporan terhadap Pelapor',
    legend: 'Tampilkan atau sembunyikan', detail: 'Rincian', pickHint: 'Tekan sebuah titik untuk melihat rinciannya. Seret untuk memutar, gulir untuk memperbesar.',
    latest: 'Terbaru sampai tanggal ini', group: 'Kelompok', open3: 'Buka di sumber', allegation: 'Dugaan Pelapor, bukan temuan polisi.',
    help: 'Tulang emas di tengah adalah Rahmat Wibowo dari waktu ke waktu (2023 di bawah, 2026 di atas). Tiap titik berada pada tinggi tanggalnya dan bergaris ke arahnya; garis hijau adalah langkah hukumnya, mengarah keluar.',
  },
  en: {
    open: 'Fullscreen 3D', openHint: 'All 1,500+ items from the three sources in one 3D space, with a playable timeline.',
    title: 'Monitor 3D: everything points at one person', close: 'Close (Esc)', loading: 'Loading data and 3D scene…',
    noWebgl: 'This browser does not support WebGL, so the 3D view cannot open. All data stays available on the normal page.',
    failed: 'Could not load the 3D data. Try again.',
    kinds: { site: 'rahmatwibowo.net site', fomo: 'Fomo posts', act: 'Alleged acts (case file)', resp: "Pelapor's somasi, complaints, reports", against: 'Reports by others against the Pelapor' } as Record<Kind, string>,
    kindShort: { site: 'site', fomo: 'Fomo', act: 'alleged', resp: 'response', against: 'against Pelapor' } as Record<Kind, string>,
    upTo: 'Up to', play: 'Play history', pause: 'Pause', reset: 'Show all', speed: 'Speed',
    attacks: 'Content and alleged acts aimed at the Pelapor', responses: "Pelapor's legal steps", against: 'Reports against the Pelapor',
    legend: 'Show or hide', detail: 'Detail', pickHint: 'Press a point to see its detail. Drag to rotate, scroll to zoom.',
    latest: 'Latest up to this date', group: 'Group', open3: 'Open at source', allegation: "The Pelapor's allegation, not a police finding.",
    help: 'The gold spine in the middle is Rahmat Wibowo over time (2023 at the bottom, 2026 at the top). Each point sits at the height of its date and draws a line to him; green lines are his legal steps, pointing out.',
  },
};

const fmtDay = (d: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const fmtN = (n: number, locale: Locale) => new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US').format(n);

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function PantauFullscreen({ locale = 'id', src = '/pantau-data/stage3d.json' }: { locale?: Locale; src?: string }) {
  const t = T[locale];
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StageItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dayIdx, setDayIdx] = useState(Number.MAX_SAFE_INTEGER);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hidden, setHidden] = useState<Set<Kind>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const stage = useRef<StageScene | null>(null);

  const days = useMemo(() => (items ? [...new Set(items.map((i) => i.d))] : []), [items]);
  const cur = Math.min(dayIdx, Math.max(0, days.length - 1));
  const day = days[cur] ?? '';
  const shownCount = useMemo(() => (items && day ? countUpTo(items, day) : 0), [items, day]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
    if (items) for (let n = 0; n < shownCount; n++) c[items[n].k] += 1;
    return c;
  }, [items, shownCount]);
  const latest = useMemo(() => {
    if (!items) return [];
    const out: number[] = [];
    for (let n = shownCount - 1; n >= 0 && out.length < 8; n--) if (!hidden.has(items[n].k)) out.push(n);
    return out;
  }, [items, shownCount, hidden]);

  const close = useCallback(() => {
    setPlaying(false);
    setOpen(false);
    setHover(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    opener.current?.focus();
  }, []);

  const start = async () => {
    setError(null);
    setOpen(true);
    if (!webglOk()) { setError(t.noWebgl); return; }
    // The overlay mounts on this render; ask for browser fullscreen on the next frame (iOS Safari: stays a fixed overlay).
    requestAnimationFrame(() => overlay.current?.requestFullscreen?.().catch(() => {}));
    if (items) return;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { items: StageItem[] };
      setItems(json.items);
    } catch {
      setError(t.failed);
    }
  };

  // Build the scene once the overlay, its canvas and the data are all there; tear it down on close.
  useEffect(() => {
    if (!open || !items || !canvas.current) return;
    let cancelled = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    import('../lib/pantau-scene').then(({ createScene }) => {
      if (cancelled || !canvas.current) return;
      stage.current = createScene({
        canvas: canvas.current, items, reducedMotion: reduced,
        onHover: (i, x, y) => setHover(i === null ? null : { i, x, y }),
        onPick: (i) => setSelected(i),
      });
      stage.current.setDay(days[cur]);
    }).catch(() => setError(t.failed));
    const onResize = () => stage.current?.resize();
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onResize);
    closeBtn.current?.focus();
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onResize);
      stage.current?.dispose();
      stage.current = null;
    };
  }, [open, items]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (day) stage.current?.setDay(day); }, [day]);
  useEffect(() => { for (const k of KINDS) stage.current?.setVisible(k, !hidden.has(k)); }, [hidden]);
  useEffect(() => { stage.current?.select(selected); }, [selected]);

  // Escape closes; leaving browser fullscreen (its own Esc) closes too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    let wasFull = false;
    const onFs = () => { if (document.fullscreenElement) wasFull = true; else if (wasFull) close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    document.documentElement.classList.add('stage3d-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
      document.documentElement.classList.remove('stage3d-open');
    };
  }, [open, close]);

  // Play: step through the days at a steady pace (about 25 s for the whole history at 1×).
  useEffect(() => {
    if (!playing || !days.length) return;
    const step = Math.max(1, Math.round(days.length / 250));
    const id = window.setInterval(() => {
      setDayIdx((i) => {
        const next = Math.min(days.length - 1, Math.min(i, days.length - 1) + step);
        if (next >= days.length - 1) setPlaying(false);
        return next;
      });
    }, 100 / speed);
    return () => window.clearInterval(id);
  }, [playing, days, speed]);

  // The hover tooltip follows the pointer; positioned through the DOM, not a style attribute in markup.
  useEffect(() => {
    const el = tip.current;
    if (!el || !hover) return;
    el.style.transform = `translate(${Math.min(hover.x + 14, window.innerWidth - 300)}px, ${Math.max(8, hover.y - 10)}px)`;
  }, [hover]);

  const toggle = (k: Kind) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const sel = selected !== null && items ? items[selected] : null;
  const attacks = counts.site + counts.fomo + counts.act;

  return (
    <>
      <button ref={opener} type="button" className="btn stage3d__open" onClick={start} aria-haspopup="dialog">
        <span aria-hidden="true">⛶</span> {t.open}
      </button>
      <p className="muted stage3d__hint">{t.openHint}</p>
      {open && (
        <div ref={overlay} className="stage3d" role="dialog" aria-modal="true" aria-labelledby="stage3d-title">
          <canvas ref={canvas} className="stage3d__canvas" aria-label={t.help} />
          <header className="stage3d__bar">
            <h2 id="stage3d-title">{t.title}</h2>
            {day && <p className="stage3d__date">{t.upTo} <strong>{fmtDay(day, locale)}</strong></p>}
            <button ref={closeBtn} type="button" className="btn stage3d__close" onClick={close}>{t.close}</button>
          </header>

          {error && <p className="stage3d__msg" role="alert">{error}</p>}
          {!error && !items && <p className="stage3d__msg" role="status">{t.loading}</p>}

          {items && !error && (
            <>
              <aside className="stage3d__panel stage3d__panel--left" aria-label={t.legend}>
                <div className="stage3d__totals">
                  <p><strong>{fmtN(attacks, locale)}</strong> {t.attacks}</p>
                  <p><strong>{fmtN(counts.resp, locale)}</strong> {t.responses}</p>
                  <p><strong>{fmtN(counts.against, locale)}</strong> {t.against}</p>
                </div>
                <ul className="stage3d__legend">
                  {KINDS.map((k) => (
                    <li key={k}>
                      <button type="button" className="stage3d__kind" aria-pressed={!hidden.has(k)} onClick={() => toggle(k)}>
                        <span className={`stage3d__dot stage3d__dot--${k}`} aria-hidden="true" />
                        <span>{t.kinds[k]}</span>
                        <span className="stage3d__count">{fmtN(counts[k], locale)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="stage3d__help">{t.help}</p>
              </aside>

              <aside className="stage3d__panel stage3d__panel--right" aria-live="polite" aria-label={t.detail}>
                {sel ? (
                  <article className="stage3d__detail">
                    <p className="stage3d__meta"><span className={`stage3d__dot stage3d__dot--${sel.k}`} aria-hidden="true" />{t.kindShort[sel.k]} · {fmtDay(sel.d, locale)}</p>
                    <h3>{sel.t}</h3>
                    <p className="stage3d__meta">{t.group}: {sel.g}</p>
                    {sel.k === 'act' && <p className="stage3d__warn">{t.allegation}</p>}
                    <blockquote>{sel.x}</blockquote>
                    {sel.href && <a href={sel.href} rel="nofollow ugc noopener noreferrer" target="_blank">{t.open3}</a>}
                  </article>
                ) : <p className="stage3d__meta">{t.pickHint}</p>}
                <h3 className="stage3d__sub">{t.latest}</h3>
                <ol className="stage3d__latest">
                  {latest.map((n) => (
                    <li key={n}>
                      <button type="button" onClick={() => setSelected(n)} aria-pressed={selected === n}>
                        <span className={`stage3d__dot stage3d__dot--${items[n].k}`} aria-hidden="true" />
                        <span className="stage3d__lt">{items[n].t}</span>
                        <span className="stage3d__ld">{fmtDay(items[n].d, locale)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </aside>

              <footer className="stage3d__time">
                <button type="button" className="btn" onClick={() => { if (!playing && cur >= days.length - 1) setDayIdx(0); setPlaying((p) => !p); }}>
                  {playing ? t.pause : t.play}
                </button>
                <label className="stage3d__slider">
                  <span className="sr-only">{t.upTo}</span>
                  <input type="range" min={0} max={days.length - 1} value={cur}
                    aria-valuetext={day ? fmtDay(day, locale) : ''} onChange={(e) => { setPlaying(false); setDayIdx(Number(e.target.value)); }} />
                </label>
                <label className="stage3d__speed">{t.speed}
                  <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                    {[0.5, 1, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}
                  </select>
                </label>
                <button type="button" className="btn" onClick={() => { setPlaying(false); setDayIdx(days.length - 1); }}>{t.reset}</button>
              </footer>

              {hover && items[hover.i] && (
                <div ref={tip} className="stage3d__tip" role="tooltip">
                  <strong>{items[hover.i].t}</strong>
                  <span>{t.kindShort[items[hover.i].k]} · {fmtDay(items[hover.i].d, locale)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
