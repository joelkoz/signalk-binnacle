import maplibregl from 'maplibre-gl';
import type { Theme } from '$shared/ui';
import { baseStyleUrl } from './base-style';
import { applyBaseTheme, captureBaseTheme, restoreBaseTheme } from './base-theme';
import { LayerManager, type LayerManagerOptions } from './layer-manager';
import { mapThemePaint } from './map-theme';
import { beforeIdFor, installSentinels } from './sentinels';
import type { OverlayContext } from './types';

// A plain lat/lon/zoom view, structurally compatible with the settings MapView, kept local so this
// shared map helper does not depend on the settings slice.
export interface MapViewLike {
  lat: number;
  lon: number;
  zoom: number;
}

// Anything the per-frame tick can sync: the overlay modules all expose sync(ctx).
interface Syncable {
  sync(ctx: OverlayContext): void;
}

// Handed to the widget once the style has loaded, the sentinels are installed, and the LayerManager
// is built. The widget registers its overlays (guarding async steps with isDestroyed), wires any
// widget-specific commands, and starts the tick.
export interface ThemedMapApi {
  map: maplibregl.Map;
  ctx: OverlayContext;
  manager: LayerManager;
  // Recolor the base map and every overlay for a theme: day restores the source style's real colors,
  // dusk and night-red recolor the base, and the manager recolors each overlay's own layers.
  recolor: (theme: Theme) => void;
  // Whether the widget has been destroyed, for bailing out of async overlay registration.
  isDestroyed: () => boolean;
  // Start the per-animation-frame loop that calls sync(ctx) on each overlay.
  runTick: (overlays: ReadonlyArray<Syncable>) => void;
}

export interface ThemedMapOptions {
  container: HTMLElement;
  // The view to open at; capped to maxZoom. Falls back to the default center and zoom.
  view?: MapViewLike;
  defaultCenter?: [number, number];
  defaultZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  managerOptions?: LayerManagerOptions;
  // Coalesced to one emit per animation frame, for the live position readout and view persistence.
  onView?: (view: MapViewLike) => void;
  // A hand drag (not a programmatic move or a scroll-zoom), for releasing a follow lock.
  onUserPan?: () => void;
  onClick?: (lngLat: { lng: number; lat: number }) => void;
  onLoad: (api: ThemedMapApi) => void | Promise<void>;
}

export interface ThemedMapHandle {
  destroy: () => void;
}

const DEFAULT_CENTER: [number, number] = [0, 30];
const DEFAULT_ZOOM = 2;

// The shared MapLibre bootstrap for both map widgets (the navigation chart and the weather mini-map):
// map creation, a ResizeObserver, the per-frame view-emit coalescer, sentinels, the LayerManager, the
// theme recolor closure, the per-frame overlay tick, and a single destroy. Each widget supplies only
// its overlay set and its own wiring via onLoad. One source of truth so the two never drift.
export function createThemedMap(opts: ThemedMapOptions): ThemedMapHandle {
  let map: maplibregl.Map;
  try {
    const center: [number, number] = opts.view
      ? [opts.view.lon, opts.view.lat]
      : (opts.defaultCenter ?? DEFAULT_CENTER);
    const wanted = opts.view ? opts.view.zoom : (opts.defaultZoom ?? DEFAULT_ZOOM);
    map = new maplibregl.Map({
      container: opts.container,
      style: baseStyleUrl(),
      center,
      zoom: Math.min(wanted, opts.maxZoom ?? Number.POSITIVE_INFINITY),
      minZoom: opts.minZoom,
      maxZoom: opts.maxZoom,
      attributionControl: { compact: true },
    });
  } catch (error) {
    console.error('Map failed to initialize', error);
    return { destroy: () => {} };
  }

  const mapInstance = map;
  let destroyed = false;
  let frame = 0;

  // The container resizes when side panels open or the viewport changes without a window resize, so
  // observe it and let MapLibre re-fit rather than sit at a stale size.
  const resizeObserver = new ResizeObserver(() => mapInstance.resize());
  resizeObserver.observe(opts.container);

  // The 'move' event fires many times per drag frame; coalesce to one emit per animation frame.
  let viewPending = false;
  const emitView = () => {
    if (viewPending) return;
    viewPending = true;
    requestAnimationFrame(() => {
      viewPending = false;
      if (destroyed) return;
      const center = mapInstance.getCenter();
      opts.onView?.({ lat: center.lat, lon: center.lng, zoom: mapInstance.getZoom() });
    });
  };
  mapInstance.on('move', emitView);
  // dragstart fires only for hand panning (not for programmatic setCenter or scroll-zoom), so a
  // follow lock survives a zoom but ends the moment the user drags the chart away.
  if (opts.onUserPan) mapInstance.on('dragstart', () => opts.onUserPan?.());
  if (opts.onClick) {
    mapInstance.on('click', (e) => opts.onClick?.({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
  }

  mapInstance.on('load', () => {
    emitView();
    const ctx: OverlayContext = { map: mapInstance, beforeIdFor };
    installSentinels(mapInstance);
    const manager = new LayerManager(ctx, opts.managerOptions);

    // Snapshot the source style's own colors before any recolor, so the day theme can restore the
    // real map rather than approximate it.
    const baseColors = captureBaseTheme(mapInstance, mapThemePaint('day'));
    const recolor = (theme: Theme) => {
      const paint = mapThemePaint(theme);
      if (theme === 'day') restoreBaseTheme(mapInstance, baseColors);
      else applyBaseTheme(mapInstance, paint);
      manager.applyTheme(paint);
    };

    const runTick = (overlays: ReadonlyArray<Syncable>) => {
      const tick = () => {
        for (const overlay of overlays) overlay.sync(ctx);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    void opts.onLoad({
      map: mapInstance,
      ctx,
      manager,
      recolor,
      isDestroyed: () => destroyed,
      runTick,
    });
  });

  return {
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mapInstance.remove();
    },
  };
}
