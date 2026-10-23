import type { APIRoute } from 'astro';
import { sitemapEntries } from '../lib/sitemap-entries';
import { getKlaim, getPakar, isGenerated } from '../lib/pakar';
import { getPosts, getPostsEn } from '../lib/content';
import { EVENTS, eventUrl } from '../lib/linimasa';
import { localizedEvents, eventPath } from '../lib/linimasa-locale';
import { ROUTES } from '../i18n';
import { llmsIndex, type LlmsPage } from '../lib/llms';
import { SITE } from '../lib/site';

const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** The index of every sitemap page with a readable label each: content titles where a page has one, else the page's own path. */
export const GET: APIRoute = async () => {
  const labels = new Map<string, string>();
  for (const p of await getPakar()) if (!isGenerated(p)) { labels.set(`/pakar/${p.id}`, p.data.name); labels.set(`/en/experts/${p.id}`, p.data.name); }
  for (const k of await getKlaim()) if (!isGenerated(k)) { labels.set(`/klaim/${k.id}`, k.data.claim); labels.set(`/en/claims/${k.id}`, k.data.claimEn); }
  for (const p of await getPosts()) labels.set(`/kasus/abil-sudarman/artikel/${p.id}`, p.data.title);
  for (const p of await getPostsEn()) labels.set(`/en/cases/abil-sudarman/articles/${p.id}`, p.data.title);
  for (const e of EVENTS) labels.set(eventUrl(e), e.title);
  for (const e of localizedEvents('en')) labels.set(eventPath(e, 'en'), e.title);
  for (const r of Object.values(ROUTES)) {
    labels.set(r.id, r.id === '/' ? SITE.name : titleCase(r.id.split('/').pop()!));
    labels.set(r.en, r.en === '/en' ? `${SITE.name} (English)` : titleCase(r.en.split('/').pop()!));
  }

  const pages: LlmsPage[] = (await sitemapEntries()).map((e) => ({
    path: e.path,
    group: e.group ?? 'pages',
    label: labels.get(e.path) ?? titleCase(e.path.split('/').pop() || SITE.name),
  }));
  return new Response(llmsIndex(pages, SITE), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
