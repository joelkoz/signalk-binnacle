<script lang="ts">
import maplibregl from 'maplibre-gl';
import { onDestroy, onMount } from 'svelte';
import type { OwnVessel } from '$entities/vessel';
import { fetchCharts } from '$features/charts';
import { LayersView } from '$features/layers-panel';
import { createVesselOverlay } from '$features/vessel-layer';
import {
  baseStyleUrl,
  beforeIdFor,
  createChartOverlay,
  installSentinels,
  LayerManager,
  type OverlayContext,
  registerPmtilesProtocol,
} from '$shared/map';
import { type SignalKStore, serverOrigin } from '$shared/signalk';

interface Props {
  store: SignalKStore;
  vessel: OwnVessel;
  onReady?: (view: LayersView) => void;
}

const { store, vessel, onReady }: Props = $props();

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

    const overlay = createVesselOverlay(vessel);
    await manager.register(overlay);
    if (destroyed) return;

    const view = new LayersView(manager);
    view.refresh();
    onReady?.(view);

    const tick = () => {
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
