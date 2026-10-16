# Old paths

The site is **kawalkepakaran.org**. When the Abil Sudarman material moved under `/kasus/abil-sudarman`
(`/en/cases/abil-sudarman` in English), its old paths were kept working with 301 redirects on this domain.

## How the redirects are built

- `src/lib/legacy-redirects.ts` is the single source of truth: `LEGACY_MOVES`, a list of moved path prefixes, and
  `legacyTarget()`.
- `npm run redirects` (run automatically by `npm run build`) writes `public/_redirects` from it.

## Changing a redirect

Edit `LEGACY_MOVES` in `src/lib/legacy-redirects.ts`, run `npm test`, then `npm run build`. Never edit
`public/_redirects` by hand; the build overwrites it.
