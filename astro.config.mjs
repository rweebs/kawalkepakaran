import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://kawalkepakaran.org',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  markdown: { syntaxHighlight: false },
  // Opt-in prefetch: only links marked data-astro-prefetch (the main navigation) are fetched, on hover or focus. Astro bundles
  // the prefetch code into the page's own /_astro module, so it needs no inline script and no CSP change.
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  security: {
    csp: {
      scriptDirective: { resources: ["'self'", 'https://static.cloudflareinsights.com'] },
      styleDirective: {
        resources: [
          { resource: "'self'", kind: 'element' },
          { resource: "'unsafe-inline'", kind: 'attribute' },
        ],
      },
    },
  },
  integrations: [react()],
});
