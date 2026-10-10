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
export const PAGE_LASTMOD = { '/pakar': '2026-10-09', '/klaim': '2026-10-09', '/metode': '2026-10-09', '/kasus/abil-sudarman': '2026-10-09', '/hak-jawab': '2026-10-04', '/disclaimer': '2026-10-04', '/kasus/abil-sudarman/bukti': '2026-10-04', '/videos': '2026-10-04', '/buku': '2026-10-04', '/tiktok': '2026-10-05', '/tentang': '2026-10-05', '/manifesto': '2026-10-09', '/kasus/abil-sudarman/linimasa': '2026-10-05', '/kasus/abil-sudarman/linimasa-abil': '2026-10-09', '/kasus/abil-sudarman/bowobharata': '2026-10-05' } as const;

export interface NavLink { href: string; label: string }
export type NavEntry = NavLink | { label: string; items: readonly NavLink[] };

// Grouped by what a visitor wants to do: find an expert, check a claim, learn the method, read a case, watch or download, learn about the project, reply.
export const NAV_GROUPS: readonly NavEntry[] = [
  { href: '/pakar', label: 'Pakar' },
  { href: '/klaim', label: 'Cek klaim' },
  { href: '/metode', label: 'Metode' },
  { label: 'Kasus', items: [
    { href: '/kasus/abil-sudarman/artikel', label: 'Artikel' },
    { href: '/kasus/abil-sudarman/bukti', label: 'Bukti' },
    { href: '/kasus/abil-sudarman/linimasa', label: 'Linimasa' },
    { href: '/kasus/abil-sudarman/linimasa-abil', label: 'Linimasa Abil' },
    { href: '/arsip', label: 'Arsip Perkara' },
    { href: '/kasus/abil-sudarman/bowobharata', label: 'Bowobharata' },
  ] },
  { label: 'Media', items: [
    { href: '/videos', label: 'Videos' },
    { href: '/tiktok', label: 'TikTok' },
    { href: '/buku', label: 'Buku' },
  ] },
  { label: 'Tentang', items: [
    { href: '/tentang', label: 'Tentang penggagas' },
    { href: '/manifesto', label: 'Manifesto' },
    { href: '/#kontribusi', label: 'Kontribusi' },
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
