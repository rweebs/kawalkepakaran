import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Static builds write to dist/. If a Cloudflare adapter is injected (for example by
// `wrangler deploy` auto-configuration) the site is written to dist/client/ instead.
export function siteRoot(dist) {
  if (!existsSync(join(dist, 'index.html')) && existsSync(join(dist, 'client'))) return join(dist, 'client');
  return dist;
}
