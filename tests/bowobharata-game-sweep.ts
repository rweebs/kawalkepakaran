// What the game's screen tests share: every terlapor's name forms and one matcher for them (the copy test's guard, and
// the island test's category E sweep), the text a person reads or hears in a render, and the island's cardOf.
import { readFileSync } from 'node:fs';
import type { Locale } from '../src/i18n';
import type { EventCard } from '../src/lib/bowobharata-game/data';
import { kategoriKey, type Perkara } from '../src/lib/perkara';

const data = JSON.parse(readFileSync('src/data/perkara.json', 'utf8')) as Perkara;

// Terlapor names, every form, for all 86 people. The brief's three forms keep the dossier's decoration (quote marks,
// role words, degree suffixes, a second party), so the guard also derives the plain names inside them.
/** Entries that join several names with ' dan ' or ' / ': two parties, or one party under several names. */
export const COMPOUND = new Set(['T-062', 'T-067', 'T-072', 'T-073', 'T-074', 'T-075']);
/** Entries whose ' dan ' belongs to one name, e.g. "Sekolah Teknik Elektro dan Informatika (STEI) ITB". */
export const ONE_NAME = new Set(['T-061', 'T-065', 'T-069']);
/** The Pelapor's own name and sites, never a terlapor form: pelaporNote and finaleClose name the Pelapor by right. */
export const PELAPOR = new Set(['rahmat wibowo', 'rahmatwibowo.com', 'rahmatwibowo.net']);
/** Derived leftovers that describe rather than name. */
const GENERIC = new Set(['akun', 'akun x', 'akun threads', 'organisasi']);
const ROLE = /^(?:(?:pengelola|pengendali|pemegang|pemilik)\s+)?akun(?:\s+(?:x|threads))?\s+|^(?:tertulis|ditulis)\s+juga\s+/i;
const DEGREES = /,\s+(?:[A-Z][A-Za-z]{0,3}\.)+(?:,\s+(?:[A-Z][A-Za-z]{0,3}\.)+)*$/;

/** A name and its plainer spellings: quote marks stripped, degree suffixes cut, leading role words dropped, then a
 * leading initial ("R.") or company form ("PT") dropped. */
function plainForms(s: string): string[] {
  const unquoted = s.replace(/"/g, '').trim();
  const undegreed = unquoted.replace(DEGREES, '').trim();
  const unroled = undegreed.replace(ROLE, '').trim();
  return [unquoted, undegreed, unroled, unroled.replace(/^(?:[A-Z]\.|PT)\s+/, '').trim()];
}

/** The brief's three forms of an entry (the whole nama, the text before ' (', the first parenthesised text), and the
 * derived ones: every parenthesised part, every quoted segment, every @handle with and without its @, and the plain
 * forms of each name, after splitting a compound entry into its names. */
function nameForms(t: { id: string; nama: string }): { base: string[]; derived: string[] } {
  const n = t.nama;
  const first = n.match(/\(([^)]+)\)/)?.[1];
  const parts = COMPOUND.has(t.id) ? n.split(/ dan | \/ /) : [n];
  return {
    base: [n, n.split(' (')[0], ...(first ? [first] : [])],
    derived: [
      ...[...n.matchAll(/\(([^)]+)\)/g)].flatMap((m) => plainForms(m[1])),
      ...[...n.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
      ...[...n.matchAll(/@\w+/g)].flatMap((m) => [m[0], m[0].slice(1)]),
      ...parts.flatMap((p) => plainForms(p.split(' (')[0])),
    ],
  };
}

const lower = (f: string) => f.trim().toLowerCase();
/** A group's name forms, lower case: the base forms, then the derived forms that add something (at least 4 characters,
 * not generic, not already a base form), less the Pelapor's own name and sites. */
function formsOf(group: readonly { id: string; nama: string }[]) {
  const base = new Set(group.flatMap((t) => nameForms(t).base.map(lower)));
  const derived = new Set(group.flatMap((t) => nameForms(t).derived.map(lower)).filter((f) => f.length >= 4 && !GENERIC.has(f) && !base.has(f)));
  return { derived, all: [...base, ...derived].filter((f) => !PELAPOR.has(f)) };
}
const EVERY = formsOf(data.terlapor);
/** The derived forms of every terlapor's name. */
export const DERIVED_FORMS = EVERY.derived;
/** Every form of every terlapor's name. */
export const NAME_FORMS = EVERY.all;
/** Every form of the category E terlapor's names (kategoriKey 'E'), whom the game leaves out. */
export const E_FORMS = formsOf(data.terlapor.filter((t) => kategoriKey(t.kategori) === 'E')).all;
/** The name forms that `s` contains, ignoring case: of every terlapor, or of the forms given. */
export const namesIn = (s: string, forms: readonly string[] = NAME_FORMS): string[] => {
  const low = s.toLowerCase();
  return forms.filter((f) => low.includes(f));
};

/** The attributes a person reads or hears: alternative text, titles, labels, descriptions and hints. URLs (href, src,
 * srcset) are not screen text. */
const READ_ATTRS = new Set(['alt', 'title', 'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'placeholder']);
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
  s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m));
/** What a person can read or hear in rendered HTML: its text, with every tag and comment as a space, and its readable
 * attributes; decoded, each run of white space one space, one piece per line. */
export function readable(html: string): string {
  const labels = [...html.matchAll(/<[a-z][^>]*>/gi)].flatMap((tag) =>
    [...tag[0].matchAll(/\s([a-z][\w-]*)="([^"]*)"/gi)].filter((a) => READ_ATTRS.has(a[1].toLowerCase())).map((a) => a[2]));
  const text = html.replace(/<!--[\s\S]*?-->|<[^>]*>/g, ' ');
  return [text, ...labels].map((s) => decode(s).replace(/\s+/g, ' ').trim()).join('\n');
}

/** The island's cardOf (BowobharataGame.tsx), as the tests make record toasts with it: a record's date and channel from
 * the event cards of the lakon's chapter. The island test pins the island's own cardOf to the same return line. */
export const cardOfIn = (events: readonly (readonly EventCard[])[], chapter: number, locale: Locale) => (card: number) => {
  const e = events[chapter]?.[card];
  return e ? { date: e.dateLabel[locale], channel: e.channel[locale] } : null;
};
