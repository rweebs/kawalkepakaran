// The data each /pantau island fetches once it scrolls into view (see src/components/PantauLazy.tsx). Same props the
// page renders on the server, so the first paint and the interactive version always agree.
import type { APIRoute, GetStaticPaths } from 'astro';
import { ISLANDS, islandData, type Island } from '../../lib/pantau-props';

export const getStaticPaths: GetStaticPaths = () => ISLANDS.map((name) => ({ params: { name } }));

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(islandData(params.name as Island)), { headers: { 'content-type': 'application/json; charset=utf-8' } });
