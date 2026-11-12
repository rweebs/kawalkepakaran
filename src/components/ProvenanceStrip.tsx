// Chain of custody for one /pantau section, as four steps: where the data came from, when it was captured or prepared,
// the SHA-256 of what this page publishes, and where a copy is kept. Doubles as the section's citation footer
// ("data as of …, generated …, hash …"). Build-time only.
import { fmtDay, type Locale } from './InsightPanel';

export interface Provenance {
  source: string;
  sourceHref?: string;
  captured: string | null;
  capturedLabel?: string;
  sha256: string | null;
  hashOf: string;
  archive: string;
  generated: string;
}

const T = {
  id: { label: 'Rantai asal-usul data', steps: ['Sumber', 'Diambil / disusun', 'SHA-256', 'Salinan disimpan'], gen: 'Halaman dibangun', cite: 'Kutip sebagai', none: 'belum ada', of: 'dari' },
  en: { label: 'Data chain of custody', steps: ['Source', 'Captured / prepared', 'SHA-256', 'Copy kept'], gen: 'Page built', cite: 'Cite as', none: 'not yet', of: 'of' },
};

export default function ProvenanceStrip({ p, title, locale = 'id' }: { p: Provenance; title: string; locale?: Locale }) {
  const t = T[locale];
  const day = (d: string | null) => (d ? fmtDay(d.slice(0, 10), locale) : t.none);
  return (
    <aside className="pv" aria-label={`${t.label}: ${title}`}>
      <p className="pv-label">{t.label}</p>
      <ol className="pv-steps">
        <li><span className="pv-k">{t.steps[0]}</span><span className="pv-v">{p.sourceHref ? <a href={p.sourceHref} rel="nofollow ugc noopener noreferrer">{p.source}</a> : p.source}</span></li>
        <li><span className="pv-k">{p.capturedLabel ?? t.steps[1]}</span><span className="pv-v">{day(p.captured)}</span></li>
        <li><span className="pv-k">{t.steps[2]} <span className="muted">{t.of} {p.hashOf}</span></span><span className="pv-v"><code title={p.sha256 ?? ''}>{p.sha256 ? `${p.sha256.slice(0, 16)}…` : t.none}</code></span></li>
        <li><span className="pv-k">{t.steps[3]}</span><span className="pv-v pk-mono">{p.archive}</span></li>
      </ol>
      <p className="pv-cite muted">{t.cite}: “{title}”, kawalkepakaran.org/pantau, {t.steps[1].toLowerCase()} {day(p.captured)}; {t.gen.toLowerCase()} {day(p.generated)}; SHA-256 {p.sha256 ?? t.none}.</p>
    </aside>
  );
}
