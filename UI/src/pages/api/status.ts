import type { APIRoute } from 'astro';
import { getStops, getRoutes } from '../../lib/staticData';

export const prerender = false;

// Diagnostics: confirms the static data loaded and whether the PTV/Mapbox
// env vars are configured. No database, no in-memory index, no cold-start
// gating consumer anymore - this is a plain ops/debugging endpoint.
export const GET: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;

  let stopsCount = 0;
  let routesCount = 0;
  try {
    const [stops, routes] = await Promise.all([getStops(origin), getRoutes(origin)]);
    stopsCount = stops.length;
    routesCount = routes.length;
  } catch (err) {
    console.warn('[status] Error loading static data counts:', err);
  }

  const apiKey =
    (import.meta.env.PTV_API_KEY as string) ||
    (import.meta.env.PTVOpenDataAPIKey as string) ||
    process.env.PTV_API_KEY ||
    process.env.PTVOpenDataAPIKey ||
    '';
  const ptvConfigured = Boolean(apiKey && !apiKey.toLowerCase().includes('replace_me') && apiKey.trim().length > 5);

  const mapboxToken = (import.meta.env.PUBLIC_MAPBOX_TOKEN as string) || process.env.PUBLIC_MAPBOX_TOKEN || '';
  const mapboxConfigured = Boolean(mapboxToken && mapboxToken.startsWith('pk.') && mapboxToken.trim().length > 20);

  const dataLoaded = stopsCount > 0 && routesCount > 0;

  return new Response(
    JSON.stringify({
      status: dataLoaded ? 'ready' : 'degraded',
      uptime_seconds: process.uptime ? process.uptime() : 0,
      stops_count: stopsCount,
      routes_count: routesCount,
      ptv_api_configured: ptvConfigured,
      mapbox_configured: mapboxConfigured,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
