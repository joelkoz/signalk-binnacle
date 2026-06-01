<script lang="ts">
import maplibregl from 'maplibre-gl';
import { onDestroy, onMount } from 'svelte';
import type { AisTargets } from '$entities/ais';
import type { CollisionAssessment } from '$entities/collision';
import type { OwnVessel } from '$entities/vessel';
import { createAisOverlay } from '$features/ais-layer';
import { fetchCharts } from '$features/charts';
import { LayersView } from '$features/layers-panel';
import { createCollisionOverlay } from '$features/lookout';
import { createNotesOverlay } from '$features/notes';
import { createVesselOverlay } from '$features/vessel-layer';
import {
  applyBaseTheme,
  baseStyleUrl,
  beforeIdFor,
  createChartOverlay,
  installSentinels,
  LayerManager,
  type LayerSettings,
  mapThemePaint,
  type OverlayContext,
  registerPmtilesProtocol,
} from '$shared/map';
import type { MapView } from '$shared/settings';
import { type SignalKStore, serverOrigin } from '$shared/signalk';
import type { Theme } from '$shared/ui';

interface Props {
  store: SignalKStore;
  vessel: OwnVessel;
  aisTargets: AisTargets;
  collision: CollisionAssessment;
  chartsToken?: string;
  // The view to open at, restored from the last visit; defaults to a world view.
  initialView?: MapView;
  // Saved per-layer visibility and opacity, and a sink for changes to persist.
  savedLayers?: LayerSettings;
  onLayersChange?: (settings: LayerSettings) => void;
  onReady?: (view: LayersView) => void;
  onMapReady?: (recolor: (theme: Theme) => void) => void;
  onViewChange?: (view: MapView) => void;
}

const {
  store,
  vessel,
  aisTargets,
  collision,
  chartsToken,
  initialView,
  savedLayers,
  onLayersChange,
  onReady,
  onMapReady,
  onViewChange,
}: Props = $props();

const DEFAULT_CENTER: [number, number] = [0, 30];
const DEFAULT_ZOOM = 2;

let container: HTMLDivElement;
let map: maplibregl.Map | undefined;
let manager: LayerManager | undefined;
let frame = 0;
let destroyed = false;

registerPmtilesProtocol();

onMount(() => {
  try {
    map = new maplibregl.Map({
      container,
      style: baseStyleUrl(),
      center: initialView ? [initialView.lon, initialView.lat] : DEFAULT_CENTER,
      zoom: initialView ? initialView.zoom : DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
  } catch (error) {
    console.error('Map failed to initialize', error);
    return;
  }

  const mapInstance = map;
  // The 'move' event fires many times per drag frame; coalesce to one emit per
  // animation frame so the status strip updates at display rate, not per pixel.
  let viewPending = false;
  const emitView = () => {
    if (viewPending) return;
    viewPending = true;
    requestAnimationFrame(() => {
      viewPending = false;
      if (destroyed) return;
      const center = mapInstance.getCenter();
      onViewChange?.({ lat: center.lat, lon: center.lng, zoom: mapInstance.getZoom() });
    });
  };
  mapInstance.on('move', emitView);
  mapInstance.on('load', async () => {
    emitView();
    const ctx: OverlayContext = { map: mapInstance, beforeIdFor };
    installSentinels(mapInstance);
    manager = new LayerManager(ctx, { saved: savedLayers, onChange: onLayersChange });

    const charts = await fetchCharts(serverOrigin(), chartsToken);
    if (destroyed) return;
    for (const chart of charts) {
      await manager.register(createChartOverlay(chart, serverOrigin()));
      if (destroyed) return;
    }

    const notesOverlay = createNotesOverlay(serverOrigin(), chartsToken);
    await manager.register(notesOverlay);
    if (destroyed) return;

    const aisOverlay = createAisOverlay(aisTargets, store);
    await manager.register(aisOverlay);
    if (destroyed) return;

    const collisionOverlay = createCollisionOverlay(collision);
    await manager.register(collisionOverlay);
    if (destroyed) return;

    const overlay = createVesselOverlay(vessel);
    await manager.register(overlay);
    if (destroyed) return;

    const view = new LayersView(manager);
    view.refresh();
    onReady?.(view);

    const recolor = (theme: Theme) => {
      const paint = mapThemePaint(theme);
      // Recolor the base map (background, water, landcover, roads, boundaries, labels).
      // Each overlay, including the chart, recolors its own layers via applyTheme below.
      applyBaseTheme(mapInstance, paint);
      manager?.applyTheme(paint);
    };
    onMapReady?.(recolor);

    const tick = () => {
      notesOverlay.sync(ctx);
      aisOverlay.sync(ctx);
      collisionOverlay.sync(ctx);
      overlay.sync(ctx);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
});

onDestroy(() => {
  destroyed = true;
  if (frame) cancelAnimationFrame(frame);
  map?.remove();
});
</script>

<div class="chart-canvas" bind:this={container}></div>

<style>
.chart-canvas {
  inline-size: 100%;
  block-size: 100%;
}
</style>
