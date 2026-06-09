import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import {
  DARK_SCRIM,
  emptyFeatureCollection,
  type MapThemePaint,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
  rgbaCss,
} from '$shared/map';
import { str } from '$shared/signalk';
import { navaidClassify, navaidIconId, registerNavaidIcons } from './navaid-symbols';
import { registerPoiIcons } from './note-icons';
import { NotesCache, padBbox } from './notes-cache';
import { type Bbox, fetchNotes, type NotePoint, type NoteSelection } from './notes-client';
import { categoryRank, POI_CATEGORIES, type PoiCategory, poiIconId } from './poi-categories';

const SOURCE_ID = 'binnacle-notes';
const LAYER_ID = 'binnacle-notes-symbol';
// A cluster is a group ring, the most important member's colored icon, and a count badge.
const CLUSTER_RING_LAYER = 'binnacle-notes-cluster-ring';
const CLUSTER_ICON_LAYER = 'binnacle-notes-cluster-icon';
const CLUSTER_COUNT_LAYER = 'binnacle-notes-cluster-count';
const SELECT_SOURCE = 'binnacle-notes-selected';
const SELECT_LAYER = 'binnacle-notes-selected';
const SELECT_CASING_LAYER = 'binnacle-notes-selected-casing';
// A fixed dark casing under the amber selection ring, so it holds on light day water; invisible on the
// dark themes where the ring carries on its own. The shared DARK_SCRIM, as the route line uses.
const SELECT_CASING_COLOR = rgbaCss(DARK_SCRIM);
// The note layers, bottom to top, in one place for layerIds, setVisible, and remove.
const LAYERS = [
  SELECT_CASING_LAYER,
  SELECT_LAYER,
  CLUSTER_RING_LAYER,
  CLUSTER_ICON_LAYER,
  CLUSTER_COUNT_LAYER,
  LAYER_ID,
];
// The cluster layers that respond to a click (expand) and a hover (pointer cursor).
const CLUSTER_HIT_LAYERS = [CLUSTER_ICON_LAYER, CLUSTER_RING_LAYER];
// Below this zoom the viewport spans too much to usefully fetch or show every POI.
const MIN_ZOOM = 9;
// Past this zoom each point unclusters and shows its own icon. Clusters live at z9 to z11 so the
// wide view does not mash, and individual POIs appear from z12.
const CLUSTER_MAX_ZOOM = 11;
const CLUSTER_RADIUS = 44;

// The first of the given values that coerces to a non-empty string, or undefined if none do. Used
// to pick a marker's attribution (credit, then source) and its url from the feature properties.
function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    const s = String(value ?? '');
    if (s) return s;
  }
  return undefined;
}

// The cluster icon: the colored disc of the cluster's highest-ranked member, matched on the
// aggregated maxRank, so a cluster holding a hazard shows the red hazard disc, a navaid the amber
// disc, otherwise the POI disc. Distinct ranks make the match labels unique; generic is the default.
const CLUSTER_ICON_IMAGE = [
  'match',
  ['get', 'maxRank'],
  ...POI_CATEGORIES.filter((category) => category !== 'generic').flatMap((category) => [
    categoryRank(category),
    poiIconId(category),
  ]),
  poiIconId('generic'),
] as unknown as ExpressionSpecification;

interface NotesOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
  deselect(ctx: OverlayContext): void;
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
        id: note.id,
        name: note.name,
        category: note.category,
        rank: categoryRank(note.category),
        icon: iconFor(note),
        url: note.url ?? '',
        source: note.source ?? '',
        attribution: note.attribution ?? '',
      },
    })),
  };
}

const EMPTY: GeoJSON.FeatureCollection = emptyFeatureCollection();

