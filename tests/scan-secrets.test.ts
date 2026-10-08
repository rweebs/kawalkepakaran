import { describe, it, expect } from 'vitest';
import { scanText } from '../scripts/scan-secrets.mjs';

describe('scanText', () => {
  it('flags tokens and private keys', () => {
    expect(scanText('CLOUDFLARE_API_TOKEN=abcd1234abcd1234abcd1234abcd1234')).toContain('api-token');
    expect(scanText('-----BEGIN PRIVATE KEY-----')).toContain('private-key');
    expect(scanText('ghp_' + 'a'.repeat(36))).toContain('github-token');
  });
  it('passes ordinary text', () => {
    expect(scanText('Kawal Kepakaran menguji klaim para pakar')).toEqual([]);
  });
});
