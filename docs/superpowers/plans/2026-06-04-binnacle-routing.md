# Routing Implementation Plan (planning plus active-navigation following)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add route planning (create, edit, save, show routes as Signal K resources, edited on the chart with Terra Draw) and active-navigation following (activate via the v2 Course API, display XTE, DTW, BTW, VMG, and ETA with an arrival alarm), per `docs/superpowers/specs/2026-06-04-binnacle-routing-design.md`.

**Architecture:** Feature-Sliced Design. Approach C: the Signal K server Course API is the canonical source of active-following state (built into server 2.x core), with a client-side geodesy fallback for the derived calc values (the optional course-provider plugin). Course data is read live from the existing WebSocket worker, hydrated once via a v2 REST GET. Routes and waypoints are Signal K resources. Imports flow downward only; cross-slice data flows through entities.

**Tech Stack:** Svelte 5 (runes), TypeScript, MapLibre GL JS 5, Vitest, Biome, plus two new runtime deps `terra-draw` and `terra-draw-maplibre-gl-adapter`.

**Hard rules (from CLAUDE.md):** SI in the store (radians, meters, m/s, seconds), positions in decimal degrees, convert only at the display edge. GeoJSON `[lon, lat]` in resource bodies, `{latitude, longitude}` in Course API bodies and outputs. Never import `@signalk/server-api` in browser or worker code; mirror wire types in `src/shared/signalk/types.ts`. No em dashes, Oxford commas, no "&" in human text, American English. One heavy verification command at a time on this Pi. Run the gate (`npm test`, `npm run check`, `npm run lint`, `npm run cruise`, `npm run build`) and commit only when green.

---

## File structure

Phase A (planning and display):
- `src/shared/signalk/geo-guards.ts` (MODIFY): add `lonLatToLatLon`, `latLonToLonLat`, and a `LonLat` tuple type next to the existing `LatLon` and `isLatLon`.
- `src/shared/signalk/index.ts` (MODIFY): export the new converters.
- `src/shared/nav/route-geometry.ts` (NEW): pure geodesy (rhumb distance and bearing, great-circle bearing, cross-track error, VMG, ETA-from-speed).
- `src/shared/nav/index.ts` (MODIFY): export the new geodesy.
- `src/entities/route/route-types.ts` (NEW): `Waypoint`, `Route`, `RouteLeg`.
- `src/entities/route/route-geojson.ts` (NEW): `routeToFeature`, `featureToRoute`, `routeLegs`, `routeDistanceMeters`.
- `src/entities/route/routes-store.svelte.ts` (NEW): `RouteStore` reactive store.
- `src/entities/route/index.ts` (NEW): public API.
- `src/features/routing/routes-client.ts` (NEW): `fetchRoutes`, `saveRoute`, `deleteRoute` (mirrors `tracks-client`).
- `src/features/routing/RoutesPanel.svelte` (NEW): the planner slide-over.
- `src/features/routing/index.ts` (NEW): public API.
- `src/features/route-layer/route-features.ts` (NEW): builds the display FeatureCollections.
- `src/features/route-layer/route-overlay.ts` (NEW): the `OverlayModule` in the `routes` band (mirrors `track-overlay`).
- `src/features/route-layer/index.ts` (NEW): public API.
- `src/features/route-edit/route-edit.ts` (NEW): Terra Draw wrapper.
- `src/features/route-edit/index.ts` (NEW): public API.
- `package.json` (MODIFY): add `terra-draw` and `terra-draw-maplibre-gl-adapter`.
- `src/app/App.svelte` and `src/widgets/chart-canvas/ChartCanvas.svelte` (MODIFY): wire the store, overlay, panel, and edit controller.

Phase B (active-navigation following):
- `src/shared/signalk/types.ts` (MODIFY): add `CourseInfo`, `ActiveRoute`, `NextPreviousPoint`, `CourseCalculations`.
- `src/shared/signalk/paths.ts` (MODIFY): add course paths to `SK_PATHS`.
- `src/features/routing/course-client.ts` (NEW): `activateRoute`, `advancePoint`, `clearCourse`, `hydrateCourse`.
- `src/entities/course/course.svelte.ts` (NEW): `CourseGuidance` (source-agnostic, calcValues-or-computed).
- `src/entities/course/index.ts` (NEW): public API.
- `src/features/navigation/arrival-alarm.ts` (NEW): `ArrivalAlarm` and `ARRIVAL_TONE`.
- `src/features/navigation/NavStrip.svelte` (NEW): the active-following readout.
- `src/features/navigation/index.ts` (NEW): public API.
- `src/app/App.svelte` (MODIFY): construct course guidance and client, add the course subscriptions, mount the nav strip, prime the arrival alarm, wire activation.
- `CLAUDE.md`, `CHANGELOG.md` (MODIFY): course-streaming refinement and the changelog entry.

---

# PHASE A: route planning and display

At the end of Phase A you can create, edit, save, list, show, hide, and delete routes, drawn on the chart. No following yet.

## Task 1: Coordinate conversion (the one place that crosses lon/lat orderings)

**Files:**
- Modify: `src/shared/signalk/geo-guards.ts`
- Modify: `src/shared/signalk/index.ts`
- Test: `src/shared/signalk/geo-guards.test.ts`

- [ ] **Step 1: Read the existing file** so you match its style.

Run: `sed -n '1,40p' src/shared/signalk/geo-guards.ts`
It already exports `interface LatLon { latitude: number; longitude: number }` and `isLatLon`.

- [ ] **Step 2: Write the failing test.** Append to `src/shared/signalk/geo-guards.test.ts` (create if missing, mirroring the existing test file header):

```ts
import { describe, expect, it } from 'vitest';
import { latLonToLonLat, lonLatToLatLon } from './geo-guards';

describe('coordinate conversion', () => {
  it('lonLatToLatLon swaps GeoJSON [lon, lat] to a LatLon object', () => {
    expect(lonLatToLatLon([-166.7, -60.5])).toEqual({ latitude: -60.5, longitude: -166.7 });
  });

  it('latLonToLonLat swaps a LatLon object to GeoJSON [lon, lat]', () => {
    expect(latLonToLonLat({ latitude: -60.5, longitude: -166.7 })).toEqual([-166.7, -60.5]);
  });

  it('round-trips', () => {
    const ll = { latitude: 12.34, longitude: -45.67 };
    expect(lonLatToLatLon(latLonToLonLat(ll))).toEqual(ll);
  });
});
```

- [ ] **Step 3: Run it, expect FAIL** (`latLonToLonLat` not exported).

Run: `npx vitest run src/shared/signalk/geo-guards.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement.** Add to `src/shared/signalk/geo-guards.ts`:

```ts
// GeoJSON coordinate order is longitude first; Signal K positions and the Course API use a
// {latitude, longitude} object. These two functions are the only place that crosses the two
// orderings, so a mismatch lives in exactly one tested spot.
export type LonLat = [number, number];

export function lonLatToLatLon([longitude, latitude]: LonLat): LatLon {
  return { latitude, longitude };
}

export function latLonToLonLat(position: LatLon): LonLat {
  return [position.longitude, position.latitude];
}
```

- [ ] **Step 5: Export.** In `src/shared/signalk/index.ts`, extend the geo-guards re-export line:

```ts
export { asNumber, isLatLon, latLonToLonLat, type LonLat, lonLatToLatLon } from './geo-guards';
```

- [ ] **Step 6: Run the test, expect PASS.**

Run: `npx vitest run src/shared/signalk/geo-guards.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/shared/signalk/geo-guards.ts src/shared/signalk/geo-guards.test.ts src/shared/signalk/index.ts
git commit -m "feat(routing): coordinate conversion between GeoJSON and LatLon"
```

## Task 2: Route geodesy in shared/nav

Pure functions, SI in and out. Reuse `DEG_TO_RAD` from `$shared/lib`, `haversineMeters` from `./distance`, and the clockwise-from-north course convention (east is `sog*sin(cog)`, north is `sog*cos(cog)`).

**Files:**
- Create: `src/shared/nav/route-geometry.ts`
- Modify: `src/shared/nav/index.ts`
- Test: `src/shared/nav/route-geometry.test.ts`

- [ ] **Step 1: Write the failing test.** `src/shared/nav/route-geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { degreesToRadians, knotsToMetersPerSecond } from '$shared/lib';
import {
  crossTrackErrorMeters,
  etaSeconds,
  rhumbBearingRad,
  rhumbDistanceMeters,
  vmgMps,
} from './route-geometry';

const NM = 1852;

describe('rhumbDistanceMeters', () => {
  it('measures about one nautical mile per minute of latitude due north', () => {
    const d = rhumbDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1 / 60, longitude: 0 });
    expect(d).toBeGreaterThan(NM * 0.99);
    expect(d).toBeLessThan(NM * 1.01);
  });

  it('handles an antimeridian crossing as a short hop, not a near-global span', () => {
    const d = rhumbDistanceMeters(
      { latitude: 0, longitude: 179.99 },
      { latitude: 0, longitude: -179.99 },
    );
    expect(d).toBeLessThan(3 * NM);
  });
});

