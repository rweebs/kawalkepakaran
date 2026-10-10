import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isValidKey, sitemapUrls, payloads, writeKeyFile, BATCH } from '../scripts/indexnow.mjs';

describe('indexnow script', () => {
  it('validates keys', () => {
    expect(isValidKey('abcd1234')).toBe(true);
    expect(isValidKey('short')).toBe(false);
    expect(isValidKey('has space 123')).toBe(false);
  });
  it('reads unique, unescaped sitemap locs (not hreflang hrefs)', () => {
    const xml = '<urlset><url><loc>https://s.org/a?x=1&amp;y=2</loc><xhtml:link href="https://s.org/en/a"/></url><url><loc>https://s.org/b</loc></url><url><loc>https://s.org/b</loc></url></urlset>';
    expect(sitemapUrls(xml)).toEqual(['https://s.org/a?x=1&y=2', 'https://s.org/b']);
  });
  it('builds batched payloads for the own host with the key location', () => {
    const urls = Array.from({ length: BATCH + 1 }, (_, i) => `https://s.org/${i}`).concat('https://other.org/x');
    const p = payloads(urls, 'abcd1234', 'https://s.org');
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ host: 's.org', key: 'abcd1234', keyLocation: 'https://s.org/abcd1234.txt' });
    expect(p[0].urlList).toHaveLength(BATCH);
    expect(p[1].urlList).toEqual([`https://s.org/${BATCH}`]);
  });
  it('writes the key file into dist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'indexnow-'));
    const file = writeKeyFile(dir, 'abcd1234');
    expect(readFileSync(file, 'utf8')).toBe('abcd1234');
    expect(file).toBe(join(dir, 'abcd1234.txt'));
  });
  it('exits 0 without touching the network when INDEXNOW_KEY is unset', () => {
    const env = { ...process.env };
    delete env.INDEXNOW_KEY;
    const out = execFileSync(process.execPath, ['scripts/indexnow.mjs', 'submit', 'does-not-exist'], { env, encoding: 'utf8' });
    expect(out).toMatch(/not set/);
  });
  it('runs in the deploy job only when the secret exists, writing the key before deploy and pinging after', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const job = ci.slice(ci.indexOf('  deploy:'), ci.indexOf('  smoke:'));
    expect(job).toContain('INDEXNOW_KEY: ${{ secrets.INDEXNOW_KEY }}');
    const write = job.indexOf('indexnow.mjs write-key');
    const deploy = job.indexOf('command: deploy');
    const submit = job.indexOf('indexnow.mjs submit');
    expect(write).toBeGreaterThan(0);
    expect(write).toBeLessThan(deploy);
    expect(submit).toBeGreaterThan(deploy);
    expect((job.match(/if: env\.INDEXNOW_KEY != ''/g) ?? []).length).toBe(2);
  });
});
