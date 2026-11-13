import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PARVAS } from '../src/lib/bowobharata';
import type { Perkara } from '../src/lib/perkara';
import { buildChapters } from '../src/lib/bowobharata-game/record';
import { GAME_COPY } from '../src/lib/bowobharata-game/copy';
import { BRAND } from './bowobharata-game-brand';

const data = JSON.parse(readFileSync('src/data/perkara.json', 'utf8')) as Perkara;
const totals = { people: 80, events: 300, reportsBy: 13, reportsAgainst: 4, excludedE: 6 };
/** Every field any copy function reads, so that what each function returns is checked too. */
const fixture = {
  ...totals,
  n: 3, done: 2, total: 9, seconds: 52, matched: true,
  date: '7 Mei 2026', channel: 'LinkedIn', label: 'Parva 1', m: 140, score: 300, best: 400,
};
const LOCALES = ['id', 'en'] as const;
type CopyFn = (o: typeof fixture) => unknown;

/** Every key path, recursing into plain objects, with one entry per list item, so that both locales must hold lists
 * of the same length. A function adds one entry per line it returns for the fixture. */
function keyPaths(o: object, prefix = ''): string[] {
  const items = (p: string, list: unknown[]) => list.map((_, i) => `${p}[${i}]`);
  return Object.entries(o).flatMap(([k, v]) => {
    const p = `${prefix}${k}`;
    if (Array.isArray(v)) return [p, ...items(p, v)];
    if (typeof v === 'function') {
      const out = (v as CopyFn)(fixture);
      return Array.isArray(out) ? [p, ...items(`${p}()`, out)] : [p];
    }
    return v && typeof v === 'object' ? [p, ...keyPaths(v, `${p}.`)] : [p];
  });
}

/** Every player-facing string with its key path, including what the functions return for the fixture. */
function entries(v: unknown, path = ''): [string, string][] {
  if (typeof v === 'string') return [[path, v]];
  if (typeof v === 'function') return entries((v as CopyFn)(fixture), `${path}()`);
  if (Array.isArray(v)) return v.flatMap((x, i) => entries(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => entries(x, path ? `${path}.${k}` : k));
  return [];
}
const strings = (v: unknown): string[] => entries(v).map(([, s]) => s);

/** Every function in the copy, with its key path. */
function functions(v: unknown, path = ''): [string, CopyFn][] {
  if (typeof v === 'function') return [[path, v as CopyFn]];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v).flatMap(([k, x]) => functions(x, path ? `${path}.${k}` : k));
  }
  return [];
}

const at = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], o);

// The game's own voice (spec: open-world anti-goals, calls 6, 7, 17 and 18). These lists hold no named person; they
// keep harm, verdicts, pursuit, lures and the reference games' names out of everything the game says.
/** Fixed lines that legitimately hold a listed form: the allegation line, and the Krishna line of parva 8. */
const ALLOWED = [GAME_COPY.id.allegation, GAME_COPY.en.allegation, 'bukan kemenangan yang dirayakan'];
const ID_FORMS = [
  'bunuh', 'membunuh', 'tembak', 'menembak', 'tabrak', 'menabrak', 'lindas', 'melindas', 'terjang', 'menerjang', 'hajar',
  'menghajar', 'serang', 'menyerang', 'lumpuh', 'melumpuhkan', 'tumbang', 'hancur', 'menghancurkan', 'musnah', 'basmi',
  'habisi', 'menghabisi', 'mati', 'tewas', 'gugur', 'kalah', 'mengalahkan', 'menang', 'memenangkan', 'pemenang', 'buru',
  'memburu', 'buronan', 'kejar', 'mengejar', 'tangkap', 'menangkap', 'penangkapan', 'bersalah', 'terbukti', 'vonis',
  'hukuman', 'menghukum', 'terpidana', 'tersangka', 'pelaku', 'penjahat', 'kriminal', 'fitnah', 'memfitnah', 'hoaks',
  'bohong', 'pembohong', 'tipu', 'menipu', 'penipu', 'musuh', 'korban', 'curi', 'rampas', 'bajak', 'kampanye', 'buzzer',
  'bayaran', 'komplotan', 'konspirasi', 'cambuk', 'bintang', 'umpan',
];
/** Fix round 1: the me(N)-, pe(N)- and ber- forms of the same roots, which the prefix group above cannot build, and the
 * di-, ter- and ke- forms of roots the brief lists only in a derived word (hukuman, terpidana, penjahat, kriminal).
 * Neutral words that share a root stay allowed: hukum (law), salah (wrong), bukti (evidence), bayar (pay). */
