// Klaim yang diperiksa, diringkas untuk beranda. Setiap butir menaut ke entri di src/content/bukti.
// Ditulis sebagai klaim dan status pemeriksaan, bukan putusan.
export interface Allegation {
  id: string;
  label: string;
  claim: string;
  status: string;
  evidence: string[];
}

export const ALLEGATIONS: Allegation[] = [
  {
    id: 'gelar-university-of-london',
    label: 'gelar University of London',
    claim: 'Gelar Computer Science dari University of London.',
    status: 'Bio Stimson Center hanya menulis “studied”, dan LinkedIn mencantumkan program tanpa tahun. Belum ada konfirmasi kelulusan; permintaan verifikasi ke universitas sudah dikirim.',
    evidence: ['02-linkedin-pendidikan', '03-stimson', '10-email-verifikasi', '11-linkedin-tanpa-hasil'],
  },
  {
    id: 'pendidikan-binus',
    label: 'riwayat pendidikan di Indonesia',
    claim: 'Riwayat pendidikan tinggi di Indonesia.',
    status: 'Biodata PDDikti mencatat Universitas Bina Nusantara (PJJ Manajemen, masuk 2019) dengan status terakhir mengajukan pengunduran diri. Ini tidak menyangkut pendidikan di tempat lain.',
    evidence: ['01-pddikti'],
  },
  {
    id: 'jabatan-korika-unesco',
    label: 'jabatan di KORIKA dan UNESCO',
    claim: 'Executive Director KORIKA dan Project Manager UNESCO AI Readiness Assessment.',
    status: 'Dipublikasikan di situs pribadi dan profil lain. Pernyataan yang disebut berasal dari UNESCO Jakarta, diteruskan secara tidak langsung, menyebut tidak ada kontrak atau konsultansi; peran di KORIKA perlu dikonfirmasi ke KORIKA.',
    evidence: ['03-stimson', '04-situs-experiences', '12-utas-unesco'],
  },
  {
    id: 'penghargaan-fellowship',
    label: 'penghargaan dan fellowship',
    claim: '“AI Innovator of the Year” dan Responsible AI Fellow (Stimson Center / Microsoft).',
    status: 'Pemberi dan tahun penghargaan tidak disebut pada profil. Belum ada konfirmasi dari lembaga yang disebut.',
    evidence: ['04-situs-experiences', '05-tunaya-cto'],
  },
  {
    id: 'dosen-tim-bergelar',
    label: 'status dosen dan tim bergelar',
    claim: 'Berstatus dosen, dan memimpin tim bergelar Doktor/PhD.',
    status: 'Liputan pihak ketiga mengulang klaim “dosen” tanpa memverifikasi. Belum terlihat penugasan mengajar resmi atau daftar anggota tim.',
    evidence: ['06-kartu-instructor', '09-liputan-sentrasoft'],
  },
];
