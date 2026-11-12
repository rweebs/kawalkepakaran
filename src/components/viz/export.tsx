// "Save as SVG / PNG" for a chart card: the chart is cloned with its computed colors inlined (the file has no
// stylesheet), framed with the card title and a source line, and downloaded. PNG goes through an <img> of the SVG data
// URL drawn on a canvas; the site's CSP allows data: images, and nothing leaves the browser.
import { useEffect, useRef, useState } from 'react';

type Locale = 'id' | 'en';
const L = {
  id: { svg: 'Unduh grafik sebagai SVG', png: 'Unduh grafik sebagai PNG', source: 'Sumber' },
  en: { svg: 'Download chart as SVG', png: 'Download chart as PNG', source: 'Source' },
} as const;

const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'opacity', 'font-size', 'font-family', 'font-weight', 'display'] as const;
const NS = 'http://www.w3.org/2000/svg';

/** Copies the computed paint and font of every element of `src` onto the matching element of `dst` (same tree). */
export function inlineStyles(src: Element, dst: Element): void {
  const cs = getComputedStyle(src);
  for (const p of PROPS) {
    const v = cs.getPropertyValue(p);
    if (v) dst.setAttribute(p, v);
  }
  const a = src.children;
  const b = dst.children;
  for (let i = 0; i < a.length && i < b.length; i++) inlineStyles(a[i], b[i]);
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'grafik';

/** A standalone SVG string of the chart in `figure`: title on top, source line below, page background behind. */
export function chartSvg(figure: Element, title: string, source: string): { svg: string; width: number; height: number } | null {
  const svg = figure.querySelector('.viz-frame svg') as SVGSVGElement | null;
  if (!svg) return null;
  const box = svg.getBoundingClientRect();
  const w = Math.round(box.width);
  const h = Math.round(box.height);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.querySelectorAll('.viz-tip, .viz-hit, .viz-focus, .viz-texture[display="none"]').forEach((n) => n.remove());
  clone.setAttribute('x', '0');
  clone.setAttribute('y', '40');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const bg = getComputedStyle(document.body).backgroundColor || '#0b1020';
  const ink = getComputedStyle(document.body).color || '#f1f5f9';
  const out = document.createElementNS(NS, 'svg');
  const H = h + 72;
  out.setAttribute('xmlns', NS);
  out.setAttribute('width', String(w));
  out.setAttribute('height', String(H));
  out.setAttribute('viewBox', `0 0 ${w} ${H}`);
  const rect = document.createElementNS(NS, 'rect');
  rect.setAttribute('width', '100%');
  rect.setAttribute('height', '100%');
  rect.setAttribute('fill', bg);
  const head = document.createElementNS(NS, 'text');
  head.setAttribute('x', '0');
  head.setAttribute('y', '24');
  head.setAttribute('fill', ink);
  head.setAttribute('font-family', font);
  head.setAttribute('font-size', '16');
  head.setAttribute('font-weight', '700');
  head.textContent = title;
  const foot = document.createElementNS(NS, 'text');
  foot.setAttribute('x', '0');
  foot.setAttribute('y', String(H - 12));
  foot.setAttribute('fill', ink);
  foot.setAttribute('fill-opacity', '0.7');
  foot.setAttribute('font-family', font);
  foot.setAttribute('font-size', '11');
  foot.textContent = source;
  out.append(rect, head, clone, foot);
  return { svg: new XMLSerializer().serializeToString(out), width: w, height: H };
}

function save(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

export function ChartExport({ title, source, locale: forced }: { title: string; source?: string; locale?: Locale }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [locale, setLocale] = useState<Locale>(forced ?? 'id');
  useEffect(() => { if (!forced && document.documentElement.lang.startsWith('en')) setLocale('en'); }, [forced]);
  const t = L[locale];
  const build = () => {
    const fig = ref.current?.closest('figure');
    if (!fig) return null;
    const day = new Date().toISOString().slice(0, 10);
    const src = `${t.source}: ${source ?? `${location.host}${location.pathname}`} · ${day}`;
    return chartSvg(fig, title, src);
  };
  const asSvg = () => {
    const c = build();
    if (c) save(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.svg)}`, `${slug(title)}.svg`);
  };
  const asPng = () => {
    const c = build();
    if (!c) return;
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = c.width * scale;
      canvas.height = c.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      save(canvas.toDataURL('image/png'), `${slug(title)}.png`);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.svg)}`;
  };
  return (
    <span ref={ref} className="viz-export">
      <button type="button" className="viz-export__btn" aria-label={t.svg} title={t.svg} onClick={asSvg}>SVG</button>
      <button type="button" className="viz-export__btn" aria-label={t.png} title={t.png} onClick={asPng}>PNG</button>
    </span>
  );
}
