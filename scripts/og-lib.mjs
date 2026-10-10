// Shared pieces for the social preview cards (scripts/make-og.mjs). Everything here is pure: SVG strings and
// content readers, so tests can check the text that ends up on a card without rendering it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const W = 1200;
export const H = 630;
export const MAX_BYTES = 300_000;
export const HOST = 'kawalkepakaran.org';

// Labels mirror src/lib/verdict.ts (tests/og-cards.test.ts keeps them in sync).
export const VERDICT = {
  'dikonfirmasi': { id: 'Dikonfirmasi', en: 'Confirmed' },
  'sebagian': { id: 'Sebagian', en: 'Partly' },
  'tidak-terbukti': { id: 'Tidak terbukti', en: 'Not supported' },
  'belum-terverifikasi': { id: 'Belum bisa diverifikasi', en: 'Cannot yet be verified' },
};
export const VERDICT_GLYPH = { 'dikonfirmasi': '✓', 'sebagian': '◐', 'tidak-terbukti': '✕', 'belum-terverifikasi': '?' };
export const REPLY = {
  'belum-ada': { id: 'Belum ada tanggapan', en: 'No reply yet' },
  'diterima': { id: 'Tanggapan diterima', en: 'Reply received' },
  'dipublikasikan': { id: 'Tanggapan dipublikasikan', en: 'Reply published' },
};

export const DISCLAIMER = {
  id: 'Catatan dan pendapat penulis, bukan putusan · hak jawab terbuka',
  en: "The author's notes and opinion, not a ruling · right of reply open",
};

export const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Greedy word wrap by character budget; the last kept line gets an ellipsis when text is cut. */
export function wrapText(text, maxChars, maxLines) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  let i = 0;
  for (; i < words.length; i++) {
    let w = words[i];
    if (w.length > maxChars) w = w.slice(0, maxChars - 1) + '…';
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) { cur = next; continue; }
    lines.push(cur);
    cur = w;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) { lines.push(cur); cur = ''; i = words.length; }
  if (i < words.length || cur) {
    let last = lines[maxLines - 1] ?? '';
    while (last.length > maxChars - 1) last = last.slice(0, last.lastIndexOf(' ') > 0 ? last.lastIndexOf(' ') : maxChars - 1);
    lines[maxLines - 1] = last.replace(/[\s,.:;·—-]+$/, '') + '…';
  }
  return lines;
}

// ---- the existing look: sky, stars, swifts, emblem ----

const stars = Array.from({ length: 110 }, (_, i) => {
  const x = (i * 197) % W;
  const y = (i * 89) % H;
  const r = 0.8 + ((i * 7) % 4) * 0.5;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#cfd8ff" opacity="${0.35 + ((i * 13) % 6) / 10}"/>`;
}).join('');

// one swift with a stone, centred at (0,0), body length ~ 90
function bird(x, y, s, rot) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="M0 -10 C-30 -34 -80 -38 -118 -4 C-78 -8 -46 4 -8 28 Z" fill="#9fb0d0" opacity="0.9"/>
    <path d="M0 -10 C30 -34 80 -38 118 -4 C78 -8 46 4 8 28 Z" fill="#9fb0d0" opacity="0.9"/>
    <ellipse cx="0" cy="8" rx="14" ry="38" fill="#2a3040" stroke="#9fb0d0" stroke-width="3"/>
    <circle cx="0" cy="-34" r="11" fill="#2a3040" stroke="#9fb0d0" stroke-width="3"/>
    <path d="M-10 40 L0 76 L10 40 Z" fill="#2a3040" stroke="#9fb0d0" stroke-width="3"/>
    <circle cx="0" cy="58" r="12" fill="#e08a2e"/><circle cx="-4" cy="54" r="3.6" fill="#ffd9a0"/>
  </g>`;
}

const FULL_FLOCK = [
  [820, 150, 0.9, -12], [980, 250, 0.7, 8], [760, 545, 0.5, -14],
  [1010, 110, 0.5, 14], [880, 400, 0.55, -6], [1100, 360, 0.45, 18],
].map(([x, y, s, r]) => bird(x, y, s, r)).join('');

// text-heavy cards keep the swifts in the top-right corner, clear of the text block
const SMALL_FLOCK = [[960, 95, 0.42, -10], [1095, 70, 0.32, 14], [1045, 160, 0.28, 6]]
  .map(([x, y, s, r]) => bird(x, y, s, r)).join('');

const emblem = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">
    <circle cx="32" cy="32" r="31" fill="#0b1020" stroke="#e3b341" stroke-width="2.5"/>
    <path d="M32 8 C38 15 44 21 44 32 C44 43 38 51 32 56 C26 51 20 43 20 32 C20 21 26 15 32 8 Z" fill="#1a2147" stroke="#e3b341" stroke-width="1.5"/>
    <g stroke="#e3b341" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M23.5 27 H40.5"/><path d="M32 21 V45"/><path d="M27.5 45 H36.5"/><path d="M23.5 27 L21 34 H26 Z"/><path d="M40.5 27 L38 34 H43 Z"/></g>
  </g>`;