describe('rhumbBearingRad', () => {
  it('is 0 due north and about pi/2 due east', () => {
    expect(rhumbBearingRad({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(0, 3);
    expect(
      rhumbBearingRad({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }),
    ).toBeCloseTo(Math.PI / 2, 2);
  });
});

describe('crossTrackErrorMeters', () => {
  it('is zero on the leg and positive to starboard of it', () => {
    const from = { latitude: 0, longitude: 0 };
    const to = { latitude: 0, longitude: 1 }; // leg runs due east
    expect(Math.abs(crossTrackErrorMeters(from, to, { latitude: 0, longitude: 0.5 }))).toBeLessThan(1);
    // A point south of an eastbound leg is to starboard (positive).
    expect(crossTrackErrorMeters(from, to, { latitude: -0.01, longitude: 0.5 })).toBeGreaterThan(0);
  });
});

describe('vmgMps', () => {
  it('equals boat speed when heading straight at the mark', () => {
    const v = vmgMps(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 }, // mark due north
      knotsToMetersPerSecond(6),
      degreesToRadians(0), // COG north
    );
    expect(v).toBeCloseTo(knotsToMetersPerSecond(6), 5);
  });

  it('is negative when sailing away from the mark', () => {
    const v = vmgMps(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
      knotsToMetersPerSecond(6),
      degreesToRadians(180),
    );
    expect(v).toBeLessThan(0);
  });
});

describe('etaSeconds', () => {
  it('is distance over speed', () => {
    expect(etaSeconds(1852, knotsToMetersPerSecond(6))).toBeCloseTo(1852 / knotsToMetersPerSecond(6), 3);
  });

  it('is undefined for a non-positive speed', () => {
    expect(etaSeconds(1852, 0)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.**

Run: `npx vitest run src/shared/nav/route-geometry.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** `src/shared/nav/route-geometry.ts`:

```ts
import { DEG_TO_RAD } from '$shared/lib';
import type { LatLon } from '$shared/signalk';
import { haversineMeters } from './distance';

const EARTH_RADIUS_M = 6_371_000;

function normalizeLonDeltaDeg(delta: number): number {
  let d = delta;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return d;
}

// Rhumb-line (constant-bearing) distance: the line you actually steer over a short to medium leg.
export function rhumbDistanceMeters(from: LatLon, to: LatLon): number {
  const dLatRad = (to.latitude - from.latitude) * DEG_TO_RAD;
  const dLonRad = normalizeLonDeltaDeg(to.longitude - from.longitude) * DEG_TO_RAD;
  const lat1 = from.latitude * DEG_TO_RAD;
  const lat2 = to.latitude * DEG_TO_RAD;
  // Stretched latitude difference (the Mercator projection of the meridional parts).
  const dPhi = Math.log(Math.tan(Math.PI / 4 + lat2 / 2) / Math.tan(Math.PI / 4 + lat1 / 2));
  const q = Math.abs(dPhi) > 1e-12 ? dLatRad / dPhi : Math.cos(lat1);
  return Math.hypot(dLatRad, q * dLonRad) * EARTH_RADIUS_M;
}

// Constant compass bearing from -> to, radians clockwise from true north in [0, 2pi).
export function rhumbBearingRad(from: LatLon, to: LatLon): number {
  const dLonRad = normalizeLonDeltaDeg(to.longitude - from.longitude) * DEG_TO_RAD;
  const lat1 = from.latitude * DEG_TO_RAD;
  const lat2 = to.latitude * DEG_TO_RAD;
  const dPhi = Math.log(Math.tan(Math.PI / 4 + lat2 / 2) / Math.tan(Math.PI / 4 + lat1 / 2));
  return (Math.atan2(dLonRad, dPhi) + 2 * Math.PI) % (2 * Math.PI);
}

// Initial great-circle bearing, for a long-passage readout alongside the rhumb bearing.
export function greatCircleBearingRad(from: LatLon, to: LatLon): number {
  const lat1 = from.latitude * DEG_TO_RAD;
  const lat2 = to.latitude * DEG_TO_RAD;
  const dLon = normalizeLonDeltaDeg(to.longitude - from.longitude) * DEG_TO_RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI);
}

// Signed cross-track distance (meters) of `position` from the great-circle leg from -> to.
// Positive is to starboard of the leg (right of the direction of travel), negative to port.
export function crossTrackErrorMeters(from: LatLon, to: LatLon, position: LatLon): number {
  const d13 = haversineMeters(from.latitude, from.longitude, position.latitude, position.longitude);
  const theta13 = greatCircleBearingRad(from, position);
  const theta12 = greatCircleBearingRad(from, to);
  // asin clamps via Math.max/min to stay in domain at the leg endpoints.
  const ratio = Math.max(-1, Math.min(1, (d13 / EARTH_RADIUS_M) * Math.sin(theta13 - theta12)));
  // The standard formula is already starboard-positive (theta13 > theta12 gives a positive arc), so
  // it is not negated. Reconcile the sign against the server's calcValues.crossTrackError live.
  return Math.asin(ratio) * EARTH_RADIUS_M;
}

// Velocity made good toward the mark: the boat's velocity vector projected onto the bearing to the
// mark. Positive closes the mark, negative opens it. SOG m/s, COG radians clockwise from north.
export function vmgMps(position: LatLon, mark: LatLon, sogMps: number, cogRad: number): number {
  const bearing = rhumbBearingRad(position, mark);
  return sogMps * Math.cos(cogRad - bearing);
}

// Seconds to cover `distanceMeters` at `speedMps`. Undefined for a non-positive speed (no ETA).
export function etaSeconds(distanceMeters: number, speedMps: number): number | undefined {
  if (speedMps <= 0) return undefined;
  return distanceMeters / speedMps;
}
```

- [ ] **Step 4: Export.** Read `src/shared/nav/index.ts`, then add the new names to its export list (it currently exports `CpaResult`, `Kinematics`, `computeCpa`, `haversineMeters`, and the distance exports):

```ts
export {
  crossTrackErrorMeters,
  etaSeconds,
  greatCircleBearingRad,
  rhumbBearingRad,
  rhumbDistanceMeters,
  vmgMps,
} from './route-geometry';
```

- [ ] **Step 5: Run the test, expect PASS.**

Run: `npx vitest run src/shared/nav/route-geometry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/shared/nav/route-geometry.ts src/shared/nav/route-geometry.test.ts src/shared/nav/index.ts
git commit -m "feat(routing): rhumb, great-circle, XTE, VMG, and ETA geodesy"
```

## Task 3: entities/route types and GeoJSON mapping

**Files:**
- Create: `src/entities/route/route-types.ts`
- Create: `src/entities/route/route-geojson.ts`
- Create: `src/entities/route/index.ts`
- Test: `src/entities/route/route-geojson.test.ts`

- [ ] **Step 1: Types.** `src/entities/route/route-types.ts`:

```ts
import type { LatLon } from '$shared/signalk';

// A route waypoint. Position is decimal degrees (the SI exception); name is optional.
export interface Waypoint {
  position: LatLon;
  name?: string;
}

// A planned route: an ordered list of waypoints with a stable client id and a name.
export interface Route {
  id: string;
  name: string;
  waypoints: Waypoint[];
}

// A derived leg between two consecutive waypoints. Distance meters, bearing radians (SI).
export interface RouteLeg {
  from: Waypoint;
  to: Waypoint;
  distanceMeters: number;
  bearingRad: number;
}
```

- [ ] **Step 2: Write the failing test.** `src/entities/route/route-geojson.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { featureToRoute, routeDistanceMeters, routeLegs, routeToFeature } from './route-geojson';
import type { Route } from './route-types';

const ROUTE: Route = {
  id: 'r1',
  name: 'Test',
  waypoints: [
    { position: { latitude: 0, longitude: 0 }, name: 'A' },
    { position: { latitude: 0, longitude: 1 }, name: 'B' },
    { position: { latitude: 0, longitude: 2 } },
  ],
};

describe('routeToFeature', () => {
  it('emits a LineString with [lon, lat] coordinates and the SI distance', () => {
    const f = routeToFeature(ROUTE);
    expect(f.feature.geometry.type).toBe('LineString');
    expect(f.feature.geometry.coordinates[0]).toEqual([0, 0]);
    expect(f.feature.geometry.coordinates[1]).toEqual([1, 0]);
    expect(f.name).toBe('Test');
    expect(f.distance).toBeGreaterThan(0);
  });
});

describe('featureToRoute', () => {
  it('parses a server route Feature back to waypoints, deriving name from coordinatesMeta', () => {
    const body = {
      name: 'Server route',
      feature: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] },
        properties: { coordinatesMeta: [{ name: 'X' }, { name: 'Y' }] },
      },
    };
    const route = featureToRoute('id-9', body);
    expect(route?.id).toBe('id-9');
    expect(route?.name).toBe('Server route');
    expect(route?.waypoints[0]).toEqual({ position: { latitude: 0, longitude: 0 }, name: 'X' });
    expect(route?.waypoints[1].position).toEqual({ latitude: 0, longitude: 1 });
  });

  it('returns undefined for a non-LineString or a too-short line', () => {
    expect(featureToRoute('id', { feature: { geometry: { type: 'Point', coordinates: [0, 0] } } })).toBeUndefined();
    expect(
      featureToRoute('id', { feature: { geometry: { type: 'LineString', coordinates: [[0, 0]] } } }),
    ).toBeUndefined();
  });
});

describe('routeLegs and routeDistanceMeters', () => {
  it('derives one leg per consecutive pair with SI distance and bearing', () => {
    const legs = routeLegs(ROUTE.waypoints);
    expect(legs).toHaveLength(2);
    expect(legs[0].distanceMeters).toBeGreaterThan(0);
    expect(legs[0].bearingRad).toBeCloseTo(Math.PI / 2, 1);
  });

  it('totals the leg distances', () => {
    const total = routeDistanceMeters(ROUTE.waypoints);
    const legs = routeLegs(ROUTE.waypoints);
    expect(total).toBeCloseTo(legs[0].distanceMeters + legs[1].distanceMeters, 3);
  });
});
```

- [ ] **Step 3: Run it, expect FAIL.**

Run: `npx vitest run src/entities/route/route-geojson.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement.** `src/entities/route/route-geojson.ts`:

```ts
import { rhumbBearingRad, rhumbDistanceMeters } from '$shared/nav';
import { latLonToLonLat, lonLatToLatLon } from '$shared/signalk';
import type { Route, RouteLeg, Waypoint } from './route-types';

// The Signal K v2 route resource body: a GeoJSON Feature with a LineString, plus name and the
// total SI distance. Per-waypoint names ride in properties.coordinatesMeta, index-aligned.
export interface RouteResourceBody {
  name: string;
  distance: number;
  feature: {
    type: 'Feature';
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    properties: { coordinatesMeta: Array<{ name?: string }> };
  };
}

export function routeToFeature(route: Route): RouteResourceBody {
  return {
    name: route.name,
    distance: routeDistanceMeters(route.waypoints),
    feature: {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: route.waypoints.map((w) => latLonToLonLat(w.position)) },
      properties: { coordinatesMeta: route.waypoints.map((w) => ({ name: w.name })) },
    },
  };
}

export function featureToRoute(id: string, raw: unknown): Route | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { name?: unknown; feature?: { geometry?: { type?: unknown; coordinates?: unknown }; properties?: { coordinatesMeta?: unknown } } };
  const geom = r.feature?.geometry;
  if (!geom || geom.type !== 'LineString' || !Array.isArray(geom.coordinates)) return undefined;
  const meta = Array.isArray(r.feature?.properties?.coordinatesMeta)
    ? (r.feature?.properties?.coordinatesMeta as Array<{ name?: unknown }>)
    : [];
  const waypoints: Waypoint[] = [];
  geom.coordinates.forEach((coord, i) => {
    if (Array.isArray(coord) && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
      const name = typeof meta[i]?.name === 'string' ? (meta[i].name as string) : undefined;
      waypoints.push({ position: lonLatToLatLon([coord[0], coord[1]]), ...(name ? { name } : {}) });
    }
  });
  if (waypoints.length < 2) return undefined;
  const name = typeof r.name === 'string' && r.name ? r.name : id;
  return { id, name, waypoints };
}

export function routeLegs(waypoints: readonly Waypoint[]): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let i = 1; i < waypoints.length; i += 1) {
    const from = waypoints[i - 1];
    const to = waypoints[i];
    legs.push({
      from,
      to,
      distanceMeters: rhumbDistanceMeters(from.position, to.position),
      bearingRad: rhumbBearingRad(from.position, to.position),
    });
  }
  return legs;
}

export function routeDistanceMeters(waypoints: readonly Waypoint[]): number {
  return routeLegs(waypoints).reduce((sum, leg) => sum + leg.distanceMeters, 0);
}
```

The converters `latLonToLonLat` and `lonLatToLatLon` come from `$shared/signalk` (Task 1); the geodesy comes from `$shared/nav` (Task 2). No converter lives in nav.

- [ ] **Step 5: Create the slice public API.** `src/entities/route/index.ts`:

```ts
export { featureToRoute, type RouteResourceBody, routeDistanceMeters, routeLegs, routeToFeature } from './route-geojson';
export type { Route, RouteLeg, Waypoint } from './route-types';
```

- [ ] **Step 6: Run the test, expect PASS.**

Run: `npx vitest run src/entities/route/route-geojson.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/entities/route/route-types.ts src/entities/route/route-geojson.ts src/entities/route/route-geojson.test.ts src/entities/route/index.ts
git commit -m "feat(routing): route types and GeoJSON resource mapping"
```

## Task 4: entities/route reactive store

Holds the loaded routes, the shown subset, the working (under-edit) route, and the active route id. Runes store, mirrors the `$state` plus version-counter pattern used for saved tracks in `App.svelte`.

**Files:**
- Create: `src/entities/route/routes-store.svelte.ts`
- Modify: `src/entities/route/index.ts`
- Test: `src/entities/route/routes-store.svelte.test.ts`

- [ ] **Step 1: Write the failing test.** `src/entities/route/routes-store.svelte.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RouteStore } from './routes-store.svelte';
import type { Route } from './route-types';

const route = (id: string): Route => ({
  id,
  name: id,
  waypoints: [
    { position: { latitude: 0, longitude: 0 } },
    { position: { latitude: 0, longitude: 1 } },
  ],
});

describe('RouteStore', () => {
  it('sets the loaded routes and bumps the version', () => {
    const s = new RouteStore();
    const v0 = s.version;
    s.setRoutes([route('a'), route('b')]);
    expect(s.routes.map((r) => r.id)).toEqual(['a', 'b']);
    expect(s.version).toBeGreaterThan(v0);
  });

  it('toggles a route shown and reports it', () => {
    const s = new RouteStore();
    s.setRoutes([route('a')]);
    expect(s.isShown('a')).toBe(false);
    s.toggleShown('a', true);
    expect(s.isShown('a')).toBe(true);
    expect(s.shownIds.has('a')).toBe(true);
  });

  it('tracks the active route id', () => {
    const s = new RouteStore();
    expect(s.activeId).toBeUndefined();
    s.setActive('a');
    expect(s.activeId).toBe('a');
    s.setActive(undefined);
    expect(s.activeId).toBeUndefined();
  });

  it('holds and clears a working route under edit', () => {
    const s = new RouteStore();
    s.setWorking(route('draft'));
    expect(s.working?.id).toBe('draft');
    s.setWorking(undefined);
    expect(s.working).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.**

Run: `npx vitest run src/entities/route/routes-store.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** `src/entities/route/routes-store.svelte.ts`:

```ts
import type { Route } from './route-types';

// The reactive home for routes: the loaded list, which are shown on the chart, the working route
// under edit, and which route is active. A version counter lets the overlay poll for changes the
// way the saved-tracks overlay does, without deep reactivity on the arrays.
export class RouteStore {
  routes = $state<Route[]>([]);
  shownIds = $state<Set<string>>(new Set());
  working = $state<Route | undefined>(undefined);
  activeId = $state<string | undefined>(undefined);
  version = $state(0);

  setRoutes(routes: Route[]): void {
    this.routes = routes;
    this.version += 1;
  }

  isShown(id: string): boolean {
    return this.shownIds.has(id);
  }

  toggleShown(id: string, shown: boolean): void {
    const next = new Set(this.shownIds);
    if (shown) next.add(id);
    else next.delete(id);
    this.shownIds = next;
    this.version += 1;
  }

  setWorking(route: Route | undefined): void {
    this.working = route;
    this.version += 1;
  }

  setActive(id: string | undefined): void {
    this.activeId = id;
    this.version += 1;
  }
}
```

- [ ] **Step 4: Export.** Add to `src/entities/route/index.ts`:

```ts
export { RouteStore } from './routes-store.svelte';
```

- [ ] **Step 5: Run the test, expect PASS.**

Run: `npx vitest run src/entities/route/routes-store.svelte.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/entities/route/routes-store.svelte.ts src/entities/route/routes-store.svelte.test.ts src/entities/route/index.ts
git commit -m "feat(routing): reactive route store"
```

## Task 5: routes-client (Signal K resource CRUD)

Mirror `src/features/tracks/tracks-client.ts` exactly. Read with V2-then-V1 fallback, write with PUT to a client UUID, return success booleans.

**Files:**
- Create: `src/features/routing/routes-client.ts`
- Create: `src/features/routing/index.ts`
- Test: `src/features/routing/routes-client.test.ts`

- [ ] **Step 1: Read the pattern.** `sed -n '1,170p' src/features/tracks/tracks-client.ts` and note `authInit`, `asKeyedObject`, the `tryFetch` V2-then-V1 shape, and the PUT and DELETE writes.

- [ ] **Step 2: Write the failing test.** `src/features/routing/routes-client.test.ts` (mirror `tracks-client.test.ts`):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Route } from '$entities/route';
import { deleteRoute, fetchRoutes, saveRoute } from './routes-client';

afterEach(() => vi.restoreAllMocks());

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const ROUTE_BODY = {
  name: 'R',
  feature: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] }, properties: {} },
};

