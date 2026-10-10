import { describe, it, expect } from 'vitest';
import {
  parseSlugs, parseRules, partiesFor, kindFor, langFor, titleFrom, stripTitle, rewriteImages, holdFlags, trimMentions, statusFor, slugify,
} from '../scripts/arsip-lib.mjs';

const SLUGS_SRC = `export const professionalBlacklistSlugs = new Set<string>([
    'rahmat-wibowo-vs-ecommurz-hrd-labor-dispute',
    'somasi-046-ibrahim-arief-govtech-edu-letter-of-demand-english',
    "aduan-031-ibrahim-arief-police-complaint-english",
    // a comment with 'quoted-text-not-a-slug' in it
    'the-ibam-files-a-logical-fallacy-audit-of-the-kawalibam-campaign',
]);`;

const RULES_SRC = `const RULES: { match: RegExp; party: Party }[] = [
    { match: /ecommurz/, party: company('Ecommurz') },
    { match: /govtech/, party: company('GovTech Edu') },
    { match: /kawal-?ibam|ibam-files/, party: group('#KawalRahmat / #KawalIbam threads') },
    { match: /(^|-)aws(-|$)|amazon/, party: company('Amazon Web Services') },
    { match: /ibrahim-arief/, party: person('Ibrahim Arief') },
];`;

describe('source parsing', () => {
  it('reads slugs in single or double quotes and ignores quoted text in comments', () => {
    expect(parseSlugs(SLUGS_SRC)).toEqual([
      'rahmat-wibowo-vs-ecommurz-hrd-labor-dispute',
      'somasi-046-ibrahim-arief-govtech-edu-letter-of-demand-english',
      'aduan-031-ibrahim-arief-police-complaint-english',
      'the-ibam-files-a-logical-fallacy-audit-of-the-kawalibam-campaign',
    ]);
  });
  it('reads party rules with their kind and name', () => {
    const rules = parseRules(RULES_SRC);
    expect(rules).toHaveLength(5);
    expect(rules[0]).toMatchObject({ kind: 'Company', name: 'Ecommurz' });
    expect(rules[2]).toMatchObject({ kind: 'Group', name: '#KawalRahmat / #KawalIbam threads' });
    expect(rules[4]).toMatchObject({ kind: 'Person', name: 'Ibrahim Arief' });
  });
  it('tags a post with every party whose rule matches, with a url-safe slug, and none for no match', () => {
    const rules = parseRules(RULES_SRC);
    const p = partiesFor('somasi-046-ibrahim-arief-govtech-edu-letter-of-demand-english', rules);
    expect(p.map((x) => x.name)).toEqual(['GovTech Edu', 'Ibrahim Arief']);
    expect(p.map((x) => x.slug)).toEqual(['govtech-edu', 'ibrahim-arief']);
    expect(partiesFor('something-unrelated', rules)).toEqual([]);
  });
  it('makes slugs url-safe', () => {
    expect(slugify('#KawalRahmat / #KawalIbam threads')).toBe('kawalrahmat-kawalibam-threads');
    expect(slugify('Init6 / Bukalapak')).toBe('init6-bukalapak');
  });
});

describe('classification', () => {
  it.each([
    ['somasi-046-x', 'somasi'],
    ['aduan-031-x', 'aduan'],
    ['rahmat-wibowo-vs-ecommurz-hrd-labor-dispute', 'ringkasan'],
    ['rahmat-wibowo-vs-x-dispute-summary', 'ringkasan'],
    ['the-ibam-files-a-logical-fallacy-audit-of-the-kawalibam-campaign', 'analisis'],
    ['aegis-legal-assessment-study-case-of-kawal-ibam', 'analisis'],
    ['some-other-note', 'catatan'],
  ])('%s is a %s', (slug, kind) => expect(kindFor(slug)).toBe(kind));
  it('gives a formal notice a procedural status and everything else an unknown one', () => {
    expect(statusFor('somasi')).toBe('dikirim');
    expect(statusFor('aduan')).toBe('tidak-diketahui');
    expect(statusFor('analisis')).toBe('tidak-diketahui');
  });
  it('detects the language of a post', () => {
    expect(langFor('Saya mengirim surat yang dan untuk tidak dengan pada ini itu karena')).toBe('id');
    expect(langFor('I sent the letter and it was for the court with this that because')).toBe('en');
  });
});

