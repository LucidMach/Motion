import type { APIRoute } from 'astro';
import { getActiveVehiclePositions, vehiclePositionsToGeoJSON } from '../../../../lib/vehicleSim';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;
  const positions = await getActiveVehiclePositions(origin, 'tram');
  return new Response(JSON.stringify(vehiclePositionsToGeoJSON(positions)), {
    headers: { 'Content-Type': 'application/json' },
  });
};
