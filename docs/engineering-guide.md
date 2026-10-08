# Engineering guide

> 🇬🇧 English · [🇮🇩 Bahasa Indonesia](engineering-guide.id.md) · [Back to docs index](index.md)

For junior and new engineers. Read the [README](../README.md) first for the 10-minute setup. This guide explains how
things fit together and how to make common changes safely.

**The golden rule:** run `npm test && npm run build` before you push. If both pass, you have not broken the site.

## 1. The big picture

```text
 Markdown / JSON content ─┐
 TypeScript logic (lib) ───┼─► Astro build ─► plain HTML + CSS + JS in dist/ ─► Cloudflare ─► abilsudarman.my.id
 Page templates (.astro) ──┘        │
                                    └─► scripts/check-dist.mjs  (blocks the release if any page breaks a rule)
```

- **Static site:** no server, no database. Every URL is a file in `dist/`.
- **Astro 7 + TypeScript.** React is installed but used sparingly; most pages are `.astro` templates.
- **Two languages:** Indonesian at the root (`/artikel`), English under `/en` (`/en/articles`). Same content, paired pages.
- **Tests:** [Vitest](https://vitest.dev), about 700 tests, run with `npm test`.

## 2. How the code is organised

```text
src/
  pages/           Routes. artikel/index.astro -> /artikel. [slug].astro are dynamic routes. en/ holds English pages.
  content/         Content collections:
    posts/         Indonesian articles (Markdown)            ─ schema: postSchema
    posts-en/      English articles, SAME filename as the Indonesian one ─ schema: postEnSchema
    bukti/         Evidence items (JSON, one per item)       ─ schema: buktiSchema
    buku/          Books / reports (JSON)
    videos/        YouTube videos (JSON)
    tiktok/        TikTok videos (JSON)
  content.config.ts  Registers the collections and their schemas
  lib/             Logic you can unit-test:
    schemas.ts       The rules for every content type (Zod)
    site.ts          Site name, URL, disclaimer text, menu, per-page "last modified" dates
    seo.ts           Title and description builders
    sitemap.ts       Builds sitemap.xml
    linimasa.ts      Timeline events (Indonesian, the source of truth)
    linimasa-en.ts   English timeline text, keyed by the Indonesian slug
    bowobharata.ts   Text for the Bowobharata page (8 parts = "parvas")
    bowobharata/     The 3D scene (see section 8)
    privacy.ts       Detects phone / ID numbers in text (used by a test)
    translation.ts   Detects untranslated English in Indonesian posts (used by a test)
  i18n/            index.ts: languages and the ROUTES table (Indonesian <-> English URL pairs). ui.ts: menu text.
  components/      Reusable pieces. LanguageToggle, DisclaimerBanner, Breadcrumbs, ThemeSong, ...
  layouts/BaseLayout.astro   The frame every page uses: <head> tags, header, menu, footer, SEO, hreflang.
  scripts/         Browser JavaScript (menu, video modal, theme song, 3D stage loader)
  styles/global.css  All CSS
public/            Served untouched: img/ (images), models/ (3D .glb), buku/ (PDFs), _headers, robots.txt
scripts/           Node build helpers (see section 6)
tests/             One test file per feature
source/            Original English article texts used to scaffold posts
```

**Mental model:** to change a page's *words*, edit content or `lib/`; to change its *layout*, edit the `.astro` file; to
change what *every* page has, edit `BaseLayout.astro`.

## 3. Language pairing (important)

Every public page exists in two languages and the two **must point at each other** (hreflang, the language toggle, the
sitemap). The pairing lives in `ROUTES` in `src/i18n/index.ts`:

```ts
articles: { id: '/artikel', en: '/en/articles' },
```

- Add a new page to `ROUTES` or the toggle and hreflang will not know about it.
- The English article has the **same filename** as the Indonesian one (`posts/x.md` ↔ `posts-en/x.md`).
- Timeline events are paired by the **Indonesian slug**.

## 4. Adding content

### 4.1 A new article

1. Create `src/content/posts/<slug>.md` (Indonesian) with front matter:

   ```yaml
   ---
   title: "Judul dalam bahasa Indonesia"
   originalTitle: "Original title"
   author: "Rahmat Wibowo"
   translationDate: 2026-10-04
   classification: pendapat        # or fakta-dengan-bukti, laporan-aduan
   subjects: ["Abil Sudarman"]
   translationStatus: draft         # change to final to publish
   ---
   ```

2. Create `src/content/posts-en/<same-slug>.md` with `title`, `author`, `publishedDate`, `classification`,
   `status: draft`, `original: true` (or `false` if translated).
3. Put images in `public/img/` and reference them as `/img/<file>`.
4. Preview with `npm run dev` (drafts show). When approved, set both statuses to `final`.
5. The test `translation.test.ts` expects an exact post count; update the number when you add a post. It also fails if an
   Indonesian post contains untranslated English paragraphs (allow genuine exceptions in `tests/translation-allow.json`
   with a reason).
6. Run `npm test && npm run build`.

### 4.2 An evidence item

Add `src/content/bukti/NN-name.json`. Required: `title`, `group` (`catatan-resmi`, `klaim-yang-dipublikasikan`,
`liputan-pihak-ketiga`, `upaya-verifikasi`), `images` (1 to 4, each `/img/<file>.png|jpg` plus `alt`), `shows`, `limits`,
`order`. Optional: `source`, `sourceUrl`, `capturedAt`, and an `en` block with the English text. Mask personal data in the
image **before** adding it.

### 4.3 A timeline event

1. Add an entry to `EVENTS` in `src/lib/linimasa.ts` (`slug`, `date` as `YYYY-MM-DD`, `title`, `channel`, `paragraphs`,
   `sources`, `related`). Keep the hedged wording: it is the author's record, not a finding.
2. Add the English text to `EVENTS_EN` in `src/lib/linimasa-en.ts`, keyed by the same Indonesian slug (English `slug`,
   `title`, `paragraphs`, and `src` / `rel` label lists in the same order).
3. Every source link must be `https://`. Related links must point to real pages. Tests enforce both.

### 4.4 A new page

1. Create `src/pages/<name>.astro` (Indonesian) and `src/pages/en/<name>.astro` (English; often a thin wrapper that reuses
   the Indonesian file with `locale="en"`, like `en/timeline.astro`).
2. Add the pair to `ROUTES` in `src/i18n/index.ts`.
3. Add it to the menu in `src/i18n/ui.ts` if it should appear there.
4. Add it to `src/pages/sitemap.xml.ts` and give it a date in `PAGE_LASTMOD` in `src/lib/site.ts`.
5. Use `BaseLayout` and pass `title`, `description`, `path`, `locale` and `breadcrumbs`.

## 5. SEO rules built into the layout

- Title: at most 60 characters; `buildTitle` appends the brand and shortens long titles at a word boundary.
- Description: 70 to 160 characters. Exactly one `<h1>` per page. Canonical URL must match the page URL.
- hreflang pairs and `og:` tags are produced by `BaseLayout`. Do not hand-write them.
- Structured data (JSON-LD) must be valid JSON; the checker parses it.
- When a title does not already mention the subject, long titles get the suffix "· Abil Sudarman".

## 6. The build and its safety checks

`npm run build` runs, in order:

1. `scripts/make-thumbs.mjs` makes small thumbnails (output is git-ignored).
2. `astro build` writes the site to `dist/`.
3. `scripts/prune-images.mjs` deletes images no page uses.
4. `scripts/check-dist.mjs` scans every page. **The build fails** if any rule is broken:

| Rule | Why it exists |
|---|---|
| Disclaimer banner present on every page | Legal: the site must always say it is opinion |
| `<html lang>` is `id` (or `en` under `/en`) | Accessibility and SEO |
| Title length 10 to 65, description 70 to 170 | Search results display |
| Exactly one `<h1>`, valid canonical URL | SEO |
| JSON-LD parses | Search engines ignore broken data |
| `og:image` exists and the file exists | Link previews |
| The mobile menu is open by default in the HTML | The menu must work without JavaScript |
| Every internal `href` / `src` resolves | No broken links or images |
| Sitemap lists every indexable page, no duplicates, no noindex pages | Search engine discovery |

If it fails, the message names the file and the rule. Fix the page, rebuild.

Other scripts are **one-off tools** (fetching thumbnails, making OG images, building PDFs). You rarely run them; each has a
comment at the top explaining its purpose.

## 7. Tests: what guards what

| Tests | Guard against |
|---|---|
| `schemas`, `*-content`, `*-lib` | Bad content (wrong fields, bad dates, bad image paths) |
| `translation*` | Untranslated English left in Indonesian articles |
| `privacy*` | Phone numbers or national ID numbers in published text |
| `check-dist`, `sitemap*`, `seo`, `jsonld` | Build and SEO rules |
| `no-inline-style` | `style="…"` attributes (the site runs a strict Content Security Policy; put CSS in `global.css`) |
| `no-*` guard tests | Re-introducing removed features or banned wording (they also scan `README.md`) |
| `bowobharata-*` | The 3D scene's maths, wiring, loading rules and licence credits |
| `nav-structure`, `linimasa`, `*-wiring` | Pages being wired to the right layout, menu and links |

Several tests read **source code as text** to confirm wiring (for example that a page uses `localizedPath('reply', …)`). If you
refactor and such a test fails, update the test to the new, intended code; do not weaken it.

## 8. The Bowobharata 3D page

A scrolling story with a 3D battlefield behind it, built with three.js and the `motion` library.

- **Loads late on purpose.** `src/scripts/bowobharata-stage.ts` waits for the first user interaction (or 8 seconds idle),
  then dynamically imports the scene. No three.js code or 3D model downloads before that, which is how the page keeps
  Lighthouse at 100. **Do not add imports that pull the scene into the initial page.**
- **Scene code:** `src/lib/bowobharata/KurukshetraScene.ts` assembles "parts" (environment, armies, chariot, pavilion, effects,
  ground dressing). Each part lives in `src/lib/bowobharata/scene/`. Pure maths (camera shots, formations) is in `stage-math.ts`
  and is unit-tested.
- **Quality tiers:** `scene/quality.ts` picks how much to draw for phones, normal desktops and weak desktops, and turns
  effects off in steps (ambient occlusion, depth of field, bloom, shadows) if the frame rate drops.
- **Models:** three `.glb` files in `public/models/` (horse, soldier, base character). Credits and licences are in
  `src/lib/bowobharata/model-credits.ts` and shown on the page; the base character is **CC BY 3.0, so the credit is
  mandatory**. If a model fails to load, built-in procedural shapes are used instead.
- **Rules of thumb:** keep `style=""` out of markup, draw particle sprites on `FX_LAYER`, and re-run Lighthouse (mobile and
  desktop) after changes.

## 9. Security headers

`public/_headers` sets, for every page: no framing (`X-Frame-Options: DENY`), HSTS, a restrictive Permissions-Policy and a
Content Security Policy. Only YouTube (nocookie) and TikTok may be embedded. Astro also emits a per-page CSP for scripts
(`astro.config.mjs`). Cache lifetimes for images, models and hashed assets are set in the same file.

<a id="deploying"></a>

## 10. Deploying

- **CI:** `.github/workflows/ci.yml` runs on every push and pull request to `master`: install, `npm test`, `npm run build`,
  upload `dist/`.
- **Production:** the site is served by Cloudflare as static assets from `dist/` (configured in `wrangler.jsonc`) at
  <https://abilsudarman.my.id>. Cloudflare's own build integration builds with `npm run build` and deploys with Wrangler
  when `master` changes.
- **Known gap:** the workflow's "Deploy to Cloudflare" job needs the repository secrets `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`. Until they are added, that job fails (the test-and-build job still passes). Either add the
  secrets, or delete the deploy and smoke-test jobs and rely on Cloudflare's build.
- **After a release, check:** the home page in both languages, `/sitemap.xml`, one article, and the language toggle.
- **Dependabot** opens pull requests for dependency and GitHub Actions upgrades. Merge them when CI passes.

## 11. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `npm run build` fails in `check-dist` | Read the message: it names the page and rule. Common: title too long, missing `<h1>`, a broken link, a page not in the sitemap |
| `translation.test` says "has N posts" | You added or removed a post; update the expected count in the test |
| A page is missing from the live site | Its status is still `draft`, or it is not in the sitemap / `ROUTES` |
| The language toggle goes to the wrong page | The pair is missing from `ROUTES` |
| `npm test` fails on a "source text" test after a refactor | The test pins the old code; update it to match the new intent |
| Lighthouse dropped | Something loads before interaction (3D code, a large image, a render-blocking script) |
| 3D scene is blank | Check the browser console; the scene falls back to simple shapes if models fail, but not if WebGL is unavailable |

## 12. Conventions

- Match the surrounding code's style and comment density. Short comments that say *why*.
- Keep wording hedged in any user-facing text about people ("I allege", "in my opinion").
- One logical change per commit; commit messages like `feat(seo): …`, `fix(build): …`.
- Never commit secrets. `.env` is git-ignored.
- Ask before changing legal wording, the disclaimer, or the right-of-reply text.

## 13. Glossary

| Term | Meaning |
|---|---|
| **Astro** | The framework that turns templates and content into static pages |
| **Content collection** | A folder of Markdown/JSON files checked against a schema |
| **Schema (Zod)** | The list of required fields and their types for a content type |
| **Slug** | The URL-safe name of a page (`unmasking-abil-sudarman-ababil`) |
| **hreflang** | Tags telling Google which page is the other-language twin |
| **CSP** | Content Security Policy: a browser rule limiting what scripts and frames may load |
| **Lighthouse** | Google's audit that scores Performance, Accessibility, Best Practices, SEO |
| **Parva** | One of the 8 chapters of the Bowobharata story |
| **VAT (vertex animation texture)** | A way to animate thousands of 3D soldiers cheaply on the GPU |
