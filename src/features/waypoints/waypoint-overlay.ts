import type {
  CircleLayerSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import { type SymbolsStore, symbolIconId } from '$entities/symbols';
import type { Waypoint, WaypointsStore } from '$entities/waypoint';
import {
  emptyFeatureCollection,
  type MapThemePaint,
  mapThemePaint,
  type OverlayContext,
  type OverlayModule,
  removeLayersAndSources,
  setLayersVisibility,
} from '$shared/map';

const SOURCE_ID = 'binnacle-waypoints';
const MARKER_LAYER = 'binnacle-waypoint-marker';
const SYMBOL_MARKER_LAYER = 'binnacle-waypoint-symbol';
const LABEL_LAYER = 'binnacle-waypoint-label';
const BAND = 'routes';

export interface WaypointOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

function features(waypoints: readonly Waypoint[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: waypoints.map((waypoint) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [waypoint.position.longitude, waypoint.position.latitude],
      },
      properties: { name: waypoint.name },
    })),
  };
}

// Standalone waypoints as a small marker disc with the name set beside it, presentational only
// (no click handling). The band matches the route overlay so the Layers panel lists it under
// My routes and tracks. Circle and text layers, so it themes cleanly to night-red. When a
// provided symbol overrides the 'waypoint' built-in (signalk-symbol-manager's unqualified-id
// override), a symbol layer replaces the disc once its image registers; until then, and on any
// load failure, the disc carries on unchanged.
export function createWaypointOverlay(
  store: WaypointsStore,
  symbols?: SymbolsStore,
): WaypointOverlay {
  let paint: MapThemePaint = mapThemePaint('day');
  let lastVersion = -1;
  // Resolved lazily: the store is constructed empty before auth and filled when the symbols fetch
  // lands, so sync re-checks until a 'waypoint' override appears (or never, on a stock server).
  let symbol = symbols?.resolve('waypoint', 'waypoint');
  let registry = symbol ? symbols?.createIconRegistry() : undefined;
  // The symbol layer is in the id list unconditionally; the teardown helper skips absent layers.
  const layers = [MARKER_LAYER, SYMBOL_MARKER_LAYER, LABEL_LAYER];
  // Starts true to match the layer-manager default; the register-time setVisible corrects it.
  let visible = true;
  let usingSymbol = false;
  let lastAddBefore: string | undefined;

  function ensureSymbolLayer(ctx: OverlayContext): void {
    if (!symbol || ctx.map.getLayer(SYMBOL_MARKER_LAYER)) return;
    // Added hidden so the not-yet-registered icon id is never resolved (no missing-image
    // warning); upgradeToSymbol shows it only once the image exists.
    const layer: SymbolLayerSpecification = {
      id: SYMBOL_MARKER_LAYER,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'icon-image': symbolIconId(symbol.uuid),
        'icon-allow-overlap': true,
        visibility: 'none',
      },
    };
    ctx.map.addLayer(layer, lastAddBefore);
  }

  // The disc and the symbol marker are alternatives: exactly one of them follows the overlay's
  // visibility, flipped when the symbol image lands.
  function applyMarkerVisibility(ctx: OverlayContext): void {
    setLayersVisibility(ctx.map, [MARKER_LAYER], visible && !usingSymbol);
    if (ctx.map.getLayer(SYMBOL_MARKER_LAYER)) {
      setLayersVisibility(ctx.map, [SYMBOL_MARKER_LAYER], visible && usingSymbol);
    }
  }

  async function upgradeToSymbol(ctx: OverlayContext): Promise<void> {
    if (!registry || !symbol) return;
    // A rejected load counts as a failed upgrade, not an unhandled rejection: both call sites
    // fire and forget, and the built-in marker keeps rendering either way.
    const ok = await registry.ensure(ctx.map, symbol, paint).catch(() => false);
    const entry = registry.entry(symbol.uuid);
    if (!ok || !entry || !ctx.map.getLayer(SYMBOL_MARKER_LAYER)) return;
    ctx.map.setLayoutProperty(SYMBOL_MARKER_LAYER, 'icon-offset', entry.offset);
    usingSymbol = true;
    applyMarkerVisibility(ctx);
  }

  return {
    id: 'waypoints',
    title: 'Waypoints',
    band: BAND,
    supportsOpacity: true,
    layerIds: layers,
    add(ctx) {
      // Reset the dirty-check so a reattach (after a base-style swap emptied the source)
      // repopulates it on the next sync instead of staying blank. The symbol upgrade re-runs
      // too: a style swap drops map images, and the registry re-registers from its cache.
      lastVersion = -1;
      usingSymbol = false;
      const before = ctx.beforeIdFor(BAND);
      lastAddBefore = before;
      if (!ctx.map.getSource(SOURCE_ID)) {
        const source: GeoJSONSourceSpecification = {
          type: 'geojson',
          data: emptyFeatureCollection(),
        };
        ctx.map.addSource(SOURCE_ID, source);
      }
      if (!ctx.map.getLayer(MARKER_LAYER)) {
        const layer: CircleLayerSpecification = {
          id: MARKER_LAYER,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-radius': 5,
            'circle-color': paint.waypoint,
            'circle-stroke-color': paint.markerGlyph,
            'circle-stroke-width': 1.5,
          },
        };
        ctx.map.addLayer(layer, before);
      }
      ensureSymbolLayer(ctx);
      if (!ctx.map.getLayer(LABEL_LAYER)) {
        const layer: SymbolLayerSpecification = {
          id: LABEL_LAYER,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
            'text-offset': [0.8, 0],
            'text-anchor': 'left',
            'text-optional': true,
            'text-max-width': 12,
          },
          paint: {
            'text-color': paint.label,
            'text-halo-color': paint.background,
            'text-halo-width': 1.5,
          },
        };
        ctx.map.addLayer(layer, before);
      }
      if (symbol) void upgradeToSymbol(ctx);
    },
    sync(ctx) {
      // A late-filling symbols store (the fetch lands after the map mounted) upgrades here: one
      // cheap map lookup per tick until it resolves or the session ends without symbols.
      if (!symbol && symbols) {
        symbol = symbols.resolve('waypoint', 'waypoint');
        if (symbol) {
          registry = symbols.createIconRegistry();
          ensureSymbolLayer(ctx);
          void upgradeToSymbol(ctx);
        }
      }
      if (store.version === lastVersion) return;
      lastVersion = store.version;
      (ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData(
        features(store.waypoints),
      );
    },
    setVisible(ctx, isVisible) {
      visible = isVisible;
      setLayersVisibility(ctx.map, [LABEL_LAYER], visible);
      applyMarkerVisibility(ctx);
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(MARKER_LAYER, 'circle-opacity', opacity);
      ctx.map.setPaintProperty(MARKER_LAYER, 'circle-stroke-opacity', opacity);
      if (ctx.map.getLayer(SYMBOL_MARKER_LAYER)) {
        ctx.map.setPaintProperty(SYMBOL_MARKER_LAYER, 'icon-opacity', opacity);
      }
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-opacity', opacity);
    },
    applyTheme(ctx, next) {
      paint = next;
      ctx.map.setPaintProperty(MARKER_LAYER, 'circle-color', paint.waypoint);
      ctx.map.setPaintProperty(MARKER_LAYER, 'circle-stroke-color', paint.markerGlyph);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-color', paint.label);
      ctx.map.setPaintProperty(LABEL_LAYER, 'text-halo-color', paint.background);
      registry?.retheme(ctx.map, next);
    },
    remove(ctx) {
      removeLayersAndSources(ctx.map, layers, [SOURCE_ID]);
    },
  };
}
