# `SearchBar` Component Spec

Glassmorphic transit and landmark search bar positioned at the bottom center of the viewport. Allows searching across Victorian transit stations, stops, buildings, university faculties, and landmarks using live dynamic OpenStreetMap Nominatim geocoding and local GTFS schedule data. Displays matched destinations with transit mode badges, street details, focused single-option view, multi-tier ranking, and interactive **Navigate** actions.

---

## 1. File Structure

```
src/components/SearchBar/
├── SearchBar.tsx           # React island root (query state, keyboard coordination, events)
├── SearchInput.tsx         # Bottom glassmorphic input pill with search & contextual Esc/Enter badges
├── SearchResultsPanel.tsx  # Floating matches panel docked directly above input with focus view
├── SearchResultItem.tsx    # Match card with mode icons, street info, auto-scroll & Navigate button
└── SearchBar.spec.md       # This specification
```

---

## 2. Component Props & Internal State

- **`SearchBar`**: Mounted as an Astro client island (`<SearchBar client:load />` in `index.astro`).
- **Internal State**:
  - `query: string` — Current text in the input pill.
  - `lastSearchedQuery: string` — Query string for which current `results` were fetched.
  - `results: StopSearchResult[]` — Matches returned from `motionApi.searchStops` (GTFS database + Nominatim geocoder + curated landmarks).
  - `isLoading: boolean` — True while actively executing search query.
  - `hasSearched: boolean` — True once a search has been executed.
  - `isOpen: boolean` — Visibility of the floating results panel.
  - `selectedIndex: number` — Currently highlighted item index in the results list (`0` to `results.length - 1`, or `-1` if unselected).
  - `focusedResult: StopSearchResult | null` — Single selected match when in focused option view.
  - `submitActionType: 'search' | 'select' | 'navigate'` — Computed action mode driving the input pill's Enter badge and button label.

---

## 3. Search Result Ranking Hierarchy (`geocoding/core.py`)

Search results are aggregated across Curated Landmarks, GTFS transit stops, and live OpenStreetMap geocoding, deduplicated, and sorted into a 5-tier user-centric priority structure:

| Tier | Category / Mode | Examples |
| :--- | :--- | :--- |
| **Tier 1** | **Buildings, Universities, Campuses & Key Landmarks** | The Spot Building, Alan Finkel Building, Monash University, UniMelb, RMIT, MCG, Marvel Stadium, Crown Melbourne |
| **Tier 2** | **Train & Railway Stations** | Flinders Street Railway Station, Southern Cross Station, Richmond Station, Clayton Station |
| **Tier 3** | **Tram & Light Rail Stops** | Stop 7 - RMIT/Swanston St, Flinders St/Swanston St, Bourke St Mall |
| **Tier 4** | **Bus Stops, Interchanges & Ferry Terminals** | Monash University Bus Interchange, regional bus bays, ferry wharves |
| **Tier 5** | **Suburbs, Administrative Regions & Street Addresses** | Carlton, Melbourne CBD, 198 Berkeley Street |

### Match Relevance Scoring (Within Each Tier)
Within each tier, results are scored and sorted by:
1. **Exact match** (`query.lower() == stop_name.lower()`)
2. **Full name prefix match** (`stop_name.lower().startswith(query.lower())`)
3. **Word-start prefix match** (e.g. `"Spot"` in `"The Spot Building"`)
4. **Substring match**
5. **Clean / shortest title length**

---

## 4. Event Contracts

### Listens For
*(None directly; coordinates state internally and communicates via window CustomEvents).*

### Dispatches
- `motion:cmd:fly-to` (`CustomEvent<FlyToEventDetail>`):
  - Emitted when an option is selected or navigated with `coords: [lon, lat]`, `zoom: 17.0`, `pitch: 62`, `title`, and `subtitle`.
  - Animates the Mapbox 3D camera and renders the native WebGL target dot at the destination coordinates.
- `motion:cmd:clear-search-target` (`CustomEvent<void>`):
  - Emitted when the search bar is cleared (or on final `Esc`), immediately unmounting and removing the 3D target dot from the map.
- `motion:cmd:navigate-to` (`CustomEvent<NavigateToEventDetail>`):
  - Emitted when the **Navigate** button is clicked on a match or triggered via `Enter` in focused view, passing `stop_id`, `stop_name`, `stop_lat`, `stop_lon`, and `mode` for the routing engine.

---

## 5. Keyboard Shortcuts & State Transitions

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **`Enter` ↵** | Unfocused anywhere on screen | Focuses the search input and highlights text to start typing |
| **`Enter` ↵** | Input focused (no results open / query modified) | Executes search query (`Search ↵`) |
| **`Enter` ↵** | Results list open (query unmodified) | Selects highlighted option (or top match) into focused view and flies 3D camera (`Select ↵`) |
| **`Enter` ↵** | Focused option view (query unmodified) | Triggers **Navigate** action to destination (`Navigate ↵`) |
| **`Typing`** | After getting search results or focusing a stop | Clears `focusedResult`, resets `selectedIndex`, transitions button back to `Search ↵` |
| **`↓` (Down Arrow)** | Focused option active | Advances to the next matched destination and flies camera |
| **`↑` (Up Arrow)** | Focused option active | Returns to the previous matched destination and flies camera |
| **`↓` / `↑`** | Results list open | Moves selection highlight down / up with auto-scroll into view |
| **`Esc`** | Focused option view | Goes **back** to the full matches list |
| **`Esc`** | Results list open | Closes the results dropdown (preserves query) |
| **`Esc`** | Panel closed / typing | Clears search input text and removes target dot pin from map |

---

## 6. WebGL 3D Target Dot (`searchMarker.ts`)

- Implemented using native Mapbox GL WebGL GPU GeoJSON layers:
  - `motion-search-target-core`: Crisp glowing cyan circle with white border.
  - `motion-search-target-outer-ring`: Expanding radar ping animation.
  - `motion-search-target-middle-pulse`: Secondary animated pulse wave.
- Rendered in WebGL vertex lockstep with map tiles: 100% fixed with zero drift during 360° orbit, pan, zoom, and tilt (0° to 85°).