const SERIF = `Georgia, 'Times New Roman', serif`;
const SANS = 'Helvetica, Arial, sans-serif';

const frame = (body, flock) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="sky" cx="62%" cy="22%" r="85%">
      <stop offset="0" stop-color="#1b2347"/><stop offset="0.55" stop-color="#0d1229"/><stop offset="1" stop-color="#070a16"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${stars}
  ${flock}
  ${body}
</svg>`;

const text = (x, y, size, fill, content, { font = SANS, weight, spacing } = {}) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ''}${spacing ? ` letter-spacing="${spacing}"` : ''} fill="${fill}">${escapeXml(content)}</text>`;

const lines = (x, y, size, lh, fill, arr, opts) => arr.map((l, i) => text(x, y + i * lh, size, fill, l, opts)).join('\n  ');

/** URL line, shrunk to fit and truncated as a last resort. */
function urlLine(url, y) {
  const budget = 1060;
  const size = Math.max(17, Math.min(26, Math.floor(budget / (url.length * 0.55))));
  const maxChars = Math.floor(budget / (size * 0.55));
  const shown = url.length > maxChars ? url.slice(0, maxChars - 1) + '…' : url;
  return text(74, y, size, '#93c5fd', shown);
}

const header = () => `${emblem(70, 52, 0.95)}
  ${text(150, 100, 24, '#f1f5f9', 'KAWAL KEPAKARAN', { font: SERIF, weight: 700, spacing: 3 })}`;

// The verdict glyphs are drawn as shapes so they never fall back to a missing-glyph box on a build machine without symbol fonts.
function glyph(verdict, cx, cy) {
  const ring = `<circle cx="${cx}" cy="${cy}" r="22" fill="#0b1020" stroke="#e3b341" stroke-width="3"/>`;
  const st = 'stroke="#e3b341" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  switch (verdict) {
    case 'dikonfirmasi': return `${ring}<path d="M${cx - 10} ${cy + 1} L${cx - 3} ${cy + 9} L${cx + 11} ${cy - 8}" ${st}/>`;
    case 'sebagian': return `${ring}<circle cx="${cx}" cy="${cy}" r="12" fill="none" stroke="#e3b341" stroke-width="3"/><path d="M${cx} ${cy - 12} A12 12 0 0 0 ${cx} ${cy + 12} Z" fill="#e3b341"/>`;
    case 'tidak-terbukti': return `${ring}<path d="M${cx - 9} ${cy - 9} L${cx + 9} ${cy + 9} M${cx + 9} ${cy - 9} L${cx - 9} ${cy + 9}" ${st}/>`;
    default: return `${ring}<path d="M${cx - 7} ${cy - 6} C${cx - 7} ${cy - 15} ${cx + 8} ${cy - 15} ${cx + 8} ${cy - 6} C${cx + 8} ${cy} ${cx} ${cy} ${cx} ${cy + 5}" ${st}/><circle cx="${cx}" cy="${cy + 12}" r="2.8" fill="#e3b341"/>`;
  }
}

// ---- card builders ----

const SITE = {
  id: { title: 'Menguji klaim para pakar', sub: 'Kredensial diperiksa · bukti dibuka · hak jawab', note: 'Catatan dan pendapat penulis, bukan putusan', url: HOST },
  en: { title: 'Checking what experts claim', sub: 'Credentials checked · evidence opened · right of reply', note: "The author's notes and opinion, not a ruling", url: `${HOST}/en` },
};

