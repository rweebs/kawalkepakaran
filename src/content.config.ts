import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { arsipSchema, bukuSchema, buktiSchema, klaimSchema, pakarSchema, postEnSchema, postSchema, tiktokSchema, videoSchema } from './lib/schemas';

// Entries generated from the archive live in a `generated/` folder (git-ignored); their ids carry no folder, so /pakar/<slug> is the same for both.
const generateId = ({ entry }: { entry: string }) => entry.replace(/^generated\//, '').replace(/\.json$/, '');

export const collections = {
  posts: defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/posts' }), schema: postSchema }),
  postsEn: defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/posts-en' }), schema: postEnSchema }),
  bukti: defineCollection({ loader: glob({ pattern: '**/*.json', base: './src/content/bukti' }), schema: buktiSchema }),
  buku: defineCollection({ loader: glob({ pattern: '**/*.json', base: './src/content/buku' }), schema: bukuSchema }),
  tiktok: defineCollection({ loader: glob({ pattern: '**/*.json', base: './src/content/tiktok' }), schema: tiktokSchema }),
  videos: defineCollection({ loader: glob({ pattern: '**/*.json', base: './src/content/videos' }), schema: videoSchema }),
  pakar: defineCollection({ loader: glob({ pattern: '**/*.json', base: './src/content/pakar', generateId }), schema: pakarSchema }),
  arsip: defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/arsip' }), schema: arsipSchema }),
  klaim: defineCollection({ loader: glob({ pattern: '**/*.json', base: './src/content/klaim', generateId }), schema: klaimSchema }),
};
