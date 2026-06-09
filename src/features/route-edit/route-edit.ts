import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  type GeoJSONStoreFeatures,
  type SetCursor,
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Route, Waypoint } from '$entities/route';
import { chartCursorFor, mapThemePaint } from '$shared/map';
import { isLonLat, latLonToLonLat, lonLatToLatLon } from '$shared/signalk';
import type { Theme } from '$shared/ui';

// Terra Draw tags every feature with its mode in properties.mode; the on-chart route is a
// single linestring drawn or edited in that mode.
const LINESTRING_MODE = 'linestring';

// The on-chart editing line uses the theme's bright selection accent so it reads vividly against
// blue water and the chart instead of blending in. It reads the one source (the map-theme select,
// which the --select CSS token mirrors) rather than a second copy, so the two can never drift. The
// cast is safe because every theme's select is a hex color.
function drawColor(theme: Theme): `#${string}` {
  return mapThemePaint(theme).select as `#${string}`;
}

export function drawFeatureToWaypoints(feature: GeoJSON.Feature): Waypoint[] {
  const geom = feature.geometry;
  if (geom.type !== 'LineString') return [];
  return geom.coordinates.filter(isLonLat).map((c) => ({ position: lonLatToLatLon(c) }));
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
  const color = drawColor(opts.theme);
  // Terra Draw's Cursor type is a fixed keyword set, so a draw mode can only ask for keywords like
  // "crosshair" (drawing) or "move" (dragging a waypoint in select mode), not a custom image, and some
  // desktop themes draw those white on light water. Map each keyword that has a high-contrast shape to
  // it; every other cursor (for example the already-readable "pointer"), and the "unset" that clears it
  // back to the pan hand, passes through unchanged.
  const adapter = new (class extends TerraDrawMapLibreGLAdapter<MapLibreMap> {
    setCursor(cursor: Parameters<SetCursor>[0]): void {
      const themed = chartCursorFor(cursor);
      if (themed) {
        opts.map.getCanvas().style.cursor = themed;
        return;
      }
      super.setCursor(cursor);
    }
  })({
    map: opts.map,
    prefixId: 'binnacle-route-draw',
    renderBelowLayerId: opts.beforeId,
  });
  const draw = new TerraDraw({
    adapter,
    modes: [
      new TerraDrawPointMode({ styles: { pointColor: color, pointWidth: 6 } }),
      new TerraDrawLineStringMode({
        styles: { lineStringColor: color, lineStringWidth: 4 },
      }),
      new TerraDrawSelectMode({
        styles: {
          selectionPointColor: color,
          midPointColor: color,
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
      const color = drawColor(theme);
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
