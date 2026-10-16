import type { APIRoute } from 'astro';
import { badgeResponse, curatedKlaimPaths } from '../../../../lib/badge-route';

export const getStaticPaths = curatedKlaimPaths;

/** Embeddable verdict badge for one hand-made claim, in English. */
export const GET: APIRoute = ({ params }) => badgeResponse(params.slug!, 'en');
