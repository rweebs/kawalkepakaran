// The insight strip of the /pantau dashboard: one headline answer, then a list of findings, each labelled as a fact
// (a count read from the sitemap) or an inference (a reading of those counts that the sitemap alone cannot prove).
// Recomputes from the filtered rows; sequence gaps use all rows so a text filter never invents a gap.
import { useMemo } from 'react';
import type { Row } from '../lib/sitemap-watch';
import {
  velocity, cadence, sequenceGaps, offsetBreakdown, eventWindows, eventSummary, risingTerms, bulkResets, nameInSlugs, slugWeekdays, slugWaves, sectionVelocity, type WatchEvent,
} from '../lib/sitemap-insights';

type Locale = 'id' | 'en';
type Kind = 'fact' | 'inference';

const fmtN = (n: number, l: Locale) => new Intl.NumberFormat(l === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: 1 }).format(n);
const fmtDay = (d: string, l: Locale) =>
  new Intl.DateTimeFormat(l === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const pad = (n: number) => String(n).padStart(3, '0');

const T = {
  id: {
    title: 'Temuan', kind: { fact: 'Fakta', inference: 'Dugaan' },
    none: 'Belum cukup data untuk temuan pada saringan ini.',
    headline: (from: string, to: string, n: number, wk: string, pct: number | null, prior: number) =>
      `${from} – ${to}: situs ini menambah ${n} item tentang Rahmat Wibowo menurut tanggal di slug (${wk}/minggu)${pct === null ? '; belum ada pembanding 30 hari sebelumnya.' : `, ${pct >= 0 ? 'naik' : 'turun'} ${Math.abs(pct)}% dibanding 30 hari sebelumnya (${prior}).`}`,
    headlineNone: 'Tidak ada item bertanggal dalam 60 hari terakhir untuk saringan ini.',
    cadence: (d: string, n: number, s: number, a: string, b: string, act: number) =>
      `Hari tersibuk: ${d} (${n} item). Rangkaian terpanjang: ${s} hari berturut-turut (${a} – ${b}). Ada item pada ${act} hari berbeda.`,
    gaps: (m: number, s: number, d: number) => `${m} nomor urut tidak ada di sitemap, tersebar di ${d} dari ${s} seri bernomor (mis. ev-20260616-001, -002, …).`,
    gapTop: (p: string, d: string, miss: string, max: number) => `${p} ${d}: hilang ${miss} dari ${max}`,
    gapsWhy: 'Nomor yang hilang bisa berarti item dihapus, belum diterbitkan, atau sengaja tidak dimasukkan ke sitemap. Sitemap saja tidak bisa membedakannya.',
    offsets: (list: string) => `Cap waktu lastmod memakai zona waktu: ${list}.`,
    offsetsWhy: 'Lebih dari satu zona waktu bisa berarti situs dibangun dari lebih dari satu lingkungan atau pengaturan. Ini tidak menunjukkan siapa yang melakukannya.',
    events: (n: number, up: number, down: number) => `Dari ${n} peristiwa linimasa kasus yang punya item bertanggal dalam ±7 hari, ${up} diikuti lebih banyak item dan ${down} lebih sedikit.`,
    eventRow: (before: number, after: number) => `7 hari sebelum: ${before} → 7 hari sesudah: ${after}`,
    eventsWhy: 'Urutan waktu, bukan sebab: item bisa bertambah karena alasan lain, dan tanggal di slug ditulis sendiri oleh pengelola situs.',
    terms: 'Kata di slug yang naik dalam 30 hari terakhir (jumlah item: 30 hari terakhir / sebelumnya):',
    resets: (list: string) => `lastmod disetel ulang massal pada ${list}. Pada hari itu lastmod tidak mencerminkan kapan halaman benar-benar diubah.`,
    resetItem: (d: string, n: number, p: number) => `${d} (${n} URL, ${p}%)`,
    name: (n: number, tot: number, s: number, e: number, et: number) => `${n} dari ${tot} URL (${s}%) memuat nama "rahmat-wibowo" di slug, termasuk ${e} dari ${et} halaman evidence. Situs ini menyasar Rahmat Wibowo secara langsung dengan namanya.`,
    weekday: (day: string, n: number, s: number) => `Hari paling sering pada tanggal slug: ${day} (${n} item, ${s}%).`,
    waves: (n: number) => `Item datang dalam ${n} gelombang (jeda lebih dari 21 hari memisahkan gelombang):`,
    waveRow: (a: string, b: string, n: number, pd: string, pn: number) => `${a} – ${b}: ${n} item, puncak ${pd} (${pn})`,
    sections: 'Kecepatan per bagian, 30 hari terakhir (item per minggu):',
    days: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
  },
  en: {
    title: 'Insights', kind: { fact: 'Fact', inference: 'Inference' },
    none: 'Not enough data for insights under this filter.',
    headline: (from: string, to: string, n: number, wk: string, pct: number | null, prior: number) =>
      `${from} – ${to}: the site added ${n} items about Rahmat Wibowo by slug date (${wk}/week)${pct === null ? '; no prior 30 days to compare.' : `, ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct)}% on the previous 30 days (${prior}).`}`,
    headlineNone: 'No dated items in the last 60 days for this filter.',
    cadence: (d: string, n: number, s: number, a: string, b: string, act: number) =>
      `Busiest day: ${d} (${n} items). Longest run: ${s} consecutive days (${a} – ${b}). Items fall on ${act} different days.`,
    gaps: (m: number, s: number, d: number) => `${m} sequence numbers are missing from the sitemap, across ${d} of ${s} numbered series (e.g. ev-20260616-001, -002, …).`,
    gapTop: (p: string, d: string, miss: string, max: number) => `${p} ${d}: missing ${miss} of ${max}`,
    gapsWhy: 'A missing number may mean an item was deleted, not yet published, or left out of the sitemap on purpose. The sitemap alone cannot tell which.',
    offsets: (list: string) => `lastmod stamps use these time zones: ${list}.`,
    offsetsWhy: 'More than one time zone may mean the site is built from more than one environment or setting. It does not show who did it.',
    events: (n: number, up: number, down: number) => `Of ${n} case-timeline events with dated items within ±7 days, ${up} were followed by more items and ${down} by fewer.`,
    eventRow: (before: number, after: number) => `7 days before: ${before} → 7 days after: ${after}`,
    eventsWhy: "Order in time, not cause: items can rise for other reasons, and slug dates are written by the site's operator.",
    terms: 'Slug words rising in the last 30 days (items: last 30 days / before):',
    resets: (list: string) => `lastmod was reset in bulk on ${list}. On those days lastmod does not reflect when pages were really changed.`,
    resetItem: (d: string, n: number, p: number) => `${d} (${n} URLs, ${p}%)`,
    name: (n: number, tot: number, s: number, e: number, et: number) => `${n} of ${tot} URLs (${s}%) carry the name "rahmat-wibowo" in their slug, including ${e} of ${et} evidence pages. The site targets Rahmat Wibowo directly, by name.`,
    weekday: (day: string, n: number, s: number) => `Most common weekday of slug dates: ${day} (${n} items, ${s}%).`,
    waves: (n: number) => `Items came in ${n} waves (a gap of more than 21 days separates waves):`,
    waveRow: (a: string, b: string, n: number, pd: string, pn: number) => `${a} – ${b}: ${n} items, peak ${pd} (${pn})`,
    sections: 'Speed per section, last 30 days (items per week):',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  },
} as const;

