# `NavigationPanel` Component Spec

Glassmorphic multi-modal transit navigation HUD and floating minimized pill docked at the bottom center of the viewport. Calculates, formats, and renders optimal reverse-chronological transit itineraries against local GTFS timetable schedules and live PTV disruptions. Coordinates seamless multi-segment neon map route plotting on Mapbox GL 3D canvas.

---

## 1. File Structure

```
src/components/NavigationPanel/
├── NavigationPanel.tsx       # React island root (itinerary calculations, turn-by-turn HUD, floating pill)
└── NavigationPanel.spec.md   # This technical specification
```

---

## 2. Component Props & State Machine

- **Mounting**: Client island (`<NavigationPanel client:load />` in `src/pages/index.astro`).
- **Internal State**:
  - `isOpen: boolean` — Controls visibility of the navigation interface.
  - `isMinimized: boolean` — Toggles between the expanded turn-by-turn HUD and the compact floating glass pill.
  - `originText: string` — Human-readable start location name (defaults to `'My Location'`).
  - `originCoords: [number, number] | null` — `[lon, lat]` longitude/latitude array for departure.
  - `isEditingOrigin: boolean` — Toggles the start location autocomplete search bar.
  - `originSuggestions: StopSearchResult[]` — Real-time stop & address suggestions for origin.
  - `destination: NavigateToEventDetail | null` — Selected target destination metadata (`stop_id`, `stop_name`, `stop_lat`, `stop_lon`, `mode`).
  - `arriveByMode: 'latest' | 'custom'` — `'latest'` computes upcoming departure from current time; `'custom'` targets user-specified arrival time.
  - `customArrivalTime: string` — Internal 24-hour target arrival time string (`"HH:MM"`, e.g. `"18:45"`).
  - `route: RouteResponse | null` — Computed multi-modal transit itinerary from `/api/route`.
  - `expandedLegIndex: number | null` — Index of turn-by-turn accordion card currently expanded (`null` for collapsed).
  - `isLoading: boolean` — Active routing calculation spinner state.
  - `errorMessage: string | null` — User-facing error message banner if no connection is found.

---

## 3. UI Layout & Visual Design System

```
+-------------------------------------------------------------------------+
| [●] ACTIVE TRANSIT ROUTE                        [▼ Minimize]  [✕ Close] |
+-------------------------------------------------------------------------+
| [● From: My Location                     ] [Edit ✎]                     |
| [● To:   Footscray Railway Station       ] [⇅ Swap]                     |
| [🕒 Arrive:] [06:32 PM] [ AM | PM ]   [⚡ Latest] [+15m] [+30m] [+1h]   |
+-------------------------------------------------------------------------+
| [🚆 23 min • Dep 18:08 → Arr 18:31] [On Schedule / ⚠️ Disruption Badge] |
| ----------------------------------------------------------------------- |
| Turn-by-Turn Leg Accordion:                                             |
|   1. 🚶 Walk 4 min (320m) to Richmond Station                           |
|   2. 🚆 Sunbury Line Train (18:12 - 18:28) • 16 min (4 stops)           |
|   3. 🚶 Walk 3 min (180m) to Footscray Station                         |
+-------------------------------------------------------------------------+
```

### Encapsulated Matching Cards
- **From Card**: `rounded-2xl bg-deep/60 px-3 py-2 border border-subtle/40` with emerald origin icon.
- **To Card**: `rounded-2xl bg-deep/60 px-3 py-2 border border-subtle/40` with rose destination icon and swap button (`⇅`).
- **Arrive by Card**: `rounded-2xl bg-deep/60 px-3 py-2 border border-subtle/40` with cyan clock icon, direct time box, explicit `[ AM | PM ]` toggle pill, and offset chips (`Latest`, `+15m`, `+30m`, `+1h`).

---

## 4. Arrival Time & AM / PM State Logic

### Time Parsing & Conversions
- Internal storage is standard 24-hour `"HH:MM"`.
- `parse24To12(time24)` breaks string into 12-hour components (`hour12`, `minute`, `isPM`).
- `format12To24(h12, min, isPM)` converts 12-hour values back to `"HH:MM"`.

### Relative Offset Arithmetic (`+15m`, `+30m`, `+1h`)
- Preset buttons add directly to the **currently displayed Arrival Time** (not current/departure time):
  $$\text{Target Arrival Time} = \text{Current Arrival Time} + \Delta t$$
- Selecting `Latest` clears custom time override and computes the upcoming scheduled departure strictly after current time.

### Explicit `[ AM | PM ]` Segmented Pill
- 1-click toggling flips between morning and afternoon/evening (e.g. `06:30 AM` $\leftrightarrow$ `06:30 PM`).
- Updates `customArrivalTime` and immediately triggers route recalculation.

---

## 5. Two-Stage `Escape` Key Hierarchy

1. **Stage 1 (`!isMinimized`)**:
   - Pressing `Escape` minimizes the large HUD into the compact floating pill (`[ 🚆 Richmond → Footscray • 23 min • Dep 18:08 • Expand ▴ ]`).
   - The multi-colored transit route line remains plotted on the 3D map canvas for exploration.
2. **Stage 2 (`isMinimized`)**:
   - Pressing `Escape` clears the route from the map (`motion:cmd:clear-route`), closes the navigation panel, and resets search bar input in sync.

---

## 6. Direction Swap (`⇅`)

Clicking the swap button reverses Origin and Destination:
- New Origin $\leftarrow$ Previous Destination
- New Destination $\leftarrow$ Previous Origin
- Instantly recalculates the reverse itinerary and plots new directional route polylines.

---

## 7. Event Contracts

### Listens For

| Event | Detail Payload | Description |
| :--- | :--- | :--- |
| `motion:cmd:navigate-to` | `NavigateToEventDetail` | Opens panel, sets destination, and computes initial itinerary. |
| `motion:location` | `LocationTelemetry` | Updates GPS departure coordinates and location subtext. |

### Dispatches

| Event | Detail Payload | Description |
| :--- | :--- | :--- |
| `motion:cmd:plot-route` | `RouteResponse` | Instructs `MotionMapController` to draw neon route layers on Mapbox canvas. |
| `motion:cmd:clear-route` | `void` | Removes route layers, waypoints, and resets search query across UI islands. |