/** The site card: same layout as the original kawal-og.png. */
export function siteSvg(locale) {
  const t = SITE[locale];
  return frame(`${emblem(70, 80, 1.15)}
  ${text(170, 140, 30, '#f1f5f9', 'KAWAL KEPAKARAN', { font: SERIF, weight: 700, spacing: 3 })}
  ${text(70, 330, locale === 'id' ? 68 : 64, '#f1f5f9', t.title, { font: SERIF, weight: 700 })}
  ${text(74, 396, locale === 'id' ? 34 : 31, '#e3b341', t.sub)}
  ${text(74, 470, 26, '#94a3b8', t.note)}
  ${text(74, 570, 26, '#93c5fd', t.url)}`, FULL_FLOCK);
}

export function claimSvg({ id, locale, claim, verdict, expert, reply }) {
  const label = VERDICT[verdict]?.[locale] ?? VERDICT['belum-terverifikasi'][locale];
  const claimLines = wrapText(claim, 40, 3);
  const top = claimLines.length === 1 ? 330 : claimLines.length === 2 ? 305 : 285;
  const meta = `${locale === 'id' ? 'Pakar' : 'Expert'}: ${expert} · ${REPLY[reply]?.[locale] ?? REPLY['belum-ada'][locale]}`;
  const path = locale === 'id' ? `/klaim/${id}` : `/en/claims/${id}`;
  return frame(`${header()}
  ${glyph(verdict, 96, 200)}
  ${text(134, 212, 34, '#e3b341', label, { weight: 700 })}
  ${lines(70, top, 46, 58, '#f1f5f9', claimLines, { font: SERIF, weight: 700 })}
  ${text(74, 478, 24, '#9fb0d0', wrapText(meta, 80, 1)[0])}
  ${text(74, 524, 22, '#94a3b8', DISCLAIMER[locale])}
  ${urlLine(`${HOST}${path}`, 580)}`, SMALL_FLOCK);
}

export function pakarSvg({ id, locale, name, field, claims }) {
  const kicker = locale === 'id' ? 'PAKAR YANG DIPERIKSA · KASUS 001' : 'EXPERT CHECKED · CASE 001';
  const count = locale === 'id' ? `${claims} klaim diperiksa terhadap bukti` : `${claims} claim${claims === 1 ? '' : 's'} checked against the evidence`;
  const path = locale === 'id' ? `/pakar/${id}` : `/en/experts/${id}`;
  const fieldLines = wrapText(field, 52, 2);
  return frame(`${header()}
  ${text(74, 200, 22, '#e3b341', kicker, { spacing: 2 })}
  ${text(70, 290, 66, '#f1f5f9', wrapText(name, 30, 1)[0], { font: SERIF, weight: 700 })}
  ${lines(74, 350, 30, 40, '#e3b341', fieldLines)}
  ${text(74, 350 + fieldLines.length * 40 + 18, 24, '#9fb0d0', count)}
  ${text(74, 524, 22, '#94a3b8', DISCLAIMER[locale])}
  ${urlLine(`${HOST}${path}`, 580)}`, SMALL_FLOCK);
}

export function caseSvg(locale) {
  const t = locale === 'id'
    ? { kicker: 'KASUS 001', sub: ['Kredensial dan jabatan yang diklaim,', 'diperiksa terhadap bukti terbuka'], path: '/kasus/abil-sudarman' }
    : { kicker: 'CASE 001', sub: ['Claimed credentials and roles,', 'checked against open evidence'], path: '/en/cases/abil-sudarman' };
  return frame(`${emblem(70, 80, 1.15)}
  ${text(170, 140, 30, '#f1f5f9', 'KAWAL KEPAKARAN', { font: SERIF, weight: 700, spacing: 3 })}
  ${text(74, 240, 26, '#e3b341', t.kicker, { spacing: 4 })}
  ${text(70, 320, 68, '#f1f5f9', 'Abil Sudarman', { font: SERIF, weight: 700 })}
  ${lines(74, 382, 32, 42, '#e3b341', t.sub)}
  ${text(74, 500, 22, '#94a3b8', DISCLAIMER[locale])}
  ${urlLine(`${HOST}${t.path}`, 570)}`, FULL_FLOCK);
}

