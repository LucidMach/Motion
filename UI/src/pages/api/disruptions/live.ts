import type { APIRoute } from 'astro';
import { fetchLiveServiceAlerts } from '../../../lib/disruptions';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const windowMinsParam = Number(url.searchParams.get('window_mins'));
  const windowMins = Math.min(360, Math.max(5, windowMinsParam || 60));

  try {
    const alerts = await fetchLiveServiceAlerts(url.origin, windowMins);
    return new Response(JSON.stringify(alerts), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.warn('[disruptions/live] Error fetching live alerts:', err);
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
