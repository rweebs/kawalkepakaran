import type { APIRoute } from 'astro';
import { curatedPakarPaths, pakarFeedResponse } from '../../../lib/pakar-feed-route';

export const getStaticPaths = curatedPakarPaths;

/** One hand-made expert's claim checks and replies, in Indonesian. */
export const GET: APIRoute = ({ params }) => pakarFeedResponse(params.slug!, 'id');
