---
title: "What's visible from the outside: korika.id By Rahmat Wibowo From InfraLoka How Indonesian Official Governmental AI Entities Lose Its AI In The Core"
sourceUrl: "https://www.infraloka.co.id/blog/what-s-visible-from-the-outside-korika-id-by-rahmat-wibowo-from-infraloka-how-indonesian-official-governmental-ai-entities-lose-its-ai-in-the-core"
archivedAt: 2026-10-10
lang: "en"
kind: "catatan"
status: "tidak-diketahui"
parties: ["korika"]
trimmed: false
draft: false
---
![Header illustration: essay involving Korika](/img/arsip-what-s-visible-from-the-outside-korika-id-by-rahmat-wibowo-from-infraloka-how-indonesian-o-header.webp)

![](/img/arsip-05b9470e14da1b13d3fedee0.webp)

A descriptive review of public technical signals on KORIKA's website performance, accessibility, technology stack, network path, and trademark status followed by a concrete roadmap for what a stronger version of this kind of platform could look like.






> **Scope note.** This piece reports only what anyone can observe from the public-facing side of a website. It does not claim to know why particular technical choices were made, does not draw conclusions about anyone's intent or governance, and does not treat one organization as representative of Indonesia's broader AI ecosystem. Where a claim can't be substantiated by the data, that limitation is stated explicitly rather than implied.







## Organization Profile







![Article content](/img/arsip-c75e881caf3b0b9566f61d07.webp)






KORIKA positions itself as a national consortium for AI research and innovation, backed by a number of corporate and institutional partners.







The homepage displays a row of "Sponsored by" and "Supported by" logos including names such as Huawei, NetApp, Glair, Autodesk, Synnex, Vertiv, Fortinet, EKRAF, and CTIS alongside promotion for an "AI Innovation Summit" event in Jakarta.







### Technology Stack







![Article content](/img/arsip-9223f4effbbc0bbf5724a146.webp)