const ID_MORE = [
  'pembunuh', 'penembak', 'penabrak', 'pelindas', 'penerjang', 'penghajar', 'penyerang', 'pelumpuh', 'menumbangkan',
  'bertumbangan', 'penghancur', 'memusnahkan', 'pemusnah', 'membasmi', 'pembasmi', 'mematikan', 'menewaskan',
  'menggugurkan', 'berguguran', 'pemburu', 'perburuan', 'berburu', 'pengejar', 'berkejaran', 'penangkap', 'menyalahkan',
  'memvonis', 'dihukum', 'terhukum', 'penghukum', 'dipidana', 'memidanakan', 'pemidanaan', 'menjahati', 'kejahatan',
  'kriminalisasi', 'mengkriminalisasi', 'mengkriminalkan', 'pemfitnah', 'membohongi', 'berbohong', 'memusuhi',
  'permusuhan', 'bermusuhan', 'mengorbankan', 'pengorbanan', 'berkorban', 'mencuri', 'pencuri', 'merampas', 'perampas',
  'membajak', 'pembajak', 'berkampanye', 'mengampanyekan', 'mengkampanyekan', 'berkomplot', 'berkonspirasi', 'mencambuk',
  'pencambuk', 'berbintang', 'mengumpan', 'pengumpan',
];
const ID_BANNED = new RegExp(`\\b(?:di|ter|ke)?(?:${[...ID_FORMS, ...ID_MORE].join('|')})(?:kan|i|an)?(?:nya|lah|kah)?\\b`, 'i');
const ID_ALSO = /\bdiamankan\b/i;
const EN_WORDS = [
  'kill', 'kills', 'killed', 'killing', 'killer', 'slay', 'slain', 'murder', 'murdered', 'dead', 'death', 'died', 'defeat',
  'defeats', 'defeated', 'beat', 'beaten', 'crush', 'crushed', 'destroy', 'destroyed', 'shoot', 'shooting', 'shot', 'shots',
  'gun', 'guns', 'run\\s+over', 'knock\\s+down', 'knocked\\s+down', 'takedown', 'ram', 'rammed', 'ramming', 'smash',
  'smashed', 'wreck', 'wrecked', 'trample', 'trampled', 'attack', 'attacks', 'attacked', 'attacker', 'assault', 'punish',
  'punished', 'punishment', 'guilty', 'convicted', 'culprit', 'perpetrator', 'criminal', 'criminals', 'villain',
  'villains', 'enemy', 'enemies', 'liar', 'liars', 'lying', 'fraud', 'slander', 'hoax', 'smear', 'troll', 'trolls',
  'buzzer', 'paid', 'orchestrated', 'conspiracy', 'wanted', 'busted', 'wasted', 'bounty', 'fugitive', 'chase', 'chased',
  'chasing', 'hunt', 'hunted', 'hunting', 'pursue', 'pursued', 'pursuit', 'arrest', 'arrested', 'catch', 'catches',
  'caught', 'capture', 'captured', 'decoy', 'decoys', 'steal', 'stolen', 'campaign', 'campaigns', 'victim', 'victims',
  'win', 'wins', 'winner', 'won', 'star', 'stars', 'whip', 'lash',
];
/** Fix round 1: the -s, -ing and -er forms the brief's list leaves out ("Keep catching" is one Step 3 names). */
const EN_MORE = [
  'catching', 'catcher', 'catchers', 'chases', 'hunts', 'hunter', 'hunters', 'pursues', 'pursuing', 'captures',
  'capturing', 'arrests', 'arresting', 'attacking', 'shoots', 'shooter', 'shooters', 'steals', 'stealing', 'winning',
  'winners', 'killers',
];
const EN_BANNED = new RegExp(`\\b(?:${[...EN_WORDS, ...EN_MORE].join('|')})\\b`, 'i');
const STARS = /[★☆✩-✰⭐]/u;
/** Epic roles other than the Kurawa army itself, in the page's spelling and the usual English one. */
const ROLES = /\b(?:Sengkuni|Duryodana|Dursasana|Karna|Durna|Jayadrata|Aswatama|Shakuni|Duryodhana|Dushasana|Drona|Jayadratha|Ashwatthama)\b/i;