/** "3, 4, 7–9" from [3, 4, 7, 8, 9], capped so a long list stays one line. */
export function compactRanges(nums: readonly number[], cap = 6): string {
  const parts: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(j - i >= 2 ? `${pad(nums[i])}–${pad(nums[j])}` : j > i ? `${pad(nums[i])}, ${pad(nums[j])}` : pad(nums[i]));
    i = j;
  }
  return parts.length > cap ? `${parts.slice(0, cap).join(', ')}, …` : parts.join(', ');
}

interface Item { id: string; kind: Kind; text: string; detail?: React.ReactNode }

export interface InsightsProps {
  rows: Row[];
  shown: Row[];
  latest: string;
  locale: Locale;
  events?: readonly WatchEvent[];
  offsets?: readonly (string | null)[];
}

export default function SitemapInsights({ rows, shown, latest, locale, events = [], offsets }: InsightsProps) {
  const t = T[locale];
  const d = (x: string) => fmtDay(x, locale);
  const data = useMemo(() => {
    const visible = new Set(shown.map((r) => r.path));
    const offsetList = offsets ? rows.map((r, i) => (visible.has(r.path) ? offsets[i] ?? null : null)) : null;
    return {
      v: velocity(shown, latest),
      c: cadence(shown),
      g: sequenceGaps(rows, shown),
      o: offsetList ? offsetBreakdown(offsetList) : [],
      e: eventSummary(eventWindows(shown, events)),
      terms: risingTerms(shown, latest),
      resets: bulkResets(shown),
      name: nameInSlugs(shown),
      wd: slugWeekdays(shown),
      ws: slugWaves(shown),
      sv: sectionVelocity(shown, latest),
    };
  }, [rows, shown, latest, events, offsets]);

  const items: Item[] = [];
  const { v, c, g, o, e, terms, resets, name, wd, ws, sv } = data;
  if (name && name.n > 0) items.push({ id: 'name', kind: 'fact', text: t.name(name.n, name.total, name.share, name.evidence, name.evidenceTotal) });
  if (ws.length) {
    items.push({
      id: 'waves', kind: 'fact', text: t.waves(ws.length),
      detail: <ul className="viz-ins__sub">{ws.map((w) => <li key={w.from}>{t.waveRow(d(w.from), d(w.to), w.count, d(w.peak.date), w.peak.count)}</li>)}</ul>,
    });
  }
  if (sv.length) {
    items.push({
      id: 'sections', kind: 'fact', text: t.sections,
      detail: <ul className="viz-ins__terms">{sv.map((x) => <li key={x.group}><span>{x.group === 'other' ? 'lainnya' : `${x.group}/`}</span> {fmtN(x.perWeek, locale)}</li>)}</ul>,
    });
  }
  const wdTotal = wd.reduce((a, b) => a + b, 0);
  if (wdTotal >= 14) {
    const top = wd.indexOf(Math.max(...wd));
    items.push({ id: 'weekday', kind: 'fact', text: t.weekday(t.days[top], wd[top], Math.round((wd[top] / wdTotal) * 100)) });
  }
  if (c) items.push({ id: 'cadence', kind: 'fact', text: t.cadence(d(c.busiest.date), c.busiest.count, c.streak.days, d(c.streak.from), d(c.streak.to), c.activeDays) });
  if (g && g.totalMissing > 0) {
    items.push({
      id: 'gaps', kind: 'fact', text: t.gaps(g.totalMissing, g.series, g.datesWithGaps),
      detail: <ul className="viz-ins__sub">{g.gaps.slice(0, 3).map((x) => <li key={`${x.prefix}${x.date}`}>{t.gapTop(x.prefix, d(x.date), compactRanges(x.missing), x.max)}</li>)}</ul>,
    });
    items.push({ id: 'gaps-why', kind: 'inference', text: t.gapsWhy });
  }
  if (resets.length) items.push({ id: 'resets', kind: 'fact', text: t.resets(resets.map((r) => t.resetItem(d(r.date), r.count, r.share)).join('; ')) });
  if (terms.length) {
    items.push({
      id: 'terms', kind: 'fact', text: t.terms,
      detail: <ul className="viz-ins__terms">{terms.map((x) => <li key={x.term}><span>{x.term}</span> {x.recent} / {x.earlier}</li>)}</ul>,
    });
  }
  if (e) {
    items.push({
      id: 'events', kind: 'inference', text: `${t.events(e.events, e.rose, e.fell)} ${t.eventsWhy}`,
      detail: (
        <ul className="viz-ins__sub">{e.top.map((w) => (
          <li key={`${w.event.date}${w.event.title}`}>
            <span className="viz-ins__mark" aria-hidden="true">◆</span>
            {w.event.href ? <a href={w.event.href}>{w.event.title}</a> : w.event.title} ({d(w.event.date)}): {t.eventRow(w.before, w.after)}
          </li>
        ))}</ul>
      ),
    });
  }
  if (o.length) {
    items.push({ id: 'offsets', kind: 'fact', text: t.offsets(o.map((x) => `UTC${x.offset} (${fmtN(x.count, locale)})`).join(', ')) });
    if (o.length > 1) items.push({ id: 'offsets-why', kind: 'inference', text: t.offsetsWhy });
  }

  return (
    <section className="viz-ins" aria-labelledby="viz-ins-h">
      <h3 id="viz-ins-h" className="viz-ins__title">{t.title}</h3>
      <p className="viz-ins__headline" aria-live="polite">
        {v ? t.headline(d(v.from), d(v.to), v.current, fmtN(v.perWeek, locale), v.changePct, v.prior) : t.headlineNone}
      </p>
      {items.length === 0 ? <p className="muted">{t.none}</p> : (
        <ul className="viz-ins__list">
          {items.map((it) => (
            <li key={it.id} className={`viz-ins__item viz-ins__item--${it.kind}`}>
              <span className={`viz-ins__kind viz-ins__kind--${it.kind}`}>{t.kind[it.kind]}</span>
              <div><p>{it.text}</p>{it.detail}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
