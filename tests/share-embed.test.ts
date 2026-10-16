import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { BADGE_HEIGHT, VERDICT_COLOR, badgePath, embedSnippet, verdictBadge } from '../src/lib/badge';
import { pakarFeedChannel, pakarFeedItems, pakarFeedPath } from '../src/lib/pakar-feed';
import { ISSUE_FORM_URL, ISSUE_TEMPLATE, issueUrl, mailtoUrl } from '../src/lib/suggest';
import { buildRss } from '../src/lib/feed';
import { timelineOg } from '../src/lib/og';
import { EVENTS } from '../src/lib/linimasa';
import { EVENTS_EN } from '../src/lib/linimasa-en';
import { ROUTES, alternatesForPath } from '../src/i18n';
import { PAGE_LASTMOD, SITE } from '../src/lib/site';
// @ts-ignore plain JS module
import { allCards, DISCLAIMER, escapeXml } from '../scripts/og-lib.mjs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('verdict badge', () => {
  it('uses the verdict colours from the stylesheet', () => {
    const css = read('src/styles/global.css');
    const vars: Record<string, string> = { 'dikonfirmasi': 'confirmed', 'sebagian': 'partly', 'tidak-terbukti': 'unsupported', 'belum-terverifikasi': 'unverified' };
    for (const [v, name] of Object.entries(vars)) expect(css).toContain(`--verdict-${name}: ${VERDICT_COLOR[v as keyof typeof VERDICT_COLOR]};`);
  });
  it('shows the site name and the verdict label, sized to its content', () => {
    const b = verdictBadge('tidak-terbukti', 'id');
    expect(b.svg).toContain('Kawal Kepakaran');
    expect(b.svg).toContain('Tidak terbukti');
    expect(b.svg).toContain(`width="${b.width}" height="${BADGE_HEIGHT}"`);
    expect(b.svg).toContain(VERDICT_COLOR['tidak-terbukti']);
    expect(b.svg).not.toMatch(/<script|<image|href=/);
    expect(verdictBadge('belum-terverifikasi', 'en').width).toBeGreaterThan(verdictBadge('sebagian', 'en').width);
  });
  it('lives under the claim page in each language', () => {
    expect(badgePath('x', 'id')).toBe('/klaim/x/badge.svg');
    expect(badgePath('x', 'en')).toBe('/en/claims/x/badge.svg');
  });
  it('builds an escaped embed snippet that links back with embed UTM tags', () => {
    const s = embedSnippet({ claimUrl: 'https://kawalkepakaran.org/klaim/x', badgeUrl: 'https://kawalkepakaran.org/klaim/x/badge.svg', alt: 'Sebagian: "a" <b> — Kawal Kepakaran', width: 200, height: 20 });
    expect(s).toBe('<a href="https://kawalkepakaran.org/klaim/x?utm_source=embed&amp;utm_medium=badge"><img src="https://kawalkepakaran.org/klaim/x/badge.svg" alt="Sebagian: &quot;a&quot; &lt;b&gt; — Kawal Kepakaran" width="200" height="20"></a>');
  });
  it('is generated only for hand-made claims', () => {
    expect(read('src/lib/badge-route.ts')).toContain('!isGenerated(k)');
    expect(existsSync('src/pages/klaim/[slug]/badge.svg.ts')).toBe(true);
    expect(existsSync('src/pages/en/claims/[slug]/badge.svg.ts')).toBe(true);
  });
  it('has an embed box on the claim page, only for hand-made claims', () => {
    const page = read('src/pages/klaim/[slug].astro');
    const at = page.indexOf('<EmbedBadge');
    expect(at).toBeGreaterThan(page.indexOf('{!generated && ('));
    const box = read('src/components/EmbedBadge.astro');
    expect(box).toMatch(/<textarea[^>]*readonly/);
    expect(box).toMatch(/<button[^>]*hidden/);
    expect(box).toContain("import '../scripts/copy-field'");
    expect(box).not.toMatch(/\son[a-z]+=/);
  });
});

