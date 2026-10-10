// Pure helpers of the archive importer (scripts/import-arsip.mjs). No file access here, so everything is testable.
import { findPersonalData } from '../src/lib/privacy.ts';

// The author's own address, and an institutional address that the posts quote from a document (not a person's contact).
const ALLOWED_EMAILS = new Set(['rahmat.wibowo21@gmail.com', 'rektor@itb.ac.id']);

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

/** The flat output file name for a source image, url-safe: `My Shot (2).PNG` becomes `arsip-my-shot-2.webp`. */
export function imageName(base) {
  return `arsip-${slugify(base.replace(IMAGE_EXT, ''))}.webp`;
}

/**
 * Blog image links become flat `/img/arsip-<name>.webp` links; external links stay. A link that cannot be resolved (a path into
 * another folder) or whose file is not at the source (when `available` is given) is dropped and listed, so no page links a missing file.
 */
export function rewriteImages(md, available) {
  const images = [];
  const dropped = [];
  const out = md.replace(/!\[([^\]]*)\]\((<[^>]*>|[^)]+)\)/g, (whole, alt, raw) => {
    const src = raw.replace(/^<|>$/g, '').replace(/\s+"[^"]*"\s*$/, '');
    if (/^https?:\/\//.test(src)) return whole;
    if (!IMAGE_EXT.test(src.split('/').pop())) return whole;
    const base = src.match(/^\/?(?:blog\/)?([^/]+)$/)?.[1];
    if (!base || (available && !available.has(base))) {
      dropped.push(src);
      return '';
    }
    if (!images.includes(base)) images.push(base);
    return `![${alt}](/img/${imageName(base)})`;
  });
  return { md: out, images, dropped };
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

/** Frontmatter of an archived post. Values are JSON, which is valid YAML, so quotes and colons in a title are safe. */
export function frontmatter({ title, slug, lang, kind, status, parties, trimmed, archivedAt }) {
  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    `sourceUrl: ${JSON.stringify(`https://www.infraloka.co.id/blog/${slug}`)}`,
    `archivedAt: ${archivedAt}`,
    `lang: ${JSON.stringify(lang)}`,
    `kind: ${JSON.stringify(kind)}`,
    `status: ${JSON.stringify(status)}`,
    `parties: ${JSON.stringify(parties)}`,
    `trimmed: ${trimmed ? 'true' : 'false'}`,
    'draft: true',
    '---',
    '',
  ].join('\n');
}


// Everything that touches a medical subject, however lightly. Used only to trim a post that was held back for medical content.
const MEDICAL = new RegExp(`${HEAVY.source}|${MENTION.source}|medis|medical|kesehatan|\\bmental\\b`, 'i');
const TABLE_ROW = /^\s*\|/;
const TABLE_SEP = /^\s*\|[\s:|-]+\|\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s/;
const HEADING = /^(#{1,6})\s/;

/**
 * Removes the medical parts of a post: sentences of a paragraph, table rows, list items (with their continuation lines),
 * images whose alt text mentions it, and any heading that mentions it together with its section. Returns what was removed so the
 * owner can review it. A text with nothing medical comes back unchanged.
 */
export function trimMedical(text) {
  const lines = text.split('\n');
  const out = [];
  const removed = [];
  const short = (t) => t.trim().slice(0, 160);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h = line.match(HEADING);
    if (h && MEDICAL.test(line)) {
      let j = i + 1;
      while (j < lines.length) {
        const n = lines[j].match(HEADING);
        if (n && n[1].length <= h[1].length) break;
        j += 1;
      }
      removed.push({ kind: 'section', text: short(line) });
      i = j;
      continue;
    }
    if (/^!\[/.test(line) && MEDICAL.test(line.match(/!\[([^\]]*)\]/)?.[1] ?? '')) {
      removed.push({ kind: 'image', text: short(line) });
      i += 1;
      continue;
    }
    if (TABLE_ROW.test(line)) {
      const isHeader = TABLE_SEP.test(lines[i + 1] ?? '');
      if (isHeader && MEDICAL.test(line)) {
        let j = i;
        while (j < lines.length && TABLE_ROW.test(lines[j])) j += 1;
        removed.push({ kind: 'table', text: short(line) });
        i = j;
        continue;
      }
      if (!TABLE_SEP.test(line) && MEDICAL.test(line)) removed.push({ kind: 'row', text: short(line) });
      else out.push(line);
      i += 1;
      continue;
    }
    const li = line.match(LIST_ITEM);
    if (li && MEDICAL.test(line)) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '' && lines[j].match(/^\s*/)[0].length > li[1].length) j += 1;
      removed.push({ kind: 'item', text: short(line) });
      i = j;
      continue;
    }
    if (MEDICAL.test(line)) {
      if (/^\s*>/.test(line)) {
        removed.push({ kind: 'quote', text: short(line) });
      } else {
        const sentences = line.split(/(?<=[.!?])\s+/);
        const kept = sentences.filter((sentence) => !MEDICAL.test(sentence));
        for (const sentence of sentences) if (MEDICAL.test(sentence)) removed.push({ kind: 'sentence', text: short(sentence) });
        if (kept.length) out.push(kept.join(' '));
      }
      i += 1;
      continue;
    }
    out.push(line);
    i += 1;
  }
  if (!removed.length) return { text, removed: [] };

  // A table that lost every data row is dropped with its header.
  const cleaned = [];
  for (let k = 0; k < out.length; k += 1) {
    if (!TABLE_ROW.test(out[k])) { cleaned.push(out[k]); continue; }
    let e = k;
    while (e < out.length && TABLE_ROW.test(out[e])) e += 1;
    const block = out.slice(k, e);
    if (!(block.length === 2 && TABLE_SEP.test(block[1]))) cleaned.push(...block);
    k = e - 1;
  }
  return { text: cleaned.join('\n').replace(/\n{3,}/g, '\n\n'), removed };
}

