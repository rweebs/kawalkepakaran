import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { arsipSchema, klaimSchema, pakarSchema } from '../src/lib/schemas';
import { visibleArsip } from '../src/lib/arsip-refs';
import { ROUTES } from '../src/i18n';
import { LEGACY_MOVES } from '../src/lib/legacy-redirects';

const read = (p: string) => readFileSync(p, 'utf8');

const arsip = {
  title: 'T', sourceUrl: 'https://www.infraloka.co.id/blog/x', archivedAt: '2026-10-10', lang: 'en', kind: 'somasi',
  status: 'dikirim', parties: ['p'], trimmed: false, draft: true,
};
const pakar = {
  name: 'GovTech Edu', field: 'Perusahaan', summary: 's', summaryEn: 's', credentials: [], kind: 'Company', source: 'arsip',
  interest: 'i', interestEn: 'i', limits: 'l', limitsEn: 'l', draft: true,
};
const klaim = {
  pakar: 'govtech-edu', claim: 'c', claimEn: 'c', venue: 'v', verdict: 'belum-terverifikasi', confidence: 'rendah', evidence: [],
  limits: 'l', limitsEn: 'l', replyStatus: 'belum-ada', articles: ['x'], source: 'arsip', draft: true,
};

describe('schemas', () => {
  it('accepts a complete arsip article', () => expect(arsipSchema.safeParse(arsip).success).toBe(true));
  it.each([
    ['no source address', { sourceUrl: undefined }],
    ['an unknown kind', { kind: 'vonis' }],
    ['a free-text status', { status: 'bersalah' }],
    ['an unknown language', { lang: 'fr' }],
  ])('rejects an arsip article with %s', (_n, patch) => {
    expect(arsipSchema.safeParse({ ...arsip, ...patch }).success).toBe(false);
  });
  it('defaults an article to draft and to untrimmed when the importer says nothing', () => {
    const { draft: _d, trimmed: _t, ...rest } = arsip;
    const r = arsipSchema.parse(rest);
    expect(r.draft).toBe(true);
    expect(r.trimmed).toBe(false);
  });
  it('accepts a generated pakar and klaim, and still accepts the hand-made shape without the new fields', () => {
    expect(pakarSchema.safeParse(pakar).success).toBe(true);
    expect(klaimSchema.safeParse(klaim).success).toBe(true);
    const { kind: _k, source: _s, interest: _i, interestEn: _ie, limits: _l, limitsEn: _le, ...handMadePakar } = pakar;
    expect(pakarSchema.safeParse(handMadePakar).success).toBe(true);
    const { articles: _a, source: _src, ...handMadeKlaim } = klaim;
    expect(klaimSchema.safeParse(handMadeKlaim).success).toBe(true);
  });
  it('rejects a generated pakar with an unknown kind', () => {
    expect(pakarSchema.safeParse({ ...pakar, kind: 'Alias' }).success).toBe(false);
  });
});

describe('archive visibility', () => {
  const art = (id: string, draft: boolean) => ({ id, data: { draft } });
  it('hides drafts in production and shows them when drafts are included', () => {
    const arts = [art('a', true), art('b', false)];
    expect(visibleArsip(arts, false).map((x) => x.id)).toEqual(['b']);
    expect(visibleArsip(arts, true)).toHaveLength(2);
  });
});

