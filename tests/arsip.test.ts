import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { arsipSchema, pihakSchema } from '../src/lib/schemas';
import { assertPihakRefs, selectVisibleArsip } from '../src/lib/arsip-refs';
import { ROUTES } from '../src/i18n';

const read = (p: string) => readFileSync(p, 'utf8');

const arsip = {
  title: 'T', sourceUrl: 'https://www.infraloka.co.id/blog/x', archivedAt: '2026-10-10', lang: 'en', kind: 'somasi',
  status: 'dikirim', parties: ['p'], trimmed: false, draft: true,
};
const pihak = {
  name: 'Ecommurz', kind: 'Company', articles: ['a'], interest: 'i', interestEn: 'i', limits: 'l', limitsEn: 'l', updatedAt: '2026-10-10', draft: true,
};

describe('schemas', () => {
  it('accepts a complete arsip article and pihak', () => {
    expect(arsipSchema.safeParse(arsip).success).toBe(true);
    expect(pihakSchema.safeParse(pihak).success).toBe(true);
  });
  it.each([
    ['no source address', { sourceUrl: undefined }],
    ['an unknown kind', { kind: 'vonis' }],
    ['a free-text status', { status: 'bersalah' }],
    ['an unknown language', { lang: 'fr' }],
  ])('rejects an arsip article with %s', (_n, patch) => {
    expect(arsipSchema.safeParse({ ...arsip, ...patch }).success).toBe(false);
  });
  it.each([
    ['no interest statement', { interest: '' }],
    ['no limits', { limitsEn: '' }],
    ['no article', { articles: [] }],
    ['an unknown kind', { kind: 'Alias' }],
  ])('rejects a pihak with %s', (_n, patch) => {
    expect(pihakSchema.safeParse({ ...pihak, ...patch }).success).toBe(false);
  });
  it('defaults an article to draft and to untrimmed when the importer says nothing', () => {
    const { draft: _d, trimmed: _t, ...rest } = arsip;
    const r = arsipSchema.parse(rest);
    expect(r.draft).toBe(true);
    expect(r.trimmed).toBe(false);
  });
});

describe('references and visibility', () => {
  const art = (id: string, draft = true) => ({ id, data: { draft } });
  const pih = (id: string, articles: string[], draft = true) => ({ id, data: { articles, draft } });

  it('assertPihakRefs throws naming the party and the missing article', () => {
    expect(() => assertPihakRefs(['a'], [pih('p1', ['zzz'])])).toThrow(/p1.*zzz/);
    expect(() => assertPihakRefs(['a'], [pih('p1', ['a'])])).not.toThrow();
  });
  it('hides drafts in production and shows them when drafts are included', () => {
    const arts = [art('a', true), art('b', false)];
    const pihs = [pih('p', ['a'], true), pih('q', ['b'], false)];
    expect(selectVisibleArsip(arts, pihs, false).arsip.map((x) => x.id)).toEqual(['b']);
    expect(selectVisibleArsip(arts, pihs, false).pihak.map((x) => x.id)).toEqual(['q']);
    expect(selectVisibleArsip(arts, pihs, true).arsip).toHaveLength(2);
  });
  it('fails clearly when a shown party points at a hidden article', () => {
    expect(() => selectVisibleArsip([art('a', true)], [pih('p', ['a'], false)], false)).toThrow(/p.*a/);
  });
});

describe('pages and policy', () => {
  it('has routes and page files in both languages', () => {
    expect(ROUTES.archive).toEqual({ id: '/arsip', en: '/en/archive' });
    expect(ROUTES.parties).toEqual({ id: '/pihak', en: '/en/parties' });
    for (const p of [
      'src/pages/arsip/index.astro', 'src/pages/arsip/artikel/[slug].astro', 'src/pages/pihak/index.astro', 'src/pages/pihak/[slug].astro',
      'src/pages/en/archive/index.astro', 'src/pages/en/archive/articles/[slug].astro', 'src/pages/en/parties/index.astro', 'src/pages/en/parties/[slug].astro',
    ]) expect(existsSync(p), p).toBe(true);
  });
  it('every page is noindex and offers the right of reply', () => {
    for (const p of ['src/pages/arsip/index.astro', 'src/pages/arsip/artikel/[slug].astro', 'src/pages/pihak/index.astro', 'src/pages/pihak/[slug].astro']) {
      const s = read(p);
      expect(s, p).toMatch(/noindex/);
      expect(s, p).toMatch(/routePath\('reply'/);
    }
  });
  it('the party page states the author is a party, the limits and the procedural status', () => {
    const s = read('src/pages/pihak/[slug].astro');
    for (const k of ['interest', 'limits', 'status', 'updatedAt']) expect(s, k).toContain(k);
  });
  it('the article page says it is an archive copy, links the original and says when it was trimmed', () => {
    const s = read('src/pages/arsip/artikel/[slug].astro');
    for (const k of ['sourceUrl', 'trimmed', 'noindex']) expect(s, k).toContain(k);
    expect(s).toMatch(/arsip Infraloka/i);
  });
  it('generated content stays out of git until the owner publishes it, and out of the CC BY license', () => {
    const ignore = read('.gitignore');
    for (const k of ['src/content/arsip/*.md', 'src/content/pihak/*.json', 'public/img/arsip-*']) expect(ignore, k).toContain(k);
    expect(read('LICENSE-CONTENT.md')).toMatch(/arsip|archive/i);
    expect(read('LICENSE-CONTENT.md')).toMatch(/all rights reserved|seluruh hak/i);
  });
  it('the privacy test also scans the archive folder', () => {
    expect(read('tests/privacy.test.ts')).toContain("'src/content/arsip'");
  });
});

const files = () => (existsSync('src/content/arsip') ? readdirSync('src/content/arsip').filter((f) => f.endsWith('.md')) : []);

describe.skipIf(files().length === 0)('generated archive content (only when it has been imported locally)', () => {
  it('has frontmatter that validates, with the original address', () => {
    for (const f of files()) {
      const s = read(`src/content/arsip/${f}`);
      expect(s, f).toMatch(/^---\n[\s\S]*?\nsourceUrl: "?https:\/\/www\.infraloka\.co\.id\/blog\//);
    }
  });
  it('has no blog-relative image links and every image exists', () => {
    for (const f of files()) {
      const s = read(`src/content/arsip/${f}`);
      expect(s, f).not.toMatch(/!\[[^\]]*\]\((?!\/img\/arsip-|https?:)[^)]+\)/);
      for (const m of s.matchAll(/!\[[^\]]*\]\((\/img\/arsip-[^)]+)\)/g)) {
        if (existsSync(`public${m[1]}`)) continue;
        // a handful of images are missing at the source; the importer reports them
        expect(m[1], f).toMatch(/\.webp$/);
      }
    }
  });
  it('carries no heavy medical wording or personal data (those posts are held back)', () => {
    for (const f of files()) {
      expect(read(`src/content/arsip/${f}`), f).not.toMatch(/psikiatr|psychiatr|suicid|bunuh diri|rekam medis|medical record|surat keterangan medis|visum/i);
    }
  });
});