describe('fetchRoutes', () => {
  it('reads v2 and parses the keyed object into routes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ 'id-1': ROUTE_BODY }));
    const routes = await fetchRoutes('http://pi', 'tok');
    expect(fetchMock.mock.calls[0][0]).toContain('/signalk/v2/api/resources/routes');
    expect(routes[0].id).toBe('id-1');
    expect(routes[0].waypoints).toHaveLength(2);
  });

  it('falls back to v1 when v2 is not ok', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(jsonResponse({ 'id-1': ROUTE_BODY }));
    const routes = await fetchRoutes('http://pi');
    expect(fetchMock.mock.calls[1][0]).toContain('/signalk/v1/api/resources/routes');
    expect(routes).toHaveLength(1);
  });
});

describe('saveRoute', () => {
  it('PUTs a GeoJSON route body to the route id and returns ok', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, true));
    const route: Route = { id: 'abc', name: 'R', waypoints: [
      { position: { latitude: 0, longitude: 0 } },
      { position: { latitude: 0, longitude: 1 } },
    ] };
    const ok = await saveRoute('http://pi', 'tok', route);
    expect(ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('http://pi/signalk/v2/api/resources/routes/abc');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('PUT');
    const sent = JSON.parse(init.body as string);
    expect(sent.feature.geometry.coordinates[1]).toEqual([1, 0]);
  });
});