A scan with the Wappalyzer browser extension on the [korika.id](http://korika.id) homepage, run 20 June 2026, identified the following components:







CMS: WordPressDB: MySQLEcommerce: WooCommerce 10.4.4Builder: wpBakeryLang: PHPProtocol: HTTP/3Forms: FormidablePlugin: Recent Posts Widget 7.1.1







WordPress is the world's most widely used CMS, including by many government bodies its presence alone isn't a quality signal. What's more notable is the combination: WooCommerce and Formidable Form running on a site whose core function is informational, not transactional a pattern more typical of a generically templated build than one purpose-built for a research organization.












![Article content](/img/arsip-a808a56ace0ddda1697b09a4.webp)





> This IP is a Cloudflare edge node, not the true origin server almost any site behind Cloudflare returns a similar address regardless of where it's actually hosted. A public IP lookup can't establish origin location without more (historical DNS, internal headers). So "not hosted in Indonesia" can't be confirmed from this data and neither can the opposite.







### Performance







![Article content](/img/arsip-71572c91d06eeba79d93188a.webp)











![Article content](/img/arsip-0ba8ed62cf905af590f07d23.webp)






### Trademark / IP Status







A keyword search for "KORIKA" on PDKI, Indonesia's official trademark database, run 20 June 2026, returned two results:







![Article content](/img/arsip-16a0287efa7dea5804bf4a7b.webp)





> Both entries belong to an individual not identifiable as affiliated with the AI consortium, in classes unrelated to AI research, and both are expired. This search found no active, AI-relevant "KORIKA" trademark in the public database as of the search date but a null result isn't proof of absence; the registration, if any, may sit under a different legal entity name not captured by this keyword.







### Summary of Findings







* **STACK:** WordPress + WooCommerce + wpBakery + Formidable a combination typical of templated builds rather than purpose-built architecture.
* **HOSTING:** Traffic resolves through a Cloudflare edge in San Francisco; true origin location is unconfirmed.
* **PERFORMANCE:** Core Web Vitals fail on desktop and mobile, mainly via LCP and CLS.
* **ACCESSIBILITY:** 84/100 on both modes above average, below the 90+ mature-practice range.
* **TRADEMARK:** No active AI-relevant "KORIKA" registration found under this keyword as of the search date.







### What a Stronger Platform Would Look Like







None of the findings above require a story about governance to explain most map onto known, fixable technical decisions.







1. Purpose-built front end, not a general template stack, A static-site generator or headless CMS setup would cut page weight and remove the need for a heavyweight builder like wpBakery the largest single contributor to slow LCP on builder-driven WordPress sites.
2. Drop unused e-commerce and form-builder plugins, WooCommerce adds overhead even on pages that never sell anything. Removing it, and swapping Formidable for a lightweight native or serverless form, improves load time and shrinks the attack surface.
3. Image and hero-asset optimization, LCP failures on both desktop and mobile point to the homepage's large background imagery. Responsive AVIF/WebP images at correct render size, with explicit dimensions, would likely move LCP and CLS into "good" range with no architectural change.
4. Accessibility audit beyond automated scoring, An 84/100 score usually reflects missing alt text or low contrast that automated tools catch easily. A manual screen-reader pass would close most of the remaining gap toward 90+.
5. Transparent hosting and data-residency disclosure, Publishing where data is actually processed and stored origin server, not just CDN edge would pre-empt the ambiguity this audit ran into in section 03.
6. IP registration under the full legal entity name, Registering "KORIKA" as a trademark under the consortium's actual legal entity, and renewing before expiry, closes the gap found in section 06.
7. Separation of marketing site from operational infrastructure, A single monolithic WordPress instance serving as marketing site, blog, event page, and directory at once is the likely root cause of the plugin bloat and layout-shift issues above. Splitting these into purpose-specific surfaces resolves performance structurally.







### The "Dogfooding" Problem: WordPress vs. AI-First Engineering







In the tech industry, there is a concept called "dogfooding", using your own philosophies and products to prove they work. KORIKA's mandate is to drive AI innovation, yet relying on WordPress,a traditional, legacy Content Management System,sends a completely mismatched signal.







An AI-collaborative platform should be a living portfolio of **AI-first engineering**. Instead of a static template, the platform could leverage:







* Dynamic, AI-driven content personalization based on the user's sector (academic, industry, or government).
* Semantic search interfaces powered by locally trained Large Language Models (LLMs).
* A custom tech stack built by Indonesian developers to showcase domestic talent.







Using an off-the-shelf WordPress site undersells the technical capabilities of the very ecosystem KORIKA is trying to promote.







### Digital Sovereignty: Cloudflare vs. Local Infrastructure







KORIKA recently launched the .[ai.id](http://ai.id) domain, heavily promoting it as a step toward a sovereign digital identity for Indonesias AI ecosystem. However, protecting and routing that site through Cloudflare, a US-based network, directly contradicts the push for technological independence.A platform advocating for national tech resilience should prioritize local infrastructure. Indonesia has robust, domestically owned cloud providers, data centers, and content delivery networks (CDNs) many of whom are actually listed as KORIKAs industry partners. By routing traffic through foreign-owned nodes, KORIKA misses a critical opportunity to bolster the domestic tech economy and secure national data within local borders.







### Brand Governance: The Un-Trademarked Logo Risk







While an open-source ethos is vital for sharing code and research data, applying it to a national brand identity is highly dangerous. A government-backed institution carries inherent authority and public trust.







If KORIKA's logo lacks formal trademark protection and can be used freely, it creates a massive vulnerability:







* **Phishing and Fraud:** Bad actors can slap the logo on fraudulent "AI investment" schemes, making them look government-sanctioned.
* **Misinformation:** The logo could be used to legitimize fake news or unverified AI applications.
* **Legal Paralysis:** Without a registered trademark, KORIKA lacks the legal teeth to issue swift takedown notices to stop malicious use.







A brand is a promise of trust. Failing to protect that intellectual property legally leaves the public exposed to scams that the organization will be powerless to shut down easily.







For KORIKA to truly lead Indonesia's AI transformation, its operational choices must align with its strategic vision. It needs to operate not just as an administrative body, but as a technical beacon of local engineering, sovereign infrastructure, and strict institutional governance.







#ArtificialIntelligence #TechSovereignty #DevOps #CloudArchitecture #IndonesiaTech #CyberSecurity #KORIKA #DPR #Danantara
