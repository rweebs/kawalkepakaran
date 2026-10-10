// Pure helpers of the archive importer (scripts/import-arsip.mjs). No file access here, so everything is testable.
import { findPersonalData } from '../src/lib/privacy.ts';

const ALLOWED_EMAILS = new Set(['rahmat.wibowo21@gmail.com']);

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

/** Slugs listed in `professionalBlacklistSlugs`: quoted kebab-case strings, comments ignored. */
export function parseSlugs(src) {
  const out = [];
  for (const m of stripComments(src).matchAll(/['"]([a-z0-9]+(?:-[a-z0-9]+)*)['"]/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export function slugify(name) {
  return name.toLowerCase().replace(/[#]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Party rules of `blacklist-parties.ts`: `{ match: /re/, party: company('Name') }`. */
export function parseRules(src) {
  const rules = [];
  const re = /match:\s*\/((?:\\\/|[^/])+?)\/([a-z]*)\s*,\s*party:\s*(company|person|group)\(\s*(['"])((?:\\.|(?!\4).)*)\4\s*\)/g;
  for (const m of src.matchAll(re)) {
    const kind = m[3][0].toUpperCase() + m[3].slice(1);
    rules.push({ re: new RegExp(m[1], m[2]), kind, name: m[5].replace(/\\(['"])/g, '$1') });
  }
  return rules;
}

/** Every party whose rule matches the slug, once each. A post that matches no rule has no party. */
export function partiesFor(slug, rules) {
  const seen = new Set();
  const out = [];
  for (const r of rules) {
    if (r.re.test(slug) && !seen.has(r.name)) {
      seen.add(r.name);
      out.push({ name: r.name, kind: r.kind, slug: slugify(r.name) });
    }
  }
  return out;
}

export function kindFor(slug) {
  if (slug.startsWith('somasi-')) return 'somasi';
  if (slug.startsWith('aduan-')) return 'aduan';
  if (/^rahmat-wibowo-vs-|dispute-summary/.test(slug)) return 'ringkasan';
  if (/audit|analysis|analisis|assessment|study-case|report/.test(slug)) return 'analisis';
  return 'catatan';
}

/** Procedural status only: a formal notice is "sent"; for everything else the source does not say. */
export function statusFor(kind) {
  return kind === 'somasi' ? 'dikirim' : 'tidak-diketahui';
}

const ID_WORDS = new Set(['yang', 'dan', 'dengan', 'untuk', 'tidak', 'pada', 'ini', 'itu', 'karena', 'saya', 'adalah', 'dari', 'atau', 'dalam', 'akan']);
const EN_WORDS = new Set(['the', 'and', 'with', 'for', 'not', 'was', 'this', 'that', 'because', 'it', 'is', 'of', 'to', 'in', 'on', 'are']);

export function langFor(text) {
  let id = 0;
  let en = 0;
  for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (ID_WORDS.has(w)) id += 1;
    if (EN_WORDS.has(w)) en += 1;
  }
  return id > en ? 'id' : 'en';
}

export const titleFrom = (md) => (md.match(/^#\s+(.+)$/m) ?? [])[1]?.trim() ?? '';

export function stripTitle(md) {
  return md.replace(/^#\s+.+\n+/m, '');
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

/** Blog-relative image links become flat `/img/arsip-<name>.webp` links; external links stay. Lists the source files. */
export function rewriteImages(md) {
  const images = [];
  const out = md.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, alt, src) => {
    if (/^https?:\/\//.test(src)) return whole;
    const base = src.split('/').pop();
    if (!IMAGE_EXT.test(base)) return whole;
    if (!images.includes(base)) images.push(base);
    return `![${alt}](/img/arsip-${base.replace(IMAGE_EXT, '').toLowerCase()}.webp)`;
  });
  return { md: out, images };
}

// Heavy medical wording (psychiatric care, records, suicidal ideation) holds a post. A mere mention of a diagnosis or of mental
// health can be trimmed when it sits in a plain paragraph. Weak wording (a quoted disability law) only needs a look.
const HEAVY = /psikiatr|psychiatr|suicid|bunuh diri|self-harm|depresi|depression|rekam medis|medical record|surat keterangan medis|medical letter|visum|klinis/i;
const MENTION = /diagnos|clinical|mental health|kesehatan mental/i;
const WEAK = /disabilit|hamil|pregnan|kesehatan|\bmental\b|medis|medical/i;
const NOT_PLAIN = /^\s*([|>#*\-+]|\d+[.)]\s)/;

/**
 * What to do with a post before it is copied: `hold` (personal data, heavy medical wording, or a mention that sits in a table,
 * list or heading), `trim` (only plain-paragraph mentions, removable by sentence), `review` (weak wording only) or `publish`.
 */
export function holdFlags(text) {
  const pii = findPersonalData(text, ALLOWED_EMAILS);
  const heavy = [];
  const mention = [];
  const weak = [];
  text.split('\n').forEach((line, i) => {
    const item = { line: i + 1, text: line.trim().slice(0, 160), paragraph: !NOT_PLAIN.test(line) };
    if (HEAVY.test(line)) heavy.push(item);
    else if (MENTION.test(line)) mention.push(item);
    else if (WEAK.test(line)) weak.push(item);
  });
  let action = 'publish';
  if (pii.length || heavy.length || mention.some((m) => !m.paragraph)) action = 'hold';
  else if (mention.length) action = 'trim';
  else if (weak.length) action = 'review';
  return { pii, heavy, mention, weak, action };
}

/** Removes, from plain paragraph lines, only the sentences that mention a diagnosis or mental health. */
export function trimMentions(text) {
  let removed = 0;
  const lines = text.split('\n').flatMap((line) => {
    if (!MENTION.test(line) || NOT_PLAIN.test(line) || HEAVY.test(line)) return [line];
    const sentences = line.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((sentence) => !MENTION.test(sentence));
    removed += sentences.length - kept.length;
    return kept.length ? [kept.join(' ')] : [];
  });
  if (!removed) return { text, removed: 0 };
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n'), removed };
}