describe('per-expert feed', () => {
  const claim = {
    id: 'c1', claim: 'Klaim', claimEn: 'Claim', verdict: 'sebagian' as const, evidence: ['a', 'b'], replyStatus: 'diterima' as const,
    limits: 'Batas.', limitsEn: 'Limits.', reviewedAt: new Date('2026-10-01T00:00:00Z'), reply: { receivedAt: new Date('2026-10-05T00:00:00Z') },
  };
  it('has a path under the profile in each language', () => {
    expect(pakarFeedPath('p', 'id')).toBe('/pakar/p/rss.xml');
    expect(pakarFeedPath('p', 'en')).toBe('/en/experts/p/rss.xml');
  });
  it('lists the claim checks and a dated item per reply received', () => {
    const items = pakarFeedItems('Nama', [claim, { ...claim, id: 'c2', reply: undefined, replyStatus: 'belum-ada' }], 'id', 'https://x.org', new Date());
    expect(items.map((i) => i.path)).toEqual(['/klaim/c1', '/klaim/c1#tanggapan', '/klaim/c2']);
    expect(items[0].title).toBe('Nama: Sebagian — Klaim');
    expect(items[0].image?.src).toBe('/og/klaim/c1-id.jpg');
    expect(items[1].date.toISOString().slice(0, 10)).toBe('2026-10-05');
    const en = pakarFeedItems('Name', [claim], 'en', 'https://x.org', new Date());
    expect(en[0].path).toBe('/en/claims/c1');
    expect(en[0].title).toBe('Name: Partly — Claim');
    expect(en[1].title).toBe('Name: Reply received — Claim');
  });
  it('builds a valid channel pointing at itself', () => {
    const xml = buildRss(pakarFeedItems('Nama', [claim], 'en', 'https://x.org', new Date()), { url: 'https://x.org', ...pakarFeedChannel('Nama', 'en') }, pakarFeedPath('p', 'en'), 'en');
    expect(xml).toContain('<atom:link href="https://x.org/en/experts/p/rss.xml" rel="self"');
    expect(xml).toContain('<title>Nama · Kawal Kepakaran</title>');
  });
  it('skips generated experts and claims, and is linked from the profile', () => {
    const route = read('src/lib/pakar-feed-route.ts');
    expect(route).toContain('!isGenerated(p)');
    expect(route).toContain('!isGenerated(k)');
    const page = read('src/pages/pakar/[slug].astro');
    expect(page).toContain("follow: 'Ikuti pakar ini (RSS)'");
    expect(page).toContain("follow: 'Follow this expert (RSS)'");
    expect(page).toMatch(/feeds = generated \? \[\]/);
    expect(read('src/layouts/BaseLayout.astro')).toMatch(/feeds\.map\(\(f\) => <link rel="alternate" type="application\/rss\+xml"/);
  });
});

describe('share bar', () => {
  const bar = read('src/components/ShareBar.astro');
  it('tags every network, the native sheet and the copied link with UTM parameters', () => {
    for (const net of ['whatsapp', 'x', 'threads', 'telegram', 'native', 'copy']) expect(bar).toContain(`tagged('${net}')`);
    expect(bar).toContain("'utm_medium', 'share'");
    expect(bar).toContain("'utm_campaign'");
  });
  it('offers X, Threads and a copy button that only appears with JavaScript', () => {
    expect(bar).toContain("['X', ");
    expect(bar).toContain("['Threads', ");
    expect(bar).toMatch(/<button[^>]*hidden[^>]*data-share-copy/);
  });
  it('appears on hand-made expert profiles only', () => {
    const page = read('src/pages/pakar/[slug].astro');
    expect(page).toMatch(/\{!generated && \(\s*<>\s*<ShareBar/);
  });
});

describe('suggest a claim', () => {
  const s = { pakar: 'Nama Pakar', claim: 'Klaim "x"', venueUrl: 'https://a.example/post', evidence: 'https://b.example\nhttps://c.example', email: 'me@example.org' };
  it('is a route pair with a lastmod date', () => {
    expect(ROUTES.suggest).toEqual({ id: '/usulkan', en: '/en/suggest' });
    expect(alternatesForPath('/en/suggest')).toEqual({ id: '/usulkan', en: '/en/suggest' });
    expect(PAGE_LASTMOD['/usulkan']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('prefills the repo issue form by its template name and field ids, leaving the email out', () => {
    const yml = read(`.github/ISSUE_TEMPLATE/${ISSUE_TEMPLATE}`);
    const u = new URL(issueUrl(s, 'id'));
    expect(`${u.origin}${u.pathname}`).toBe(`${SITE.repo}/issues/new`);
    expect(u.searchParams.get('template')).toBe('submit-claim.yml');
    for (const field of ['pakar', 'claim', 'evidence']) {
      expect(yml).toContain(`id: ${field}\n`);
      expect(u.searchParams.get(field)).toBeTruthy();
    }
    expect(u.searchParams.get('claim')).toContain('https://a.example/post');
    expect(u.toString()).not.toContain('example.org');
    expect(ISSUE_FORM_URL).toBe(`${SITE.repo}/issues/new?template=submit-claim.yml`);
  });
  it('builds a mailto to the corrections address, empty as a template and filled from the form', () => {
    const blank = mailtoUrl(undefined, 'en');
    expect(blank.startsWith(`mailto:${SITE.correctionsEmail}?subject=`)).toBe(true);
    expect(decodeURIComponent(blank)).toContain('right of reply');
    expect(decodeURIComponent(mailtoUrl(s, 'id'))).toContain('me@example.org');
  });
  it('posts nothing to the site and has no inline handlers', () => {
    const page = read('src/pages/usulkan.astro');
    expect(page).not.toMatch(/<form[^>]*action=/);
    expect(page).not.toMatch(/\son[a-z]+=/);
    expect(page).toMatch(/data-target="github" hidden disabled/);
    expect(page).toContain("import '../scripts/suggest-form'");
    expect(page).toContain('berhak menjawab');
    expect(page).toContain('right of reply');
  });
  it('is linked from the home contribution area and the claims hub', () => {
    expect(read('src/pages/index.astro')).toContain("href={routePath('suggest', locale)}");
    expect(read('src/pages/klaim/index.astro')).toContain("routePath('suggest', locale)");
  });
});

describe('timeline cards', () => {
  const ev = EVENTS.flatMap((e) => [
    { idSlug: e.slug, slug: e.slug, locale: 'id', title: e.title, date: e.date, channel: e.channel },
    { idSlug: e.slug, slug: EVENTS_EN[e.slug].slug, locale: 'en', title: EVENTS_EN[e.slug].title, date: e.date, channel: 'LinkedIn' },
  ]);
  const byFile = new Map((allCards('src/content', ev) as { file: string; svg: string }[]).map((c) => [`/${c.file}`, c.svg]));
  it('has a card per timeline entry in both languages, with the disclaimer and the page URL', () => {
    for (const e of EVENTS) {
      for (const l of ['id', 'en'] as const) {
        const svg = byFile.get(timelineOg(e.slug, l, '').src);
        expect(svg, `${e.slug} ${l}`).toBeDefined();
        expect(svg).toContain(escapeXml(DISCLAIMER[l]));
        expect(svg).toContain(l === 'id' ? `kawalkepakaran.org/kasus/abil-sudarman/linimasa/${e.slug}` : `kawalkepakaran.org/en/cases/abil-sudarman/timeline/${EVENTS_EN[e.slug].slug}`);
      }
    }
  });
  it('is used by the timeline entry page and rendered by make-og', () => {
    expect(read('src/pages/kasus/abil-sudarman/linimasa/[slug].astro')).toContain('image={timelineOg(idSlug, locale, event.title)}');
    expect(read('scripts/make-og.mjs')).toContain("allCards('src/content', timeline)");
  });
});
