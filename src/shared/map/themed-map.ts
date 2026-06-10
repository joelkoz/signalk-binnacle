import maplibregl from 'maplibre-gl';
import type { Theme } from '$shared/ui';
import { baseStyleUrl } from './base-style';
import {
  applyBaseIconVisibility,
  applyBaseTheme,
  captureBaseTheme,
  restoreBaseTheme,
} from './base-theme';
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

// Anything the overlay sync can drive: the overlay modules all expose sync(ctx).
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
  // Start syncing the overlays: on every MapLibre 'render' (so pan and zoom repaints update them)
  // and on a low-frequency interval (so store-driven overlays that change without a camera move,
  // like AIS prune, tides, radar advance, and collision, still tick). Both stop while the document
  // is hidden. The per-overlay dirty-checks still gate real work, so this only changes WHEN sync is
  // invoked, not what it does.
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
  // A right-click (desktop) or long-press (touch) at a chart point, for the "go to here" menu. Carries
  // the geographic point and the pixel point within the container, so a menu can anchor at the press.
  onContextMenu?: (point: { lng: number; lat: number; x: number; y: number }) => void;
  onLoad: (api: ThemedMapApi) => void | Promise<void>;
}

export interface ThemedMapHandle {
  destroy: () => void;
}

const DEFAULT_CENTER: [number, number] = [0, 30];
const DEFAULT_ZOOM = 2;
// How often store-driven overlays (AIS prune, tides, radar advance, collision) are synced when the
// map is not repainting on its own. Map moves still sync on every 'render', so this only covers the
// overlays that change without a camera move; 250 ms is well under the radar frame dwell.
const STORE_SYNC_MS = 250;
// A touch long-press that holds still this long, and within this pixel slop, stands in for the
// contextmenu event that touch browsers do not reliably fire.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_PX = 10;

// The shared MapLibre bootstrap for both map widgets (the navigation chart and the weather mini-map):
// map creation, a ResizeObserver, the per-frame view-emit coalescer, sentinels, the LayerManager, the
// theme recolor closure, the render-driven plus low-frequency overlay sync, and a single destroy.
// Each widget supplies only its overlay set and its own wiring via onLoad. One source of truth so the
// two never drift.
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
  // Teardown for the sync wiring runTick installs (the 'render' listener, the interval, and the
  // visibilitychange listener). Empty until runTick is called; invoked once on destroy.
  let stopTick = () => {};

  // The OpenFreeMap "liberty" base style references a handful of sprite icons and landuse
  // fill-patterns (for example "office", "gate", "brownfield", "reservoir") that its published
  // sprite does not actually contain, so MapLibre logs a "styleimagemissing" warning for each on
  // load. Supply a 1x1 transparent placeholder so the console stays clean and the affected icon or
  // pattern renders nothing, which matches how the theme already flattens those landuse fills.
  mapInstance.on('styleimagemissing', (event) => {
    if (mapInstance.hasImage(event.id)) return;
    mapInstance.addImage(event.id, { width: 1, height: 1, data: new Uint8Array(4) });
  });

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

  // A right-click or long-press at a point, surfaced for the "go to here" menu. The desktop path is
  // MapLibre's own contextmenu event; touch browsers do not all fire it, so a still-held finger past
  // a timeout (cancelled by movement, lift, or a second touch) synthesizes the same emit.
  let cancelLongPress = () => {};
  if (opts.onContextMenu) {
    const emit = opts.onContextMenu;
    mapInstance.on('contextmenu', (e) => {
      emit({ lng: e.lngLat.lng, lat: e.lngLat.lat, x: e.point.x, y: e.point.y });
    });
    const canvas = mapInstance.getCanvas();
    let pressTimer = 0;
    let startX = 0;
    let startY = 0;
    cancelLongPress = () => {
      if (!pressTimer) return;
      clearTimeout(pressTimer);
      pressTimer = 0;
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      cancelLongPress();
      startX = e.clientX;
      startY = e.clientY;
      pressTimer = window.setTimeout(() => {
        pressTimer = 0;
        const rect = canvas.getBoundingClientRect();
        const x = startX - rect.left;
        const y = startY - rect.top;
        const at = mapInstance.unproject([x, y]);
        emit({ lng: at.lng, lat: at.lat, x, y });
      }, LONG_PRESS_MS);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (pressTimer && Math.hypot(e.clientX - startX, e.clientY - startY) > LONG_PRESS_MOVE_PX) {
        cancelLongPress();
      }
    });
    canvas.addEventListener('pointerup', cancelLongPress);
    canvas.addEventListener('pointercancel', cancelLongPress);
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
      applyBaseIconVisibility(mapInstance, paint);
      manager.applyTheme(paint);
    };

    const runTick = (overlays: ReadonlyArray<Syncable>) => {
      // Calling this once replaces the old unconditional rAF loop, which synced ~60x/sec for the life
      // of the map even at anchor. Now sync runs only when the map actually repaints (pan, zoom) and
      // on a low-frequency interval for the store-driven overlays, and both pause while hidden.
      const syncAll = () => {
        if (destroyed) return;
        for (const overlay of overlays) overlay.sync(ctx);
      };

      // MapLibre fires 'render' only when it repaints, so this covers every pan and zoom without a
      // self-scheduling frame loop.
      mapInstance.on('render', syncAll);

      let interval = 0;
      const startInterval = () => {
        if (interval) return;
        interval = window.setInterval(syncAll, STORE_SYNC_MS);
      };
      const stopInterval = () => {
        if (!interval) return;
        clearInterval(interval);
        interval = 0;
      };

      // Pause both the interval and (implicitly, since the map stops repainting) the render sync while
      // the tab is hidden; resume and sync once on return so a hidden-tab change shows immediately.
      const onVisibility = () => {
        if (document.hidden) {
          stopInterval();
        } else {
          startInterval();
          syncAll();
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      if (!document.hidden) startInterval();
      syncAll();

      stopTick = () => {
        mapInstance.off('render', syncAll);
        stopInterval();
        document.removeEventListener('visibilitychange', onVisibility);
        stopTick = () => {};
      };
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
      cancelLongPress();
      stopTick();
      resizeObserver.disconnect();
      mapInstance.remove();
    },
  };
}