/**
 * Tries to release a post that was held back for medical content by trimming it. It is released only when nothing heavy or
 * mentioning remains and there is no personal data. Personal data is never trimmed: such a post stays held.
 */
export function releaseByTrimming(text) {
  const before = holdFlags(text);
  if (before.pii.length) return { released: false, text, removed: [] };
  if (before.action !== 'hold') return { released: true, text, removed: [] };
  const t = trimMedical(text);
  return { released: holdFlags(t.text).action !== 'hold', text: t.text, removed: t.removed };
}

const KIND_FIELD = { Person: 'Orang', Company: 'Perusahaan', Group: 'Kelompok' };
const GENERATED_LIMITS = 'Halaman ini hanya merangkum tulisan penulis. Ia tidak membuktikan hal yang disebut dalam tulisan itu, status berasal dari sumber dan bukan dari putusan, dan belum adanya jawaban dari pihak ini bukan pengakuan atas apa pun.';
const GENERATED_LIMITS_EN = 'This page only summarises the author\'s posts. It does not prove what those posts say, the status comes from the source and not from a ruling, and the absence of a reply from this party is not an admission of anything.';

/** The profile of a party named in the archive, for /pakar. Generated, so it says so, states the author's interest, and is a draft. */
export function pakarFromParty({ name, kind, articles }) {
  const n = articles.length;
  return {
    name,
    field: KIND_FIELD[kind],
    kind,
    source: 'arsip',
    summary: `Pihak yang disebut dalam ${n} tulisan penulis. Halaman ini hanya merangkum tulisan itu dan bukan penilaian atas pihak ini.`,
    summaryEn: `A party named in ${n} post${n === 1 ? '' : 's'} by the author. This page only summarises those posts and is not an assessment of this party.`,
    credentials: [],
    interest: 'Penulis situs ini (Rahmat Wibowo) adalah pihak dalam perkara yang diuraikan dalam tulisan-tulisan ini.',
    interestEn: 'The author of this site (Rahmat Wibowo) is a party to the matters described in these posts.',
    limits: GENERATED_LIMITS,
    limitsEn: GENERATED_LIMITS_EN,
    draft: true,
  };
}

/**
 * One claim per party and formal document. It records that the author's document exists; it does not say the party made a claim and it
 * does not say the content was checked. The fixed limits text states exactly that.
 */
export function klaimFromDocument({ party, article }) {
  return {
    pakar: party,
    claim: `Dokumen penulis: ${article.title}`,
    claimEn: `Author's document: ${article.title}`,
    venue: 'Dokumen penulis',
    verdict: 'belum-terverifikasi',
    confidence: 'rendah',
    evidence: [],
    limits: 'Entri ini dibuat otomatis dari dokumen penulis. Ia mencatat bahwa dokumen itu ada, bukan bahwa isinya telah diperiksa atau terbukti.',
    limitsEn: 'This entry was generated automatically from the author\'s document. It records that the document exists, not that its content has been checked or proven.',
    replyStatus: 'belum-ada',
    articles: [article.slug],
    source: 'arsip',
    draft: true,
  };
}

export const klaimId = (party, articleSlug) => `${party}--${articleSlug}`;
