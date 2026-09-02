# Changelog

All notable changes to the **Motion** multi-modal transit routing engine and user interface will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-09-02

### 🚆 Multi-Modal Transit Navigation HUD, Map Route Plotting & Dynamic Arrival Engine

#### Added
- **Interactive Multi-Modal Route Plotting (`routeLayer.ts`)**:
  - Dynamically renders transit itineraries on the Mapbox GL 3D canvas with neon glowing halo layers, inner solid tracks, and animated dashed pedestrian paths.
  - Official PTV color encoding: Train line group colors (Navy, Cyan, Green, Pink, Gold, Red, Blue), Tram green (`#78BE20`), Bus & Replacement Bus orange (`#FF8200`), Walking cyan (`#38BDF8`).
  - Transfer waypoint stations marked with glowing concentric ring indicators.
  - Automatic dynamic camera bounds fitting (`fitBounds()`) with smooth easing animations and tilt retention.
- **Glassmorphic Navigation Panel HUD (`NavigationPanel.tsx`)**:
  - **Editable Origin Location**: Defaults to GPS "My Location", with click-to-edit autocomplete search across all Victorian transit stops, landmarks, and addresses.
  - **Encapsulated Card Containers**: Symmetrically encapsulated "From", "To", and "Arrive by" rows styled in matching elevated glass cards (`rounded-2xl bg-deep/60 px-3 py-2 border border-subtle/40`).
  - **Direct Arrive By Time Selector**: Contiguous time input with dedicated `[ AM | PM ]` segmented toggle pill and real-time itinerary recalculation.
  - **Arrival Offset Arithmetic**: Preset buttons (`+15m`, `+30m`, `+1h`) add directly to the current arrival time ($T_{\text{target}} = T_{\text{arrival}} + \Delta t$).
  - **Two-Stage `Escape` Key Workflow**: 1st press minimizes HUD into floating pill for map inspection; 2nd press clears the route from the map and resets the search bar.
  - **Floating Minimized Pill**: Sleek bottom pill displaying active route summary, departure time, and total travel duration.
  - **Direction Swap (`⇅`)**: 1-click button to invert origin and destination and recompute reverse itinerary.
  - **Turn-by-Turn Accordion**: Detailed breakdown with transfer notices, stop counts, line icons, and live disruption alerts.
- **Backend Routing Enhancements (`server/routes/routing.py`, `directional_routing/directional_routing.py`)**:
  - **Departure Time Forward-Adjustment**: In ASAP/Latest mode, departure time is enforced $\ge \text{current\_time} + \text{buffer}$, advancing to the next upcoming scheduled service.
  - **Fast-Path Coordinate Geocoding**: Direct `"lat,lon"` numeric string parsing bypassing network geocoder calls.
  - **Intermediate Stop Coordinates Extraction**: Full multi-stop polyline sequences returned in `RouteLeg` schema for accurate curve plotting.
  - **Pure Spatial Grid Search Fallback (`precompute_graph.py`)**: Enables GTFS edge indexing without external SciPy dependency.

---

## [0.4.0] - 2026-09-02

### ⚡ Tiered Search Ranking, Enter Selection & Active Query Re-Search

#### Added
- **Multi-Tier Search Ranking (`geocoding/core.py`)**: Sourced across Curated Landmarks, GTFS transit stops, and live OpenStreetMap geocoding with a 5-tier user-centric priority structure:
  1. **Tier 1**: Buildings, Campuses, Universities & Key Landmarks (*The Spot Building, Alan Finkel Building, Monash University, RMIT, UniMelb, MCG, Marvel Stadium, Crown Melbourne*)
  2. **Tier 2**: Major Train & Railway Stations (*Flinders Street Station, Southern Cross Station, Richmond Station, Clayton Station*)
  3. **Tier 3**: Tram & Light Rail Stops (*Stop 7 - RMIT/Swanston St, Bourke St Mall*)
  4. **Tier 4**: Bus Stops, Interchanges & Ferry Terminals (*Monash University Bus Interchange, local bus bays*)
  5. **Tier 5**: Suburbs, Administrative Regions & Street Addresses (*Carlton, Melbourne CBD, 198 Berkeley St*)
- **Multi-Tier Match Scoring**: Within each tier, candidates are scored by exact match $\rightarrow$ prefix match $\rightarrow$ word-start match $\rightarrow$ substring match $\rightarrow$ clean title length.
- **Search Result Selection via `Enter`**: Pressing `Enter` on the search results list immediately selects the highlighted option (or top match) into the focused view and flies the 3D map camera. Pressing `Enter` in focused view triggers navigation.
- **Active Query Modification Detection**: Typing or editing text after receiving search results or focusing a stop immediately resets the previous focus/selection and ensures `Enter` executes a fresh search query for the new text.
- **Dynamic Submit Action Pill**: Search input pill dynamically renders contextual button badges (`Search ↵`, `Select ↵`, `Navigate ↵`) with matching tooltips and ARIA accessibility labels.
- **Auto-Scroll Keyboard Navigation**: `SearchResultItem.tsx` automatically scrolls highlighted items into view using an active ref when navigating with `↑` / `↓` keys.
- **Ranked Search Unit Tests**: Added automated test coverage in `geocoding/test_geocoding.py` (`test_search_ranks_buildings_then_train_stations_then_trams_then_bus`).

---

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