export function articleSvg({ slug, locale, title }) {
  const kicker = locale === 'id' ? 'ARTIKEL · KASUS 001' : 'ARTICLE · CASE 001';
  const titleLines = wrapText(title, 44, 4);
  const path = locale === 'id' ? `/kasus/abil-sudarman/artikel/${slug}` : `/en/cases/abil-sudarman/articles/${slug}`;
  return frame(`${header()}
  ${text(74, 200, 22, '#e3b341', kicker, { spacing: 2 })}
  ${lines(70, 262, 42, 54, '#f1f5f9', titleLines, { font: SERIF, weight: 700 })}
  ${text(74, 524, 22, '#94a3b8', DISCLAIMER[locale])}
  ${urlLine(`${HOST}${path}`, 580)}`, SMALL_FLOCK);
}

// ---- content readers ----

const jsonFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Hand-made claims only: the generated/ subfolder and drafts are skipped. */
export function handClaims(root = 'src/content') {
  const dir = join(root, 'klaim');
  return jsonFiles(dir).map((f) => ({ id: f.replace(/\.json$/, ''), ...readJson(join(dir, f)) })).filter((c) => c.draft !== true);
}

/** Hand-made experts only: generated/ and archive imports ("source": "arsip") are skipped. */
export function handPakar(root = 'src/content') {
  const dir = join(root, 'pakar');
  return jsonFiles(dir).map((f) => ({ id: f.replace(/\.json$/, ''), ...readJson(join(dir, f)) })).filter((p) => p.source !== 'arsip' && p.draft !== true);
}

/** Reads a frontmatter scalar (quoted or bare). */
export function frontmatterValue(md, key) {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return undefined;
  const line = fm[1].split(/\r?\n/).find((l) => l.startsWith(`${key}:`));
  if (!line) return undefined;
  const raw = line.slice(key.length + 1).trim();
  if (raw.startsWith('"')) { try { return JSON.parse(raw); } catch { return raw.slice(1, -1); } }
  if (raw.startsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  return raw;
}

export function articles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).sort().flatMap((f) => {
    const md = readFileSync(join(dir, f), 'utf8');
    if (frontmatterValue(md, 'draft') === 'true') return [];
    const title = frontmatterValue(md, 'title');
    return title ? [{ slug: f.replace(/\.md$/, ''), title }] : [];
  });
}

/** Every card to render: { file (relative to public/), svg }. */
export function allCards(root = 'src/content') {
  const cards = [];
  for (const locale of ['id', 'en']) {
    cards.push({ file: `og/site-${locale}.jpg`, svg: siteSvg(locale) });
    cards.push({ file: `og/kasus-001-${locale}.jpg`, svg: caseSvg(locale) });
  }
  const pakar = handPakar(root);
  const claims = handClaims(root);
  const nameOf = (id) => pakar.find((p) => p.id === id)?.name ?? id;
  for (const c of claims) {
    for (const locale of ['id', 'en']) {
      const claim = locale === 'en' ? (c.claimEn ?? c.claim) : c.claim;
      cards.push({ file: `og/klaim/${c.id}-${locale}.jpg`, svg: claimSvg({ id: c.id, locale, claim, verdict: c.verdict, expert: nameOf(c.pakar), reply: c.replyStatus ?? 'belum-ada' }) });
    }
  }
  for (const p of pakar) {
    const n = claims.filter((c) => c.pakar === p.id).length;
    for (const locale of ['id', 'en']) {
      // there is no English "field"; the first sentence of the English summary stands in for it
      const field = locale === 'en' ? (p.fieldEn ?? (p.summaryEn ?? '').split(/(?<=\.)\s/)[0]) : (p.field ?? '');
      cards.push({ file: `og/pakar/${p.id}-${locale}.jpg`, svg: pakarSvg({ id: p.id, locale, name: p.name, field, claims: n }) });
    }
  }
  for (const a of articles(join(root, 'posts'))) cards.push({ file: `og/artikel/${a.slug}-id.jpg`, svg: articleSvg({ slug: a.slug, locale: 'id', title: a.title }) });
  for (const a of articles(join(root, 'posts-en'))) cards.push({ file: `og/artikel/${a.slug}-en.jpg`, svg: articleSvg({ slug: a.slug, locale: 'en', title: a.title }) });
  return cards;
}
