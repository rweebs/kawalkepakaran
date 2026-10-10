// Archive importer. Reads the Infraloka blog's Professional Blacklist posts and decides what may be copied.
// Run: node scripts/import-arsip.mjs --source /path/to/infraloka
// Mode "report" (the default) writes tmp/arsip-hold-report.md and copies nothing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { holdFlags, kindFor, langFor, parseRules, parseSlugs, partiesFor, statusFor, titleFrom } from './arsip-lib.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const SOURCE = flag('--source', process.env.INFRALOKA_DIR);
if (!SOURCE) {
  console.error('Usage: node scripts/import-arsip.mjs --source /path/to/infraloka   (or set INFRALOKA_DIR)');
  process.exit(1);
}

const slugs = parseSlugs(readFileSync(join(SOURCE, 'src/lib/blacklist-slugs.ts'), 'utf8'));
const rules = parseRules(readFileSync(join(SOURCE, 'src/lib/blacklist-parties.ts'), 'utf8'));

const rows = [];
const missing = [];
for (const slug of slugs) {
  const file = join(SOURCE, 'src/content/blog', `${slug}.md`);
  if (!existsSync(file)) { missing.push(slug); continue; }
  const text = readFileSync(file, 'utf8');
  const flags = holdFlags(text);
  const kind = kindFor(slug);
  rows.push({ slug, kind, status: statusFor(kind), lang: langFor(text), title: titleFrom(text), size: text.length, parties: partiesFor(slug, rules), flags });
}

const by = (action) => rows.filter((r) => r.flags.action === action);
const lines = (items, n = 2) => items.slice(0, n).map((i) => `    - l.${i.line}: ${i.text.replace(/\|/g, '/')}`).join('\n');
const section = (title, action, withLines) => {
  const list = by(action);
  const body = list.map((r) => {
    const f = r.flags;
    const why = [f.pii.length && `data pribadi (${f.pii.length})`, f.heavy.length && `medis berat (${f.heavy.length})`, f.mention.length && `sebutan diagnosis/kesehatan mental (${f.mention.length}${f.mention.some((m) => !m.paragraph) ? ', di tabel/daftar' : ''})`].filter(Boolean).join(', ');
    const detail = withLines ? `\n${lines([...f.heavy, ...f.mention])}${f.pii.length ? `\n    - data: ${f.pii.slice(0, 2).join(' | ')}` : ''}` : '';
    return `- \`${r.slug}\` (${r.kind}, ${Math.round(r.size / 1024)} KB): ${r.title.slice(0, 80)}${why ? ` — ${why}` : ''}${detail}`;
  }).join('\n');
  return `## ${title} (${list.length})\n\n${body || '_tidak ada_'}\n`;
};

const parties = new Map();
for (const r of rows) for (const p of r.parties) parties.set(p.slug, { ...p, n: (parties.get(p.slug)?.n ?? 0) + 1 });

const report = `# Laporan penahanan arsip

Sumber: ${SOURCE} · ${slugs.length} slug · ${rows.length} berkas ditemukan · hilang: ${missing.join(', ') || '-'}

| Tindakan | Artikel | Arti |
|---|---|---|
| tahan | ${by('hold').length} | tidak disalin sampai Anda memutuskan |
| pangkas | ${by('trim').length} | kalimat yang menyebut diagnosis/kesehatan mental dibuang, artikel ditandai "dipangkas" |
| tinjau | ${by('review').length} | hanya kata lemah (misalnya kutipan undang-undang disabilitas); disalin apa adanya |
| terbitkan | ${by('publish').length} | disalin apa adanya |

Pihak: ${parties.size} (${['Company', 'Person', 'Group'].map((k) => `${k}: ${[...parties.values()].filter((p) => p.kind === k).length}`).join(', ')}); artikel tanpa pihak: ${rows.filter((r) => !r.parties.length).length}.
Jenis: ${['somasi', 'aduan', 'ringkasan', 'analisis', 'catatan'].map((k) => `${k}: ${rows.filter((r) => r.kind === k).length}`).join(', ')}. Bahasa: ${['id', 'en'].map((l) => `${l}: ${rows.filter((r) => r.lang === l).length}`).join(', ')}.

${section('Tahan', 'hold', true)}
${section('Pangkas', 'trim', false)}`;

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/arsip-hold-report.md', report);
console.log(`report: tmp/arsip-hold-report.md | hold ${by('hold').length}, trim ${by('trim').length}, review ${by('review').length}, publish ${by('publish').length} | parties ${parties.size}`);
