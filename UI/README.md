# Motion UI Design Language: Mapbox Moonlight

Reference: [Designing Moonlight: A New Custom Map Style (Mapbox)](https://medium.com/mapbox/designing-moonlight-a-new-custom-map-d25afec2cc6e)

## Aesthetic & Architecture

The **Moonlight** theme is a high-contrast, minimalist architectural aesthetic designed by Rasagy Sharma for Mapbox. It provides a monochromatic, low-noise backdrop specifically tuned for 3D transit visualization, live GPS navigation, and geospatial telemetry.

### Core Visual Principles
1. **Typography**: Geometric modern sans-serif **Montserrat** (paired with **JetBrains Mono** for numeric telemetry and coordinates).
2. **Monochromatic Two-Tone Palette**:
   - Deep obsidian/midnight slate bases (`#06080d`, `#0c1019`, `#121826`)
   - High-contrast moonlit silvers & whites (`#f8fafc`, `#e2e8f0`, `#cbd5e1`)
   - Monochromatic 3D building extrusions (`#0a0e17` to `#33435c`)
   - Luminous ice-cyan telemetry & radar accents (`#38bdf8`, `#e0f2fe`)
3. **Atmospheric Lighting**:
   - Mapbox Standard 3D engine with runtime `theme: 'monochrome'` and `lightPreset: 'night'`
   - Cosmic celestial horizon fog and realistic star field rendering
4. **Glassmorphism**: Ultra-frosted dark surfaces (`backdrop-filter: blur(20px)`) with subtle silver/cyan border glows.