describe('deleteRoute', () => {
  it('DELETEs the route id and returns ok', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, true));
    const ok = await deleteRoute('http://pi', 'tok', 'abc');
    expect(ok).toBe(true);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });
});
```

- [ ] **Step 3: Run it, expect FAIL.**

Run: `npx vitest run src/features/routing/routes-client.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement.** `src/features/routing/routes-client.ts`:

```ts
import { featureToRoute, type Route, routeToFeature } from '$entities/route';
import { asKeyedObject, authInit } from '$shared/signalk';

const V2 = '/signalk/v2/api/resources/routes';
const V1 = '/signalk/v1/api/resources/routes';

async function tryFetch(url: string, token?: string): Promise<Route[] | undefined> {
  try {
    const response = await fetch(url, authInit(token));
    if (!response.ok) return undefined;
    const keyed = asKeyedObject(await response.json());
    if (!keyed) return undefined;
    const out: Route[] = [];
    for (const [id, raw] of Object.entries(keyed)) {
      const route = featureToRoute(id, raw);
      if (route) out.push(route);
    }
    return out;
  } catch {
    return undefined;
  }
}

export async function fetchRoutes(base: string, token?: string): Promise<Route[]> {
  const v2 = await tryFetch(`${base}${V2}`, token);
  if (v2) return v2;
  return (await tryFetch(`${base}${V1}`, token)) ?? [];
}

// PUT the route to its client-chosen id. Returns whether the write succeeded.
export async function saveRoute(base: string, token: string | undefined, route: Route): Promise<boolean> {
  try {
    const response = await fetch(
      `${base}${V2}/${encodeURIComponent(route.id)}`,
      authInit(token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routeToFeature(route)),
      }),
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function deleteRoute(base: string, token: string | undefined, id: string): Promise<boolean> {
  try {
    const response = await fetch(`${base}${V2}/${encodeURIComponent(id)}`, authInit(token, { method: 'DELETE' }));
    return response.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Public API.** `src/features/routing/index.ts`:

```ts
export { deleteRoute, fetchRoutes, saveRoute } from './routes-client';
```

- [ ] **Step 6: Run the test, expect PASS.**

Run: `npx vitest run src/features/routing/routes-client.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/features/routing/routes-client.ts src/features/routing/routes-client.test.ts src/features/routing/index.ts
git commit -m "feat(routing): routes-client resource CRUD"
```

## Task 6: route-layer display overlay

Mirror `src/features/track-layer/track-overlay.ts`. One geojson source for route lines, one for waypoint markers, one for the active-leg highlight. A custom `sync(ctx)` dirty-checked on `RouteStore.version`.

**Files:**
- Create: `src/features/route-layer/route-features.ts`
- Create: `src/features/route-layer/route-overlay.ts`
- Create: `src/features/route-layer/index.ts`
- Test: `src/features/route-layer/route-features.test.ts`, `src/features/route-layer/route-overlay.test.ts`

- [ ] **Step 1: Read the pattern.** `sed -n '1,160p' src/features/track-layer/track-overlay.ts` and `sed -n '1,30p' src/features/track-layer/track-geojson.ts`. Read `src/shared/map/types.ts` for `OverlayModule`, `OverlayContext`, and the `routes` band. Read the marker pattern in `src/features/notes/notes-overlay.ts:81-261`.

- [ ] **Step 2: Write the failing test for the features builder.** `src/features/route-layer/route-features.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Route } from '$entities/route';
import { routeLineFeatures, waypointFeatures } from './route-features';

const route: Route = {
  id: 'r1',
  name: 'R',
  waypoints: [
    { position: { latitude: 0, longitude: 0 }, name: 'A' },
    { position: { latitude: 0, longitude: 1 }, name: 'B' },
  ],
};

describe('routeLineFeatures', () => {
  it('emits one LineString per shown route with [lon, lat] coordinates', () => {
    const fc = routeLineFeatures([route], new Set(['r1']), undefined);
    expect(fc.features).toHaveLength(1);
    const geom = fc.features[0].geometry as GeoJSON.LineString;
    expect(geom.coordinates[0]).toEqual([0, 0]);
    expect(fc.features[0].properties?.active).toBe(false);
  });

  it('omits routes that are not shown', () => {
    expect(routeLineFeatures([route], new Set(), undefined).features).toHaveLength(0);
  });

  it('marks the active route active', () => {
    const fc = routeLineFeatures([route], new Set(['r1']), 'r1');
    expect(fc.features[0].properties?.active).toBe(true);
  });
});

describe('waypointFeatures', () => {
  it('emits one Point per waypoint of shown routes with the index and name', () => {
    const fc = waypointFeatures([route], new Set(['r1']));
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [0, 0] });
    expect(fc.features[1].properties).toMatchObject({ name: 'B', index: 1 });
  });
});
```

- [ ] **Step 3: Run it, expect FAIL.**

Run: `npx vitest run src/features/route-layer/route-features.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the features builder.** `src/features/route-layer/route-features.ts`:

```ts
import type { Route } from '$entities/route';
import { latLonToLonLat as toLonLat } from '$shared/signalk';

// One LineString per shown route, flagged active so the overlay can style the active route apart.
export function routeLineFeatures(
  routes: readonly Route[],
  shownIds: ReadonlySet<string>,
  activeId: string | undefined,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const route of routes) {
    if (!shownIds.has(route.id)) continue;
    if (route.waypoints.length < 2) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: route.waypoints.map((w) => toLonLat(w.position)) },
      properties: { id: route.id, active: route.id === activeId },
    });
  }
  return { type: 'FeatureCollection', features };
}

// One Point per waypoint of each shown route, carrying its name and zero-based index for labels.
export function waypointFeatures(
  routes: readonly Route[],
  shownIds: ReadonlySet<string>,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const route of routes) {
    if (!shownIds.has(route.id)) continue;
    route.waypoints.forEach((w, index) => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: toLonLat(w.position) },
        properties: { id: route.id, index, name: w.name ?? `${index + 1}` },
      });
    });
  }
  return { type: 'FeatureCollection', features };
}
```

- [ ] **Step 5: Run the features test, expect PASS.**

Run: `npx vitest run src/features/route-layer/route-features.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement the overlay.** `src/features/route-layer/route-overlay.ts`. Follow `track-overlay.ts` structure exactly: module-level ids, `BAND = 'routes'`, a factory `createRouteOverlay(store: RouteStore)` returning an `OverlayModule & { sync(ctx): void }`. In `add`, create three geojson sources (`route-lines`, `route-waypoints`) with `emptyFeatureCollection()` and add a `line` layer (data-driven width and color on `['get','active']`), a `circle` or `symbol` layer for waypoints, and a `symbol` text layer for waypoint labels, each with `ctx.beforeIdFor('routes')`. In `sync(ctx)`, dirty-check on `store.version` and call `setData` for both sources. In `applyTheme`, recolor the line and waypoint paint from `paint` (use `paint.note` and `paint.select` for waypoints, a distinct color for the active route line). Wire `setVisible`, `setOpacity`, and `remove` per the track overlay. Use `mapThemePaint('day')` as the initial paint.

Reference code skeleton (fill the layer specs following `track-overlay.ts` and `notes-overlay.ts`):

```ts
import type { GeoJSONSource } from 'maplibre-gl';
import type { RouteStore } from '$entities/route';
import { emptyFeatureCollection, mapThemePaint, type MapThemePaint, type OverlayContext, type OverlayModule } from '$shared/map';
import { routeLineFeatures, waypointFeatures } from './route-features';

const LINE_SRC = 'binnacle-route-lines';
const LINE_LAYER = 'binnacle-route-line';
const WPT_SRC = 'binnacle-route-waypoints';
const WPT_LAYER = 'binnacle-route-waypoint';
const WPT_LABEL_LAYER = 'binnacle-route-waypoint-label';
const BAND = 'routes';

export interface RouteOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

