// Archive importer. Reads the Infraloka blog's Professional Blacklist posts and decides what may be copied.
// Run: node scripts/import-arsip.mjs --source /path/to/infraloka
// Mode "report" (the default) writes tmp/arsip-hold-report.md and copies nothing.
// Add --publish to write the entries as published (draft: false); the default is draft.
// Mode "--write" also copies into src/content/arsip, src/content/{pakar,klaim}/generated and public/img (all git-ignored). A post held back for medical
// content is released only by trimming the medical parts (personal data is never trimmed); what was removed is listed in
// tmp/arsip-trim-review.md for the owner. A lone diagnosis mention is trimmed too. Images are compressed to WebP (1600 px at most).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  frontmatter, holdFlags, kindFor, langFor, parseRules, parseSlugs, partiesFor, imageName, klaimFromDocument, klaimId, pakarFromParty, releaseByTrimming, rewriteImages, rewriteLinks, statusFor, stripTitle, titleFrom, trimMentions,
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

  // Decide each post. A post held back for medical content is released only by trimming it; personal data is never trimmed.
  const planned = rows.map((r) => {
    const text = readFileSync(join(SOURCE, 'src/content/blog', `${r.slug}.md`), 'utf8');
    if (r.flags.action === 'hold') {
      const rel = releaseByTrimming(text);
      return { r, text: rel.text, copy: rel.released, trimmed: true, removed: rel.removed, fromHold: true };
    }
    if (r.flags.action === 'trim') return { r, text: trimMentions(text).text, copy: true, trimmed: true, removed: [], fromHold: false };
    return { r, text, copy: true, trimmed: false, removed: [], fromHold: false };
  });
  const eligible = planned.filter((x) => x.copy);
  const copiedSlugs = new Set(eligible.map((x) => x.r.slug));
  // --publish writes draft: false (published); without it every entry is a draft.
  const draft = !args.includes('--publish');

  // Start from a clean slate so a re-run never leaves a post that has since been held back.
  for (const [dir, ext] of [['src/content/arsip', '.md'], ['src/content/pakar/generated', '.json'], ['src/content/klaim/generated', '.json']]) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) if (f.endsWith(ext)) rmSync(join(dir, f));
  }

  const available = new Set(existsSync(join(SOURCE, 'public/blog')) ? readdirSync(join(SOURCE, 'public/blog')) : []);
  const images = new Set();
  const droppedImages = [];
  const partyMap = new Map();
  for (const x of eligible) {
    const { r } = x;
    const rewritten = rewriteImages(stripTitle(x.text), available);
    rewritten.md = rewriteLinks(rewritten.md, copiedSlugs);
    for (const img of rewritten.images) images.add(img);
    for (const d of rewritten.dropped) droppedImages.push(`${r.slug}: ${d}`);
    const fm = frontmatter({ title: r.title, slug: r.slug, lang: r.lang, kind: r.kind, status: r.status, parties: r.parties.map((p) => p.slug), trimmed: x.trimmed, archivedAt, draft });
    writeFileSync(join('src/content/arsip', `${r.slug}.md`), `${fm}${rewritten.md}`);
    for (const p of r.parties) {
      const entry = partyMap.get(p.slug) ?? { name: p.name, kind: p.kind, articles: [] };
      entry.articles.push(r.slug);
      partyMap.set(p.slug, entry);
    }
  }
  // Each party becomes a /pakar profile, and each formal document one claim per party it names. Abil Sudarman has a hand-made
  // profile with curated claims, so he is neither duplicated nor given generated claims; his posts reach his page through `parties`.
  const CURATED = new Set(['abil-sudarman']);
  let claimsWritten = 0;
  for (const [slug, party] of partyMap) {
    if (CURATED.has(slug)) continue;
    writeFileSync(join('src/content/pakar/generated', `${slug}.json`), `${JSON.stringify(pakarFromParty({ ...party, draft }), null, 2)}\n`);
  }
  for (const x of eligible.filter((e) => ['somasi', 'aduan'].includes(e.r.kind))) {
    for (const party of x.r.parties.filter((q) => !CURATED.has(q.slug))) {
      const article = { slug: x.r.slug, title: x.r.title, kind: x.r.kind };
      writeFileSync(join('src/content/klaim/generated', `${klaimId(party.slug, x.r.slug)}.json`), `${JSON.stringify(klaimFromDocument({ party: party.slug, article, draft }), null, 2)}\n`);
      claimsWritten += 1;
    }
  }

  mkdirSync('public/img', { recursive: true });
  const missingImages = [];
  const failed = [];
  let written = 0;
  let bytes = 0;
  for (const img of images) {
    const out = join('public/img', imageName(img));
    const src = join(SOURCE, 'public/blog', img);
    if (!existsSync(src)) { missingImages.push(img); continue; }
    if (existsSync(out)) continue;
    try {
      const info = await sharp(src).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 74 }).toFile(out);
      written += 1;
      bytes += info.size;
    } catch (e) { failed.push(`${img}: ${e.message}`); }
  }

  // The owner reviews what was removed from the posts that were released by trimming.
  const released = planned.filter((x) => x.fromHold && x.copy);
  const stillHeld = planned.filter((x) => !x.copy);
  const review = `# Tinjauan pemangkasan

Artikel yang tadinya tertahan dan kini disalin setelah dipangkas: **${released.length}**. Tetap tertahan: **${stillHeld.length}**.
Gambar di artikel ini **tidak diperiksa isinya**: hanya gambar yang keterangannya menyebut medis yang dibuang.
Gambar yang tidak ada di sumber atau tautannya ke folder lain dibuang dari salinan: **${droppedImages.length}**.
${droppedImages.slice(0, 40).map((d) => `- ${d}`).join('\n')}

${released.map((x) => `## ${x.r.slug}\n\n${x.r.title}\n\n${x.removed.map((d) => `- [${d.kind}] ${d.text.replace(/\n/g, ' ')}`).join('\n') || '_tidak ada yang dibuang_'}\n`).join('\n')}
## Tetap tertahan

${stillHeld.map((x) => `- \`${x.r.slug}\` (${x.r.flags.pii.length ? 'data pribadi' : 'masih ada kata medis berat setelah dipangkas'})`).join('\n') || '_tidak ada_'}
`;
  writeFileSync('tmp/arsip-trim-review.md', review);
  const removedTotal = released.reduce((n, x) => n + x.removed.length, 0);
  console.log(`written: ${eligible.length} posts (${eligible.filter((x) => x.trimmed).length} trimmed; ${released.length} released from hold, ${removedTotal} parts removed), ${partyMap.size - (partyMap.has('abil-sudarman') ? 1 : 0)} profiles, ${claimsWritten} claims, ${written} new images (${(bytes / 1048576).toFixed(1)} MB), ${images.size} referenced`);
  console.log(`still held: ${stillHeld.length}; images dropped (not at the source): ${droppedImages.length}; failed: ${failed.length}${failed.length ? ` ${failed.slice(0, 2).join(' | ')}` : ''}`);
  console.log('review: tmp/arsip-trim-review.md');
}
