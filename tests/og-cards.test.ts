import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
// @ts-ignore plain JS module
import { allCards, articles, claimSvg, DISCLAIMER, escapeXml, frontmatterValue, handClaims, handPakar, MAX_BYTES, REPLY, VERDICT, VERDICT_GLYPH, wrapText } from '../scripts/og-lib.mjs';
// @ts-ignore plain JS module
import { footerSvg, FOOTER_LINES, OUT_DIR, POSTER_FILES } from '../scripts/make-bowobharata-posters.mjs';
import { replyStatusLabel, verdictLabel } from '../src/lib/verdict';
import { articleOg, caseOg, claimOg, pakarOg, siteOg } from '../src/lib/og';
import { POSTERS } from '../src/lib/bowobharata';

type Card = { file: string; svg: string };
const cards: Card[] = allCards();
const byFile = new Map(cards.map((c) => [`/${c.file}`, c.svg]));

type Labels = Record<string, Record<'id' | 'en', string>>;

describe('og card labels', () => {
  it('match the site verdict and reply labels', () => {
    for (const v of Object.keys(VERDICT)) for (const l of ['id', 'en'] as const) expect((VERDICT as Labels)[v][l]).toBe(verdictLabel(v as never, l));
    for (const r of Object.keys(REPLY)) for (const l of ['id', 'en'] as const) expect((REPLY as Labels)[r][l]).toBe(replyStatusLabel(r as never, l));
    expect(Object.values(VERDICT_GLYPH).sort()).toEqual(['?', '✓', '✕', '◐'].sort());
  });
});

describe('og text helpers', () => {
  it('escapes XML', () => {
    expect(escapeXml(`a & b <c> "d" 'e'`)).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;');
  });
  it('wraps and truncates with an ellipsis', () => {
    expect(wrapText('satu dua tiga', 40, 3)).toEqual(['satu dua tiga']);
    const out = wrapText('kata '.repeat(60), 20, 3);
    expect(out).toHaveLength(3);
    for (const l of out) expect(l.length).toBeLessThanOrEqual(20);
    expect(out[2].endsWith('…')).toBe(true);
  });
  it('reads quoted and bare frontmatter values', () => {
    const md = '---\ntitle: "A \\"quoted\\" title"\ndraft: true\n---\nbody';
    expect(frontmatterValue(md, 'title')).toBe('A "quoted" title');
    expect(frontmatterValue(md, 'draft')).toBe('true');
  });
  it('escapes claim text that contains markup', () => {
    const svg = claimSvg({ id: 'x', locale: 'id', claim: 'A <b> & B', verdict: 'sebagian', expert: 'X', reply: 'belum-ada' });
    expect(svg).toContain('A &lt;b&gt; &amp; B');
    expect(svg).not.toContain('<b>');
  });
});

describe('og cards cover the src/lib/og.ts contract', () => {
  it('has the site and case cards in both languages', () => {
    for (const l of ['id', 'en'] as const) {
      expect(byFile.has(siteOg(l).src)).toBe(true);
      expect(byFile.has(caseOg(l).src)).toBe(true);
    }
  });
  it('has one card per hand-made claim and expert, skipping generated, archive and draft entries', () => {
    const claims = handClaims();
    expect(claims.length).toBeGreaterThan(0);
    for (const c of claims) {
      expect(c.draft).not.toBe(true);
      for (const l of ['id', 'en'] as const) {
        const svg = byFile.get(claimOg(c.id, l, c.claim, c.verdict).src);
        expect(svg, c.id).toBeDefined();
        expect(svg).toContain(escapeXml((VERDICT as Labels)[c.verdict][l]));
        expect(svg).toContain(escapeXml(DISCLAIMER[l]));
        expect(svg).toContain(l === 'id' ? `kawalkepakaran.org/klaim/${c.id}` : `kawalkepakaran.org/en/claims/${c.id}`);
      }
    }
    for (const p of handPakar()) {
      expect(p.source).not.toBe('arsip');
      for (const l of ['id', 'en'] as const) expect(byFile.has(pakarOg(p.id, l, p.name).src), p.id).toBe(true);
    }
    expect(cards.some((c) => c.file.includes('generated'))).toBe(false);
  });
  it('has a text-only card per article, never embedding an image', () => {
    for (const [dir, l] of [['src/content/posts', 'id'], ['src/content/posts-en', 'en']] as const) {
      for (const a of articles(dir)) {
        const svg = byFile.get(articleOg(a.slug, l, a.title).src);
        expect(svg, a.slug).toBeDefined();
        expect(svg).not.toMatch(/<image\b/);
        expect(svg).toContain(escapeXml(DISCLAIMER[l]));
      }
    }
  });
  it('renders a 1200x630 JPEG under the size limit', async () => {
    const svg = byFile.get(articleOg(articles('src/content/posts')[0].slug, 'id', '').src)!;
    const buf = await sharp(Buffer.from(svg)).flatten({ background: '#070a16' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const meta = await sharp(buf).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1200, 630, 'jpeg']);
    expect(buf.length).toBeLessThan(MAX_BYTES);
  });
  it('is wired into the build before astro build', () => {
    const build: string = JSON.parse(readFileSync('package.json', 'utf8')).scripts.build;
    expect(build.indexOf('make-og.mjs')).toBeGreaterThan(-1);
    expect(build.indexOf('make-og.mjs')).toBeLessThan(build.indexOf('astro build'));
    expect(build.indexOf('make-bowobharata-posters.mjs')).toBeLessThan(build.indexOf('astro build'));
  });
});

describe('labelled bowobharata posters', () => {
  it('carry the allegory footer and are what bowobharata.ts serves', () => {
    expect(FOOTER_LINES.join(' ')).toContain('Alegori dan pendapat penulis, bukan pernyataan fakta');
    expect(FOOTER_LINES.join(' ')).toContain('kawalkepakaran.org/kasus/abil-sudarman/bowobharata');
    expect(footerSvg(1206).svg).toContain('belum bisa diverifikasi');
    for (const f of POSTER_FILES) expect(existsSync(`${OUT_DIR}/${f}`), f).toBe(true);
    const src = readFileSync('src/lib/bowobharata.ts', 'utf8');
    for (const f of POSTER_FILES) expect(src).toContain(`assets/bowobharata/labelled/${f}`);
    for (const p of Object.values(POSTERS)) expect(p.alt).toMatch(/alegor/i);
  });
});

describe('bukti images carry a source strip', () => {
  it('ends in the dark strip at the bottom', async () => {
    for (const f of ['public/img/bukti-pddikti.png', 'public/img/bukti-utas-unesco.png']) {
      const { width, height } = await sharp(f).metadata();
      const px = await sharp(f).extract({ left: width! - 4, top: height! - 2, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
      expect([...px], f).toEqual([0x0b, 0x10, 0x20]);
    }
  });
});
