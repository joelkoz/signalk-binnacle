# Binnacle: Signal K Authentication Design

Status: approved. This is a foundational fix-forward slice: on a secured Signal K server
(`authenticationRequired: true`), every data read needs auth, so without it Binnacle shows
"Connected" but no live data and no charts. It follows the foundation design
(`2026-05-31-binnacle-foundation-design.md`) and the rules in `CLAUDE.md`.

## 1. Purpose

Authenticate Binnacle against a secured Signal K server so the live WebSocket stream and the REST
chart discovery return data instead of 401. The chosen mechanism is the Signal K **device access
request**: Binnacle asks for access once, the operator approves it in the Signal K admin under
Security, and the server issues a long-lived device token that Binnacle stores and reuses. No
password is ever typed on the helm display, and the grant survives reboots.

This is not unique to Binnacle: on a secured server every webapp (Freeboard-SK included) must
authenticate, either by riding the admin session cookie or by holding its own token. Binnacle holds
its own token so it works on a dedicated display that is never logged into the admin UI.

## 2. How Signal K auth works (confirmed against the live server)

Auth is token-based (JWT). The same token authenticates both transports; the transports differ only
in how the token is presented:

- **REST** (chart discovery): HTTP header `Authorization: Bearer <token>`.
- **WebSocket** (the live stream): browsers cannot set headers on the `WebSocket` handshake, so
  Signal K accepts the token as a query parameter on the stream URL: `...stream?subscribe=none&token=<token>`.

The device-request lifecycle, verified against the boat's server (signalk-server 2.x):

1. `POST /signalk/v1/access/requests` with `{ "clientId": "<stable uuid>", "description": "Binnacle" }`
   returns `202` `{ state: "PENDING", requestId, href: "/signalk/v1/requests/<id>" }`.
2. The operator approves the request in the Signal K admin (Security to Access Requests), granting
   read permission and a long or permanent expiration.
3. `GET /signalk/v1/requests/<id>` returns `202` `{ state: "PENDING", accessRequest: null }` while
   waiting, then `{ state: "COMPLETED", accessRequest: { permission: "APPROVED", token: "<jwt>" } }`
   once approved (or `permission: "DENIED"`).
4. Binnacle stores the token and the clientId locally and presents the token on every connection.

The clientId must be stable across reloads so a re-request maps to the same grant: Binnacle
generates a UUID once and persists it.

## 3. Architecture

Imports flow down only. Auth is shared infrastructure consumed by the worker (stream) and the
chart client (REST), so it lives in `shared/signalk`.

### shared/signalk/auth.svelte.ts (new)

An `AuthController` that owns the auth lifecycle and exposes reactive state:

- Persists `clientId` (a generated UUID) and `token` via the existing `PersistedValue` helper
  (`$shared/settings`), under `binnacle:signalk-auth`.
- `status`: a reactive `'unknown' | 'authenticated' | 'requesting' | 'denied' | 'unsecured'`.
- `token`: the current token or `undefined`.
- `requestAccess()`: POSTs the access request, then polls `GET /signalk/v1/requests/<id>` on an
  interval (about 3 s) until `COMPLETED`, storing the token on approval or setting `denied`.
- `probe()`: on startup, decides the initial path. It issues a cheap authenticated check (a `GET`
  on a protected REST path such as `/signalk/v1/api/vessels/self` with the stored token, if any):
  - 200 with a stored token: `authenticated`.
  - 200 without a token: `unsecured` (an open server; no auth needed, behave as before).
  - 401: needs auth. If a stored token exists but now 401s (expired or revoked), clear it and
    request again; otherwise start a request.
- The poll interval and request id are cleaned up on stop.

The UUID comes from `crypto.randomUUID()` (available in the browser and the worker).

### shared/signalk/origin.ts (modify)

`streamUrl(token?)` appends `&token=<token>` when a token is provided. `serverOrigin()` unchanged.

### shared/signalk/client.ts and the worker (modify)

`connect(url, onFrame)` already takes the full URL, so the token rides in via `streamUrl(token)`
from the caller; no worker API change is required for the stream. The worker stays free of the
package and of auth policy: it just opens the URL it is given.

### features/charts/charts-client.ts (modify)

`fetchCharts(serverBase, token?)` sends `Authorization: Bearer <token>` when a token is present. A
401 is already handled (warns, returns no charts); with a token it should succeed.

### features/auth-gate (new feature slice)

A small `AuthBanner.svelte` that renders the auth state at the top of the shell:

- `requesting`: "Requesting access. Approve Binnacle in Signal K under Security to Access Requests."
  with a retry affordance.
- `denied`: "Access denied. Re-request?" with a button calling `requestAccess()` again.
- `authenticated` / `unsecured`: the banner is absent.

Behind the feature's `index.ts`, drawn from theme tokens, using the `--alarm` token for the denied
state.

### app/App.svelte (modify)

Create the `AuthController`, `probe()` on mount, and gate the connect/subscribe and the chart fetch
on having a token (or being `unsecured`). On `authenticated`, connect the stream with
`streamUrl(token)` and fetch charts with the token. Re-run when the token changes (a fresh grant
reconnects). Render the `AuthBanner`.

## 4. Data flow

1. On mount, `AuthController.probe()` runs. Unsecured server: proceed immediately as today.
   Secured with a valid stored token: proceed authenticated. Secured without a usable token:
   `requestAccess()` and show the banner.
2. The operator approves in the admin; the poll sees `COMPLETED`, stores the token, sets
   `authenticated`.
3. App connects the stream with the token in the URL and fetches charts with the Bearer header.
   Live data and charts appear.
4. If a stored token later 401s (revoked or expired), the controller clears it and re-requests,
   showing the banner again, without losing the clientId.

## 5. Signal K conformance

- Uses the documented device access-request endpoints and the standard token presentation (Bearer
  on REST, `?token=` on the stream), verified against the live server.
- Degrades gracefully: an unsecured server needs no token and behaves exactly as before; a denied
  request shows a clear, actionable message rather than failing silently.
- Offline-first: the token and clientId persist in `localStorage`, so a reboot or reload reuses the
  existing grant with no round trip to the operator.
- No new runtime dependency, and the worker still imports neither the package nor auth policy.

## 6. Modularity

Auth is shared infrastructure plus one tiny feature (the banner). The worker and chart client take
a token as a parameter; they hold no auth policy. Removing the banner feature and passing no token
reverts to anonymous behavior. dependency-cruiser stays green.

## 7. Build order (each ends with /cleanup and the gate)

1. `AuthController` and the persisted clientId/token in `shared/signalk` (test-first: the
   request/poll/store state machine, with fetch injected for tests), plus `streamUrl(token)`.
2. Wire the token into the stream (`App.svelte` connects with `streamUrl(token)`) and the chart
   fetch (`fetchCharts(base, token)`), gated on auth status.
3. The `AuthBanner` feature and its shell slot, theme-aware, with re-request.

This is one spec; steps may split across plans.

## 8. Deferred (own later specs)

Username/password login as an alternative path, multiple server profiles, token-expiry countdown
and proactive refresh, and per-feature permission scoping. v1 is the single device-token path that
unblocks the product on a secured boat.
