import {
  type CircleLayerSpecification,
  type GeoJSONSource,
  type GeoJSONSourceSpecification,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
  Popup,
  type SymbolLayerSpecification,
} from 'maplibre-gl';
import { mapThemePaint, type OverlayContext, type OverlayModule } from '$shared/map';
import { navaidClassify, navaidIconId, registerNavaidIcons } from './navaid-symbols';
import { registerPoiIcons } from './note-icons';
import { type Bbox, fetchNotes, type NotePoint } from './notes-client';
import { categoryLabel, type PoiCategory, poiIconId } from './poi-categories';

const SOURCE_ID = 'binnacle-notes';
const LAYER_ID = 'binnacle-notes-symbol';
const CLUSTER_LAYER = 'binnacle-notes-cluster';
const CLUSTER_COUNT_LAYER = 'binnacle-notes-cluster-count';
const SELECT_SOURCE = 'binnacle-notes-selected';
const SELECT_LAYER = 'binnacle-notes-selected';
// Below this zoom the viewport spans too much to usefully fetch or show every POI.
const MIN_ZOOM = 9;
// Past this zoom each point unclusters and shows its own icon.
const CLUSTER_MAX_ZOOM = 13;
const CLUSTER_RADIUS = 48;

interface NotesOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

// The registered map-image id for a note. Navaids resolve to a type- and side-specific
// symbol inferred from the name; every other category uses its disc.
function iconFor(note: NotePoint): string {
  if (note.category === 'navaid') return navaidIconId(navaidClassify(note.name));
  return poiIconId(note.category);
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
        icon: iconFor(note),
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

// A note's url comes from a resource provider we do not control, so only follow
// http(s) links. This rejects javascript: and data: schemes that would otherwise
// execute when the link is clicked.
export function safeHttpUrl(raw: string): string | undefined {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {
    // Not a parseable absolute URL; drop it.
  }
  return undefined;
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
  const url = safeHttpUrl(String(props.url ?? ''));
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
  let onClusterClick: ((event: MapLayerMouseEvent) => void) | undefined;
  let onEnter: (() => void) | undefined;
  let onLeave: (() => void) | undefined;

  function setData(ctx: OverlayContext, data: GeoJSON.FeatureCollection): void {
    const source = ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(data);
  }

  // Highlight the selected marker by drawing a ring at its position; clearing it sets the
  // selection source back to empty.
  function setSelected(ctx: OverlayContext, feature: MapGeoJSONFeature | undefined): void {
    const source = ctx.map.getSource(SELECT_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;
    if (feature?.geometry.type !== 'Point') {
      source.setData(EMPTY);
      return;
    }
    source.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: feature.geometry, properties: {} }],
    });
  }

  return {
    id: 'notes',
    title: 'Points of interest',
    band: 'routes',
    supportsOpacity: true,
    async add(ctx) {
      const paint = mapThemePaint('day');
      const before = ctx.beforeIdFor('routes');

      const source: GeoJSONSourceSpecification = {
        type: 'geojson',
        data: EMPTY,
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: CLUSTER_RADIUS,
      };
      ctx.map.addSource(SOURCE_ID, source);
      ctx.map.addSource(SELECT_SOURCE, { type: 'geojson', data: EMPTY });

      // Selection ring sits below the markers so the icon draws on top of it.
      const selectLayer: CircleLayerSpecification = {
        id: SELECT_LAYER,
        type: 'circle',
        source: SELECT_SOURCE,
        minzoom: MIN_ZOOM,
        paint: {
          'circle-radius': 15,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': paint.select,
          'circle-stroke-width': 3,
        },
      };
      ctx.map.addLayer(selectLayer, before);

      // Clustered points: a themed disc whose radius steps up with the contained count.
      const clusterLayer: CircleLayerSpecification = {
        id: CLUSTER_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        minzoom: MIN_ZOOM,
        paint: {
          'circle-color': paint.note,
          'circle-opacity': 0.85,
          'circle-stroke-color': paint.background,
          'circle-stroke-width': 1.5,
          'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
        },
      };
      ctx.map.addLayer(clusterLayer, before);

      const clusterCount: SymbolLayerSpecification = {
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        minzoom: MIN_ZOOM,
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: {
          'text-color': paint.markerGlyph,
        },
      };
      ctx.map.addLayer(clusterCount, before);

      // Unclustered points: the per-category icon, with its name once zoomed in.
      const layer: SymbolLayerSpecification = {
        id: LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 0.9],
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
          'text-color': paint.note,
          'text-halo-color': paint.background,
          'text-halo-width': 1.2,
        },
        minzoom: MIN_ZOOM,
      };
      ctx.map.addLayer(layer, before);

      onClick = (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        popup?.remove();
        popup = new Popup({ closeButton: true, offset: 14, className: 'poi-popup-wrap' })
          .setLngLat(event.lngLat)
          .setDOMContent(popupContent(feature.properties ?? {}))
          .addTo(ctx.map);
        popup.on('close', () => setSelected(ctx, undefined));
        setSelected(ctx, feature);
      };
      onClusterClick = (event) => {
        const feature = event.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        if (typeof clusterId !== 'number' || feature?.geometry.type !== 'Point') return;
        const source = ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        if (!source) return;
        const center = feature.geometry.coordinates as [number, number];
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          ctx.map.easeTo({ center, zoom });
        });
      };
      onEnter = () => {
        ctx.map.getCanvas().style.cursor = 'pointer';
      };
      onLeave = () => {
        ctx.map.getCanvas().style.cursor = '';
      };
      ctx.map.on('click', LAYER_ID, onClick);
      ctx.map.on('click', CLUSTER_LAYER, onClusterClick);
      ctx.map.on('mouseenter', LAYER_ID, onEnter);
      ctx.map.on('mouseenter', CLUSTER_LAYER, onEnter);
      ctx.map.on('mouseleave', LAYER_ID, onLeave);
      ctx.map.on('mouseleave', CLUSTER_LAYER, onLeave);
      // Load the category and navaid icons after the layers exist; resilient, so a failure
      // here leaves the markers as text labels rather than breaking overlay setup.
      await registerPoiIcons(ctx.map, paint);
      await registerNavaidIcons(ctx.map, paint);
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
      void registerNavaidIcons(ctx.map, paint);
      ctx.map.setPaintProperty(LAYER_ID, 'text-color', paint.note);
      ctx.map.setPaintProperty(LAYER_ID, 'text-halo-color', paint.background);
      ctx.map.setPaintProperty(CLUSTER_LAYER, 'circle-color', paint.note);
      ctx.map.setPaintProperty(CLUSTER_LAYER, 'circle-stroke-color', paint.background);
      ctx.map.setPaintProperty(CLUSTER_COUNT_LAYER, 'text-color', paint.markerGlyph);
      ctx.map.setPaintProperty(SELECT_LAYER, 'circle-stroke-color', paint.select);
    },
    setVisible(ctx, visible) {
      const value = visible ? 'visible' : 'none';
      for (const id of [LAYER_ID, CLUSTER_LAYER, CLUSTER_COUNT_LAYER, SELECT_LAYER]) {
        ctx.map.setLayoutProperty(id, 'visibility', value);
      }
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LAYER_ID, 'icon-opacity', opacity);
      ctx.map.setPaintProperty(LAYER_ID, 'text-opacity', opacity);
      ctx.map.setPaintProperty(CLUSTER_LAYER, 'circle-opacity', opacity * 0.85);
      ctx.map.setPaintProperty(CLUSTER_LAYER, 'circle-stroke-opacity', opacity);
      ctx.map.setPaintProperty(CLUSTER_COUNT_LAYER, 'text-opacity', opacity);
      ctx.map.setPaintProperty(SELECT_LAYER, 'circle-stroke-opacity', opacity);
    },
    remove(ctx) {
      popup?.remove();
      popup = undefined;
      if (onClick) ctx.map.off('click', LAYER_ID, onClick);
      if (onClusterClick) ctx.map.off('click', CLUSTER_LAYER, onClusterClick);
      if (onEnter) {
        ctx.map.off('mouseenter', LAYER_ID, onEnter);
        ctx.map.off('mouseenter', CLUSTER_LAYER, onEnter);
      }
      if (onLeave) {
        ctx.map.off('mouseleave', LAYER_ID, onLeave);
        ctx.map.off('mouseleave', CLUSTER_LAYER, onLeave);
      }
      for (const id of [LAYER_ID, CLUSTER_COUNT_LAYER, CLUSTER_LAYER, SELECT_LAYER]) {
        if (ctx.map.getLayer(id)) ctx.map.removeLayer(id);
      }
      for (const id of [SOURCE_ID, SELECT_SOURCE]) {
        if (ctx.map.getSource(id)) ctx.map.removeSource(id);
      }
    },
  };
}