const unallowed = (s: string) => ALLOWED.reduce((acc, a) => acc.split(a).join(' '), s);

// Terlapor names, every form, for all 86 people. The brief's three forms keep the dossier's decoration (quote marks,
// role words, degree suffixes, a second party), so the guard also derives the plain names inside them.
/** Entries that join several names with ' dan ' or ' / ': two parties, or one party under several names. */
const COMPOUND = new Set(['T-062', 'T-067', 'T-072', 'T-073', 'T-074', 'T-075']);
/** Entries whose ' dan ' belongs to one name, e.g. "Sekolah Teknik Elektro dan Informatika (STEI) ITB". */
const ONE_NAME = new Set(['T-061', 'T-065', 'T-069']);
/** The Pelapor's own name and sites, never a terlapor form: pelaporNote and finaleClose name the Pelapor by right. */
const PELAPOR = new Set(['rahmat wibowo', 'rahmatwibowo.com', 'rahmatwibowo.net']);
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
const BASE_FORMS = new Set(data.terlapor.flatMap((t) => nameForms(t).base.map(lower)));
/** Derived forms that add something: at least 4 characters, not generic, not already a base form. */
const DERIVED_FORMS = new Set(
  data.terlapor.flatMap((t) => nameForms(t).derived.map(lower)).filter((f) => f.length >= 4 && !GENERIC.has(f) && !BASE_FORMS.has(f)),
);
const NAME_FORMS = [...BASE_FORMS, ...DERIVED_FORMS].filter((f) => !PELAPOR.has(f));
/** Every terlapor name form a string contains, ignoring case. */
const namesIn = (s: string): string[] => {
  const low = s.toLowerCase();
  return NAME_FORMS.filter((f) => low.includes(f));
};

/** The game's own strings, from the open-world copy table and the ten rewritten Krishna lines: [key path, ID, EN].
 * One deviation: the ID line of parva 1 says "yang ditanyakan" where the table had the noun "pertanyaan", which the
 * site removed everywhere (tests/no-pertanyaan.test.ts). */
