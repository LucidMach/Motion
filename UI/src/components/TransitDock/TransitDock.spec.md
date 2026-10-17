# `TransitDock` Component Spec

Multi-modal Victorian transit explorer, full-length slide-in sidebar, and in-map vehicle & route HUD. Replaces the legacy iOS route wheel picker with a modern full-height slide-in drawer, real-time vehicle telemetry tracking, and an interactive route inspector.

## Files

| File | Responsibility |
| :--- | :--- |
| `TransitDock.tsx` | Main coordinator island (`client:load`): owns mode selection, route shape loading, nearest vehicle calculation, stops loading, and the 3-button floating dock rail (Train, Tram, Bus). |
| `TransitExplorer.tsx` | Full-length slide-in sidebar designed with an integrated left navigation rail (top-left Back button, vertical mode switcher, live pulse/clear route) and a rich content drawer (instant fuzzy search, PTV line group filter pills, and route cards with inline accordion dropdowns). Unobstructed: no blocking backdrop overlay is mounted, allowing complete map interaction while open. |
| `VehiclePanel.tsx` | Full-length, compact 300px slide-in side panel from the right edge displaying minimal telemetry (line badge, speed, distance from user, and "Focus Camera" action) when clicking an animated 3D train/tram on the map. |
| `TransitDock.test.tsx` | Vitest & React Testing Library test suite covering dock mode toggling, route filtering, inline accordion expansion, vehicle panel display, stepped empty-map dismissal, and stops timeline navigation. |

## Supported Modes & Color Branding

| Mode | Brand Color | Ambient Glow | Description |
| :--- | :--- | :--- | :--- |
| **Train** | `#0072CE` (Metro Blue) | `rgba(0, 114, 206, 0.45)` | Melbourne Metro lines with individual group colors (Burnley, Caulfield, Northern, Clifton Hill, Cross-City) |
| **Tram** | `#78BE20` (Yarra Green) | `rgba(120, 190, 32, 0.45)` | Melbourne Yarra Tram network routes |
| **Bus** | `#FF8200` (PTV Orange) | `rgba(255, 130, 0, 0.45)` | SmartBus orbitals, express university links, and metro local bus routes |

## Interaction & Animation Behaviors

- **Floating Dock & Drawer Transition**: Snappy sheet transition with `cubic-bezier(0.16, 1, 0.3, 1)` (~320ms). The floating rail transitions at `z-30` while the drawer slides over seamlessly at `z-50`.
- **Mode Switching Cross-Fade**: Mode switches (Train, Tram, Bus) execute a gentle 150ms cross-fade (`transitModeCrossFade`) to eliminate any flicker or layout jump.
- **Icon Styling**: Active modes change the icon color, subtle background tint, and border. No side indicator bars or corner notification dots are displayed.
- **Unobstructed Map Interaction**: No full-screen backdrop is mounted. Panning, zooming, tilting, and rotating the 3D map canvas is 100% responsive and unobstructed even while the side panel is open.
- **Stepped Empty-Ground Dismissal**: Clicking on empty map ground (without dragging or clicking a vehicle) follows a stepped hierarchy: dismisses the right-side `VehiclePanel` first (if open), and dismisses the left `TransitExplorer` (and clears active route) on the next click.
- **Dynamic Camera Viewport Padding**: When side panels are open, camera fit operations (`fitBounds`, `flyTo`) and panel toggle events dynamically offset viewport padding (e.g. left: 480px, right: 300px on desktop) so vehicles and routes are framed in the visible map region between open panels.
- **Proportional Layout**: 480px total drawer width (`w-[480px] max-w-full`), composed of a 62px left navigation rail and an expanded 418px right content section, giving extra breathing room for long route titles and stops timeline cards.
- **Compact Right-Side Vehicle Inspector**: 300px width (`w-[300px]`, full-width on mobile `<768px>`) sliding in from the right edge with accent glow matching the vehicle's line color.
- **Clean Card Header & Live Vehicle Badge**: When live vehicles are active on a route, the live vehicle count badge (`{liveCount} trains`) is displayed on the far right of the card.
- **Redesigned Route Expansion UI**:
  - **Full Corridor Highlight**: Default action on selecting a route card highlights the whole route on the map and fits camera bounds immediately via `RouteHighlightLayer`.
  - **Continuous Aligned Transit Track**: Continuous 4px vertical track line connecting stations in the corridor's brand color, with station nodes centered on the exact line axis without gaps or offsets.
  - **Fully Expanded Station List**: Station list renders at full height without nested scroll containers, enabling natural scrolling across the drawer.
  - **Clean Station Display**: Stations display clean names with fly-to and navigation actions; clutter and hub badges are removed for visual minimalism.
  - **On-Track Real-Time Vehicle Symbols**: Active vehicles on the corridor are rendered as directional symbols (`▲` / `▼`) sitting directly on top of the vertical track line between stations (or directly at the station node when stopped), with a pulsing live beacon and destination hover tooltip.
  - **Cinematic 3D Chase Camera**: Clicking any vehicle symbol smoothly flies the camera to the vehicle, matches vehicle heading bearing at pitch ~65° and zoom ~18, and locks/follows the moving consist along the track.
  - **Map-to-Menu Reverse Link**: Clicking a 3D vehicle on the map automatically opens Transit Explorer to that vehicle's route and scrolls to highlight that vehicle's symbol on the timeline.

## Events Consumed (Window → Component)

| Event | Payload | Effect |
| :--- | :--- | :--- |
| `motion:location` | `LocationTelemetry` | Updates user's reference coordinates for haversine nearest-vehicle calculations. |
| `motion:vehicle-selected` | `VehicleSelectedEventDetail` | Dispatched by `TrainSimulationLayer` when a user clicks on an animated 3D vehicle on the map; opens `TransitExplorer` to route and shows `VehiclePanel`. |
| `motion:map-empty-click` | `void` | Dispatched by `MotionMapController` when user clicks on empty map ground; stepped panel dismissal. |
| Keyboard `KeyT` | `KeyboardEvent` | Toggles the Transit Explorer panel open/close. |
| Keyboard `Escape` | `KeyboardEvent` | Hierarchically closes active panels (right vehicle panel first, then left transit explorer). |

## Events Emitted (Component → Map / UI)

| Event | Payload | Trigger |
| :--- | :--- | :--- |
| `motion:cmd:highlight-route` | `{ geojson, color, skipCameraFit }` | Highlighting a route on the map via `RouteHighlightLayer`. |
| `motion:cmd:clear-route-highlight` | `void` | Dismissing the active route in the route item's inline dropdown or clicking the route again. |
| `motion:cmd:track-vehicle` | `{ tripId, coords, bearing }` | Clicking a vehicle badge to engage cinematic 3D chase camera tracking. |
| `motion:cmd:fly-to` | `FlyToEventDetail` | Flying camera to nearest train, route stops, or inspected vehicle. |
| `motion:cmd:navigate-to` | `NavigateToEventDetail` | User clicks the navigate arrow on a stop in the timeline. |
