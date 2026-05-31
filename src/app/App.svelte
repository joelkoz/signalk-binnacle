<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { OwnVessel } from '$entities/vessel';
import { LayersPanel, type LayersView } from '$features/layers-panel';
import { createSignalKClient, SignalKStore, SK_PATHS } from '$shared/signalk';
import { ChartCanvas } from '$widgets/chart-canvas';

const store = new SignalKStore();
const vessel = new OwnVessel(store);
const client = createSignalKClient();

let layersView = $state<LayersView | undefined>();

const streamUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/signalk/v1/stream`;

const connectionLabel = $derived(
  store.connection.phase === 'open'
    ? 'Connected'
    : store.connection.phase === 'connecting'
      ? 'Connecting'
      : store.connection.phase === 'reconnecting'
        ? 'Reconnecting'
        : 'Not connected',
);

const fmt = (value: number | undefined, digits: number) =>
  value === undefined ? '--' : value.toFixed(digits);

onMount(async () => {
  await client.connect(streamUrl, (frame) => store.applyFrame(frame));
  await client.raw.subscribe([
    { path: SK_PATHS.headingTrue, policy: 'instant', minPeriod: 200 },
    { path: SK_PATHS.position, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.courseOverGroundTrue, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.speedOverGround, policy: 'instant', minPeriod: 1000 },
  ]);
});

onDestroy(() => {
  void client.disconnect();
});
</script>

<main class="binnacle-shell">
  <header class="topbar">Binnacle</header>
  <section class="chart-host" aria-label="Chart">
    <ChartCanvas {store} onReady={(view) => (layersView = view)} />
    {#if layersView}
      <LayersPanel view={layersView} />
    {/if}
  </section>
  <footer class="status-strip">
    <span class="status">{connectionLabel}</span>
    <span class="readout">SOG <b>{fmt(vessel.sogKnots, 1)}</b> kn</span>
    <span class="readout">COG <b>{fmt(vessel.cogDegrees, 0)}</b>&deg;</span>
  </footer>
</main>

<style>
.binnacle-shell {
  display: grid;
  grid-template-rows: auto 1fr auto;
  block-size: 100vh;
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #06090d;
  color: #e7edf3;
}
.topbar {
  padding: 0.75rem 1rem;
  font-weight: 600;
  border-block-end: 1px solid #243140;
}
.chart-host {
  position: relative;
}
.status-strip {
  display: flex;
  gap: 1.5rem;
  padding: 0.5rem 1rem;
  border-block-start: 1px solid #243140;
  color: #6f8aa3;
}
.readout b {
  color: #e7edf3;
  font-variant-numeric: tabular-nums;
}
</style>
