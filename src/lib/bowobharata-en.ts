// English version of src/lib/bowobharata.ts. Same allegory, same framing: the author's opinion, not a statement of fact.
import type { Parva } from './bowobharata';

export const PAGE_EN = {
  title: 'Bowobharata',
  heading: 'Bowobharata: Truth vs Justification',
  description: "Bowobharata: the Mahabharata as an allegory of Rahmat Wibowo's journey in the Timeline, Truth vs Justification. The author's opinion, AI illustrations, sources in Evidence.",
  kicker: 'Mahabharata allegory',
  lead: 'Truth vs Justification. I retell the journey in the Timeline as the war of Kurukshetra: a different era, the same battlefield.',
};

export const FRAMING_EN: string[] = [
  'This page is an allegory and my opinion, not a ruling and not a statement of fact. I use the story of the Mahabharata to retell my journey in the Timeline.',
  'The posters on this page are AI-generated illustrations. The marks and writing inside them are part of the illustration and my opinion; the factual basis is in Evidence and the Timeline, with source links.',
  'Abil Sudarman has the right to reply through the right of reply, and I will publish his reply as received.',
];

export const POSTERS_EN = {
  wide: { alt: 'Bowobharata poster: Rahmat Wibowo as Basudewa Krishna on the left and Abil Sudarman as Sengkuni on the right, an AI illustration with a Mahabharata theme.' },
  krishna: { alt: 'AI illustration of Rahmat Wibowo as Basudewa Krishna with a flute, a blue banner and a white horse-drawn chariot.' },
  sengkuni: { alt: 'AI illustration of Abil Sudarman as Sengkuni with dice, a mask and a game board.' },
};

type ParvaEn = Pick<Parva, 'title' | 'episode' | 'paragraphs'>;

export const PARVAS_EN: Record<string, ParvaEn> = {
  'dadu-di-hastinapura': {
    title: 'The Dice at Hastinapura',
    episode: "Sengkuni's dice game at Hastinapura, where victory is decided by dishonest dice.",
    paragraphs: [
      'In this allegory, the dice game is about the degrees, university terms and image that I question: whether what is presented matches the public record.',
      'At this stage I was only asking and writing. What it contains is my opinion and doubts, not a ruling.',
    ],
  },
  'duta-perdamaian': {
    title: 'The Peace Envoy',
    episode: 'Krishna comes to Hastinapura as an envoy before the war, asking for a settlement without battle.',
    paragraphs: [
      'Before prolonging the debate, I chose an orderly path: a formal warning letter and an open investigation with sources that can be checked.',
      'A somasi is a warning letter. What it contains is my allegation, not a ruling.',
    ],
  },
  'sekutu-dan-perbandingan': {
    title: 'Allies and Comparisons',
    episode: 'Both sides gather allies and weigh their strength before Kurukshetra.',
    paragraphs: [
      'I compared, traced histories, and questioned brands and titles that in my view need explaining.',
      'These comparisons are my assessment and are open to correction.',
    ],
  },
  'perang-narasi': {
    title: 'The War of Narratives',
    episode: 'The eighteen days of Kurukshetra: a long war in which words and strategy are tested.',
    paragraphs: [
      'This is the longest and messiest part of my record: research articles, posts in harsh language, and also posts with a mocking tone. I record them as they were, including what I myself think can be criticised.',
      'The war allegory does not justify harsh language; it only depicts how long the debate lasted.',
    ],
  },
  'senjata-data': {
    title: 'The Weapon of Data',
    episode: 'Krishna did not take up arms, he directed; here the weapon is data that can be tested.',
    paragraphs: ['I compared five sites with PageSpeed so that the measure is a number others can repeat, not just an opinion.'],
  },
  'somasi-kedua': {
    title: 'The Second Warning',
    episode: 'A second warning before the battle continues.',
    paragraphs: ['I published the second warning letter and put my articles on the InfraLoka blog so that the documentation is kept in one place.'],
  },
  'kurukshetra-digital': {
    title: 'Digital Kurukshetra',
    episode: 'The battlefield moves to the timeline and the comment sections.',
    paragraphs: ['I replied to posts on Threads with the same sentence over and over, which can feel like a nuisance, and then launched the Kawal Abil Sudarman site so that the discussion could move to a more orderly place.'],
  },
  'dharma-menemukan-jalannya': {
    title: 'Dharma Finds Its Way',
    episode: 'The end of the Mahabharata is not a celebrated victory but a lesson about dharma.',
    paragraphs: [
      'So far the result is documentation: articles translated, PageSpeed results published, and everything open to correction.',
      'There is no ruling here. Abil Sudarman has the right to reply through the right of reply, and I will publish his reply as received.',
    ],
  },
};

export const BOWO_UI = {
  en: { parva: 'Parva', notesLabel: 'Notes about this page', creditsLabel: '3D model credits', credits: '3D model credits', source: 'Source', links: { evidence: 'Evidence', timeline: 'Timeline', reply: 'Right of reply' },
        foot: 'This whole page is allegory and my opinion. Corrections or replies:' , footReply: 'Right of reply', or: 'or' },
  id: { parva: 'Parva', notesLabel: 'Catatan tentang halaman ini', creditsLabel: 'Kredit model 3D', credits: 'Kredit model 3D', source: 'Sumber', links: { evidence: 'Bukti', timeline: 'Linimasa', reply: 'Hak jawab' },
        foot: 'Seluruh halaman ini adalah kiasan dan pendapat saya. Koreksi atau jawaban:', footReply: 'Hak jawab', or: 'atau' },
};
