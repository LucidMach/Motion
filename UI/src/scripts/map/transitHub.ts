export interface PresetLocation {
  name: string;
  coords: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  description: string;
}

// Flinders St Station is the app's default camera target and GPS fallback.
export const DEFAULT_HUB: PresetLocation = {
  name: 'Flinders St Station',
  coords: [144.9671, -37.818],
  zoom: 16.5,
  pitch: 62,
  bearing: -24,
  description: 'Melbourne Metropolitan Rail Core'
};
