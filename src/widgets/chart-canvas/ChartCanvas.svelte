<script lang="ts">
import maplibregl from 'maplibre-gl';
import { onDestroy, onMount } from 'svelte';
import { OwnVessel } from '$entities/vessel';
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
import type { SignalKStore } from '$shared/signalk';

interface Props {
  store: SignalKStore;
  onReady?: (view: LayersView) => void;
}

const { store, onReady }: Props = $props();

let container: HTMLDivElement;
let map: maplibregl.Map | undefined;
let manager: LayerManager | undefined;
let vesselOverlay: ReturnType<typeof createVesselOverlay> | undefined;
let frame = 0;

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

    const serverBase = `${location.protocol}//${location.host}`;
    const charts = await fetchCharts(serverBase);
    for (const chart of charts) {
      await manager.register(createChartOverlay(chart, serverBase));
    }

    const overlay = createVesselOverlay(new OwnVessel(store));
    vesselOverlay = overlay;
    await manager.register(overlay);

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