export function createNotesOverlay(
  serverBase: string,
  token: string | undefined,
  onSelect?: (selection: NoteSelection | undefined) => void,
): NotesOverlay {
  // A viewport-keyed cache of fetched note sets so panning back, panning a little, or zooming in
  // reuses a recent fetch instead of re-hitting the network (the data depends only on the bbox, not
  // the zoom). The raw zoom/center drive a cheap idle fast-path that skips the work when the map has
  // not moved at all, and a single fetch runs at a time.
  const cache = new NotesCache();
  // The exact note array last handed to setData, so a redundant render is skipped and, crucially, a
  // failed fetch keeps it on screen instead of blanking the markers.
  let renderedNotes: NotePoint[] | undefined;
  let lastZoom: number | undefined;
  let lastLng: number | undefined;
  let lastLat: number | undefined;
  let fetching = false;
  // Whether the layer is shown. A hidden Points-of-interest layer skips its sync entirely (no network
  // fetch, no re-clustering) and defers the icon re-raster on a theme change until it is shown again.
  // Starts true to match the layer-manager default; the register-time setVisible corrects it.
  let visible = true;
  // The paint to re-raster the icons with, set when the theme changes while hidden so the 18 POI and
  // navaid SVGs are refreshed lazily on the next show rather than re-rasterized while invisible.
  let pendingIconPaint: MapThemePaint | undefined;
  let onClick: ((event: MapLayerMouseEvent) => void) | undefined;
  let onClusterClick: ((event: MapLayerMouseEvent) => void) | undefined;
  let onEnter: (() => void) | undefined;
  let onLeave: (() => void) | undefined;

  function setData(ctx: OverlayContext, data: GeoJSON.FeatureCollection): void {
    const source = ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(data);
  }

  // Render a note set, skipping the work when it is the same set already shown. Leaving the source
  // untouched on a no-op avoids re-clustering the markers every idle frame.
  function render(ctx: OverlayContext, notes: NotePoint[]): void {
    if (notes === renderedNotes) return;
    renderedNotes = notes;
    setData(ctx, featureCollection(notes));
  }

  // Clear the shown markers (below the zoom floor) without discarding the cache, so zooming back in
  // re-renders instantly from a recent fetch.
  function clearRendered(ctx: OverlayContext): void {
    if (renderedNotes === undefined) return;
    renderedNotes = undefined;
    setData(ctx, EMPTY);
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
    layerIds: LAYERS,
    async add(ctx) {
      const paint = mapThemePaint('day');
      const before = ctx.beforeIdFor('routes');

      const source: GeoJSONSourceSpecification = {
        type: 'geojson',
        data: EMPTY,
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: CLUSTER_RADIUS,
        // Carry the highest member rank up to the cluster so it can show that member's icon.
        clusterProperties: { maxRank: ['max', ['get', 'rank']] },
      };
      ctx.map.addSource(SOURCE_ID, source);
      ctx.map.addSource(SELECT_SOURCE, { type: 'geojson', data: EMPTY });

      // Selection ring sits below the markers so the icon draws on top of it; a dark casing ring below
      // it (a wider stroke at the same radius) gives the amber ring contrast on light day water.
      const selectCasing: CircleLayerSpecification = {
        id: SELECT_CASING_LAYER,
        type: 'circle',
        source: SELECT_SOURCE,
        minzoom: MIN_ZOOM,
        paint: {
          'circle-radius': 15,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': SELECT_CASING_COLOR,
          'circle-stroke-width': 5,
        },
      };
      ctx.map.addLayer(selectCasing, before);
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

      // The group ring behind the cluster icon, so a cluster never reads as a single POI; its
      // radius steps up with the contained count.
      const clusterRing: CircleLayerSpecification = {
        id: CLUSTER_RING_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        minzoom: MIN_ZOOM,
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 28],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': paint.markerGlyph,
          'circle-stroke-width': 2.5,
          'circle-stroke-opacity': 0.9,
        },
      };
      ctx.map.addLayer(clusterRing, before);

      const clusterIcon: SymbolLayerSpecification = {
        id: CLUSTER_ICON_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        minzoom: MIN_ZOOM,
        layout: {
          'icon-image': CLUSTER_ICON_IMAGE,
          'icon-size': 0.85,
          'icon-allow-overlap': true,
        },
      };
      ctx.map.addLayer(clusterIcon, before);

      // The count badge at the upper-right corner, haloed so it reads over the icon and the ring.
      const clusterCount: SymbolLayerSpecification = {
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        minzoom: MIN_ZOOM,
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [1.2, -1.2],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': paint.markerGlyph,
          'text-halo-color': paint.note,
          'text-halo-width': 2.4,
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
        const props = feature.properties ?? {};
        const id = String(props.id ?? '');
        // A note with no id cannot be fetched for detail, so do not select it.
        if (!id) return;
        setSelected(ctx, feature);
        onSelect?.({
          id,
          name: String(props.name ?? 'Point of interest'),
          category: String(props.category) as PoiCategory,
          attribution: firstNonEmpty(props.attribution, props.source),
          url: str(props.url),
        });
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
      ctx.map.on('mouseenter', LAYER_ID, onEnter);
      ctx.map.on('mouseleave', LAYER_ID, onLeave);
      // Click only the ring (it covers the cluster and then some), so a click does not fire once per
      // stacked cluster layer; hover the ring and the icon so either shows the pointer cursor.
      ctx.map.on('click', CLUSTER_RING_LAYER, onClusterClick);
      for (const id of CLUSTER_HIT_LAYERS) {
        ctx.map.on('mouseenter', id, onEnter);
        ctx.map.on('mouseleave', id, onLeave);
      }
      // Load the category and navaid icons after the layers exist; resilient, so a failure
      // here leaves the markers as text labels rather than breaking overlay setup.
      await registerPoiIcons(ctx.map, paint);
      await registerNavaidIcons(ctx.map, paint);
    },
    sync(ctx) {
      // A hidden layer pays nothing: no network fetch, no clustering, no GeoJSON rebuild. The next
      // show re-syncs from the cache (or fetches) for wherever the map ended up.
      if (!visible) return;
      const zoom = ctx.map.getZoom();
      const center = ctx.map.getCenter();
      // Idle fast-path: nothing moved since the last sync, so skip the viewport work entirely.
      if (zoom === lastZoom && center.lng === lastLng && center.lat === lastLat) return;
      lastZoom = zoom;
      lastLng = center.lng;
      lastLat = center.lat;
      if (zoom < MIN_ZOOM) {
        clearRendered(ctx);
        return;
      }
      const b = ctx.map.getBounds();
      const viewport: Bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      // A recent fetch whose padded area still covers the viewport serves the markers with no
      // network. This runs before the in-flight guard, so a cache hit renders even mid-fetch.
      const cached = cache.get(viewport, Date.now());
      if (cached) {
        render(ctx, cached);
        return;
      }
      if (fetching) return;
      fetching = true;
      // Fetch a padded area so the next small pan or zoom-in reuses this fetch from the cache.
      const fetchBbox = padBbox(viewport);
      fetchNotes(serverBase, token, fetchBbox)
        .then((notes) => {
          // undefined is a transient failure: keep the markers already shown. An empty array is a
          // real "no POIs here" answer, so it does clear them.
          if (!notes) return;
          cache.put(fetchBbox, notes, Date.now());
          render(ctx, notes);
        })
        .finally(() => {
          fetching = false;
        });
    },
    deselect(ctx) {
      setSelected(ctx, undefined);
    },
    applyTheme(ctx, paint) {
      // The cheap per-layer color updates always run so the layer is correct the instant it shows.
      // The expensive icon re-raster (18 SVGs) is deferred while hidden and done on the next show.
      if (visible) {
        void registerPoiIcons(ctx.map, paint);
        void registerNavaidIcons(ctx.map, paint);
      } else {
        pendingIconPaint = paint;
      }
      ctx.map.setPaintProperty(LAYER_ID, 'text-color', paint.note);
      ctx.map.setPaintProperty(LAYER_ID, 'text-halo-color', paint.background);
      ctx.map.setPaintProperty(CLUSTER_RING_LAYER, 'circle-stroke-color', paint.markerGlyph);
      ctx.map.setPaintProperty(CLUSTER_COUNT_LAYER, 'text-color', paint.markerGlyph);
      ctx.map.setPaintProperty(CLUSTER_COUNT_LAYER, 'text-halo-color', paint.note);
      ctx.map.setPaintProperty(SELECT_LAYER, 'circle-stroke-color', paint.select);
    },
    setVisible(ctx, isVisible) {
      visible = isVisible;
      const value = isVisible ? 'visible' : 'none';
      for (const id of LAYERS) {
        ctx.map.setLayoutProperty(id, 'visibility', value);
      }
      // If the theme changed while hidden, refresh the icons now that the layer is shown again.
      if (isVisible && pendingIconPaint) {
        const paint = pendingIconPaint;
        pendingIconPaint = undefined;
        void registerPoiIcons(ctx.map, paint);
        void registerNavaidIcons(ctx.map, paint);
      }
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LAYER_ID, 'icon-opacity', opacity);
      ctx.map.setPaintProperty(LAYER_ID, 'text-opacity', opacity);
      ctx.map.setPaintProperty(CLUSTER_ICON_LAYER, 'icon-opacity', opacity);
      ctx.map.setPaintProperty(CLUSTER_RING_LAYER, 'circle-stroke-opacity', opacity * 0.9);
      ctx.map.setPaintProperty(CLUSTER_COUNT_LAYER, 'text-opacity', opacity);
      ctx.map.setPaintProperty(SELECT_CASING_LAYER, 'circle-stroke-opacity', opacity);
      ctx.map.setPaintProperty(SELECT_LAYER, 'circle-stroke-opacity', opacity);
    },
    remove(ctx) {
      if (onClick) ctx.map.off('click', LAYER_ID, onClick);
      if (onEnter) ctx.map.off('mouseenter', LAYER_ID, onEnter);
      if (onLeave) ctx.map.off('mouseleave', LAYER_ID, onLeave);
      if (onClusterClick) ctx.map.off('click', CLUSTER_RING_LAYER, onClusterClick);
      for (const id of CLUSTER_HIT_LAYERS) {
        if (onEnter) ctx.map.off('mouseenter', id, onEnter);
        if (onLeave) ctx.map.off('mouseleave', id, onLeave);
      }
      for (const id of LAYERS) {
        if (ctx.map.getLayer(id)) ctx.map.removeLayer(id);
      }
      for (const id of [SOURCE_ID, SELECT_SOURCE]) {
        if (ctx.map.getSource(id)) ctx.map.removeSource(id);
      }
    },
  };
}
