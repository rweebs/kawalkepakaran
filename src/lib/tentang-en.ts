// English version of the founder's story (src/lib/tentang.ts). The Indonesian page is a translation of the English original at
// https://www.infraloka.co.id/story; this file is the English text for /en/about, with the same chapter ids and structure.
// The closing MESSAGE is written for this site.
import type { Chapter } from './tentang';

export const HERO_EN = {
  kicker: "The Founder's Story",
  title: 'Finding Light in the Quiet',
  badges: ['AI-driven leader', 'Servant leader'],
  lead: "A first-person account of the road Rahmat Wibowo walked to found InfraLoka: struggle, data, mental health, and the ongoing effort to build a community of Indonesian technology talent.",
  photoAlt: 'Rahmat Wibowo, initiator of the Operation Ababil movement and founder of InfraLoka',
};

export const chaptersEn: Chapter[] = [
  {
    id: 'prolog',
    eyebrow: 'Prologue',
    title: 'The Learner Behind the Titles',
    body: [
      'If you look at my LinkedIn profile or CV today, you will find a list of certifications, engineering roles and community numbers. What that list does not show is that I remain, first and foremost, an ordinary learner: someone who has stumbled more than once, leaned on the kindness of others, and been given more second chances than I can count.',
      'I was born on 13 October 2001. My path since then has gone through several hard seasons: sensory-related feeding difficulty from early childhood, a period of about a year and a half when I almost entirely withdrew from the world, and, only diagnosed in adulthood, a mind that works differently from most (ADHD and Autism Spectrum).',
      'I write this story not to celebrate achievements but to document them honestly. If anything here is useful, I hope it becomes a companion and a small ray of light for anyone who is quietly fighting a battle of their own right now.',
    ],
  },
  {
    id: 'nama',
    eyebrow: 'Chapter 01',
    title: 'A Name Is a Promise',
    body: [
      "I was born by emergency caesarean, and my first days were spent in a hospital incubator: a critical start, by all my family's accounts. My parents first considered the name Azri Hafisuddin: Azri, meaning \"helper\", and Hafisuddin, \"guardian of the faith\". In the end they chose Rahmat Wibowo, grounded in a simple prayer: that rahmat, compassion, would mark my life with blessing, usefulness and care for others.",
      'That prayer became a compass, especially when my body and mind met more limits than most children face so early. From infancy until about the age of six, I genuinely struggled to eat, which I now understand as ARFID (Avoidant/Restrictive Food Intake Disorder), linked to strong sensory sensitivity. My body easily rejected solid textures, and while other children explored the world of flavour, I survived on milk and a handful of bland soft foods.',
      'I only tasted fried chicken in third grade of primary school, chicken noodles in my first semester of university, and could only finish a bowl of chicken porridge without discomfort in my seventh semester, at a small stall in Cisitu, Bandung. At the time I did not understand it, but the root was a difference in sensory processing related to features of the autism spectrum.',
      'My family has a strong Javanese heritage from Yogyakarta, with a lineage that, according to family accounts, traces back to the era of the Sultanate of Demak. What matters to me is not the myth of noble blood but the reminder that every family carries its own history and its own part in shaping who we become.',
    ],
  },
  {
    id: 'itb',
    eyebrow: 'Chapter 03',
    title: 'Bandung Institute of Technology (2019–2023)',
    body: [
      'Being accepted at the Bandung Institute of Technology (ITB) felt like a very large trust, one I felt I owed my best effort to keep. Among thousands of talented students from across Indonesia, I tried to give everything I had. In my first year I was named Best Freshman with a 4.00 GPA, and in 2023 I graduated Cum Laude with a Bachelor of Engineering.',
      'Behind those results was a mind that worked in bursts I did not yet have a name for. My thoughts and the voices of my lecturers often kept replaying for hours after class, a pattern linked to neurodivergent traits that I only understood years later. It let me absorb material quickly, but it also meant my mind rarely rested.',
      'I believe that classroom theory should be tested in the real world as early as possible, so I started looking for internships and side projects wherever I could. In April 2021 I got the first: a fullstack Android internship at PT Cybertrend Intrabuana, followed by freelance projects that sharpened my problem solving and gave me a picture of what the software industry actually needs.',
    ],
  },
  {
    id: 'industri',
    eyebrow: 'Chapter 04',
    title: 'Learning from Industry (2021–2023)',
    body: [
      'Between 2021 and 2023, I was fortunate to be shaped by mentors and teammates at several organisations, each teaching something I still carry today.',
      'At Grab (Aug 2021–Feb 2022), as a Software Engineer Intern on the DigitalGoods team, I had a front-row seat to how systems serving millions of users are built and maintained: disciplined code, strict code review, and a culture that puts reliability first.',
      'At Bangkit Academy (Feb–Jul 2022), a collaboration between Google, Tokopedia, Gojek and Traveloka, my team made the top 53 out of hundreds. That is where my interest in cloud infrastructure took root: managing REST APIs in Go on Google Cloud Run, working with PostgreSQL, and orchestrating simple machine-learning pipelines.',
      'A short internship as a Solutions Architect at Amazon Web Services in Singapore (Jun–Aug 2022) widened my view of what well-designed, cost-effective and globally secure systems look like, which I learned first-hand from practitioners across the region.',
      'And at Xendit (Feb 2022–Jul 2023), under the guidance of patient and capable seniors, I became the DevOps and Cloud engineer I am today: streamlining AWS infrastructure for cost efficiency, writing reusable Terraform modules for RDS and ElastiCache, configuring Amazon EKS networking with Security Groups and Calico policies, implementing AWS VPC Endpoints, learning GitOps deployments with ArgoCD, and supporting PCI DSS compliance and disaster-recovery readiness. Every milestone there was teamwork and a gift of patient mentoring, not something I built alone.',
    ],
  },
  {
    id: 'jejaring',
    eyebrow: 'Chapter 05',
    title: 'A Network Built One Conversation at a Time',
    body: [
      'At some point in those years, I began forming a habit: writing down what I learned and sharing it on LinkedIn. What began as a small circle of classmates slowly grew as I joined discussions, did internships and wrote about the technical lessons I picked up.',
      'The chart on the original page is, to me, not a number to show off: it is a record of thousands of moments when someone chose to connect, reply or share something useful.',
    ],
    pullQuote: 'Every point on that line is someone who was generous with their time.',
  },
  {
    id: 'vietnam',
    eyebrow: 'Chapter 06',
    title: 'Stepping into a Regional Team: Vietnam (2024–2025)',
    body: [
      'In 2024, I took a Cloud Engineer role in Ho Chi Minh City, Vietnam (Feb 2024–Aug 2025). Working in a cross-cultural team tested my communication and adaptability, and just as importantly, my humility in understanding how international teams actually work.',
      'I helped modernise infrastructure from AWS CloudFormation to Terraform, built standard Terraform modules so fellow developers could deploy safely, learned to build CI/CD pipelines with GitHub Actions for staged releases, and used Ansible to simplify routine configuration management.',
      'Alongside work, I set aside time to test my theoretical understanding through certification exams, not as trophies but as a disciplined way to close knowledge gaps that, left alone, could let the team down in the field.',
    ],
    tags: [
      'AWS Certified Solutions Architect – Associate',
      'AWS Certified Developer – Associate',
      'AWS Certified SysOps Administrator – Associate',
      'Google Cloud Certified – Associate Cloud Engineer',
      'CompTIA Security+',
      'HashiCorp Certified: Terraform Associate',
      'AWS Certified Cloud Practitioner',
      'Cisco Verified – DevNet Associate',
    ],
  },
  {
    id: 'keberagaman',
    eyebrow: 'Chapter 07',
    title: 'What a Diverse Network Taught Me',
    body: [
      'A professional network, to me, is a vast classroom. Everyone I know brings something new to learn: from AWS practitioners and company founders who are sources of wisdom, to students and fresh graduates who remind me exactly where I started.',
      'Looking at that network, which stretches from founders and C-level leaders to interns, spread across engineering, data, product, design and management, keeps changing how I think about technology: not as a narrow specialisation, but as something best understood through many viewpoints at once.',
    ],
  },
  {
    id: 'musim-tersulit',
    eyebrow: 'Chapter 08',
    title: 'The Hardest Season',
    body: [
      'Career and technology are only part of this story. The part that most changed how I view life happened when I was at my lowest point.',
      'For roughly a year and a half, I withdrew almost entirely from the outside world, a period close to what Japan calls hikikomori. I stayed home, did not work, and could barely interact with anyone outside my immediate family. My mind was filled with heavy anxiety, an excessive fear of the outside world, and recurring difficult dreams tied to past experiences.',
      'I sought medical help in Bandung and received medication meant to ease my mood. It helped calm the intensity, although for a while my body and mind also felt slowed down, as if wrapped in thick fog.',
      'On the advice of family and those closest to me, I sought a more thorough evaluation at RSKD Duren Sawit in Jakarta. There, psychiatrists and clinicians listened to my history in full: from childhood development and infant sensory difficulties to my easily distracted focus and high emotional sensitivity.',
      'After a thorough clinical evaluation, I was diagnosed with ADHD and Autism Spectrum Disorder, conditions that had gone unrecognised for more than two decades. With proper, carefully supervised treatment, the fog in my mind slowly began to lift. For the first time, I could enjoy a wider variety of foods without discomfort.',
      'I learned to understand that carrying a particular combination of traits, a sharper analytical side alongside real neurological sensitivity, is not a reason to feel above or below anyone. It is simply a condition to be managed wisely, with discipline and with gratitude.',
      'Rebuilding my ability to connect with others took deliberate work, step by step. My confidence and social skills had genuinely eroded. As an engineer, I leaned on tools I knew: practising everyday conversation with AI chatbots and simple NLP experiments, along with psychosocial rehabilitation sessions at the hospital.',
    ],
    pullQuote: 'Almost everyone we pass on the street may be fighting a silent battle we know nothing about.',
  },
  {
    id: 'melayani-lagi',
    eyebrow: 'Chapter 09',
    title: 'Serving Again',
    body: [
      'Once my health began to stabilise, I felt a clear urge to give the energy I had back by contributing to others.',
      "At Rakamin Academy (Jul 2025), I had the chance to mentor participants of BNI's IT OPS ODP Batch 2 programme, covering Java Spring Boot, the ELK Stack, web security fundamentals (OWASP) and databases. Teaching turned out to be the best test of whether I truly understood what I had learned myself.",
      'At PT Pertamina Marine Solutions (Aug 2025–Mar 2026), as a DevOps and Software Engineer, I supported the IT team and coordinated with internal developers and vendor partners: helping streamline Microsoft Azure cloud costs and plan Reserved Instances, supporting an internal AI application built with .NET, React and Azure OpenAI using a Retrieval-Augmented Generation approach for internal documentation, standardising infrastructure-as-code configuration with Terraform, improving Service Desk ticket transparency, and drafting an IT roadmap proposal for long-term efficiency.',
      'That experience trained me to communicate with a wide range of stakeholders, from fellow engineers to senior leadership, in language that stays courteous and solution-oriented.',
      'Outside technology, I also began volunteering at an Umrah travel agency in Jakarta, helping pilgrims prepare for their journey to the Holy Land, a quiet space of service that keeps reminding me to stay grounded and give sincerely.',
    ],
  },
  {
    id: 'momentum',
    eyebrow: 'Chapter 10',
    title: 'Momentum Returns',
    body: [
      'As my physical and mental health recovered, my relationship with the community warmed again. Looking back at when my network grew fastest, the busiest period peaking around September 2023, it is no coincidence but directly tied to the season when I was most actively learning, earning certifications and opening space to share with fellow community members.',
      'Although my background is rooted in cloud and DevOps, some of the most satisfying exchanges came from conversations with people in data, product, design and management, each sharpening how I see technology problems from more than one angle.',
    ],
  },
  {
    id: 'langkah-baru',
    eyebrow: 'Chapter 11',
    title: 'New Steps, Wider Reach (2026–Present)',
    body: [
      'Entering 2026, I try to deliberately divide my time between professional work, community initiatives and service to others.',
      'Since April 2026, I have supported an engineering team based in Bavaria, Germany, as a Senior DevOps Engineer (Consultant), working under local engineering leadership to keep AWS and Azure systems reliable, optimise container workloads on ECS and Kubernetes, and automate deployments.',
      "A short collaboration with the team at Liven in April 2026 let me help review incident-handling practices against standard SRE references, take part in their internal AI Guild discussions, and help start a simple book-sharing club for the team.",
      'And I keep setting aside time to serve pilgrims as an Umrah travel agent in Jakarta, a reminder that meaningful service does not have to sit inside a job title.',
    ],
  },
  {
    id: 'infraloka',
    eyebrow: 'Chapter 12',
    title: 'Founding InfraLoka',
    body: [
      'Because I remember how lost I was when I tried to find my own direction in the tech world, I founded InfraLoka in March 2026 from a simple belief: it should be a bridge for Indonesian technology talent to learn together, exchange experience and reach global opportunities.',
      'Step by step, together with friends who share the same vision, we are building open discussion forums and learning spaces on Discord and educational channels, mentoring initiatives and knowledge-sharing sessions with infrastructure practitioners, a network of young talent who keep deepening their skills in Cloud, DevOps and Platform Engineering, and Indonesian-language educational content written to be genuinely easy to understand.',
      'This mission has never been about personal achievement. It is about how we grow further, together, as one ecosystem, and about using AI deliberately and often, so that everyone on the journey can move faster and be better served.',
    ],
  },
  {
    id: 'angka',
    eyebrow: 'Chapter 13',
    title: 'The Network in Numbers',
    body: [
      'If I step back and put the last few years into numbers, this is what that journey of showing up, sharing and connecting has produced.',
    ],
    pullQuote: 'Behind every metric here is a real person who took the time to talk, share knowledge and offer support.',
  },
  {
    id: 'refleksi',
    eyebrow: 'Chapter 14',
    title: 'Reflection and Gratitude',
    body: [
      'If anyone asks why I chose to document this journey in such detail, the honest answer is gratitude. Everyone starts from a different line, with different privileges and struggles. Looking back, from a child who struggled to eat, to a student wrestling with his own mind, to someone who once withdrew from the world for a year and a half, I realise how much I owe to the mercy of God, my family\'s support, and the guidance of doctors and friends along the way.',
      'Statistically, facing a serious mental-health challenge while still finishing studies and building a career is not an easy path. But I do not see it as proof that I am special. I see it as a reminder that no situation is truly impossible to recover from, if we are willing to ask for help and refuse to give up.',
      'Every opportunity given to me (studying at ITB, interning at tech companies, and finally founding InfraLoka) is a trust I must repay by continuing to help anyone who needs a hand.',
      'If it helps to summarise the technical areas I keep learning and deepening: cloud platforms on AWS, Google Cloud and Microsoft Azure; infrastructure-as-code and configuration with Terraform and Ansible; containers and orchestration with Docker, Kubernetes and ArgoCD; observability with Datadog, CloudWatch and Prometheus/Grafana; programming languages including Go, Python, TypeScript, C# and Java; web frameworks such as React, Next.js, .NET and Spring Boot; and databases including PostgreSQL, Redis, MongoDB and MySQL.',
      'But above every tool on that list, the value I learned most from the hardest years is simple: the humility to keep learning, the courage to ask for help when it hurts, and the sincerity to reach out a hand to others.',
    ],
  },
  {
    id: 'penutup',
    eyebrow: 'Closing',
    title: 'A Word for Anyone Who Is Struggling',
    body: [
      'If you are reading this while feeling alone in the dark, left behind, or tired from caring for your own mental health, believe this: you are not going through it alone, and it will not always be this heavy.',
      'Health, peace of mind and the ability to smile again did not come to me overnight. They were built slowly, one breath and one day at a time. If today feels very heavy, it is okay to rest for a moment, take a deep breath, and reach for professional help when you need it. There is always hope, and a brighter tomorrow is still waiting ahead.',
    ],
  },
];