describe('markdown helpers', () => {
  const md = '# A Title Here\n\n![alt one](a-header.png)\n\ntext\n\n![](/blog/b-image.JPG)\n\n![x](https://example.org/y.png)\n';
  it('takes the title from the first heading and removes it from the body', () => {
    expect(titleFrom(md)).toBe('A Title Here');
    expect(stripTitle(md).startsWith('# A Title Here')).toBe(false);
  });
  it('rewrites blog-relative and /blog image links to flat webp names, leaves external ones, and lists the images', () => {
    const r = rewriteImages(md);
    expect(r.md).toContain('![alt one](/img/arsip-a-header.webp)');
    expect(r.md).toContain('![](/img/arsip-b-image.webp)');
    expect(r.md).toContain('https://example.org/y.png');
    expect(r.images).toEqual(['a-header.png', 'b-image.JPG']);
  });
});

describe('hold flags', () => {
  it('holds a post with a phone number', () => {
    const f = holdFlags('call me on 0812 3456 7890 please');
    expect(f.pii.length).toBe(1);
    expect(f.action).toBe('hold');
  });
  it('holds a post with heavy medical wording and reports the matching line', () => {
    const f = holdFlags('line one\nSurat keterangan medis dari dokter spesialis psikiatri.\nline three');
    expect(f.heavy[0]).toMatchObject({ line: 2 });
    expect(f.action).toBe('hold');
  });
  it('holds a post that mentions suicidal ideation or medical records', () => {
    expect(holdFlags('Depresi kronis dan ideasi suicide yang meningkat').action).toBe('hold');
    expect(holdFlags('Catatan medical records menunjukkan deteriorasi').action).toBe('hold');
  });
  it('trims a post whose only medical mention is a plain paragraph sentence', () => {
    const f = holdFlags('Intro line.\n\nThis period of my life included a clinical diagnosis, which I have referenced. The next sentence stays.\n');
    expect(f.mention).toHaveLength(1);
    expect(f.action).toBe('trim');
  });
  it('holds instead of trimming when the mention sits in a table row, list item or heading', () => {
    expect(holdFlags('| 6 | date | mental health impact | x |').action).toBe('hold');
    expect(holdFlags('- a clinical diagnosis in a list').action).toBe('hold');
    expect(holdFlags('## Dampak kesehatan mental').action).toBe('hold');
  });
  it('only reviews weak wording, so a quoted disability law does not hold or trim a post', () => {
    const f = holdFlags('the Disability Rights Law provision on access to justice');
    expect(f.heavy).toEqual([]);
    expect(f.mention).toEqual([]);
    expect(f.weak.length).toBe(1);
    expect(f.action).toBe('review');
  });
  it('publishes plain text', () => {
    expect(holdFlags('a plain paragraph about a contract dispute')).toMatchObject({ pii: [], heavy: [], mention: [], weak: [], action: 'publish' });
  });
});

describe('trimMentions', () => {
  const text = 'Intro line.\n\nThis period included a clinical diagnosis, which I referenced. The next sentence stays. Another one stays too.\n\nUntouched paragraph.\n';
  it('removes only the sentence that mentions it and keeps the rest of the paragraph', () => {
    const r = trimMentions(text);
    expect(r.text).toContain('The next sentence stays. Another one stays too.');
    expect(r.text).not.toMatch(/clinical|diagnosis/);
    expect(r.text).toContain('Untouched paragraph.');
    expect(r.removed).toBe(1);
  });
  it('drops a paragraph that becomes empty, without leaving a double blank line', () => {
    const r = trimMentions('A.\n\nMy clinical diagnosis is mentioned here.\n\nB.\n');
    expect(r.text).toBe('A.\n\nB.\n');
  });
  it('leaves a text with no mention exactly as it was', () => {
    expect(trimMentions('Nothing here.\n').text).toBe('Nothing here.\n');
    expect(trimMentions('Nothing here.\n').removed).toBe(0);
  });
});
