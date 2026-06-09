import { describe, expect, it } from 'vitest';
import { rhumbDistanceMeters } from '$shared/nav';
import {
  featureToRoute,
  remainingRouteDistanceMeters,
  routeDistanceMeters,
  routeToFeature,
} from './route-geojson';
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

describe('remainingRouteDistanceMeters', () => {
  it('sums the legs from the given index onward', () => {
    // The three-waypoint route is two legs; from index 0 that is the whole route.
    expect(remainingRouteDistanceMeters(ROUTE.waypoints, 0)).toBeCloseTo(
      routeDistanceMeters(ROUTE.waypoints),
      3,
    );
    // From the last leg's start, only the final leg remains.
    expect(remainingRouteDistanceMeters(ROUTE.waypoints, 1)).toBeCloseTo(
      rhumbDistanceMeters(ROUTE.waypoints[1].position, ROUTE.waypoints[2].position),
      3,
    );
    // From the last waypoint, nothing remains.
    expect(remainingRouteDistanceMeters(ROUTE.waypoints, 2)).toBe(0);
  });
});

describe('routeToFeature', () => {
  it('emits a LineString with [lon, lat] coordinates and the SI distance', () => {
    const f = routeToFeature(ROUTE);
    expect(f.feature.geometry.type).toBe('LineString');
    expect(f.feature.geometry.coordinates[0]).toEqual([0, 0]);
    expect(f.feature.geometry.coordinates[1]).toEqual([1, 0]);
    expect(f.name).toBe('Test');
    expect(f.distance).toBeGreaterThan(0);
  });

  it('omits coordinatesMeta for a fully unnamed route and names every entry otherwise', () => {
    const unnamed: Route = {
      id: 'u',
      name: 'U',
      waypoints: [
        { position: { latitude: 0, longitude: 0 } },
        { position: { latitude: 0, longitude: 1 } },
      ],
    };
    // The server rejects an empty {} coordinatesMeta entry, so a fully unnamed route omits it.
    expect(routeToFeature(unnamed).feature.properties.coordinatesMeta).toBeUndefined();
    // ROUTE has A and B named and a third unnamed: the unnamed gap is filled with its 1-based index
    // so every entry carries a name, which the schema requires.
    expect(routeToFeature(ROUTE).feature.properties.coordinatesMeta).toEqual([
      { name: 'A' },
      { name: 'B' },
      { name: '3' },
    ]);
  });
});

describe('featureToRoute', () => {
  it('parses a server route Feature back to waypoints, deriving name from coordinatesMeta', () => {
    const body = {
      name: 'Server route',
      feature: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 0],
          ],
        },
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
    expect(
      featureToRoute('id', { feature: { geometry: { type: 'Point', coordinates: [0, 0] } } }),
    ).toBeUndefined();
    expect(
      featureToRoute('id', {
        feature: { geometry: { type: 'LineString', coordinates: [[0, 0]] } },
      }),
    ).toBeUndefined();
  });
});

describe('routeDistanceMeters', () => {
  it('sums the rhumb distance of every consecutive pair', () => {
    const total = routeDistanceMeters(ROUTE.waypoints);
    const leg0 = rhumbDistanceMeters(ROUTE.waypoints[0].position, ROUTE.waypoints[1].position);
    const leg1 = rhumbDistanceMeters(ROUTE.waypoints[1].position, ROUTE.waypoints[2].position);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeCloseTo(leg0 + leg1, 3);
  });
});
