import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PARVAS } from '../src/lib/bowobharata';
import type { Perkara } from '../src/lib/perkara';
import { buildChapters } from '../src/lib/bowobharata-game/record';
import { GAME_COPY } from '../src/lib/bowobharata-game/copy';

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

/** Every key path, recursing into plain objects; arrays and functions are leaves. */
function keyPaths(o: object, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => {
    const p = `${prefix}${k}`;
    return v && typeof v === 'object' && !Array.isArray(v) ? [p, ...keyPaths(v, `${p}.`)] : [p];
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
const ID_BANNED = new RegExp(`\\b(?:di|ter|ke)?(?:${ID_FORMS.join('|')})(?:kan|i|an)?(?:nya|lah|kah)?\\b`, 'i');
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
const EN_BANNED = new RegExp(`\\b(?:${EN_WORDS.join('|')})\\b`, 'i');
const BRAND = /\b(?:gta|grand\s+theft(?:\s+auto)?|rockstar|take-two|los\s+santos|san\s+andreas|vinewood|vice\s+city|liberty\s+city|pricedown|chalet|signpainter|grand?\s+turismo|polyphony|mission\s+(?:passed|failed)|wanted\s+level)\b/i;
const STARS = /[★☆✩-✰⭐]/u;
/** Epic roles other than the Kurawa army itself, in the page's spelling and the usual English one. */
const ROLES = /\b(?:Sengkuni|Duryodana|Dursasana|Karna|Durna|Jayadrata|Aswatama|Shakuni|Duryodhana|Dushasana|Drona|Jayadratha|Ashwatthama)\b/i;

const unallowed = (s: string) => ALLOWED.reduce((acc, a) => acc.split(a).join(' '), s);

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

  it('names no terlapor, by the full name, the name before the parenthesis or the name inside it', () => {
    expect(data.terlapor.length).toBeGreaterThanOrEqual(86);
    const forms = data.terlapor.flatMap((t) => {
      const inner = t.nama.match(/\(([^)]+)\)/)?.[1];
      return [t.nama, t.nama.split(' (')[0], ...(inner ? [inner] : [])].map((f) => f.trim().toLowerCase());
    });
    for (const l of LOCALES) {
      for (const [path, s] of entries(GAME_COPY[l])) {
        const low = s.toLowerCase();
        for (const f of forms) expect(low.includes(f), `${l}.${path} names "${f}"`).toBe(false);
      }
    }
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
