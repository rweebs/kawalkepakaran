# Business guide

> 🇬🇧 English · [🇮🇩 Bahasa Indonesia](business-guide.id.md) · [Back to docs index](index.md)

For editors, lawyers, partners and anyone who needs to understand the site without reading code.

## 1. What this site is

**Kawal Abil Sudarman** (<https://abilsudarman.my.id>) is an open fact-check website run by Rahmat Wibowo. It publishes:

- **Articles** the author wrote about Abil Sudarman's public claims (translated into Indonesian, or originally in English).
- **Evidence**: screenshots and records, each explained.
- **A timeline**: a dated record of what the author wrote, sent and did.
- **A right of reply**: a standing offer for Abil Sudarman, and anyone else named, to respond.
- **Bowobharata**: the same story told as a Mahabharata allegory, with a 3D scene. It is a creative page, clearly marked as
  allegory, opinion and AI-generated art.

## 2. What the site is **not**

- It is **not** a court ruling, a police finding or a news agency. It says so on every page (the disclaimer banner).
- It does **not** state that any person is guilty. Allegations are labelled as the **author's allegations**.
- It does **not** publish private data (ID numbers, phone numbers, home addresses). Evidence is masked before it is added,
  and an automated test fails the build if a phone number or national ID number appears in published text.

## 3. How every piece of content is labelled

Each article carries one of three labels, shown to readers:

| Label (internal name) | Meaning |
|---|---|
| Opinion (`pendapat`) | The author's view or analysis |
| Fact with evidence (`fakta-dengan-bukti`) | A factual statement that points to checkable evidence |
| Complaint report (`laporan-aduan`) | A complaint or formal letter the author filed or sent |

Articles are either **draft** or **final**. Only **final** content is published. Drafts are visible only on a developer's
computer.

## 4. Rules for evidence

Anyone may send evidence, whether it supports or disputes a claim. Every evidence item must have:

1. **A checkable source**: a link or document origin, and the date a screenshot was taken.
2. **Personal data masked**: ID numbers, student numbers, phone numbers, home addresses, and data of unrelated people.
3. **Two statements**: *what the image shows* and *what it does not prove*.
4. **No rumour, no doxxing**: only matters tied to a public claim.

The full contributor steps are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## 5. Right of reply and corrections

- Abil Sudarman, and anyone else named, may reply by email (address on the Right of reply page).
- A reply is published **as received, without editing**, at the end of the related article under the heading
  *"Tanggapan Abil Sudarman"*, with the date it was received.
- Requests for correction or removal follow the same page. The author decides and records the change.

## 6. Legal and safety rules

- **Before any public release of new claims, have a legal adviser review the text.** The relevant laws are the Indonesian
  Electronic Information and Transactions law (UU ITE), the new Criminal Code (KUHP) and the Personal Data Protection law
  (UU PDP).
- Wording stays hedged ("I allege", "in my opinion"). Do not remove hedging to make a claim sound stronger.
- The automated checks protect the basics (disclaimer on every page, no personal data leaking) but are **not** a
  substitute for legal review.

## 7. How a change goes from idea to live

| Step | Who | What happens |
|---|---|---|
| 1. Request | Anyone | Open an issue on GitHub, or email the author |
| 2. Draft | Editor / engineer | Content is added as a **draft**; it appears only on a developer's computer |
| 3. Review | Author + legal adviser | Text, evidence, labels and hedging are checked |
| 4. Finalise | Editor / engineer | The draft is marked **final** |
| 5. Automated checks | Computer | About 700 tests, then a build with a safety scan of every page |
| 6. Publish | Engineer | Merged to `master`; the site is rebuilt and deployed automatically |
| 7. Verify | Editor | Open the live page and check it reads correctly in both languages |

A typical small change (a corrected sentence) takes minutes once approved. The automated checks take about a minute.

## 8. Who owns what

| Area | Owner |
|---|---|
| Editorial decisions, final wording | The author, Rahmat Wibowo |
| Legal review | The legal adviser |
| Code, build, deployment | The engineering team (see the [Engineering guide](engineering-guide.md)) |
| The domain and Cloudflare account | The site owner |

## 9. Quality promises (and how they are enforced)

| Promise | How it is enforced |
|---|---|
| A disclaimer on every page | The build fails if a page lacks the banner |
| No broken internal links or images | The build checks every link and image |
| English and Indonesian versions stay paired | The build checks the language pairing and the sitemap |
| No private data published | An automated test scans published text |
| The site stays very fast and accessible | The team targets Lighthouse 100 on Performance, Accessibility, Best Practices and SEO |

## 10. Glossary

| Term | Plain meaning |
|---|---|
| **Static site** | Pages are prepared in advance as plain files; nothing runs on a server per visit |
| **Draft / final** | Not yet approved to publish / approved |
| **Build** | The step that turns the content into the finished website |
| **Deploy** | Putting the finished website on the internet |
| **CI** | The automatic test-and-build run that happens when code is pushed |
| **Lighthouse** | Google's tool that scores a page's speed, accessibility and SEO out of 100 |
| **SEO** | Making pages easy for search engines to understand and list |
| **Sitemap** | A file listing every page, so search engines can find them |
| **Right of reply** | The named person's chance to respond, published as received |
| **Allegory** | A story whose characters stand for real people or events |
