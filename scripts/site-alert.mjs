// Keeps one GitHub issue open while a scheduled or main-branch check of the live site is failing.
//
//   node scripts/site-alert.mjs open    opens the `site-down` issue, or comments on it when it is already open
//   node scripts/site-alert.mjs close   closes it with a note (the live monitor runs this when it passes again)
//
// Runs in GitHub Actions with GH_TOKEN set to the job's GITHUB_TOKEN (`permissions: issues: write`).
// Issues are deduplicated by their exact title, so every failing workflow lands in the same thread.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ALERT_TITLE = 'Live site check failing';
export const ALERT_LABEL = 'site-down';

/** The open issue that carries the alert title exactly, or undefined. */
export function findAlertIssue(issues, title = ALERT_TITLE) {
  return issues
    .filter((i) => i.title === title && (i.state === undefined || String(i.state).toUpperCase() === 'OPEN'))
    .sort((a, b) => a.number - b.number)[0];
}

/** Hours of quiet before a still-failing check comments again (the monitor runs every 6 hours). */
export const QUIET_HOURS = 20;

/** Comment on an open alert only when it has been quiet for a while, so a known outage does not spam the thread. */
export function shouldComment(updatedAt, now = new Date(), quietHours = QUIET_HOURS) {
  const t = Date.parse(updatedAt ?? '');
  return Number.isNaN(t) || now.getTime() - t >= quietHours * 3_600_000;
}

/** Link to the run that triggered the alert. */
export const runUrl = (env) => `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;

/** Markdown for a new issue or a follow-up comment about a failing run. */
export function failureText(env, now = new Date()) {
  return [
    `**${env.GITHUB_WORKFLOW ?? 'A workflow'}** failed (${env.GITHUB_EVENT_NAME ?? 'run'} on \`${env.GITHUB_REF_NAME ?? '?'}\`, ${now.toISOString()}).`,
    '',
    `Run: ${runUrl(env)}`,
    '',
    'The failing step says what to fix. This issue closes itself when the Live monitor passes again.',
  ].join('\n');
}

export function recoveryText(env, now = new Date()) {
  return `The Live monitor passed again (${now.toISOString()}): ${runUrl(env)}. Closing.`;
}

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function openIssues() {
  const seen = new Map();
  // The label listing is exact and immediate; the title search also catches an issue someone relabelled.
  for (const args of [
    ['issue', 'list', '--state', 'open', '--label', ALERT_LABEL, '--json', 'number,title,state,updatedAt', '--limit', '100'],
    ['issue', 'list', '--state', 'open', '--search', `"${ALERT_TITLE}" in:title`, '--json', 'number,title,state,updatedAt', '--limit', '100'],
  ]) {
    try { for (const i of JSON.parse(gh(args))) seen.set(i.number, i); } catch { /* one listing is enough */ }
  }
  return [...seen.values()];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const mode = process.argv[2];
  const env = process.env;
  const existing = findAlertIssue(openIssues());
  if (mode === 'open') {
    if (existing && !shouldComment(existing.updatedAt)) {
      console.log(`site-alert: #${existing.number} is open and was updated within ${QUIET_HOURS} hours; not commenting again`);
    } else if (existing) {
      gh(['issue', 'comment', String(existing.number), '--body', failureText(env)]);
      console.log(`site-alert: commented on #${existing.number}`);
    } else {
      try { gh(['label', 'create', ALERT_LABEL, '--color', 'B60205', '--description', 'The live site or a check of it is failing']); } catch { /* already exists */ }
      const out = gh(['issue', 'create', '--title', ALERT_TITLE, '--label', ALERT_LABEL, '--body', failureText(env)]);
      console.log(`site-alert: opened ${out.trim()}`);
    }
  } else if (mode === 'close') {
    if (existing) {
      gh(['issue', 'close', String(existing.number), '--comment', recoveryText(env)]);
      console.log(`site-alert: closed #${existing.number}`);
    } else {
      console.log('site-alert: no open alert issue');
    }
  } else {
    console.error('site-alert: use "open" or "close"');
    process.exit(1);
  }
}
