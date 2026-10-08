# Kawal Kepakaran

> 🇬🇧 English · [🇮🇩 Bahasa Indonesia](README.id.md)

**Live site:** <https://kawalkepakaran.org> (Indonesian) · <https://kawalkepakaran.org/en> (English)

This repository holds the source of **Kawal Kepakaran**, an open fact-check of the claims of experts (*pakar*). It checks
credentials, track record and evidence, gives each claim a verdict with a confidence level, and offers every expert named
a **right of reply**. The first documented case, **Case 001**, is Abil Sudarman: the articles, evidence and dated
timeline from the project's earlier life as "Kawal Abil Sudarman" are kept under `/kasus/abil-sudarman`.

Everything on the site is the author's **opinion and notes, not a court ruling**. The site says so on every page.

## Start here

| I am… | Read this |
|---|---|
| **A business reader, lawyer, editor or partner** | [Business guide](docs/business-guide.md): what the site is, what it is not, the rules, how to publish or correct something |
| **A new engineer** | [Engineering guide](docs/engineering-guide.md): how to run it, where things live, how to add content, what must not break |
| **Someone with evidence or a correction** | [CONTRIBUTING.md](CONTRIBUTING.md) |
| **Looking for everything** | [docs/index.md](docs/index.md) |

## What is on the site

| Page | What it is for |
|---|---|
| Home (`/`, `/en`) | The idea in one screen, the latest claim checks, the experts checked |
| Experts (`/pakar`, `/en/experts`) | One profile per pakar: credentials checked, claims tested, replies |
| Claim checks (`/klaim`, `/en/claims`) | Each claim with a verdict (confirmed / partly / not supported / cannot yet be verified), a confidence level, evidence and "what this does not prove" |
| Method (`/metode`, `/en/method`) | How credentials and claims are judged |
| Right of reply (`/hak-jawab`, `/en/right-of-reply`) | How any expert named can respond; replies are published as received |
| Case 001 (`/kasus/abil-sudarman`, `/en/cases/abil-sudarman`) | Articles, evidence, timeline and the Bowobharata 3D allegory for the first case |
| About, videos, TikTok, books, disclaimer | Supporting pages |

## Add an expert or a claim

Open an issue with the **Submit a pakar claim or evidence** form (see [CONTRIBUTING.md](CONTRIBUTING.md)), or send a pull
request that adds one JSON file under `src/content/pakar/` or `src/content/klaim/` (the fields are in `src/lib/schemas.ts`).
Every claim needs a source, "what the evidence shows" and "what it does not prove".

## Run it on your computer (about 10 minutes)

You need **Node.js 22** and **npm** (check with `node -v`).

```bash
git clone https://github.com/rweebs/kawalkepakaran.git
cd kawalkepakaran
npm ci            # install exactly the locked dependencies
npm run dev       # live preview at http://localhost:4321 (shows draft articles too)
```

Useful commands:

| Command | What it does |
|---|---|
| `npm run dev` | Live preview, **includes drafts** |
| `npm test` | Runs all automated tests (about 700, takes a few seconds) |
| `npm run build` | Production build into `dist/`, then runs the safety checks. **Drafts are left out.** |
| `npm run build:preview` | Production-style build that includes drafts |
| `npm run check` | Re-runs the safety checks on an existing `dist/` |

Before you push anything, run `npm test && npm run build`. If both pass, the change is safe to publish.

## How it is built (in one paragraph)

The site is **static**: every page is generated ahead of time into plain HTML files in `dist/`, so there is no server or
database to run. It uses [Astro](https://astro.build) with TypeScript. The 3D battle on the Bowobharata page uses
three.js and loads only after a visitor interacts, which keeps every page fast. Content lives in Markdown and JSON files
under `src/content/`.

## Folder map

```text
src/pages/        One file per page (Indonesian at the root, English under en/)
src/content/      The articles, evidence, books, videos, TikTok entries (Markdown / JSON)
src/lib/          Shared logic: site settings, SEO, sitemap, timeline, schemas, 3D scene
src/components/   Reusable page pieces (banner, language toggle, theme song, ...)
src/layouts/      The page frame (header, menu, footer) used by every page
src/i18n/         Language settings and the Indonesian / English menu text
src/styles/       The site's CSS
public/           Files served as-is: images, 3D models, PDFs, robots.txt, security headers
scripts/          Build helpers, including the checker that guards every release
tests/            Automated tests
source/           The original English article texts, kept as the raw source
docs/             Documentation
```

## Publishing and deployment

1. Merge to `main`. GitHub Actions runs the tests and the build (`.github/workflows/ci.yml`).
2. Cloudflare builds and deploys the site to <https://kawalkepakaran.org> from the same repository.
3. Details, including what to check after a release, are in the [Engineering guide](docs/engineering-guide.md#deploying).

Before any public release of new claims, have a **legal adviser review** the text (Indonesian ITE law, the new Criminal
Code, and the personal data protection law). See the [Business guide](docs/business-guide.md#6-legal-and-safety-rules).

## Licenses

Code: [MIT](LICENSE). Original written content: [CC BY 4.0](LICENSE-CONTENT.md) (third-party material such as evidence
screenshots stays under its owners' terms). The move from the old domain is described in [docs/redirects.md](docs/redirects.md).

## Contact

Corrections, replies and evidence: see the Right of reply page on the site, or [CONTRIBUTING.md](CONTRIBUTING.md).
