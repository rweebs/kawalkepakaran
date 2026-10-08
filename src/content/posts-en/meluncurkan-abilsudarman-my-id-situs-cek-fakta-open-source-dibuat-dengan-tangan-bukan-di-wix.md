---
title: "Launching abilsudarman.my.id: An Open-Source Fact-Check Site, Built by Hand, Not on Wix"
author: "Rahmat Wibowo"
publishedDate: 2026-10-05
classification: pendapat
subjects: ["Abil Sudarman"]
status: final
original: false
---
![Header illustration: ababil birds carrying stones above the home page of abilsudarman.my.id](/img/peluncuran-situs-001.png)

*On 4 October 2026 I launched abilsudarman.my.id, "Kawal Abil Sudarman," a public site that collects the claims about Abil Sudarman, translated articles, and their verification status. The site states that its contents are my opinion and not a verdict, and that Mr. Sudarman has the right to reply to every entry. This post explains the launch and how the site was built. It is not a finding about anyone.*

## What was launched

The site is called **Operation Ababil**. The name comes from the ababil birds that, in the story, carry small stones one by one. The idea is the same: gathering evidence and translated articles in the open, one at a time.

The main parts:

- **Claims under review.** A list of claims about Mr. Sudarman that have been published or quoted, each with a verification status. The site states that "not yet confirmed" does not mean a claim is false.
- **Translated articles.** Articles about him, translated so more people can read them.
- **Right-of-reply and disclaimer pages.** Both are linked from the main navigation.
- **Theme-song player.** The third-party YouTube player only loads after a visitor presses the "Theme song" button, and the song plays in full without needing a login.

The site is published in Indonesian, with an English edition at [abilsudarman.my.id/en](https://abilsudarman.my.id/en).

## How it was built

The code is public at [github.com/rweebs/abilsudarman](https://github.com/rweebs/abilsudarman). The site is a static [Astro](https://astro.build) site with React islands, [Three.js](https://threejs.org) for the hero artwork, and Framer Motion for the reveal and tilt effects. It is served through Cloudflare. The commit history shows how it was made: an initial skeleton with design tokens, a hash-based Content Security Policy with no inline styles, SEO refinement (titles, descriptions, schema, breadcrumbs), and tests.

![The public GitHub repository for abilsudarman.my.id](/img/peluncuran-situs-002.png)

Wappalyzer, run on the live site, detects Astro, React, Framer Motion, Three.js, Cloudflare, HTTP/3 and Open Graph.

![Wappalyzer showing the technologies detected on abilsudarman.my.id](/img/peluncuran-situs-003.png)

## PageSpeed results

I ran Google PageSpeed Insights on the home page on 5 October 2026 at 00:40. Both the mobile and the desktop report gave a score of **100** for Performance, Accessibility, Best Practices and SEO, and **2/2** for Agentic Browsing. This is a lab result from a single run, and the report notes that the scores are estimates and may vary. Google does not yet have field data from real users for this site.

![PageSpeed Insights mobile report for abilsudarman.my.id](/img/pagespeed-mobile.png)

![PageSpeed Insights desktop report for abilsudarman.my.id](/img/peluncuran-situs-004.png)

You can [re-run the report yourself](https://pagespeed.web.dev/analysis/https-abilsudarman-my-id/zlqqztsswy?form_factor=desktop&category=performance&category=accessibility&category=best-practices&category=seo&category=agentic-browsing&hl=en).

## A comparison I think is fair

My earlier [investigative report](/en/cases/abil-sudarman/articles/investigative-report-unpacking-the-credentials-of-abil-sudarman) stated that abilsudarman.com, the personal site Mr. Sudarman uses to promote himself as a "vibe code expert," was built with Wix. That report cited Wappalyzer and domain and IP records as evidence. The two screenshots below are reused from that report.

![Wappalyzer on abilsudarman.com, showing Wix as the CMS, blog platform and e-commerce (from the earlier report)](/img/48c649137c5b8c518ceb0694.png)

![IP lookup for abilsudarman.com: IP 185.230.63.171, Ashburn, Virginia, ISP Wix.com Ltd. (from the earlier report)](/img/41b21db1ee934226991ba62b.png)

An IP lookup shows who hosts a site, not who built it, and Wappalyzer reads a site's technology signals. Both only support the statement that the site runs on Wix, nothing more.

I am not saying that using Wix is wrong. It is a reasonable choice for many people. The comparison is narrower: a claim of deep engineering expertise and the tools behind the site that makes that claim can be checked against each other. The same check applies to my own work, which is why this site's code is public, so that you can inspect it, test it, and tell me where it falls short.

## Limits of this post

- The finding about Wix comes from my earlier report. I have not re-verified it for this post, and the situation may have changed.
- The PageSpeed scores come from a single lab run and may vary.
- The claims on the site have the status "under review." None of them is a finding that Mr. Sudarman did anything unlawful.
- If Mr. Sudarman wants to correct or answer anything on the site or in this post, I will publish his answer in full alongside this post.
- This is my opinion and my account. I am not a lawyer, and this post is not legal advice.