export function createRouteOverlay(store: RouteStore): RouteOverlay {
  let paint: MapThemePaint = mapThemePaint('day');
  let lastVersion = -1;

  function lineData(): GeoJSON.FeatureCollection {
    return routeLineFeatures(store.routes, store.shownIds, store.activeId);
  }
  function wptData(): GeoJSON.FeatureCollection {
    return waypointFeatures(store.routes, store.shownIds);
  }

  return {
    id: 'routes',
    title: 'Routes',
    band: BAND,
    supportsOpacity: true,
    defaultVisible: true,
    layerIds: [LINE_LAYER, WPT_LAYER, WPT_LABEL_LAYER],
    add(ctx) {
      lastVersion = -1;
      const before = ctx.beforeIdFor(BAND);
      if (!ctx.map.getSource(LINE_SRC)) ctx.map.addSource(LINE_SRC, { type: 'geojson', data: emptyFeatureCollection() });
      if (!ctx.map.getSource(WPT_SRC)) ctx.map.addSource(WPT_SRC, { type: 'geojson', data: emptyFeatureCollection() });
      if (!ctx.map.getLayer(LINE_LAYER)) {
        ctx.map.addLayer({
          id: LINE_LAYER, type: 'line', source: LINE_SRC,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['case', ['get', 'active'], paint.select, paint.note],
            'line-width': ['case', ['get', 'active'], 3, 2],
            'line-dasharray': [2, 1],
          },
        }, before);
      }
      if (!ctx.map.getLayer(WPT_LAYER)) {
        ctx.map.addLayer({
          id: WPT_LAYER, type: 'circle', source: WPT_SRC,
          paint: { 'circle-radius': 4, 'circle-color': paint.note, 'circle-stroke-color': paint.markerGlyph, 'circle-stroke-width': 1 },
        }, before);
      }
      if (!ctx.map.getLayer(WPT_LABEL_LAYER)) {
        ctx.map.addLayer({
          id: WPT_LABEL_LAYER, type: 'symbol', source: WPT_SRC,
          layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-optional': true },
          paint: { 'text-color': paint.label, 'text-halo-color': paint.background, 'text-halo-width': 1.5 },
        }, before);
      }
    },
    sync(ctx) {
      if (store.version === lastVersion) return;
      lastVersion = store.version;
      (ctx.map.getSource(LINE_SRC) as GeoJSONSource | undefined)?.setData(lineData());
      (ctx.map.getSource(WPT_SRC) as GeoJSONSource | undefined)?.setData(wptData());
    },
    setVisible(ctx, visible) {
      for (const id of [LINE_LAYER, WPT_LAYER, WPT_LABEL_LAYER]) {
        ctx.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LINE_LAYER, 'line-opacity', opacity);
      ctx.map.setPaintProperty(WPT_LAYER, 'circle-opacity', opacity);
    },
    applyTheme(ctx, next) {
      paint = next;
      ctx.map.setPaintProperty(LINE_LAYER, 'line-color', ['case', ['get', 'active'], paint.select, paint.note]);
      ctx.map.setPaintProperty(WPT_LAYER, 'circle-color', paint.note);
      ctx.map.setPaintProperty(WPT_LAYER, 'circle-stroke-color', paint.markerGlyph);
      ctx.map.setPaintProperty(WPT_LABEL_LAYER, 'text-color', paint.label);
      ctx.map.setPaintProperty(WPT_LABEL_LAYER, 'text-halo-color', paint.background);
    },
    remove(ctx) {
      for (const id of [LINE_LAYER, WPT_LAYER, WPT_LABEL_LAYER]) if (ctx.map.getLayer(id)) ctx.map.removeLayer(id);
      for (const src of [LINE_SRC, WPT_SRC]) if (ctx.map.getSource(src)) ctx.map.removeSource(src);
    },
  };
}
```

- [ ] **Step 7: Write an overlay test against the fake map.** `src/features/route-layer/route-overlay.test.ts` mirrors any existing `*-overlay.test.ts` (for example `src/features/track-layer/track-overlay.test.ts`): construct a `RouteStore`, add a route, mark it shown, build the overlay, call `add` then `sync` against `createFakeMap()` from `$shared/testing/fake-map`, and assert the line and waypoint layers exist and the source data has the expected feature counts.

```ts
import { describe, expect, it } from 'vitest';
import { RouteStore } from '$entities/route';
import { createFakeMap } from '$shared/testing/fake-map';
import { createRouteOverlay } from './route-overlay';

function ctx() {
  return { map: createFakeMap() as never, beforeIdFor: () => undefined };
}

it('adds the route, waypoint, and label layers and syncs shown routes', () => {
  const store = new RouteStore();
  store.setRoutes([{ id: 'r1', name: 'R', waypoints: [
    { position: { latitude: 0, longitude: 0 } }, { position: { latitude: 0, longitude: 1 } },
  ] }]);
  store.toggleShown('r1', true);
  const overlay = createRouteOverlay(store);
  const c = ctx();
  overlay.add(c);
  overlay.sync(c);
  expect(c.map.getLayer('binnacle-route-line')).toBeTruthy();
  expect(c.map.getLayer('binnacle-route-waypoint')).toBeTruthy();
});
```

Adjust the assertions to whatever `createFakeMap` records (read `src/shared/testing/fake-map.ts` first to see its API; it tracks added sources and layers).

- [ ] **Step 8: Public API.** `src/features/route-layer/index.ts`:

```ts
export { createRouteOverlay, type RouteOverlay } from './route-overlay';
```

- [ ] **Step 9: Run both tests, expect PASS.**

Run: `npx vitest run src/features/route-layer/`
Expected: PASS.

- [ ] **Step 10: Commit.**

```bash
git add src/features/route-layer/
git commit -m "feat(routing): route-layer display overlay"
```

## Task 7: Terra Draw deps and the route-edit wrapper

**Files:**
- Modify: `package.json`
- Create: `src/features/route-edit/route-edit.ts`
- Create: `src/features/route-edit/index.ts`
- Test: `src/features/route-edit/route-edit.test.ts`

- [ ] **Step 1: Add the deps.** Add to `package.json` `dependencies` at their latest compatible versions (check `npm view terra-draw version` and `npm view terra-draw-maplibre-gl-adapter version` first), then install:

```bash
npm install terra-draw@latest terra-draw-maplibre-gl-adapter@latest
```

Confirm `npm audit --omit=dev` is clean afterward.

- [ ] **Step 2: Write a failing test for the geometry conversion** (the testable part; do not test Terra Draw internals). `src/features/route-edit/route-edit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { routeToDrawFeature, drawFeatureToWaypoints } from './route-edit';

it('routeToDrawFeature emits a linestring Feature in [lon, lat] with mode linestring', () => {
  const f = routeToDrawFeature({ id: 'r', name: 'R', waypoints: [
    { position: { latitude: 0, longitude: 0 } }, { position: { latitude: 0, longitude: 1 } },
  ] });
  expect(f.properties.mode).toBe('linestring');
  expect((f.geometry as GeoJSON.LineString).coordinates[1]).toEqual([1, 0]);
});

it('drawFeatureToWaypoints reads a linestring Feature back to waypoints', () => {
  const wps = drawFeatureToWaypoints({
    type: 'Feature', properties: { mode: 'linestring' },
    geometry: { type: 'LineString', coordinates: [[0, 0], [2, 1]] },
  });
  expect(wps).toEqual([
    { position: { latitude: 0, longitude: 0 } },
    { position: { latitude: 1, longitude: 2 } },
  ]);
});
```

- [ ] **Step 3: Run it, expect FAIL.**

Run: `npx vitest run src/features/route-edit/route-edit.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement.** `src/features/route-edit/route-edit.ts`. Export the two pure converters plus a `createRouteEditor({ map, lib, beforeId, onChange })` factory that constructs `new TerraDraw({ adapter: new TerraDrawMapLibreGLAdapter({ map, lib, prefixId: 'binnacle-route-draw-' }), modes: [point, linestring, select] })`, exposes `start(route?)`, `setMode`, `read()` (snapshot to waypoints), and `stop()`. Wire `draw.on('finish', ...)` and a debounced `draw.on('change', ...)` to `onChange(read())`. Drive theme styling via `draw.updateModeOptions`. Use the `renderBelowLayerId: beforeId` adapter option to anchor the draw layers in the routes band. Pure converters:

```ts
import type { Waypoint } from '$entities/route';
import { latLonToLonLat, lonLatToLatLon } from '$shared/signalk';
import type { Route } from '$entities/route';

export function routeToDrawFeature(route: Route): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { mode: 'linestring' },
    geometry: { type: 'LineString', coordinates: route.waypoints.map((w) => latLonToLonLat(w.position)) },
  };
}

export function drawFeatureToWaypoints(feature: GeoJSON.Feature): Waypoint[] {
  const geom = feature.geometry;
  if (geom.type !== 'LineString') return [];
  return geom.coordinates
    .filter((c): c is [number, number] => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number')
    .map((c) => ({ position: lonLatToLatLon([c[0], c[1]]) }));
}
```

The Terra Draw factory below the converters (no unit test; verified live in Task 14):

```ts
import { TerraDraw, TerraDrawLineStringMode, TerraDrawPointMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Map as MapLibreMap } from 'maplibre-gl';

export interface RouteEditor {
  start(route?: Route): void;
  setMode(mode: 'point' | 'linestring' | 'select'): void;
  read(): Waypoint[];
  stop(): void;
}

export function createRouteEditor(opts: {
  map: MapLibreMap;
  lib: typeof import('maplibre-gl');
  beforeId?: string;
  onChange: (waypoints: Waypoint[]) => void;
}): RouteEditor {
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map: opts.map, lib: opts.lib, prefixId: 'binnacle-route-draw-', renderBelowLayerId: opts.beforeId }),
    modes: [
      new TerraDrawPointMode(),
      new TerraDrawLineStringMode(),
      new TerraDrawSelectMode({ flags: { linestring: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } } } }),
    ],
  });
  const read = (): Waypoint[] => {
    const line = draw.getSnapshot().find((f) => f.properties.mode === 'linestring');
    return line ? drawFeatureToWaypoints(line as GeoJSON.Feature) : [];
  };
  draw.on('change', () => opts.onChange(read()));
  return {
    start(route) {
      draw.start();
      if (route && route.waypoints.length > 0) {
        draw.addFeatures([routeToDrawFeature(route)]);
        draw.setMode('select');
      } else {
        draw.setMode('linestring');
      }
    },
    setMode(mode) { draw.setMode(mode); },
    read,
    stop() { draw.stop(); },
  };
}
```

- [ ] **Step 5: Public API.** `src/features/route-edit/index.ts`:

```ts
export { createRouteEditor, drawFeatureToWaypoints, type RouteEditor, routeToDrawFeature } from './route-edit';
```

