# `SearchBar` Component Spec

Glassmorphic transit and landmark search bar positioned at the bottom center of the viewport. Allows searching across Victorian transit stations, stops, buildings, university faculties, and landmarks using live dynamic OpenStreetMap Nominatim geocoding and local GTFS schedule data. Displays matched destinations with transit mode badges, street details, focused single-option view, and interactive **Navigate** actions.

---

## 1. File Structure

```
src/components/SearchBar/
├── SearchBar.tsx           # React island root (query state, keyboard coordination, events)
├── SearchInput.tsx         # Bottom glassmorphic input pill with search & contextual Esc badge
├── SearchResultsPanel.tsx  # Floating matches panel docked directly above input with focus view
├── SearchResultItem.tsx    # Match card with mode icons, street info & Navigate button
└── SearchBar.spec.md       # This specification
```

---

## 2. Component Props & Internal State

- **`SearchBar`**: Mounted as an Astro client island (`<SearchBar client:load />` in `index.astro`).
- **Internal State**:
  - `query: string` — Current text query string.
  - `results: StopSearchResult[]` — Matches returned from `motionApi.searchStops` (GTFS database + Nominatim geocoder + offline fallback).
  - `isLoading: boolean` — True while actively searching.
  - `hasSearched: boolean` — True once a search has been executed.
  - `isOpen: boolean` — Visibility of the floating results panel.
  - `selectedIndex: number` — Currently highlighted/active item index.
  - `focusedResult: StopSearchResult | null` — Single selected match when in focused option view.

---

## 3. Event Contracts

### Listens For
*(None directly; coordinates state internally and communicates via window CustomEvents).*

### Dispatches
- `motion:cmd:fly-to` (`CustomEvent<FlyToEventDetail>`):
  - Emitted when an option is selected or navigated with `coords: [lon, lat]`, `zoom: 17.0`, `pitch: 62`, `title`, and `subtitle`.
  - Animates the Mapbox 3D camera and renders the native WebGL target dot at the destination coordinates.
- `motion:cmd:clear-search-target` (`CustomEvent<void>`):
  - Emitted when the search bar is cleared (or on final `Esc`), immediately unmounting and removing the 3D target dot from the map.
- `motion:cmd:navigate-to` (`CustomEvent<NavigateToEventDetail>`):
  - Emitted when the **Navigate** button is clicked on a match, passing `stop_id`, `stop_name`, `stop_lat`, `stop_lon`, and `mode` for the routing engine.

---

## 4. Keyboard Shortcuts & Gestures

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **`Enter` ↵** | Unfocused anywhere on screen | Focuses the search input and highlights text to start typing |
| **`Enter` ↵** | Input focused | Executes search query |
| **`Enter` ↵** | Results list open with highlight | Selects highlighted option into focused view |
| **`↓` (Down Arrow)** | Focused option active | Advances to the next matched destination and flies camera |
| **`↑` (Up Arrow)** | Focused option active | Returns to the previous matched destination and flies camera |
| **`↓` / `↑`** | Results list open | Moves selection highlight up / down |
| **`Esc`** | Focused option view | Goes **back** to the full matches list |
| **`Esc`** | Results list open | Closes the results dropdown (preserves query) |
| **`Esc`** | Panel closed / typing | Clears search input text and removes target dot pin from map |

---

## 5. WebGL 3D Target Dot (`searchMarker.ts`)

- Implemented using native Mapbox GL WebGL GPU GeoJSON layers:
  - `motion-search-target-core`: Crisp glowing cyan circle with white border.
  - `motion-search-target-outer-ring`: Expanding radar ping animation.
  - `motion-search-target-middle-pulse`: Secondary animated pulse wave.
- Rendered in WebGL vertex lockstep with map tiles: 100% fixed with zero drift during 360° orbit, pan, zoom, and tilt (0° to 85°).
