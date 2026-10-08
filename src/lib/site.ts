export const SITE = {
  name: 'Kawal Kepakaran',
  description: 'Kawal terbuka atas klaim para pakar: kredensial, bukti, dan hak jawab.',
  url: 'https://kawalkepakaran.org',
  legacyUrl: 'https://abilsudarman.my.id',
  repo: 'https://github.com/rweebs/kawalkepakaran',
  author: 'Rahmat Wibowo',
  replyEmail: 'rahmat.wibowo21@gmail.com',
  correctionsEmail: 'rahmat.wibowo21@gmail.com',
  // Search Console token for the new domain; empty until the owner registers kawalkepakaran.org.
  googleVerification: '',
} as const;

export const DISCLAIMER =
  'Situs ini memuat pendapat dan catatan pribadi Rahmat Wibowo. Isinya bukan temuan kepolisian maupun putusan pengadilan, ' +
  'dan tidak menyatakan bahwa siapa pun yang disebut bersalah. Setiap orang berhak atas praduga tak bersalah dan hak jawab.';

export const CLASSIFICATION_LABEL = {
  'pendapat': 'Pendapat',
  'fakta-dengan-bukti': 'Fakta dengan bukti',
  'laporan-aduan': 'Laporan/aduan',
} as const;

// Date each static page's content last changed (used for sitemap lastmod; update when the text changes).
export const PAGE_LASTMOD = { '/hak-jawab': '2026-10-04', '/disclaimer': '2026-10-04', '/bukti': '2026-10-04', '/videos': '2026-10-04', '/buku': '2026-10-04', '/tiktok': '2026-10-05', '/pagespeed': '2026-10-05', '/tentang': '2026-10-05', '/linimasa': '2026-10-05', '/bowobharata': '2026-10-05' } as const;

export interface NavLink { href: string; label: string }
export type NavEntry = NavLink | { label: string; items: readonly NavLink[] };

// Grouped by what a visitor wants to do: read, check, follow the chronology, watch or download, learn about the project, reply.
export const NAV_GROUPS: readonly NavEntry[] = [
  { href: '/artikel', label: 'Artikel' },
  { href: '/bukti', label: 'Bukti' },
  { href: '/linimasa', label: 'Linimasa' },
  { label: 'Media', items: [
    { href: '/videos', label: 'Videos' },
    { href: '/tiktok', label: 'TikTok' },
    { href: '/buku', label: 'Buku' },
  ] },
  { label: 'Tentang', items: [
    { href: '/tentang', label: 'Tentang penggagas' },
    { href: '/bowobharata', label: 'Bowobharata' },
    { href: '/#kontribusi', label: 'Kontribusi' },
    { href: '/pagespeed', label: 'Hasil PageSpeed' },
    { href: '/disclaimer', label: 'Disclaimer' },
  ] },
  { href: '/hak-jawab', label: 'Hak jawab' },
];

/** Every link in the menu, flattened. */
export const NAV: readonly NavLink[] = NAV_GROUPS.flatMap((e) => ('items' in e ? e.items : [e]));

/** Exact match or a child path, so /artikel is active on /artikel/x but /buku is not active on /bukti. Anchors are never active. */
export function isActive(path: string, href: string): boolean {
  if (href.includes('#')) return false;
  return path === href || path.startsWith(`${href}/`);
}
