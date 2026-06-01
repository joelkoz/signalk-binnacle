import type {
  CircleLayerSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import { mapThemePaint, type OverlayContext, type OverlayModule } from '$shared/map';
import { type Bbox, fetchNotes, type NotePoint } from './notes-client';

const SOURCE_ID = 'binnacle-notes';
const DOT_LAYER_ID = 'binnacle-notes-dot';
const LABEL_LAYER_ID = 'binnacle-notes-label';
// Below this zoom the viewport spans too much to usefully fetch or show every POI.
const MIN_ZOOM = 9;

interface NotesOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function featureCollection(notes: readonly NotePoint[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: notes.map((note) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [note.position.longitude, note.position.latitude],
      },
      properties: { name: note.name },
    })),
  };
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function createNotesOverlay(serverBase: string, token: string | undefined): NotesOverlay {
  // Refetch only when the viewport key changes (coarse so a small pan does not refetch),
  // and never while a fetch is in flight.
  let lastKey: string | undefined;
  let fetching = false;

  function setData(ctx: OverlayContext, data: GeoJSON.FeatureCollection): void {
    const source = ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(data);
  }

  return {
    id: 'notes',
    title: 'Points of interest',
    band: 'routes',
    supportsOpacity: true,
    add(ctx) {
      const source: GeoJSONSourceSpecification = { type: 'geojson', data: EMPTY };
      ctx.map.addSource(SOURCE_ID, source);
      const paint = mapThemePaint('day');
      const dot: CircleLayerSpecification = {
        id: DOT_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 4,
          'circle-color': paint.note,
          'circle-stroke-width': 1,
          'circle-stroke-color': paint.background,
        },
      };
      ctx.map.addLayer(dot, ctx.beforeIdFor('routes'));
      const label: SymbolLayerSpecification = {
        id: LABEL_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 0.8],
          'text-anchor': 'top',
          'text-optional': true,
          'text-max-width': 9,
        },
        paint: {
          'text-color': paint.note,
          'text-halo-color': paint.background,
          'text-halo-width': 1.2,
        },
      };
      ctx.map.addLayer(label, ctx.beforeIdFor('routes'));
    },
    sync(ctx) {
      if (fetching) return;
      const zoom = ctx.map.getZoom();
      if (zoom < MIN_ZOOM) {
        if (lastKey !== 'lowzoom') {
          lastKey = 'lowzoom';
          setData(ctx, EMPTY);
        }
        return;
      }
      const center = ctx.map.getCenter();
      const key = `${zoom.toFixed(0)}|${center.lng.toFixed(2)}|${center.lat.toFixed(2)}`;
      if (key === lastKey) return;
      lastKey = key;
      const b = ctx.map.getBounds();
      const bbox: Bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      fetching = true;
      fetchNotes(serverBase, token, bbox)
        .then((notes) => setData(ctx, featureCollection(notes)))
        .finally(() => {
          fetching = false;
        });
    },
    applyTheme(ctx, paint) {
      ctx.map.setPaintProperty(DOT_LAYER_ID, 'circle-color', paint.note);
      ctx.map.setPaintProperty(DOT_LAYER_ID, 'circle-stroke-color', paint.background);
      ctx.map.setPaintProperty(LABEL_LAYER_ID, 'text-color', paint.note);
      ctx.map.setPaintProperty(LABEL_LAYER_ID, 'text-halo-color', paint.background);
    },
    setVisible(ctx, visible) {
      const v = visible ? 'visible' : 'none';
      ctx.map.setLayoutProperty(DOT_LAYER_ID, 'visibility', v);
      ctx.map.setLayoutProperty(LABEL_LAYER_ID, 'visibility', v);
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(DOT_LAYER_ID, 'circle-opacity', opacity);
      ctx.map.setPaintProperty(DOT_LAYER_ID, 'circle-stroke-opacity', opacity);
      ctx.map.setPaintProperty(LABEL_LAYER_ID, 'text-opacity', opacity);
    },
    remove(ctx) {
      for (const id of [DOT_LAYER_ID, LABEL_LAYER_ID]) {
        if (ctx.map.getLayer(id)) ctx.map.removeLayer(id);
      }
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
  };
}
