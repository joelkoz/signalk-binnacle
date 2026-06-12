import type {
  GeoJSONSource,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
} from 'maplibre-gl';
import { isLatLon } from '$shared/geo';
import { HOUR_MS } from '$shared/lib';
import {
  emptyFeatureCollection,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
} from '$shared/map';
import {
  fetchHistoryValuesAcrossProviders,
  type HistoryProviders,
  SK_PATHS,
} from '$shared/signalk';

const SOURCE_ID = 'binnacle-track-history';
const LAYER_ID = 'binnacle-track-history-line';
const BAND = 'track';
// Dashed and faded so the server-recorded past stays visually behind the live track line.
const LINE_WIDTH = 2;
const LINE_OPACITY = 0.6;
const DASH: number[] = [2, 2];
const WINDOW_SECONDS = 24 * 60 * 60;
const RESOLUTION_SECONDS = 60;
const REFRESH_MS = HOUR_MS / 4;
// A break longer than this between positions starts a new line segment, so a day at the dock
// followed by a sail does not draw a straight line across the gap.
const GAP_SECONDS = 15 * 60;

interface Deps {
  fetchValues: typeof fetchHistoryValuesAcrossProviders;
  now: () => number;
}

export interface HistoryTrackOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// The vessel's last 24 hours from the server's v2 History API, drawn as a dashed line under the
// live track. Registration is unconditional; every fetch is gated on a provider being known, so
// a stock server pays one empty source and nothing else. Hidden by default in the layer panel:
// showing it is the opt-in that starts the queries.
export function createHistoryTrackOverlay(
  origin: string,
  token: string | undefined,
  providers: () => HistoryProviders | undefined,
  deps: Deps = { fetchValues: fetchHistoryValuesAcrossProviders, now: Date.now },
): HistoryTrackOverlay {
  let paint = mapThemePaint('day');
  let visible = true;
  let fetching = false;
  let nextFetchAt = 0;

  function setData(ctx: OverlayContext, data: GeoJSON.FeatureCollection): void {
    (ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData(data);
  }

  function toFeature(
    rows: ReadonlyArray<readonly [string, ...unknown[]]>,
  ): GeoJSON.FeatureCollection {
    const lines: Array<Array<[number, number]>> = [];
    let line: Array<[number, number]> = [];
    let lastSeconds: number | undefined;
    for (const row of rows) {
      const position = row[1];
      if (!isLatLon(position)) continue;
      const seconds = Date.parse(row[0]) / 1000;
      if (lastSeconds !== undefined && seconds - lastSeconds > GAP_SECONDS) {
        if (line.length > 1) lines.push(line);
        line = [];
      }
      line.push([position.longitude, position.latitude]);
      lastSeconds = seconds;
    }
    if (line.length > 1) lines.push(line);
    return {
      type: 'FeatureCollection',
      features: lines.map((coordinates) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {},
      })),
    };
  }

  async function refresh(ctx: OverlayContext): Promise<void> {
    const known = providers();
    if (!known || known.ids.length === 0 || fetching) return;
    fetching = true;
    try {
      const got = await deps.fetchValues(origin, token, known, {
        paths: [SK_PATHS.position],
        durationSeconds: WINDOW_SECONDS,
        resolutionSeconds: RESOLUTION_SECONDS,
      });
      if (got) setData(ctx, toFeature(got.values.rows));
      // A failed query retries on the same cadence; the drawn line stays until then.
      nextFetchAt = deps.now() + REFRESH_MS;
    } finally {
      fetching = false;
    }
  }

  return {
    id: 'track-history',
    title: 'Track history (24 h)',
    band: BAND,
    supportsOpacity: true,
    defaultVisible: false,
    layerIds: [LAYER_ID],
    add(ctx) {
      nextFetchAt = 0;
      if (!ctx.map.getSource(SOURCE_ID)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        ctx.map.addSource(SOURCE_ID, source);
      }
      if (!ctx.map.getLayer(LAYER_ID)) {
        const layer: LineLayerSpecification = {
          id: LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': paint.trackSolid,
            'line-width': LINE_WIDTH,
            'line-opacity': LINE_OPACITY,
            'line-dasharray': DASH,
          },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor(BAND));
      }
    },
    sync(ctx) {
      if (!visible) return;
      const now = deps.now();
      if (now < nextFetchAt) return;
      nextFetchAt = now + REFRESH_MS;
      void refresh(ctx);
    },
    setVisible(ctx, next) {
      visible = next;
      if (ctx.map.getLayer(LAYER_ID)) {
        ctx.map.setLayoutProperty(LAYER_ID, 'visibility', next ? 'visible' : 'none');
      }
      // First show fetches immediately rather than waiting out the refresh window.
      if (next) nextFetchAt = 0;
    },
    setOpacity(ctx, opacity) {
      if (ctx.map.getLayer(LAYER_ID)) {
        ctx.map.setPaintProperty(LAYER_ID, 'line-opacity', LINE_OPACITY * opacity);
      }
    },
    applyTheme(ctx, next) {
      paint = next;
      if (ctx.map.getLayer(LAYER_ID)) {
        ctx.map.setPaintProperty(LAYER_ID, 'line-color', paint.trackSolid);
      }
    },
    remove(ctx) {
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
  };
}
