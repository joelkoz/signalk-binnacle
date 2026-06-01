import {
  type GeoJSONSource,
  type GeoJSONSourceSpecification,
  type MapLayerMouseEvent,
  Popup,
  type SymbolLayerSpecification,
} from 'maplibre-gl';
import { mapThemePaint, type OverlayContext, type OverlayModule } from '$shared/map';
import { registerPoiIcons } from './note-icons';
import { type Bbox, fetchNotes, type NotePoint } from './notes-client';
import { categoryLabel, type PoiCategory } from './poi-categories';

const SOURCE_ID = 'binnacle-notes';
const LAYER_ID = 'binnacle-notes-symbol';
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
      properties: {
        name: note.name,
        category: note.category,
        url: note.url ?? '',
        description: note.description ?? '',
        source: note.source ?? '',
        attribution: note.attribution ?? '',
      },
    })),
  };
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function plainText(html: string): string {
  // Descriptions can carry HTML; show it as text rather than injecting markup.
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function popupContent(props: Record<string, unknown>): HTMLElement {
  const root = document.createElement('div');
  root.className = 'poi-popup';
  const name = document.createElement('div');
  name.className = 'poi-popup-name';
  name.textContent = String(props.name ?? 'Point of interest');
  root.appendChild(name);
  const cat = document.createElement('div');
  cat.className = 'poi-popup-category';
  cat.textContent = categoryLabel(String(props.category) as PoiCategory);
  root.appendChild(cat);
  const description = plainText(String(props.description ?? ''));
  if (description) {
    const body = document.createElement('p');
    body.className = 'poi-popup-body';
    body.textContent = description;
    root.appendChild(body);
  }
  const url = String(props.url ?? '');
  if (url) {
    const link = document.createElement('a');
    link.className = 'poi-popup-link';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View details';
    root.appendChild(link);
  }
  const credit = String(props.attribution || props.source || '');
  if (credit) {
    const small = document.createElement('div');
    small.className = 'poi-popup-credit';
    small.textContent = credit;
    root.appendChild(small);
  }
  return root;
}

export function createNotesOverlay(serverBase: string, token: string | undefined): NotesOverlay {
  // Refetch only when the viewport key changes (coarse so a small pan does not refetch),
  // and never while a fetch is in flight.
  let lastKey: string | undefined;
  let fetching = false;
  let popup: Popup | undefined;
  let onClick: ((event: MapLayerMouseEvent) => void) | undefined;
  let onEnter: (() => void) | undefined;
  let onLeave: (() => void) | undefined;

  function setData(ctx: OverlayContext, data: GeoJSON.FeatureCollection): void {
    const source = ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(data);
  }

  return {
    id: 'notes',
    title: 'Points of interest',
    band: 'routes',
    supportsOpacity: true,
    async add(ctx) {
      const source: GeoJSONSourceSpecification = { type: 'geojson', data: EMPTY };
      ctx.map.addSource(SOURCE_ID, source);
      const layer: SymbolLayerSpecification = {
        id: LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        layout: {
          'icon-image': ['concat', 'binnacle-poi-', ['get', 'category']],
          'icon-size': 0.8,
          'icon-allow-overlap': true,
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-optional': true,
          'text-max-width': 9,
          'text-padding': 6,
        },
        paint: {
          'text-color': mapThemePaint('day').note,
          'text-halo-color': mapThemePaint('day').background,
          'text-halo-width': 1.2,
        },
        minzoom: MIN_ZOOM,
      };
      ctx.map.addLayer(layer, ctx.beforeIdFor('routes'));

      onClick = (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        popup?.remove();
        popup = new Popup({ closeButton: true, offset: 14, className: 'poi-popup-wrap' })
          .setLngLat(event.lngLat)
          .setDOMContent(popupContent(feature.properties ?? {}))
          .addTo(ctx.map);
      };
      onEnter = () => {
        ctx.map.getCanvas().style.cursor = 'pointer';
      };
      onLeave = () => {
        ctx.map.getCanvas().style.cursor = '';
      };
      ctx.map.on('click', LAYER_ID, onClick);
      ctx.map.on('mouseenter', LAYER_ID, onEnter);
      ctx.map.on('mouseleave', LAYER_ID, onLeave);
      // Load the category icons after the layer exists; resilient, so a failure here
      // leaves the markers as text labels rather than breaking overlay setup.
      await registerPoiIcons(ctx.map, mapThemePaint('day'));
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
      void registerPoiIcons(ctx.map, paint);
      ctx.map.setPaintProperty(LAYER_ID, 'text-color', paint.note);
      ctx.map.setPaintProperty(LAYER_ID, 'text-halo-color', paint.background);
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LAYER_ID, 'icon-opacity', opacity);
      ctx.map.setPaintProperty(LAYER_ID, 'text-opacity', opacity);
    },
    remove(ctx) {
      popup?.remove();
      popup = undefined;
      if (onClick) ctx.map.off('click', LAYER_ID, onClick);
      if (onEnter) ctx.map.off('mouseenter', LAYER_ID, onEnter);
      if (onLeave) ctx.map.off('mouseleave', LAYER_ID, onLeave);
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
  };
}
