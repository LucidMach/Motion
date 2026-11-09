// Curated landmarks that GTFS and Nominatim don't reliably resolve - campus,
// stadium, and market nicknames Melburnians actually type, plus buildings
// too obscure for OSM's index. Checked before Nominatim, never instead of
// it. Ported from geocoding/landmarks.py.

export interface Landmark {
  names: string[];
  lat: number;
  lon: number;
  street: string;
  mode: string;
}

export const LANDMARKS: Landmark[] = [
  { names: ['alan finkel building'], lat: -37.9126, lon: 145.1332, street: 'Alliance Lane, Monash Clayton', mode: 'Building / Landmark' },
  { names: ['the spot', 'the spot building'], lat: -37.8016, lon: 144.9592, street: '198 Berkeley Street, Carlton', mode: 'Building / Landmark' },
  { names: ['monash university', 'monash university clayton', 'monash uni'], lat: -37.9137, lon: 145.1318, street: 'Wellington Road, Clayton', mode: 'Campus / Landmark' },
  { names: ['university of melbourne', 'unimelb'], lat: -37.7983, lon: 144.9610, street: 'Grattan Street, Parkville', mode: 'Campus / Landmark' },
  { names: ['rmit university', 'rmit'], lat: -37.8080, lon: 144.9632, street: 'Swanston & La Trobe St, Melbourne CBD', mode: 'Campus / Landmark' },
  { names: ['melbourne cricket ground', 'mcg'], lat: -37.8199, lon: 144.9834, street: 'Brunton Avenue, East Melbourne', mode: 'Building / Landmark' },
  { names: ['marvel stadium'], lat: -37.8165, lon: 144.9475, street: 'Harbour Esplanade, Docklands', mode: 'Building / Landmark' },
  { names: ['queen victoria market'], lat: -37.8076, lon: 144.9568, street: 'Elizabeth & Victoria St, Melbourne', mode: 'Building / Landmark' },
  { names: ['crown melbourne', 'crown casino'], lat: -37.8228, lon: 144.9582, street: '8 Whiteman Street, Southbank', mode: 'Building / Landmark' },
  { names: ['st kilda beach'], lat: -37.8675, lon: 144.9735, street: 'The Esplanade, St Kilda', mode: 'Building / Landmark' },
];

/** Best single match for a geocode lookup - substring match either direction. */
export function findLandmark(query: string): Landmark | null {
  const norm = query.trim().toLowerCase();
  for (const lm of LANDMARKS) {
    if (lm.names.some((name) => norm.includes(name) || name.includes(norm))) return lm;
  }
  return null;
}

/** All landmarks whose name contains the query, for autocomplete search. */
export function searchLandmarks(query: string): Landmark[] {
  const norm = query.trim().toLowerCase();
  return LANDMARKS.filter((lm) => lm.names.some((name) => name.includes(norm)));
}
