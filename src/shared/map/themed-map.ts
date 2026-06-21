import maplibregl from 'maplibre-gl';
import type { Theme } from '$shared/ui';
import { baseStyleUrl, fallbackBaseStyle } from './base-style';
import {
  applyBaseIconVisibility,
  applyBaseTheme,
  captureBaseTheme,
  restoreBaseTheme,
  themableBaseLayers,
} from './base-theme';
import { LayerManager, type LayerManagerOptions } from './layer-manager';
import { installContextMenu } from './long-press';
import { mapThemePaint } from './map-theme';
import { createOverlayTick, type Syncable } from './overlay-tick';
import { beforeIdFor, installSentinels } from './sentinels';
import type { OverlayContext } from './types';

// A plain lat/lon/zoom view, structurally compatible with the settings MapView, kept local so this
// shared map helper does not depend on the settings slice.
export interface MapViewLike {
  lat: number;
  lon: number;
  zoom: number;
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
  // visibilitychange listener). A no-op until the overlay tick is built on 'load', then it delegates
  // to the controller's live teardown; invoked once on destroy.
  let stopTick = () => {};

  // If the base style JSON itself never arrives (plain http at sea: no service worker, no
  // internet), the map can never fire 'load' and nothing mounts, including the charts already
  // sitting in the IndexedDB block cache. Swap in the one-layer fallback style so 'load' fires
  // and every overlay mounts. The gate is precise: 'styledata' fires once the style JSON parses,
  // so sprite, glyph, and tile failures (which all come after it) can never trip this. One shot;
  // the real style returns on the next load with connectivity.
  let styleArrived = false;
  mapInstance.once('styledata', () => {
    styleArrived = true;
  });
  mapInstance.on('error', () => {
    if (styleArrived || destroyed) return;
    styleArrived = true;
    console.info(
      '[map] the base map style is unreachable; starting on the offline fallback base. Cached charts and overlays still load.',
    );
    mapInstance.setStyle(fallbackBaseStyle());
  });

  // The OpenFreeMap "liberty" base style references a handful of sprite icons and landuse
  // fill-patterns (for example "office", "gate", "brownfield", "reservoir") that its published
  // sprite does not actually contain, so MapLibre logs a "styleimagemissing" warning for each on
  // load. Supply a 1x1 transparent placeholder so the console stays clean and the affected icon or
  // pattern renders nothing, which matches how the theme already flattens those landuse fills.
  const transparentPixel = { width: 1, height: 1, data: new Uint8Array(4) };
  mapInstance.on('styleimagemissing', (event) => {
    if (mapInstance.hasImage(event.id)) return;
    mapInstance.addImage(event.id, transparentPixel);
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

  // A right-click or long-press at a point, surfaced for the "go to here" menu. The contextMenu
  // controller owns the contextmenu event, the touch long-press synthesis, and the canvas-listener
  // teardown; both closures stay no-ops when no onContextMenu is supplied.
  let cancelLongPress = () => {};
  let removeCanvasListeners = () => {};
  if (opts.onContextMenu) {
    const contextMenu = installContextMenu(mapInstance, opts.onContextMenu);
    cancelLongPress = contextMenu.cancel;
    removeCanvasListeners = contextMenu.remove;
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
      // Both base passes filter the style to the same themable layers; compute that list once and
      // pass it to both rather than refiltering twice per recolor.
      const layers = themableBaseLayers(mapInstance);
      if (theme === 'day') restoreBaseTheme(mapInstance, baseColors);
      else applyBaseTheme(mapInstance, paint, layers);
      applyBaseIconVisibility(mapInstance, paint, layers);
      manager.applyTheme(paint);
    };

    const tick = createOverlayTick(mapInstance, ctx, () => destroyed);
    // Route destroy's teardown through the controller's stopTick, which tears down the latest runTick
    // wiring (or no-ops if runTick was never called).
    stopTick = tick.stopTick;

    Promise.resolve(
      opts.onLoad({
        map: mapInstance,
        ctx,
        manager,
        recolor,
        isDestroyed: () => destroyed,
        runTick: tick.runTick,
      }),
    ).catch((e) => console.error('map onLoad failed', e));
  });

  return {
    destroy: () => {
      destroyed = true;
      cancelLongPress();
      removeCanvasListeners();
      stopTick();
      resizeObserver.disconnect();
      mapInstance.remove();
    },
  };
}
