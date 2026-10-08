// English version of the timeline (src/lib/linimasa.ts). Same events, same sources, same hedging: it is the author's own record
// and opinions, not findings. Keyed by the Indonesian slug so each entry pairs with its Indonesian page (hreflang).
// `src` and `rel` hold the labels for the Indonesian entry's sources and related links, in the same order.

export interface TimelineEn {
  slug: string; // URL slug of the English page
  title: string;
  paragraphs: string[];
  src: string[];
  rel: string[];
}

export const CHANNEL_EN: Record<string, string> = {
  'LinkedIn': 'LinkedIn',
  'Blog InfraLoka': 'InfraLoka blog',
  'Threads': 'Threads',
  'Situs ini': 'This site',
};

export const EVENTS_EN: Record<string, TimelineEn> = {
  'bootcamp-berpakaian-kampus': {
    slug: 'campus-dressed-bootcamp',
    title: 'I wrote about the university terms ASSAI uses',
    paragraphs: [
      'I published a critical analysis of how ASSAI, a non-formal training provider founded by Abil Sudarman, uses university-level terms such as "School", "Campus", "Cohort" and "Enrollment", and of how support from UNESCO, KORIKA, Microsoft and ITB is portrayed in its materials.',
      'This piece is my opinion about brand positioning. I find it misleading; that is my judgement, not a ruling.',
    ],
    src: ['Article on LinkedIn'],
    rel: [],
  },
  'mempertanyakan-gelar-university-of-london': {
    slug: 'questioning-university-of-london-degree',
    title: 'I questioned the University of London degree claim',
    paragraphs: [
      'I wrote several posts questioning the claimed Computer Science (AI/ML) degree from the University of London. The basis was a public record of enrolment in the BINUS Online Management programme, which shows a resignation in 2022/2023, and the absence of any supporting information about the University of London credential.',
      'In one post I wrote about alleged credential forgery and the use of large organisations\' logos without permission, and said I had reported it to the legal and compliance teams of Microsoft and UNESCO.',
    ],
    src: ['Post 1', 'Post 2', 'Post 3'],
    rel: ['Evidence page'],
  },
  'somasi-pertama': {
    slug: 'first-legal-warning',
    title: 'I filed a formal legal warning letter and announced it',
    paragraphs: [
      'I sent a formal warning letter (somasi) to Abil Sudarman and Abil Sudarman School of Artificial Intelligence, then announced it publicly. The letter cites an alleged untrue university-degree claim, use of logos without permission, an unaccredited bootcamp branded as a "School" that I consider misleading, and the absence of a registered trademark.',
      'A somasi is a warning letter. What it contains is my allegation; I do not present it as a ruling.',
    ],
    src: ['Announcement on LinkedIn'],
    rel: [],
  },
  'investigasi-rinci-dan-kawal-kepakaran': {
    slug: 'detailed-investigation-and-kawal-kepakaran',
    title: 'I published an investigation and Kawal Kepakaran',
    paragraphs: [
      'I published a detailed investigation. It covers: the Executive Director role at KORIKA that is attributed to Abil, whereas my research found his role at UNESCO to be coordination in the Project Management Office; the University of London and BINUS degrees that I could not verify; and the "AI Innovator of the Year" award claim, for which I found no documentation I consider credible.',
      'On the same day I announced Kawal Kepakaran, a credential-verification community. In that announcement I cited my findings about Abil as an example, without attaching evidence that others could check independently.',
    ],
    src: ['Investigation', 'Kawal Kepakaran announcement'],
    rel: ['Unmasking Abil Sudarman: Ababil'],
  },
  'perbandingan-dengan-ibrahim-arief': {
    slug: 'comparison-with-ibrahim-arief',
    title: 'I compared Ibrahim Arief with Abil Sudarman',
    paragraphs: [
      'I wrote a comparison between Ibrahim Arief, whom I described as a patriotic technology leader, and Abil Sudarman, whom in that post I linked to alleged forged credentials and an unaccredited AI school.',
      'The stated aim in that post was to criticise a tech ecosystem that, in my view, verifies credentials too little and protects genuine talent too little.',
    ],
    src: ['Post on LinkedIn'],
    rel: [],
  },
  'menelusuri-riwayat-pendidikan': {
    slug: 'tracing-education-history',
    title: 'I traced the education history and published it',
    paragraphs: [
      'I looked into Abil Sudarman\'s education history and publicly questioned the claim of a University of London AI/ML Computer Science degree, citing the lack of verification and an earlier enrolment record in the BINUS Online Management programme. These are my doubts and my assessment based on the evidence I have, not a ruling.',
    ],
    src: ['Post on LinkedIn'],
    rel: ['Evidence page'],
  },
  'merek-korika-dan-gelar-direktur-eksekutif': {
    slug: 'korika-brand-and-executive-director-title',
    title: 'I criticised the KORIKA brand use and the Executive Director title',
    paragraphs: [
      'I criticised the past use of the KORIKA brand without permission and the Executive Director title that, in my view, was self-appointed while he was an intern. In that post I also contrasted it with how I contribute myself, which I called humble.',
      'My judgement about the intern status and the title is my opinion; the role at KORIKA needs to be confirmed by KORIKA.',
    ],
    src: ['Post on LinkedIn'],
    rel: [],
  },
  'abil-sebagai-instruktur': {
    slug: 'abil-as-ai-instructor',
    title: 'I questioned the choice of Abil as an AI instructor',
    paragraphs: [
      'I wrote that Abil Sudarman was listed as an instructor of an AI training programme although he left his undergraduate programme in 2022/2023, and I questioned the instructor-selection standards of the organiser.',
    ],
    src: ['Post on LinkedIn'],
    rel: [],
  },
  'artikel-phantom-ceo-pertama': {
    slug: 'first-phantom-ceo-article',
    title: 'I posted a research article about the Phantom CEO',
    paragraphs: [
      'I posted a research article about the "Phantom CEO" in Gen Z startups. It names Marchel Shevchenko and Abil Sudarman as examples of founders who, in my view, claim titles they are not entitled to.',
      'Naming people as examples in writing like this is not a light matter. The judgements in that article are my opinion, and both have the right to reply.',
    ],
    src: ['Post on LinkedIn'],
    rel: ['The Phantom CEO: Why Fraud Is Gen Z\'s Fastest Growing Side Hustle'],
  },
  'rangkaian-artikel-7-juni': {
    slug: 'june-7-articles',
    title: 'I published three articles and several posts on 7 June',
    paragraphs: [
      'On this day I published the article "The Phantom CEO: Why Fraud Is Gen Z\'s Fastest-Growing Side Hustle", the article "The Phantom CEO Problem", and an article on the foreign-degree verification loophole in Indonesia. The first two name Abil Sudarman, Marchel Shevchenko and Muhammad Alif Ramadhan; the third highlights inconsistencies in Abil\'s and Marchel\'s foreign-degree claims, without independently verified proof.',
      'I also promoted my newsletter "Professional BlackList", which carries all three as case studies.',
      'In two short posts I named three young people who claim CEO and founder titles, and in one of them I compared them with another founder whom I said had been convicted of fraud. That comparison is harsh and could make readers associate the three with a criminal case. I have included it as it was.',
    ],
    src: ['Phantom CEO (article 1)', 'Phantom CEO Problem (article 2)', 'Foreign-degree loophole', 'Newsletter promotion', 'Short post 1', 'Short post 2'],
    rel: ['The Phantom CEO Problem', 'Indonesia\'s Blind Spot: the foreign-degree loophole'],
  },
  'unggahan-keras-13-juni': {
    slug: 'harsh-posts-june-13',
    title: 'I wrote posts in very harsh language on 13 June',
    paragraphs: [
      'On this day I uploaded several posts about Abil Sudarman. In one I cited a ZeroGPT score and my own IQ, then accused Abil of being a BINUS drop-out who submitted a fake CV to KORIKA, and urged that he be reported. In another I tagged many people and institutions, accused him of cheating, credential forgery, financial exploitation and document manipulation, and called him a fraudster who should be removed from Indonesia.',
      'I also promoted InfraLoka\'s "Somasi as a Service" while listing things I had written about Abil, and wrote that he is hypocritical because he built his brand by criticising AI education and then marketed his own school.',
      'The language on this day is the harshest I have used about Abil.',
    ],
    src: ['ZeroGPT/IQ post', 'Warning post', 'Somasi as a Service promotion', 'Post about hypocrisy'],
    rel: [],
  },
  'dikeluarkan-dari-grup-korika': {
    slug: 'removed-from-korika-groups',
    title: 'I was removed from the KORIKA groups and spoke out about it',
    paragraphs: [
      'Between 13 and 15 June I uploaded several posts saying I had been removed from KORIKA\'s WhatsApp group and AI group. I stated that the removal happened because I voiced my allegations about Abil Sudarman, named three officials, cited legal provisions I believe were violated, and said I would pursue criminal and civil action within 14 days if I was not reinstated.',
      'The reason for the removal is my allegation. I do not have an official statement from KORIKA about the reason. I used the language of legal threats in public; I record it here.',
    ],
    src: ['Post 1', 'Post 2', 'Post 3', 'Post 4', 'Post about the WhatsApp group', 'Article on LinkedIn'],
    rel: ['Expelled for Telling the Truth'],
  },
  'logo-di-halaman-career-blueprint': {
    slug: 'logos-on-career-blueprint-page',
    title: 'I wrote about logos on the Career Blueprint course page',
    paragraphs: [
      'I wrote that the landing page of Abil Sudarman\'s "Career Blueprint" course displays company logos without permission, which in my view implies endorsement, and that I had documented it and would follow up through the appropriate channels. This post appeared twice (17 and 18 June).',
      'Whether permission exists is a factual matter that I have not confirmed with those companies.',
    ],
    src: ['Post on LinkedIn'],
    rel: [],
  },
  'tembok-kertas-kampus-malaka-dan-assai': {
    slug: 'paper-wall-malaka-campus-and-assai',
    title: 'I published a regulatory analysis of Malaka Campus and ASSAI',
    paragraphs: [
      'I published a regulatory analysis arguing that Malaka Campus and ASSAI cannot lawfully become universities in a short time. It also says that the founders, Ferry Irwandi, Sabda PS and Abil Sudarman, hold undergraduate credentials that are unverified or incomplete according to my research, in a tone that questions their qualifications. The article also appeared on 17 June.',
    ],
    src: ['Article on LinkedIn'],
    rel: ['The Paper Wall'],
  },
  'laporan-investigasi-dan-sorotan-anak-muda': {
    slug: 'investigative-report-and-youth-scrutiny',
    title: 'I published an investigative report and a youth-influence piece',
    paragraphs: [
      'I published an investigative report doubting Abil Sudarman\'s credentials: the University of London degree, the role at UNESCO, and the unverified "AI Innovator of the Year" award.',
      'On the same day I published an analysis comparing the inherited political power of Gibran Rakabuming Raka with Abil\'s technical credentials. In it I dismissed some of the rumours about Abil while doubting Gibran\'s technical qualifications. The judgements in both pieces are my opinion, not rulings.',
    ],
    src: ['Investigative report', 'Scrutiny of youth influence'],
    rel: ['Investigative report', 'The Scrutiny of Youth Influence'],
  },
  'benchmark-lima-situs': {
    slug: 'five-site-benchmark',
    title: 'I compared five sites with PageSpeed',
    paragraphs: [
      'I published a comparison of five Southeast Asian product sites using a PageSpeed benchmark, asking whether those sites were really engineered or just built by "vibe coding". In that piece I also named Abil Sudarman, Marchel Shevchenko and Muhammad Alif Ramadhan and wrote about their alleged credential forgery.',
      'To be clear: the comparison also put my own InfraLoka site next to the others. That is my interest, and readers are entitled to weigh it.',
    ],
    src: ['Article on LinkedIn', 'Introductory post'],
    rel: [],
  },
  'unggahan-22-juni': {
    slug: 'mocking-post-june-22',
    title: 'I uploaded a mocking post on 22 June',
    paragraphs: [
      'I repeated my judgement about Abil Sudarman\'s hypocrisy and reposted the article on the "Phantom CEO" that names Marchel Shevchenko and Abil.',
      'In one post I wrote in a mocking tone that Abil is a BINUS Online drop-out who claims to be a University of London alumnus, a UNESCO expert and an AI award winner, while pointing out the luxury watch he wears. The mocking tone was my choice and I record it here.',
    ],
    src: ['On hypocrisy', 'Phantom CEO article', 'Mocking post'],
    rel: [],
  },
  'argumen-kemunafikan': {
    slug: 'hypocrisy-argument',
    title: 'I repeated the argument about hypocrisy and logos',
    paragraphs: [
      'I restated the argument that Abil Sudarman built his brand by criticising AI education before launching, rebranding and marketing his own school as faster than school, and questioned the use of company logos in his course ads. I called this a self-serving inconsistency; that is my judgement.',
    ],
    src: ['Post on LinkedIn'],
    rel: [],
  },
  'somasi-kedua-kepada-korika': {
    slug: 'second-legal-warning-to-korika',
    title: 'I published a second legal warning to KORIKA',
    paragraphs: [
      'I published a second and final warning letter to KORIKA, stating that I would report to the police and pursue criminal and civil action, and demanding the dishonourable dismissal of the admins and leadership, with a deadline of 21 July 2026. The letter concerns alleged bullying and defamation against me.',
      'This letter is addressed to KORIKA and its officials, not to Abil Sudarman, but it arises from the same dispute. It states my legal position, not a ruling.',
    ],
    src: ['Article on the InfraLoka blog'],
    rel: ['Second and Final Legal Warning'],
  },
  'artikel-di-blog-infraloka': {
    slug: 'articles-on-infraloka-blog',
    title: 'I published my articles on the InfraLoka blog',
    paragraphs: [
      'I published on the InfraLoka blog a number of articles that had earlier appeared on LinkedIn: the investigative report on Abil Sudarman\'s credentials, a Dunning-Kruger case study detailing the legal action I filed, three "Phantom CEO" articles, the article on the foreign-degree verification loophole, and the analysis of Malaka Campus and ASSAI.',
      'In one article I also mock Abil and fellow "phantom CEOs" and compare them with how I built InfraLoka. I acknowledge that the comparison flatters my own image.',
    ],
    src: ['Investigative report', 'Dunning-Kruger case study', 'The Paper Wall'],
    rel: ['Dunning-Kruger case study', 'The Phantom CEO'],
  },
  'balasan-berulang-di-threads': {
    slug: 'repeated-replies-on-threads',
    title: 'I replied to Threads posts with the same sentence',
    paragraphs: [
      'I replied to several users\' Threads posts, at least eight times, with the same sentence: "waduch ada kasus apaan nich wahai terduga ababil??" (roughly: "whoa, what case is this, oh suspected ababil??"). The replies appeared on posts discussing Abil Sudarman\'s diploma, degree and class material, including one of Abil\'s own posts.',
      'Sending the same sentence repeatedly, including on the posts of the person I name, can feel like harassment. I record this because it happened, and I am open to criticism of it.',
    ],
    src: [],
    rel: [],
  },
  'meluncurkan-kawal-abil-sudarman': {
    slug: 'launching-kawal-abil-sudarman',
    title: 'I launched the Kawal Abil Sudarman site',
    paragraphs: [
      'I launched abilsudarman.my.id, a public site that collects the claims about Abil Sudarman, translated articles, evidence and their verification status. The site states that its contents are my opinion and not a ruling, and that Abil Sudarman has the right to reply to every entry, with any reply published as received.',
      'The site\'s code is open so that anyone can check and correct it.',
    ],
    src: ['Source code on GitHub'],
    rel: ['Launching abilsudarman.my.id', 'Right of reply'],
  },
  'menerbitkan-artikel-terjemahan': {
    slug: 'publishing-translated-articles',
    title: 'I published 14 translated articles on this site',
    paragraphs: [
      'Together with the site launch, I published 14 articles in Indonesian translation: the investigative report, case studies, the "Phantom CEO" series, the analysis of Malaka Campus and ASSAI, the second warning letter to KORIKA, the deep-research report, the AEGIS audit, and the complaint document. All were published on 4 October 2026.',
      'Each article carries a classification label (opinion, fact with evidence, or report/complaint) and a translation notice, and shows the original title and author.',
    ],
    src: [],
    rel: ['All articles', 'Investigative report', 'Deep research report'],
  },
  'artikel-peluncuran-situs': {
    slug: 'site-launch-article',
    title: 'I published the launch article and the PageSpeed results',
    paragraphs: [
      'On 5 October I published the article "Launching abilsudarman.my.id", explaining how this site was built, the PageSpeed results (100 for Performance, Accessibility, Best Practices and SEO, and 2/2 for Agentic Browsing, from a single lab test), and a comparison with abilsudarman.com, which according to my earlier report was built on Wix.',
      'The article notes its limits: the finding about Wix comes from my earlier report and I have not re-verified it, and PageSpeed scores can vary.',
    ],
    src: [],
    rel: ['Launching abilsudarman.my.id'],
  },
};
