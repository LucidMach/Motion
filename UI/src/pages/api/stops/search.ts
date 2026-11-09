import type { APIRoute } from 'astro';
import { search } from '../../../lib/geocodingSearch';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const q = url.searchParams.get('q');
  if (!q || q.length < 1) {
    return new Response(JSON.stringify({ detail: 'Query parameter "q" is required' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const limitParam = url.searchParams.get('limit');
  const limit = Math.min(50, Math.max(1, Number(limitParam) || 10));

  const places = await search(url.origin, q, limit);
  return new Response(JSON.stringify(places), {
    headers: { 'Content-Type': 'application/json' },
  });
};
