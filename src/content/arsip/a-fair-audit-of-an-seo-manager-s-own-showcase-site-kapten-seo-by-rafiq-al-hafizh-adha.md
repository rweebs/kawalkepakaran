---
title: "A Fair Audit of an SEO Manager's Own Showcase Site: Kapten SEO by Rafiq Al Hafizh Adha"
sourceUrl: "https://www.infraloka.co.id/blog/a-fair-audit-of-an-seo-manager-s-own-showcase-site-kapten-seo-by-rafiq-al-hafizh-adha"
archivedAt: 2026-10-10
lang: "en"
kind: "analisis"
status: "tidak-diketahui"
parties: ["rafiq-al-hafizh-adha"]
trimmed: false
draft: false
---
![Header illustration: fair review involving Rafiq Al Hafizh Adha](/img/arsip-a-fair-audit-of-an-seo-manager-s-own-showcase-site-kapten-seo-by-rafiq-al-hafizh-adha-header.webp)

![A fair audit of an SEO manager's own showcase site: Kapten SEO](/img/arsip-fair-audit-kaptenseo-rafiq-001.webp)

A freelance SEO manager's best advertisement is the work he chooses to show. This post reviews the one project his portfolio features, kaptenseo.com, on what it shows publicly: the technical scores are strong, while the page content and the evidence behind the claims are not.

*This is my opinion and analysis of publicly visible material, reviewed on 26 September 2026 from screenshots and a read-only fetch of the public homepage. I did not test rankings, traffic or client results, and I am not judging the person. Rafiq Al Hafizh Adha is invited to respond (see the end of this post).*

## What I reviewed and how

The subject is **Kapten SEO** (kaptenseo.com), presented on the portfolio of Rafiq Al Hafizh Adha as a "technical SEO and PageSpeed service website focused on Core Web Vitals, search performance, and faster user experiences." His LinkedIn profile lists him as a freelance Search Engine Optimization Manager since January 2026 and a Full Stack Engineer since June 2026.

I looked at four things: his portfolio page for the project, the live homepage, the PageSpeed Insights reports taken on 25 September 2026, and the homepage's HTML (title, meta description, canonical, headings, structured data). I only judged what a prospective client could see for themselves.

![The live homepage of kaptenseo.com, captured 25 September 2026](/img/arsip-fair-audit-kaptenseo-rafiq-002.webp)

## What holds up

Credit where it is due. The technical foundation is good:

| PageSpeed Insights (25 Sep 2026) | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| Desktop | 100 | 95 | 100 | 92 |
| Mobile | 88 | 96 | 100 | 92 |

The HTML also gets several basics right: a self-referencing canonical, `index, follow` robots with large-preview directives, `lang="id"` matching the Indonesian content, a 52-character title ("Kaptenseo | Jasa Digital Marketing Periklanan Online") that fits a search result, alt text on every image, an Open Graph image, and a breadcrumb schema. For a service that sells page speed, a 100 on desktop performance is a fair proof point.

![PageSpeed Insights, desktop report for kaptenseo.com](/img/arsip-fair-audit-kaptenseo-rafiq-004.webp)

![PageSpeed Insights, mobile report for kaptenseo.com](/img/arsip-fair-audit-kaptenseo-rafiq-005.webp)

## What does not hold up

**1. The hero copy is close to unreadable.** Under the yellow headline, the three supporting lines ("cara jitu meningkatkan bisnis Anda di mesin pencari…", "bukan hanya dengan website tapi juga media lain…", "Ayo, gabung sekarang…") are dark grey text on a dark navy panel. This is visible in the screenshot and the text is in the page HTML, so it is a styling fault, not missing content. I did not measure the exact contrast ratio, but by eye it is well below the 4.5:1 that WCAG expects for body text. It sits next to an Accessibility score of 95 to 96, which shows how little an automated score can catch. A score is not an audit.

**2. The heading hierarchy is inverted.** The `<h1>` is the white banner line "JASA PERIKLANAN ONLINE PROFESIONAL & BERGARANSI". The large yellow headline that visitors actually read as the main message, "Tingkatkan omset bisnis online dan offline dengan digital marketing," is an `<h2>`. For a site selling SEO, the page's own primary heading and its visual hierarchy disagree.

**3. A template leftover is in the navigation.** The menu includes an item labelled **"Elementor #14680"**. That is the default name of an unfinished Elementor template page. On a live commercial homepage of a company that sells search optimisation, it reads as an unchecked draft.

**4. The meta description is too long.** It is 191 characters and stuffed with emoji and claims ("Dipercaya Puluhan UKM & perusahaan," "Harga terjangkau"), so Google will truncate it at roughly 155 to 160 characters and drop the closing selling point. It should be shorter and lead with the service.

**5. "Bergaransi" (guaranteed) in the H1.** Search visibility cannot honestly be guaranteed, and Google's own guidance warns against any SEO provider that guarantees rankings. The banner covers "online advertising," which is a broader claim, but the word still sits in the most prominent heading on the page.

**6. Structured data that needs checking.** The homepage carries `LocalBusiness` markup with an `AggregateRating`. I did not verify where those ratings come from. Review or rating markup is only valid when it reflects genuine, visible reviews, and marking up self-declared ratings can lead to a manual action. I am flagging it as something to check, not as a finding.

**7. The case study has no evidence.** The portfolio entry is generic: "SEO and PageSpeed service for the search optimization space." It names no client, no starting metrics, no target keywords, no ranking or traffic outcome and no time frame. The one thing that can be verified, the PageSpeed score, is a property of the site itself, not a result delivered for a client. For an SEO manager the missing evidence is the main gap.

![The portfolio page for the Kapten SEO project](/img/arsip-fair-audit-kaptenseo-rafiq-003.webp)

## What a client should ask for instead

If you are hiring for SEO, ask for:

1. **A baseline and an outcome:** the metric before, after and over what period.
2. **A named client or a written reference** you can contact.
3. **The queries targeted** and their positions in Search Console, not screenshots.
4. **An audit of their own site** to the standard they would apply to yours, including contrast, heading order and leftover template items.
5. **No guarantees** about rankings.

## Limits of this review

- Everything here comes from public material visible on 26 September 2026. Pages change, so the findings may not reflect later fixes.
- I did not test rankings, traffic, backlinks or the accuracy of any client claims.
- The contrast assessment is by eye from a screenshot, not a measured ratio.
- Strong PageSpeed scores are real. They do not measure whether the SEO work produced business results.
- This is my opinion and not professional certification of anyone's competence.

## Right of reply and correction

Mr. Rafiq Al Hafizh Adha is invited to respond, correct, or add context, for instance client results, the source of the ratings, or fixes already made. A substantive reply may be published alongside this article, edited only for privacy, safety and relevance. If reliable evidence shows any statement here is wrong, I will correct it and note the change.

#SEO #TechnicalSEO #PageSpeed #Accessibility #ProfessionalReview

