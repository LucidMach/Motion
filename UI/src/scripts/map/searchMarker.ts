import mapboxgl from 'mapbox-gl';

const SOURCE_ID = 'motion-search-target-source';
const LAYER_OUTER_ID = 'motion-search-target-outer-ring';
const LAYER_MIDDLE_ID = 'motion-search-target-middle-pulse';
const LAYER_CORE_ID = 'motion-search-target-core';

/**
 * Owns the pulsing 3D destination target dot on the map.
 * Rendered natively via Mapbox WebGL GeoJSON layers so it is 100% stationary
 * and locked to the map coordinates during pan, zoom, orbit, and pitch.
 */
export class SearchMarkerManager {
  private coords: [number, number] | null = null;
  private animFrameId: number | null = null;
  private animStartTime: number = 0;

  constructor(private map: mapboxgl.Map, private onClick?: () => void) {
    this.map.on('style.load', () => {
      if (this.coords) {
        this.addLayers();
        this.updateData(this.coords);
        this.startPulseAnimation();
      }
    });
  }

  render(coords: [number, number], title?: string, subtitle?: string): void {
    this.coords = coords;

    if (!this.map.isStyleLoaded()) {
      this.map.once('style.load', () => {
        if (this.coords) {
          this.addLayers();
          this.updateData(this.coords);
          this.startPulseAnimation();
        }
      });
      return;
    }

    if (!this.map.getSource(SOURCE_ID)) {
      this.addLayers();
    }
    this.updateData(coords);
    this.startPulseAnimation();
  }

  private addLayers(): void {
    if (this.map.getSource(SOURCE_ID)) return;

    this.map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: this.coords
          ? [
              {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: this.coords,
                },
                properties: {},
              },
            ]
          : [],
      },
    });

    // 1. Outer animated radar ring
    if (!this.map.getLayer(LAYER_OUTER_ID)) {
      this.map.addLayer({
        id: LAYER_OUTER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 24,
          'circle-color': 'rgba(56, 189, 248, 0.15)',
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(56, 189, 248, 0.8)',
          'circle-pitch-alignment': 'viewport',
        },
      });
    }

    // 2. Middle pulse ring
    if (!this.map.getLayer(LAYER_MIDDLE_ID)) {
      this.map.addLayer({
        id: LAYER_MIDDLE_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 16,
          'circle-color': 'rgba(99, 102, 241, 0.2)',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': 'rgba(99, 102, 241, 0.7)',
          'circle-pitch-alignment': 'viewport',
        },
      });
    }

    // 3. Crisp glowing core dot
    if (!this.map.getLayer(LAYER_CORE_ID)) {
      this.map.addLayer({
        id: LAYER_CORE_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 8,
          'circle-color': '#38bdf8',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-pitch-alignment': 'viewport',
        },
      });
    }

    if (this.onClick) {
      this.map.on('click', LAYER_CORE_ID, () => this.onClick?.());
      this.map.on('mouseenter', LAYER_CORE_ID, () => {
        this.map.getCanvas().style.cursor = 'pointer';
      });
      this.map.on('mouseleave', LAYER_CORE_ID, () => {
        this.map.getCanvas().style.cursor = '';
      });
    }
  }

  private updateData(coords: [number, number]): void {
    const src = this.map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: coords,
            },
            properties: {},
          },
        ],
      });
    }
  }

  private startPulseAnimation(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.animStartTime = performance.now();

    const animate = (time: number) => {
      if (!this.coords || !this.map.getLayer(LAYER_OUTER_ID)) {
        return;
      }

      const elapsed = (time - this.animStartTime) % 2200;
      const progress = elapsed / 2200; // 0 to 1

      // Outer radar expands from 10px to 34px and fades out
      const outerRadius = 10 + progress * 24;
      const outerOpacity = Math.max(0, 1 - progress);

      // Secondary pulse offset
      const middleElapsed = (time - this.animStartTime + 800) % 2200;
      const middleProgress = middleElapsed / 2200;
      const middleRadius = 8 + middleProgress * 18;
      const middleOpacity = Math.max(0, 1 - middleProgress);

      try {
        if (this.map.getLayer(LAYER_OUTER_ID)) {
          this.map.setPaintProperty(LAYER_OUTER_ID, 'circle-radius', outerRadius);
          this.map.setPaintProperty(
            LAYER_OUTER_ID,
            'circle-stroke-color',
            `rgba(56, 189, 248, ${outerOpacity * 0.85})`
          );
          this.map.setPaintProperty(
            LAYER_OUTER_ID,
            'circle-color',
            `rgba(56, 189, 248, ${outerOpacity * 0.2})`
          );
        }

        if (this.map.getLayer(LAYER_MIDDLE_ID)) {
          this.map.setPaintProperty(LAYER_MIDDLE_ID, 'circle-radius', middleRadius);
          this.map.setPaintProperty(
            LAYER_MIDDLE_ID,
            'circle-stroke-color',
            `rgba(99, 102, 241, ${middleOpacity * 0.75})`
          );
          this.map.setPaintProperty(
            LAYER_MIDDLE_ID,
            'circle-color',
            `rgba(99, 102, 241, ${middleOpacity * 0.18})`
          );
        }
      } catch {
        // Safe catch if layer is removed during animation frame
      }

      this.animFrameId = requestAnimationFrame(animate);
    };

    this.animFrameId = requestAnimationFrame(animate);
  }

  remove(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.coords = null;

    try {
      if (this.map.getLayer(LAYER_CORE_ID)) this.map.removeLayer(LAYER_CORE_ID);
      if (this.map.getLayer(LAYER_MIDDLE_ID)) this.map.removeLayer(LAYER_MIDDLE_ID);
      if (this.map.getLayer(LAYER_OUTER_ID)) this.map.removeLayer(LAYER_OUTER_ID);
      if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
    } catch {
      // Safe catch if map already destroyed
    }
  }
}
