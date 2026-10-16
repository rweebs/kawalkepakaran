import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { findAlertIssue, failureText, recoveryText, runUrl, shouldComment, ALERT_TITLE, ALERT_LABEL } from '../scripts/site-alert.mjs';

const env = { GITHUB_REPOSITORY: 'rweebs/kawalkepakaran', GITHUB_RUN_ID: '42', GITHUB_WORKFLOW: 'Live monitor', GITHUB_EVENT_NAME: 'schedule', GITHUB_REF_NAME: 'main' };

describe('site alert', () => {
  it('uses a fixed title and the site-down label', () => {
    expect(ALERT_LABEL).toBe('site-down');
    expect(ALERT_TITLE.length).toBeGreaterThan(5);
  });
  it('deduplicates by exact title, preferring the oldest open issue', () => {
    const issues = [
      { number: 9, title: ALERT_TITLE, state: 'OPEN' },
      { number: 3, title: ALERT_TITLE, state: 'OPEN' },
      { number: 1, title: ALERT_TITLE, state: 'CLOSED' },
      { number: 2, title: `${ALERT_TITLE} (old)`, state: 'OPEN' },
    ];
    expect(findAlertIssue(issues).number).toBe(3);
    expect(findAlertIssue([{ number: 2, title: 'Other', state: 'OPEN' }])).toBeUndefined();
  });
  it('links the failing run and names the workflow', () => {
    expect(runUrl(env)).toBe('https://github.com/rweebs/kawalkepakaran/actions/runs/42');
    const t = failureText(env, new Date('2026-10-16T00:00:00Z'));
    expect(t).toContain('**Live monitor** failed');
    expect(t).toContain('/actions/runs/42');
    expect(recoveryText(env)).toContain('passed again');
  });
  it('comments again only after a quiet spell', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    expect(shouldComment('2026-10-16T06:00:00Z', now)).toBe(false);
    expect(shouldComment('2026-10-15T12:00:00Z', now)).toBe(true);
    expect(shouldComment(undefined, now)).toBe(true);
  });
});
