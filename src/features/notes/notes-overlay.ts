import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { SymbolIconEntry, SymbolsStore } from '$entities/symbols';
import { bboxContains, lngLatBoundsToBbox4 } from '$shared/geo';
import { DAY_MS } from '$shared/lib';
import {
  DARK_SCRIM,
  emptyFeatureCollection,
  featureCollection,
  type MapThemePaint,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
  removeLayersAndSources,
  rgbaCss,
  setLayersVisibility,
} from '$shared/map';
import { type SkSymbol, str } from '$shared/signalk';
import { createExpiringStore, type ExpiringStore } from '$shared/storage';
import { navaidClassify, navaidIconId, registerNavaidIcons } from './navaid-symbols';
import { registerPoiIcons } from './note-icons';
import { bboxKey, NotesCache, padBbox } from './notes-cache';
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
// After a failed fetch, back off this long before retrying so a stationary map recovers from a
// transient hiccup without hammering a flaky provider (the tides loader uses the same pattern).
const RETRY_COOLDOWN_MS = 30_000;
// Fetched note sets persist across reloads in IndexedDB (which, unlike the service worker, also
// works over plain http). POIs barely change, so a week-old set is still worth showing; the
// in-memory TTL drives the real refresh once a set has been seen this session.
const PERSIST_TTL_MS = 7 * DAY_MS;
const MAX_PERSIST_ENTRIES = 24;

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

// A display filter injected from the plotter-extension host: an extension's resources.setFilter for
// the `notes` type hides every POI it does not select. `version` bumps on any filter change so the
// imperative overlay re-renders when a filter is set or cleared without the map moving; `passes`
// decides one note. Absent on a stock server, where every fetched POI shows.
export interface NotesFilter {
  version: () => number;
  passes: (id: string, record: unknown) => boolean;
}

export interface NotesOverlayOptions {
  // Whether the app believes it is online (the host wires this from OnlineStatus). Offline, an
  // expired cached note set still renders so the POIs do not vanish at TTL expiry with no way to
  // refetch them.
  isOnline?: () => boolean;
  // The cross-reload store for fetched note sets; injectable so tests run on the memory fallback.
  persist?: ExpiringStore<NotePoint[]>;
  // The plotter-extension display filter for the `notes` type, when a host provides one.
  filter?: NotesFilter;
}

// A record shaped like the source notes resource, for a filter's `match` conditions. The plotter
// search filter selects by id (where the record is unused), but a category filter keys off
// `properties.skIcon`, the path ActiveCaptain providers use, so expose it here too.
function filterRecord(note: NotePoint): unknown {
  return {
    name: note.name,
    position: note.position,
    properties: note.skIcon ? { skIcon: note.skIcon } : {},
  };
}

// The registered map-image id for a note. Navaids resolve to a type- and side-specific
// symbol inferred from the name; every other category uses its disc.
function iconFor(note: NotePoint): string {
  if (note.category === 'navaid') return navaidIconId(navaidClassify(note.name));
  return poiIconId(note.category);
}

const CENTERED_OFFSET: [number, number] = [0, 0];

// Build the icon-offset as a match on the icon id. MapLibre coerces an array-valued GeoJSON property
// to a JSON string crossing to the worker, so a per-feature offset cannot ride on the feature as
// ['get', 'iconOffset']; the match keeps each provided symbol's anchor offset as a real LITERAL array
// in the style, and every centered category disc falls through to [0, 0].
function iconOffsetExpression(
  offsets: ReadonlyMap<string, readonly [number, number]>,
): ExpressionSpecification | [number, number] {
  if (offsets.size === 0) return CENTERED_OFFSET;
  const match: unknown[] = ['match', ['get', 'icon']];
  for (const [iconId, offset] of offsets) {
    match.push(iconId, ['literal', offset]);
  }
  match.push(['literal', CENTERED_OFFSET]);
  return match as ExpressionSpecification;
}

// One pass over the notes builds both the source data and the icon-offset match: each note resolves
// to a provided symbol or its built-in category disc, and a provided symbol with a non-zero anchor
// offset contributes one match arm keyed on its icon id.
function buildRender(
  notes: readonly NotePoint[],
  managedIcon: (note: NotePoint) => SymbolIconEntry | undefined,
): { data: GeoJSON.FeatureCollection; iconOffset: ExpressionSpecification | [number, number] } {
  const offsets = new Map<string, readonly [number, number]>();
  const features = notes.map((note): GeoJSON.Feature => {
    const managed = managedIcon(note);
    if (managed && (managed.offset[0] !== 0 || managed.offset[1] !== 0)) {
      offsets.set(managed.iconId, managed.offset);
    }
    return {
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
        icon: managed?.iconId ?? iconFor(note),
        url: note.url ?? '',
        source: note.source ?? '',
        attribution: note.attribution ?? '',
      },
    };
  });
  return { data: featureCollection(features), iconOffset: iconOffsetExpression(offsets) };
}

