import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const wf = (name: string) => readFileSync(`.github/workflows/${name}`, 'utf8');
/** The text of one job: from its key to the next top-level job key (or the end). */
const job = (text: string, name: string) => {
  const start = text.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name}`).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const next = rest.slice(3).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 3);
};

describe('site-down alerts', () => {
  for (const [file, needs] of [['monitor.yml', '[live, domains]'], ['ci.yml', 'smoke'], ['lighthouse.yml', 'lighthouse'], ['links.yml', 'links']]) {
    it(`${file} opens the site-down issue on failure, with issues: write on that job only`, () => {
      const text = wf(file);
      const alert = job(text, 'alert');
      expect(alert).toContain(`needs: ${needs}`);
      expect(alert).toMatch(/if: failure\(\)/);
      expect(alert).toContain('issues: write');
      expect(alert).toContain('node scripts/site-alert.mjs open');
      expect(alert).toContain('GH_TOKEN: ${{ github.token }}');
      // Workflow-level permissions stay read-only.
      expect(text.slice(0, text.indexOf('jobs:'))).not.toContain('issues: write');
      expect((text.match(/issues: write/g) ?? []).length).toBe(file === 'monitor.yml' ? 2 : 1);
    });
  }
  it('the monitor closes the issue when every check passes again', () => {
    const rec = job(wf('monitor.yml'), 'recovered');
    expect(rec).toContain('needs: [live, domains]');
    expect(rec).toMatch(/if: success\(\)/);
    expect(rec).toContain('node scripts/site-alert.mjs close');
  });
});

describe('live monitor', () => {
  const m = wf('monitor.yml');
  it('accepts a urlset or a sitemap index', () => {
    expect(job(m, 'live')).toContain("grep -Eq '<urlset|<sitemapindex'");
  });
  it('checks www and the legacy domain in their own job, with a fix in the error', () => {
    const d = job(m, 'domains');
    expect(job(m, 'live')).not.toContain('www.kawalkepakaran.org');
    expect(d).toContain('https://www.kawalkepakaran.org/');
    expect(d).toContain('"https://abilsudarman.my.id/" "$SITE_URL/"');
    expect(d).toContain('"https://abilsudarman.my.id/blog" "$SITE_URL/kasus/abil-sudarman/artikel"');
    expect(d).toContain('Redirect Rule');
    expect(d).toContain('redirect-worker');
  });
});

describe('CI deploy paths', () => {
  const ci = wf('ci.yml');
  it('verifies every push to main and every PR', () => {
    expect(ci).toMatch(/on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n {4}branches: \[main\]/);
    expect(job(ci, 'verify')).not.toMatch(/\n {4}if:/);
  });
  it('documents both deploy paths', () => {
    const header = ci.slice(0, ci.indexOf('on:'));
    expect(header).toContain('Git integration');
    expect(header).toContain('CLOUDFLARE_DEPLOY');
    expect(header).toContain('CLOUDFLARE_API_TOKEN');
    expect(header).toContain('INDEXNOW_KEY');
  });
  it('smoke-tests after the wrangler deploy, and also when that job is skipped', () => {
    const smoke = job(ci, 'smoke');
    expect(smoke).toContain('needs: [verify, deploy]');
    expect(smoke).toContain("!cancelled() && needs.verify.result == 'success' && needs.deploy.result != 'failure'");
  });
  it('rolls back only a wrangler deploy whose smoke test failed', () => {
    const rb = job(ci, 'rollback');
    expect(rb).toContain('needs: [deploy, smoke]');
    expect(rb).toContain("if: failure() && needs.deploy.result == 'success' && needs.smoke.result == 'failure'");
    expect(rb).toMatch(/command: rollback --yes/);
    expect(rb).toContain('Not attempted for the Git-integration path');
  });
  it('archives snapshots after a passing smoke test without failing the run', () => {
    const smoke = job(ci, 'smoke');
    expect(smoke).toMatch(/continue-on-error: true\n\s+timeout-minutes: \d+\n\s+run: node scripts\/wayback\.mjs dist/);
    expect(smoke.indexOf('wayback.mjs')).toBeGreaterThan(smoke.indexOf('missing header'));
  });
  it('builds with full git history, so sitemap lastmod is real', () => {
    expect(job(ci, 'verify')).toContain('fetch-depth: 0');
    expect(wf('lighthouse.yml')).toContain('fetch-depth: 0');
    expect(wf('links.yml')).toContain('fetch-depth: 0');
  });
  it('pings WebSub for both feeds after IndexNow, best effort', () => {
    const smoke = job(ci, 'smoke');
    expect(smoke.indexOf('Ping WebSub')).toBeGreaterThan(smoke.indexOf('indexnow.mjs submit'));
    expect(smoke).toMatch(/name: Ping WebSub\n\s+continue-on-error: true/);
    expect(smoke).toContain('"$SITE_URL/rss.xml" "$SITE_URL/en/rss.xml"');
    expect(smoke).toContain("--data-urlencode 'hub.mode=publish'");
  });
  it('offers a manual run that submits every URL', () => {
    expect(ci).toMatch(/workflow_dispatch:\n {4}inputs:\n {6}all:/);
  });
});
