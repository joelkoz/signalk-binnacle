import type { GeoJSONSource, MapGeoJSONFeature, MapLayerMouseEvent } from 'maplibre-gl';
import { asPoiCategory, registerPoiIcons } from '$entities/poi-icons';
import { createOverlayIconResolver, type SymbolsStore } from '$entities/symbols';
import { bboxContains, lngLatBoundsToBbox4 } from '$shared/geo';
import { DAY_MS } from '$shared/lib';
import {
  emptyFeatureCollection,
  featureCollection,
  type MapThemePaint,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
  setLayersVisibility,
  setSourceData,
} from '$shared/map';
import { str } from '$shared/signalk';
import { createExpiringStore, type ExpiringStore } from '$shared/storage';
import { registerNavaidIcons } from './navaid-symbols';
import { bboxKey, NotesCache, padBbox } from './notes-cache';
import { type Bbox, fetchNotes, type NotePoint, type NoteSelection } from './notes-client';
import { buildRender, filterRecord } from './notes-features';
import {
  addNoteLayers,
  CLUSTER_COUNT_LAYER,
  CLUSTER_HIT_LAYERS,
  CLUSTER_ICON_LAYER,
  CLUSTER_RING_LAYER,
  LAYER_ID,
  LAYERS,
  MIN_ZOOM,
  removeNoteLayers,
  SELECT_CASING_LAYER,
  SELECT_LAYER,
  SELECT_SOURCE,
  SOURCE_ID,
} from './notes-layers';

// After a failed fetch, back off this long before retrying so a stationary map recovers from a
// transient hiccup without hammering a flaky provider (the tides loader uses the same pattern).
const RETRY_COOLDOWN_MS = 30_000;
// Fetched note sets persist across reloads in IndexedDB (which, unlike the service worker, also
// works over plain http). POIs barely change, so a week-old set is still worth showing; the
// in-memory TTL drives the real refresh once a set has been seen this session.
const PERSIST_TTL_MS = 7 * DAY_MS;
const MAX_PERSIST_ENTRIES = 24;

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
  // Fired with the host-filtered on-screen note set whenever it changes, and with [] when the
  // overlay clears below the zoom floor, so a consumer (the POI search) can mirror the chart.
  onNotes?: (notes: NotePoint[]) => void;
}

export function createNotesOverlay(
  serverBase: string,
  token: string | undefined,
  onSelect?: (selection: NoteSelection | undefined) => void,
  symbols?: SymbolsStore,
  options: NotesOverlayOptions = {},
): NotesOverlay {
  const isOnline = options.isOnline ?? (() => true);
  const filter = options.filter;
  const onNotes = options.onNotes;
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
  // Provided symbols (signalk-symbol-manager), absent on a stock server. The resolver owns the
  // per-overlay icon registry and the pending-symbol queue; a note's skIcon resolves to a provided
  // symbol via the `note` role, or undefined for the built-in category disc (no symbols store,
  // unresolvable reference, image still loading, or a failed load).
  const iconResolver = createOverlayIconResolver(symbols, (note: NotePoint) =>
    note.skIcon ? symbols?.resolve(note.skIcon, 'note') : undefined,
  );
  let themePaint = mapThemePaint('day');

  // Kick the loads a render queued; each success re-renders the same note set (if still shown)
  // so the now-registered symbol replaces its category disc. A failure resolves false and is
  // remembered by the registry, so the disc simply stays: no missing-image warning either way,
  // because a feature never references an unregistered image id.
  function ensurePendingIcons(ctx: OverlayContext, notes: NotePoint[]): void {
    iconResolver.ensurePending(ctx.map, themePaint, () => {
      if (renderedNotes !== notes) return;
      renderedNotes = undefined;
      render(ctx, notes);
    });
  }

  // Re-raster the 18 POI and navaid SVGs and the provided symbols to a new theme paint. Run on a
  // theme change while shown and deferred to the next show while hidden.
  function refreshIcons(ctx: OverlayContext, paint: MapThemePaint): void {
    void registerPoiIcons(ctx.map, paint);
    void registerNavaidIcons(ctx.map, paint);
    iconResolver.retheme(ctx.map, paint);
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
    const { data, iconOffset } = buildRender(shown, iconResolver.iconEntry);
    setSourceData(ctx.map, SOURCE_ID, data);
    // The offset is a layer property, not a feature one (MapLibre stringifies an array feature
    // property), so it is restyled here. The getLayer guard mirrors setData's missing-source degrade.
    if (ctx.map.getLayer(LAYER_ID)) ctx.map.setLayoutProperty(LAYER_ID, 'icon-offset', iconOffset);
    ensurePendingIcons(ctx, notes);
    onNotes?.(shown);
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
    setSourceData(ctx.map, SOURCE_ID, emptyFeatureCollection());
    onNotes?.([]);
  }

  // Highlight the selected marker by drawing a ring at its position; clearing it sets the
  // selection source back to empty.
  function setSelected(ctx: OverlayContext, feature: MapGeoJSONFeature | undefined): void {
    const source = ctx.map.getSource(SELECT_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;
    if (feature?.geometry.type !== 'Point') {
      source.setData(emptyFeatureCollection());
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
      addNoteLayers(ctx.map, themePaint, before);

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
        const category = asPoiCategory(String(props.category ?? ''));
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
        refreshIcons(ctx, paint);
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
        refreshIcons(ctx, paint);
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
      removeNoteLayers(ctx.map);
    },
  };
}
