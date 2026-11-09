import type { APIRoute } from 'astro';

export const prerender = false;

// Simple liveness check. Nothing to warm up - stops/routes/vehicle-sim data
// are static files bundled with the deployment, so the function is ready as
// soon as it can run.
export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'Motion Transit Engine API',
      uptime_seconds: process.uptime ? process.uptime() : 0,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
