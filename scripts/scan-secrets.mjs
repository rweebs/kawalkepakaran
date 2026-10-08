import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RULES = {
  'api-token': /(TOKEN|SECRET|API_KEY|PASSWORD)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{20,}/,
  'private-key': /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  'github-token': /gh[pousr]_[A-Za-z0-9]{36,}/,
  'aws-key': /AKIA[0-9A-Z]{16}/,
};

export function scanText(text) {
  return Object.entries(RULES).filter(([, re]) => re.test(text)).map(([name]) => name);
}

const SKIP = new Set(['node_modules', '.git', 'dist', '.astro', '.agents', '.claude', '.superpowers', '.wrangler', 'public', 'tests', 'superpowers']);

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    if (SKIP.has(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let bad = 0;
  for (const f of walk('.')) {
    if (!/\.(ts|tsx|mjs|json|jsonc|md|astro|yml|yaml)$/.test(f)) continue;
    for (const hit of scanText(readFileSync(f, 'utf8'))) {
      console.error(`${f}: ${hit}`);
      bad++;
    }
  }
  process.exit(bad ? 1 : 0);
}
