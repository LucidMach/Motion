# `HeaderHUD` Component Spec

React island (`client:load`) rendering the top navigation bar, positioned at `top: 20px`. Houses branding, dynamic spatial region detection, and the primary GPS recenter action.

## Files

| File | Responsibility |
| :--- | :--- |
| `HeaderHUD.tsx` | Owns HUD state (region label, GPS location name/accuracy) and the `window` event subscriptions. |
| `BrandGroup.tsx` | Static brand mark + the dynamic region label. |
| `GpsLocationCard.tsx` | The recenter button: location name, accuracy subtext, crosshair icon. |

## Props

None — `HeaderHUD` is self-contained and reads all of its state from the global event bus.

## State

| State | Initial value | Set by |
| :--- | :--- | :--- |
| `regionLabel` | `"Melbourne CBD • Victoria"` | `motion:region-change` |
| `regionUpdated` | `false` | Flips `true` for 600ms after a region change (drives the cyan flash on the label) |
| `locationName` | `"My Location"` | `motion:location`, `motion:status` |
| `accuracyText` | `"±15m accuracy"` | `motion:location`, `motion:status` |

## Events consumed (window → component)

| Event | Effect |
| :--- | :--- |
| `motion:location` | Updates `locationName` / `accuracyText` from `LocationTelemetry` (see `src/types/events.ts`). |
| `motion:status` | `gps_acquiring` → "Acquiring GPS..."; `gps_fallback` → "Melbourne CBD" / "~15m (Approx)". |
| `motion:region-change` | Updates `regionLabel` and triggers the 600ms `regionUpdated` flash. |

## Events emitted (component → window)

| Event | Trigger |
| :--- | :--- |
| `motion:cmd:fly-user` | Click on the GPS recenter card. |

## Styling & accessibility

- Glassmorphic container: `bg-surface`, `backdrop-blur-lg`, `border-subtle`, `shadow-glass` (Tailwind utilities, tokens defined in `src/styles/global.css`).
- `aria-label="Navigation & Region Status Bar"` on the `<header>`.
- Responsive breakpoints at `768px` (compact padding/sizing) and `480px` (brand subtitle hidden) via Tailwind `max-[…]` variants.