const VERBATIM: [string, string, string][] = [
  [
    'armyNote',
    'Pasukan Kurawa di sini adalah kiasan untuk riuh unggahan, repost, dan komentar yang dicatat Pelapor. Salinan tulisan ulang di medan hanyalah perangkat permainan, bukan halaman tertentu. Tidak ada prajurit yang mewakili orang tertentu, dan tidak ada yang bisa terluka.',
    'Here the Kurawa army is an allegory for the clamour of posts, reposts and comments that the Pelapor recorded. The rewritten copies on the field are only a game device, not any particular page. No soldier stands for any particular person, and no one can be hurt.',
  ],
  ['pelaporNote', 'Pelapor dalam berkas ini adalah Rahmat Wibowo, penulis kiasan ini.', 'The Pelapor in this file is Rahmat Wibowo, the author of this allegory.'],
  ['hudFrame', 'Kiasan · pendapat penulis', "Allegory · the author's opinion"],
  ['fail.title', 'Catatan belum utuh', 'The record is not whole yet'],
  ['fail.skip', 'Lanjutkan cerita', 'Continue the story'],
  ['recordedScreen.title', 'Tercatat', 'On record'],
  ['ride.riuh', 'Riuh', 'Clamour'],
  ['ride.surge', 'Laju', 'Surge'],
  ['ride.sight', 'Mata', 'Sight'],
  ['toasts.ranks', 'Barisan tidak bisa diterobos. Kereta berhenti.', 'The ranks cannot be driven through. The chariot stops.'],
  ['types.himpun', 'Himpun', 'Gather'],
  ['types.antar', 'Antar', 'Deliver'],
  ['types.lintasan', 'Lintasan', 'Course'],
  ['types.uji', 'Uji ulang', 'Re-test'],
  [
    'krishnaLine.prologue',
    'Anak panah sudah tertancap sebelum perang dimulai. Catat satu per satu; jangan membalas.',
    'The arrows were in the ground before the war began. Record them one by one; do not strike back.',
  ],
  [
    'krishnaLine.dadu-di-hastinapura',
    'Di sini baru ada yang ditanyakan dan yang ditulis. Catat keduanya dan bawa ke Sanjaya.',
    'Here there are only questions and writing. Record both and bring them to Sanjaya.',
  ],
  [
    'krishnaLine.duta-perdamaian',
    'Krishna datang sebagai duta, bukan prajurit. Antar suratnya, lalu bawa catatannya ke Sanjaya.',
    'Krishna comes as an envoy, not a warrior. Deliver the letter, then bring the record to Sanjaya.',
  ],
  [
    'krishnaLine.sekutu-dan-perbandingan',
    'Kedua pihak menimbang kekuatan. Catat yang bisa diperiksa; biarkan tulisan ulang lewat.',
    'Both sides weigh their strength. Record what can be checked; let the rewrites pass.',
  ],
  [
    'krishnaLine.perang-narasi',
    'Ini bagian terpanjang, termasuk tulisan yang menurut penulisnya sendiri bisa dikritik. Catat semuanya apa adanya.',
    'This is the longest part, including writing its own author says can be criticised. Record all of it as it was.',
  ],
  [
    'krishnaLine.senjata-data',
    'Krishna tidak mengangkat senjata. Di sini senjatanya data yang bisa diuji ulang siapa saja; catat hasilnya.',
    'Krishna does not take up arms. Here the weapon is data that anyone can re-test; record the results.',
  ],
  [
    'krishnaLine.somasi-kedua',
    'Peringatan kedua. Simpan semuanya di satu tempat supaya catatannya utuh.',
    'A second warning. Keep everything in one place so the record stays whole.',
  ],
  [
    'krishnaLine.kurukshetra-digital',
    'Medan pindah ke linimasa dan kolom komentar, termasuk balasan yang diulang-ulang. Catat itu juga.',
    'The field moves to the timeline and the comment sections, including the replies sent over and over. Record those too.',
  ],
  [
    'krishnaLine.dharma-menemukan-jalannya',
    'Akhirnya bukan kemenangan yang dirayakan. Yang tersisa adalah catatan, terbuka untuk dikoreksi.',
    'The end is not a celebrated victory. What remains is the record, open to correction.',
  ],
  [
    'krishnaLine.finale',
    'Lihat seluruh catatannya. Setiap catatan tersimpan bersama sumbernya.',
    'Look at the whole record. Every entry is kept with its sources.',
  ],
];

