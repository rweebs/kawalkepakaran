export const includeDrafts = (env: Record<string, string | undefined>): boolean => env.INCLUDE_DRAFTS === '1';
export const isPublishedPost = (d: { translationStatus: string }, inc: boolean): boolean =>
  inc || d.translationStatus === 'final';