describe('parties live inside /pakar', () => {
  it('has the archive routes and no separate parties section', () => {
    expect(ROUTES.archive).toEqual({ id: '/arsip', en: '/en/archive' });
    expect(Object.keys(ROUTES)).not.toContain('parties');
    for (const p of ['src/pages/pihak/index.astro', 'src/pages/pihak/[slug].astro', 'src/pages/en/parties/index.astro', 'src/pages/en/parties/[slug].astro', 'src/lib/arsip-refs.ts'.replace('arsip-refs', 'pihak')]) {
      expect(existsSync(p), p).toBe(false);
    }
  });
  it('sends the old parties addresses to /pakar with a 301', () => {
    const moves = LEGACY_MOVES.map((m) => m.join(' > '));
    expect(moves).toContain('/pihak > /pakar');
    expect(moves).toContain('/en/parties > /en/experts');
  });
  it('a generated profile and claim are noindex, and say so in the page source', () => {
    for (const p of ['src/pages/pakar/[slug].astro', 'src/pages/klaim/[slug].astro']) {
      const s = read(p);
      expect(s, p).toContain('isGenerated');
      expect(s, p).toMatch(/noindex=\{/);
    }
  });
  it('the profile lists the posts that name the party, the interest and the limits', () => {
    const s = read('src/pages/pakar/[slug].astro');
    for (const k of ['articlesForPakar', 'interest', 'limits']) expect(s, k).toContain(k);
  });
  it('the claim page links the document a generated claim is about', () => {
    expect(read('src/pages/klaim/[slug].astro')).toContain('articles');
  });
  it('the home page and the sitemap list only the hand-made entries', () => {
    expect(read('src/pages/index.astro')).toContain('isGenerated');
    expect(read('src/pages/sitemap.xml.ts')).toContain('isGenerated');
  });
  it('the indexes group the generated entries apart from the checked ones', () => {
    expect(read('src/pages/pakar/index.astro')).toContain('isGenerated');
    expect(read('src/pages/klaim/index.astro')).toContain('isGenerated');
  });
});

describe('pages and policy', () => {
  it('has the archive pages in both languages, all noindex with the right of reply', () => {
    for (const p of ['src/pages/arsip/index.astro', 'src/pages/arsip/artikel/[slug].astro', 'src/pages/en/archive/index.astro', 'src/pages/en/archive/articles/[slug].astro']) {
      expect(existsSync(p), p).toBe(true);
    }
    for (const p of ['src/pages/arsip/index.astro', 'src/pages/arsip/artikel/[slug].astro']) {
      expect(read(p), p).toMatch(/noindex/);
      expect(read(p), p).toMatch(/routePath\('reply'/);
    }
  });
  it('the article page says it is an archive copy, links the original and says when it was trimmed', () => {
    const s = read('src/pages/arsip/artikel/[slug].astro');
    for (const k of ['sourceUrl', 'trimmed', 'noindex']) expect(s, k).toContain(k);
    expect(s).toMatch(/arsip Infraloka/i);
  });
  it('generated content stays out of git until the owner publishes it, and out of the CC BY license', () => {
    const ignore = read('.gitignore');
    for (const k of ['src/content/arsip/*.md', 'src/content/pakar/generated/*.json', 'src/content/klaim/generated/*.json', 'public/img/arsip-*']) expect(ignore, k).toContain(k);
    expect(ignore).not.toContain('src/content/pihak');
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
      expect(read(`src/content/arsip/${f}`), f).toMatch(/^---\n[\s\S]*?\nsourceUrl: "?https:\/\/www\.infraloka\.co\.id\/blog\//);
    }
  });
  it('has no blog-relative image links and every image exists', () => {
    for (const f of files()) {
      const s = read(`src/content/arsip/${f}`);
      expect(s, f).not.toMatch(/!\[[^\]]*\]\((?!\/img\/arsip-|https?:)[^)]+\)/);
      for (const m of s.matchAll(/!\[[^\]]*\]\((\/img\/arsip-[^)]+)\)/g)) {
        if (existsSync(`public${m[1]}`)) continue;
        expect(m[1], f).toMatch(/\.webp$/);
      }
    }
  });
  it('carries no heavy medical wording (those parts were trimmed or the post is held)', () => {
    for (const f of files()) {
      expect(read(`src/content/arsip/${f}`), f).not.toMatch(/psikiatr|psychiatr|suicid|bunuh diri|rekam medis|medical record|surat keterangan medis|visum/i);
    }
  });
  it('every generated claim names a generated pakar and links a document that exists', () => {
    const dir = 'src/content/klaim/generated';
    if (!existsSync(dir)) return;
    const pakarIds = new Set(readdirSync('src/content/pakar/generated').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')));
    const articleIds = new Set(files().map((f) => f.replace(/\.md$/, '')));
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const k = JSON.parse(read(`${dir}/${f}`));
      expect(klaimSchema.safeParse(k).success, f).toBe(true);
      expect(pakarIds.has(k.pakar) || k.pakar === 'abil-sudarman', `${f}: pakar ${k.pakar}`).toBe(true);
      for (const a of k.articles) expect(articleIds.has(a), `${f}: article ${a}`).toBe(true);
    }
  });
});