describe('bowobharata-game copy', () => {
  it('both locales have identical key sets, deep', () => {
    expect(keyPaths(GAME_COPY.en).sort()).toEqual(keyPaths(GAME_COPY.id).sort());
  });

  it('krishnaLine covers exactly the chapter ids, in both locales', () => {
    const ids = buildChapters(PARVAS, data.terlapor).map((c) => c.id).sort();
    for (const l of LOCALES) {
      expect(Object.keys(GAME_COPY[l].krishnaLine).sort()).toEqual(ids);
      for (const line of Object.values(GAME_COPY[l].krishnaLine)) expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it('allegation line is verbatim', () => {
    expect(GAME_COPY.id.allegation).toBe('Dugaan Pelapor, bukan temuan polisi. Praduga tak bersalah berlaku.');
    expect(GAME_COPY.en.allegation).toBe("The Pelapor's allegation, not a police finding. The presumption of innocence applies.");
  });

  it('fixed titles and finale close', () => {
    for (const l of LOCALES) expect(GAME_COPY[l].title).toBe('BOWOBHARATA');
    expect(GAME_COPY.id.prologueTitle).toBe('Sebelum Perang');
    expect(GAME_COPY.en.prologueTitle).toBe('Before the War');
    expect(GAME_COPY.id.sanjayaTitle).toBe('Laporan Sanjaya');
    expect(GAME_COPY.en.sanjayaTitle).toBe("Sanjaya's Report");
    expect(GAME_COPY.id.nameOnly).toBe('muncul lagi');
    expect(GAME_COPY.en.nameOnly).toBe('appears again');
    expect(GAME_COPY.id.finaleClose).toBe('Semua ini diarahkan kepada satu orang: Rahmat Wibowo.');
    expect(GAME_COPY.en.finaleClose).toBe('All of it was aimed at one person: Rahmat Wibowo.');
  });

  it('finaleTotals is built from the numbers, in both locales', () => {
    for (const l of LOCALES) {
      const text = GAME_COPY[l].finaleTotals(totals).join('\n');
      for (const n of ['80', '300', '13', '4', '6']) expect(text).toMatch(new RegExp(`\\b${n}\\b`));
    }
    expect(GAME_COPY.id.finaleTotals(totals).join('\n')).toContain('13 laporan dibuat Rahmat Wibowo, 4 laporan terhadapnya');
    expect(GAME_COPY.en.finaleTotals(totals).join('\n')).toContain('13 reports filed by Rahmat Wibowo, 4 filed against Rahmat Wibowo.');
  });
});

describe("bowobharata-game copy: the game's own voice", () => {
  it('has at least 60 strings per locale, none empty, counting what each function returns', () => {
    for (const l of LOCALES) {
      const all = strings(GAME_COPY[l]);
      expect(all.length).toBeGreaterThanOrEqual(60);
      for (const [path, s] of entries(GAME_COPY[l])) expect(s.trim().length, `${l}.${path}`).toBeGreaterThan(0);
    }
  });

  it('no Indonesian form of harm, verdict, pursuit, lure or campaign, in either locale', () => {
    for (const l of LOCALES) {
      for (const [path, s] of entries(GAME_COPY[l])) {
        expect(unallowed(s), `${l}.${path}: ${s}`).not.toMatch(ID_BANNED);
        expect(s, `${l}.${path}: ${s}`).not.toMatch(ID_ALSO);
      }
    }
  });

  it('no English word of harm, verdict, pursuit, lure or campaign, in either locale', () => {
    for (const l of LOCALES) {
      for (const [path, s] of entries(GAME_COPY[l])) expect(unallowed(s), `${l}.${path}: ${s}`).not.toMatch(EN_BANNED);
    }
  });

  it('no name of the reference games, and no star', () => {
    for (const l of LOCALES) {
      for (const [path, s] of entries(GAME_COPY[l])) {
        expect(s, `${l}.${path}`).not.toMatch(BRAND);
        expect(s, `${l}.${path}`).not.toMatch(STARS);
      }
    }
  });

  it('"Kurawa" appears only in armyNote, and no other epic role is named', () => {
    for (const l of LOCALES) {
      expect(GAME_COPY[l].armyNote).toMatch(/\bKurawa\b/);
      for (const [path, s] of entries(GAME_COPY[l])) {
        if (path !== 'armyNote') expect(s, `${l}.${path}`).not.toMatch(/Kurawa/i);
        expect(s, `${l}.${path}`).not.toMatch(ROLES);
      }
    }
  });

  it('names no terlapor, by any form of the name: the dossier spelling or a plain name derived from it', () => {
    expect(data.terlapor.length).toBeGreaterThanOrEqual(86);
    expect(DERIVED_FORMS.size).toBeGreaterThanOrEqual(40);
    for (const l of LOCALES) {
      for (const [path, s] of entries(GAME_COPY[l])) expect(namesIn(s), `${l}.${path}`).toEqual([]);
    }
  });

  it('the name guard catches plain names, handles and second parties that the dossier writes with decoration', () => {
    const carrier = (name: string) => `Sanjaya mencatat ${name} di medan. Sanjaya records ${name} on the field.`;
    expect(namesIn(carrier(''))).toEqual([]);
    const planted = [
      'Alika Diyara', 'Penateam', 'Larasati Laras', '@sicupuh', 'Alka Diyara', 'rara riri', 'PT Pena Teknologi Indonesia',
      'PT Hikayat Rakyat Digital', 'Malaka Project', 'Machrio Achmad Nurhatta', 'Nurani Ayu Listyowati',
      'Muhammad Arya Yudha', 'Didit', 'Lamlo', 'Syarubany', '@intinyadeh', '@hrdbacot', '@ainunnajib', '@biru_sejenak',
      'Abil Sudarman',
    ];
    for (const name of planted) expect(namesIn(carrier(name)).length, name).toBeGreaterThan(0);
  });

  it("the name guard leaves the Pelapor's own name alone: pelaporNote and finaleClose are not flagged", () => {
    for (const l of LOCALES) {
      expect(namesIn(GAME_COPY[l].pelaporNote), `${l}.pelaporNote`).toEqual([]);
      expect(namesIn(GAME_COPY[l].finaleClose), `${l}.finaleClose`).toEqual([]);
    }
    for (const f of NAME_FORMS) expect(PELAPOR.has(f), f).toBe(false);
  });

  it("every dossier name joined by ' dan ' or ' / ' is classed as a compound or as one name", () => {
    const joined = data.terlapor.filter((t) => / dan | \/ /.test(t.nama)).map((t) => t.id).sort();
    expect([...COMPOUND, ...ONE_NAME].sort()).toEqual(joined);
  });

  it('the verbatim strings match', () => {
    for (const [path, id, en] of VERBATIM) {
      expect(at(GAME_COPY.id, path), `id.${path}`).toBe(id);
      expect(at(GAME_COPY.en, path), `en.${path}`).toBe(en);
    }
  });

  it("armyNote uses the file's own words and calls the copies a game device", () => {
    expect(GAME_COPY.id.armyNote).toContain('unggahan, repost, dan komentar');
    expect(GAME_COPY.id.armyNote).toContain('perangkat permainan');
  });

  it('every copy function takes at most one argument', () => {
    for (const l of LOCALES) {
      const fns = functions(GAME_COPY[l]);
      expect(fns.length).toBeGreaterThanOrEqual(7);
      for (const [path, fn] of fns) expect(fn.length, `${l}.${path}`).toBeLessThanOrEqual(1);
    }
  });

  it('one calm voice: no exclamation mark and no em dash', () => {
    for (const l of LOCALES) {
      for (const [path, s] of entries(GAME_COPY[l])) expect(s, `${l}.${path}`).not.toMatch(/[!—]/);
    }
  });

  it('a line that names Rahmat Wibowo uses no gendered pronoun', () => {
    const named = entries(GAME_COPY.en).filter(([, s]) => s.includes('Rahmat Wibowo'));
    expect(named.length).toBeGreaterThanOrEqual(3);
    for (const [path, s] of named) expect(s, `en.${path}`).not.toMatch(/\b(?:he|him|his|himself|she|her|hers|herself)\b/i);
  });
});
