import { readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RULES = {
  'api-token': /(TOKEN|SECRET|API_KEY|PASSWORD)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{20,}/,
  'private-key': /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  'github-token': /gh[pousr]_[A-Za-z0-9]{36,}/,
  'aws-key': /AKIA[0-9A-Z]{16}/,
  'google-api-key': /AIza[0-9A-Za-z_\-]{35}/,
  'slack-token': /xox[abprs]-[A-Za-z0-9-]{10,}/,
  'openai-style-key': /\bsk-[A-Za-z0-9_-]{20,}/,
  'cloudflare-token-header': /Authorization:\s*Bearer\s+[A-Za-z0-9_\-]{30,}/i,
};

export function scanText(text) {
  return Object.entries(RULES).filter(([, re]) => re.test(text)).map(([name]) => name);
}

const SKIP = new Set(['node_modules', '.git', 'dist', '.astro', '.agents', '.claude', '.superpowers', '.wrangler', 'superpowers']);
/** Files that hold deliberate fake secrets to test the scanner itself. */
export const FIXTURES = new Set(['tests/scan-secrets.test.ts']);

/** Tracked files when in a git checkout (so nothing committed can hide in a skipped folder), else a directory walk. */
function files() {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean).filter((f) => !f.split('/').some((n) => SKIP.has(n)));
  } catch {
    return [...walk('.')];
  }
}

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
  for (const f of files()) {
    if (FIXTURES.has(f.replace(/^\.\//, ''))) continue;
    if (!/\.(ts|tsx|mjs|json|jsonc|md|astro|yml|yaml|txt|toml|html|webmanifest|sh|env.*)$|(^|\/)\.env/.test(f)) continue;
    for (const hit of scanText(readFileSync(f, 'utf8'))) {
      console.error(`${f}: ${hit}`);
      bad++;
    }
  }
  process.exit(bad ? 1 : 0);
}
