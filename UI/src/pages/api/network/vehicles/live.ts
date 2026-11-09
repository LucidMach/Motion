import type { APIRoute } from 'astro';
import { getActiveVehiclePositions, vehiclePositionsToGeoJSON, type VehicleMode } from '../../../../lib/vehicleSim';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;
  const modeParam = new URL(request.url).searchParams.get('mode') ?? 'all';
  const mode: VehicleMode = modeParam === 'train' || modeParam === 'tram' ? modeParam : 'all';

  const positions = await getActiveVehiclePositions(origin, mode);
  return new Response(JSON.stringify(vehiclePositionsToGeoJSON(positions)), {
    headers: { 'Content-Type': 'application/json' },
  });
};
