# Binnacle Offline and PWA Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Binnacle work offline: an installable PWA app shell, a runtime cache of the OpenFreeMap base-map assets, and a cache of the Signal K PMTiles chart ranges, so anywhere the navigator has viewed renders with no internet. Implements `docs/superpowers/specs/2026-05-31-binnacle-offline-pwa-design.md`.

**Architecture:** `vite-plugin-pwa` (wrapping Workbox) generates a service worker and a web-app manifest into the built `public/` directory served at `/binnacle/`. Precaching covers the app shell; Workbox runtime rules cache the base-map and PMTiles requests cache-first while explicitly excluding the live Signal K stream and REST API. A thin `shared/pwa` module registers the worker and exposes update and offline signals; a status-strip indicator shows offline state.

**Tech Stack:** vite-plugin-pwa 1.3.0, workbox-build/workbox-window 7.4.1, Vite 8, Svelte 5 runes, TypeScript. The existing pmtiles no-store source stays.

**Project rules:** Honors `CLAUDE.md`. American English, no em dashes, Oxford commas, default to no comments. One heavy command at a time on the Pi (`NODE_OPTIONS="--max-old-space-size=2048"`). Lead-driven, never commit or push on red (the `.githooks` gates enforce it). Ends with `/cleanup` and the full gate. Verify each step live in the browser with DevTools offline mode.

**Confirmed facts:** entry `src/main.ts`, `index.html` loads `/src/main.ts`, production `base` is `/binnacle/`, app icon is `static/binnacle-icon.svg`. The SW served at `/binnacle/sw.js` controls scope `/binnacle/` by default, which is exactly the app scope, so no `Service-Worker-Allowed` header is needed. `package.json` `files: ["public/"]` ships the SW and manifest in the tarball.

---

## Module boundary note

- `vite.config.ts`: add the `VitePWA` plugin (build concern).
- `src/shared/pwa/register.ts`, `index.ts`: register the worker, expose `onlineStatus` and an update hook. Imports the vite-plugin-pwa virtual module. New `shared/pwa` segment.
- `src/main.ts`: call the registration once at startup.
- `src/app/App.svelte`: render an offline indicator in the status strip.
- `src/vite-env.d.ts`: reference the vite-plugin-pwa virtual-module types.

dependency-cruiser stays green.

---

## Task 1: Install vite-plugin-pwa and the app-shell PWA

**Files:** modify `package.json` (dep), `vite.config.ts`, `src/vite-env.d.ts`, `src/main.ts`; create `src/shared/pwa/register.ts`, `src/shared/pwa/index.ts`.

- [ ] **Step 1:** Install:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm install -D vite-plugin-pwa@^1.3.0 workbox-window@^7.4.1
```

- [ ] **Step 2:** Add the plugin to `vite.config.ts`. Import `VitePWA` from `vite-plugin-pwa`, and add it to `plugins` after `svelte()`:
```ts
import { VitePWA } from 'vite-plugin-pwa';
// ...
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['binnacle-icon.svg'],
      manifest: {
        name: 'Binnacle',
        short_name: 'Binnacle',
        description: 'A next-generation marine chart plotter for Signal K.',
        start_url: '/binnacle/',
        scope: '/binnacle/',
        display: 'standalone',
        background_color: '#cfe0ec',
        theme_color: '#cfe0ec',
        icons: [
          { src: 'binnacle-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/binnacle/index.html',
        // The app bundle is large (MapLibre); raise the precache size limit.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [], // filled in Tasks 2 and 3
      },
    }),
  ],
```
NOTE: keep `base`, `define`, `resolve`, `publicDir`, `build`, and `test` unchanged. The plugin reads Vite's `base` for the SW scope.

- [ ] **Step 3:** Add the virtual-module types to `src/vite-env.d.ts`:
```ts
/// <reference types="vite-plugin-pwa/client" />
```

- [ ] **Step 4:** Create `src/shared/pwa/register.ts`:
```ts
import { registerSW } from 'virtual:pwa-register';

export interface PwaController {
  needsRefresh: () => boolean;
  update: () => void;
}

