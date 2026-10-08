import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(p, 'utf8');

const DOCS = [
  'README.md', 'README.id.md', 'CONTRIBUTING.md', 'docs/index.md',
  'docs/business-guide.md', 'docs/business-guide.id.md', 'docs/engineering-guide.md', 'docs/engineering-guide.id.md',
];

describe('open source packaging', () => {
  it('ships both licenses', () => {
    expect(read('LICENSE')).toMatch(/MIT License/);
    expect(read('LICENSE-CONTENT.md')).toMatch(/CC BY 4\.0|Attribution 4\.0/);
  });
  it('package.json declares license and repository', () => {
    const p = JSON.parse(read('package.json'));
    expect(p.license).toBe('MIT');
    expect(p.repository.url).toContain('rweebs/kawalkepakaran');
    expect(p.homepage).toBe('https://kawalkepakaran.org');
    expect(p.bugs.url).toContain('rweebs/kawalkepakaran/issues');
  });
  it('the entry docs use the new name', () => {
    for (const f of ['README.md', 'README.id.md', 'CONTRIBUTING.md', 'docs/index.md']) {
      expect(read(f), f).toContain('Kawal Kepakaran');
    }
  });
  it('no doc keeps the old clone URL, old domain as the live site, or the master branch', () => {
    for (const f of DOCS) {
      const s = read(f);
      expect(s, f).not.toContain('rweebs/abilsudarman');
      expect(s, f).not.toMatch(/`master`/);
      expect(s, f).not.toMatch(/Live site:\*\* <https:\/\/abilsudarman\.my\.id>/);
    }
    expect(read('README.md')).toContain('git clone https://github.com/rweebs/kawalkepakaran.git');
    expect(read('README.id.md')).toContain('git clone https://github.com/rweebs/kawalkepakaran.git');
  });
  it('documents how to submit a pakar or a claim, and the license split', () => {
    expect(read('README.md')).toMatch(/CC BY 4\.0/);
    expect(read('CONTRIBUTING.md')).toMatch(/pakar/i);
    expect(read('CONTRIBUTING.md')).toMatch(/submit-claim|issues\/new\/choose/);
  });
  it('has issue templates, a PR template and the redirect runbook', () => {
    for (const f of ['.github/ISSUE_TEMPLATE/submit-claim.yml', '.github/ISSUE_TEMPLATE/correction-or-reply.yml', '.github/pull_request_template.md', 'docs/redirects.md']) {
      expect(existsSync(f), f).toBe(true);
    }
    expect(read('docs/redirects.md')).toContain('redirect-worker');
    expect(read('docs/redirects.md')).toMatch(/Search Console/);
  });
});
