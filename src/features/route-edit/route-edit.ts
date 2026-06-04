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
import type { Theme } from '$shared/ui';

// Terra Draw tags every feature with its mode in properties.mode; the on-chart route is a
// single linestring drawn or edited in that mode.
const LINESTRING_MODE = 'linestring';

// The on-chart editing line uses the theme's bright selection accent so it reads vividly against
// blue water and the chart instead of blending in: a warm amber in day and dusk, and a light red
// at night that stays within the night-red band. Mirrors the --select token in app.css.
const DRAW_COLOR: Record<Theme, `#${string}`> = {
  day: '#ffb300',
  dusk: '#ffc24d',
  'night-red': '#ffb39a',
};

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

// The single waypoints-to-LineString mapper, in the narrower store-feature shape (non-null
// Record<string, JSON> properties) that Terra Draw's addFeatures wants.
export function routeToStoreFeature(route: Route): GeoJSONStoreFeatures<GeoJSON.LineString> {
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
  setTheme(theme: Theme): void;
  stop(): void;
}

export function createRouteEditor(opts: {
  map: MapLibreMap;
  beforeId?: string;
  theme: Theme;
  onChange: (waypoints: Waypoint[]) => void;
}): RouteEditor {
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({
      map: opts.map,
      prefixId: 'binnacle-route-draw',
      renderBelowLayerId: opts.beforeId,
    }),
    modes: [
      new TerraDrawPointMode({ styles: { pointColor: DRAW_COLOR[opts.theme], pointWidth: 6 } }),
      new TerraDrawLineStringMode({
        styles: { lineStringColor: DRAW_COLOR[opts.theme], lineStringWidth: 4 },
      }),
      new TerraDrawSelectMode({
        styles: {
          selectionPointColor: DRAW_COLOR[opts.theme],
          midPointColor: DRAW_COLOR[opts.theme],
        },
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
    setTheme(theme) {
      const color = DRAW_COLOR[theme];
      draw.updateModeOptions('point', { styles: { pointColor: color, pointWidth: 6 } });
      draw.updateModeOptions('linestring', {
        styles: { lineStringColor: color, lineStringWidth: 4 },
      });
      draw.updateModeOptions('select', {
        styles: { selectionPointColor: color, midPointColor: color },
      });
    },
    stop() {
      draw.stop();
    },
  };
}
