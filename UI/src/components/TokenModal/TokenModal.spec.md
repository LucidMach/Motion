# `TokenModal` Component Spec

React island (`client:load`) — an accessible setup dialog for entering the Mapbox Public Access Token (`pk.eyJ...`).

## Files

| File | Responsibility |
| :--- | :--- |
| `TokenModal.tsx` | Owns `isOpen` / `token` state, the event-bus subscriptions, and the backdrop. |
| `TokenModalHeader.tsx` | Title, subtitle, close button. |
| `TokenModalForm.tsx` | Description, token input, hint link, submit button. |

## State

| State | Initial value | Notes |
| :--- | :--- | :--- |
| `isOpen` | `false` | Opened by `motion:cmd:open-token-modal` or `motion:status` with `state: 'needs_token'`. |
| `token` | `''` | Pre-filled from `localStorage.getItem('motion_mapbox_token')` whenever the modal opens. |

## Events consumed (window → component)

| Event | Effect |
| :--- | :--- |
| `motion:cmd:open-token-modal` | Opens the modal. |
| `motion:status` (`state === 'needs_token'`) | Opens the modal — fires on missing token or a 401/403 from Mapbox. |

## Events emitted (component → window)

| Event | Payload | Trigger |
| :--- | :--- | :--- |
| `motion:cmd:update-token` | `{ token: string }` | "Apply & Load 3D Map" click, or `Enter` in the input. |

## Behavior

- `Enter` in the token input submits; `Escape` closes.
- Clicking the backdrop (not the card) closes the modal.
- Saves the token to `localStorage` — handled downstream by the map controller's `motion:cmd:update-token` listener, not by this component.

## Styling

- `bg-[rgba(3,7,18,0.75)] backdrop-blur-[8px]` full-viewport backdrop; `animate-modal-in` scale/fade-in on the card (Tailwind utilities, tokens defined in `src/styles/global.css`).
