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
  baseStyleUrl,
  beforeIdFor,
  createChartOverlay,
  installSentinels,
  LayerManager,
  mapThemePaint,
  type OverlayContext,
  registerPmtilesProtocol,
} from '$shared/map';
import { type SignalKStore, serverOrigin } from '$shared/signalk';
import type { Theme } from '$shared/ui';

interface MapView {
  lat: number;
  lon: number;
  zoom: number;
}

interface Props {
  store: SignalKStore;
  vessel: OwnVessel;
  aisTargets: AisTargets;
  collision: CollisionAssessment;
  chartsToken?: string;
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
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
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
    manager = new LayerManager(ctx);

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
      let style: ReturnType<typeof mapInstance.getStyle>;
      try {
        style = mapInstance.getStyle();
      } catch {
        return;
      }
      // Recolor only the base map here (background and its water). Each overlay,
      // including the chart, recolors its own layers via applyTheme below.
      for (const layer of style.layers ?? []) {
        try {
          if (layer.type === 'background') {
            mapInstance.setPaintProperty(layer.id, 'background-color', paint.background);
          } else if (
            !layer.id.startsWith('chart-') &&
            layer.id.includes('water') &&
            layer.type === 'fill'
          ) {
            mapInstance.setPaintProperty(layer.id, 'fill-color', paint.water);
          }
        } catch {
          // A base style without this layer or property is fine; skip it.
        }
      }
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
