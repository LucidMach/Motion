# `MapboxMap` Component Spec

The 3D Mapbox GL JS container and lifecycle coordinator. Stays an Astro component (not React) — it's a thin wrapper around an imperative, canvas-based library with no meaningful render state of its own; the map's actual state (region, GPS, perspective) is owned by `MotionMapController` and surfaced to React through the `window` event bus (see `src/types/events.ts`).

## Props

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `initialToken` | `string` | `import.meta.env.PUBLIC_MAPBOX_TOKEN` | Initial Mapbox access token |

## DOM structure

- `<div id="map">`: full-viewport canvas container (`absolute inset-0 h-screen w-screen`).

## Controller coordination

- Initializes `MotionMapController` (see `src/scripts/map/MotionMapController.ts`) on DOM ready.
- Subscribes to command events and forwards them to the controller:

| Command Event | Payload | Action |
| :--- | :--- | :--- |
| `motion:cmd:fly-user` | none | `mapController.flyToUser()` |
| `motion:cmd:toggle-3d` | none | `mapController.toggle3D()`, re-dispatches `motion:3d-state` |
| `motion:cmd:set-3d` | `{ is3D: boolean }` | `mapController.setPerspective(is3D)` |
| `motion:cmd:update-token` | `{ token: string }` | `mapController.updateToken(token)` |

- Cleans up geolocation watch subscriptions and the WebGL context via `mapController.destroy()` on `beforeunload`.

## Related modules (`src/scripts/map/`)

| File | Responsibility |
| :--- | :--- |
| `MotionMapController.ts` | Orchestrator wiring the pieces below together. |
| `mapLifecycle.ts` | Builds the `mapboxgl.Map`, wires load/move/error events, resize guards. |
| `locationCoordinator.ts` | Turns `GeolocationPosition` into `LocationTelemetry`, drives the marker. |
| `cameraController.ts` | 3D/2D perspective flag + `flyTo`/`easeTo` calls. |
| `geolocationTracker.ts` | Thin wrapper over `navigator.geolocation` (one-shot + watch). |
| `userMarker.ts` | The pulsing 3D user-location marker + popup. |
| `regionResolver.ts` / `regions.data.ts` | Zoom/bounding-box based "region in focus" lookup. |
| `transitHub.ts` | Default camera target (Flinders St Station). |
| `suppressBenignWarnings.ts` | Filters mapbox-gl's harmless internal `Cache.put()` console warning (see below). |

## Known console warning: `Cache.put() encountered a network error`

mapbox-gl-js caches tile/style responses via the browser `Cache` API and already
swallows failures internally, but still logs the raw message to the console.
It fires whenever the browser refuses to cache an opaque/cross-origin tile
response (private browsing, storage partitioning, etc.) and is non-fatal —
mapbox just falls back to an uncached fetch. `suppressBenignWarnings.ts`
filters this exact, known-benign string at `console.warn` so it doesn't spam
the console; real warnings still pass through.
