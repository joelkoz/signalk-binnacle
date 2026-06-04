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
