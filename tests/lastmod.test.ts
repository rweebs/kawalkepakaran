import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { PAGE_LASTMOD } from '../src/lib/site';
import { ROUTES } from '../src/i18n';

describe('PAGE_LASTMOD', () => {
  const today = new Date().toISOString().slice(0, 10);
  it('has a valid, non-future date for every entry', () => {
    for (const [path, d] of Object.entries(PAGE_LASTMOD)) {
      expect(d, path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d <= today, `${path} is in the future`).toBe(true);
    }
  });
  it('only lists pages that exist', () => {
    for (const path of Object.keys(PAGE_LASTMOD)) {
      expect(existsSync(`src/pages${path}.astro`) || existsSync(`src/pages${path}/index.astro`) || Object.values(ROUTES).some((r) => r.id === path), path).toBe(true);
    }
  });
});
