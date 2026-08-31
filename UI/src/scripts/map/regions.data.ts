// Static lookup table of Victorian transit precincts used by resolveRegionInFocus
// (regionResolver.ts). Kept as a single data file rather than split further —
// it's a cohesive table, not logic.

export interface RegionZone {
  name: string;
  subRegion?: string;
  bounds?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  center?: [number, number]; // [lng, lat]
  radiusKm?: number;
}

export const VICTORIAN_REGIONS: RegionZone[] = [
  {
    name: 'Flinders St • Melbourne CBD',
    bounds: [144.96, -37.821, 144.975, -37.815],
    center: [144.9671, -37.818],
    radiusKm: 0.6
  },
  {
    name: 'Melbourne Central • City Loop',
    bounds: [144.957, -37.814, 144.969, -37.807],
    center: [144.9625, -37.81],
    radiusKm: 0.6
  },
  {
    name: 'Southern Cross • Regional Terminal',
    bounds: [144.947, -37.822, 144.957, -37.814],
    center: [144.9525, -37.8185],
    radiusKm: 0.6
  },
  {
    name: 'Melbourne CBD • Victoria',
    bounds: [144.946, -37.825, 144.978, -37.804],
    center: [144.9631, -37.8136],
    radiusKm: 1.5
  },
  {
    name: 'Southbank • Arts Precinct',
    bounds: [144.955, -37.834, 144.978, -37.82],
    center: [144.967, -37.826],
    radiusKm: 1.0
  },
  {
    name: 'Docklands • Victoria Harbour',
    bounds: [144.93, -37.826, 144.95, -37.809],
    center: [144.941, -37.817],
    radiusKm: 1.2
  },
  {
    name: 'Carlton • University Precinct',
    bounds: [144.954, -37.806, 144.976, -37.791],
    center: [144.963, -37.799],
    radiusKm: 1.1
  },
  {
    name: 'Parkville • Biomedical & Health Hub',
    bounds: [144.938, -37.802, 144.962, -37.778],
    center: [144.95, -37.79],
    radiusKm: 1.4
  },
  {
    name: 'East Melbourne • Olympic & MCG',
    bounds: [144.976, -37.826, 144.993, -37.81],
    center: [144.983, -37.819],
    radiusKm: 1.0
  },
  {
    name: 'Richmond • Transit Interchange',
    bounds: [144.984, -37.836, 145.018, -37.814],
    center: [144.998, -37.824],
    radiusKm: 1.5
  },
  {
    name: 'South Yarra • Chapel Street',
    bounds: [144.979, -37.856, 145.016, -37.832],
    center: [144.993, -37.842],
    radiusKm: 1.4
  },
  {
    name: 'St Kilda • Port Phillip Foreshore',
    bounds: [144.963, -37.878, 145.002, -37.854],
    center: [144.979, -37.866],
    radiusKm: 1.5
  },
  {
    name: 'Fitzroy & Collingwood • Inner North',
    bounds: [144.973, -37.81, 145.002, -37.791],
    center: [144.985, -37.801],
    radiusKm: 1.2
  },
  {
    name: 'Footscray • Western Transit Hub',
    bounds: [144.882, -37.813, 144.926, -37.785],
    center: [144.9, -37.801],
    radiusKm: 1.8
  },
  {
    name: 'North Melbourne • Arden Corridor',
    bounds: [144.923, -37.806, 144.952, -37.783],
    center: [144.938, -37.795],
    radiusKm: 1.3
  },
  {
    name: 'Box Hill • Eastern Transit Hub',
    bounds: [145.108, -37.832, 145.142, -37.808],
    center: [145.1228, -37.8193],
    radiusKm: 1.6
  },
  {
    name: 'Clayton • Monash Innovation Hub',
    bounds: [145.114, -37.932, 145.158, -37.902],
    center: [145.1332, -37.915],
    radiusKm: 1.8
  },
  {
    name: 'Ringwood • Maroondah Interchange',
    bounds: [145.21, -37.828, 145.252, -37.802],
    center: [145.23, -37.815],
    radiusKm: 1.8
  },
  {
    name: 'Dandenong • South-East Transit Hub',
    bounds: [145.195, -37.998, 145.242, -37.968],
    center: [145.215, -37.985],
    radiusKm: 2.0
  },
  {
    name: 'Frankston • Mornington Gateway',
    bounds: [145.105, -38.162, 145.152, -38.125],
    center: [145.124, -38.143],
    radiusKm: 2.2
  },
  {
    name: 'Geelong • Regional Transit Corridor',
    bounds: [144.33, -38.175, 144.39, -38.125],
    center: [144.358, -38.148],
    radiusKm: 3.5
  },
  {
    name: 'Ballarat • Goldfields Regional Hub',
    bounds: [143.825, -37.585, 143.895, -37.535],
    center: [143.858, -37.561],
    radiusKm: 3.5
  },
  {
    name: 'Bendigo • Loddon Campaspe Hub',
    bounds: [144.245, -37.785, 144.315, -36.735],
    center: [144.278, -36.758],
    radiusKm: 3.5
  },
  {
    name: 'Melbourne Airport • SkyBus Terminal',
    bounds: [144.825, -37.69, 144.875, -37.65],
    center: [144.843, -37.671],
    radiusKm: 2.2
  }
];
