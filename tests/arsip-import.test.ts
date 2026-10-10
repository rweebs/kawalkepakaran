import { describe, it, expect } from 'vitest';
import { arsipSchema, klaimSchema, pakarSchema } from '../src/lib/schemas';
import {
  parseSlugs, parseRules, partiesFor, kindFor, langFor, titleFrom, stripTitle, rewriteImages, holdFlags, trimMentions, trimMedical, releaseByTrimming, statusFor, slugify, frontmatter, pakarFromParty, klaimFromDocument, klaimId, imageName,
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

describe('false positives of the personal-data scan', () => {
  it('no longer takes image file names or package versions for personal data', () => {
    expect(holdFlags('![](4ac1234567890123456721e3784.png) firebase@9.6.11').pii).toEqual([]);
  });
  it('still holds a post with a stranger address', () => {
    expect(holdFlags('write to someone@example.com').pii).toEqual(['someone@example.com']);
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

describe('generated records', () => {
  // The frontmatter values are JSON, so a small reader is enough to check what Astro will see.
  const read = (fm: string) => {
    const body = fm.match(/^---\n([\s\S]*?)\n---\n/)![1];
    const o: Record<string, unknown> = {};
    for (const line of body.split('\n')) {
      const i = line.indexOf(': ');
      const raw = line.slice(i + 2);
      o[line.slice(0, i)] = /^["[]|^(true|false)$/.test(raw) ? JSON.parse(raw) : raw;
    }
    return o;
  };
  const fm = frontmatter({
    title: 'Legal Notice No. 046: "Ibrahim" & Co', slug: 'somasi-046-x', lang: 'en', kind: 'somasi', status: 'dikirim',
    parties: ['govtech-edu', 'ibrahim-arief'], trimmed: true, archivedAt: '2026-10-10',
  });
  it('writes frontmatter that the archive schema accepts, with a draft flag and the original address', () => {
    const o = read(fm);
    expect(arsipSchema.safeParse(o).success).toBe(true);
    expect(o.draft).toBe(true);
    expect(o.sourceUrl).toBe('https://www.infraloka.co.id/blog/somasi-046-x');
    expect(o.trimmed).toBe(true);
    expect(o.parties).toEqual(['govtech-edu', 'ibrahim-arief']);
  });
  it('keeps quotes, colons and ampersands in a title intact', () => {
    expect(read(fm).title).toBe('Legal Notice No. 046: "Ibrahim" & Co');
  });
  it('makes a pakar record for a party that the schema accepts, marked as generated from the archive', () => {
    const r = pakarFromParty({ name: 'GovTech Edu', kind: 'Company', articles: ['a', 'b'] });
    expect(pakarSchema.safeParse(r).success).toBe(true);
    expect(r.source).toBe('arsip');
    expect(r.draft).toBe(true);
    expect(r.kind).toBe('Company');
    expect(r.summary).toMatch(/2 tulisan/);
    expect(r.summaryEn).toMatch(/2 posts/);
    expect(r.interest).toMatch(/Rahmat Wibowo/);
    expect(r.limits).toMatch(/bukan pengakuan/);
    expect(r.credentials).toEqual([]);
  });
  it('makes a claim for a document that only records the document, with the fixed limits text, as a draft', () => {
    const k = klaimFromDocument({ party: 'govtech-edu', article: { slug: 'somasi-046-x', title: 'Legal Notice No. 046', kind: 'somasi' } });
    expect(klaimSchema.safeParse(k).success).toBe(true);
    expect(k.pakar).toBe('govtech-edu');
    expect(k.claim).toBe('Dokumen penulis: Legal Notice No. 046');
    expect(k.claimEn).toBe("Author's document: Legal Notice No. 046");
    expect(k.verdict).toBe('belum-terverifikasi');
    expect(k.confidence).toBe('rendah');
    expect(k.limits).toMatch(/dibuat otomatis/);
    expect(k.limits).toMatch(/bukan bahwa isinya/);
    expect(k.limitsEn).toMatch(/generated automatically/);
    expect(k.evidence).toEqual([]);
    expect(k.articles).toEqual(['somasi-046-x']);
    expect(k.draft).toBe(true);
    expect(k.source).toBe('arsip');
  });
  it('names a generated claim after its party and document, so one document can serve several parties', () => {
    expect(klaimId('govtech-edu', 'somasi-046-x')).toBe('govtech-edu--somasi-046-x');
    expect(klaimId('ibrahim-arief', 'somasi-046-x')).not.toBe(klaimId('govtech-edu', 'somasi-046-x'));
  });
});

describe('trimMedical', () => {
  it('removes only the medical sentences of a paragraph, and reports them', () => {
    const r = trimMedical('Intro.\n\nThe letter shows psychiatric treatment. The contract was signed in May. A medical record exists.\n');
    expect(r.text).toContain('The contract was signed in May.');
    expect(r.text).not.toMatch(/psychiatric|medical/);
    expect(r.removed.map((x: { kind: string }) => x.kind)).toEqual(['sentence', 'sentence']);
  });
  it('removes a table row and a list item that mention it, keeps the others, and drops a table left without rows', () => {
    const t = ['| # | Evidence | Note |', '|---|---|---|', '| 1 | Screenshot | fine |', '| 2 | Surat keterangan medis | psikiatri |', '', '- a normal item', '- an item on mental health', '', '| # | Evidence |', '|---|---|', '| 1 | Rekam medis |', ''].join('\n');
    const r = trimMedical(t);
    expect(r.text).toContain('| 1 | Screenshot | fine |');
    expect(r.text).toContain('- a normal item');
    expect(r.text).not.toMatch(/medis|psikiatri|mental health|Rekam/);
    expect(r.text).not.toContain('| # | Evidence |\n|---|---|\n\n');
    expect(r.removed.some((x: { kind: string }) => x.kind === 'row')).toBe(true);
    expect(r.removed.some((x: { kind: string }) => x.kind === 'item')).toBe(true);
  });
  it('removes a heading with medical wording together with its section, up to the next heading of the same level', () => {
    const t = '# Title\n\n## Dampak kesehatan mental\n\nParagraph one.\n\n### Sub\n\nSub text.\n\n## Next section\n\nStays.\n';
    const r = trimMedical(t);
    expect(r.text).toContain('## Next section');
    expect(r.text).toContain('Stays.');
    expect(r.text).not.toMatch(/Dampak|Paragraph one|Sub text/);
    expect(r.removed[0]).toMatchObject({ kind: 'section' });
  });
  it('removes an image whose alt text mentions it', () => {
    const r = trimMedical('A.\n\n![Surat keterangan medis, exhibit 6](/img/x.webp)\n\n![Exhibit 7](/img/y.webp)\n');
    expect(r.text).toContain('/img/y.webp');
    expect(r.text).not.toContain('/img/x.webp');
  });
  it('leaves a text with nothing medical exactly as it was', () => {
    const t = 'Plain text.\n\n- one\n- two\n';
    expect(trimMedical(t)).toEqual({ text: t, removed: [] });
  });
});

describe('releaseByTrimming', () => {
  it('releases a held post once trimming clears every heavy or mentioning line', () => {
    const r = releaseByTrimming('A.\n\nPsychiatric care was needed. The notice was sent.\n\n| a | b |\n|---|---|\n| 1 | medical record |\n');
    expect(holdFlags(r.text).action).not.toBe('hold');
    expect(r.released).toBe(true);
    expect(r.removed.length).toBeGreaterThan(0);
  });
  it('keeps a post held when personal data remains after trimming', () => {
    const r = releaseByTrimming('Call 0812 3456 7890.\n\nPsychiatric care was needed.\n');
    expect(r.released).toBe(false);
  });
  it('treats a post that needs no trimming as released with nothing removed', () => {
    const r = releaseByTrimming('A plain paragraph.\n');
    expect(r).toMatchObject({ released: true, removed: [] });
  });
});

describe('image links that cannot be resolved', () => {
  it('drops a link into a folder that is not the blog image folder, including the angle-bracket form with spaces', () => {
    const r = rewriteImages('A.\n\n![E-01: x](<../screenshots/image copy 2.png>)\n\nB.\n');
    expect(r.md).not.toContain('screenshots');
    expect(r.md).toContain('A.');
    expect(r.md).toContain('B.');
    expect(r.images).toEqual([]);
    expect(r.dropped).toEqual(['../screenshots/image copy 2.png']);
  });
  it('drops an image that is not at the source when the list of available files is given, and keeps one that is', () => {
    const r = rewriteImages('![a](have.png) ![b](gone.png)', new Set(['have.png']));
    expect(r.md).toContain('/img/arsip-have.webp');
    expect(r.md).not.toContain('gone');
    expect(r.dropped).toEqual(['gone.png']);
  });
  it('drops a link with spaces in its path and no angle brackets, and one with a title', () => {
    const r = rewriteImages('![a](../../../companies/Traveloka/screenshot/WhatsApp Image 2026-05-06.jpeg)\n\n![b](gone.png "a title")\n\n![c](have.png "a title")', new Set(['have.png']));
    expect(r.md).not.toMatch(/companies|gone/);
    expect(r.md).toContain('/img/arsip-have.webp');
    expect(r.dropped).toEqual(['../../../companies/Traveloka/screenshot/WhatsApp Image 2026-05-06.jpeg', 'gone.png']);
  });
  it('leaves a link to something that is not an image alone', () => {
    expect(rewriteImages('[a file](notes.pdf) ![x](https://example.org/a.png)').md).toBe('[a file](notes.pdf) ![x](https://example.org/a.png)');
  });
  it('names the output file the same way the rewritten link does, with url-safe characters', () => {
    expect(imageName('My Shot (2).PNG')).toBe('arsip-my-shot-2.webp');
    expect(imageName('a-header.png')).toBe('arsip-a-header.webp');
  });
});
