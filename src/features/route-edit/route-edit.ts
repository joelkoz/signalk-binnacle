import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  type GeoJSONStoreFeatures,
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Route, Waypoint } from '$entities/route';
import { latLonToLonLat, lonLatToLatLon } from '$shared/signalk';

// Terra Draw tags every feature with its mode in properties.mode; the on-chart route is a
// single linestring drawn or edited in that mode.
const LINESTRING_MODE = 'linestring';

export function routeToDrawFeature(route: Route): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { mode: LINESTRING_MODE },
    geometry: {
      type: 'LineString',
      coordinates: route.waypoints.map((w) => latLonToLonLat(w.position)),
    },
  };
}

export function drawFeatureToWaypoints(feature: GeoJSON.Feature): Waypoint[] {
  const geom = feature.geometry;
  if (geom.type !== 'LineString') return [];
  return geom.coordinates
    .filter(
      (c): c is [number, number] =>
        Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number',
    )
    .map((c) => ({ position: lonLatToLatLon([c[0], c[1]]) }));
}

// addFeatures wants the narrower store feature shape (LineString geometry, non-null
// Record<string, JSON> properties), so build that directly rather than casting the pure feature.
function routeToStoreFeature(route: Route): GeoJSONStoreFeatures<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: { mode: LINESTRING_MODE },
    geometry: {
      type: 'LineString',
      coordinates: route.waypoints.map((w) => latLonToLonLat(w.position)),
    },
  };
}

export interface RouteEditor {
  start(route?: Route): void;
  setMode(mode: 'point' | 'linestring' | 'select'): void;
  read(): Waypoint[];
  stop(): void;
}

export function createRouteEditor(opts: {
  map: MapLibreMap;
  beforeId?: string;
  onChange: (waypoints: Waypoint[]) => void;
}): RouteEditor {
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({
      map: opts.map,
      prefixId: 'binnacle-route-draw',
      renderBelowLayerId: opts.beforeId,
    }),
    modes: [
      new TerraDrawPointMode(),
      new TerraDrawLineStringMode(),
      new TerraDrawSelectMode({
        flags: {
          linestring: {
            feature: {
              draggable: true,
              coordinates: { midpoints: true, draggable: true, deletable: true },
            },
          },
        },
      }),
    ],
  });

  const read = (): Waypoint[] => {
    const line = draw.getSnapshot().find((f) => f.properties.mode === LINESTRING_MODE);
    return line ? drawFeatureToWaypoints(line) : [];
  };

  draw.on('change', () => opts.onChange(read()));

  return {
    start(route) {
      draw.start();
      if (route && route.waypoints.length > 0) {
        draw.addFeatures([routeToStoreFeature(route)]);
        draw.setMode('select');
      } else {
        draw.setMode(LINESTRING_MODE);
      }
    },
    setMode(mode) {
      draw.setMode(mode);
    },
    read,
    stop() {
      draw.stop();
    },
  };
}
