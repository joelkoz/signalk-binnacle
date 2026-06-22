import type { CircleLayerSpecification, GeoJSONSourceSpecification } from 'maplibre-gl';
import {
  emptyFeatureCollection,
  featureCollection,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
  removeLayersAndSources,
  setLayersVisibility,
  setSourceData,
} from '$shared/map';
import type { TimeTravelStore } from './time-travel-store.svelte';

const SOURCE_ID = 'binnacle-time-travel-marker';
const LAYER_ID = 'binnacle-time-travel-marker-circle';
const BAND = 'vessel';
const MARKER_RADIUS = 7;
const MARKER_STROKE_WIDTH = 3;

export interface TimeTravelOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

export function createTimeTravelOverlay(store: TimeTravelStore): TimeTravelOverlay {
  let paint = mapThemePaint('day');
  let lastLon: number | undefined;
  let lastLat: number | undefined;
  let lastActive = false;

  function markerData(): GeoJSON.FeatureCollection {
    const s = store.active ? store.markerSample : undefined;
    if (!s || s.lon === undefined || s.lat === undefined) return emptyFeatureCollection();
    return featureCollection([
      { type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: {} },
    ]);
  }

  return {
    id: 'time-travel-marker',
    title: 'Time travel',
    band: BAND,
    supportsOpacity: false,
    defaultVisible: true,
    layerIds: [LAYER_ID],
    add(ctx) {
      // Reset the dirty-check so a base-style swap that recreates the source empty repopulates on
      // the next sync rather than staying blank.
      lastActive = false;
      lastLon = undefined;
      lastLat = undefined;
      if (!ctx.map.getSource(SOURCE_ID)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        ctx.map.addSource(SOURCE_ID, source);
      }
      if (!ctx.map.getLayer(LAYER_ID)) {
        const layer: CircleLayerSpecification = {
          id: LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-radius': MARKER_RADIUS,
            'circle-color': 'rgba(0, 0, 0, 0)',
            'circle-stroke-color': paint.scrubMarker,
            'circle-stroke-width': MARKER_STROKE_WIDTH,
          },
        };
        ctx.map.addLayer(layer, ctx.beforeIdFor(BAND));
      }
    },
    sync(ctx) {
      const s = store.active ? store.markerSample : undefined;
      const lon = s?.lon;
      const lat = s?.lat;
      if (store.active === lastActive && lon === lastLon && lat === lastLat) return;
      lastActive = store.active;
      lastLon = lon;
      lastLat = lat;
      setSourceData(ctx.map, SOURCE_ID, markerData());
    },
    setVisible(ctx, visible) {
      setLayersVisibility(ctx.map, [LAYER_ID], visible);
    },
    applyTheme(ctx, next) {
      paint = next;
      if (ctx.map.getLayer(LAYER_ID)) {
        ctx.map.setPaintProperty(LAYER_ID, 'circle-stroke-color', paint.scrubMarker);
      }
    },
    remove(ctx) {
      removeLayersAndSources(ctx.map, [LAYER_ID], [SOURCE_ID]);
    },
  };
}
