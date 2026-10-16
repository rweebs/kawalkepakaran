import { localizedPath, type Locale } from '../i18n';
import type { Verdict } from './schemas';
import { verdictLabel } from './verdict';

// The embeddable verdict badge: a small static SVG per hand-made claim (/klaim/<id>/badge.svg, /en/claims/<id>/badge.svg),
// rendered at build time. It carries only the site name and the recorded verdict label, nothing else about the claim.

/** Mirrors the --verdict-* colours in src/styles/global.css (tests/badge.test.ts keeps them in sync). */
export const VERDICT_COLOR: Record<Verdict, string> = {
  'dikonfirmasi': '#6ee7a0',
  'sebagian': '#fcd34d',
  'tidak-terbukti': '#fda4af',
  'belum-terverifikasi': '#a5c8ff',
};

const SITE_NAME = 'Kawal Kepakaran';
const INK = '#0a0e1a';
const PAPER = '#f1f5f9';
export const BADGE_HEIGHT = 20;
const FONT = 11;
const PAD = 7;
const GLYPH = 12;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Approximate advance width of a string in Verdana-like 11px text. textLength pins the rendered width to this. */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    if (/[iljtfrI.,:;'!|]/.test(ch)) w += 3.6;
    else if (ch === ' ') w += 3.9;
    else if (/[mwMW]/.test(ch)) w += 10.6;
    else if (/[A-Z]/.test(ch)) w += 7.6;
    else w += 6.8;
  }
  return Math.ceil(w);
}

// Verdict glyphs drawn as shapes (no symbol font needed), in a GLYPH x GLYPH box at (x, y).
function glyph(v: Verdict, x: number, y: number): string {
  const c = GLYPH / 2;
  const st = `stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const g = (body: string) => `<g transform="translate(${x} ${y})">${body}</g>`;
  switch (v) {
    case 'dikonfirmasi': return g(`<path d="M2 6.5 L5 9.5 L10 3" ${st}/>`);
    case 'sebagian': return g(`<circle cx="${c}" cy="${c}" r="4.6" fill="none" stroke="${INK}" stroke-width="1.5"/><path d="M${c} 1.4 A4.6 4.6 0 0 0 ${c} 10.6 Z" fill="${INK}"/>`);
    case 'tidak-terbukti': return g(`<path d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5" ${st}/>`);
    default: return g(`<path d="M3.6 4.2 C3.6 1.2 8.4 1.2 8.4 4.2 C8.4 6.2 6 6 6 8" ${st}/><circle cx="6" cy="10.4" r="1" fill="${INK}"/>`);
  }
}

export interface Badge { svg: string; width: number; height: number; label: string }

/** The badge for a verdict in one language: "Kawal Kepakaran | <glyph> <verdict>". */
export function verdictBadge(verdict: Verdict, locale: Locale): Badge {
  const label = verdictLabel(verdict, locale);
  const leftText = textWidth(SITE_NAME);
  const left = leftText + PAD * 2;
  // The label is bold, about a tenth wider than regular text.
  const rightText = Math.ceil(textWidth(label) * 1.1);
  const right = PAD + GLYPH + 4 + rightText + PAD;
  const width = left + right;
  const h = BADGE_HEIGHT;
  const base = 14;
  const title = `${SITE_NAME}: ${label}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="${esc(title)}">`,
    `<title>${esc(title)}</title>`,
    `<clipPath id="r"><rect width="${width}" height="${h}" rx="3"/></clipPath>`,
    `<g clip-path="url(#r)"><rect width="${left}" height="${h}" fill="${INK}"/><rect x="${left}" width="${right}" height="${h}" fill="${VERDICT_COLOR[verdict]}"/></g>`,
    `<g font-family="Verdana,DejaVu Sans,Geneva,sans-serif" font-size="${FONT}">`,
    `<text x="${PAD}" y="${base}" fill="${PAPER}" textLength="${leftText}" lengthAdjust="spacingAndGlyphs">${SITE_NAME}</text>`,
    glyph(verdict, left + PAD, (h - GLYPH) / 2),
    `<text x="${left + PAD + GLYPH + 4}" y="${base}" fill="${INK}" font-weight="bold" textLength="${rightText}" lengthAdjust="spacingAndGlyphs">${esc(label)}</text>`,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
  return { svg, width, height: h, label };
}

/** Site path of a claim's badge: /klaim/<id>/badge.svg or /en/claims/<id>/badge.svg. */
export const badgePath = (id: string, locale: Locale): string => `${localizedPath('claims', locale, id)}/badge.svg`;

/** The HTML a reader pastes to embed the badge, linking back to the claim page (tagged as an embed). */
export function embedSnippet(i: { claimUrl: string; badgeUrl: string; alt: string; width: number; height: number }): string {
  const href = new URL(i.claimUrl);
  href.searchParams.set('utm_source', 'embed');
  href.searchParams.set('utm_medium', 'badge');
  return `<a href="${esc(href.toString())}"><img src="${esc(i.badgeUrl)}" alt="${esc(i.alt)}" width="${i.width}" height="${i.height}"></a>`;
}