const EMPTY: GeoJSON.FeatureCollection = emptyFeatureCollection();

export function createNotesOverlay(
  serverBase: string,
  token: string | undefined,
  onSelect?: (selection: NoteSelection | undefined) => void,
  symbols?: SymbolsStore,
  options: NotesOverlayOptions = {},
): NotesOverlay {
  const isOnline = options.isOnline ?? (() => true);
  const filter = options.filter;
  const persist =
    options.persist ??
    createExpiringStore<NotePoint[]>('binnacle-notes', { maxEntries: MAX_PERSIST_ENTRIES });
  // A viewport-keyed cache of fetched note sets so panning back, panning a little, or zooming in
  // reuses a recent fetch instead of re-hitting the network (the data depends only on the bbox, not
  // the zoom). The raw zoom/center drive a cheap idle fast-path that skips the work when the map has
  // not moved at all, and a single fetch runs at a time.
  const cache = new NotesCache();
  // Areas already fetched or promoted this session: for those the in-memory TTL governs freshness
  // and an expiry goes to the network, never back to the week-lived persisted copy, so a stale set
  // cannot pin itself for its whole persisted life.
  const promotedKeys = new Set<string>();
  // The exact note array last handed to setData, so a redundant render is skipped and, crucially, a
  // failed fetch keeps it on screen instead of blanking the markers.
  let renderedNotes: NotePoint[] | undefined;
  // The filter version the rendered features reflect, so a filter change re-renders the same source
  // set, and the version seen by sync, so a change re-renders even when the map has not moved.
  let renderedFilterVersion: number | undefined;
  let syncedFilterVersion: number | undefined = filter?.version();
  let lastZoom: number | undefined;
  let lastLng: number | undefined;
  let lastLat: number | undefined;
  // Force the next sync of a stationary map to re-evaluate cache-or-fetch: the idle fast-path
  // compares against the last synced coordinates, so dropping the zoom anchor is the one named
  // way to break it (after a failed fetch, a cooldown tick, or a move during a fetch).
  const invalidateIdleAnchor = (): void => {
    lastZoom = undefined;
  };
  let fetching = false;
  // Set after a failed fetch; until it passes, sync holds the fast-path open instead of fetching.
  let cooldownUntil = 0;
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
  // Provided symbols (signalk-symbol-manager), absent on a stock server. The registry holds the
  // registered map images; pendingSymbols collects the resolvable-but-not-yet-registered ones a
  // render saw, so their loads can be kicked once and the set re-rendered when they land.
  const registry = symbols?.createIconRegistry();
  const pendingSymbols = new Map<string, SkSymbol>();
  let themePaint = mapThemePaint('day');

  // The registered icon for a note whose skIcon resolves to a provided symbol, or undefined for
  // the built-in category disc (no symbols store, unresolvable reference, image still loading,
  // or a failed load).
  function managedIcon(note: NotePoint): SymbolIconEntry | undefined {
    if (!registry || !symbols || !note.skIcon) return undefined;
    const symbol = symbols.resolve(note.skIcon, 'note');
    if (!symbol) return undefined;
    const entry = registry.entry(symbol.uuid);
    if (entry) return entry;
    if (registry.status(symbol.uuid) !== 'failed') pendingSymbols.set(symbol.uuid, symbol);
    return undefined;
  }

  // Kick the loads a render queued; each success re-renders the same note set (if still shown)
  // so the now-registered symbol replaces its category disc. A failure resolves false and is
  // remembered by the registry, so the disc simply stays: no missing-image warning either way,
  // because a feature never references an unregistered image id.
  function ensurePendingIcons(ctx: OverlayContext, notes: NotePoint[]): void {
    if (!registry || pendingSymbols.size === 0) return;
    const pending = [...pendingSymbols.values()];
    pendingSymbols.clear();
    for (const symbol of pending) {
      void registry
        .ensure(ctx.map, symbol, themePaint)
        .then((ok) => {
          if (!ok || renderedNotes !== notes) return;
          renderedNotes = undefined;
          render(ctx, notes);
        })
        // A rejected load behaves like a resolved false: the category disc stays.
        .catch(() => undefined);
    }
  }

  function setData(ctx: OverlayContext, data: GeoJSON.FeatureCollection): void {
    const source = ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(data);
  }

  // Render a note set, skipping the work when it is the same set already shown. Leaving the source
  // untouched on a no-op avoids re-clustering the markers every idle frame.
  function render(ctx: OverlayContext, notes: NotePoint[]): void {
    const filterVersion = filter?.version();
    if (notes === renderedNotes && filterVersion === renderedFilterVersion) return;
    renderedNotes = notes;
    renderedFilterVersion = filterVersion;
    // Drop the POIs an active host filter hides. With no filter every fetched note shows.
    const shown = filter
      ? notes.filter((note) => filter.passes(note.id, filterRecord(note)))
      : notes;
    const { data, iconOffset } = buildRender(shown, managedIcon);
    setData(ctx, data);
    // The offset is a layer property, not a feature one (MapLibre stringifies an array feature
    // property), so it is restyled here. The getLayer guard mirrors setData's missing-source degrade.
    if (ctx.map.getLayer(LAYER_ID)) ctx.map.setLayoutProperty(LAYER_ID, 'icon-offset', iconOffset);
    ensurePendingIcons(ctx, notes);
  }

  // Resolve an area's notes from the persisted store (only the first time this session sees the
  // area, which is the reload case), else from the network, persisting a successful fetch for the
  // next reload. The in-memory cache write stays with the caller, the weather loader's promote
  // pattern.
  async function resolveNotes(key: string, fetchBbox: Bbox): Promise<NotePoint[] | undefined> {
    if (!promotedKeys.has(key)) {
      const now = Date.now();
      const stored = await persist.get(key);
      if (stored && stored.expires > now) {
        promotedKeys.add(key);
        void persist.prune(now);
        return stored.value;
      }
    }
    const notes = await fetchNotes(serverBase, token, fetchBbox);
    if (notes) {
      promotedKeys.add(key);
      const now = Date.now();
      await persist.put(key, notes, now + PERSIST_TTL_MS);
      void persist.prune(now);
    }
    return notes;
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
    source.setData(
      featureCollection([{ type: 'Feature', geometry: feature.geometry, properties: {} }]),
    );
  }

  return {
    id: 'notes',
    title: 'Points of interest',
    band: 'routes',
    supportsOpacity: true,
    layerIds: LAYERS,
    async add(ctx) {
      const before = ctx.beforeIdFor('routes');

      if (!ctx.map.getSource(SOURCE_ID)) {
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
      }
      if (!ctx.map.getSource(SELECT_SOURCE)) {
        ctx.map.addSource(SELECT_SOURCE, { type: 'geojson', data: EMPTY });
      }

      // Selection ring sits below the markers so the icon draws on top of it; a dark casing ring below
      // it (a wider stroke at the same radius) gives the amber ring contrast on light day water.
      if (!ctx.map.getLayer(SELECT_CASING_LAYER)) {
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
      }
      if (!ctx.map.getLayer(SELECT_LAYER)) {
        const selectLayer: CircleLayerSpecification = {
          id: SELECT_LAYER,
          type: 'circle',
          source: SELECT_SOURCE,
          minzoom: MIN_ZOOM,
          paint: {
            'circle-radius': 15,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': themePaint.select,
            'circle-stroke-width': 3,
          },
        };
        ctx.map.addLayer(selectLayer, before);
      }

      // The group ring behind the cluster icon, so a cluster never reads as a single POI; its
      // radius steps up with the contained count.
      if (!ctx.map.getLayer(CLUSTER_RING_LAYER)) {
        const clusterRing: CircleLayerSpecification = {
          id: CLUSTER_RING_LAYER,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          minzoom: MIN_ZOOM,
          paint: {
            'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 28],
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': themePaint.markerGlyph,
            'circle-stroke-width': 2.5,
            'circle-stroke-opacity': 0.9,
          },
        };
        ctx.map.addLayer(clusterRing, before);
      }

      if (!ctx.map.getLayer(CLUSTER_ICON_LAYER)) {
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
      }

      // The count badge at the upper-right corner, haloed so it reads over the icon and the ring.
      if (!ctx.map.getLayer(CLUSTER_COUNT_LAYER)) {
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
            'text-color': themePaint.markerGlyph,
            'text-halo-color': themePaint.note,
            'text-halo-width': 2.4,
          },
        };
        ctx.map.addLayer(clusterCount, before);
      }

      // Unclustered points: the per-category icon, with its name once zoomed in.
      if (!ctx.map.getLayer(LAYER_ID)) {
        const layer: SymbolLayerSpecification = {
          id: LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': ['get', 'icon'],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 0.9],
            // Default offset; render() sets a per-icon match via setLayoutProperty (a provided
            // symbol's offset pins its declared anchor pixel to the point). The offset cannot ride on
            // the feature as a ['get'], because MapLibre coerces an array-valued property to a string.
            'icon-offset': [0, 0],
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
            'text-color': themePaint.note,
            'text-halo-color': themePaint.background,
            'text-halo-width': 1.2,
          },
          minzoom: MIN_ZOOM,
        };
        ctx.map.addLayer(layer, before);
      }

      onClick = (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const props = feature.properties ?? {};
        const id = String(props.id ?? '');
        // A note with no id cannot be fetched for detail, so do not select it.
        if (!id) return;
        // The category rides on the rendered feature, so validate it against the known set rather
        // than trusting the string into PoiCategory: an out-of-vocabulary value would key the label
        // and icon records to nothing instead of falling back.
        const rawCategory = String(props.category ?? '');
        const category: PoiCategory = (POI_CATEGORIES as readonly string[]).includes(rawCategory)
          ? (rawCategory as PoiCategory)
          : 'generic';
        setSelected(ctx, feature);
        onSelect?.({
          id,
          name: String(props.name ?? 'Point of interest'),
          category,
          attribution: str(props.attribution) ?? str(props.source),
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
      // Load the category and navaid icons after the layers exist, concurrently; resilient, so a
      // failure here leaves the markers as text labels rather than breaking overlay setup.
      await Promise.all([
        registerPoiIcons(ctx.map, themePaint),
        registerNavaidIcons(ctx.map, themePaint),
      ]);
    },
    sync(ctx) {
      // A hidden layer pays nothing: no network fetch, no clustering, no GeoJSON rebuild. The next
      // show re-syncs from the cache (or fetches) for wherever the map ended up.
      if (!visible) return;
      // A filter change (an extension's setFilter/clearFilter) must re-render even when the map has
      // not moved. Re-render the already-shown set against the new filter immediately, then drop the
      // idle anchor so the fast-path below cannot skip and a later pan re-evaluates normally.
      const filterVersion = filter?.version();
      if (filterVersion !== syncedFilterVersion) {
        syncedFilterVersion = filterVersion;
        if (renderedNotes) {
          const notes = renderedNotes;
          renderedNotes = undefined;
          render(ctx, notes);
        }
        invalidateIdleAnchor();
      }
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
      const viewport: Bbox = lngLatBoundsToBbox4(ctx.map.getBounds());
      // A recent fetch whose padded area still covers the viewport serves the markers with no
      // network. This runs before the in-flight guard, so a cache hit renders even mid-fetch.
      // Offline, an expired entry still answers: stale POIs beat a chart that goes blank.
      const cached = cache.get(viewport, Date.now(), !isOnline());
      if (cached) {
        render(ctx, cached);
        return;
      }
      if (fetching) return;
      if (Date.now() < cooldownUntil) {
        // Still backing off from a failed fetch; retry once the cooldown passes, even stationary.
        invalidateIdleAnchor();
        return;
      }
      fetching = true;
      // Fetch a padded area so the next small pan or zoom-in reuses this fetch from the cache.
      const fetchBbox = padBbox(viewport);
      resolveNotes(bboxKey(fetchBbox), fetchBbox)
        .then((notes) => {
          // undefined is a transient failure: keep the markers already shown and retry after a
          // cooldown, even stationary (the fast-path would otherwise pin the failure forever). An
          // empty array is a real "no POIs here" answer, so it renders and clears them.
          if (!notes) {
            cooldownUntil = Date.now() + RETRY_COOLDOWN_MS;
            invalidateIdleAnchor();
            return;
          }
          cache.put(fetchBbox, notes, Date.now());
          render(ctx, notes);
          // The map may have moved while the fetch was in flight; when this fetch no longer covers
          // the current viewport, drop the fast-path anchor so the next sync serves the new area.
          const current: Bbox = lngLatBoundsToBbox4(ctx.map.getBounds());
          if (!bboxContains(fetchBbox, current)) invalidateIdleAnchor();
        })
        .finally(() => {
          fetching = false;
        });
    },
    deselect(ctx) {
      setSelected(ctx, undefined);
    },
    applyTheme(ctx, paint) {
      themePaint = paint;
      // The cheap per-layer color updates always run so the layer is correct the instant it shows.
      // The expensive icon re-raster (18 SVGs) is deferred while hidden and done on the next show.
      if (visible) {
        void registerPoiIcons(ctx.map, paint);
        void registerNavaidIcons(ctx.map, paint);
        registry?.retheme(ctx.map, paint);
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
      setLayersVisibility(ctx.map, LAYERS, isVisible);
      // If the theme changed while hidden, refresh the icons now that the layer is shown again.
      if (isVisible && pendingIconPaint) {
        const paint = pendingIconPaint;
        pendingIconPaint = undefined;
        void registerPoiIcons(ctx.map, paint);
        void registerNavaidIcons(ctx.map, paint);
        registry?.retheme(ctx.map, paint);
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
      removeLayersAndSources(ctx.map, LAYERS, [SOURCE_ID, SELECT_SOURCE]);
    },
  };
}
