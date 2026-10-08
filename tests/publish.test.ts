import { describe, it, expect } from 'vitest';
import { includeDrafts, isPublishedPost } from '../src/lib/publish';

describe('publish gate', () => {
  it('includeDrafts only when INCLUDE_DRAFTS is "1"', () => {
    expect(includeDrafts({ INCLUDE_DRAFTS: '1' })).toBe(true);
    expect(includeDrafts({ INCLUDE_DRAFTS: 'true' })).toBe(false);
    expect(includeDrafts({})).toBe(false);
  });
  it('hides draft posts in production, shows final', () => {
    expect(isPublishedPost({ translationStatus: 'draft' }, false)).toBe(false);
    expect(isPublishedPost({ translationStatus: 'final' }, false)).toBe(true);
    expect(isPublishedPost({ translationStatus: 'draft' }, true)).toBe(true);
  });
});
