import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { bukuSchema, buktiSchema, klaimSchema, pakarSchema, postEnSchema, postSchema, tiktokSchema, videoSchema } from './lib/schemas';

export const collections = {
  posts: defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/posts' }), schema: postSchema }),
  postsEn: defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/posts-en' }), schema: postEnSchema }),
  bukti: defineCollection({ loader: glob({ pattern: '**/*.json', base: './src/content/bukti' }), schema: buktiSchema }),
  buku: defineCollection({ loader: glob({ pattern: '**/*.json', base: './src/content/buku' }), schema: bukuSchema }),
  tiktok: defineCollection({ loader: glob({ pattern: '**/*.json', base: './src/content/tiktok' }), schema: tiktokSchema }),
  videos: defineCollection({ loader: glob({ pattern: '**/*.json', base: './src/content/videos' }), schema: videoSchema }),
  pakar: defineCollection({ loader: glob({ pattern: '**/*.json', base: './src/content/pakar' }), schema: pakarSchema }),
  klaim: defineCollection({ loader: glob({ pattern: '**/*.json', base: './src/content/klaim' }), schema: klaimSchema }),
};
