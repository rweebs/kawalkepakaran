import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSitemap, mergeSnapshot } from '../scripts/sitemap-watch-lib.mjs';
import { snapshot, jakartaDay, fetchSitemap, readCapped, waybackTargets, submitWayback, USER_AGENT } from '../scripts/snapshot-sitemap.mjs';
import {
  toRows, idDateOf, jakartaDayOf, groupOf, filterRows, monthly, cumulative, daily, rowsOnDay, snapshotSeries, latestChange, toCsv,
  countByGroup, DEFAULT_FILTERS, snapshotAgeDays, type WatchStore,
} from '../src/lib/sitemap-watch';
import { NAV } from '../src/lib/site';
import { ROUTES } from '../src/i18n';

const O = 'https://rahmatwibowo.net';
const url = (p: string, lastmod?: string, imgs = 0) =>
  `<url><loc>${O}${p}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}${'<image:image><image:loc>x</image:loc></image:image>'.repeat(imgs)}</url>`;
const xml = (...u: string[]) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${u.join('')}</urlset>`;

describe('parseSitemap', () => {
  it('strips the origin, keeps lastmod, counts images and drops duplicate locs', () => {
    const out = parseSitemap(xml(url('/', '2026-11-11T14:41:22+07:00', 1), url('/evidence/ev-20260607-007-a/', undefined, 2), url('/evidence/ev-20260607-007-a/')));
    expect(out).toEqual([
      { path: '/', lastmod: '2026-11-11T14:41:22+07:00', images: 1 },
      { path: '/evidence/ev-20260607-007-a/', lastmod: null, images: 2 },
    ]);
  });
  it('refuses a sitemap index or an empty urlset, so a bad response is never recorded as every page removed', () => {
    expect(() => parseSitemap('<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>')).toThrow(/index/);
    expect(() => parseSitemap(xml())).toThrow(/no <url>/);
    expect(() => parseSitemap('<html>blocked</html>')).toThrow();
  });
});

describe('mergeSnapshot', () => {
  const e = (path: string, lastmod: string | null = null) => ({ path, lastmod, images: 0 });
  it('keeps firstSeen, moves lastSeen, and summarises sections per snapshot', () => {
    const a = mergeSnapshot(null, [e('/'), e('/targets/x/'), e('/evidence/ev-20260101-001/')], '2026-11-13');
    const b = mergeSnapshot(a, [e('/'), e('/evidence/ev-20260101-001/'), e('/evidence/ev-20261114-001/')], '2026-11-14');
    expect(b.urls['/'].firstSeen).toBe('2026-11-13');
    expect(b.urls['/'].lastSeen).toBe('2026-11-14');
    expect(b.urls['/targets/x/'].lastSeen).toBe('2026-11-13');
    expect(b.urls['/evidence/ev-20261114-001/'].firstSeen).toBe('2026-11-14');
    expect(b.snapshots).toEqual([
      { date: '2026-11-13', total: 3, images: 0, sections: { '(root)': 1, evidence: 1, targets: 1 } },
      { date: '2026-11-14', total: 3, images: 0, sections: { '(root)': 1, evidence: 2 } },
    ]);
  });
  it('replaces a same-day snapshot instead of adding a second point', () => {
    const a = mergeSnapshot(null, [e('/')], '2026-11-13');
    const b = mergeSnapshot(a, [e('/'), e('/faq/')], '2026-11-13');
    expect(b.snapshots).toHaveLength(1);
    expect(b.snapshots[0].total).toBe(2);
  });
});

// A Response whose url is set, as fetch() gives after following redirects.
const respond = (body: string, init: ResponseInit = {}, finalUrl = `${O}/sitemap.xml`) => {
  const r = new Response(body, init);
  Object.defineProperty(r, 'url', { value: finalUrl });
  return r;
};
const fetchOf = (r: () => Response) => (async () => r()) as unknown as typeof fetch;

describe('snapshot script', () => {
  it('writes the merged store, the gzipped raw sitemap and its provenance, dated in Jakarta time', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-'));
    const store = join(dir, 'w.json');
    const archiveDir = join(dir, 'archive');
    const body = xml(url('/a/'));
    const { snapshot: s } = await snapshot({ store, archiveDir, fetchImpl: fetchOf(() => respond(body)), now: new Date('2026-11-12T18:30:00Z') });
    expect(s.date).toBe('2026-11-13');
    const saved = JSON.parse(readFileSync(store, 'utf8'));
    expect(saved.urls['/a/'].firstSeen).toBe('2026-11-13');
    const sha = createHash('sha256').update(body).digest('hex');
    expect(saved.snapshots[0].provenance).toEqual({ fetchedAt: '2026-11-12T18:30:00.000Z', status: 200, finalUrl: `${O}/sitemap.xml`, bytes: Buffer.byteLength(body), sha256: sha });
    // The archived copy re-hashes to the recorded digest, and is byte-identical on a re-run (deterministic gzip).
    const gz = readFileSync(join(archiveDir, '2026-11-13.xml.gz'));
    expect(createHash('sha256').update(gunzipSync(gz)).digest('hex')).toBe(sha);
    await snapshot({ store, archiveDir, fetchImpl: fetchOf(() => respond(body)), now: new Date('2026-11-12T19:00:00Z') });
    expect(readFileSync(join(archiveDir, '2026-11-13.xml.gz')).equals(gz)).toBe(true);
  });
  it('throws on an HTTP error and leaves the stored file and archive untouched', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-'));
    const store = join(dir, 'w.json');
    writeFileSync(store, '{"keep":true}');
    await expect(snapshot({ store, archiveDir: join(dir, 'a'), fetchImpl: fetchOf(() => respond('no', { status: 503 })) })).rejects.toThrow(/503/);
    expect(readFileSync(store, 'utf8')).toBe('{"keep":true}');
    expect(existsSync(join(dir, 'a'))).toBe(false);
  });
  it('refuses a redirect off rahmatwibowo.net', async () => {
    await expect(fetchSitemap({ fetchImpl: fetchOf(() => respond(xml(url('/a/')), {}, 'https://elsewhere.example/sitemap.xml')) })).rejects.toThrow(/redirected off rahmatwibowo\.net to elsewhere\.example/);
  });
  it('aborts a body over the size cap, declared or streamed', async () => {
    await expect(readCapped(respond('x'.repeat(10), { headers: { 'content-length': '999' } }), 100)).rejects.toThrow(/over the 100-byte cap/);
    await expect(readCapped(respond('x'.repeat(101)), 100)).rejects.toThrow(/passed the 100-byte cap/);
    expect((await readCapped(respond('x'.repeat(100)), 100)).length).toBe(100);
  });
  it('fetches with a plain browser user agent that does not name the project', async () => {
    let ua = '';
    const fetchImpl = (async (_u: string, init: RequestInit) => { ua = (init.headers as Record<string, string>)['user-agent']; return respond(xml(url('/a/'))); }) as unknown as typeof fetch;
    await fetchSitemap({ fetchImpl });
    expect(ua).toBe(USER_AGENT);
    expect(ua).toMatch(/^Mozilla\/5\.0/);
    expect(ua.toLowerCase()).not.toMatch(/kawal|kepakaran|watch|bot/);
  });
  it('sends only the sitemap to the Wayback Machine at the baseline, then the sitemap plus newly listed URLs, capped', () => {
    const one = mergeSnapshot(null, [{ path: '/a/', lastmod: null, images: 0 }], '2026-11-13');
    expect(waybackTargets(one, '2026-11-13')).toEqual([`${O}/sitemap.xml`]);
    const two = mergeSnapshot(one, ['/a/', '/b/', '/c/', '/d/'].map((path) => ({ path, lastmod: null, images: 0 })), '2026-11-14');
    expect(waybackTargets(two, '2026-11-14')).toEqual([`${O}/sitemap.xml`, `${O}/b/`, `${O}/c/`, `${O}/d/`]);
    expect(waybackTargets(two, '2026-11-14', 2)).toHaveLength(2);
  });
  it('submits to Save Page Now politely and records failures without throwing', async () => {
    const calls: string[] = [];
    const pauses: number[] = [];
    const fetchImpl = (async (u: string) => { calls.push(u); if (u.endsWith('/b/')) throw new Error('timeout'); return new Response('', { status: 302 }); }) as unknown as typeof fetch;
    const out = await submitWayback([`${O}/a/`, `${O}/b/`], { fetchImpl, pause: 15, sleep: async (s: number) => { pauses.push(s); } });
    expect(calls).toEqual([`https://web.archive.org/save/${O}/a/`, `https://web.archive.org/save/${O}/b/`]);
    expect(pauses).toEqual([15]);
    expect(out).toEqual([{ url: `${O}/a/`, status: 302 }, { url: `${O}/b/`, error: 'timeout' }]);
  });
  it('rolls the day over at midnight Jakarta time', () => {
    expect(jakartaDay(new Date('2026-11-12T16:59:59Z'))).toBe('2026-11-12');
    expect(jakartaDay(new Date('2026-11-12T17:00:00Z'))).toBe('2026-11-13');
  });
});

