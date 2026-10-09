---
title: "Launching Kawal Kepakaran: An Open Fact-Check of Expert Claims"
author: "Rahmat Wibowo"
publishedDate: 2026-10-09
classification: pendapat
subjects: ["Kawal Kepakaran"]
status: final
original: true
---
![Illustration: golden scales inside a wayang gunungan, a claim card on one pan and a stone of evidence on the other, with ababil birds flying in the night sky.](/img/peluncuran-kawal-kepakaran-001.png)

*On 9 October 2026 I launched [kawalkepakaran.org](https://kawalkepakaran.org). The site grew out of "Kawal Abil Sudarman" and now tests the claims of experts in general: credentials are checked, evidence is opened, and every expert named has the right to reply. What it publishes is my notes and opinion, not a court ruling.*

## Why the name changed

My first site was built around one person. That is the wrong shape for the long run: what deserves testing is a **claim**, not a person. So the name became Kawal Kepakaran, and the Abil Sudarman matter became **Case 001**, the first of those that may follow. The articles, evidence, timeline and the Bowobharata page from the early days are still there.

## What is on the site

![Diagram of the four verdicts of Kawal Kepakaran: confirmed, partly, not supported and cannot yet be verified, each with a short definition.](/img/peluncuran-kawal-kepakaran-002-en.png)

- **[Experts](/en/experts).** One profile per expert: credentials checked, claims tested, and their reply.
- **[Claim checks](/en/claims).** Every claim gets one of four verdicts (confirmed, partly, not supported, cannot yet be verified), a confidence level, the evidence, and one mandatory section: **what this does not prove**.
- **[Method](/en/method).** The five steps I use, including what each verdict means. "Not supported" is not a statement that a claim is certainly false.
- **[Manifesto](/en/manifesto).** My statement on why accountability should be open, sourced and answerable, as opposed to a blacklist kept in secret.
- **[Case 001](/en/cases/abil-sudarman).** It includes the [Abil Sudarman timeline](/en/cases/abil-sudarman/abil-timeline), which contains only what is already in this site's articles and evidence. Entries whose source gives no date are not given one.
- **[Right of reply](/en/right-of-reply).** It applies to every expert named. Replies are published as received, without editing.

At launch the site holds one expert and five claims. **All five are marked "cannot yet be verified".** That is deliberate: I only raise a claim when the issuer of the credential or a primary source confirms it.

## How it is built

The code is open at [github.com/rweebs/kawalkepakaran](https://github.com/rweebs/kawalkepakaran) under the MIT license. The original writing is licensed CC BY 4.0; third-party material such as evidence screenshots stays under its owners' terms. The site is static, built with Astro, and served through Cloudflare.

Anyone may send evidence that supports or disputes a claim, through the form on GitHub. Please mask personal data, include a source that can be checked, and write what the evidence shows and what it does not prove.

## Measurements

I measured the live home page with a phone simulation (Slow 4G network, CPU four times slower):

- **Largest Contentful Paint 765 ms** and **Cumulative Layout Shift 0.00**.
- Mobile Lighthouse scores of **100** for Accessibility, Best Practices and SEO.

Before one fix, the home page's LCP was 1,331 ms. The cause was the logo at the top of the page, which the browser only requested after the inline CSS had been read; after I embedded the logo directly in the HTML, the number fell to about 780 ms in a local test.

## Limits of this post

- The numbers above come from a single lab run on the home page. I did not run PageSpeed Insights for a Performance score, and the figures can differ on other networks and devices.
- The five claims on the site are marked "cannot yet be verified". None of them is a finding that anyone did something unlawful.
- I am a party to the dispute recorded in Case 001. I say so to let readers weigh it, and every page carries the right of reply.
- If anyone wants to correct or answer anything on the site or in this post, I will publish the reply in full next to this post.
- This is my opinion and my account. I am not a lawyer, and this post is not legal advice.
