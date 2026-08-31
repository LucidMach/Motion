# Changelog

All notable changes to the **Motion** multi-modal transit routing engine and user interface will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-08-31

### 🚀 UI Refinement & Control Modernization

#### Added
- **Dynamic Spatial Region Detector**: The top header subtitle under the `MOTION` brand now dynamically detects and displays the active geographic region or transit corridor in focus (e.g., `Melbourne CBD • Victoria`, `Southbank • Arts Precinct`, `Richmond • Transit Interchange`, `Box Hill • Eastern Transit Hub`, `Clayton • Monash Innovation Hub`, `Geelong • Regional Transit Corridor`, etc.) with zero-latency spatial bounding box and centroid proximity matching.
- **Header 2D / 3D Segmented Toggle Switch**: Placed directly inside the top navigation HUD alongside the GPS status control, featuring glassmorphic active pill states and synchronization with map pitch transitions.
- **Interactive GPS Recenter Action**: The GPS accuracy status pill now functions as an interactive recenter button (`#btn-gps-recenter`) that smoothly flies the 3D camera to the user's live coordinates on click with hover animations.
- **Explicit Perspective Command**: Added `motion:cmd:set-3d` event handling for unambiguous 2D nadir vs 3D oblique perspective switching.
- **Component Specification Documentation**: Created [`UI/COMPONENTS_SPEC.md`](file:///Users/lucidmach/Motion/UI/COMPONENTS_SPEC.md) documenting all UI components, state machines, and event bus contracts.

#### Changed
- **Renamed GPS Indicator**: Updated status text from `"GPS Locked"` to `"GPS Accuracy: ±Xm"` (and `"GPS Accuracy: Acquiring..."` / `"GPS Accuracy: Melbourne CBD (Approx)"` during fallback states).
- **Consolidated Navigation HUD**: Unified header controls into a single streamlined top bar, giving the 3D map canvas maximum unobstructed screen real estate.

#### Removed
- **Settings Icon Button**: Removed redundant gear icon from the navigation header HUD. (The token modal continues to open automatically when a valid Mapbox token is missing).
- **Secondary Control Dock**: Removed the floating action bar below the navbar (`MapControls.astro`).
- **Live Sensors Panel**: Removed the bottom-left floating telemetry card (`TelemetryPanel.astro`).

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