- [ ] **Step 6: Run the test and the type-check.**

Run: `npx vitest run src/features/route-edit/route-edit.test.ts` then `npm run check`
Expected: tests PASS, type-check clean. If the Terra Draw mode option types differ from the snippet, follow the installed package's types (read `node_modules/terra-draw/dist/terra-draw.d.ts`).

- [ ] **Step 7: Commit.**

```bash
git add package.json package-lock.json src/features/route-edit/
git commit -m "feat(routing): Terra Draw route editor wrapper"
```

## Task 8: RoutesPanel and Phase A wiring

**Files:**
- Create: `src/features/routing/RoutesPanel.svelte`
- Modify: `src/features/routing/index.ts`
- Modify: `src/app/App.svelte`
- Modify: `src/widgets/chart-canvas/ChartCanvas.svelte`

- [ ] **Step 1: Read the panel pattern.** Read `src/features/tracks/TracksPanel.svelte` for the slide-over chrome (props in, callbacks out, themed CSS). Read `src/app/App.svelte:120-205, 440-502` for how the saved-tracks state, the menu items, and a slide-over panel are wired, and `src/widgets/chart-canvas/ChartCanvas.svelte:100-161` for overlay registration and `runTick`.

- [ ] **Step 2: Build `RoutesPanel.svelte`.** Props: `routes: Route[]`, `shownIds: ReadonlySet<string>`, `working: Route | undefined`, callbacks `onNew()`, `onEdit(id)`, `onSave()`, `onCancel()`, `onToggleShown(id, shown)`, `onActivate(id)`, `onDelete(id)`, `onRename(id, name)`. Render the route list with a show toggle, an Edit, an Activate, and a Delete per row, plus a "New route" button and, while a working route is under edit, a live readout of total distance (`routeDistanceMeters(working.waypoints)` formatted with `formatNm`) and Save and Cancel. Mirror the TracksPanel markup and themed CSS variables.

- [ ] **Step 3: Wire `App.svelte`.** Construct `const routeStore = new RouteStore()` near the other stores. Add a `routesPanelOpen = $state(false)` and a menu item "Routes" that opens it (mirror the Layers menu item). Add load logic: in the resource-load effect that already fetches saved tracks, also `fetchRoutes(serverOrigin(), chartsToken)` and `routeStore.setRoutes(...)`. Implement the panel callbacks: `onNew` sets a fresh working route and enters edit mode (calls into the editor exposed by ChartCanvas via a command, see Step 4); `onSave` calls `saveRoute`, refetches, clears working, exits edit; `onToggleShown` calls `routeStore.toggleShown`; `onDelete` calls `deleteRoute` and refetches. Pass `routeStore` to `ChartCanvas` as a prop. Mount `<RoutesPanel .../>` in a free slide-over slot (mirror the Layers panel slot).

- [ ] **Step 4: Wire `ChartCanvas.svelte`.** Accept the `routeStore` prop. Build `const routeOverlay = createRouteOverlay(routeStore)` and add it to the `manager.registerAll([...])` array, and add `routeOverlay` to the `runTick([...])` list so its `sync` flushes each frame. Construct the route editor lazily (`createRouteEditor({ map, lib: maplibregl, beforeId: ctx.beforeIdFor('routes'), onChange: (wps) => routeStore.setWorking({ ...routeStore.working!, waypoints: wps }) })`) and expose `enterEdit(route)`, `exitEdit()`, and `readEdit()` through the existing `onCommandsReady` command object so `App.svelte` can drive editing from the panel.

- [ ] **Step 5: Export the panel.** Add to `src/features/routing/index.ts`:

```ts
export { default as RoutesPanel } from './RoutesPanel.svelte';
```

- [ ] **Step 6: Run the full gate.** One command at a time:

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm test
npm run check
npm run lint
npm run cruise
NODE_OPTIONS="--max-old-space-size=2048" npm run build
```

Expected: all green. Fix any boundary violation (cruise) or type error before committing.

- [ ] **Step 7: Commit.**

```bash
git add src/features/routing/ src/app/App.svelte src/widgets/chart-canvas/ChartCanvas.svelte
git commit -m "feat(routing): routes panel, overlay wiring, and chart editing"
```

**Phase A checkpoint:** routes can be created, edited on the chart, saved to the server, listed, shown, hidden, and deleted. Verify live in the running app over https before starting Phase B (see Task 14 for the live-verify harness).

---

# PHASE B: active-navigation following

## Task 9: Course wire types and SK_PATHS

**Files:**
- Modify: `src/shared/signalk/types.ts`
- Modify: `src/shared/signalk/paths.ts`

- [ ] **Step 1: Add the wire types** to `src/shared/signalk/types.ts` (mirror, do not import `@signalk/server-api`):

```ts
// Mirrors the Signal K v2 navigation.course shapes Binnacle reads. Units: meters, radians, m/s,
// seconds, ISO 8601, positions decimal degrees.
export interface CoursePoint {
  type?: string;
  href?: string;
  name?: string;
  position?: { latitude: number; longitude: number };
}
export interface ActiveRoute {
  href?: string;
  pointIndex?: number;
  pointTotal?: number;
  reverse?: boolean;
  name?: string;
}
export interface CourseInfo {
  arrivalCircle?: number; // meters
  activeRoute?: ActiveRoute;
  nextPoint?: CoursePoint;
  previousPoint?: CoursePoint;
  startTime?: string;
  targetArrivalTime?: string | null;
}
export interface CourseCalculations {
  calcMethod?: 'GreatCircle' | 'Rhumbline';
  crossTrackError?: number | null; // meters
  bearingTrackTrue?: number | null; // radians
  distance?: number | null; // meters to next point
  bearingTrue?: number | null; // radians to next point
  velocityMadeGood?: number | null; // m/s
  timeToGo?: number | null; // seconds
  estimatedTimeOfArrival?: string | null; // ISO 8601
}
```

- [ ] **Step 2: Add the course paths** to `SK_PATHS` in `src/shared/signalk/paths.ts`:

```ts
  courseNextPoint: 'navigation.course.nextPoint',
  coursePreviousPoint: 'navigation.course.previousPoint',
  courseActiveRoute: 'navigation.course.activeRoute',
  courseArrivalCircle: 'navigation.course.arrivalCircle',
  courseCalcValues: 'navigation.course.calcValues',
```

- [ ] **Step 3: Export the course types** from `src/shared/signalk/index.ts` so the course entity and the course-client can import them from the barrel. Add to the `./types` re-export block:

```ts
export type { ActiveRoute, CourseCalculations, CourseInfo, CoursePoint } from './types';
```

- [ ] **Step 4: Type-check.**

Run: `npm run check`
Expected: clean.

- [ ] **Step 5: Commit.**

```bash
git add src/shared/signalk/types.ts src/shared/signalk/paths.ts src/shared/signalk/index.ts
git commit -m "feat(routing): course wire types and SK_PATHS entries"
```

## Task 10: course-client (activate, advance, clear, hydrate)

**Files:**
- Create: `src/features/routing/course-client.ts`
- Modify: `src/features/routing/index.ts`
- Test: `src/features/routing/course-client.test.ts`

- [ ] **Step 1: Write the failing test.** `src/features/routing/course-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateRoute, advancePoint, clearCourse } from './course-client';

afterEach(() => vi.restoreAllMocks());
const ok = { ok: true, json: async () => ({}) } as Response;
const COURSE = '/signalk/v2/api/vessels/self/navigation/course';

it('activateRoute PUTs the href, pointIndex, and reverse', async () => {
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok);
  expect(await activateRoute('http://pi', 'tok', '/resources/routes/abc', 0, false)).toBe(true);
  expect(f.mock.calls[0][0]).toBe(`http://pi${COURSE}/activeRoute`);
  const init = f.mock.calls[0][1] as RequestInit;
  expect(init.method).toBe('PUT');
  expect(JSON.parse(init.body as string)).toEqual({ href: '/resources/routes/abc', pointIndex: 0, reverse: false });
});

it('advancePoint PUTs a signed increment', async () => {
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok);
  await advancePoint('http://pi', 'tok', 1);
  expect(f.mock.calls[0][0]).toBe(`http://pi${COURSE}/activeRoute/nextPoint`);
  expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ value: 1 });
});

