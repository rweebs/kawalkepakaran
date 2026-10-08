import { getCollection } from 'astro:content';
import { includeDrafts, isPublishedPost } from './publish';

const INCLUDE_DRAFTS = includeDrafts(process.env);

export async function getPosts() {
  const posts = await getCollection('posts', (e) => isPublishedPost(e.data, INCLUDE_DRAFTS));
  return posts.sort((a, b) => b.data.translationDate.getTime() - a.data.translationDate.getTime());
}

export async function getBukti() {
  return getCollection('bukti');
}

export async function getBuku() {
  return getCollection('buku');
}

export async function getVideos() {
  return getCollection('videos');
}

export async function getTiktok() {
  return getCollection('tiktok');
}

/** English edition of the published posts (same ids as the Indonesian ones), newest first. */
export async function getPostsEn() {
  const posts = await getCollection('postsEn', (e) => INCLUDE_DRAFTS || e.data.status === 'final');
  return posts.sort((a, b) => b.data.publishedDate.getTime() - a.data.publishedDate.getTime());
}
