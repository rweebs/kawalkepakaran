import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'source';
const OUT = 'src/content/posts';
const IMG = 'public/img';
mkdirSync(OUT, { recursive: true });
mkdirSync(IMG, { recursive: true });

const CLASSIFICATION = {
  'aduan-068-abil-sudarman-reported-party-english': 'laporan-aduan',
  'somasi-kedua-dan-terakhir-study-case-of-korika': 'laporan-aduan',
  'deep-research-report-rahmat-wibowo-infraloka-vs-abil-sudarman-assai-a-confidence-scored-credential-verification': 'fakta-dengan-bukti',
};

const files = readdirSync(SRC);
for (const f of files.filter((n) => /\.(png|jpe?g)$/i.test(n))) copyFileSync(join(SRC, f), join(IMG, f));

const slugs = new Set(files.filter((n) => n.endsWith('.md')).map((n) => n.replace(/\.md$/, '')));
const today = new Date().toISOString().slice(0, 10);

for (const slug of slugs) {
  const raw = readFileSync(join(SRC, `${slug}.md`), 'utf8');
  const lines = raw.split('\n');
  const h1 = lines.findIndex((l) => l.startsWith('# '));
  const title = (h1 >= 0 ? lines[h1].slice(2) : slug).trim();
  let body = lines.filter((_, i) => i !== h1).join('\n').trim();

  body = body.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) =>
    /^(https?:|\/)/.test(src) ? m : `![${alt}](/img/${src.replace(/^\.\//, '')})`);

  body = body.replace(/\[([^\]]+)\]\(\/blog\/([^)\s]+)\)/g, (m, text, target) =>
    slugs.has(target) ? `[${text}](/artikel/${target})` : text);

  const fm = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `originalTitle: ${JSON.stringify(title)}`,
    'author: "Rahmat Wibowo"',
    `translationDate: ${today}`,
    `classification: ${CLASSIFICATION[slug] ?? 'pendapat'}`,
    'subjects: []',
    'translationStatus: draft',
    '---',
    '',
  ].join('\n');

  if (existsSync(join(OUT, `${slug}.md`))) { console.log(`skip ${slug} (exists)`); continue; }
  writeFileSync(join(OUT, `${slug}.md`), fm + body + '\n');
  console.log(`wrote ${slug}`);
}