it('clearCourse DELETEs the course', async () => {
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok);
  await clearCourse('http://pi', 'tok');
  expect(f.mock.calls[0][0]).toBe(`http://pi${COURSE}`);
  expect((f.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
});
```

- [ ] **Step 2: Run it, expect FAIL.**

Run: `npx vitest run src/features/routing/course-client.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** `src/features/routing/course-client.ts`:

```ts
import { authInit } from '$shared/signalk';
import type { CourseCalculations, CourseInfo } from '$shared/signalk';

const COURSE = '/signalk/v2/api/vessels/self/navigation/course';

async function put(url: string, token: string | undefined, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, authInit(token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return res.ok;
  } catch {
    return false;
  }
}

export function activateRoute(base: string, token: string | undefined, href: string, pointIndex = 0, reverse = false): Promise<boolean> {
  return put(`${base}${COURSE}/activeRoute`, token, { href, pointIndex, reverse });
}

export function advancePoint(base: string, token: string | undefined, value: number): Promise<boolean> {
  return put(`${base}${COURSE}/activeRoute/nextPoint`, token, { value });
}

export async function clearCourse(base: string, token: string | undefined): Promise<boolean> {
  try {
    const res = await fetch(`${base}${COURSE}`, authInit(token, { method: 'DELETE' }));
    return res.ok;
  } catch {
    return false;
  }
}

// One-time hydration: v2 course paths are not in the v1 full model, so the stream sends nothing
// until the next change. Read the current snapshot once when a course becomes active.
export async function hydrateCourse(base: string, token: string | undefined): Promise<{ info?: CourseInfo; calc?: CourseCalculations }> {
  const read = async <T>(path: string): Promise<T | undefined> => {
    try {
      const res = await fetch(`${base}${COURSE}${path}`, authInit(token));
      return res.ok ? ((await res.json()) as T) : undefined;
    } catch {
      return undefined;
    }
  };
  const [info, calc] = await Promise.all([read<CourseInfo>(''), read<CourseCalculations>('/calcValues')]);
  return { info, calc };
}
```

- [ ] **Step 4: Export.** Add to `src/features/routing/index.ts`:

```ts
export { activateRoute, advancePoint, clearCourse, hydrateCourse } from './course-client';
```

- [ ] **Step 5: Run the test, expect PASS.**

Run: `npx vitest run src/features/routing/course-client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/features/routing/course-client.ts src/features/routing/course-client.test.ts src/features/routing/index.ts
git commit -m "feat(routing): course-client activate, advance, clear, and hydrate"
```

## Task 11: entities/course source-agnostic guidance

Reads the course cells from the store, exposes a single guidance view, and computes the derived values client-side when calcValues is absent or null. Constructed with `store` and `vessel`, pre-creating its cells like `OwnVessel`.

**Files:**
- Create: `src/entities/course/course.svelte.ts`
- Create: `src/entities/course/index.ts`
- Test: `src/entities/course/course.svelte.test.ts`

- [ ] **Step 1: Read `src/entities/vessel/vessel.svelte.ts`** to copy the cell-precreation and getter pattern, and `src/shared/signalk/store.svelte.ts` for `cell(path).value`.

- [ ] **Step 2: Write the failing test.** `src/entities/course/course.svelte.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { OwnVessel } from '$entities/vessel';
import { SignalKStore } from '$shared/signalk';
import { CourseGuidance } from './course.svelte';

function storeWith(self: Record<string, unknown>): SignalKStore {
  const store = new SignalKStore();
  store.applyFrame({ self, ais: new Map(), connection: { phase: 'open', attempt: 0 }, epoch: 1 });
  return store;
}

it('reports no active leg when there is no nextPoint', () => {
  const store = storeWith({ 'navigation.position': { latitude: 0, longitude: 0 } });
  const g = new CourseGuidance(store, new OwnVessel(store));
  expect(g.active).toBe(false);
});

it('uses provider calcValues when present and flags the source server', () => {
  const store = storeWith({
    'navigation.position': { latitude: 0, longitude: 0 },
    'navigation.course.nextPoint': { position: { latitude: 0, longitude: 1 }, name: 'B' },
    'navigation.course.calcValues': { crossTrackError: 12, distance: 1852, bearingTrue: 1.57, velocityMadeGood: 3 },
  });
  const g = new CourseGuidance(store, new OwnVessel(store));
  expect(g.active).toBe(true);
  expect(g.source).toBe('server');
  expect(g.crossTrackErrorMeters).toBe(12);
  expect(g.distanceToNextMeters).toBe(1852);
});

it('computes the derived values when calcValues is absent and flags the source computed', () => {
  const store = storeWith({
    'navigation.position': { latitude: 0, longitude: 0 },
    'navigation.speedOverGround': 3,
    'navigation.courseOverGroundTrue': 1.5,
    'navigation.course.nextPoint': { position: { latitude: 0, longitude: 1 } },
    'navigation.course.previousPoint': { position: { latitude: 0, longitude: 0 } },
  });
  const g = new CourseGuidance(store, new OwnVessel(store));
  expect(g.active).toBe(true);
  expect(g.source).toBe('computed');
  expect(g.distanceToNextMeters).toBeGreaterThan(0);
  expect(typeof g.bearingToNextRad).toBe('number');
});
```

- [ ] **Step 3: Run it, expect FAIL.**

Run: `npx vitest run src/entities/course/course.svelte.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement.** `src/entities/course/course.svelte.ts`:

```ts
import type { OwnVessel } from '$entities/vessel';
import { rhumbBearingRad, rhumbDistanceMeters, crossTrackErrorMeters, etaSeconds, vmgMps } from '$shared/nav';
import type { CourseCalculations, CourseInfo, LatLon, SignalKStore } from '$shared/signalk';
import { SK_PATHS } from '$shared/signalk';

export type CourseSource = 'server' | 'computed';

export class CourseGuidance {
  #store: SignalKStore;
  #vessel: OwnVessel;

  constructor(store: SignalKStore, vessel: OwnVessel) {
    this.#store = store;
    this.#vessel = vessel;
    // Pre-create the cells so first access inside a reactive context is tracked.
    store.cell(SK_PATHS.courseNextPoint);
    store.cell(SK_PATHS.coursePreviousPoint);
    store.cell(SK_PATHS.courseCalcValues);
    store.cell(SK_PATHS.courseArrivalCircle);
  }

  #info = $derived.by<CourseInfo>(() => ({
    nextPoint: this.#store.cell(SK_PATHS.courseNextPoint).value as CourseInfo['nextPoint'],
    previousPoint: this.#store.cell(SK_PATHS.coursePreviousPoint).value as CourseInfo['previousPoint'],
    arrivalCircle: this.#store.cell(SK_PATHS.courseArrivalCircle).value as number | undefined,
  }));

  #calc = $derived(this.#store.cell(SK_PATHS.courseCalcValues).value as CourseCalculations | undefined);

  get active(): boolean {
    return !!this.#info.nextPoint?.position;
  }

  get source(): CourseSource {
    return this.#calc && this.#calc.crossTrackError != null ? 'server' : 'computed';
  }

  get nextPointName(): string | undefined {
    return this.#info.nextPoint?.name;
  }

  get #next(): LatLon | undefined {
    return this.#info.nextPoint?.position;
  }
  get #prev(): LatLon | undefined {
    return this.#info.previousPoint?.position ?? this.#vessel.position;
  }

  get distanceToNextMeters(): number | undefined {
    if (this.#calc?.distance != null) return this.#calc.distance;
    const pos = this.#vessel.position;
    return pos && this.#next ? rhumbDistanceMeters(pos, this.#next) : undefined;
  }

  get bearingToNextRad(): number | undefined {
    if (this.#calc?.bearingTrue != null) return this.#calc.bearingTrue;
    const pos = this.#vessel.position;
    return pos && this.#next ? rhumbBearingRad(pos, this.#next) : undefined;
  }

  get crossTrackErrorMeters(): number | undefined {
    if (this.#calc?.crossTrackError != null) return this.#calc.crossTrackError;
    const pos = this.#vessel.position;
    return pos && this.#prev && this.#next ? crossTrackErrorMeters(this.#prev, this.#next, pos) : undefined;
  }

  get velocityMadeGoodMps(): number | undefined {
    if (this.#calc?.velocityMadeGood != null) return this.#calc.velocityMadeGood;
    const pos = this.#vessel.position;
    const sog = this.#vessel.sogMps;
    const cog = this.#vessel.cogRad;
    return pos && this.#next && sog != null && cog != null ? vmgMps(pos, this.#next, sog, cog) : undefined;
  }

  get timeToGoSeconds(): number | undefined {
    if (this.#calc?.timeToGo != null) return this.#calc.timeToGo;
    const d = this.distanceToNextMeters;
    const sog = this.#vessel.sogMps;
    return d != null && sog != null ? etaSeconds(d, sog) : undefined;
  }

  get arrived(): boolean {
    const d = this.distanceToNextMeters;
    const circle = this.#info.arrivalCircle ?? 100;
    return d != null && d <= circle;
  }
}
```

Confirm `OwnVessel` exposes `position`, `sogMps`, and `cogRad` (it does, per `src/entities/vessel/vessel.svelte.ts`). Confirm `SignalKStore.applyFrame` accepts the test's `self` keys (read `store.svelte.ts`); adjust the test's frame shape to the real `SKFrame` type if needed.

- [ ] **Step 5: Public API.** `src/entities/course/index.ts`:

```ts
export { CourseGuidance, type CourseSource } from './course.svelte';
```

- [ ] **Step 6: Run the test, expect PASS.**

Run: `npx vitest run src/entities/course/course.svelte.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/entities/course/
git commit -m "feat(routing): source-agnostic course guidance with client-side fallback"
```

The course wire types were already exported from `src/shared/signalk/index.ts` in Task 9, Step 3.

## Task 12: arrival alarm

Mirror `src/features/lookout/lookout-alarm.ts` and reuse `src/shared/audio/alarm.ts` with a distinct tone.

**Files:**
- Create: `src/features/navigation/arrival-alarm.ts`
- Test: `src/features/navigation/arrival-alarm.test.ts`

- [ ] **Step 1: Write the failing test.** `src/features/navigation/arrival-alarm.test.ts` (mirror `lookout-alarm.test.ts` with a FakeAlarm):

```ts
import { describe, expect, it } from 'vitest';
import type { AlarmControl, AlarmTone } from '$shared/audio';
import { ArrivalAlarm } from './arrival-alarm';

class FakeAlarm implements AlarmControl {
  events: string[] = [];
  prime() { this.events.push('prime'); }
  start(_t: AlarmTone) { this.events.push('start'); }
  stop() { this.events.push('stop'); }
}

it('sounds once on arrival and not again until reset, and is silent when not arrived or muted', () => {
  const fake = new FakeAlarm();
  const alarm = new ArrivalAlarm(fake);
  alarm.update(true, false);
  expect(fake.events).toEqual(['start']);
  alarm.update(true, false); // still arrived: do not restart
  expect(fake.events).toEqual(['start']);
  alarm.update(false, false); // left the circle: reset and stop
  expect(fake.events.at(-1)).toBe('stop');
  alarm.update(true, true); // arrived but muted
  expect(fake.events.filter((e) => e === 'start')).toHaveLength(1);
});
```

- [ ] **Step 2: Run it, expect FAIL.**

Run: `npx vitest run src/features/navigation/arrival-alarm.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** `src/features/navigation/arrival-alarm.ts`:

```ts
import { Alarm, type AlarmControl, type AlarmTone } from '$shared/audio';

// A single short rising couplet, distinct from the urgent collision two-beep, so arrival is not
// confused with danger. Lower, sparser, and quieter.
export const ARRIVAL_TONE: AlarmTone = { frequency: 520, beepMs: 180, gapMs: 120, beeps: 2, periodMs: 2500, volume: 0.14 };

export class ArrivalAlarm {
  #alarm: AlarmControl;
  #sounding = false;

  constructor(alarm: AlarmControl = new Alarm()) {
    this.#alarm = alarm;
  }

  prime(): void {
    this.#alarm.prime();
  }

  // arrived: inside the active waypoint's arrival circle. muted: the user silenced arrival.
  update(arrived: boolean, muted: boolean): void {
    if (arrived && !muted && !this.#sounding) {
      this.#sounding = true;
      this.#alarm.start(ARRIVAL_TONE);
      return;
    }
    if (!arrived || muted) {
      if (this.#sounding) this.#alarm.stop();
      this.#sounding = false;
    }
  }

  stop(): void {
    this.#alarm.stop();
    this.#sounding = false;
  }
}
```

- [ ] **Step 4: Run the test, expect PASS.**

Run: `npx vitest run src/features/navigation/arrival-alarm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/features/navigation/arrival-alarm.ts src/features/navigation/arrival-alarm.test.ts
git commit -m "feat(routing): arrival alarm"
```

## Task 13: NavStrip and following wiring

**Files:**
- Create: `src/features/navigation/NavStrip.svelte`
- Create: `src/features/navigation/index.ts`
- Modify: `src/app/App.svelte`

- [ ] **Step 1: Build `NavStrip.svelte`.** Props: `guidance: CourseGuidance`, `onStop()`. When `guidance.active`, render a themed strip showing the next waypoint name, DTW (`formatNm(guidance.distanceToNextMeters ?? 0)`), BTW (`radiansToBearing` then rounded), XTE (absolute `formatNm` with a steer-left or steer-right arrow from the sign), VMG (`formatKnots(guidance.velocityMadeGoodMps)`), time to go (`formatTcpaMin(guidance.timeToGoSeconds ?? 0)` reused, or minutes), and a "computing locally" badge when `guidance.source === 'computed'`, plus a Stop button. Use the formatters from `$shared/lib`. Hide entirely when not active. Mirror the DangerStrip themed CSS (`src/features/lookout/DangerStrip.svelte`).

- [ ] **Step 2: Public API.** `src/features/navigation/index.ts`:

```ts
export { ARRIVAL_TONE, ArrivalAlarm } from './arrival-alarm';
export { default as NavStrip } from './NavStrip.svelte';
```

- [ ] **Step 3: Wire `App.svelte`.**
  - Construct `const courseGuidance = new CourseGuidance(store, vessel)` and `const arrivalAlarm = new ArrivalAlarm()`.
  - Add an `arrivalMuted = new PersistedValue<boolean>('binnacle:arrival-muted', false)` and a menu toggle for it (mirror the alarm-mute item).
  - Add the course paths to the subscription list in `connectStream` (mirror the existing self-path lines): one `{ path: SK_PATHS.courseNextPoint, policy: 'instant', minPeriod: 1000 }` per course path.
  - On activation (the panel's `onActivate(id)`): call `activateRoute(serverOrigin(), chartsToken, '/resources/routes/' + id, 0, false)`, then `routeStore.setActive(id)`, then `hydrateCourse(...)` and seed the store cells so the strip shows values immediately (or rely on the next delta; hydration is the explicit step the spec calls for). On the panel's `onStop`: `clearCourse(...)` then `routeStore.setActive(undefined)`.
  - Add an `$effect` that calls `arrivalAlarm.update(courseGuidance.arrived && !!routeStore.activeId, arrivalMuted.value)` and, on a rising arrival edge, requests the next point with `advancePoint(serverOrigin(), chartsToken, 1)`. Treat the streamed `activeRoute.pointIndex` as authoritative (do not advance the local index yourself).
  - Extend the first-gesture `primeAudio` handler to also call `arrivalAlarm.prime()`.
  - Mount `<NavStrip guidance={courseGuidance} onStop={...} />` in the shell near the Lookout danger strip.

- [ ] **Step 4: Run the full gate**, one command at a time (test, check, lint, cruise, build). Fix any issue.

- [ ] **Step 5: Commit.**

```bash
git add src/features/navigation/ src/app/App.svelte
git commit -m "feat(routing): nav strip, arrival alarm wiring, and route activation"
```

## Task 14: Live verification against a real Signal K server

This is not a unit test; it proves the wire shapes the spec flagged in section 11.

- [ ] **Step 1: Build and serve.** `npm run build`, ensure the webapp is linked into `~/.signalk`, and open it over `https://boatpi:3443/binnacle/` (the project's HTTPS dev target).

- [ ] **Step 2: Plan and save a route.** Draw a 3-point route, save it, reload, and confirm it reads back (proves the route resource POST/PUT body and the V2-then-V1 read against the real server).

- [ ] **Step 3: Activate and follow.** Activate the route. In the browser devtools network tab, confirm the `PUT .../activeRoute` body, then watch the WebSocket frames for `navigation.course.*` and `navigation.course.calcValues.*` deltas. Confirm: (a) the hydration GET returns the initial state, (b) the nav strip shows DTW, BTW, XTE, VMG, and ETA, and (c) the `source` badge reads server when the course-provider plugin is installed.

- [ ] **Step 4: Test the fallback.** Disable the course-provider plugin in the Signal K admin (or test against a server without it), reactivate, and confirm the strip still shows computed values with the "computing locally" badge.

- [ ] **Step 5: Arrival.** Confirm the arrival alarm sounds at the arrival circle and the active point advances (note whether the server auto-advances or the client PUT drove it; record the answer in the spec's section 11).

- [ ] **Step 6: Record findings.** If any wire shape differs from the spec (resource body, course paths, advance behavior), fix the code and update section 11 of the spec, then re-run the gate and commit.

## Task 15: Docs and the CLAUDE.md course-streaming refinement

**Files:**
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`
- Modify: `README.md` (Status and What's New)

- [ ] **Step 1: CLAUDE.md.** Replace the note "The v1 stream does not carry v2 data (course, autopilot); read those over v2 REST in later specs." with the verified rule: live `navigation.course.*` values stream over the v1 WebSocket as deltas, but because they carry the `SKVersion.v2` flag they are not in the v1 full model, so a one-time v2 REST GET hydrates the initial snapshot and the stream keeps it live; course mutations (activate, advance, clear) remain v2 REST PUT and DELETE.

- [ ] **Step 2: CHANGELOG.** Add Unreleased entries under Added (route planning and following) and any Fixed, matching the existing prose-bullet style.

- [ ] **Step 3: README.** Add a routing bullet to Status and refresh the What's New section.

- [ ] **Step 4: Run the full gate, commit, and push.**

```bash
git add CLAUDE.md CHANGELOG.md README.md
git commit -m "docs: routing in the changelog, readme, and the course-streaming rule"
```

---

## Self-review notes (run before execution)

- Spec coverage: Task 1 covers the coordinate-conversion module (spec 3, 4); Task 2 the geodesy (spec 6); Tasks 3 and 4 entities/route (spec 3); Task 5 routes-client (spec 4.1, 5); Task 6 route-layer (spec 3, 5); Task 7 Terra Draw and route-edit (spec 3, 10); Task 8 the planner and wiring (spec 3, 5); Task 9 wire types and SK_PATHS (spec 4.3, 4.5); Task 10 course-client (spec 4.2); Task 11 entities/course (spec 2, 3, 5, 7); Task 12 the arrival alarm (spec 5); Task 13 the nav strip and activation (spec 5); Task 14 the live verification (spec 11); Task 15 the CLAUDE.md refinement and docs (spec 12).
- The logic tasks (1 through 7, 9 through 12) carry final, runnable test and implementation code. The UI and wiring tasks (8, 13) are written as detailed specs that mirror an existing component (TracksPanel, DangerStrip) rather than reproducing full Svelte templates and themed CSS, because the codebase has near-identical components to copy and the plan calls out exactly which file to follow and which props, callbacks, and formatters to use.
- Type names are consistent across tasks: `Waypoint`, `Route`, `RouteLeg`, `RouteResourceBody`, `RouteStore`, `RouteOverlay`, `RouteEditor`, `CourseGuidance`, `CourseInfo`, `CourseCalculations`, `ActiveRoute`, `ArrivalAlarm`, and `ARRIVAL_TONE`.
- Verify against the installed package types at Task 7 (Terra Draw) and against the real server at Task 14; both are flagged in-task.
