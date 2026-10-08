import type { Locale } from './index';
import { NAV_GROUPS, type NavEntry } from '../lib/site';
import { ROUTES } from './index';

// Strings shared by every page (chrome, labels). Page-specific copy lives next to the page.
export interface UiStrings {
  siteTagline: string;
  siteDescription: string;
  home: string;
  note: string;
  readMore: string;
  breadcrumbLabel: string;
  menu: string;
  language: string;
  disclaimer: string;
  footer: (author: string) => string;
  corrections: string;
  classification: Record<'pendapat' | 'fakta-dengan-bukti' | 'laporan-aduan', string>;
  ogImageAlt: string;
  nav: Record<string, string>;
  themeSong: { aria: string; label: string; playing: string; song: string; stop: string; openMusic: string; autoplayNote: string; manualNote: string };
  notFound: { title: string; back: string };
}

export const UI: Record<Locale, UiStrings> = {
  id: {
    siteTagline: 'Operasi Ababil',
    siteDescription: 'Kawal terbuka atas klaim Abil Sudarman: terjemahan artikel Rahmat Wibowo beserta bukti dan hak jawab.',
    home: 'Beranda',
    note: 'Catatan:',
    readMore: 'Selengkapnya',
    breadcrumbLabel: 'Jejak halaman',
    menu: 'Menu',
    language: 'Bahasa',
    disclaimer:
      'Situs ini memuat pendapat dan catatan pribadi Rahmat Wibowo. Isinya bukan temuan kepolisian maupun putusan pengadilan, ' +
      'dan tidak menyatakan bahwa siapa pun yang disebut bersalah. Setiap orang berhak atas praduga tak bersalah dan hak jawab.',
    footer: (author) => `Konten oleh ${author}. Bukan nasihat hukum.`,
    corrections: 'Permintaan koreksi',
    classification: { 'pendapat': 'Pendapat', 'fakta-dengan-bukti': 'Fakta dengan bukti', 'laporan-aduan': 'Laporan/aduan' },
    ogImageAlt: 'Operasi Ababil: kawanan burung ababil membawa batu di langit malam',
    nav: {},
    themeSong: {
      aria: 'Lagu tema', label: 'Lagu tema', playing: 'Memutar', song: 'Lagu', stop: 'Berhenti', openMusic: 'Buka di YouTube Music',
      autoplayNote: 'Pemutar YouTube (pihak ketiga) dimuat setelah sentuhan, klik, atau tombol pertama Anda di halaman ini, karena peramban memblokir suara otomatis. Lagu berulang dan berhenti saat Anda pindah halaman.',
      manualNote: 'Pemutar YouTube (pihak ketiga) baru dimuat setelah Anda menekan tombol. Lagu berulang otomatis dan berhenti saat Anda pindah halaman.',
    },
    notFound: { title: 'Halaman tidak ditemukan', back: 'Kembali ke beranda' },
  },
  en: {
    siteTagline: 'Operation Ababil',
    siteDescription: "An open fact-check of Abil Sudarman's claims: Rahmat Wibowo's articles, the evidence, and the right of reply.",
    home: 'Home',
    note: 'Note:',
    readMore: 'Read more',
    breadcrumbLabel: 'Breadcrumb',
    menu: 'Menu',
    language: 'Language',
    disclaimer:
      "This site contains Rahmat Wibowo's personal opinions and notes. Its contents are not police findings or court rulings, " +
      'and do not state that anyone mentioned is guilty. Everyone has the right to the presumption of innocence and the right of reply.',
    footer: (author) => `Content by ${author}. Not legal advice.`,
    corrections: 'Corrections',
    classification: { 'pendapat': 'Opinion', 'fakta-dengan-bukti': 'Fact with evidence', 'laporan-aduan': 'Report/complaint' },
    ogImageAlt: 'Operation Ababil: a flock of ababil birds carrying stones across the night sky',
    nav: {
      '/artikel': 'Articles', '/bukti': 'Evidence', '/linimasa': 'Timeline', Media: 'Media', '/videos': 'Videos', '/tiktok': 'TikTok',
      '/buku': 'Books', Tentang: 'About', '/tentang': 'About the author', '/bowobharata': 'Bowobharata', '/#kontribusi': 'Contribute',
      '/pagespeed': 'PageSpeed results', '/disclaimer': 'Disclaimer', '/hak-jawab': 'Right of reply',
    },
    themeSong: {
      aria: 'Theme song', label: 'Theme song', playing: 'Playing', song: 'Song', stop: 'Stop', openMusic: 'Open in YouTube Music',
      autoplayNote: 'The YouTube player (third party) loads after your first touch, click or key press on this page, because browsers block autoplay with sound. The song loops and stops when you leave the page.',
      manualNote: 'The YouTube player (third party) only loads after you press the button. The song loops automatically and stops when you leave the page.',
    },
    notFound: { title: 'Page not found', back: 'Back to home' },
  },
};

/** URL for a menu href in the given language ('/artikel' -> '/en/articles'). */
export function localizeHref(href: string, locale: Locale): string {
  if (locale === 'id') return href;
  const [path, hash] = href.split('#');
  const route = Object.values(ROUTES).find((r) => r.id === (path === '' ? '/' : path));
  const out = route ? route.en : path;
  return hash ? `${out}#${hash}` : out;
}

export interface LocalizedNavLink { href: string; label: string }
export type LocalizedNavEntry = LocalizedNavLink | { label: string; items: readonly LocalizedNavLink[] };

/** The site menu with labels and URLs in the given language. */
export function navFor(locale: Locale): readonly LocalizedNavEntry[] {
  const label = (key: string, fallback: string) => (locale === 'id' ? fallback : UI.en.nav[key] ?? fallback);
  return NAV_GROUPS.map((e: NavEntry): LocalizedNavEntry =>
    'items' in e
      ? { label: label(e.label, e.label), items: e.items.map((i) => ({ href: localizeHref(i.href, locale), label: label(i.href, i.label) })) }
      : { href: localizeHref(e.href, locale), label: label(e.href, e.label) });
}