export const STATS_EN = [
  { label: 'Total connections', value: '3,114' },
  { label: 'Unique companies', value: '1,851' },
  { label: 'Unique positions', value: '2,076' },
  { label: 'Years active', value: '6' },
  { label: 'Average new connections per month', value: '37' },
  { label: 'Top company', value: 'Amazon Web Services' },
  { label: 'Peak month', value: 'Sep 2023' },
  { label: 'Network diversity', value: '59%' },
];

export const MESSAGE_EN = {
  title: 'A Message to Abil Sudarman and the People of Indonesia',
  paragraphs: [
    'Writing and building this site has not been light work, because it asks me to stand between two things I hold equally dear: the courage to question, and the duty to be fair. So allow me to leave a few messages, as a fellow human being who can also be wrong, not as a judge.',
  ],
  toAbil: {
    title: 'To Abil Sudarman',
    paragraphs: [
      'I did not build this site to bring you down. Every claim here has the status "under examination", and "not yet confirmed" does not mean the claim is false. The door to the right of reply is wide open: I will publish your response as received, without editing, alongside the piece it concerns.',
      'If anything is wrong, show the evidence, and I will correct it graciously and apologise for my error. If the evidence you hold answers the matters questioned here, then the truth being answered is a victory for both of us and for the public who have trusted you.',
      'I am tested by the same measure. I have disclosed my interests, and I apply the same framework of evidence to myself. We are both human beings entrusted with a responsibility; may we both be enabled to keep it.',
    ],
  },
  toPublic: {
    title: 'To the People of Indonesia',
    paragraphs: [
      'Do not just believe me. Check for yourself: the evidence on the Evidence page is open to you, the code of this site is open, and every piece names its sources. If you find a shortcoming, tell me.',
      'Hold firmly to the presumption of innocence and the right of reply. Be critical, but stay fair: do not bully, do not spread personal data, do not add to rumours that are not yet proven. We examine claims; we do not destroy a person.',
      'Credentials matter because our young people place their hopes and entrust their futures to degrees and titles. Keeping them honest is in all our interests.',
    ],
  },
  closing: [
    'And to anyone who is being tested right now, whether by a legal matter, by reputation, or by a hard life situation: keep your spirits up. All the suffering you go through is a path to knowing God more, and all truth, sooner or later, will come to light in the end. No struggle is ever in vain.',
    'Do not make victory the final goal of your struggle, and do not make defeat a reason to despair. Make the struggle an effort, the best you can give, then submit to God in tawakal (trust). That way, when you win you will not feel proud, and when you lose you will not feel hopeless.',
    'This is the spirit of servant leadership that I try to live: that true leadership and struggle are not about winning over others, but about serving the truth and benefiting others, even when it means taking a hard road.',
  ],
  signature: '— Rahmat Wibowo',
};
