import type { APIRoute } from 'astro';
import { getRoutesForMode } from '../../../../lib/routesForMode';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const origin = new URL(request.url).origin;
  const routes = await getRoutesForMode(origin, params.mode ?? '');
  return new Response(JSON.stringify(routes), {
    headers: { 'Content-Type': 'application/json' },
  });
};
