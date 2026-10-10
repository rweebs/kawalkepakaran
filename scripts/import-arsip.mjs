// Archive importer. Reads the Infraloka blog's Professional Blacklist posts and decides what may be copied.
// Run: node scripts/import-arsip.mjs --source /path/to/infraloka
// Mode "report" (the default) writes tmp/arsip-hold-report.md and copies nothing.
// Mode "--write" also copies what may be copied into src/content/arsip, src/content/pihak and public/img (all git-ignored):
// posts held back are skipped, a lone diagnosis mention is trimmed, images are compressed to WebP (1600 px wide at most).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  frontmatter, holdFlags, kindFor, langFor, parseRules, parseSlugs, partiesFor, pihakRecord, rewriteImages, statusFor, stripTitle, titleFrom, trimMentions,
} from './arsip-lib.mjs';

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

if (args.includes('--write')) {
  const sharp = (await import('sharp')).default;
  const archivedAt = new Date().toISOString().slice(0, 10);
  const eligible = rows.filter((r) => ['publish', 'review', 'trim'].includes(r.flags.action));

  // Start from a clean slate so a re-run never leaves a post that has since been held back.
  for (const [dir, ext] of [['src/content/arsip', '.md'], ['src/content/pihak', '.json']]) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) if (f.endsWith(ext)) rmSync(join(dir, f));
  }

  const images = new Set();
  const partyMap = new Map();
  let trimmed = 0;
  for (const r of eligible) {
    let text = readFileSync(join(SOURCE, 'src/content/blog', `${r.slug}.md`), 'utf8');
    const wasTrimmed = r.flags.action === 'trim';
    if (wasTrimmed) { text = trimMentions(text).text; trimmed += 1; }
    const rewritten = rewriteImages(stripTitle(text));
    for (const img of rewritten.images) images.add(img);
    const fm = frontmatter({ title: r.title, slug: r.slug, lang: r.lang, kind: r.kind, status: r.status, parties: r.parties.map((p) => p.slug), trimmed: wasTrimmed, archivedAt });
    writeFileSync(join('src/content/arsip', `${r.slug}.md`), `${fm}${rewritten.md}`);
    for (const p of r.parties) {
      const entry = partyMap.get(p.slug) ?? { name: p.name, kind: p.kind, articles: [] };
      entry.articles.push(r.slug);
      partyMap.set(p.slug, entry);
    }
  }
  for (const [slug, p] of partyMap) writeFileSync(join('src/content/pihak', `${slug}.json`), `${JSON.stringify(pihakRecord({ ...p, updatedAt: archivedAt }), null, 2)}\n`);

  mkdirSync('public/img', { recursive: true });
  const missingImages = [];
  const failed = [];
  let written = 0;
  let bytes = 0;
  for (const img of images) {
    const out = join('public/img', `arsip-${img.replace(/\.[^.]+$/, '').toLowerCase()}.webp`);
    const src = join(SOURCE, 'public/blog', img);
    if (!existsSync(src)) { missingImages.push(img); continue; }
    if (existsSync(out)) continue;
    try {
      const info = await sharp(src).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 74 }).toFile(out);
      written += 1;
      bytes += info.size;
    } catch (e) { failed.push(`${img}: ${e.message}`); }
  }
  console.log(`written: ${eligible.length} posts (${trimmed} trimmed), ${partyMap.size} parties, ${written} new images (${(bytes / 1048576).toFixed(1)} MB), ${images.size} referenced`);
  console.log(`missing at source: ${missingImages.length}${missingImages.length ? ` (${missingImages.slice(0, 4).join(', ')}...)` : ''}; failed: ${failed.length}${failed.length ? ` ${failed.slice(0, 2).join(' | ')}` : ''}`);
}
