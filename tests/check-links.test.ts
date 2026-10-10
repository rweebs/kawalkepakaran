import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore plain JS module
import { externalLinks } from '../scripts/check-links.mjs';

describe('check-links', () => {
  it('collects distinct external links and ignores internal ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'links-'));
    writeFileSync(join(dir, 'index.html'), '<a href="https://a.test/x?a=1&amp;b=2#frag">a</a><a href="/local">l</a><a href="https://a.test/x?a=1&amp;b=2">again</a>');
    const links = externalLinks(dir);
    expect([...links.keys()]).toEqual(['https://a.test/x?a=1&b=2']);
    expect(links.get('https://a.test/x?a=1&b=2')).toHaveLength(2);
  });
});
