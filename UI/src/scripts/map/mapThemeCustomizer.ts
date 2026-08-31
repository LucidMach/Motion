import type mapboxgl from 'mapbox-gl';
import type { ThemePresetId } from '../../types/settings';

export interface MapSeasonPalette {
  fog: {
    color: string;
    highColor: string;
    horizonBlend: number;
    spaceColor: string;
    starIntensity: number;
  };
  grass: string;
  forest: string;
  water: string;
  buildingExtrusion: string;
  buildingOpacity?: number;
  roads?: string;
  transit?: string;
}

export const SEASON_MAP_PALETTES: Record<ThemePresetId, MapSeasonPalette> = {
  cyberpunk: {
    fog: {
      color: 'rgb(8, 14, 30)',
      highColor: 'rgb(24, 12, 48)',
      horizonBlend: 0.08,
      spaceColor: 'rgb(5, 7, 13)',
      starIntensity: 0.85
    },
    grass: '#0e1e2d',
    forest: '#081420',
    water: '#0a1020',
    buildingExtrusion: '#152238',
    buildingOpacity: 0.95,
    roads: '#1e293b',
    transit: '#38bdf8'
  },
  spring: {
    fog: {
      color: 'rgb(205, 240, 220)',
      highColor: 'rgb(255, 225, 238)',
      horizonBlend: 0.09,
      spaceColor: 'rgb(215, 245, 235)',
      starIntensity: 0.1
    },
    grass: '#6ee7b7', // Vibrant spring emerald green
    forest: '#34d399', // Fresh lush foliage
    water: '#38bdf8', // Sparkling clear mountain stream aqua
    buildingExtrusion: '#cbd5e1', // Modern architectural stone
    buildingOpacity: 0.95,
    roads: '#f1f5f9',
    transit: '#10b981'
  },
  summer: {
    fog: {
      color: 'rgb(210, 240, 255)',
      highColor: 'rgb(255, 240, 200)',
      horizonBlend: 0.1,
      spaceColor: 'rgb(220, 245, 255)',
      starIntensity: 0.05
    },
    grass: '#a3e635', // Sun-drenched meadow green
    forest: '#65a30d', // Rich olive summer canopy
    water: '#0284c7', // Deep Mediterranean azure ocean
    buildingExtrusion: '#e2e8f0', // Sunlit limestone
    buildingOpacity: 0.95,
    roads: '#f8fafc',
    transit: '#f59e0b'
  },
  autumn: {
    fog: {
      color: 'rgb(245, 220, 195)',
      highColor: 'rgb(255, 190, 160)',
      horizonBlend: 0.12,
      spaceColor: 'rgb(240, 210, 190)',
      starIntensity: 0.2
    },
    grass: '#d97706', // Golden amber harvest grass
    forest: '#c2410c', // Burnt maple & rust foliage
    water: '#0f766e', // Deep reflective teal lake
    buildingExtrusion: '#d6d3d1', // Warm cedar terracotta stone
    buildingOpacity: 0.95,
    roads: '#fef3c7',
    transit: '#ea580c'
  },
  winter: {
    fog: {
      color: 'rgb(225, 240, 255)',
      highColor: 'rgb(230, 225, 255)',
      horizonBlend: 0.15,
      spaceColor: 'rgb(215, 235, 250)',
      starIntensity: 0.45
    },
    grass: '#e2e8f0', // Frosted snow-covered ground
    forest: '#94a3b8', // Frost-dusted winter pine
    water: '#0891b2', // Glacial frozen turquoise
    buildingExtrusion: '#94a3b8', // Icy crystalline steel
    buildingOpacity: 0.95,
    roads: '#f8fafc',
    transit: '#a855f7'
  },
  obsidian: {
    fog: {
      color: 'rgb(4, 8, 14)',
      highColor: 'rgb(6, 16, 12)',
      horizonBlend: 0.06,
      spaceColor: 'rgb(2, 4, 8)',
      starIntensity: 0.9
    },
    grass: '#061710',
    forest: '#04100b',
    water: '#020617',
    buildingExtrusion: '#0b1612',
    buildingOpacity: 0.95,
    roads: '#0f172a',
    transit: '#10b981'
  }
};

export function applyMapSeasonalPalette(map: mapboxgl.Map, presetId: ThemePresetId): void {
  if (!map) return;
  const palette = SEASON_MAP_PALETTES[presetId] || SEASON_MAP_PALETTES.cyberpunk;

  // 1. Set 3D Atmosphere / Fog & Horizon sky gradient
  try {
    if (typeof map.setFog === 'function') {
      map.setFog({
        color: palette.fog.color,
        'high-color': palette.fog.highColor,
        'horizon-blend': palette.fog.horizonBlend,
        'space-color': palette.fog.spaceColor,
        'star-intensity': palette.fog.starIntensity
      });
    }
  } catch (e) {
    // Handled gracefully for 2D/unsupported projections
  }

  // 2. Dynamic Layer Paint Customization (Grass, Forests, Buildings, Water)
  try {
    const style = map.getStyle();
    if (!style || !style.layers) return;

    for (const layer of style.layers) {
      const id = layer.id.toLowerCase();
      const type = layer.type;

      // Grass / Landuse / Parks / Natural / Vegetation
      if (
        id.includes('landcover') ||
        id.includes('landuse') ||
        id.includes('park') ||
        id.includes('grass') ||
        id.includes('green') ||
        id.includes('garden') ||
        id.includes('wood') ||
        id.includes('forest') ||
        id.includes('scrub') ||
        id.includes('crop')
      ) {
        const isForest = id.includes('forest') || id.includes('wood');
        const color = isForest ? palette.forest : palette.grass;
        if (type === 'fill' && map.getLayer(layer.id)) {
          map.setPaintProperty(layer.id, 'fill-color', color);
        } else if (type === 'background' && map.getLayer(layer.id)) {
          map.setPaintProperty(layer.id, 'background-color', palette.grass);
        }
      }

      // 3D Buildings / Extrusions / Architecture
      if (id.includes('building')) {
        if (type === 'fill-extrusion' && map.getLayer(layer.id)) {
          map.setPaintProperty(layer.id, 'fill-extrusion-color', palette.buildingExtrusion);
          if (palette.buildingOpacity) {
            map.setPaintProperty(layer.id, 'fill-extrusion-opacity', palette.buildingOpacity);
          }
        } else if (type === 'fill' && map.getLayer(layer.id)) {
          map.setPaintProperty(layer.id, 'fill-color', palette.buildingExtrusion);
        }
      }

      // Water / Ocean / Rivers / Lakes
      if (id.includes('water') || id.includes('ocean') || id.includes('river') || id.includes('lake')) {
        if (type === 'fill' && map.getLayer(layer.id)) {
          map.setPaintProperty(layer.id, 'fill-color', palette.water);
        }
      }
    }
  } catch (e) {
    console.warn('[MapThemeCustomizer] Layer color styling note:', e);
  }
}