// Registers the service worker and returns a small controller. autoUpdate installs
// the new worker; `needsRefresh` reports when a new build is waiting so the UI can
// offer a reload.
export function registerPwa(): PwaController {
  let waiting = false;
  const updateSW = registerSW({
    onNeedRefresh() {
      waiting = true;
    },
  });
  return {
    needsRefresh: () => waiting,
    update: () => void updateSW(true),
  };
}
```

- [ ] **Step 5:** Create `src/shared/pwa/index.ts`:
```ts
export { registerPwa } from './register';
export type { PwaController } from './register';
```

- [ ] **Step 6:** Call it once from `src/main.ts`, after mount:
```ts
import { registerPwa } from '$shared/pwa';
// ...after `const app = mount(...)`:
registerPwa();
```

- [ ] **Step 7:** `NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build`. Expect `public/sw.js` and `public/manifest.webmanifest` to be emitted. Verify: `ls public/sw.js public/manifest.webmanifest`.

- [ ] **Step 8:** `npm run check`, `npm run cruise`, green. Commit `feat(pwa): installable app shell with service-worker precache`.

- [ ] **Step 9: Verify live.** Load the deployed app, open DevTools Application tab: a service worker is registered and activated, the manifest is valid, and "Install" is offered. Then toggle DevTools Network to Offline and reload: the app shell loads (the map base will be blank until Task 2, but the shell, fonts, and UI render).

---

## Task 2: Runtime-cache the OpenFreeMap base map

**Files:** modify `vite.config.ts` (the `runtimeCaching` array).

- [ ] **Step 1:** Add a `CacheFirst` rule for the OpenFreeMap origin to `workbox.runtimeCaching`:
```ts
runtimeCaching: [
  {
    urlPattern: ({ url }) => url.origin === 'https://tiles.openfreemap.org',
    handler: 'CacheFirst',
    options: {
      cacheName: 'binnacle-basemap',
      expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 30 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
],
```
NOTE: `statuses: [0, 200]` allows opaque cross-origin responses (status 0) as well as 200; OpenFreeMap sends CORS headers so responses are not opaque, but `0` is a safe inclusion. The 30-day age and 4000-entry caps bound growth.

- [ ] **Step 2:** `NODE_ENV=production npm run build`, then `npm run check`. Green. Commit `feat(pwa): cache the OpenFreeMap base map for offline`.

- [ ] **Step 3: Verify live.** Load online, pan and zoom over an area so the base tiles load, then DevTools Offline and reload: the base map renders the viewed area from cache (DevTools Application > Cache Storage shows `binnacle-basemap` populated).

---

## Task 3: Runtime-cache the Signal K PMTiles charts

**Files:** modify `vite.config.ts` (the `runtimeCaching` array).

- [ ] **Step 1:** Add a `CacheFirst` rule with range-request support for the PMTiles path, plus a rule for other `/signalk/` chart resources, and ensure the live data paths are NOT matched. Append to `runtimeCaching`:
```ts
  {
    urlPattern: ({ url }) => url.pathname.startsWith('/signalk/pmtiles/'),
    handler: 'CacheFirst',
    options: {
      cacheName: 'binnacle-pmtiles',
      rangeRequests: true,
      expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      cacheableResponse: { statuses: [0, 200, 206] },
    },
  },
```
NOTE: `rangeRequests: true` enables Workbox's range-requests plugin so `206 Partial Content` reads (how PMTiles reads an archive) are served from cache. `206` is in `cacheableResponse.statuses`. The PMTiles fetch sets `cache: 'no-store'`, but the service worker intercepts before the HTTP cache, so CacheStorage is the durable store. The live paths (`/signalk/v1/stream`, `/signalk/v*/api/`) do not match this rule and have no caching rule, so they always go to network.

- [ ] **Step 2:** Confirm exclusion: there is NO runtime rule matching `/signalk/v1/stream` or `/signalk/v2/api/` or `/signalk/v1/api/`. The chart discovery REST call (`/signalk/v2/api/resources/charts`) is intentionally not cached so a chart list change is seen; only the chart tile and pmtiles payloads are cached.

- [ ] **Step 3:** `NODE_ENV=production npm run build`, `npm run check`. Green. Commit `feat(pwa): cache Signal K PMTiles chart ranges for offline`.

- [ ] **Step 4: Verify live.** Load online, pan to a charted area (Michigan) so PMTiles tiles load, then DevTools Offline and reload: the chart renders the viewed area from `binnacle-pmtiles` cache, and the Signal K stream shows "Not connected"/"Reconnecting" (live data correctly not cached).

---

## Task 4: Update toast and offline indicator

**Files:** modify `src/shared/pwa/register.ts` (online signal), `src/app/App.svelte` (status-strip indicator and update affordance).

- [ ] **Step 1:** Add a reactive online signal. Create `src/shared/pwa/online.svelte.ts`:
```ts
// A reactive mirror of navigator.onLine, updated by the browser online/offline events.
export class OnlineStatus {
  online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => {
      this.online = true;
    });
    window.addEventListener('offline', () => {
      this.online = false;
    });
  }
}
```
Export it from `src/shared/pwa/index.ts`:
```ts
export { OnlineStatus } from './online.svelte';
```

- [ ] **Step 2:** In `App.svelte`, create an `OnlineStatus` and show an "Offline" chip in the status strip when `!online`. Add to the script: `import { OnlineStatus } from '$shared/pwa';` and `const net = new OnlineStatus();`. In the status strip, before the spacer:
```svelte
{#if !net.online}
  <span class="readout offline" role="status" aria-live="polite">Offline</span>
{/if}
```
and style `.offline { color: var(--alarm); }`.

- [ ] **Step 3:** Surface the update affordance. `App.svelte` holds the `PwaController` from `registerPwa()` (move the call from main.ts to App, or pass it down). Simplest: in `main.ts`, keep `registerPwa()` but also expose its controller to App via a module singleton. Cleaner: move `registerPwa()` into App's script (it runs in the browser on mount). When `controller.needsRefresh()` becomes true, show a small "Update available" button in the top bar that calls `controller.update()`. Implement with a reactive flag the registration sets:
  - Change `register.ts` to take an `onNeedRefresh` callback:
    ```ts
    export function registerPwa(onNeedRefresh?: () => void): PwaController {
      const updateSW = registerSW({ onNeedRefresh: () => onNeedRefresh?.() });
      return { update: () => void updateSW(true) };
    }
    ```
    (Drop the `needsRefresh` poll in favor of the callback; update `PwaController` to `{ update: () => void }`.)
  - In App: `let updateReady = $state(false); const pwa = registerPwa(() => (updateReady = true));` and in the top bar:
    ```svelte
    {#if updateReady}
      <button type="button" class="update" onclick={() => pwa.update()}>Update</button>
    {/if}
    ```
  - Remove the `registerPwa()` call from `main.ts` so it is not registered twice.

- [ ] **Step 4:** `biome check --write`, `npm run check`, `npm run cruise`, green. Commit `feat(pwa): offline indicator and update prompt`.

- [ ] **Step 5: Verify live.** DevTools Offline shows the "Offline" chip; back online clears it. Publishing a new build (rebuild and reload twice) surfaces the "Update" button.

---

## Task 5: Full local gate

Run each heavy command alone, capture to a file, read it back:
- [ ] `biome ci .`
- [ ] `npm run cruise`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" npm run check`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" npm test`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build`

All green. Confirm `public/sw.js` and `public/manifest.webmanifest` exist.

---

## Task 6: Cleanup gate and doc gate

- [ ] **Step 1:** Run `/cleanup` against the diff (inline lead audit), brief on the style rules. Look for: a runtime rule accidentally matching the live stream or REST, an unbounded cache (missing expiration), the SW scope vs base mismatch, and listeners not cleaned up in `OnlineStatus`.
- [ ] **Step 2:** Fix every finding, including nit.
- [ ] **Step 3: Doc gate.** Rebuild first. Add the CHANGELOG entry (installable PWA, offline base-map and PMTiles caching, update and offline UI). Update the README "What is in place" with offline support and PWA install. Update `CLAUDE.md` only if a rule changed (the base-map-is-a-cached-online-exception rule is already there; add that the offline pipeline is now implemented). Populate the `signalk.screenshots` if convenient, or leave for the release checklist. Update `.remember` and the `project-status` memory.
- [ ] **Step 4:** Re-run the full gate. Commit and push (the pre-push hook re-verifies).
- [ ] **Step 5: Exit criteria.** The app installs as a PWA; offline, the shell and any viewed base-map and chart area render; the Signal K live paths are never served stale; an offline indicator and an update prompt work; the SW and manifest ship in `public/`; dependency-cruiser is green; all gates pass.

When all are true, the offline and PWA pipeline v1 is complete. The deferred "download a region" prefetch and storage-quota management get their own spec.

---

## Self-review notes

- **Spec coverage:** implements the three caching layers (app shell precache, OpenFreeMap runtime cache, PMTiles range-request cache) plus the update and offline UI, with the live data paths explicitly excluded, all from the spec. View-cache now; region prefetch deferred.
- **Placeholder scan:** every code step shows complete code. The NOTE blocks describe real config rationale (CORS statuses, range requests, base/scope), not deferrals.
- **Type and name consistency:** `registerPwa`, `PwaController`, `OnlineStatus`, the cache names `binnacle-basemap`/`binnacle-pmtiles`, and the manifest fields are used identically across tasks.
- **Boundary note:** `shared/pwa` imports only the virtual module and browser globals; nothing above shared. dependency-cruiser stays green.
- **Verify before push:** every heavy command runs alone and is read from a file; the hooks enforce green; one heavy command at a time respects the Pi budget; each task is verified live in the browser's offline mode.
