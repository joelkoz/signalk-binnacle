import type {
  ExpressionSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  LineLayerSpecification,
} from 'maplibre-gl';
import type { TrackRecorder } from '$entities/track';
import {
  type MapThemePaint,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
} from '$shared/map';
import type { PersistedValue, TrackSettings } from '$shared/settings';
import { douglasPeucker } from './simplify';
import { trackSegments } from './track-geojson';

const ACTIVE_SOURCE = 'binnacle-track-active';
const ACTIVE_LAYER = 'binnacle-track-active-line';
const SAVED_SOURCE = 'binnacle-track-saved';
const SAVED_LAYER = 'binnacle-track-saved-line';
const BAND = 'track';
// Display simplification tolerance in degrees (about 9 m), so straight legs collapse and a
// long voyage stays light; the raw points stay in storage and in any saved track.
const SIMPLIFY_TOLERANCE = 0.00008;
// SOG color stops in m/s: 0 (slow), 2.5 (about 5 kn), 5 (about 10 kn, fast).
const SOG_MID = 2.5;
const SOG_FAST = 5;

// A FeatureCollection of saved-track segments plus a version that bumps when it changes, so
// the overlay can pull and dirty-check it without rebuilding every frame.
export interface SavedTracksSource {
  features: () => GeoJSON.FeatureCollection;
  version: () => number;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const NO_SAVED: SavedTracksSource = { features: () => EMPTY, version: () => 0 };

interface TrackOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function lineColor(
  paint: MapThemePaint,
  mode: TrackSettings['colorMode'],
): string | ExpressionSpecification {
  if (mode === 'solid') return paint.trackSolid;
  return [
    'interpolate',
    ['linear'],
    ['get', 'sog'],
    0,
    paint.trackSlow,
    SOG_MID,
    paint.trackMid,
    SOG_FAST,
    paint.trackFast,
  ];
}

export function createTrackOverlay(
  recorder: TrackRecorder,
  settings: PersistedValue<TrackSettings>,
  saved: SavedTracksSource = NO_SAVED,
): TrackOverlay {
  let paint = mapThemePaint('day');
  let lastLen = -1;
  let lastT: number | undefined;
  let lastMode: TrackSettings['colorMode'] | undefined;
  let lastSavedVersion = -1;

  function setActiveData(ctx: OverlayContext): void {
    const simplified = douglasPeucker(recorder.points, SIMPLIFY_TOLERANCE);
    const source = ctx.map.getSource(ACTIVE_SOURCE) as GeoJSONSource | undefined;
    source?.setData(trackSegments(simplified));
  }

  return {
    id: 'track',
    title: 'Track',
    band: BAND,
    supportsOpacity: true,
    add(ctx) {
      const before = ctx.beforeIdFor(BAND);
      const activeSrc: GeoJSONSourceSpecification = { type: 'geojson', data: EMPTY };
      ctx.map.addSource(ACTIVE_SOURCE, activeSrc);
      ctx.map.addSource(SAVED_SOURCE, { type: 'geojson', data: EMPTY });
      const savedLayer: LineLayerSpecification = {
        id: SAVED_LAYER,
        type: 'line',
        source: SAVED_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': paint.trackSolid, 'line-width': 2 },
      };
      ctx.map.addLayer(savedLayer, before);
      const activeLayer: LineLayerSpecification = {
        id: ACTIVE_LAYER,
        type: 'line',
        source: ACTIVE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': lineColor(paint, settings.value.colorMode), 'line-width': 3 },
      };
      ctx.map.addLayer(activeLayer, before);
    },
    sync(ctx) {
      const mode = settings.value.colorMode;
      const points = recorder.points;
      const tail = points[points.length - 1]?.t;
      if (points.length !== lastLen || tail !== lastT) {
        lastLen = points.length;
        lastT = tail;
        setActiveData(ctx);
      }
      if (mode !== lastMode) {
        lastMode = mode;
        ctx.map.setPaintProperty(ACTIVE_LAYER, 'line-color', lineColor(paint, mode));
      }
      const savedVersion = saved.version();
      if (savedVersion !== lastSavedVersion) {
        lastSavedVersion = savedVersion;
        (ctx.map.getSource(SAVED_SOURCE) as GeoJSONSource | undefined)?.setData(saved.features());
      }
    },
    applyTheme(ctx, next) {
      paint = next;
      ctx.map.setPaintProperty(
        ACTIVE_LAYER,
        'line-color',
        lineColor(paint, settings.value.colorMode),
      );
      ctx.map.setPaintProperty(SAVED_LAYER, 'line-color', paint.trackSolid);
    },
    setVisible(ctx, visible) {
      const value = visible ? 'visible' : 'none';
      ctx.map.setLayoutProperty(ACTIVE_LAYER, 'visibility', value);
      ctx.map.setLayoutProperty(SAVED_LAYER, 'visibility', value);
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(ACTIVE_LAYER, 'line-opacity', opacity);
      ctx.map.setPaintProperty(SAVED_LAYER, 'line-opacity', opacity);
    },
    remove(ctx) {
      for (const id of [ACTIVE_LAYER, SAVED_LAYER]) {
        if (ctx.map.getLayer(id)) ctx.map.removeLayer(id);
      }
      for (const id of [ACTIVE_SOURCE, SAVED_SOURCE]) {
        if (ctx.map.getSource(id)) ctx.map.removeSource(id);
      }
    },
  };
}
