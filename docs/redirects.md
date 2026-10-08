# Moving from abilsudarman.my.id to kawalkepakaran.org

The site was renamed from "Kawal Abil Sudarman" to **Kawal Kepakaran**. Old links must keep working, so every path on the
old domain redirects with a 301 to its new place. The Abil Sudarman material now lives under `/kasus/abil-sudarman`
(`/en/cases/abil-sudarman` in English).

## How the redirects are built

- `src/lib/legacy-redirects.ts` is the single source of truth: a list of moved path prefixes and `legacyTarget()`.
- `npm run redirects` (run automatically by `npm run build`) writes `public/_redirects` from it, for old paths that reach
  the new domain.
- `redirect-worker/` is a small Cloudflare Worker that answers on **abilsudarman.my.id** and redirects to the new domain,
  keeping the query string. Unknown paths map to the same path on the new domain.

## One-time steps (owner)

1. Add `kawalkepakaran.org` as the custom domain of the main Worker in Cloudflare (this repository's `wrangler.jsonc`,
   project name `kawalkepakaran`).
2. Keep the **abilsudarman.my.id** DNS record proxied (orange cloud) so the redirect worker receives the traffic.
3. Deploy the redirect worker: `cd redirect-worker && npx wrangler deploy`.
4. Register `kawalkepakaran.org` in Google **Search Console**, then put the verification token in
   `googleVerification` in `src/lib/site.ts` (it renders only when non-empty). Use the "Change of address" tool from the
   old property if you keep it verified.
5. Check a few old URLs, for example `/artikel`, `/linimasa/<slug>`, `/en/articles/<slug>`, and one unknown path.

## Changing a redirect

Edit `LEGACY_MOVES` in `src/lib/legacy-redirects.ts`, run `npm test`, then `npm run build`. Never edit
`public/_redirects` by hand; the build overwrites it.
