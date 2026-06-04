import { describe, expect, it } from 'vitest';
import { drawFeatureToWaypoints, routeToStoreFeature } from './route-edit';

describe('route-edit converters', () => {
  it('routeToStoreFeature emits a linestring Feature in [lon, lat] with mode linestring', () => {
    const f = routeToStoreFeature({
      id: 'r',
      name: 'R',
      waypoints: [
        { position: { latitude: 0, longitude: 0 } },
        { position: { latitude: 0, longitude: 1 } },
      ],
    });
    expect(f.properties?.mode).toBe('linestring');
    expect((f.geometry as GeoJSON.LineString).coordinates[1]).toEqual([1, 0]);
  });

  it('drawFeatureToWaypoints reads a linestring Feature back to waypoints', () => {
    const wps = drawFeatureToWaypoints({
      type: 'Feature',
      properties: { mode: 'linestring' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [2, 1],
        ],
      },
    });
    expect(wps).toEqual([
      { position: { latitude: 0, longitude: 0 } },
      { position: { latitude: 1, longitude: 2 } },
    ]);
  });
});
