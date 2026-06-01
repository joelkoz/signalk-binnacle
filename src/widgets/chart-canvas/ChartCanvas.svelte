<script lang="ts">
import maplibregl from 'maplibre-gl';
import { onDestroy, onMount } from 'svelte';
import { AisTargets } from '$entities/ais';
import type { OwnVessel } from '$entities/vessel';
import { createAisOverlay } from '$features/ais-layer';
import { fetchCharts } from '$features/charts';
import { LayersView } from '$features/layers-panel';
import { createVesselOverlay } from '$features/vessel-layer';
import {
  baseStyle,
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

interface Props {
  store: SignalKStore;
  vessel: OwnVessel;
  onReady?: (view: LayersView) => void;
  onMapReady?: (recolor: (theme: string) => void) => void;
}

const { store, vessel, onReady, onMapReady }: Props = $props();

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
      style: baseStyle(),
      center: [0, 30],
      zoom: 2,
      attributionControl: { compact: true },
    });
  } catch (error) {
    console.error('Map failed to initialize', error);
    return;
  }

  const mapInstance = map;
  mapInstance.on('load', async () => {
    const ctx: OverlayContext = { map: mapInstance, beforeIdFor };
    installSentinels(mapInstance);
    manager = new LayerManager(ctx);

    const charts = await fetchCharts(serverOrigin());
    if (destroyed) return;
    for (const chart of charts) {
      await manager.register(createChartOverlay(chart, serverOrigin()));
      if (destroyed) return;
    }

    const aisOverlay = createAisOverlay(new AisTargets(store), store);
    await manager.register(aisOverlay);
    if (destroyed) return;

    const overlay = createVesselOverlay(vessel);
    await manager.register(overlay);
    if (destroyed) return;

    const view = new LayersView(manager);
    view.refresh();
    onReady?.(view);

    const recolor = (theme: string) => {
      const paint = mapThemePaint(theme as Theme);
      let style: ReturnType<typeof mapInstance.getStyle>;
      try {
        style = mapInstance.getStyle();
      } catch {
        return;
      }
      for (const layer of style.layers ?? []) {
        try {
          if (layer.type === 'background') {
            mapInstance.setPaintProperty(layer.id, 'background-color', paint.background);
          } else if (layer.id.includes('water') && layer.type === 'fill') {
            mapInstance.setPaintProperty(layer.id, 'fill-color', paint.water);
          }
        } catch {
          // A base style without this layer or property is fine; skip it.
        }
      }
      overlay.applyTheme?.(ctx, paint);
      aisOverlay.applyTheme?.(ctx, paint);
    };
    onMapReady?.(recolor);

    const tick = () => {
      aisOverlay.sync(ctx);
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
