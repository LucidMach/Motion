# `MotionNavigationControl` Component Spec

Unified bottom-right navigation control dock, implemented as a `mapboxgl.IControl` (not React — Mapbox GL's control API requires a plain DOM element returned from `onAdd`, so it stays a vanilla class styled via dedicated CSS component rules in `src/styles/global.css`). Contains Zoom In (`+`), Zoom Out (`-`), and the 2D/3D perspective toggle in a single glass `mapboxgl-ctrl-group`.

## Files

| File | Responsibility |
| :--- | :--- |
| `MotionNavigationControl.ts` | The `IControl` class: builds the dock, wires zoom buttons, listens for `motion:3d-state`. |
| `perspectiveButton.ts` | Pure functions rendering the toggle button's CSS classes + icon/label markup for the 3D and 2D states. |

## DOM structure & sizing

- `.mapboxgl-ctrl-group.motion-navigation-dock`: single vertical glass container.
  - Zoom In button (`38px × 38px`): triggers `map.zoomIn()`.
  - Zoom Out button (`38px × 38px`): triggers `map.zoomOut()`.
  - 2D/3D toggle button (`44px` tall): isometric cube icon in 3D mode, planar square icon in 2D mode, with a `3D`/`2D` text label underneath.

## Behavior & interactions

- Clicking the perspective button dispatches `motion:cmd:toggle-3d` (handled by `MotionMapController`, not this control directly).
- Listens for `motion:3d-state` to re-render its own button classes/icon/label and ARIA attributes — it does not own the 3D/2D boolean, `CameraController` does.
- `aria-label` swaps between `"Switch to 2D Planar View"` and `"Switch to 3D Oblique Perspective"`.

## Styling

- Styled via dedicated class overrides in `src/styles/global.css` (`.mapboxgl-ctrl-group.motion-navigation-dock`, `.motion-ctrl-btn`, `.motion-camera-toggle`, `.cam-nav-icon`, `.cam-btn-label`) to ensure proper specificity over Mapbox GL's built-in control stylesheets while leveraging design tokens (`var(--color-surface-elevated)`, `var(--color-subtle)`, `var(--shadow-glass)`, `var(--color-accent-cyan)`, `var(--radius-md)`).