const STORE: WatchStore = {
  source: `${O}/sitemap.xml`,
  snapshots: [
    { date: '2026-11-12', total: 3, images: 0, sections: { evidence: 2, targets: 1 } },
    { date: '2026-11-13', total: 4, images: 3, sections: { evidence: 2, targets: 1, documents: 1 } },
  ],
  urls: {
    '/evidence/ev-20230901-001-old/': { firstSeen: '2026-11-12', lastSeen: '2026-11-13', lastmod: '2026-10-17T02:42:17+00:00', images: 1 },
    '/evidence/ev-20261105-002-abil-somasi/': { firstSeen: '2026-11-12', lastSeen: '2026-11-13', lastmod: '2026-11-12T20:00:00+07:00', images: 2 },
    '/targets/someone/': { firstSeen: '2026-11-12', lastSeen: '2026-11-12', lastmod: '2026-11-12T16:47:01+07:00', images: 0 },
    '/documents/doc-20261112-001/': { firstSeen: '2026-11-13', lastSeen: '2026-11-13', lastmod: '2026-11-12T17:30:00+00:00', images: 0 },
  },
};

describe('sitemap-watch rows', () => {
  const rows = toRows(STORE);
  const by = (p: string) => rows.find((r) => r.path === p)!;
  it('reads the slug date, rejecting impossible ones', () => {
    expect(idDateOf('/evidence/ev-20260607-007-x/')).toBe('2026-06-07');
    expect(idDateOf('/media/media-20231031-001-y/')).toBe('2023-10-31');
    expect(idDateOf('/evidence/ev-20260231-001/')).toBeNull();
    expect(idDateOf('/targets/abc/')).toBeNull();
  });
  it('turns +00:00 and +07:00 stamps into the same Jakarta day', () => {
    expect(jakartaDayOf('2026-11-12T17:30:00+00:00')).toBe('2026-11-13');
    expect(jakartaDayOf('2026-11-13T00:30:00+07:00')).toBe('2026-11-13');
    expect(jakartaDayOf(null)).toBeNull();
  });
  it('groups sections and marks paths missing from the newest snapshot as removed', () => {
    expect(groupOf('modus-operandi')).toBe('other');
    expect(by('/targets/someone/').removed).toBe(true);
    expect(by('/documents/doc-20261112-001/').lastmod).toBe('2026-11-13');
    expect(countByGroup(rows)).toEqual({ targets: 1, evidence: 2, documents: 1, other: 0 });
  });
  it('filters by group, status, words in the slug and a date range on the chosen basis', () => {
    expect(filterRows(rows, { ...DEFAULT_FILTERS, groups: ['evidence'] })).toHaveLength(2);
    expect(filterRows(rows, { ...DEFAULT_FILTERS, status: 'removed' }).map((r) => r.path)).toEqual(['/targets/someone/']);
    expect(filterRows(rows, { ...DEFAULT_FILTERS, q: 'abil somasi' })).toHaveLength(1);
    // A range on the slug date drops undated targets; on lastmod it keeps them.
    expect(filterRows(rows, { ...DEFAULT_FILTERS, from: '2026-11-01', to: '2026-11-30' })).toHaveLength(2);
    expect(filterRows(rows, { ...DEFAULT_FILTERS, basis: 'lastmod', from: '2026-11-12', to: '2026-11-12' }).map((r) => r.path)).toEqual(['/evidence/ev-20261105-002-abil-somasi/', '/targets/someone/']);
  });
  it('folds items older than the window into one leading bucket', () => {
    const m = monthly(rows, 3);
    expect(m.map((b) => [b.key, b.earlier])).toEqual([['2026-09', true], ['2026-09', false], ['2026-10', false], ['2026-11', false]]);
    expect(m[0].counts.evidence).toBe(1);
    expect(m.at(-1)!.counts).toEqual({ targets: 0, evidence: 1, documents: 1, other: 0 });
  });
  it('builds a running total, edit activity per day and per-snapshot totals', () => {
    expect(cumulative(rows).map((p) => p.total)).toEqual([1, 2, 3]);
    const days = daily(rows, '2026-11-13', 3);
    expect(days.map((d) => d.date)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13']);
    expect(days[1].counts).toEqual({ targets: 1, evidence: 1, documents: 0, other: 0 });
    expect(daily(rows, '2026-11-13', 3, 'id').map((d) => d.counts.evidence + d.counts.documents)).toEqual([0, 1, 0]);
    // The first snapshot is the baseline, not growth: only the document first listed on 13 Nov counts.
    expect(daily(rows, '2026-11-13', 3, 'firstSeen', '2026-11-12').map((d) => d.counts.documents)).toEqual([0, 0, 1]);
    expect(rowsOnDay(rows, '2026-11-12', 'lastmod').map((r) => r.path)).toEqual(['/evidence/ev-20261105-002-abil-somasi/', '/targets/someone/']);
    expect(snapshotSeries(STORE.snapshots, ['evidence', 'documents']).map((s) => s.total)).toEqual([2, 3]);
    expect(latestChange(rows, STORE.snapshots)).toEqual({ added: 1, removed: 1 });
    expect(latestChange(rows, STORE.snapshots.slice(0, 1))).toBeNull();
  });
  it('counts snapshot age in whole days, never negative', () => {
    expect(snapshotAgeDays('2026-11-13', '2026-11-13')).toBe(0);
    expect(snapshotAgeDays('2026-11-13', '2026-11-21')).toBe(8);
    expect(snapshotAgeDays('2026-11-13', '2026-11-12')).toBe(0);
  });
  it('neutralises spreadsheet formulas in CSV cells', () => {
    const r = { ...by('/targets/someone/') };
    const line = (path: string, section: string) => toCsv([{ ...r, path, section }]).split('\n')[1];
    expect(line('/x/', '=HYPERLINK("http://e")')).toBe(`${O}/x/,"'=HYPERLINK(""http://e"")",,2026-11-12,2026-11-12,removed,0`);
    for (const c of ['+1', '-1', '@SUM(A1)', '\tx']) expect(line('/x/', c).split(',')[1]).toBe(`'${c}`);
  });
  it('exports CSV with full URLs and quotes fields that need it', () => {
    const csv = toCsv([{ ...by('/targets/someone/'), path: '/a,b/' }]).split('\n');
    expect(csv[0]).toBe('url,section,slug_date,lastmod_day,first_seen,status,images');
    expect(csv[1]).toBe(`"${O}/a,b/",targets,,2026-11-12,2026-11-12,removed,0`);
  });
});

describe('monitor page wiring', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  it('is in the menu, routed in both languages, and rebuilt before every build', () => {
    expect(NAV.map((n) => n.href)).toContain('/pantau');
    expect(ROUTES.monitor).toEqual({ id: '/pantau', en: '/en/monitor' });
    expect(read('src/pages/en/monitor.astro')).toContain("import Page from '../pantau.astro'");
    expect(JSON.parse(read('package.json')).scripts.build).toMatch(/make-redirects\.mjs && node scripts\/snapshot-sitemap\.mjs/);
  });
  it('links to the watched site only with nofollow, and only for URLs still listed', () => {
    const c = read('src/components/SitemapDashboard.tsx');
    // Every link to the watched site sits in the "still listed" branch of a removed check and carries nofollow.
    const links = [...c.matchAll(/r\.removed\s*\?[^:]*:\s*<a href=\{`\$\{WATCH_ORIGIN\}\$\{r\.path\}`\} rel="nofollow ugc noopener noreferrer"/g)];
    expect(links.length).toBeGreaterThan(0);
    expect(links).toHaveLength(c.match(/href=\{`\$\{WATCH_ORIGIN\}/g)!.length);
    expect(read('src/pages/pantau.astro')).toContain('rel="nofollow ugc noopener noreferrer"');
  });
  it('ships a recorded store whose latest snapshot has provenance matching its archived raw sitemap', () => {
    const s = JSON.parse(read('src/data/sitemap-watch.json')) as WatchStore;
    expect(s.snapshots.length).toBeGreaterThan(0);
    const latest = s.snapshots.at(-1)!;
    expect(Object.values(s.urls).filter((u) => u.lastSeen === latest.date)).toHaveLength(latest.total);
    expect(latest.provenance?.sha256).toMatch(/^[0-9a-f]{64}$/);
    const raw = gunzipSync(readFileSync(`source/sitemap-watch/${latest.date}.xml.gz`));
    expect(raw.length).toBe(latest.provenance!.bytes);
    expect(createHash('sha256').update(raw).digest('hex')).toBe(latest.provenance!.sha256);
  });
  it('shows snapshot age, the hash and a stale warning on the page, and checks freshness in the monitor', () => {
    const page = read('src/pages/pantau.astro');
    expect(page).toContain('snapshotAgeDays(latest, buildDay)');
    expect(page).toMatch(/age > STALE_DAYS && <aside class="notice"/);
    expect(page).toContain('sha.slice(0, 12)');
    const mon = read('.github/workflows/monitor.yml');
    expect(mon).toContain('watch-data:');
    expect(mon).toContain('if (age > 14)');
  });
});
