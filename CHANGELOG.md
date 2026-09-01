# Changelog

All notable changes to the **Motion** multi-modal transit routing engine and user interface will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-09-01

### 🔍 Live Transit & Landmark Search with Native WebGL Target Pin

#### Added
- **Bottom Search Bar React Island**: Floating glassmorphic search bar docked at the bottom center of the viewport (`SearchBar.tsx`, `SearchInput.tsx`, `SearchResultsPanel.tsx`, `SearchResultItem.tsx`).
- **Live Dynamic Geocoding via OpenStreetMap Nominatim**: Real-time forward geocoding across Victoria/Australia integrated into both backend (`server/routes/stops.py`) and frontend client (`UI/src/services/api.ts`) to resolve any building, university faculty, point of interest, or street address.
- **Station & Building Formatting Hierarchy**: Primary title displays clean building or transit station names (omitting house numbers for landmarks), with secondary subtitle displaying formatted street and suburb details.
- **Specific Transit Mode Classification**: Explicit transit categorization with customized icon badges for `Train Station`, `Tram Stop`, `Bus Stop`, `Ferry Terminal`, `Building / Landmark`, `Campus / Landmark`, and `Address / Location`.
- **Focused Single-Option Result View**: Selecting an option transitions the results panel into a focused view showing the selected destination with a `← Back to results` button, `↑ / ↓` result cycling, and active `(X of Y)` counter.
- **Native WebGL 3D Target Dot (`searchMarker.ts`)**: Rendered directly via Mapbox GL WebGL GPU GeoJSON layers (`motion-search-target-core`, `motion-search-target-outer-ring`, `motion-search-target-middle-pulse`), ensuring the glowing radar target dot remains 100% fixed and stationary with zero drift during 360° orbit, pan, zoom, and tilt (0° to 85°).
- **Hierarchical `Esc` Navigation & Clear**: `Esc` key behaves as a step-by-step back button: returns from focused view to match list → closes match list → clears search input and resets state.
- **Dynamic Contextual `Esc` Badge**: Action button in search bar dynamically displays `[← Back Esc]`, `[✕ Close Esc]`, or `[✕ Clear Esc]` based on active state.
- **Global `Enter` Shortcut**: Pressing `Enter` anywhere on the map immediately focuses the search input to begin typing. Pressing `Enter` again executes the search query.
- **`↑` and `↓` Arrow Key Switching**: Pressing Up and Down arrow keys smoothly cycles through search results, dynamically flying the camera and updating the WebGL target dot on each step.
- **Automatic Target Pin Cleanup**: Dispatches `motion:cmd:clear-search-target` to immediately unmount and clear the 3D map target dot when clearing search text or pressing final `Esc`.

---

## [0.2.0] - 2026-08-31

### 🚀 UI Refinement & Control Modernization

#### Added
- **Dynamic Spatial Region Detector**: The top header subtitle under the `MOTION` brand now dynamically detects and displays the active geographic region or transit corridor in focus (e.g., `Melbourne CBD • Victoria`, `Southbank • Arts Precinct`, `Richmond • Transit Interchange`, `Box Hill • Eastern Transit Hub`, `Clayton • Monash Innovation Hub`, `Geelong • Regional Transit Corridor`, etc.) with zero-latency spatial bounding box and centroid proximity matching.
- **Integrated 2D / 3D Camera Movement Button**: Integrated the 2D / 3D camera movement toggle directly into the bottom-right zoom control button panel (`MotionNavigationControl`), featuring an isometric wireframe cube icon for 3D oblique perspective and a square icon for 2D planar overhead view, perfectly sized and styled matching the zoom buttons.
- **Location Recenter Card with Accuracy Subtext**: Refined the top-right GPS button (`#btn-gps-recenter`) to feature a crosshair icon with live status dot, displaying the user's current location name (e.g. `My Location` / `Melbourne CBD`) with accuracy metrics as structured subtext (`±12m accuracy`), providing clear recentering affordance.
- **Explicit Perspective Command**: Added `motion:cmd:set-3d` event handling for unambiguous 2D nadir vs 3D oblique perspective switching.
- **Component Specification Documentation**: Created [`UI/COMPONENTS_SPEC.md`](file:///Users/lucidmach/Motion/UI/COMPONENTS_SPEC.md) documenting all UI components, state machines, and event bus contracts.

#### Changed
- **Clear Location & Precision Hierarchy**: Replaced confusing standalone accuracy text with an actionable location button combining name and precision subtext.
- **Streamlined Navigation HUD**: Kept the top navbar dedicated exclusively to branding, dynamic region detection, and location recentering.

#### Removed
- **Settings Icon Button**: Removed redundant gear icon from the navigation header HUD. (The token modal continues to open automatically when a valid Mapbox token is missing).
- **Secondary Control Dock**: Removed the floating action bar below the navbar (`MapControls.astro`).
- **Live Sensors Panel**: Removed the bottom-left floating telemetry card (`TelemetryPanel.astro`).
- **Bottom-Left Info Button**: Removed the compact Mapbox Attribution (`i` icon) button from the bottom-left corner for a clean viewport.

---

## [0.1.0] - 2026-08-31

### 🌟 Initial Release

#### Core Routing Engine
- Backward-timetable multi-modal journey planner for Victorian Public Transport (PTV).
- Dynamic spatial graph precomputation with SQLite B-tree indexing and KDTree walking transfers.
- Real-time disruption injection with rail replacement bus synthesis vs rail detour routing.

#### 3D Map Interface
- Mapbox GL JS v3 integration with 3D Standard style buildings, terrain, and lighting atmosphere.
- Custom pulsing radar GPS user location marker with heading azimuth indicators.
- Glassmorphic modal for Mapbox Public Access Token configuration and persistence in `localStorage`.
